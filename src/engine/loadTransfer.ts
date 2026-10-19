import {
  calculateAxleRollStiffness,
  calculateFrontRollStiffnessRatio,
  calculateNaturalFrequencyHz,
  calculateRideRateNmm,
  calculateRollCenterKinematics,
  calculateTireVerticalRateNmm,
  calculateWheelRateNmm,
  radToDeg,
} from './kinematics';
import { DamperAnalysis, evaluateTransientDampers } from './transientDampers';
import { CornerPhase, DriverInputState, VehicleSetup, WheelId } from './types';
import { calculateAeroDownforceN } from './aero';

const GRAVITY = 9.81;

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
  /** Requested acceleration needs a three-contact/axle-lift solution outside this model. */
  wheelLiftRequested: boolean;
  axleLiftRequested: boolean;
  rollEquilibriumValid: boolean;
}

/** Phase labels select longitudinal demand; the displayed lateral G remains the actual request. */
export function phaseAccelerations(driver: DriverInputState, phase: CornerPhase) {
  const longitudinalG = phase === 'entry'
    ? -driver.brakingG * Math.max(0, Math.min(1, driver.trailBrakeOverlapPct / 100))
    : phase === 'exit' ? driver.throttleG : 0;
  return {
    longitudinalG: longitudinalG || 0,
    lateralG: driver.lateralG,
  };
}

