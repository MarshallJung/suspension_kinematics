import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DRIVER_INPUT,
  DRIVETRAIN_ARCHETYPES,
  simulateVehicleState,
  solveDiagnosticRecommendations,
} from '../index';
import { useTuningStore } from '../../store/useTuningStore';

describe('Recommendation objectives and scenario consistency', () => {
  it('only ranks understeer/oversteer patches that move the model toward neutral', () => {
    let checked = 0;
    for (const archetype of Object.values(DRIVETRAIN_ARCHETYPES)) {
      for (const phase of ['entry', 'mid', 'exit'] as const) {
        const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: phase };
        const before = simulateVehicleState(archetype.defaultSetup, driver);
        for (const symptom of ['understeer', 'oversteer'] as const) {
          const recommendations = solveDiagnosticRecommendations(archetype.defaultSetup, driver, {
            symptom, phase, scopeFilter: 'all',
          });
          for (const rec of recommendations) {
            if (rec.evaluationBasis === 'candidate_only') {
              expect(rec.predictedImprovement).toBeNull();
              expect(rec.effectivenessScore).toBe(0);
              continue;
            }
            const after = simulateVehicleState(
              { ...archetype.defaultSetup, ...rec.suggestedSetupPatch },
              { ...driver, ...(rec.suggestedDriverPatch ?? {}) }
            );
            expect(Math.abs(after.balance.activeScore)).toBeLessThan(Math.abs(before.balance.activeScore));
            expect(rec.predictedImprovement).toBeGreaterThan(0);
            expect(rec.evaluationBasis).toBe('balance_tendency');
            expect(symptom === 'understeer'
              ? after.balance.activeScore < before.balance.activeScore
              : after.balance.activeScore > before.balance.activeScore).toBe(true);
            checked++;
          }
          expect(recommendations.map((rec) => rec.predictedImprovement)).toEqual(
            recommendations.map((rec) => rec.predictedImprovement).sort((a, b) => (b ?? 0) - (a ?? 0))
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('does not create a hidden bumpy scenario for a smooth-track preview', () => {
    const setup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
    const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid' as const, surfaceCondition: 'smooth' as const };
    const before = simulateVehicleState(setup, driver);
    const recs = solveDiagnosticRecommendations(setup, driver, {
      symptom: 'mid_corner_bump_skittishness', phase: 'mid', scopeFilter: 'all',
    });
    const damping = recs.find((rec) => rec.id === 'bump_soften_hs_damping');
    expect(damping).toBeDefined();
    for (const rec of recs) {
      const after = simulateVehicleState({ ...setup, ...rec.suggestedSetupPatch }, {
        ...driver, ...(rec.suggestedDriverPatch ?? {}),
      });
      expect(after.driver.surfaceCondition).toBe('smooth');
      expect(rec.phaseImpact.midDelta).toBeCloseTo(after.balance.midScore - before.balance.midScore, 1);
      expect(rec.evaluationBasis).toBe('candidate_only');
      expect(rec.effectivenessScore).toBe(0);
      expect(rec.predictedImprovement).toBeNull();
    }
  });

  it('never stiffens or repeats an unchanged HS setting under a softening label', () => {
    const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid' as const };
    for (const clicks of [1, 4, 10]) {
      const setup = { ...DRIVETRAIN_ARCHETYPES.RR.defaultSetup, frontHsBumpClicks: clicks, rearHsBumpClicks: clicks };
      const damping = solveDiagnosticRecommendations(setup, driver, {
        symptom: 'mid_corner_bump_skittishness', phase: 'mid', scopeFilter: 'all',
      }).find((rec) => rec.id === 'bump_soften_hs_damping');
      if (clicks === 1) {
        expect(damping).toBeUndefined();
      } else {
        expect(damping?.suggestedSetupPatch.frontHsBumpClicks).toBeLessThan(clicks);
        expect(damping?.suggestedSetupPatch.rearHsBumpClicks).toBeLessThan(clicks);
      }
    }
  });

  it('does not prescribe another pressure change when the assumed target is already reached', () => {
    const setup = { ...DRIVETRAIN_ARCHETYPES.FR.defaultSetup, frontTirePressurePsi: 32, optimalTirePressurePsi: 32 };
    const recs = solveDiagnosticRecommendations(setup, DEFAULT_DRIVER_INPUT, {
      symptom: 'understeer', phase: 'mid', scopeFilter: 'all',
    });
    expect(recs.some((rec) => rec.id === 'us_optimize_front_tire_pressure')).toBe(false);
  });

  it('returns unranked candidates for symptoms whose dynamic response is not solved', () => {
    for (const symptom of ['slow_turn_in_response', 'instability_braking', 'mid_corner_bump_skittishness'] as const) {
      const recs = solveDiagnosticRecommendations(DRIVETRAIN_ARCHETYPES.RR.defaultSetup, DEFAULT_DRIVER_INPUT, {
        symptom, phase: 'entry', scopeFilter: 'all',
      });
      expect(recs.length).toBeGreaterThan(0);
      expect(recs.every((rec) => rec.evaluationBasis === 'candidate_only' &&
        rec.predictedImprovement === null && rec.effectivenessScore === 0)).toBe(true);
    }
  });

  it('does not rank slip-based balance predictions beyond the tyre envelope', () => {
    const setup = { ...DRIVETRAIN_ARCHETYPES.RR.defaultSetup, peakFrictionCoefficient: 0.3 };
    const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid' as const };
    expect(simulateVehicleState(setup, driver).warnings.some((warning) => warning.id === 'tire_saturation')).toBe(true);
    const recs = solveDiagnosticRecommendations(setup, driver, {
      symptom: 'understeer', phase: 'mid', scopeFilter: 'all',
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.every((rec) => rec.evaluationBasis === 'candidate_only' &&
      rec.predictedImprovement === null && rec.objectiveLabel?.includes('outside'))).toBe(true);
  });

  it('ranks exit-traction candidates against driven-wheel demand rather than balance', () => {
    const setup = { ...DRIVETRAIN_ARCHETYPES.RR.defaultSetup, rearTirePressurePsi: 40 };
    const driver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'exit' as const, lateralG: 0.6, throttleG: 0.3 };
    const before = simulateVehicleState(setup, driver);
    const demandRatio = (sim: ReturnType<typeof simulateVehicleState>) => Math.max(
      ...[sim.wheels.RL, sim.wheels.RR].map((wheel) =>
        Math.hypot(wheel.longitudinalFxN, wheel.lateralFyDemandN) / wheel.maxTotalForceN)
    );
    const recs = solveDiagnosticRecommendations(setup, driver, {
      symptom: 'poor_traction_exit', phase: 'exit', scopeFilter: 'all',
    });
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(rec.evaluationBasis).toBe('traction_reserve_proxy');
      const after = simulateVehicleState({ ...setup, ...rec.suggestedSetupPatch }, {
        ...driver, ...(rec.suggestedDriverPatch ?? {}),
      });
      expect(demandRatio(after)).toBeLessThan(demandRatio(before));
    }
  });
});

describe('Pinned setup comparisons and frequency feedback', () => {
  beforeEach(() => useTuningStore.setState(useTuningStore.getInitialState(), true));

  it('compares and reverts the pinned setup under the current driver scenario', () => {
    const originalSetup = { ...useTuningStore.getState().setup };
    useTuningStore.getState().pinCurrentAsBaseline();
    useTuningStore.getState().updateSetup({ frontSpringRateNmm: originalSetup.frontSpringRateNmm + 20 });
    useTuningStore.getState().updateDriver({ speedKmh: 160, surfaceCondition: 'moderately_bumpy' });
    useTuningStore.getState().setCornerPhase('exit');
    const beforeRevert = useTuningStore.getState();
    expect(beforeRevert.pinnedBaseline?.driver).toEqual(beforeRevert.driver);
    expect(beforeRevert.pinnedBaseline?.sim).toEqual(simulateVehicleState(originalSetup, beforeRevert.driver));
    useTuningStore.getState().revertToBaseline();
    expect(useTuningStore.getState().setup).toEqual(originalSetup);
    expect(useTuningStore.getState().driver).toEqual(beforeRevert.driver);
  });

  it('applies a driver recommendation exactly as previewed and refreshes the setup comparison', () => {
    useTuningStore.getState().setSelectedSymptom('slow_turn_in_response');
    const state = useTuningStore.getState();
    const rec = state.recommendations.find((candidate) => candidate.id === 'us_driver_trail_brake');
    expect(rec).toBeDefined();
    if (!rec) return;
    const preview = simulateVehicleState({ ...state.setup, ...rec.suggestedSetupPatch }, {
      ...state.driver, ...(rec.suggestedDriverPatch ?? {}),
    });
    state.applyRecommendation(rec);
    const applied = useTuningStore.getState();
    expect(applied.currentSim).toEqual(preview);
    expect(applied.pinnedBaseline?.driver).toEqual(applied.driver);
    expect(applied.pinnedBaseline?.sim).toEqual(simulateVehicleState(state.pinnedBaseline!.setup, applied.driver));
  });

  it('reports achieved frequency when an inverse-solver target is limited', () => {
    useTuningStore.getState().setTargetRideFrequencyHz('rear', 3.2);
    const state = useTuningStore.getState();
    expect(state.currentSim.kinematics.rearNaturalFreqHz).toBeLessThan(3.2);
    expect(state.frequencyNotice).toContain('Rear target 3.20 Hz');
    expect(state.frequencyNotice).toContain('Achieved');
    state.updateSetup({ rearSpringRateNmm: 120 });
    expect(useTuningStore.getState().frequencyNotice).toBeNull();
  });
});
