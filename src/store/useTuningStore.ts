import { create } from 'zustand';
import {
  ALIGNMENT_PRESETS,
  AdjustmentScope,
  AlignmentPresetId,
  CornerPhase,
  DEFAULT_DRIVER_INPUT,
  DRIVETRAIN_ARCHETYPES,
  DriverInputState,
  DrivetrainArchetype,
  HandlingSymptomType,
  RIDE_FREQUENCY_PRESETS,
  RankedAdjustmentRecommendation,
  RideFrequencyPresetId,
  SimulationResult,
  SuspensionGeometryType,
  TireSetupPresetId,
  VehicleSetup,
  WheelId,
  simulateVehicleState,
  solveDiagnosticRecommendations,
  solveRideFrequencyTarget,
} from '../engine';
import {
  PersistedTuningState,
  loadPersistedState,
  savePersistedState,
} from './persistence';

export type AppModeTab = 'wizard' | 'sandbox';
export type ThemeMode = 'dark' | 'daylight';

export interface TuningStoreState {
  activeTab: AppModeTab;
  themeMode: ThemeMode;
  scopeFilter: 'all' | AdjustmentScope;

  // Diagnostic Wizard & comparison state
  selectedSymptom: HandlingSymptomType;
  selectedWheel: WheelId | null;
  previewRecommendationId: string | null;
  viewingBaseline: boolean;

  // Current Setup & Driver Input
  setup: VehicleSetup;
  driver: DriverInputState;
  currentSim: SimulationResult;
  frequencyNotice: string | null;

  // Pinned setup, evaluated under the current driver scenario for fair comparison
  pinnedBaseline: {
    setup: VehicleSetup;
    driver: DriverInputState;
    sim: SimulationResult;
  } | null;

  // Computed recommendations
  recommendations: RankedAdjustmentRecommendation[];

  // Actions
  setActiveTab: (tab: AppModeTab) => void;
  toggleThemeMode: () => void;
  setScopeFilter: (scope: 'all' | AdjustmentScope) => void;
  setSelectedSymptom: (symptom: HandlingSymptomType) => void;
  setCornerPhase: (phase: CornerPhase) => void;
  setSelectedWheel: (wheel: WheelId | null) => void;
  setViewingBaseline: (viewing: boolean) => void;
  toggleViewingBaseline: () => void;

  selectArchetype: (drivetrain: DrivetrainArchetype) => void;
  setFrontGeometry: (geom: SuspensionGeometryType) => void;
  setRearGeometry: (geom: SuspensionGeometryType) => void;

  applyAlignmentPreset: (presetId: AlignmentPresetId) => void;
  applyTireSetupPreset: (presetId: TireSetupPresetId) => void;
  applyRideFrequencyPreset: (presetId: RideFrequencyPresetId) => void;
  setTargetRideFrequencyHz: (axle: 'front' | 'rear', targetHz: number) => void;

  updateSetup: (patch: Partial<VehicleSetup>) => void;
  updateDriver: (patch: Partial<DriverInputState>) => void;

  pinCurrentAsBaseline: () => void;
  clearBaseline: () => void;
  revertToBaseline: () => void;
  resetToArchetypeDefault: () => void;

  setPreviewRecommendationId: (id: string | null) => void;
  applyRecommendation: (rec: RankedAdjustmentRecommendation) => void;
}

const persisted = loadPersistedState();
const initialSetup = persisted?.setup
  ? { ...persisted.setup }
  : { ...DRIVETRAIN_ARCHETYPES.RR.defaultSetup };
