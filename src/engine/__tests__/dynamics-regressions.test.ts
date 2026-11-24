import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIVER_INPUT, DRIVETRAIN_ARCHETYPES } from '../archetypes';
import { calculateRideRateNmm, degToRad } from '../kinematics';
import { phaseAccelerations, solveLoadTransfer } from '../loadTransfer';
import { evaluatePhaseMechanics, simulateVehicleState } from '../tireModel';
import { clicksToDampingRatio, evaluateTransientDampers } from '../transientDampers';
import { CornerPhase, VehicleSetup } from '../types';

const base = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
const phases: CornerPhase[] = ['entry', 'mid', 'exit'];
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('independent dynamics conservation and operating-limit regressions', () => {
  it('preserves requested lateral force and yaw equilibrium with downforce and differential forces', () => {
    for (const archetype of Object.values(DRIVETRAIN_ARCHETYPES)) {
      for (const phase of phases) for (const turnDirection of ['left', 'right'] as const) {
        for (const aeroClA of [0, 2]) {
          const setup = { ...archetype.defaultSetup, aeroClA };
          const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: phase, turnDirection, lateralG: 0.65 };
          const { wheels } = evaluatePhaseMechanics(setup, driver, phase);
          const fyFront = wheels.FL.lateralFyDemandN + wheels.FR.lateralFyDemandN;
          const fyRear = wheels.RL.lateralFyDemandN + wheels.RR.lateralFyDemandN;
          expect(fyFront + fyRear).toBeCloseTo(setup.massKg * 9.81 * driver.lateralG, 8);
          const a = setup.wheelbaseMm * (1 - setup.frontWeightFraction);
          const b = setup.wheelbaseMm * setup.frontWeightFraction;
          const sign = turnDirection === 'left' ? -1 : 1;
          const yawMoment = sign * (a * fyFront - b * fyRear) +
            setup.frontTrackMm / 2 * (wheels.FL.longitudinalFxN - wheels.FR.longitudinalFxN) +
            setup.rearTrackMm / 2 * (wheels.RL.longitudinalFxN - wheels.RR.longitudinalFxN);
          expect(Math.abs(yawMoment)).toBeLessThan(1e-7);
        }
      }
    }
  });

  it('uses displayed lateral G in each phase and gives zero braking at zero overlap', () => {
    const driver = { ...DEFAULT_DRIVER_INPUT, trailBrakeOverlapPct: 0 };
    expect(phaseAccelerations(driver, 'entry').longitudinalG).toBe(0);
    for (const phase of phases) expect(phaseAccelerations(driver, phase).lateralG).toBe(driver.lateralG);
    const sim = simulateVehicleState(base, { ...driver, cornerPhase: 'entry' });
    expect(sum(Object.values(sim.wheels).map(w => w.longitudinalFxN))).toBe(0);
  });

  it('matches symmetric pitch equilibrium from independently calculated axle deflections', () => {
    const setup: VehicleSetup = { ...base, frontWeightFraction: 0.5,
      frontSpringRateNmm: 100, rearSpringRateNmm: 100,
      frontMotionRatio: 1, rearMotionRatio: 1,
      frontTireWidthMm: 245, rearTireWidthMm: 245,
      frontTirePressurePsi: 32, rearTirePressurePsi: 32,
      frontAntiDivePct: 0, rearAntiSquatPct: 0, aeroClA: 0 };
    const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry' as const,
      lateralG: 0, brakingG: 1, trailBrakeOverlapPct: 100 };
    const load = solveLoadTransfer(setup, driver);
    const transfer = setup.massKg * 9.81 * setup.cgHeightMm / setup.wheelbaseMm;
    const cornerRideRate = calculateRideRateNmm(100, 32, 245);
    const pitchRadians = -transfer / (cornerRideRate * setup.wheelbaseMm);
    expect(degToRad(load.bodyPitchDeg)).toBeCloseTo(pitchRadians, 10);
  });

  it('solves final roll stiffness equilibrium without an unexplained scale factor', () => {
    const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid' as const, lateralG: 0.8 };
    const load = solveLoadTransfer(base, driver);
    expect(load.rollEquilibriumValid).toBe(true);
    const stiffness = load.totalFrontRollStiffnessNmRad + load.totalRearRollStiffnessNmRad;
    const gravityGradient = base.massKg * 9.81 * load.rollMomentArmMm / 1000;
    const frontTireRate = 240 * (0.55 + 0.45 * base.frontTirePressurePsi / 32) *
      (0.82 + 0.18 * base.frontTireWidthMm / 255);
    const rearTireRate = 240 * (0.55 + 0.45 * base.rearTirePressurePsi / 32) *
      (0.82 + 0.18 * base.rearTireWidthMm / 255);
    const frontTireRoll = 0.5 * frontTireRate * 1000 * Math.pow(base.frontTrackMm / 1000, 2);
    const rearTireRoll = 0.5 * rearTireRate * 1000 * Math.pow(base.rearTrackMm / 1000, 2);
    const frontSuspensionRoll = 0.5 * load.frontWheelRateNmm * 1000 * Math.pow(base.frontTrackMm / 1000, 2) +
      base.frontArbStiffnessNmPerDeg * 180 / Math.PI;
    const rearSuspensionRoll = 0.5 * load.rearWheelRateNmm * 1000 * Math.pow(base.rearTrackMm / 1000, 2) +
      base.rearArbStiffnessNmPerDeg * 180 / Math.PI;
    const frontTransmission = frontTireRoll / (frontTireRoll + frontSuspensionRoll);
    const rearTransmission = rearTireRoll / (rearTireRoll + rearSuspensionRoll);
    const cgHeightM = (load.rollAxisAtCgMm + load.rollMomentArmMm) / 1000;
    const lateralMoment = base.massKg * 9.81 * driver.lateralG * (cgHeightM -
      base.frontWeightFraction * frontTransmission * load.effectiveFrontRollCenterMm / 1000 -
      (1 - base.frontWeightFraction) * rearTransmission * load.effectiveRearRollCenterMm / 1000);
    const residual = (stiffness - gravityGradient) * degToRad(load.bodyRollDeg) -
      lateralMoment;
    expect(Math.abs(residual)).toBeLessThan(1e-5);
    // Ground reaction moment includes the first-order lateral CG shift in roll.
    const reaction = load.frontLateralLoadTransferN * base.frontTrackMm / 1000 +
      load.rearLateralLoadTransferN * base.rearTrackMm / 1000;
    const moment = base.massKg * 9.81 *
      (driver.lateralG * cgHeightM + load.rollMomentArmMm / 1000 * degToRad(load.bodyRollDeg));
    expect(reaction).toBeCloseTo(moment, 5);
  });

  it('puts tyre compliance in series with the complete suspension roll reaction', () => {
    const setup = { ...base, frontArbStiffnessNmPerDeg: 0, rearArbStiffnessNmPerDeg: 0 };
    const load = solveLoadTransfer(setup, { ...DEFAULT_DRIVER_INPUT, lateralG: 0.3 });
    expect(load.totalFrontRollStiffnessNmRad).toBeCloseTo(
      0.5 * load.frontRideRateNmm * 1000 * Math.pow(setup.frontTrackMm / 1000, 2), 8);
    const stiffBar = solveLoadTransfer({ ...setup, frontArbStiffnessNmPerDeg: 10000 },
      { ...DEFAULT_DRIVER_INPUT, lateralG: 0.3 });
    const tireRate = 240 * (0.55 + 0.45 * setup.frontTirePressurePsi / 32) *
      (0.82 + 0.18 * setup.frontTireWidthMm / 255);
    const tireRollLimit = 0.5 * tireRate * 1000 * Math.pow(setup.frontTrackMm / 1000, 2);
    expect(stiffBar.totalFrontRollStiffnessNmRad).toBeLessThan(tireRollLimit);
  });

  it('does not let anti-squat alter pure lateral travel, camber or loads at zero drive force', () => {
    const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid' as const, lateralG: 0.8 };
    const low = evaluatePhaseMechanics({ ...base, rearAntiSquatPct: 0, aeroClA: 0 }, driver, 'mid');
    const high = evaluatePhaseMechanics({ ...base, rearAntiSquatPct: 80, aeroClA: 0 }, driver, 'mid');
    for (const id of ['FL', 'FR', 'RL', 'RR'] as const) {
      expect(high.wheels[id].dynamicFzN).toBe(low.wheels[id].dynamicFzN);
      expect(high.wheels[id].suspensionDeflectionMm).toBe(low.wheels[id].suspensionDeflectionMm);
      expect(high.wheels[id].dynamicCamberDeg).toBe(low.wheels[id].dynamicCamberDeg);
    }
  });

  it('keeps body attitude consistent with suspension travel plus full tyre deflection', () => {
    for (const anti of [0, 40, 80]) for (const phase of phases) {
      const setup = { ...base, frontAntiDivePct: anti, rearAntiSquatPct: anti };
      const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: phase, lateralG: 0.5 };
      const load = solveLoadTransfer(setup, driver);
      const frontKt = 240 * (0.55 + 0.45 * setup.frontTirePressurePsi / 32) *
        (0.82 + 0.18 * setup.frontTireWidthMm / 255);
      const rearKt = 240 * (0.55 + 0.45 * setup.rearTirePressurePsi / 32) *
        (0.82 + 0.18 * setup.rearTireWidthMm / 255);
      const frontCompression = (load.wheelDeflectionMm.FL + load.wheelDeflectionMm.FR) / 2 +
        (load.wheelDynamicFzN.FL + load.wheelDynamicFzN.FR - load.frontStaticAxleFzN) / (2 * frontKt);
      const rearCompression = (load.wheelDeflectionMm.RL + load.wheelDeflectionMm.RR) / 2 +
        (load.wheelDynamicFzN.RL + load.wheelDynamicFzN.RR - load.rearStaticAxleFzN) / (2 * rearKt);
      expect(degToRad(load.bodyPitchDeg)).toBeCloseTo(
        (rearCompression - frontCompression) / setup.wheelbaseMm, 10);
      const frontSpringRoll = (load.wheelDeflectionMm.FR - load.wheelDeflectionMm.FL) / setup.frontTrackMm;
      const frontTireRoll = (load.wheelDynamicFzN.FR - load.wheelDynamicFzN.FL) /
        (frontKt * setup.frontTrackMm);
      expect(frontSpringRoll + frontTireRoll).toBeCloseTo(degToRad(load.bodyRollDeg), 10);
    }
  });

  it('has no lateral reserve when longitudinal demand exceeds the assumed friction envelope', () => {
    const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry' as const,
      lateralG: 0.8, brakingG: 1.2, trailBrakeOverlapPct: 100 };
    const { wheels } = evaluatePhaseMechanics({ ...base, peakFrictionCoefficient: 0.3 }, driver, 'entry');
    expect(Object.values(wheels).some(w => Math.abs(w.longitudinalFxN) > w.maxTotalForceN)).toBe(true);
    for (const wheel of Object.values(wheels)) {
      if (Math.abs(wheel.longitudinalFxN) >= wheel.maxTotalForceN) {
        expect(wheel.maxLateralFyAvailableN).toBe(0);
      } else {
        expect(Math.pow(wheel.maxLateralFyAvailableN, 2) + Math.pow(wheel.longitudinalFxN, 2))
          .toBeCloseTo(Math.pow(wheel.maxTotalForceN, 2), 6);
      }
      expect(Number.isFinite(wheel.slipAngleDeg)).toBe(true);
    }
  });

  it('exposes lift with zero capacity, without inventing vertical force', () => {
    const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry' as const,
      lateralG: 1.5, brakingG: 1.2, trailBrakeOverlapPct: 100 };
    for (const archetype of Object.values(DRIVETRAIN_ARCHETYPES)) {
      const sim = simulateVehicleState(archetype.defaultSetup, driver);
      const wheels = Object.values(sim.wheels);
      const expected = archetype.defaultSetup.massKg * 9.81 +
        0.5 * 1.225 * archetype.defaultSetup.aeroClA * Math.pow(driver.speedKmh / 3.6, 2);
      expect(sum(wheels.map(w => w.dynamicFzN))).toBeCloseTo(expected, 8);
      for (const wheel of wheels) {
        expect(wheel.dynamicFzN).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(wheel.gripUtilizationPct)).toBe(true);
        if (wheel.dynamicFzN === 0) expect(wheel.maxTotalForceN).toBe(0);
      }
      if (wheels.some(w => w.dynamicFzN === 0)) expect(sim.warnings.some(w => w.id === 'wheel_lift')).toBe(true);
    }
  });

  it('mirrors normal loads and requested forces for left and right turns', () => {
    for (const phase of phases) {
      const left = evaluatePhaseMechanics(base, { ...DEFAULT_DRIVER_INPUT, turnDirection: 'left' }, phase);
      const right = evaluatePhaseMechanics(base, { ...DEFAULT_DRIVER_INPUT, turnDirection: 'right' }, phase);
      for (const [a, b] of [['FL', 'FR'], ['FR', 'FL'], ['RL', 'RR'], ['RR', 'RL']] as const) {
        expect(left.wheels[a].dynamicFzN).toBeCloseTo(right.wheels[b].dynamicFzN, 8);
        expect(left.wheels[a].lateralFyDemandN).toBeCloseTo(right.wheels[b].lateralFyDemandN, 8);
        expect(left.wheels[a].longitudinalFxN).toBeCloseTo(right.wheels[b].longitudinalFxN, 8);
      }
    }
  });

  it('maintains strictly monotonic and concave tire peak force across load ratios', () => {
    // Use stiff springs & positive nominal ride height to isolate tire load sensitivity from over-lowering camber artifacts
    const setup: VehicleSetup = {
      ...base,
      frontSpringRateNmm: 320,
      rearSpringRateNmm: 320,
      frontMotionRatio: 1.0,
      rearMotionRatio: 1.0,
      frontRideHeightDeltaMm: 20,
      rearRideHeightDeltaMm: 20,
      frontStaticCamberDeg: 0,
      rearStaticCamberDeg: 0,
      frontTirePressurePsi: base.optimalTirePressurePsi,
      rearTirePressurePsi: base.optimalTirePressurePsi,
      aeroFrontBalancePct: 50,
    };
    const fMaxAt = (aeroClA: number, speedKmh: number) => {
      const sim = simulateVehicleState(
        { ...setup, aeroClA },
        { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid', lateralG: 0, brakingG: 0, throttleG: 0, speedKmh }
      );
      return { fz: sim.wheels.FR.dynamicFzN, fMax: sim.wheels.FR.maxTotalForceN };
    };
    const samples = [0, 0.5, 1.5, 3, 5, 7, 9, 12, 16].map((clA) => fMaxAt(clA, 220));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].fz).toBeGreaterThan(samples[i - 1].fz);
      expect(samples[i].fMax).toBeGreaterThan(samples[i - 1].fMax);
      const slopePrev =
        i === 1
          ? samples[1].fMax / samples[1].fz
          : (samples[i - 1].fMax - samples[i - 2].fMax) / (samples[i - 1].fz - samples[i - 2].fz);
      const slopeCurr = (samples[i].fMax - samples[i - 1].fMax) / (samples[i].fz - samples[i - 1].fz);
      expect(slopeCurr).toBeLessThan(slopePrev);
    }

    // Zero load sensitivity produces exact constant baseLoadSensitiveMu = peakFrictionCoefficient under heavy downforce
    const zeroSens = simulateVehicleState(
      { ...setup, tireLoadSensitivityExponent: 0, aeroClA: 4 },
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid', lateralG: 0, brakingG: 0, throttleG: 0, speedKmh: 200 }
    );
    const camberFactor = 1 - 0.012 * Math.pow(zeroSens.wheels.FR.dynamicCamberDeg, 2);
    expect(zeroSens.wheels.FR.effectiveFrictionMu).toBeCloseTo(
      setup.peakFrictionCoefficient * camberFactor,
      10
    );
  });

  it('preserves strict left/right symmetry, zero roll, zero jacking and zero balance bias at 0g lateral', () => {
    for (const archetype of Object.values(DRIVETRAIN_ARCHETYPES)) {
      for (const phase of phases) {
        const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: phase, lateralG: 0 };
        const sim = simulateVehicleState(archetype.defaultSetup, driver);
        expect(sim.kinematics.bodyRollDeg).toBe(0);
        expect(sim.kinematics.frontJackingForceN).toBe(0);
        expect(sim.kinematics.rearJackingForceN).toBe(0);
        expect(sim.kinematics.understeerGradientDegPerG).toBe(0);
        expect(sim.balance.activeScore).toBe(0);
        expect(sim.wheels.FL.dynamicFzN).toBeCloseTo(sim.wheels.FR.dynamicFzN, 9);
        expect(sim.wheels.RL.dynamicFzN).toBeCloseTo(sim.wheels.RR.dynamicFzN, 9);
        expect(sim.wheels.FL.effectiveFrictionMu).toBeCloseTo(sim.wheels.FR.effectiveFrictionMu, 9);
        expect(sim.wheels.RL.effectiveFrictionMu).toBeCloseTo(sim.wheels.RR.effectiveFrictionMu, 9);
        expect(sim.wheels.FL.maxTotalForceN).toBeCloseTo(sim.wheels.FR.maxTotalForceN, 9);
        expect(sim.wheels.FL.camberGainFromSteerDeg).toBe(0);
        expect(sim.wheels.FR.camberGainFromSteerDeg).toBe(0);
      }
    }
  });

  it('computes differential jacking force and restricts LSD decel lock to driven axles and grounded wheels', () => {
    const load = solveLoadTransfer(base, { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid', lateralG: 0.9 });
    const frontExpectedJack =
      load.frontStaticAxleFzN *
      0.9 *
      ((2 * load.frontLateralLoadTransferN) / (load.wheelDynamicFzN.FL + load.wheelDynamicFzN.FR)) *
      (load.effectiveFrontRollCenterMm / (0.5 * base.frontTrackMm));
    expect(load.frontJackingForceN).toBeCloseTo(frontExpectedJack, 8);
    expect(Math.abs(load.frontJackingForceN)).toBeLessThan(
      Math.abs(load.frontStaticAxleFzN * 0.9 * (load.effectiveFrontRollCenterMm / (0.5 * base.frontTrackMm)))
    );

    // RR has frontTorqueSplitPct = 0: front hydraulic braking must remain 50/50 even at 90% decel lock
    const rrEntry = evaluatePhaseMechanics(
      { ...base, lsdDecelLockPct: 90 },
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry', lateralG: 0.7, brakingG: 0.8, trailBrakeOverlapPct: 100 },
      'entry'
    );
    expect(rrEntry.wheels.FL.longitudinalFxN).toBeCloseTo(rrEntry.wheels.FR.longitudinalFxN, 8);
    expect(Math.abs(rrEntry.wheels.RR.longitudinalFxN)).toBeGreaterThan(Math.abs(rrEntry.wheels.RL.longitudinalFxN));

    // FF at heavy entry lifts RL (Fz = 0): lifted wheel must carry zero longitudinal Fx and rear grounded share is 100%
    const ffLift = evaluatePhaseMechanics(
      DRIVETRAIN_ARCHETYPES.FF.defaultSetup,
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry', lateralG: 1.4, brakingG: 1.0, trailBrakeOverlapPct: 100 },
      'entry'
    );
    expect(ffLift.wheels.RL.dynamicFzN).toBe(0);
    expect(ffLift.wheels.RL.longitudinalFxN).toBe(0);
    expect(ffLift.wheels.RR.longitudinalFxN).toBeLessThan(0);
  });

  it('handles axle lift, extreme aero lift, failed roll equilibrium without inverted transfer, and exit anti-squat invariance', () => {
    // Extreme braking triggers axleLiftRequested while conserving total normal load
    const axleLiftLoad = solveLoadTransfer(
      { ...base, cgHeightMm: 950, wheelbaseMm: 1600, aeroClA: 0 },
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry', lateralG: 0.2, brakingG: 1.2, trailBrakeOverlapPct: 100 }
    );
    expect(axleLiftLoad.axleLiftRequested).toBe(true);
    expect(axleLiftLoad.wheelLiftRequested).toBe(true);
    expect(sum(Object.values(axleLiftLoad.wheelDynamicFzN))).toBeCloseTo(axleLiftLoad.totalStaticWeightN, 6);

    // Extreme negative aero lift (upward lift > weight) never produces negative wheel loads
    const aeroLiftLoad = solveLoadTransfer(
      { ...base, aeroClA: -6.0 },
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid', speedKmh: 300, lateralG: 0.5 }
    );
    expect(aeroLiftLoad.axleLiftRequested).toBe(true);
    for (const fz of Object.values(aeroLiftLoad.wheelDynamicFzN)) {
      expect(fz).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(fz)).toBe(true);
    }

    // Min-stiffness + over-lowered + max-lateral input triggers roll_equilibrium without inverting FL > FR
    const minStiffSim = simulateVehicleState(
      {
        ...base,
        frontSpringRateNmm: 25,
        rearSpringRateNmm: 25,
        frontMotionRatio: 0.55,
        rearMotionRatio: 0.55,
        frontArbStiffnessNmPerDeg: 80,
        rearArbStiffnessNmPerDeg: 60,
        frontRideHeightDeltaMm: -35,
        rearRideHeightDeltaMm: -35,
        cgHeightMm: 580,
      },
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid', lateralG: 1.4, speedKmh: 0 }
    );
    expect(minStiffSim.warnings.some((w) => w.id === 'roll_equilibrium')).toBe(true);
    expect(minStiffSim.kinematics.bodyRollDeg).toBeGreaterThan(0);
    expect(minStiffSim.wheels.FR.dynamicFzN).toBeGreaterThanOrEqual(minStiffSim.wheels.FL.dynamicFzN);

    // Single-axle wheel lift keeps totalLateralLoadTransferDistributionFront consistent with clamped transfers
    const singleLift = solveLoadTransfer(
      DRIVETRAIN_ARCHETYPES.FF.defaultSetup,
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry', lateralG: 1.3, brakingG: 0.9, trailBrakeOverlapPct: 100 }
    );
    expect(singleLift.wheelLiftRequested).toBe(true);
    expect(singleLift.totalLateralLoadTransferDistributionFront).toBeCloseTo(
      singleLift.frontLateralLoadTransferN /
        (singleLift.frontLateralLoadTransferN + singleLift.rearLateralLoadTransferN),
      10
    );

    // Exit anti-squat invariance on axle vertical loads while reducing squat pitch
    const exitDriver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'exit' as const, throttleG: 0.75, lateralG: 0.5 };
    const lowAs = solveLoadTransfer({ ...base, rearAntiSquatPct: 0 }, exitDriver, 'exit');
    const highAs = solveLoadTransfer({ ...base, rearAntiSquatPct: 60 }, exitDriver, 'exit');
    expect(highAs.longitudinalLoadTransferN).toBeCloseTo(lowAs.longitudinalLoadTransferN, 8);
    expect(highAs.wheelDynamicFzN.FL + highAs.wheelDynamicFzN.FR).toBeCloseTo(
      lowAs.wheelDynamicFzN.FL + lowAs.wheelDynamicFzN.FR,
      8
    );
    expect(highAs.wheelDynamicFzN.RL + highAs.wheelDynamicFzN.RR).toBeCloseTo(
      lowAs.wheelDynamicFzN.RL + lowAs.wheelDynamicFzN.RR,
      8
    );
    expect(highAs.bodyPitchDeg).toBeLessThan(lowAs.bodyPitchDeg);

    // At 0g lateral, all 4 wheel loads are strictly invariant to rearAntiSquatPct
    const straightExit = { ...exitDriver, lateralG: 0 };
    const lowAsStraight = solveLoadTransfer({ ...base, rearAntiSquatPct: 0 }, straightExit, 'exit');
    const highAsStraight = solveLoadTransfer({ ...base, rearAntiSquatPct: 60 }, straightExit, 'exit');
    expect(highAsStraight.wheelDynamicFzN).toEqual(lowAsStraight.wheelDynamicFzN);
  });

  it('bounds transient damper shifts and bump compliance within documented envelopes', () => {
    expect(clicksToDampingRatio(10, 120, 80)).toBeLessThan(clicksToDampingRatio(10, 60, 80));

    const mid = evaluateTransientDampers(
      { ...base, frontLsBumpClicks: 20, rearLsReboundClicks: 1 },
      { ...DEFAULT_DRIVER_INPUT, driverSmoothnessPct: 0, surfaceCondition: 'curbs_and_bumps' },
      80,
      100,
      'mid'
    );
    expect(mid.transientFrontLoadTransferShift).toBe(0);
    expect(mid.frontBumpComplianceFactor).toBeGreaterThanOrEqual(0.78);
    expect(mid.frontBumpComplianceFactor).toBeLessThanOrEqual(1.0);

    const extremeEntry = evaluateTransientDampers(
      { ...base, frontLsBumpClicks: 20, frontLsReboundClicks: 20, rearLsReboundClicks: 1, frontHsBumpClicks: 20 },
      { ...DEFAULT_DRIVER_INPUT, driverSmoothnessPct: 0, surfaceCondition: 'curbs_and_bumps' },
      60,
      80,
      'entry'
    );
    expect(extremeEntry.transientFrontLoadTransferShift).toBeLessThanOrEqual(0.12);
    expect(extremeEntry.transientFrontLoadTransferShift).toBeGreaterThanOrEqual(-0.12);
    expect(extremeEntry.frontBumpComplianceFactor).toBeGreaterThanOrEqual(0.78);
  });
});
