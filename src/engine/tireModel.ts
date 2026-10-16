import { DRIVETRAIN_ARCHETYPES } from './archetypes';
import {
  calculateAckermannSteerAngles,
  calculateDynamicWheelCamber,
} from './kinematics';
import { LoadTransferSolution, solveLoadTransfer } from './loadTransfer';
import {
  CornerPhase,
  DriverInputState,
  EngineeringWarning,
  PhaseBalanceSummary,
  SimulationResult,
  VehicleSetup,
  WheelId,
  WheelTelemetry,
} from './types';

const GRAVITY = 9.81;

export function evaluatePhaseMechanics(
  setup: VehicleSetup,
  driver: DriverInputState,
  phase: CornerPhase
): {
  loadSol: LoadTransferSolution;
  wheels: Record<WheelId, WheelTelemetry>;
  frontAxleSlipAngleDeg: number;
  rearAxleSlipAngleDeg: number;
  understeerGradientDegPerG: number;
  phaseBalanceScore: number;
} {
  const loadSol = solveLoadTransfer(setup, driver, phase);
  const isLeftTurn = driver.turnDirection === 'left';

  let netAxG = 0;
  let effectiveAyG = driver.lateralG;
  if (phase === 'entry') {
    const trailFactor = 0.45 + 0.55 * (driver.trailBrakeOverlapPct / 100);
    netAxG = -driver.brakingG * trailFactor;
    effectiveAyG = driver.lateralG * 0.88;
  } else if (phase === 'mid') {
    netAxG = 0;
    effectiveAyG = driver.lateralG;
  } else {
    netAxG = driver.throttleG;
    effectiveAyG = driver.lateralG * 0.90;
  }

  const nominalSteerAngleDeg =
    1.8 + effectiveAyG * 2.4 + (90 / Math.max(50, driver.speedKmh)) * 1.8;
  const ackermann = calculateAckermannSteerAngles({
    nominalSteerAngleDeg,
    trackWidthMm: setup.frontTrackMm,
    wheelbaseMm: setup.wheelbaseMm,
    ackermannPct: setup.ackermannPct,
    frontStaticToeDeg: setup.frontStaticToeDeg,
  });

  const totalLongitudinalForceN = setup.massKg * GRAVITY * netAxG;
  const frontBrakeFraction = setup.brakeBiasFrontPct / 100;
  const frontDriveFraction = setup.frontTorqueSplitPct / 100;

  const frontAxleFxN =
    totalLongitudinalForceN < 0
      ? totalLongitudinalForceN * frontBrakeFraction
      : totalLongitudinalForceN * frontDriveFraction;
  const rearAxleFxN =
    totalLongitudinalForceN < 0
      ? totalLongitudinalForceN * (1 - frontBrakeFraction)
      : totalLongitudinalForceN * (1 - frontDriveFraction);

  const frontLateralDemandN =
    (loadSol.frontStaticAxleFzN + loadSol.frontAeroDownforceN) * effectiveAyG;
  const rearLateralDemandN =
    (loadSol.rearStaticAxleFzN + loadSol.rearAeroDownforceN) * effectiveAyG;

  const archPreset = DRIVETRAIN_ARCHETYPES[setup.drivetrain];
  const oemFrontWidth = archPreset?.oemFrontTireWidthMm ?? 245;
  const oemRearWidth = archPreset?.oemRearTireWidthMm ?? 275;

  const buildWheelTelemetry = (id: WheelId): WheelTelemetry => {
    const isFront = id === 'FL' || id === 'FR';
    const isRightSide = id === 'FR' || id === 'RR';
    const isOutside = isLeftTurn ? isRightSide : !isRightSide;

    const tireWidthMm = isFront ? setup.frontTireWidthMm : setup.rearTireWidthMm;
    const oemRefWidthMm = isFront ? oemFrontWidth : oemRearWidth;

    const staticFzN = loadSol.wheelStaticFzN[id];
    const dynamicFzN = Math.max(50, loadSol.wheelDynamicFzN[id]);
    const deflectionMm = loadSol.wheelDeflectionMm[id];

    const steerAngleDeg = isFront
      ? isOutside
        ? ackermann.outsideSteerDeg
        : ackermann.insideSteerDeg
      : 0;

    const staticCamberDeg = isFront ? setup.frontStaticCamberDeg : setup.rearStaticCamberDeg;
    const geometry = isFront ? setup.frontGeometry : setup.rearGeometry;
    const rideHeightDeltaMm = isFront
      ? setup.frontRideHeightDeltaMm
      : setup.rearRideHeightDeltaMm;

    const camberResult = calculateDynamicWheelCamber({
      staticCamberDeg,
      geometry,
      rideHeightDeltaMm,
      wheelBumpDeflectionMm: deflectionMm,
      bodyRollDeg: loadSol.bodyRollDeg,
      isOutsideWheel: isOutside,
      isFrontWheel: isFront,
      steerAngleDeg,
      casterDeg: isFront ? setup.frontCasterDeg : 0,
      kpiDeg: isFront ? setup.frontKpiDeg : 0,
    });

    // 1. Tire Section Width & Load Sensitivity [Point 4: e.g. Porsche 944 Square Tire Upgrade]:
    // Increasing tire section width W_tire enlarges contact patch area and increases the tire's
    // effective nominal vertical load capacity F_z,nom, reducing contact stress (F_z / F_z,nom)
    // and increasing cornering stiffness C_alpha and peak lateral force!
    const widthCapacityScale = Math.pow(
      Math.max(165, tireWidthMm) / Math.max(165, oemRefWidthMm),
      1.35
    );
    const effectiveNominalFzN = Math.max(500, staticFzN * widthCapacityScale);

    const loadRatio = Math.max(0.12, dynamicFzN / effectiveNominalFzN);
    const excessLoadDelta = loadRatio - 1.0;
    const baseLoadSensitiveMu =
      setup.peakFrictionCoefficient *
      Math.pow(loadRatio, -setup.tireLoadSensitivityExponent) *
      Math.max(0.62, 1 - 0.14 * excessLoadDelta * excessLoadDelta);

    // 2. Dynamic Camber Efficiency (C_gamma)
    const optimalDynamicCamber = isOutside ? -2.2 : -0.5;
    const camberErrorDeg = camberResult.dynamicCamberDeg - optimalDynamicCamber;
    const camberWeight = isOutside ? 0.025 : 0.006;
    const camberEfficiency = Math.max(
      0.78,
      1.0 - camberWeight * camberErrorDeg * camberErrorDeg
    );

    // 3. Tire Pressure Efficiency
    const tirePsi = isFront ? setup.frontTirePressurePsi : setup.rearTirePressurePsi;
    const psiError = tirePsi - setup.optimalTirePressurePsi;
    const pressureEfficiency = Math.max(0.84, 1.0 - 0.0065 * psiError * psiError);

    // 4. High-Speed Damper & Anti-Geometry Surface Compliance
    const surfaceCompliance = isFront
      ? loadSol.dampers.frontBumpComplianceFactor
      : loadSol.dampers.rearBumpComplianceFactor;

    const effectiveFrictionMu =
      baseLoadSensitiveMu * camberEfficiency * pressureEfficiency * surfaceCompliance;

    const maxTotalForceN = dynamicFzN * effectiveFrictionMu;

    // 5. Partition Axle Longitudinal Force F_x
    const axleFz = isFront
      ? loadSol.wheelDynamicFzN.FL + loadSol.wheelDynamicFzN.FR
      : loadSol.wheelDynamicFzN.RL + loadSol.wheelDynamicFzN.RR;
    const wheelLoadShare = axleFz > 0 ? dynamicFzN / axleFz : 0.5;
    const axleFx = isFront ? frontAxleFxN : rearAxleFxN;

    let fxShare = wheelLoadShare;
    if (axleFx < 0) {
      const decelLock = setup.lsdDecelLockPct / 100;
      fxShare = 0.5 * (1 - decelLock * 0.4) + wheelLoadShare * (decelLock * 0.4);
    } else if (axleFx > 0) {
      const accelLock = setup.lsdAccelLockPct / 100;
      fxShare = 0.5 * (1 - accelLock) + wheelLoadShare * accelLock;
    }

    const longitudinalFxN = axleFx * fxShare;

    // 6. Combined Slip Friction Ellipse
    const fxRatio = Math.min(0.98, Math.abs(longitudinalFxN) / Math.max(1, maxTotalForceN));
    const maxLateralFyAvailableN =
      maxTotalForceN * Math.sqrt(Math.max(0.04, 1 - fxRatio * fxRatio));

    const axleFyDemand = isFront ? frontLateralDemandN : rearLateralDemandN;
    const lateralFyDemandN = axleFyDemand * wheelLoadShare;

    const totalCombinedDemandN = Math.sqrt(
      longitudinalFxN * longitudinalFxN + lateralFyDemandN * lateralFyDemandN
    );
    const gripUtilizationPct = Math.min(
      150,
      (totalCombinedDemandN / Math.max(1, maxTotalForceN)) * 100
    );

    // 7. Tire Slip Angle alpha (deg)
    const lateralUtilization = lateralFyDemandN / Math.max(1, maxLateralFyAvailableN);
    const pressureStiffnessMod = 1 - Math.max(-0.08, Math.min(0.06, psiError * 0.012));
    const widthStiffnessMod = Math.pow(oemRefWidthMm / Math.max(165, tireWidthMm), 0.35);
    const slipAngleDeg =
      (3.2 * lateralUtilization + 3.4 * Math.pow(lateralUtilization, 3)) *
      pressureStiffnessMod *
      widthStiffnessMod;

    return {
      id,
      isOutside,
      isFront,
      tireWidthMm,
      staticFzN,
      dynamicFzN,
      longitudinalFxN,
      lateralFyDemandN,
      maxLateralFyAvailableN,
      maxTotalForceN,
      gripUtilizationPct,
      dynamicCamberDeg: camberResult.dynamicCamberDeg,
      camberGainFromBumpDeg: camberResult.camberGainFromBumpDeg,
      camberGainFromSteerDeg: camberResult.camberGainFromSteerDeg,
      steerAngleDeg,
      staticToeAngleDeg: isFront ? setup.frontStaticToeDeg : setup.rearStaticToeDeg,
      slipAngleDeg,
      suspensionDeflectionMm: deflectionMm,
      effectiveFrictionMu,
    };
  };

  const wheels: Record<WheelId, WheelTelemetry> = {
    FL: buildWheelTelemetry('FL'),
    FR: buildWheelTelemetry('FR'),
    RL: buildWheelTelemetry('RL'),
    RR: buildWheelTelemetry('RR'),
  };

  const frontAxleAvailFyN =
    wheels.FL.maxLateralFyAvailableN + wheels.FR.maxLateralFyAvailableN;
  const rearAxleAvailFyN =
    wheels.RL.maxLateralFyAvailableN + wheels.RR.maxLateralFyAvailableN;

  const frontAxleUtilization = frontLateralDemandN / Math.max(1, frontAxleAvailFyN);
  const rearAxleUtilization = rearLateralDemandN / Math.max(1, rearAxleAvailFyN);

  const frontPsiErr = setup.frontTirePressurePsi - setup.optimalTirePressurePsi;
  const rearPsiErr = setup.rearTirePressurePsi - setup.optimalTirePressurePsi;
  const frontPsiMod = 1 - Math.max(-0.08, Math.min(0.06, frontPsiErr * 0.012));
  const rearPsiMod = 1 - Math.max(-0.08, Math.min(0.06, rearPsiErr * 0.012));

  const frontWidthMod = Math.pow(oemFrontWidth / Math.max(165, setup.frontTireWidthMm), 0.45);
  const rearWidthMod = Math.pow(oemRearWidth / Math.max(165, setup.rearTireWidthMm), 0.45);

  const tlltdBias =
    loadSol.totalLateralLoadTransferDistributionFront - setup.frontWeightFraction;

  let frontAxleSlipAngleDeg =
    (3.2 * frontAxleUtilization + 3.6 * Math.pow(frontAxleUtilization, 3)) *
      frontPsiMod *
      frontWidthMod +
    tlltdBias * 3.8 * effectiveAyG;

  let rearAxleSlipAngleDeg =
    (3.2 * rearAxleUtilization + 3.6 * Math.pow(rearAxleUtilization, 3)) *
      rearPsiMod *
      rearWidthMod -
    tlltdBias * 3.8 * effectiveAyG;

  // Toe & LSD Yaw Modifiers
  const frontToeMultiplier = phase === 'entry' ? 1.45 : 0.75;
  frontAxleSlipAngleDeg += setup.frontStaticToeDeg * frontToeMultiplier;
  rearAxleSlipAngleDeg -= setup.rearStaticToeDeg * 1.25;

  if (phase === 'entry' || driver.speedKmh < 100) {
    const ackDeviation = (setup.ackermannPct - 65) / 100;
    frontAxleSlipAngleDeg -= ackDeviation * 0.25;
  }

  if (phase === 'entry' && netAxG < 0) {
    const decelStability = ((setup.lsdDecelLockPct - 40) / 100) * 0.55;
    rearAxleSlipAngleDeg -= decelStability;
  } else if (phase === 'exit' && netAxG > 0) {
    const accelLockDelta = (setup.lsdAccelLockPct - 40) / 100;
    if (setup.drivetrain === 'FF') {
      frontAxleSlipAngleDeg -= accelLockDelta * 0.65;
    } else {
      rearAxleSlipAngleDeg += accelLockDelta * driver.throttleG * 0.85;
    }
  }

  const slipDeltaDeg = frontAxleSlipAngleDeg - rearAxleSlipAngleDeg;
  const understeerGradientDegPerG = slipDeltaDeg / Math.max(0.3, effectiveAyG);

  const rawScore = slipDeltaDeg * 24;
  const phaseBalanceScore = Math.max(-100, Math.min(100, Number(rawScore.toFixed(1))));

  return {
    loadSol,
    wheels,
    frontAxleSlipAngleDeg: Number(frontAxleSlipAngleDeg.toFixed(2)),
    rearAxleSlipAngleDeg: Number(rearAxleSlipAngleDeg.toFixed(2)),
    understeerGradientDegPerG: Number(understeerGradientDegPerG.toFixed(2)),
    phaseBalanceScore,
  };
}

