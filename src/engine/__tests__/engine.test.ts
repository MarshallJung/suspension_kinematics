import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRIVER_INPUT,
  DRIVETRAIN_ARCHETYPES,
  calculateAntiDivePercentage,
  calculateAntiSquatPercentage,
  calculateFrontRollStiffnessRatio,
  calculateTubularArbRollStiffnessNmRad,
  calculateWheelRateNmm,
  degToRad,
  simulateVehicleState,
  solveDiagnosticRecommendations,
  solveDoubleWishboneArcSphere,
  solveLoadTransfer,
  solveSpringRateForTargetRideFreqHz,
} from '../index';

describe('Suspension Kinematics & Vehicle Dynamics Deterministic Engine', () => {
  it('preserves exact upright kingpin length and generates negative camber gain in Weierstrass arc-sphere solver', () => {
    // Unequal-length double wishbone: shorter upper control arm (240mm) vs longer lower control arm (360mm)
    const lowerIn1 = { x: 150, y: 250, z: 180 };
    const lowerIn2 = { x: -150, y: 250, z: 180 };
    const lowerOut0 = { x: 0, y: 610, z: 170 };

    const upperIn1 = { x: 120, y: 340, z: 390 };
    const upperIn2 = { x: -120, y: 340, z: 390 };
    const upperOut0 = { x: 0, y: 580, z: 410 };

    const dx0 = upperOut0.x - lowerOut0.x;
    const dy0 = upperOut0.y - lowerOut0.y;
    const dz0 = upperOut0.z - lowerOut0.z;
    const initialKingpinLength = Math.sqrt(dx0 * dx0 + dy0 * dy0 + dz0 * dz0);

    // Rotate lower arm upward into bump (+8 degrees)
    const solved = solveDoubleWishboneArcSphere({
      lowerIn1,
      lowerIn2,
      lowerOut0,
      upperIn1,
      upperIn2,
      upperOut0,
      thetaLowerRad: degToRad(8),
    });

    const dx = solved.upperBallJoint.x - solved.lowerBallJoint.x;
    const dy = solved.upperBallJoint.y - solved.lowerBallJoint.y;
    const dz = solved.upperBallJoint.z - solved.lowerBallJoint.z;
    const solvedKingpinLength = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Residual constraint ||p_ubj - p_lbj|| - L_kp must be < 1e-6 mm
    expect(Math.abs(solvedKingpinLength - initialKingpinLength)).toBeLessThan(1e-6);
    // Shorter upper control arm tilts top of upright inward in bump (negative camber change)
    expect(solved.camberChangeDeg).toBeLessThan(0);
  });

  it('computes wheel rate K_w = K_s * measured MR^2 and tubular ARB stiffness', () => {
    const kw = calculateWheelRateNmm(100, 0.85, 90);
    expect(kw).toBeCloseTo(72.25, 2);

    const kwInclined = calculateWheelRateNmm(100, 0.85, 60);
    expect(kwInclined).toBeCloseTo(72.25, 2);

    // Solid vs hollow ARB stiffness increases with outer diameter^4
    const arbSmall = calculateTubularArbRollStiffnessNmRad({
      outerDiameterMm: 24,
      innerDiameterMm: 12,
      effectiveLengthMm: 850,
      armLengthMm: 180,
      motionRatioArb: 0.9,
      trackWidthMm: 1550,
    });
    const arbLarge = calculateTubularArbRollStiffnessNmRad({
      outerDiameterMm: 28,
      innerDiameterMm: 12,
      effectiveLengthMm: 850,
      armLengthMm: 180,
      motionRatioArb: 0.9,
      trackWidthMm: 1550,
    });
    expect(arbLarge).toBeGreaterThan(arbSmall * 1.8);
  });

  it('conserves total vertical load across all 4 tires across all archetypes and corner phases', () => {
    const archetypes = Object.values(DRIVETRAIN_ARCHETYPES);
    const phases = ['entry', 'mid', 'exit'] as const;

    for (const arch of archetypes) {
      for (const phase of phases) {
        const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: phase };
        const sim = simulateVehicleState(arch.defaultSetup, driver);
        const sumWheelFz =
          sim.wheels.FL.dynamicFzN +
          sim.wheels.FR.dynamicFzN +
          sim.wheels.RL.dynamicFzN +
          sim.wheels.RR.dynamicFzN;

        const expectedTotalFz =
          arch.defaultSetup.massKg * 9.81 + sim.kinematics.totalAeroDownforceN;

        expect(Math.abs(sumWheelFz - expectedTotalFz)).toBeLessThan(1.0);
      }
    }
  });

  it('enforces Anti-Dive and Anti-Squat invariance on total longitudinal weight transfer while reducing pitch angle', () => {
    const adPct = calculateAntiDivePercentage({
      svicHeightMm: 120,
      svicLengthMm: 1400,
      wheelbaseMm: 2457,
      cgHeightMm: 455,
      brakeBiasFrontFraction: 0.6,
    });
    expect(adPct).toBeGreaterThan(25);

    const asPct = calculateAntiSquatPercentage({
      rearSvicHeightMm: 110,
      rearSvicLengthMm: 1600,
      wheelbaseMm: 2457,
      cgHeightMm: 455,
      frontTorqueSplitFraction: 0,
    });
    expect(asPct).toBeGreaterThan(30);

    const baseSetup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
    const entryDriver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry' as const, brakingG: 0.9 };

    const zeroAntiDive = solveLoadTransfer(
      { ...baseSetup, frontAntiDivePct: 0 },
      entryDriver,
      'entry'
    );
    const highAntiDive = solveLoadTransfer(
      { ...baseSetup, frontAntiDivePct: 60 },
      entryDriver,
      'entry'
    );

    // Total longitudinal load transfer must remain strictly identical (function of a_x, h_CG, L only)
    expect(highAntiDive.longitudinalLoadTransferN).toBeCloseTo(
      zeroAntiDive.longitudinalLoadTransferN,
      2
    );
    // Front anti-dive reduces front suspension compression only. Rear extension
    // and tyre compression remain; derive the pitch change from that load path.
    const expectedPitchReductionDeg = -zeroAntiDive.longitudinalLoadTransferN * 0.6 /
      (2 * zeroAntiDive.frontWheelRateNmm * baseSetup.wheelbaseMm) * 180 / Math.PI;
    expect(highAntiDive.bodyPitchDeg - zeroAntiDive.bodyPitchDeg)
      .toBeCloseTo(expectedPitchReductionDeg, 8);
  });

  it('models the Over-Lowering Geometry Trap on MacPherson struts (roll center drops faster than CG)', () => {
    const baseSetup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup; // MacPherson front
    const nominalSim = simulateVehicleState(baseSetup, DEFAULT_DRIVER_INPUT);
    const overLoweredSim = simulateVehicleState(
      { ...baseSetup, frontRideHeightDeltaMm: -30, rearRideHeightDeltaMm: -20 },
      DEFAULT_DRIVER_INPUT
    );

    // Lowering the car by 30mm F / 20mm R drops the front roll center underground (< 0 mm)
    expect(overLoweredSim.kinematics.effectiveFrontRollCenterMm).toBeLessThan(0);
    // And actually INCREASES the roll moment arm h_roll = h_CG - z_rc!
    expect(overLoweredSim.kinematics.rollMomentArmMm).toBeGreaterThan(
      nominalSim.kinematics.rollMomentArmMm
    );
    expect(
      overLoweredSim.warnings.some((w) => w.id === 'over_lowered_rc')
    ).toBe(true);
  });

  it('illustrates selected tuning tendencies in the chosen fixture', () => {
    const baseSetup = DRIVETRAIN_ARCHETYPES.MR.defaultSetup;
    const baseSim = simulateVehicleState(baseSetup, DEFAULT_DRIVER_INPUT);

    // 1. Stiffening Front ARB increases FRSR and increases Understeer (higher midScore)
    const stifferFrontArbSim = simulateVehicleState(
      { ...baseSetup, frontArbStiffnessNmPerDeg: baseSetup.frontArbStiffnessNmPerDeg + 200 },
      DEFAULT_DRIVER_INPUT
    );
    expect(stifferFrontArbSim.kinematics.frontRollStiffnessRatio).toBeGreaterThan(
      baseSim.kinematics.frontRollStiffnessRatio
    );
    expect(stifferFrontArbSim.balance.midScore).toBeGreaterThan(baseSim.balance.midScore);

    // 2. Stiffening Rear ARB decreases FRSR and increases Oversteer (lower midScore)
    const stifferRearArbSim = simulateVehicleState(
      { ...baseSetup, rearArbStiffnessNmPerDeg: baseSetup.rearArbStiffnessNmPerDeg + 200 },
      DEFAULT_DRIVER_INPUT
    );
    expect(stifferRearArbSim.kinematics.frontRollStiffnessRatio).toBeLessThan(
      baseSim.kinematics.frontRollStiffnessRatio
    );
    expect(stifferRearArbSim.balance.midScore).toBeLessThan(baseSim.balance.midScore);

    // 3. Adding Front Negative Camber reduces understeer (lowers midScore)
    const moreFrontNegCamberSim = simulateVehicleState(
      { ...baseSetup, frontStaticCamberDeg: -3.2 },
      DEFAULT_DRIVER_INPUT
    );
    expect(moreFrontNegCamberSim.balance.midScore).toBeLessThan(baseSim.balance.midScore);

    // 4. Adding Rear Static Toe-In stabilizes the rear axle (increases entry & mid understeer bias)
    const moreRearToeInSim = simulateVehicleState(
      { ...baseSetup, rearStaticToeDeg: 0.45 },
      DEFAULT_DRIVER_INPUT
    );
    expect(moreRearToeInSim.balance.midScore).toBeGreaterThan(baseSim.balance.midScore);
  });

  it('returns ranked diagnostic recommendations and filters by Trackside vs Shop scope', () => {
    const setup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
    const allRecs = solveDiagnosticRecommendations(setup, DEFAULT_DRIVER_INPUT, {
      symptom: 'understeer',
      phase: 'entry',
      scopeFilter: 'all',
    });
    expect(allRecs.length).toBeGreaterThan(4);

    const tracksideRecs = solveDiagnosticRecommendations(setup, DEFAULT_DRIVER_INPUT, {
      symptom: 'understeer',
      phase: 'entry',
      scopeFilter: 'trackside',
    });
    expect(tracksideRecs.length).toBeGreaterThan(0);
    expect(tracksideRecs.every((r) => r.scope === 'trackside')).toBe(true);

    const shopRecs = solveDiagnosticRecommendations(setup, DEFAULT_DRIVER_INPUT, {
      symptom: 'understeer',
      phase: 'entry',
      scopeFilter: 'shop',
    });
    expect(shopRecs.length).toBeGreaterThan(0);
    expect(shopRecs.every((r) => r.scope === 'shop')).toBe(true);
  });

  it('applies the illustrative tire-width profile consistently', () => {
    const frStaggerSetup = DRIVETRAIN_ARCHETYPES.FR.defaultSetup; // 225mm F / 255mm R
    const frSquareSetup = {
      ...frStaggerSetup,
      frontTireWidthMm: 255,
      rearTireWidthMm: 255,
    };

    const staggerSim = simulateVehicleState(frStaggerSetup, DEFAULT_DRIVER_INPUT);
    const squareSim = simulateVehicleState(frSquareSetup, DEFAULT_DRIVER_INPUT);

    // Outside front tire (FR in left turn) gains peak force capacity and lower grip saturation %
    expect(squareSim.wheels.FR.maxTotalForceN).toBeGreaterThan(
      staggerSim.wheels.FR.maxTotalForceN * 1.04
    );
    expect(squareSim.wheels.FR.gripUtilizationPct).toBeLessThan(
      staggerSim.wheels.FR.gripUtilizationPct
    );
    // Front axle slip angle drops and mid-corner understeer score decreases significantly
    expect(squareSim.kinematics.frontAxleSlipAngleDeg).toBeLessThan(
      staggerSim.kinematics.frontAxleSlipAngleDeg
    );
    expect(squareSim.balance.midScore).toBeLessThan(staggerSim.balance.midScore - 3);
  });

  it('accurately back-solves spring rate K_s for a target Ride Frequency f_n (Hz) and migrates Roll Centers dynamically', () => {
    const setup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
    const solvedFrontKs = solveSpringRateForTargetRideFreqHz(2.4, setup, 'front');
    const solvedRearKs = solveSpringRateForTargetRideFreqHz(2.6, setup, 'rear');

    const sim = simulateVehicleState(
      {
        ...setup,
        frontSpringRateNmm: solvedFrontKs,
        rearSpringRateNmm: solvedRearKs,
      },
      DEFAULT_DRIVER_INPUT
    );

    expect(sim.kinematics.frontNaturalFreqHz).toBeCloseTo(2.4, 1);
    expect(sim.kinematics.rearNaturalFreqHz).toBeCloseTo(2.6, 1);

    // Dynamic roll center migrates under heavy braking dive vs static roll center
    const heavyBrakeDriver = {
      ...DEFAULT_DRIVER_INPUT,
      cornerPhase: 'entry' as const,
      brakingG: 1.05,
      trailBrakeOverlapPct: 90,
    };
    const entrySim = simulateVehicleState(setup, heavyBrakeDriver);
    expect(entrySim.kinematics.effectiveFrontRollCenterMm).toBeLessThan(
      entrySim.kinematics.staticFrontRollCenterMm
    );
  });
});

