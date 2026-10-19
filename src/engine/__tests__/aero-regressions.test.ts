import { describe, expect, it } from 'vitest';
import { aeroClAFromReferenceDownforce, calculateAeroDownforceN } from '../aero';
import { DEFAULT_DRIVER_INPUT, DRIVETRAIN_ARCHETYPES } from '../archetypes';
import { mphToKmh, newtonsToLbs } from '../kinematics';
import { solveLoadTransfer } from '../loadTransfer';
import { evaluatePhaseMechanics, simulateVehicleState } from '../tireModel';

const NEWTONS_PER_LB = 4.4482216152605;
const base = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;

describe('user-rated aero load and corner-speed regressions', () => {
  it('converts a force rating back to the same force at its reference speed', () => {
    for (const referenceMph of [40, 100, 177, 200]) for (const ratingLb of [0, 100, 500, 1500]) {
      const referenceKmh = mphToKmh(referenceMph);
      const area = aeroClAFromReferenceDownforce(ratingLb * NEWTONS_PER_LB, referenceKmh);
      expect(calculateAeroDownforceN(area, referenceKmh)).toBeCloseTo(ratingLb * NEWTONS_PER_LB, 9);
    }
  });

  it('gives 16% of the 100 mph load at 40 mph and 225% at 150 mph', () => {
    const area = aeroClAFromReferenceDownforce(500 * NEWTONS_PER_LB, mphToKmh(100));
    expect(newtonsToLbs(calculateAeroDownforceN(area, mphToKmh(40)))).toBeCloseTo(80, 5);
    expect(newtonsToLbs(calculateAeroDownforceN(area, mphToKmh(150)))).toBeCloseTo(1125, 5);
    expect(calculateAeroDownforceN(area, 0)).toBe(0);
    expect(calculateAeroDownforceN(0, mphToKmh(150))).toBe(0);
  });

  it('keeps a rating invariant when expressed at a different reference speed', () => {
    const originalArea = aeroClAFromReferenceDownforce(500 * NEWTONS_PER_LB, mphToKmh(100));
    const forceAtNewReference = calculateAeroDownforceN(originalArea, mphToKmh(177));
    expect(aeroClAFromReferenceDownforce(forceAtNewReference, mphToKmh(177))).toBeCloseTo(originalArea, 12);
  });

  it('allocates the rated force to all four wheels and selected axle balance without adding inertial force', () => {
    const area = aeroClAFromReferenceDownforce(500 * NEWTONS_PER_LB, mphToKmh(100));
    for (const mph of [0, 40, 100, 150]) for (const frontPct of [0, 40, 100]) {
      const setup = { ...base, aeroClA: area, aeroFrontBalancePct: frontPct };
      const driver = { ...DEFAULT_DRIVER_INPUT, speedKmh: mphToKmh(mph), cornerPhase: 'mid' as const, lateralG: 0.5 };
      const load = solveLoadTransfer(setup, driver);
      const aeroN = 500 * NEWTONS_PER_LB * Math.pow(mph / 100, 2);
      const { wheels } = evaluatePhaseMechanics(setup, driver, 'mid');
      expect(load.wheelDynamicFzN.FL + load.wheelDynamicFzN.FR).toBeCloseTo(
        setup.massKg * 9.81 * setup.frontWeightFraction + aeroN * frontPct / 100, 7);
      expect(load.wheelDynamicFzN.RL + load.wheelDynamicFzN.RR).toBeCloseTo(
        setup.massKg * 9.81 * (1 - setup.frontWeightFraction) + aeroN * (1 - frontPct / 100), 7);
      expect(Object.values(wheels).reduce((sum, wheel) => sum + wheel.lateralFyDemandN, 0))
        .toBeCloseTo(setup.massKg * 9.81 * driver.lateralG, 8);
      for (const wheel of Object.values(wheels)) expect(Number.isFinite(wheel.dynamicFzN)).toBe(true);
    }
  });

  it('flags a stationary corner request without inventing aero load', () => {
    const sim = simulateVehicleState(base, { ...DEFAULT_DRIVER_INPUT, speedKmh: 0 });
    expect(sim.kinematics.totalAeroDownforceN).toBe(0);
    expect(sim.warnings.some(w => w.id === 'stationary_force_request')).toBe(true);
    const stationary = simulateVehicleState(base, { ...DEFAULT_DRIVER_INPUT, speedKmh: 0, lateralG: 0, brakingG: 0, throttleG: 0 });
    expect(stationary.warnings.some(w => w.id === 'stationary_force_request')).toBe(false);
  });

  it('rejects a force rating that cannot define a finite downforce coefficient', () => {
    expect(() => aeroClAFromReferenceDownforce(-1, 100)).toThrow(RangeError);
    expect(() => aeroClAFromReferenceDownforce(100, 0)).toThrow(RangeError);
    expect(() => aeroClAFromReferenceDownforce(Infinity, 100)).toThrow(RangeError);
  });
});