export function classifyBalanceScore(
  score: number
): PhaseBalanceSummary['activeClassification'] {
  if (score <= -38) return 'Severe Oversteer';
  if (score <= -18) return 'Moderate Oversteer';
  if (score <= -6) return 'Slight Oversteer';
  if (score < 6) return 'Neutral / Balanced';
  if (score < 18) return 'Slight Understeer';
  if (score < 38) return 'Moderate Understeer';
  return 'Severe Understeer';
}

export function simulateVehicleState(
  setup: VehicleSetup,
  driver: DriverInputState
): SimulationResult {
  const entryEval = evaluatePhaseMechanics(setup, driver, 'entry');
  const midEval = evaluatePhaseMechanics(setup, driver, 'mid');
  const exitEval = evaluatePhaseMechanics(setup, driver, 'exit');

  const activeEval =
    driver.cornerPhase === 'entry'
      ? entryEval
      : driver.cornerPhase === 'mid'
      ? midEval
      : exitEval;

  const balance: PhaseBalanceSummary = {
    entryScore: entryEval.phaseBalanceScore,
    midScore: midEval.phaseBalanceScore,
    exitScore: exitEval.phaseBalanceScore,
    activeScore: activeEval.phaseBalanceScore,
    activeClassification: classifyBalanceScore(activeEval.phaseBalanceScore),
  };

  const { loadSol } = activeEval;

  const warnings: EngineeringWarning[] = [];

  if (loadSol.isFrontOverLowered || loadSol.isRearOverLowered) {
    warnings.push({
      id: 'over_lowered_rc',
      severity: 'warning',
      title: 'Over-Lowering Geometry Trap Active',
      explanation: `Ride height is dropped beyond the control-arm horizontal threshold. The dynamic roll center (${Math.round(
        loadSol.effectiveFrontRollCenterMm
      )}mm F / ${Math.round(
        loadSol.effectiveRearRollCenterMm
      )}mm R) migrated downward faster than the CG, increasing the roll moment arm (${Math.round(
        loadSol.rollMomentArmMm
      )}mm) and degrading negative camber recovery in bump. Consider raising ride height or installing extended roll-center correction ball joints.`,
    });
  }

  if (setup.frontAntiDivePct > 45 || setup.rearAntiSquatPct > 45) {
    warnings.push({
      id: 'excessive_anti_geometry',
      severity: 'warning',
      title: 'Excessive Longitudinal Anti-Geometry (>45%)',
      explanation:
        'High anti-dive or anti-squat routes braking/traction forces through rigid suspension links rather than springs. While pitch angle is reduced, vertical compliance over bumps drops and wheel-hop risk increases.',
    });
  }

  const saturatedWheels = (Object.values(activeEval.wheels) as WheelTelemetry[]).filter(
    (w) => w.gripUtilizationPct >= 100
  );
  if (saturatedWheels.length > 0) {
    const names = saturatedWheels.map((w) => w.id).join(', ');
    warnings.push({
      id: 'tire_saturation',
      severity: 'critical',
      title: `Tire Friction Circle Saturated (${names})`,
      explanation: `Combined longitudinal and lateral demand exceeds 100% of available contact patch grip on ${names}. Reduce lateral/longitudinal input, widen the saturated axle's tires, or shift load transfer away from the saturated axle.`,
    });
  }

  if (
    Math.abs(loadSol.frontJackingForceN) > 1200 ||
    Math.abs(loadSol.rearJackingForceN) > 1400
  ) {
    warnings.push({
      id: 'jacking_force',
      severity: 'info',
      title: 'High Kinematic Jacking Forces',
      explanation:
        'Elevated roll center height creates steep virtual swing-arm angles, directing lateral tire forces vertically into the chassis and lifting the sprung mass mid-corner.',
    });
  }

  const frontTireWidthShare =
    setup.frontTireWidthMm /
    Math.max(1, setup.frontTireWidthMm + setup.rearTireWidthMm);

  return {
    setup,
    driver,
    wheels: activeEval.wheels,
    kinematics: {
      frontWheelRateNmm: Number(loadSol.frontWheelRateNmm.toFixed(1)),
      rearWheelRateNmm: Number(loadSol.rearWheelRateNmm.toFixed(1)),
      frontRideRateNmm: Number(loadSol.frontRideRateNmm.toFixed(1)),
      rearRideRateNmm: Number(loadSol.rearRideRateNmm.toFixed(1)),
      frontNaturalFreqHz: Number(loadSol.frontNaturalFreqHz.toFixed(2)),
      rearNaturalFreqHz: Number(loadSol.rearNaturalFreqHz.toFixed(2)),
      frontSpringRollStiffnessNmRad: Math.round(loadSol.frontSpringRollStiffnessNmRad),
      rearSpringRollStiffnessNmRad: Math.round(loadSol.rearSpringRollStiffnessNmRad),
      frontArbRollStiffnessNmRad: Math.round(loadSol.frontArbRollStiffnessNmRad),
      rearArbRollStiffnessNmRad: Math.round(loadSol.rearArbRollStiffnessNmRad),
      totalFrontRollStiffnessNmRad: Math.round(loadSol.totalFrontRollStiffnessNmRad),
      totalRearRollStiffnessNmRad: Math.round(loadSol.totalRearRollStiffnessNmRad),
      frontRollStiffnessRatio: Number(loadSol.frontRollStiffnessRatio.toFixed(3)),
      totalLateralLoadTransferDistributionFront: Number(
        loadSol.totalLateralLoadTransferDistributionFront.toFixed(3)
      ),
      staticFrontRollCenterMm: Number(loadSol.staticFrontRollCenterMm.toFixed(1)),
      staticRearRollCenterMm: Number(loadSol.staticRearRollCenterMm.toFixed(1)),
      effectiveFrontRollCenterMm: Number(loadSol.effectiveFrontRollCenterMm.toFixed(1)),
      effectiveRearRollCenterMm: Number(loadSol.effectiveRearRollCenterMm.toFixed(1)),
      rollAxisAtCgMm: Number(loadSol.rollAxisAtCgMm.toFixed(1)),
      rollMomentArmMm: Number(loadSol.rollMomentArmMm.toFixed(1)),
      frontJackingForceN: Math.round(loadSol.frontJackingForceN),
      rearJackingForceN: Math.round(loadSol.rearJackingForceN),
      frontTireWidthShare: Number(frontTireWidthShare.toFixed(3)),
      bodyRollDeg: Number(loadSol.bodyRollDeg.toFixed(2)),
      bodyPitchDeg: Number(loadSol.bodyPitchDeg.toFixed(2)),
      longitudinalLoadTransferN: Math.round(loadSol.longitudinalLoadTransferN),
      frontLateralLoadTransferN: Math.round(loadSol.frontLateralLoadTransferN),
      rearLateralLoadTransferN: Math.round(loadSol.rearLateralLoadTransferN),
      diagonalLoadTransferN: Math.round(loadSol.diagonalLoadTransferN),
      totalAeroDownforceN: Math.round(loadSol.totalAeroDownforceN),
      frontLsBumpZeta: loadSol.dampers.frontLsBumpZeta,
      frontLsReboundZeta: loadSol.dampers.frontLsReboundZeta,
      rearLsBumpZeta: loadSol.dampers.rearLsBumpZeta,
      rearLsReboundZeta: loadSol.dampers.rearLsReboundZeta,
      frontAxleSlipAngleDeg: activeEval.frontAxleSlipAngleDeg,
      rearAxleSlipAngleDeg: activeEval.rearAxleSlipAngleDeg,
      understeerGradientDegPerG: activeEval.understeerGradientDegPerG,
    },
    balance,
    warnings,
  };
}
