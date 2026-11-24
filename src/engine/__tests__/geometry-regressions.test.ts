import { describe, expect, it } from 'vitest';
import {
  DRIVETRAIN_ARCHETYPES,
  calculateAckermannSteerAngles,
  calculateDynamicWheelCamber,
  calculateNaturalFrequencyHz,
  calculateRideRateNmm,
  calculateRollCenterKinematics,
  calculateTubularArbRollStiffnessNmRad,
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

  it('uses 1:1 rigid-body roll camber plus bump recovery without double-counting and captures negative steer & over-lowering', () => {
    const out = calculateDynamicWheelCamber({
      staticCamberDeg: -2.0,
      geometry: 'double_wishbone',
      rideHeightDeltaMm: 0,
      wheelBumpDeflectionMm: 20,
      bodyRollDeg: 2.0,
      isOutsideWheel: true,
      isFrontWheel: true,
      steerAngleDeg: 0,
      casterDeg: 8,
      kpiDeg: 12,
    });
    expect(out.camberGainFromBumpDeg).toBeCloseTo(-0.052 * 20, 10);
    // Rigid roll (+2.0) + bump recovery (-1.04) = +0.96 net camber loss (no rollCamberLossFactor multiplier)
    expect(out.dynamicCamberDeg).toBeCloseTo(-2.0 + 2.0 - 0.052 * 20, 10);

    const inn = calculateDynamicWheelCamber({
      staticCamberDeg: -2.0,
      geometry: 'double_wishbone',
      rideHeightDeltaMm: 0,
      wheelBumpDeflectionMm: -20,
      bodyRollDeg: 2.0,
      isOutsideWheel: false,
      isFrontWheel: true,
      steerAngleDeg: 0,
      casterDeg: 8,
      kpiDeg: 12,
    });
    expect(inn.dynamicCamberDeg).toBeCloseTo(-2.0 - 2.0 + 0.052 * 20, 10);

    // Negative steerAngleDeg produces exact opposite caster term and positive KPI term
    const negSteer = calculateDynamicWheelCamber({
      staticCamberDeg: -2.0,
      geometry: 'double_wishbone',
      rideHeightDeltaMm: 0,
      wheelBumpDeflectionMm: 0,
      bodyRollDeg: 0,
      isOutsideWheel: true,
      isFrontWheel: true,
      steerAngleDeg: -10,
      casterDeg: 8,
      kpiDeg: 12,
    });
    expect(negSteer.camberGainFromSteerDeg).toBeCloseTo(
      -8 * Math.sin(degToRad(-10)) + 12 * (1 - Math.cos(degToRad(-10))),
      10
    );

    // Over-lowering penalty reduces bump camber gain beyond each geometry's threshold
    for (const [geom, overDrop] of [
      ['macpherson', -25],
      ['multilink', -33],
      ['double_wishbone', -37],
    ] as const) {
      const nominal = calculateDynamicWheelCamber({
        staticCamberDeg: -2.0,
        geometry: geom,
        rideHeightDeltaMm: 0,
        wheelBumpDeflectionMm: 10,
        bodyRollDeg: 0,
        isOutsideWheel: true,
        isFrontWheel: false,
        steerAngleDeg: 0,
        casterDeg: 0,
        kpiDeg: 0,
      });
      const overLowered = calculateDynamicWheelCamber({
        staticCamberDeg: -2.0,
        geometry: geom,
        rideHeightDeltaMm: overDrop,
        wheelBumpDeflectionMm: 10,
        bodyRollDeg: 0,
        isOutsideWheel: true,
        isFrontWheel: false,
        steerAngleDeg: 0,
        casterDeg: 0,
        kpiDeg: 0,
      });
      expect(overLowered.camberGainFromBumpDeg).toBeGreaterThan(nominal.camberGainFromBumpDeg);
    }
  });

  it('returns exact zero Ackermann steer at 0 deg and preserves signed toe symmetry', () => {
    const straight = calculateAckermannSteerAngles({
      nominalSteerAngleDeg: 0,
      trackWidthMm: 1552,
      wheelbaseMm: 2457,
      ackermannPct: 65,
      frontStaticToeDeg: 0,
    });
    expect(straight.outsideSteerDeg).toBe(0);
    expect(straight.insideSteerDeg).toBe(0);

    const toeOut = calculateAckermannSteerAngles({
      nominalSteerAngleDeg: 0,
      trackWidthMm: 1552,
      wheelbaseMm: 2457,
      ackermannPct: 65,
      frontStaticToeDeg: -0.20,
    });
    expect(toeOut.outsideSteerDeg).toBeCloseTo(-0.10, 10);
    expect(toeOut.insideSteerDeg).toBeCloseTo(0.10, 10);
  });

  it('keeps arc-sphere wishbone solver unit-invariant, mirrors left-side camber sign, and detects tangent solutions', () => {
    const scalePoint = (p: { x: number; y: number; z: number }, s: number) => ({
      x: p.x * s,
      y: p.y * s,
      z: p.z * s,
    });
    const ref = solveDoubleWishboneArcSphere({ ...linkage, thetaLowerRad: degToRad(6) });
    for (const s of [1e-3, 1e-4]) {
      const scaled = solveDoubleWishboneArcSphere({
        lowerIn1: scalePoint(linkage.lowerIn1, s),
        lowerIn2: scalePoint(linkage.lowerIn2, s),
        lowerOut0: scalePoint(linkage.lowerOut0, s),
        upperIn1: scalePoint(linkage.upperIn1, s),
        upperIn2: scalePoint(linkage.upperIn2, s),
        upperOut0: scalePoint(linkage.upperOut0, s),
        thetaLowerRad: degToRad(6),
      });
      expect(scaled.solutionType).toBe('regular');
      expect(scaled.thetaUpperRad).toBeCloseTo(ref.thetaUpperRad, 9);
      expect(scaled.camberChangeDeg).toBeCloseTo(ref.camberChangeDeg, 8);
    }

    // Left-side wishbone (-y outboard) must also yield negative camber change in bump
    const mirrorY = (p: { x: number; y: number; z: number }) => ({ x: p.x, y: -p.y, z: p.z });
    const leftSolved = solveDoubleWishboneArcSphere({
      lowerIn1: mirrorY(linkage.lowerIn1),
      lowerIn2: mirrorY(linkage.lowerIn2),
      lowerOut0: mirrorY(linkage.lowerOut0),
      upperIn1: mirrorY(linkage.upperIn1),
      upperIn2: mirrorY(linkage.upperIn2),
      upperOut0: mirrorY(linkage.upperOut0),
      thetaLowerRad: degToRad(6),
    });
    expect(leftSolved.camberChangeDeg).toBeCloseTo(ref.camberChangeDeg, 9);
    expect(leftSolved.camberChangeDeg).toBeLessThan(0);

    // Exact tangency: |deltaC| = Ru + kingpinLength (100 + 200 = 300)
    const tangent = trySolveDoubleWishboneArcSphere({
      lowerIn1: { x: 100, y: 0, z: 0 },
      lowerIn2: { x: -100, y: 0, z: 0 },
      lowerOut0: { x: 0, y: 100, z: 0 },
      upperIn1: { x: 100, y: 0, z: 200 },
      upperIn2: { x: -100, y: 0, z: 200 },
      upperOut0: { x: 0, y: 100, z: 200 },
      thetaLowerRad: -Math.PI / 2,
      previousThetaUpperRad: -Math.PI / 2,
    });
    expect(tangent.status).toBe('solved');
    if (tangent.status === 'solved') {
      expect(tangent.solutionType).toBe('tangent');
      expect(tangent.closureResidual).toBeCloseTo(0, 9);
    }
  });

  it('rejects invalid tubular ARB diameters and separates tire vertical heave from suspension RC migration', () => {
    expect(() =>
      calculateTubularArbRollStiffnessNmRad({
        outerDiameterMm: 24,
        innerDiameterMm: 24,
        effectiveLengthMm: 850,
        armLengthMm: 180,
        motionRatioArb: 0.9,
        trackWidthMm: 1550,
      })
    ).toThrow(RangeError);
    expect(() =>
      calculateTubularArbRollStiffnessNmRad({
        outerDiameterMm: 20,
        innerDiameterMm: 24,
        effectiveLengthMm: 850,
        armLengthMm: 180,
        motionRatioArb: 0.9,
        trackWidthMm: 1550,
      })
    ).toThrow(RangeError);
    expect(() =>
      calculateTubularArbRollStiffnessNmRad({
        outerDiameterMm: -24,
        innerDiameterMm: 12,
        effectiveLengthMm: 850,
        armLengthMm: 180,
        motionRatioArb: 0.9,
        trackWidthMm: 1550,
      })
    ).toThrow(RangeError);

    const setup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
    const baseRc = calculateRollCenterKinematics(setup, 0, 0, 0, 0, 0);
    const tireSquashRc = calculateRollCenterKinematics(setup, 0, 0, 0, -10, -10);
    expect(tireSquashRc.effectiveCgHeightMm).toBeCloseTo(baseRc.effectiveCgHeightMm - 10, 10);
    expect(tireSquashRc.effectiveFrontRollCenterMm).toBeCloseTo(baseRc.effectiveFrontRollCenterMm - 10, 10);
    expect(tireSquashRc.effectiveRearRollCenterMm).toBeCloseTo(baseRc.effectiveRearRollCenterMm - 10, 10);
    expect(tireSquashRc.isFrontOverLowered).toBe(false);
    expect(tireSquashRc.isRearOverLowered).toBe(false);
  });
});