const initialDriver: DriverInputState = persisted?.driver
  ? { ...persisted.driver }
  : { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry' as CornerPhase };
const initialScopeFilter = persisted?.scopeFilter ?? 'all';
const initialSim = simulateVehicleState(initialSetup, initialDriver);
const initialBaselineSetup =
  persisted && 'baselineSetup' in persisted
    ? persisted.baselineSetup ?? null
    : { ...initialSetup };
const initialPinnedBaseline = initialBaselineSetup
  ? {
      setup: { ...initialBaselineSetup },
      driver: { ...initialDriver },
      sim: simulateVehicleState(initialBaselineSetup, initialDriver),
    }
  : null;
const initialRecs = solveDiagnosticRecommendations(initialSetup, initialDriver, {
  symptom: 'understeer',
  phase: initialDriver.cornerPhase,
  scopeFilter: initialScopeFilter,
});

export const useTuningStore = create<TuningStoreState>((set, get) => ({
  activeTab: persisted?.activeTab ?? 'sandbox',
  themeMode: persisted?.themeMode ?? 'dark',
  scopeFilter: initialScopeFilter,

  selectedSymptom: 'understeer',
  selectedWheel: 'FR',
  previewRecommendationId: null,
  viewingBaseline: false,

  setup: initialSetup,
  driver: initialDriver,
  currentSim: initialSim,
  frequencyNotice: null,
  pinnedBaseline: initialPinnedBaseline,
  recommendations: initialRecs,

  setActiveTab: (activeTab) => set({ activeTab, previewRecommendationId: null }),

  toggleThemeMode: () =>
    set((state) => ({
      themeMode: state.themeMode === 'dark' ? 'daylight' : 'dark',
    })),

  setScopeFilter: (scopeFilter) => {
    const { setup, driver, selectedSymptom } = get();
    const recommendations = solveDiagnosticRecommendations(setup, driver, {
      symptom: selectedSymptom,
      phase: driver.cornerPhase,
      scopeFilter,
    });
    set({ scopeFilter, recommendations, previewRecommendationId: null });
  },

  setSelectedSymptom: (selectedSymptom) => {
    const { setup, driver, scopeFilter } = get();
    const recommendations = solveDiagnosticRecommendations(setup, driver, {
      symptom: selectedSymptom,
      phase: driver.cornerPhase,
      scopeFilter,
    });
    set({ selectedSymptom, recommendations, previewRecommendationId: null });
  },

  setCornerPhase: (cornerPhase) => {
    const { setup, driver, selectedSymptom, scopeFilter, pinnedBaseline } = get();
    const nextDriver: DriverInputState = { ...driver, cornerPhase };
    const currentSim = simulateVehicleState(setup, nextDriver);
    const recommendations = solveDiagnosticRecommendations(setup, nextDriver, {
      symptom: selectedSymptom,
      phase: cornerPhase,
      scopeFilter,
    });
    const nextBaseline = pinnedBaseline
      ? {
          ...pinnedBaseline,
          driver: { ...nextDriver },
          sim: simulateVehicleState(pinnedBaseline.setup, nextDriver),
        }
      : null;

    set({
      driver: nextDriver,
      currentSim,
      recommendations,
      pinnedBaseline: nextBaseline,
      previewRecommendationId: null,
    });
  },

  setSelectedWheel: (selectedWheel) => set({ selectedWheel }),

  setViewingBaseline: (viewing) => {
    const hasBaseline = Boolean(get().pinnedBaseline);
    set({
      viewingBaseline: hasBaseline ? viewing : false,
      ...(viewing && hasBaseline ? { previewRecommendationId: null } : {}),
    });
  },

  toggleViewingBaseline: () => {
    const { viewingBaseline, pinnedBaseline } = get();
    if (!pinnedBaseline) {
      if (viewingBaseline) set({ viewingBaseline: false });
      return;
    }
    const nextViewing = !viewingBaseline;
    set({
      viewingBaseline: nextViewing,
      ...(nextViewing ? { previewRecommendationId: null } : {}),
    });
  },

  selectArchetype: (drivetrain) => {
    const preset = DRIVETRAIN_ARCHETYPES[drivetrain];
    const nextSetup = { ...preset.defaultSetup };
    const { driver, selectedSymptom, scopeFilter } = get();
    const currentSim = simulateVehicleState(nextSetup, driver);
    const recommendations = solveDiagnosticRecommendations(nextSetup, driver, {
      symptom: selectedSymptom,
      phase: driver.cornerPhase,
      scopeFilter,
    });
    set({
      setup: nextSetup,
      currentSim,
      frequencyNotice: null,
      pinnedBaseline: {
        setup: nextSetup,
        driver,
        sim: currentSim,
      },
      recommendations,
      previewRecommendationId: null,
      viewingBaseline: false,
    });
  },

  setFrontGeometry: (frontGeometry) => {
    get().updateSetup({ frontGeometry });
  },

  setRearGeometry: (rearGeometry) => {
    get().updateSetup({ rearGeometry });
  },

  applyAlignmentPreset: (presetId) => {
    const preset = ALIGNMENT_PRESETS[presetId];
    get().updateSetup({
      frontStaticCamberDeg: preset.frontStaticCamberDeg,
      rearStaticCamberDeg: preset.rearStaticCamberDeg,
      frontStaticToeDeg: preset.frontStaticToeDeg,
      rearStaticToeDeg: preset.rearStaticToeDeg,
    });
  },

  applyTireSetupPreset: (presetId) => {
    const { setup } = get();
    const arch = DRIVETRAIN_ARCHETYPES[setup.drivetrain];
    if (presetId === 'oem_stagger') {
      get().updateSetup({
        frontTireWidthMm: arch.oemFrontTireWidthMm,
        rearTireWidthMm: arch.oemRearTireWidthMm,
      });
    } else {
      get().updateSetup({
        frontTireWidthMm: arch.squareTireWidthMm,
        rearTireWidthMm: arch.squareTireWidthMm,
      });
    }
  },

  applyRideFrequencyPreset: (presetId) => {
    const { setup } = get();
    const preset = RIDE_FREQUENCY_PRESETS[presetId];
    const front = solveRideFrequencyTarget(preset.targetFrontHz, setup, 'front');
    const rear = solveRideFrequencyTarget(preset.targetRearHz, setup, 'rear');
    get().updateSetup({
      frontSpringRateNmm: front.springRateNmm,
      rearSpringRateNmm: rear.springRateNmm,
    });
    set({ frequencyNotice: [frequencyLimitNotice('Front', front), frequencyLimitNotice('Rear', rear)]
      .filter(Boolean).join(' ') || null });
  },

  setTargetRideFrequencyHz: (axle, targetHz) => {
    const { setup } = get();
    const result = solveRideFrequencyTarget(targetHz, setup, axle);
    get().updateSetup(axle === 'front'
      ? { frontSpringRateNmm: result.springRateNmm }
      : { rearSpringRateNmm: result.springRateNmm });
    set({ frequencyNotice: frequencyLimitNotice(axle === 'front' ? 'Front' : 'Rear', result) });
  },

  updateSetup: (patch) => {
    const { setup, driver, selectedSymptom, scopeFilter } = get();
    const nextSetup: VehicleSetup = { ...setup, ...patch };
    const currentSim = simulateVehicleState(nextSetup, driver);
    const recommendations = solveDiagnosticRecommendations(nextSetup, driver, {
      symptom: selectedSymptom,
      phase: driver.cornerPhase,
      scopeFilter,
    });
    set({
      setup: nextSetup,
      currentSim,
      frequencyNotice: null,
      recommendations,
      previewRecommendationId: null,
      viewingBaseline: false,
    });
  },

  updateDriver: (patch) => {
    const { setup, driver, selectedSymptom, scopeFilter, pinnedBaseline } = get();
    const nextDriver: DriverInputState = { ...driver, ...patch };
    const currentSim = simulateVehicleState(setup, nextDriver);
    const recommendations = solveDiagnosticRecommendations(setup, nextDriver, {
      symptom: selectedSymptom,
      phase: nextDriver.cornerPhase,
      scopeFilter,
    });
    const nextBaseline = pinnedBaseline
      ? {
          ...pinnedBaseline,
          driver: nextDriver,
          sim: simulateVehicleState(pinnedBaseline.setup, nextDriver),
        }
      : null;

    set({
      driver: nextDriver,
      currentSim,
      recommendations,
      pinnedBaseline: nextBaseline,
      previewRecommendationId: null,
    });
  },

  pinCurrentAsBaseline: () => {
    const { setup, driver, currentSim } = get();
    set({
      pinnedBaseline: {
        setup: { ...setup },
        driver: { ...driver },
        sim: currentSim,
      },
      viewingBaseline: false,
    });
  },

  clearBaseline: () => set({ pinnedBaseline: null, viewingBaseline: false }),

  revertToBaseline: () => {
    const { pinnedBaseline, driver, selectedSymptom, scopeFilter } = get();
    if (!pinnedBaseline) return;
    const nextSetup = { ...pinnedBaseline.setup };
    const nextDriver = { ...driver };
    const currentSim = simulateVehicleState(nextSetup, nextDriver);
    const recommendations = solveDiagnosticRecommendations(nextSetup, nextDriver, {
      symptom: selectedSymptom,
      phase: nextDriver.cornerPhase,
      scopeFilter,
    });
    set({
      setup: nextSetup,
      driver: nextDriver,
      currentSim,
      frequencyNotice: null,
      recommendations,
      previewRecommendationId: null,
      viewingBaseline: false,
    });
  },

  resetToArchetypeDefault: () => {
    const { setup } = get();
    get().selectArchetype(setup.drivetrain);
  },

  setPreviewRecommendationId: (previewRecommendationId) =>
    set({
      previewRecommendationId,
      ...(previewRecommendationId ? { viewingBaseline: false } : {}),
    }),

  applyRecommendation: (rec) => {
    const { setup, driver, selectedSymptom, scopeFilter, currentSim, pinnedBaseline } =
      get();
    // Ensure baseline is pinned before applying if none exists
    const baselineToKeep = pinnedBaseline ?? {
      setup: { ...setup },
      driver: { ...driver },
      sim: currentSim,
    };

    const nextSetup: VehicleSetup = {
      ...setup,
      ...rec.suggestedSetupPatch,
    };
    const nextDriver: DriverInputState = {
      ...driver,
      ...(rec.suggestedDriverPatch ?? {}),
    };
    const nextSim = simulateVehicleState(nextSetup, nextDriver);
    const recommendations = solveDiagnosticRecommendations(nextSetup, nextDriver, {
      symptom: selectedSymptom,
      phase: nextDriver.cornerPhase,
      scopeFilter,
    });

    set({
      setup: nextSetup,
      driver: nextDriver,
      currentSim: nextSim,
      pinnedBaseline: {
        ...baselineToKeep,
        driver: { ...nextDriver },
        sim: simulateVehicleState(baselineToKeep.setup, nextDriver),
      },
      frequencyNotice: null,
      recommendations,
      previewRecommendationId: null,
      viewingBaseline: false,
    });
  },
}));

useTuningStore.subscribe((state, prevState) => {
  if (
    state.activeTab === prevState.activeTab &&
    state.themeMode === prevState.themeMode &&
    state.scopeFilter === prevState.scopeFilter &&
    state.setup === prevState.setup &&
    state.driver === prevState.driver &&
    state.pinnedBaseline?.setup === prevState.pinnedBaseline?.setup
  ) {
    return;
  }
  const payload: PersistedTuningState = {
    version: 1,
    activeTab: state.activeTab,
    themeMode: state.themeMode,
    scopeFilter: state.scopeFilter,
    setup: state.setup,
    driver: state.driver,
    baselineSetup: state.pinnedBaseline?.setup ?? null,
  };
  savePersistedState(payload);
});

function frequencyLimitNotice(
  axle: string,
  result: ReturnType<typeof solveRideFrequencyTarget>
): string | null {
  if (result.status === 'achieved') return null;
  const reason = result.limitReason === 'minimum_spring_rate'
    ? 'minimum spring rate'
    : result.limitReason === 'maximum_spring_rate'
    ? 'maximum spring rate'
    : 'tyre stiffness / spring rate limit';
  return `${axle} target ${result.requestedFrequencyHz.toFixed(2)} Hz is outside the achievable range. ` +
    `Achieved ${result.achievedFrequencyHz.toFixed(2)} Hz at ${result.springRateNmm.toFixed(0)} N/mm (${reason}).`;
}
