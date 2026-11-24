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
  it('verifies non-saturated understeer and oversteer recommendations across archetypes and phases', () => {
    let understeerChecked = 0;
    let oversteerChecked = 0;
    const baseDriver = { ...DEFAULT_DRIVER_INPUT, lateralG: 0.85 };
    const scenarios = [
      ...Object.values(DRIVETRAIN_ARCHETYPES).map((arch) => ({
        setup: arch.defaultSetup,
        driver: baseDriver,
      })),
      // Stiff rear / soft front setup that cleanly exhibits controllable oversteer
      {
        setup: {
          ...DRIVETRAIN_ARCHETYPES.FR.defaultSetup,
          frontArbStiffnessNmPerDeg: 180,
          rearArbStiffnessNmPerDeg: 850,
          rearStaticCamberDeg: -0.6,
          rearStaticToeDeg: 0,
        },
        driver: baseDriver,
      },
    ];

    for (const scenario of scenarios) {
      for (const phase of ['entry', 'mid', 'exit'] as const) {
        const driver = { ...scenario.driver, cornerPhase: phase };
        const before = simulateVehicleState(scenario.setup, driver);
        for (const symptom of ['understeer', 'oversteer'] as const) {
          const recs = solveDiagnosticRecommendations(scenario.setup, driver, {
            symptom,
            phase,
            scopeFilter: 'all',
          });
          for (const rec of recs) {
            if (rec.evaluationBasis !== 'balance_tendency') continue;
            const after = simulateVehicleState(
              { ...scenario.setup, ...rec.suggestedSetupPatch },
              { ...driver, ...(rec.suggestedDriverPatch ?? {}) }
            );
            expect(Math.abs(after.balance.activeScore)).toBeLessThan(Math.abs(before.balance.activeScore));
            expect(
              symptom === 'understeer'
                ? after.balance.activeScore < before.balance.activeScore
                : after.balance.activeScore > before.balance.activeScore
            ).toBe(true);
            if (symptom === 'understeer') understeerChecked++;
            else oversteerChecked++;
          }
        }
      }
    }
    expect(understeerChecked).toBeGreaterThan(0);
    expect(oversteerChecked).toBeGreaterThan(0);
  });

  it('handles trail-brake overlap cleanly at 25%, 60%, 65% and 80% without inverted labels', () => {
    const setup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
    const rec25 = solveDiagnosticRecommendations(
      setup,
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry', trailBrakeOverlapPct: 25 },
      { symptom: 'slow_turn_in_response', phase: 'entry', scopeFilter: 'all' }
    ).find((r) => r.id === 'us_driver_trail_brake');
    expect(rec25?.suggestedDriverPatch?.trailBrakeOverlapPct).toBe(45);
    expect(rec25?.directionLabel).toContain('Increase');

    const rec60 = solveDiagnosticRecommendations(
      setup,
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry', trailBrakeOverlapPct: 60 },
      { symptom: 'slow_turn_in_response', phase: 'entry', scopeFilter: 'all' }
    ).find((r) => r.id === 'us_driver_trail_brake');
    expect(rec60).toBeUndefined();

    for (const [overlap, expectedNext] of [
      [65, 50],
      [80, 65],
    ] as const) {
      const rec = solveDiagnosticRecommendations(
        setup,
        { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry', trailBrakeOverlapPct: overlap },
        { symptom: 'slow_turn_in_response', phase: 'entry', scopeFilter: 'all' }
      ).find((r) => r.id === 'us_driver_trail_brake');
      expect(rec?.suggestedDriverPatch?.trailBrakeOverlapPct).toBe(expectedNext);
      expect(rec?.directionLabel).toContain('Reduce');
      expect(rec?.directionLabel).not.toContain('Increase');
    }
  });

  it('supports FF and AWD exit traction, prevents entry anti-dive leakage, and excludes FWD rear decel LSD or over-camber fixes', () => {
    const ffDriver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'exit' as const, lateralG: 0.7, throttleG: 0.35 };
    const ffRecs = solveDiagnosticRecommendations(
      { ...DRIVETRAIN_ARCHETYPES.FF.defaultSetup, frontTirePressurePsi: 38 },
      ffDriver,
      { symptom: 'poor_traction_exit', phase: 'exit', scopeFilter: 'all' }
    );
    expect(ffRecs.length).toBeGreaterThan(0);
    expect(ffRecs.every((r) => r.evaluationBasis === 'traction_reserve_proxy')).toBe(true);

    const awdRecs = solveDiagnosticRecommendations(
      { ...DRIVETRAIN_ARCHETYPES.AWD.defaultSetup, rearTirePressurePsi: 38 },
      ffDriver,
      { symptom: 'poor_traction_exit', phase: 'exit', scopeFilter: 'all' }
    );
    expect(awdRecs.length).toBeGreaterThan(0);
    expect(awdRecs.every((r) => r.evaluationBasis === 'traction_reserve_proxy')).toBe(true);

    const entryTractionRecs = solveDiagnosticRecommendations(
      DRIVETRAIN_ARCHETYPES.RR.defaultSetup,
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry', lateralG: 0.8 },
      { symptom: 'poor_traction_exit', phase: 'entry', scopeFilter: 'all' }
    );
    expect(entryTractionRecs.some((r) => r.id === 'anti_geometry_tune_window')).toBe(false);

    const ffEntryInstab = solveDiagnosticRecommendations(
      DRIVETRAIN_ARCHETYPES.FF.defaultSetup,
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry', lateralG: 0.7 },
      { symptom: 'instability_braking', phase: 'entry', scopeFilter: 'all' }
    );
    expect(ffEntryInstab.some((r) => r.id === 'os_increase_lsd_decel_entry')).toBe(false);

    const overCambered = solveDiagnosticRecommendations(
      {
        ...DRIVETRAIN_ARCHETYPES.RR.defaultSetup,
        frontGeometry: 'double_wishbone',
        frontStaticCamberDeg: -3.2,
      },
      { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'mid', lateralG: 0.8 },
      { symptom: 'slow_turn_in_response', phase: 'mid', scopeFilter: 'all' }
    );
    expect(overCambered.some((r) => r.id === 'us_increase_front_neg_camber')).toBe(false);
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
