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

export type AppModeTab = 'wizard' | 'sandbox';
export type ThemeMode = 'dark' | 'daylight';

export interface TuningStoreState {
  activeTab: AppModeTab;
  themeMode: ThemeMode;
  scopeFilter: 'all' | AdjustmentScope;

  // Diagnostic Wizard state
  selectedSymptom: HandlingSymptomType;
  selectedWheel: WheelId | null;
  previewRecommendationId: string | null;

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

const initialSetup = { ...DRIVETRAIN_ARCHETYPES.RR.defaultSetup };
const initialDriver = { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'entry' as CornerPhase };
const initialSim = simulateVehicleState(initialSetup, initialDriver);
const initialRecs = solveDiagnosticRecommendations(initialSetup, initialDriver, {
  symptom: 'understeer',
  phase: initialDriver.cornerPhase,
  scopeFilter: 'all',
});

export const useTuningStore = create<TuningStoreState>((set, get) => ({
  activeTab: 'sandbox',
  themeMode: 'dark',
  scopeFilter: 'all',

  selectedSymptom: 'understeer',
  selectedWheel: 'FR',
  previewRecommendationId: null,

  setup: initialSetup,
  driver: initialDriver,
  currentSim: initialSim,
  frequencyNotice: null,
  pinnedBaseline: {
    setup: initialSetup,
    driver: initialDriver,
    sim: initialSim,
  },
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
    });
  },

  clearBaseline: () => set({ pinnedBaseline: null }),

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
    });
  },

  resetToArchetypeDefault: () => {
    const { setup } = get();
    get().selectArchetype(setup.drivetrain);
  },

  setPreviewRecommendationId: (previewRecommendationId) =>
    set({ previewRecommendationId }),

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
    });
  },
}));

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
