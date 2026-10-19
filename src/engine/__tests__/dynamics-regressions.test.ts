import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIVER_INPUT, DRIVETRAIN_ARCHETYPES } from '../archetypes';
import { calculateRideRateNmm, degToRad } from '../kinematics';
import { phaseAccelerations, solveLoadTransfer } from '../loadTransfer';
import { evaluatePhaseMechanics, simulateVehicleState } from '../tireModel';
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
});
