import { DRIVETRAIN_ARCHETYPES } from './archetypes';
import {
  calculateAckermannSteerAngles,
  calculateDynamicWheelCamber,
  radToDeg,
} from './kinematics';
import { LoadTransferSolution, phaseAccelerations, solveLoadTransfer } from './loadTransfer';
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

  const acceleration = phaseAccelerations(driver, phase);
  const netAxG = acceleration.longitudinalG;
  const effectiveAyG = acceleration.lateralG;
  // Geometric reference steer, not a solved driver steering/slip equilibrium.
  const speedMs = driver.speedKmh / 3.6;
  const nominalSteerAngleDeg = speedMs > 0
    ? radToDeg(Math.atan((setup.wheelbaseMm / 1000) * GRAVITY * effectiveAyG / (speedMs * speedMs)))
    : 0;
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

  // Differential force allocation is an illustrative lock interpolation.
  // Compute it before lateral demand so requested forces obey yaw balance.
  const wheelFxDemandN = (id: WheelId): number => {
    const isFront = id === 'FL' || id === 'FR';
    const axleLoad = isFront
      ? loadSol.wheelDynamicFzN.FL + loadSol.wheelDynamicFzN.FR
      : loadSol.wheelDynamicFzN.RL + loadSol.wheelDynamicFzN.RR;
    const loadShare = axleLoad > 0 ? loadSol.wheelDynamicFzN[id] / axleLoad : 0.5;
    const axleFx = isFront ? frontAxleFxN : rearAxleFxN;
    const lockFraction = Math.max(0, Math.min(1,
      (axleFx < 0 ? setup.lsdDecelLockPct * 0.4 : setup.lsdAccelLockPct) / 100));
    return axleFx * (0.5 * (1 - lockFraction) + loadShare * lockFraction);
  };
  const longitudinalDemands = {
    FL: wheelFxDemandN('FL'), FR: wheelFxDemandN('FR'),
    RL: wheelFxDemandN('RL'), RR: wheelFxDemandN('RR'),
  };
  const totalLateralDemandN = setup.massKg * GRAVITY * effectiveAyG;
  // +y is right; yaw and lateral force share that sign.
  const turnSign = isLeftTurn ? -1 : 1;
  const longitudinalYawMomentNmm = setup.frontTrackMm / 2 *
    (longitudinalDemands.FL - longitudinalDemands.FR) + setup.rearTrackMm / 2 *
    (longitudinalDemands.RL - longitudinalDemands.RR);
  const frontLateralDemandN = totalLateralDemandN * setup.frontWeightFraction -
    longitudinalYawMomentNmm / (turnSign * setup.wheelbaseMm);
  const rearLateralDemandN = totalLateralDemandN - frontLateralDemandN;

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
    const dynamicFzN = loadSol.wheelDynamicFzN[id];
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

    // 1. Illustrative width/load-sensitivity profile, not measured tyre data.
    // Width scaling is not a universal contact-patch area law or load rating.
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
    const longitudinalFxN = longitudinalDemands[id];

    // 6. No lateral reserve when requested Fx exceeds the simple circle.
    const maxLateralFyAvailableN = Math.sqrt(Math.max(0,
      maxTotalForceN * maxTotalForceN - longitudinalFxN * longitudinalFxN));

    const axleFyDemand = isFront ? frontLateralDemandN : rearLateralDemandN;
    const lateralFyDemandN = axleFyDemand * wheelLoadShare;

    const totalCombinedDemandN = Math.sqrt(
      longitudinalFxN * longitudinalFxN + lateralFyDemandN * lateralFyDemandN
    );
    // Undefined at zero capacity: finite placeholder only; Fz=0 is shown as
    // Unloaded by the UI, never interpreted as zero utilization or spare grip.
    const gripUtilizationPct = maxTotalForceN > 0
      ? (totalCombinedDemandN / maxTotalForceN) * 100 : 0;

    // 7. Tire Slip Angle alpha (deg)
    // Illustrative sub-limit curve only. Outside capacity there is no solved
    // steady slip angle: keep its endpoint finite and issue a force warning.
    const lateralUtilization = Math.max(-1, Math.min(1,
      maxLateralFyAvailableN > 0 ? lateralFyDemandN / maxLateralFyAvailableN
        : Math.sign(lateralFyDemandN)));
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

  const frontAxleUtilization = Math.max(-1, Math.min(1,
    frontAxleAvailFyN > 0 ? frontLateralDemandN / frontAxleAvailFyN : Math.sign(frontLateralDemandN)));
  const rearAxleUtilization = Math.max(-1, Math.min(1,
    rearAxleAvailFyN > 0 ? rearLateralDemandN / rearAxleAvailFyN : Math.sign(rearLateralDemandN)));

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

  const requestedAcceleration = phaseAccelerations(driver, driver.cornerPhase);
  if (driver.speedKmh === 0 && Math.abs(requestedAcceleration.lateralG) > 0) {
    warnings.push({
      id: 'stationary_force_request', severity: 'warning', title: 'Zero Speed with Requested Cornering',
      explanation: 'These are prescribed force-only setup loads at zero aero speed, not a realizable stationary corner. Set the lateral-G request to zero for a stationary vehicle, or choose a positive corner speed.',
    });
  }

  if (loadSol.isFrontOverLowered || loadSol.isRearOverLowered) {
    warnings.push({
      id: 'over_lowered_rc',
      severity: 'warning',
      title: 'Illustrative Geometry Profile Outside Nominal Range',
      explanation: `The generic profile predicts roll centres of ${Math.round(
        loadSol.effectiveFrontRollCenterMm
      )} mm front / ${Math.round(loadSol.effectiveRearRollCenterMm)} mm rear at this ride height. This is an assumed archetype curve, not a measured control-arm threshold. Verify the vehicle geometry before making a ride-height decision.`,
    });
  }

  if (loadSol.wheelLiftRequested) {
    warnings.push({
      id: 'wheel_lift', severity: 'critical', title: 'Wheel Unloading — Outside Four-Contact Model',
      explanation: 'The requested acceleration would unload a wheel or axle. Zero-contact wheels have zero tyre capacity. Display loads preserve total vertical force, but this is not a solved three-contact or rollover state; reduce requested acceleration to return to the model range.',
    });
  }
  if (!loadSol.rollEquilibriumValid) {
    warnings.push({
      id: 'roll_equilibrium', severity: 'critical', title: 'Roll Equilibrium Outside Model Range',
      explanation: 'A stable small-angle roll solution did not converge within the model range. The displayed attitude is an intermediate estimate, not an equilibrium prediction.',
    });
  }

  const saturatedWheels = (Object.values(activeEval.wheels) as WheelTelemetry[]).filter(
    (w) => Math.hypot(w.longitudinalFxN, w.lateralFyDemandN) > w.maxTotalForceN + 1e-6
  );
  if (saturatedWheels.length > 0) {
    const names = saturatedWheels.map((w) => w.id).join(', ');
    warnings.push({
      id: 'tire_saturation',
      severity: 'critical',
      title: `Requested Tyre Force Exceeds Capacity (${names})`,
      explanation: `Requested combined force lies outside the assumed friction envelope on ${names}. The requested acceleration is not achievable in this model; slip values are illustrative curve endpoints, not solved steady angles. Reduce the requested inputs or compare an evidenced vehicle/tyre setup.`,
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
