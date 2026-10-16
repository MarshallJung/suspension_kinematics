import {
  calculateAxleRollStiffness,
  calculateFrontRollStiffnessRatio,
  calculateNaturalFrequencyHz,
  calculateRideRateNmm,
  calculateRollCenterKinematics,
  calculateWheelRateNmm,
  radToDeg,
} from './kinematics';
import { DamperAnalysis, evaluateTransientDampers } from './transientDampers';
import { CornerPhase, DriverInputState, VehicleSetup, WheelId } from './types';

const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;

export interface LoadTransferSolution {
  // Elastic & Ride Rates
  frontWheelRateNmm: number;
  rearWheelRateNmm: number;
  frontRideRateNmm: number;
  rearRideRateNmm: number;
  frontNaturalFreqHz: number;
  rearNaturalFreqHz: number;

  // Roll Stiffness
  frontSpringRollStiffnessNmRad: number;
  rearSpringRollStiffnessNmRad: number;
  frontArbRollStiffnessNmRad: number;
  rearArbRollStiffnessNmRad: number;
  totalFrontRollStiffnessNmRad: number;
  totalRearRollStiffnessNmRad: number;
  frontRollStiffnessRatio: number; // FRSR
  totalLateralLoadTransferDistributionFront: number; // TLLTD_f

  // Roll Center & Dynamic Migration
  staticFrontRollCenterMm: number;
  staticRearRollCenterMm: number;
  effectiveFrontRollCenterMm: number;
  effectiveRearRollCenterMm: number;
  rollAxisAtCgMm: number;
  rollMomentArmMm: number;
  frontJackingForceN: number;
  rearJackingForceN: number;
  isFrontOverLowered: boolean;
  isRearOverLowered: boolean;

  // Attitude
  bodyRollDeg: number;
  bodyPitchDeg: number;

  // Forces & Transfers
  totalStaticWeightN: number;
  frontStaticAxleFzN: number;
  rearStaticAxleFzN: number;
  totalAeroDownforceN: number;
  frontAeroDownforceN: number;
  rearAeroDownforceN: number;
  longitudinalLoadTransferN: number;
  frontLateralLoadTransferN: number;
  rearLateralLoadTransferN: number;
  diagonalLoadTransferN: number;

  // 4-Corner Static & Dynamic Vertical Loads F_z (N) and Deflections (mm)
  wheelStaticFzN: Record<WheelId, number>;
  wheelDynamicFzN: Record<WheelId, number>;
  wheelDeflectionMm: Record<WheelId, number>;

  // Damper analysis
  dampers: DamperAnalysis;
}