/** Tyre roll compliance acts in series with the complete spring + ARB suspension. */
function axleRollRates(wheelRate: number, tireRate: number, trackMm: number, arbNmDeg: number) {
  const suspension = calculateAxleRollStiffness(wheelRate, trackMm, arbNmDeg);
  const tireRoll = 0.5 * tireRate * 1000 * Math.pow(trackMm / 1000, 2);
  const transmission = tireRoll / (tireRoll + suspension.totalAxleRollStiffnessNmRad);
  return {
    springRollStiffnessNmRad: suspension.springRollStiffnessNmRad * transmission,
    arbRollStiffnessNmRad: suspension.arbRollStiffnessNmRad * transmission,
    totalAxleRollStiffnessNmRad: suspension.totalAxleRollStiffnessNmRad * transmission,
    suspensionRollFraction: transmission,
    tireRollStiffnessNmRad: tireRoll,
  };
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
  const frontRoll = axleRollRates(
    frontWheelRateNmm,
    calculateTireVerticalRateNmm(setup.frontTirePressurePsi, setup.frontTireWidthMm),
    setup.frontTrackMm,
    setup.frontArbStiffnessNmPerDeg
  );
  const rearRoll = axleRollRates(
    rearWheelRateNmm,
    calculateTireVerticalRateNmm(setup.rearTirePressurePsi, setup.rearTireWidthMm),
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

  // 5. Prescribed accelerations (not forces solved from a time-domain driver model).
  const acceleration = phaseAccelerations(driver, phase);
  const netAxG = acceleration.longitudinalG;
  const effectiveAyG = acceleration.lateralG;

  // 6. Static Weight & Aerodynamic Downforce
  const totalStaticWeightN = setup.massKg * GRAVITY;
  const frontStaticAxleFzN = totalStaticWeightN * setup.frontWeightFraction;
  const rearStaticAxleFzN = totalStaticWeightN * (1 - setup.frontWeightFraction);

  const totalAeroDownforceN = calculateAeroDownforceN(setup.aeroClA, driver.speedKmh);
  const frontAeroDownforceN = totalAeroDownforceN * (setup.aeroFrontBalancePct / 100);
  const rearAeroDownforceN = totalAeroDownforceN * (1 - setup.aeroFrontBalancePct / 100);

  // 7. Longitudinal Weight Transfer (Delta W_long = W * h_CG * a_x / (g * L))
  const hCgStaticM = staticRc.effectiveCgHeightMm / 1000;
  const wheelbaseM = setup.wheelbaseMm / 1000;
  const frontTrackM = setup.frontTrackMm / 1000;
  const rearTrackM = setup.rearTrackMm / 1000;

  const longitudinalLoadTransferN =
    (totalStaticWeightN * hCgStaticM * netAxG) / Math.max(1.5, wheelbaseM);

  // Anti-geometry modifies the longitudinal elastic reaction only. It does not
  // change total axle load transfer or lateral/aerodynamic deflection.
  const frontLongitudinalSpringFraction = netAxG < 0
    ? 1 - Math.max(0, Math.min(1, setup.frontAntiDivePct / 100)) : 1;
  const rearLongitudinalSpringFraction = netAxG > 0
    ? 1 - Math.max(0, Math.min(1, setup.rearAntiSquatPct / 100)) : 1;
  const frontElasticHeaveLoadN = frontAeroDownforceN -
    longitudinalLoadTransferN * frontLongitudinalSpringFraction;
  const rearElasticHeaveLoadN = rearAeroDownforceN +
    longitudinalLoadTransferN * rearLongitudinalSpringFraction;

  // Compression is positive for wheel travel, negative for chassis ride height.
  const frontTireRateNmm = calculateTireVerticalRateNmm(setup.frontTirePressurePsi, setup.frontTireWidthMm);
  const rearTireRateNmm = calculateTireVerticalRateNmm(setup.rearTirePressurePsi, setup.rearTireWidthMm);
  const frontBodyCompressionMm = frontElasticHeaveLoadN / (2 * frontWheelRateNmm) +
    (frontAeroDownforceN - longitudinalLoadTransferN) / (2 * frontTireRateNmm);
  const rearBodyCompressionMm = rearElasticHeaveLoadN / (2 * rearWheelRateNmm) +
    (rearAeroDownforceN + longitudinalLoadTransferN) / (2 * rearTireRateNmm);
  const dynamicFrontHeaveMm = -frontBodyCompressionMm;
  const dynamicRearHeaveMm = -rearBodyCompressionMm;
  const bodyPitchDeg = radToDeg(
    (frontBodyCompressionMm - rearBodyCompressionMm) / -setup.wheelbaseMm
  );

  // A single equivalent rigid body, small-angle roll equilibrium:
  // (Kphi - W*hroll)*phi = W*AyG*hCG - sum(transmission * Fy_axle*zRC).
  // The transmission term accounts for tyre roll deflection from direct
  // geometric load transfer. As tyre stiffness -> infinity this reduces to
  // the familiar (Kphi - W*hroll)*phi = W*AyG*hroll.
  // Iterate because the illustrative roll-centre profile changes with roll.
  const totalRollStiffnessNmRad = frontRoll.totalAxleRollStiffnessNmRad +
    rearRoll.totalAxleRollStiffnessNmRad;
  let bodyRollRad = 0;
  let rc = calculateRollCenterKinematics(setup, dynamicFrontHeaveMm, dynamicRearHeaveMm, 0);
  let rollEquilibriumValid = false;
  for (let i = 0; i < 50; i++) {
    rc = calculateRollCenterKinematics(setup, dynamicFrontHeaveMm,
      dynamicRearHeaveMm, radToDeg(bodyRollRad));
    const gravityMomentGradient = totalStaticWeightN * rc.rollMomentArmMm / 1000;
    const denominator = totalRollStiffnessNmRad - gravityMomentGradient;
    if (denominator <= 0) break;
    const transmittedGeometricMomentNm = totalStaticWeightN * effectiveAyG / 1000 *
      (setup.frontWeightFraction * frontRoll.suspensionRollFraction * rc.effectiveFrontRollCenterMm +
        (1 - setup.frontWeightFraction) * rearRoll.suspensionRollFraction * rc.effectiveRearRollCenterMm);
    const targetRollRad = (totalStaticWeightN * effectiveAyG * rc.effectiveCgHeightMm / 1000 -
      transmittedGeometricMomentNm) / denominator;
    if (!Number.isFinite(targetRollRad) || Math.abs(targetRollRad) > 0.25) break;
    if (Math.abs(targetRollRad - bodyRollRad) < 1e-10) {
      bodyRollRad = targetRollRad;
      rollEquilibriumValid = true;
      break;
    }
    bodyRollRad = 0.5 * (bodyRollRad + targetRollRad);
  }
  const bodyRollDeg = radToDeg(bodyRollRad);
  rc = calculateRollCenterKinematics(setup, dynamicFrontHeaveMm, dynamicRearHeaveMm, bodyRollDeg);

  // Damper shifts are explicitly illustrative phase modifiers. They repartition
  // the elastic reaction without changing the total roll reaction.
  const effectiveElasticFrontFraction = Math.max(0, Math.min(1,
    frontRollStiffnessRatio + dampers.transientFrontLoadTransferShift));
  const elasticRollMomentNm = totalRollStiffnessNmRad * bodyRollRad;
  const frontGeometricRollMomentNm = totalStaticWeightN * setup.frontWeightFraction *
    effectiveAyG * rc.effectiveFrontRollCenterMm / 1000;
  const rearGeometricRollMomentNm = totalStaticWeightN * (1 - setup.frontWeightFraction) *
    effectiveAyG * rc.effectiveRearRollCenterMm / 1000;
  const frontGroundRollMomentNm = elasticRollMomentNm * effectiveElasticFrontFraction +
    frontRoll.suspensionRollFraction * frontGeometricRollMomentNm;
  const rearGroundRollMomentNm = elasticRollMomentNm * (1 - effectiveElasticFrontFraction) +
    rearRoll.suspensionRollFraction * rearGeometricRollMomentNm;
  const frontLateralLoadTransferN = frontGroundRollMomentNm / frontTrackM;
  const rearLateralLoadTransferN = rearGroundRollMomentNm / rearTrackM;
  const totalLatTransferN = frontLateralLoadTransferN + rearLateralLoadTransferN;
  const totalLateralLoadTransferDistributionFront = Math.abs(totalLatTransferN) > 1e-9
    ? frontLateralLoadTransferN / totalLatTransferN : frontRollStiffnessRatio;
  const diagonalLoadTransferN = Math.hypot(longitudinalLoadTransferN, totalLatTransferN);

  // 10. 4-Corner Static and Dynamic Vertical Loads
  const frontAxleDynamicFzN =
    frontStaticAxleFzN + frontAeroDownforceN - longitudinalLoadTransferN;
  const rearAxleDynamicFzN =
    rearStaticAxleFzN + rearAeroDownforceN + longitudinalLoadTransferN;

  const axleLiftRequested = frontAxleDynamicFzN < 0 || rearAxleDynamicFzN < 0;
  // At lift, display zero contact load and mark the request outside the model.
  // This is NOT a solved three-contact vehicle state. Renormalizing axle loads
  // in the rarer axle-lift case preserves total vertical load for the display.
  const totalNormalLoadN = totalStaticWeightN + totalAeroDownforceN;
  const displayFrontAxleFzN = Math.max(0, Math.min(totalNormalLoadN, frontAxleDynamicFzN));
  const displayRearAxleFzN = totalNormalLoadN - displayFrontAxleFzN;
  const wheelLiftRequested = axleLiftRequested ||
    Math.abs(frontLateralLoadTransferN) >= 0.5 * displayFrontAxleFzN ||
    Math.abs(rearLateralLoadTransferN) >= 0.5 * displayRearAxleFzN;
  const clampedFrontLatN = Math.max(-0.5 * displayFrontAxleFzN,
    Math.min(0.5 * displayFrontAxleFzN, frontLateralLoadTransferN));
  const clampedRearLatN = Math.max(-0.5 * displayRearAxleFzN,
    Math.min(0.5 * displayRearAxleFzN, rearLateralLoadTransferN));

  const isLeftTurn = driver.turnDirection === 'left';

  const wheelStaticFzN: Record<WheelId, number> = {
    FL: 0.5 * frontStaticAxleFzN,
    FR: 0.5 * frontStaticAxleFzN,
    RL: 0.5 * rearStaticAxleFzN,
    RR: 0.5 * rearStaticAxleFzN,
  };

  const frontOutsideFzN = 0.5 * displayFrontAxleFzN + clampedFrontLatN;
  const frontInsideFzN = 0.5 * displayFrontAxleFzN - clampedFrontLatN;
  const rearOutsideFzN = 0.5 * displayRearAxleFzN + clampedRearLatN;
  const rearInsideFzN = 0.5 * displayRearAxleFzN - clampedRearLatN;

  const wheelDynamicFzN: Record<WheelId, number> = {
    FL: isLeftTurn ? frontInsideFzN : frontOutsideFzN,
    FR: isLeftTurn ? frontOutsideFzN : frontInsideFzN,
    RL: isLeftTurn ? rearInsideFzN : rearOutsideFzN,
    RR: isLeftTurn ? rearOutsideFzN : rearInsideFzN,
  };

  // 11. Spring travel follows chassis heave plus the suspension share of roll.
  // Geometric load transfer bypasses the springs. ARB reactions must not be
  // mistaken for main-spring force, and tyre deflection is not suspension travel.
  const frontHeaveTravelMm = frontElasticHeaveLoadN / (2 * frontWheelRateNmm);
  const rearHeaveTravelMm = rearElasticHeaveLoadN / (2 * rearWheelRateNmm);
  const frontRollTravelMm = (bodyRollRad -
    frontGroundRollMomentNm / frontRoll.tireRollStiffnessNmRad) * setup.frontTrackMm / 2;
  const rearRollTravelMm = (bodyRollRad -
    rearGroundRollMomentNm / rearRoll.tireRollStiffnessNmRad) * setup.rearTrackMm / 2;
  const outsideSign = isLeftTurn ? 1 : -1;
  const wheelDeflectionMm: Record<WheelId, number> = {
    FL: frontHeaveTravelMm - outsideSign * frontRollTravelMm,
    FR: frontHeaveTravelMm + outsideSign * frontRollTravelMm,
    RL: rearHeaveTravelMm - outsideSign * rearRollTravelMm,
    RR: rearHeaveTravelMm + outsideSign * rearRollTravelMm,
  };

  // 12. Jacking Forces
  const frontLateralForceApproxN = frontStaticAxleFzN * effectiveAyG;
  const rearLateralForceApproxN = rearStaticAxleFzN * effectiveAyG;
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
    wheelLiftRequested,
    axleLiftRequested,
    rollEquilibriumValid,
  };
}
