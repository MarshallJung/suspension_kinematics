import { describe, expect, it } from 'vitest';
import {
  DRIVETRAIN_ARCHETYPES,
  calculateNaturalFrequencyHz,
  calculateRideRateNmm,
  calculateRollCenterKinematics,
  calculateWheelRateNmm,
  degToRad,
  solveDoubleWishboneArcSphere,
  solveRideFrequencyTarget,
  solveSpringRateForTargetRideFreqHz,
  trySolveDoubleWishboneArcSphere,
} from '../index';

const linkage = {
  lowerIn1: { x: 150, y: 250, z: 180 },
  lowerIn2: { x: -150, y: 250, z: 180 },
  lowerOut0: { x: 0, y: 610, z: 170 },
  upperIn1: { x: 120, y: 340, z: 390 },
  upperIn2: { x: -120, y: 340, z: 390 },
  upperOut0: { x: 0, y: 580, z: 410 },
};
const distance = (a: {x: number; y: number; z: number}, b: {x: number; y: number; z: number}) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// These checks compare independent constraints/identities, not tuning rules.
describe('Geometry and ride-rate regression constraints', () => {
  it('uses measured axial travel ratio exactly once regardless of legacy angle metadata', () => {
    const springForceDerivative = 100;
    const axialTravelRatio = 0.85;
    const expectedFromVirtualWork = springForceDerivative * axialTravelRatio ** 2;
    for (const inclination of [30, 60, 90]) {
      expect(calculateWheelRateNmm(100, axialTravelRatio, inclination)).toBeCloseTo(expectedFromVirtualWork, 10);
    }
  });

  it('preserves rigid-upright closure through a feasible travel sweep and retains assembly continuity', () => {
    let previous = 2 * Math.PI;
    const length = distance(linkage.upperOut0, linkage.lowerOut0);
    for (const degrees of [-5, -2, 0, 2, 4, 6, 8, 10]) {
      const solved = solveDoubleWishboneArcSphere({ ...linkage,
        thetaLowerRad: degToRad(degrees), previousThetaUpperRad: previous });
      expect(solved.status).toBe('solved');
      expect(distance(solved.upperBallJoint, solved.lowerBallJoint)).toBeCloseTo(length, 7);
      expect(Math.abs(solved.closureResidual)).toBeLessThan(1e-7);
      expect(Math.abs(solved.thetaUpperRad - previous)).toBeLessThan(0.4);
      previous = solved.thetaUpperRad;
    }
    expect(previous).toBeGreaterThan(Math.PI);
  });

  it('reports infeasible linkage travel instead of fabricating an upright length', () => {
    const params = { ...linkage, thetaLowerRad: degToRad(-45) };
    expect(trySolveDoubleWishboneArcSphere(params).status).toBe('infeasible');
    expect(() => solveDoubleWishboneArcSphere(params)).toThrow(RangeError);
  });

  it('solves the half-angle quadratic linear case without assuming zero upper rotation', () => {
    const params = {
      lowerIn1: { x: 100, y: -50, z: 50 * (1 + Math.SQRT2) },
      lowerIn2: { x: -100, y: -50, z: 50 * (1 + Math.SQRT2) },
      lowerOut0: { x: 0, y: 0, z: 100 },
      upperIn1: { x: 100, y: 0, z: 0 },
      upperIn2: { x: -100, y: 0, z: 0 },
      upperOut0: { x: 0, y: 100, z: 0 },
      thetaLowerRad: Math.PI,
    };
    const solved = solveDoubleWishboneArcSphere(params);
    expect(distance(solved.upperBallJoint, solved.lowerBallJoint))
      .toBeCloseTo(distance(params.upperOut0, params.lowerOut0), 7);
    expect(Math.abs(solved.thetaUpperRad)).toBeGreaterThan(0.1);
  });

  it('distinguishes underdetermined closure and invalid geometry explicitly', () => {
    const underdetermined = trySolveDoubleWishboneArcSphere({
      lowerIn1: { x: 100, y: -50, z: 0 }, lowerIn2: { x: -100, y: -50, z: 0 },
      lowerOut0: { x: 0, y: 0, z: 0 },
      upperIn1: { x: 100, y: 0, z: 0 }, upperIn2: { x: -100, y: 0, z: 0 },
      upperOut0: { x: 0, y: 100, z: 0 }, thetaLowerRad: 0, previousThetaUpperRad: 0.7,
    });
    expect(underdetermined.status).toBe('solved');
    if (underdetermined.status === 'solved') {
      expect(underdetermined.solutionType).toBe('underdetermined');
      expect(underdetermined.thetaUpperRad).toBe(0.7);
      expect(underdetermined.closureResidual).toBeCloseTo(0, 10);
    }
    expect(trySolveDoubleWishboneArcSphere({ ...linkage, lowerIn2: linkage.lowerIn1,
      thetaLowerRad: 0 }).status).toBe('invalid');
    expect(trySolveDoubleWishboneArcSphere({ ...linkage, thetaLowerRad: NaN }).status).toBe('invalid');
  });

  it('reports achieved frequency and spring limit at both ends of the exposed RR target range', () => {
    const setup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
    const low = solveRideFrequencyTarget(1.2, setup, 'front');
    expect(low.status).toBe('limited');
    expect(low.limitReason).toBe('minimum_spring_rate');
    expect(low.springRateNmm).toBe(25);
    expect(low.achievedFrequencyHz).toBeGreaterThan(low.requestedFrequencyHz);
    const high = solveRideFrequencyTarget(3.2, setup, 'rear');
    expect(high.status).toBe('limited');
    expect(high.limitReason).toBe('maximum_spring_rate');
    expect(high.springRateNmm).toBe(320);
    expect(high.achievedFrequencyHz).toBeLessThan(high.requestedFrequencyHz);
    expect(solveSpringRateForTargetRideFreqHz(3.2, setup, 'rear')).toBe(high.springRateNmm);
  });

  it('exactly back-solves feasible targets across all archetypes using the forward series-spring equation', () => {
    for (const { defaultSetup: setup } of Object.values(DRIVETRAIN_ARCHETYPES)) {
      for (const axle of ['front', 'rear'] as const) {
        const bounds = solveRideFrequencyTarget(2.1, setup, axle);
        const target = (bounds.minAchievableFrequencyHz + bounds.maxAchievableFrequencyHz) / 2;
        const result = solveRideFrequencyTarget(target, setup, axle);
        expect(result.status).toBe('achieved');
        const rate = calculateWheelRateNmm(result.springRateNmm, setup[`${axle}MotionRatio`]);
        const rideRate = calculateRideRateNmm(rate, setup[`${axle}TirePressurePsi`], setup[`${axle}TireWidthMm`]);
        const mass = setup.massKg * (axle === 'front' ? setup.frontWeightFraction : 1 - setup.frontWeightFraction) * 0.44;
        const independentlyCalculatedFrequency = Math.sqrt(rideRate * 1000 / mass) / (2 * Math.PI);
        expect(independentlyCalculatedFrequency).toBeCloseTo(target, 10);
        expect(result.achievedFrequencyHz).toBeCloseTo(target, 10);
        expect(calculateNaturalFrequencyHz(rideRate, mass)).toBeCloseTo(target, 10);
      }
    }
  });

  it('identifies tyre-stiffness-limited targets and rejects nonphysical target inputs', () => {
    const setup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
    expect(solveRideFrequencyTarget(100, setup, 'front').limitReason).toBe('tire_stiffness_limit');
    for (const invalid of [0, -2, NaN, Infinity]) {
      expect(() => solveRideFrequencyTarget(invalid, setup, 'front')).toThrow(RangeError);
    }
  });

  it('interpolates the roll axis at the CG using axle distances, without a hidden minimum lever arm', () => {
    const setup = { ...DRIVETRAIN_ARCHETYPES.RR.defaultSetup,
      frontWeightFraction: 0.38, cgHeightMm: 465,
      nominalFrontRollCenterMm: 38, nominalRearRollCenterMm: 72 };
    const rc = calculateRollCenterKinematics(setup);
    expect(rc.rollAxisAtCgMm).toBeCloseTo(59.08, 10);
    expect(rc.rollMomentArmMm).toBeCloseTo(405.92, 10);
    const raised = calculateRollCenterKinematics({ ...setup,
      nominalFrontRollCenterMm: 470, nominalRearRollCenterMm: 470 });
    expect(raised.rollMomentArmMm).toBeCloseTo(-5, 10);
  });
});