export function solveLoadTransfer(
  setup: VehicleSetup,
  driver: DriverInputState,
  phaseOverride?: CornerPhase
): LoadTransferSolution {
  const phase = phaseOverride ?? driver.cornerPhase;

  // 1. Wheel Rates, Ride Rates (accounting for tire pressure + tire width), and Natural Frequencies
  const frontWheelRateNmm = calculateWheelRateNmm(
    setup.frontSpringRateNmm,
    setup.frontMotionRatio,
    setup.frontSpringInclinationDeg
  );
  const rearWheelRateNmm = calculateWheelRateNmm(
    setup.rearSpringRateNmm,
    setup.rearMotionRatio,
    setup.rearSpringInclinationDeg
  );

  const frontRideRateNmm = calculateRideRateNmm(
    frontWheelRateNmm,
    setup.frontTirePressurePsi,
    setup.frontTireWidthMm
  );
  const rearRideRateNmm = calculateRideRateNmm(
    rearWheelRateNmm,
    setup.rearTirePressurePsi,
    setup.rearTireWidthMm
  );

  const frontCornerMassKg = 0.5 * setup.massKg * setup.frontWeightFraction * 0.88;
  const rearCornerMassKg = 0.5 * setup.massKg * (1 - setup.frontWeightFraction) * 0.88;

  const frontNaturalFreqHz = calculateNaturalFrequencyHz(frontRideRateNmm, frontCornerMassKg);
  const rearNaturalFreqHz = calculateNaturalFrequencyHz(rearRideRateNmm, rearCornerMassKg);

  // 2. Axle Roll Stiffnesses & Front Roll Stiffness Ratio (FRSR)
  const frontRoll = calculateAxleRollStiffness(
    frontRideRateNmm,
    setup.frontTrackMm,
    setup.frontArbStiffnessNmPerDeg
  );
  const rearRoll = calculateAxleRollStiffness(
    rearRideRateNmm,
    setup.rearTrackMm,
    setup.rearArbStiffnessNmPerDeg
  );

  const frontRollStiffnessRatio = calculateFrontRollStiffnessRatio(
    frontRoll.totalAxleRollStiffnessNmRad,
    rearRoll.totalAxleRollStiffnessNmRad
  );

  // 3. Initial Static Roll Centers
  const staticRc = calculateRollCenterKinematics(setup, 0, 0, 0);

  // 4. Transient Damper Modifiers
  const dampers = evaluateTransientDampers(
    setup,
    driver,
    frontWheelRateNmm,
    rearWheelRateNmm,
    phase
  );

  // 5. Phase-Specific Longitudinal (a_x) and Lateral (a_y) Accelerations
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

  // 6. Static Weight & Aerodynamic Downforce
  const totalStaticWeightN = setup.massKg * GRAVITY;
  const frontStaticAxleFzN = totalStaticWeightN * setup.frontWeightFraction;
  const rearStaticAxleFzN = totalStaticWeightN * (1 - setup.frontWeightFraction);

  const speedMs = driver.speedKmh / 3.6;
  const totalAeroDownforceN = 0.5 * AIR_DENSITY * setup.aeroClA * speedMs * speedMs;
  const frontAeroDownforceN = totalAeroDownforceN * (setup.aeroFrontBalancePct / 100);
  const rearAeroDownforceN = totalAeroDownforceN * (1 - setup.aeroFrontBalancePct / 100);

  // 7. Longitudinal Weight Transfer (Delta W_long = W * h_CG * a_x / (g * L))
  const hCgStaticM = staticRc.effectiveCgHeightMm / 1000;
  const wheelbaseM = setup.wheelbaseMm / 1000;
  const frontTrackM = setup.frontTrackMm / 1000;
  const rearTrackM = setup.rearTrackMm / 1000;

  const longitudinalLoadTransferN =
    (totalStaticWeightN * hCgStaticM * netAxG) / Math.max(1.5, wheelbaseM);

  // Dynamic axle heave deflection (negative = compression, positive = extension)
  const antiGeometryFactor =
    netAxG < 0
      ? Math.max(0, 1 - setup.frontAntiDivePct / 100)
      : Math.max(0, 1 - setup.rearAntiSquatPct / 100);

  // Front axle compresses under braking (-longitudinalLoadTransferN > 0) + aero
  const dynamicFrontAxleDeltaFzN =
    frontAeroDownforceN - longitudinalLoadTransferN * antiGeometryFactor;
  const dynamicRearAxleDeltaFzN =
    rearAeroDownforceN + longitudinalLoadTransferN * antiGeometryFactor;

  const dynamicFrontHeaveMm =
    -(0.5 * dynamicFrontAxleDeltaFzN) / Math.max(20, frontWheelRateNmm);
  const dynamicRearHeaveMm =
    -(0.5 * dynamicRearAxleDeltaFzN) / Math.max(20, rearWheelRateNmm);

  // Preliminary body roll angle for dynamic roll center migration
  const prelimHRollM = staticRc.rollMomentArmMm / 1000;
  const totalRollStiffnessNmRad =
    frontRoll.totalAxleRollStiffnessNmRad + rearRoll.totalAxleRollStiffnessNmRad;
  const prelimRollMomentNm = totalStaticWeightN * effectiveAyG * prelimHRollM;
  const prelimRollDenom = Math.max(
    8000,
    (totalRollStiffnessNmRad - totalStaticWeightN * prelimHRollM) * 0.45
  );
  const prelimBodyRollDeg = radToDeg(prelimRollMomentNm / prelimRollDenom);

  // 8. Live Dynamic Roll Center Migration & Dynamic Roll Moment Arm (h_roll)
  const rc = calculateRollCenterKinematics(
    setup,
    dynamicFrontHeaveMm,
    dynamicRearHeaveMm,
    prelimBodyRollDeg
  );

  const hRollM = rc.rollMomentArmMm / 1000;
  const rollMomentNm = totalStaticWeightN * effectiveAyG * hRollM;
  const effectiveRollDenominator = Math.max(
    8000,
    (totalRollStiffnessNmRad - totalStaticWeightN * hRollM) * 0.45
  );
  const bodyRollRad = rollMomentNm / effectiveRollDenominator;
  const bodyRollDeg = radToDeg(bodyRollRad);

  // Elastic + Geometric Lateral Load Transfer per axle
  const effectiveElasticFrontFraction = Math.max(
    0.15,
    Math.min(0.85, frontRollStiffnessRatio + dampers.transientFrontLoadTransferShift)
  );

  const zRcFrontM = rc.effectiveFrontRollCenterMm / 1000;
  const zRcRearM = rc.effectiveRearRollCenterMm / 1000;
  const bOverL = setup.frontWeightFraction;
  const aOverL = 1 - setup.frontWeightFraction;

  const rawFrontLatTransferN =
    ((totalStaticWeightN * effectiveAyG) / frontTrackM) *
    (effectiveElasticFrontFraction * hRollM + bOverL * zRcFrontM);

  const rawRearLatTransferN =
    ((totalStaticWeightN * effectiveAyG) / rearTrackM) *
    ((1 - effectiveElasticFrontFraction) * hRollM + aOverL * zRcRearM);

  const frontLateralLoadTransferN = Math.max(0, rawFrontLatTransferN);
  const rearLateralLoadTransferN = Math.max(0, rawRearLatTransferN);

  const totalLatTransferN = frontLateralLoadTransferN + rearLateralLoadTransferN;
  const totalLateralLoadTransferDistributionFront =
    totalLatTransferN > 1 ? frontLateralLoadTransferN / totalLatTransferN : frontRollStiffnessRatio;

  const diagonalLoadTransferN = Math.sqrt(
    longitudinalLoadTransferN * longitudinalLoadTransferN +
      totalLatTransferN * totalLatTransferN
  );

  // 9. Chassis Pitch Angle (theta)
  const pitchStiffnessNmRad =
    0.5 * (frontRideRateNmm * 1000 + rearRideRateNmm * 1000) * (wheelbaseM * wheelbaseM * 0.25);
  const pitchMomentNm = totalStaticWeightN * netAxG * hCgStaticM * antiGeometryFactor;
  const bodyPitchDeg = radToDeg(pitchMomentNm / Math.max(15000, pitchStiffnessNmRad));

  // 10. 4-Corner Static and Dynamic Vertical Loads
  const frontAxleDynamicFzN =
    frontStaticAxleFzN + frontAeroDownforceN - longitudinalLoadTransferN;
  const rearAxleDynamicFzN =
    rearStaticAxleFzN + rearAeroDownforceN + longitudinalLoadTransferN;

  const clampedFrontLatN = Math.min(frontAxleDynamicFzN * 0.495, frontLateralLoadTransferN);
  const clampedRearLatN = Math.min(rearAxleDynamicFzN * 0.495, rearLateralLoadTransferN);

  const isLeftTurn = driver.turnDirection === 'left';

  const wheelStaticFzN: Record<WheelId, number> = {
    FL: 0.5 * frontStaticAxleFzN,
    FR: 0.5 * frontStaticAxleFzN,
    RL: 0.5 * rearStaticAxleFzN,
    RR: 0.5 * rearStaticAxleFzN,
  };

  const frontOutsideFzN = 0.5 * frontAxleDynamicFzN + clampedFrontLatN;
  const frontInsideFzN = 0.5 * frontAxleDynamicFzN - clampedFrontLatN;
  const rearOutsideFzN = 0.5 * rearAxleDynamicFzN + clampedRearLatN;
  const rearInsideFzN = 0.5 * rearAxleDynamicFzN - clampedRearLatN;

  const wheelDynamicFzN: Record<WheelId, number> = {
    FL: isLeftTurn ? frontInsideFzN : frontOutsideFzN,
    FR: isLeftTurn ? frontOutsideFzN : frontInsideFzN,
    RL: isLeftTurn ? rearInsideFzN : rearOutsideFzN,
    RR: isLeftTurn ? rearOutsideFzN : rearInsideFzN,
  };

  // 11. Vertical Suspension Deflections (mm)
  const longSpringFraction = antiGeometryFactor;
  const wheelDeflectionMm: Record<WheelId, number> = {
    FL:
      ((wheelDynamicFzN.FL - wheelStaticFzN.FL) *
        (0.65 + 0.35 * longSpringFraction)) /
      Math.max(15, frontWheelRateNmm),
    FR:
      ((wheelDynamicFzN.FR - wheelStaticFzN.FR) *
        (0.65 + 0.35 * longSpringFraction)) /
      Math.max(15, frontWheelRateNmm),
    RL:
      ((wheelDynamicFzN.RL - wheelStaticFzN.RL) *
        (0.65 + 0.35 * longSpringFraction)) /
      Math.max(15, rearWheelRateNmm),
    RR:
      ((wheelDynamicFzN.RR - wheelStaticFzN.RR) *
        (0.65 + 0.35 * longSpringFraction)) /
      Math.max(15, rearWheelRateNmm),
  };

  // 12. Jacking Forces
  const frontLateralForceApproxN = frontAxleDynamicFzN * effectiveAyG;
  const rearLateralForceApproxN = rearAxleDynamicFzN * effectiveAyG;
  const frontJackingForceN =
    frontLateralForceApproxN * (rc.effectiveFrontRollCenterMm / (0.5 * setup.frontTrackMm));
  const rearJackingForceN =
    rearLateralForceApproxN * (rc.effectiveRearRollCenterMm / (0.5 * setup.rearTrackMm));

  return {
    frontWheelRateNmm,
    rearWheelRateNmm,
    frontRideRateNmm,
    rearRideRateNmm,
    frontNaturalFreqHz,
    rearNaturalFreqHz,
    frontSpringRollStiffnessNmRad: frontRoll.springRollStiffnessNmRad,
    rearSpringRollStiffnessNmRad: rearRoll.springRollStiffnessNmRad,
    frontArbRollStiffnessNmRad: frontRoll.arbRollStiffnessNmRad,
    rearArbRollStiffnessNmRad: rearRoll.arbRollStiffnessNmRad,
    totalFrontRollStiffnessNmRad: frontRoll.totalAxleRollStiffnessNmRad,
    totalRearRollStiffnessNmRad: rearRoll.totalAxleRollStiffnessNmRad,
    frontRollStiffnessRatio,
    totalLateralLoadTransferDistributionFront,
    staticFrontRollCenterMm: rc.staticFrontRollCenterMm,
    staticRearRollCenterMm: rc.staticRearRollCenterMm,
    effectiveFrontRollCenterMm: rc.effectiveFrontRollCenterMm,
    effectiveRearRollCenterMm: rc.effectiveRearRollCenterMm,
    rollAxisAtCgMm: rc.rollAxisAtCgMm,
    rollMomentArmMm: rc.rollMomentArmMm,
    frontJackingForceN,
    rearJackingForceN,
    isFrontOverLowered: rc.isFrontOverLowered,
    isRearOverLowered: rc.isRearOverLowered,
    bodyRollDeg,
    bodyPitchDeg,
    totalStaticWeightN,
    frontStaticAxleFzN,
    rearStaticAxleFzN,
    totalAeroDownforceN,
    frontAeroDownforceN,
    rearAeroDownforceN,
    longitudinalLoadTransferN,
    frontLateralLoadTransferN: clampedFrontLatN,
    rearLateralLoadTransferN: clampedRearLatN,
    diagonalLoadTransferN,
    wheelStaticFzN,
    wheelDynamicFzN,
    wheelDeflectionMm,
    dampers,
  };
}
