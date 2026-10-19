import { SUSPENSION_GEOMETRY_PROFILES } from './archetypes';
import { RideFrequencyTargetSolution, SuspensionGeometryType, VehicleSetup } from './types';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const NEWTONS_TO_LBS = 0.224808943;
const KMH_TO_MPH = 0.621371192;
const NMM_TO_LBS_PER_IN = 5.71014715;

export function degToRad(deg: number): number {
  return deg * DEG_TO_RAD;
}

export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}

/**
 * Converts force in Newtons (N) to pounds-force (lbs) for US display.
 */
export function newtonsToLbs(newtons: number): number {
  return newtons * NEWTONS_TO_LBS;
}

/**
 * Converts speed in km/h to miles per hour (mph).
 */
export function kmhToMph(kmh: number): number {
  return kmh * KMH_TO_MPH;
}

/**
 * Converts speed in miles per hour (mph) to km/h for internal SI equations.
 */
export function mphToKmh(mph: number): number {
  return mph / KMH_TO_MPH;
}

/**
 * Converts spring rate in N/mm to lbs/in.
 */
export function nmmToLbsPerIn(nmm: number): number {
  return nmm * NMM_TO_LBS_PER_IN;
}

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function addVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scaleVec3(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function normVec3(v: Vec3): number {
  return Math.sqrt(dotVec3(v, v));
}

function normalizeVec3(v: Vec3): Vec3 {
  const n = normVec3(v);
  if (n < 1e-12) return { x: 0, y: 0, z: 0 };
  return scaleVec3(v, 1 / n);
}

/**
 * Ideal rigid wishbone: its outboard ball joint follows a circular arc about
 * the line through its two inboard pivots. Positive rotation is oriented to
 * give an initially upward radial tangent when that direction is defined.
 */
export function evaluateWishboneArc(
  pIn1: Vec3,
  pIn2: Vec3,
  pOut0: Vec3,
  thetaRad: number
): {
  axisUnit: Vec3;
  center: Vec3;
  radius: number;
  uBasis: Vec3;
  vBasis: Vec3;
  position: Vec3;
} {
  const rawAxisUnit = normalizeVec3(subVec3(pIn2, pIn1));
  const projectionScalar = dotVec3(subVec3(pOut0, pIn1), rawAxisUnit);
  const center = addVec3(pIn1, scaleVec3(rawAxisUnit, projectionScalar));
  const radialVec = subVec3(pOut0, center);
  const radius = normVec3(radialVec);
  const uBasis = normalizeVec3(radialVec);
  let vBasis = crossVec3(rawAxisUnit, uBasis);
  let axisUnit = rawAxisUnit;
  if (vBasis.z < 0) {
    axisUnit = scaleVec3(rawAxisUnit, -1);
    vBasis = scaleVec3(vBasis, -1);
  }

  const cosT = Math.cos(thetaRad);
  const sinT = Math.sin(thetaRad);
  const offset = addVec3(scaleVec3(uBasis, radius * cosT), scaleVec3(vBasis, radius * sinT));
  const position = addVec3(center, offset);

  return { axisUnit, center, radius, uBasis, vBasis, position };
}

export interface DoubleWishboneArcSphereParameters {
  lowerIn1: Vec3;
  lowerIn2: Vec3;
  lowerOut0: Vec3;
  upperIn1: Vec3;
  upperIn2: Vec3;
  upperOut0: Vec3;
  thetaLowerRad: number;
  /** Supply the preceding solved angle when following a travel sweep. */
  previousThetaUpperRad?: number;
}

export interface DoubleWishboneArcSphereSolution {
  status: 'solved';
  solutionType: 'regular' | 'tangent' | 'underdetermined';
  lowerBallJoint: Vec3;
  upperBallJoint: Vec3;
  thetaUpperRad: number;
  camberChangeDeg: number;
  /** Signed rigid-upright length residual, in the same length units as the inputs. */
  closureResidual: number;
}

export type DoubleWishboneArcSphereResult = DoubleWishboneArcSphereSolution | {
  status: 'invalid' | 'infeasible';
  reason: string;
};

/**
 * Circle/sphere intersection with explicit feasibility and closure checks.
 * The phase form of A cos(theta) + B sin(theta) + C = 0 is equivalent to
 * the half-angle quadratic, but also covers its linear case and theta = pi
 * without dividing by a vanishing quadratic coefficient.
 */
export function trySolveDoubleWishboneArcSphere(
  params: DoubleWishboneArcSphereParameters
): DoubleWishboneArcSphereResult {
  const points = [params.lowerIn1, params.lowerIn2, params.lowerOut0,
    params.upperIn1, params.upperIn2, params.upperOut0];
  const angles = [params.thetaLowerRad, params.previousThetaUpperRad ?? 0];
  if (!points.every(p => [p.x, p.y, p.z].every(Number.isFinite)) ||
      !angles.every(Number.isFinite)) {
    return { status: 'invalid', reason: 'Coordinates and rotations must be finite.' };
  }
  if (normVec3(subVec3(params.lowerIn2, params.lowerIn1)) < 1e-9 ||
      normVec3(subVec3(params.upperIn2, params.upperIn1)) < 1e-9) {
    return { status: 'invalid', reason: 'Each wishbone needs a nonzero pivot axis.' };
  }
  const kingpinLength = normVec3(subVec3(params.upperOut0, params.lowerOut0));
  if (kingpinLength < 1e-9) {
    return { status: 'invalid', reason: 'The upright must have nonzero length.' };
  }
  const lowerArc = evaluateWishboneArc(params.lowerIn1, params.lowerIn2,
    params.lowerOut0, params.thetaLowerRad);
  const upperArc0 = evaluateWishboneArc(params.upperIn1, params.upperIn2,
    params.upperOut0, 0);
  if (lowerArc.radius < 1e-9 || upperArc0.radius < 1e-9) {
    return { status: 'invalid', reason: 'A ball joint cannot lie on its wishbone pivot axis.' };
  }

  const deltaC = subVec3(upperArc0.center, lowerArc.position);
  const Ru = upperArc0.radius;
  const A = 2 * Ru * dotVec3(upperArc0.uBasis, deltaC);
  const B = 2 * Ru * dotVec3(upperArc0.vBasis, deltaC);
  const C = dotVec3(deltaC, deltaC) + Ru * Ru - kingpinLength * kingpinLength;
  const amplitude = Math.hypot(A, B);
  if (![kingpinLength, lowerArc.radius, Ru, A, B, C, amplitude].every(Number.isFinite)) {
    return { status: 'invalid', reason: 'Geometry exceeds the finite numerical range of the solver.' };
  }
  const scale = Math.max(1, Math.abs(A), Math.abs(B), Math.abs(C));
  const tolerance = 1e-10 * scale;
  const previous = params.previousThetaUpperRad ?? 0;
  let solutionType: DoubleWishboneArcSphereSolution['solutionType'] = 'regular';
  let thetaUpperRad: number;

  if (amplitude <= tolerance) {
    if (Math.abs(C) > tolerance) {
      return { status: 'infeasible', reason: 'The upper ball-joint arc does not intersect the upright sphere.' };
    }
    // Every upper-arm angle closes: preserve the supplied assembly state.
    thetaUpperRad = previous;
    solutionType = 'underdetermined';
  } else {
    if (Math.abs(C) > amplitude + tolerance) {
      return { status: 'infeasible', reason: 'The requested lower-arm rotation has no rigid-upright solution.' };
    }
    const phase = Math.atan2(B, A);
    const offset = Math.acos(Math.max(-1, Math.min(1, -C / amplitude)));
    if (Math.abs(Math.abs(C) - amplitude) <= tolerance) solutionType = 'tangent';
    const nearPrevious = (theta: number) =>
      theta + 2 * Math.PI * Math.round((previous - theta) / (2 * Math.PI));
    const candidates = [nearPrevious(phase + offset), nearPrevious(phase - offset)];
    thetaUpperRad = Math.abs(candidates[0] - previous) <= Math.abs(candidates[1] - previous)
      ? candidates[0] : candidates[1];
  }

  const upperArcSolved = evaluateWishboneArc(params.upperIn1, params.upperIn2,
    params.upperOut0, thetaUpperRad);
  const closureResidual = normVec3(subVec3(upperArcSolved.position, lowerArc.position)) - kingpinLength;
  if (!Number.isFinite(closureResidual) || Math.abs(closureResidual) > Math.max(1e-7, kingpinLength * 1e-9)) {
    return { status: 'infeasible', reason: 'The candidate solution failed the rigid-upright closure check.' };
  }
  const staticAngle = Math.atan2(params.upperOut0.y - params.lowerOut0.y,
    params.upperOut0.z - params.lowerOut0.z);
  const solvedAngle = Math.atan2(upperArcSolved.position.y - lowerArc.position.y,
    upperArcSolved.position.z - lowerArc.position.z);
  const angleChange = Math.atan2(Math.sin(solvedAngle - staticAngle), Math.cos(solvedAngle - staticAngle));
  return { status: 'solved', solutionType, lowerBallJoint: lowerArc.position,
    upperBallJoint: upperArcSolved.position, thetaUpperRad,
    camberChangeDeg: radToDeg(angleChange), closureResidual };
}

/** Compatibility wrapper: invalid or infeasible linkage states fail explicitly. */
export function solveDoubleWishboneArcSphere(
  params: DoubleWishboneArcSphereParameters
): DoubleWishboneArcSphereSolution {
  const result = trySolveDoubleWishboneArcSphere(params);
  if (result.status !== 'solved') throw new RangeError(result.reason);
  return result;
}

/**
 * Local tangent wheel rate Kw = Ks * MR^2, for a constant measured axial
 * spring-travel / wheel-travel ratio. The installation projection is already
 * included in this MR. The legacy inclination argument is retained for callers
 * and stored profiles; applying it again would count installation angle twice.
 */
export function calculateWheelRateNmm(
  springRateNmm: number,
  motionRatio: number,
  _legacySpringInclinationDeg: number = 90
): number {
  return springRateNmm * motionRatio * motionRatio;
}

/**
 * Effective tire vertical spring rate K_t (N/mm) as a function of inflation pressure (PSI)
 * and tire section width (mm).
 */
export function calculateTireVerticalRateNmm(
  tirePressurePsi: number,
  tireWidthMm: number = 255
): number {
  const clampedPsi = Math.max(18, Math.min(50, tirePressurePsi));
  const widthFactor = 0.82 + 0.18 * (tireWidthMm / 255);
  return 240 * (0.55 + 0.45 * (clampedPsi / 32.0)) * widthFactor;
}

/**
 * Ride rate K_ride combines wheel rate K_w and tire vertical rate K_t in series:
 * K_ride = (K_w * K_t) / (K_w + K_t)
 */
export function calculateRideRateNmm(
  wheelRateNmm: number,
  tirePressurePsi: number,
  tireWidthMm: number = 255
): number {
  const kt = calculateTireVerticalRateNmm(tirePressurePsi, tireWidthMm);
  if (wheelRateNmm + kt <= 0) return 0;
  return (wheelRateNmm * kt) / (wheelRateNmm + kt);
}

/**
 * Sprung mass natural frequency f_n (Hz):
 * f_n = (1 / 2pi) * sqrt(K_ride [N/m] / m_corner [kg])
 */
export function calculateNaturalFrequencyHz(
  rideRateNmm: number,
  cornerSprungMassKg: number
): number {
  if (cornerSprungMassKg <= 0 || rideRateNmm <= 0) return 0;
  const kNm = rideRateNmm * 1000;
  return (1 / (2 * Math.PI)) * Math.sqrt(kNm / cornerSprungMassKg);
}

export const MIN_SPRING_RATE_NMM = 25;
export const MAX_SPRING_RATE_NMM = 320;
/** Assumed sprung fraction for the educational archetypes, not measured data. */
export const ASSUMED_SPRUNG_MASS_FRACTION = 0.88;

/**
 * Invert the series tyre/suspension single-mode ride-frequency approximation.
 * A bounded spring setting always reports its achieved frequency and limits;
 * an impossible target never masquerades as an attained frequency.
 */
export function solveRideFrequencyTarget(
  targetFreqHz: number,
  setup: VehicleSetup,
  axle: 'front' | 'rear'
): RideFrequencyTargetSolution {
  const isFront = axle === 'front';
  const cornerSprungMassKg = 0.5 * setup.massKg *
    (isFront ? setup.frontWeightFraction : 1 - setup.frontWeightFraction) *
    ASSUMED_SPRUNG_MASS_FRACTION;
  const pressure = isFront ? setup.frontTirePressurePsi : setup.rearTirePressurePsi;
  const width = isFront ? setup.frontTireWidthMm : setup.rearTireWidthMm;
  const motionRatio = isFront ? setup.frontMotionRatio : setup.rearMotionRatio;
  if (!Number.isFinite(targetFreqHz) || targetFreqHz <= 0 ||
      !Number.isFinite(cornerSprungMassKg) || cornerSprungMassKg <= 0 ||
      !Number.isFinite(motionRatio) || motionRatio <= 0 ||
      !Number.isFinite(pressure) || !Number.isFinite(width) || width <= 0) {
    throw new RangeError('Ride-frequency targets require positive frequency, mass, motion ratio and tyre width, with finite pressure.');
  }
  const kt = calculateTireVerticalRateNmm(pressure, width);
  const frequencyAtRate = (springRate: number) => calculateNaturalFrequencyHz(
    calculateRideRateNmm(calculateWheelRateNmm(springRate, motionRatio), pressure, width),
    cornerSprungMassKg
  );
  const minAchievableFrequencyHz = frequencyAtRate(MIN_SPRING_RATE_NMM);
  const maxAchievableFrequencyHz = frequencyAtRate(MAX_SPRING_RATE_NMM);
  const targetRideRateNmm = Math.pow(2 * Math.PI * targetFreqHz, 2) * cornerSprungMassKg / 1000;
  let springRateNmm: number;
  let limitReason: RideFrequencyTargetSolution['limitReason'] = null;
  if (targetFreqHz < minAchievableFrequencyHz) {
    springRateNmm = MIN_SPRING_RATE_NMM;
    limitReason = 'minimum_spring_rate';
  } else if (targetFreqHz > maxAchievableFrequencyHz) {
    springRateNmm = MAX_SPRING_RATE_NMM;
    limitReason = targetRideRateNmm >= kt ? 'tire_stiffness_limit' : 'maximum_spring_rate';
  } else {
    const requiredWheelRateNmm = targetRideRateNmm * kt / (kt - targetRideRateNmm);
    springRateNmm = requiredWheelRateNmm / (motionRatio * motionRatio);
  }
  return { requestedFrequencyHz: targetFreqHz, achievedFrequencyHz: frequencyAtRate(springRateNmm),
    springRateNmm, minAchievableFrequencyHz, maxAchievableFrequencyHz,
    status: limitReason ? 'limited' : 'achieved', limitReason };
}

/** Numeric compatibility API. Use solveRideFrequencyTarget to expose limits. */
export function solveSpringRateForTargetRideFreqHz(
  targetFreqHz: number,
  setup: VehicleSetup,
  axle: 'front' | 'rear'
): number {
  return solveRideFrequencyTarget(targetFreqHz, setup, axle).springRateNmm;
}

/**
 * Tubular Anti-Roll Bar torsional stiffness (PDF Page 8).
 */
export function calculateTubularArbRollStiffnessNmRad(params: {
  outerDiameterMm: number;
  innerDiameterMm: number;
  effectiveLengthMm: number;
  armLengthMm: number;
  motionRatioArb: number;
  trackWidthMm: number;
  shearModulusGpa?: number;
}): number {
  const G = (params.shearModulusGpa ?? 79.3) * 1e9;
  const Do = params.outerDiameterMm / 1000;
  const Di = params.innerDiameterMm / 1000;
  const L = Math.max(0.05, params.effectiveLengthMm / 1000);
  const arm = Math.max(0.02, params.armLengthMm / 1000);
  const track = params.trackWidthMm / 1000;

  const kArbTorsional = (G * Math.PI * (Math.pow(Do, 4) - Math.pow(Di, 4))) / (32 * L);
  return (
    (kArbTorsional / (arm * arm)) *
    params.motionRatioArb *
    params.motionRatioArb *
    (track * track)
  );
}

/**
 * Single-axle roll stiffness K_phi,axle (N*m/rad) combining main springs and ARB in parallel.
 */
export function calculateAxleRollStiffness(
  rideRateNmm: number,
  trackWidthMm: number,
  arbStiffnessNmPerDeg: number
): {
  springRollStiffnessNmRad: number;
  arbRollStiffnessNmRad: number;
  totalAxleRollStiffnessNmRad: number;
} {
  const rideRateNm = rideRateNmm * 1000;
  const trackM = trackWidthMm / 1000;
  const springRollStiffnessNmRad = 0.5 * rideRateNm * trackM * trackM;
  const arbRollStiffnessNmRad = arbStiffnessNmPerDeg * RAD_TO_DEG;
  return {
    springRollStiffnessNmRad,
    arbRollStiffnessNmRad,
    totalAxleRollStiffnessNmRad: springRollStiffnessNmRad + arbRollStiffnessNmRad,
  };
}

/**
 * Front Roll Stiffness Ratio (FRSR) [PDF Page 8 & 12].
 */
export function calculateFrontRollStiffnessRatio(
  frontRollStiffnessNmRad: number,
  rearRollStiffnessNmRad: number
): number {
  const total = frontRollStiffnessNmRad + rearRollStiffnessNmRad;
  if (total <= 0) return 0.5;
  return frontRollStiffnessNmRad / total;
}

/**
 * Illustrative profile model, not a hardpoint kinematic solution.
 * Computes both Static and Dynamic Roll Center Heights (z_rc,f, z_rc,r) and Roll Moment Arm (h_roll)
 * including dynamic Roll Center Migration from:
 * 1. Static Ride Height changes (frontRideHeightDeltaMm, rearRideHeightDeltaMm)
 * 2. Dynamic Braking Dive / Acceleration Squat axle heave (dynamicFrontHeaveMm, dynamicRearHeaveMm)
 * 3. Dynamic Chassis Roll Angle (bodyRollDeg)
 */
export function calculateRollCenterKinematics(
  setup: VehicleSetup,
  dynamicFrontHeaveMm: number = 0, // negative = compression in dive
  dynamicRearHeaveMm: number = 0, // negative = compression in squat
  bodyRollDeg: number = 0
): {
  effectiveCgHeightMm: number;
  staticFrontRollCenterMm: number;
  staticRearRollCenterMm: number;
  effectiveFrontRollCenterMm: number;
  effectiveRearRollCenterMm: number;
  rollAxisAtCgMm: number;
  rollMomentArmMm: number;
  isFrontOverLowered: boolean;
  isRearOverLowered: boolean;
} {
  const frontProfile = SUSPENSION_GEOMETRY_PROFILES[setup.frontGeometry];
  const rearProfile = SUSPENSION_GEOMETRY_PROFILES[setup.rearGeometry];

  const totalFrontDeltaMm = setup.frontRideHeightDeltaMm + dynamicFrontHeaveMm;
  const totalRearDeltaMm = setup.rearRideHeightDeltaMm + dynamicRearHeaveMm;

  const avgRideDeltaMm =
    setup.frontWeightFraction * totalFrontDeltaMm +
    (1 - setup.frontWeightFraction) * totalRearDeltaMm;
  const effectiveCgHeightMm = setup.cgHeightMm + avgRideDeltaMm;

  // Static roll centers (at current ride height setting before dynamic cornering pitch/roll)
  const staticFrontOverLower = Math.min(
    0,
    setup.frontRideHeightDeltaMm - frontProfile.overLoweringThresholdMm
  );
  const staticRearOverLower = Math.min(
    0,
    setup.rearRideHeightDeltaMm - rearProfile.overLoweringThresholdMm
  );

  const staticFrontRollCenterMm =
    setup.nominalFrontRollCenterMm +
    setup.frontRideHeightDeltaMm * frontProfile.rcMigrationRatePerMmDrop +
    staticFrontOverLower * 1.35;

  const staticRearRollCenterMm =
    setup.nominalRearRollCenterMm +
    setup.rearRideHeightDeltaMm * rearProfile.rcMigrationRatePerMmDrop +
    staticRearOverLower * 1.1;

  // Dynamic roll centers (migrating with live pitch dive/squat and body roll angle phi)
  const dynFrontOverLower = Math.min(
    0,
    totalFrontDeltaMm - frontProfile.overLoweringThresholdMm
  );
  const dynRearOverLower = Math.min(
    0,
    totalRearDeltaMm - rearProfile.overLoweringThresholdMm
  );

  // Body roll causes vertical roll center migration proportional to rollCamberLossFactor * phi^2
  const frontRollMigrationMm =
    -0.55 * frontProfile.rollCamberLossFactor * bodyRollDeg * bodyRollDeg;
  const rearRollMigrationMm =
    -0.45 * rearProfile.rollCamberLossFactor * bodyRollDeg * bodyRollDeg;

  const effectiveFrontRollCenterMm =
    setup.nominalFrontRollCenterMm +
    totalFrontDeltaMm * frontProfile.rcMigrationRatePerMmDrop +
    dynFrontOverLower * 1.35 +
    frontRollMigrationMm;

  const effectiveRearRollCenterMm =
    setup.nominalRearRollCenterMm +
    totalRearDeltaMm * rearProfile.rcMigrationRatePerMmDrop +
    dynRearOverLower * 1.1 +
    rearRollMigrationMm;

  const bOverL = setup.frontWeightFraction;
  const aOverL = 1 - setup.frontWeightFraction;
  const rollAxisAtCgMm =
    bOverL * effectiveFrontRollCenterMm + aOverL * effectiveRearRollCenterMm;

  const rollMomentArmMm = effectiveCgHeightMm - rollAxisAtCgMm;

  return {
    effectiveCgHeightMm,
    staticFrontRollCenterMm,
    staticRearRollCenterMm,
    effectiveFrontRollCenterMm,
    effectiveRearRollCenterMm,
    rollAxisAtCgMm,
    rollMomentArmMm,
    isFrontOverLowered: totalFrontDeltaMm < frontProfile.overLoweringThresholdMm,
    isRearOverLowered: totalRearDeltaMm < rearProfile.overLoweringThresholdMm,
  };
}

/**
 * Pure Geometric Ackermann vs Parallel / Anti-Ackermann Steering Angles [PDF Page 3].
 */
export function calculateAckermannSteerAngles(params: {
  nominalSteerAngleDeg: number;
  trackWidthMm: number;
  wheelbaseMm: number;
  ackermannPct: number;
  frontStaticToeDeg: number;
}): {
  outsideSteerDeg: number;
  insideSteerDeg: number;
} {
  const baseRad = degToRad(Math.max(0.1, Math.abs(params.nominalSteerAngleDeg)));
  const wOverL = params.trackWidthMm / Math.max(1000, params.wheelbaseMm);

  const cotCenter = 1 / Math.tan(baseRad);
  const cotOuterAck = cotCenter + 0.5 * wOverL;
  const cotInnerAck = Math.max(0.1, cotCenter - 0.5 * wOverL);

  const outerAckDeg = radToDeg(Math.atan(1 / cotOuterAck));
  const innerAckDeg = radToDeg(Math.atan(1 / cotInnerAck));

  const ackFactor = params.ackermannPct / 100;
  const parallelDeg = Math.abs(params.nominalSteerAngleDeg);

  const halfToeDeg = params.frontStaticToeDeg * 0.5;

  const outsideSteerDeg =
    parallelDeg + ackFactor * (outerAckDeg - parallelDeg) + halfToeDeg;
  const insideSteerDeg =
    parallelDeg + ackFactor * (innerAckDeg - parallelDeg) - halfToeDeg;

  return {
    outsideSteerDeg: Math.max(0, outsideSteerDeg),
    insideSteerDeg: Math.max(0, insideSteerDeg),
  };
}

/**
 * Illustrative camber profile. The per-type gains and lowering thresholds are
 * assumptions, not a measured vehicle-specific kinematic solution.
 */
export function calculateDynamicWheelCamber(params: {
  staticCamberDeg: number;
  geometry: SuspensionGeometryType;
  rideHeightDeltaMm: number;
  wheelBumpDeflectionMm: number;
  bodyRollDeg: number;
  isOutsideWheel: boolean;
  isFrontWheel: boolean;
  steerAngleDeg: number;
  casterDeg: number;
  kpiDeg: number;
}): {
  dynamicCamberDeg: number;
  camberGainFromBumpDeg: number;
  camberGainFromSteerDeg: number;
} {
  const profile = SUSPENSION_GEOMETRY_PROFILES[params.geometry];

  const overLowerPenalty =
    params.rideHeightDeltaMm < profile.overLoweringThresholdMm
      ? (params.rideHeightDeltaMm - profile.overLoweringThresholdMm) * -0.0009
      : 0;

  const effectiveBumpGainRate = profile.baseBumpCamberGainDegPerMm + overLowerPenalty;
  const camberGainFromBumpDeg = effectiveBumpGainRate * params.wheelBumpDeflectionMm;

  const rollSign = params.isOutsideWheel ? 1 : -1;
  const rollCamberEffectDeg = rollSign * params.bodyRollDeg * profile.rollCamberLossFactor;

  let camberGainFromSteerDeg = 0;
  if (params.isFrontWheel && params.steerAngleDeg > 0.01) {
    const deltaRad = degToRad(params.steerAngleDeg);
    const casterTerm = -params.casterDeg * Math.sin(deltaRad);
    const kpiTerm = params.kpiDeg * (1 - Math.cos(deltaRad));
    camberGainFromSteerDeg = params.isOutsideWheel
      ? casterTerm + kpiTerm
      : -casterTerm + kpiTerm;
  }

  const dynamicCamberDeg =
    params.staticCamberDeg +
    camberGainFromBumpDeg +
    rollCamberEffectDeg +
    camberGainFromSteerDeg;

  return {
    dynamicCamberDeg,
    camberGainFromBumpDeg,
    camberGainFromSteerDeg,
  };
}

export function calculateAntiDivePercentage(params: {
  svicHeightMm: number;
  svicLengthMm: number;
  wheelbaseMm: number;
  cgHeightMm: number;
  brakeBiasFrontFraction: number;
}): number {
  if (params.svicLengthMm <= 0 || params.cgHeightMm <= 0) return 0;
  return (
    (params.svicHeightMm / params.svicLengthMm) *
    (params.wheelbaseMm / params.cgHeightMm) *
    params.brakeBiasFrontFraction *
    100
  );
}

export function calculateAntiSquatPercentage(params: {
  rearSvicHeightMm: number;
  rearSvicLengthMm: number;
  wheelbaseMm: number;
  cgHeightMm: number;
  frontTorqueSplitFraction: number;
}): number {
  if (params.rearSvicLengthMm <= 0 || params.cgHeightMm <= 0) return 0;
  return (
    (params.rearSvicHeightMm / params.rearSvicLengthMm) *
    (params.wheelbaseMm / params.cgHeightMm) *
    (1 - params.frontTorqueSplitFraction) *
    100
  );
}
