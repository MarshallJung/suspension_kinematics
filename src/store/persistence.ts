import {
  AdjustmentScope,
  CornerPhase,
  DEFAULT_DRIVER_INPUT,
  DRIVETRAIN_ARCHETYPES,
  DriverInputState,
  DrivetrainArchetype,
  SurfaceCondition,
  SuspensionGeometryType,
  VehicleSetup,
} from '../engine';

export const STORAGE_KEY = 'paddock-kinematics:v1';

export type PersistedAppModeTab = 'wizard' | 'sandbox';
export type PersistedThemeMode = 'dark' | 'daylight';

export interface PersistedTuningState {
  version: 1;
  activeTab: PersistedAppModeTab;
  themeMode: PersistedThemeMode;
  scopeFilter: 'all' | AdjustmentScope;
  setup: VehicleSetup;
  driver: DriverInputState;
  baselineSetup: VehicleSetup | null;
}

const VALID_GEOMETRIES = new Set<SuspensionGeometryType>([
  'macpherson',
  'double_wishbone',
  'multilink',
]);
const VALID_PHASES = new Set<CornerPhase>(['entry', 'mid', 'exit']);
const VALID_SURFACES = new Set<SurfaceCondition>([
  'smooth',
  'moderately_bumpy',
  'curbs_and_bumps',
]);

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

function sanitizeSetup(raw: unknown): VehicleSetup | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const drivetrain = candidate.drivetrain as DrivetrainArchetype;
  if (typeof drivetrain !== 'string' || !(drivetrain in DRIVETRAIN_ARCHETYPES)) {
    return null;
  }

  const base = DRIVETRAIN_ARCHETYPES[drivetrain].defaultSetup;
  const merged: VehicleSetup = { ...base };

  for (const key of Object.keys(base) as (keyof VehicleSetup)[]) {
    const val = candidate[key];
    if (key === 'drivetrain') continue;
    if (key === 'frontGeometry' || key === 'rearGeometry') {
      if (typeof val === 'string' && VALID_GEOMETRIES.has(val as SuspensionGeometryType)) {
        merged[key] = val as SuspensionGeometryType;
      }
      continue;
    }
    if (typeof base[key] === 'number' && typeof val === 'number' && Number.isFinite(val)) {
      (merged as unknown as Record<string, unknown>)[key] = val;
    }
  }

  return merged;
}

function sanitizeDriver(raw: unknown): DriverInputState {
  const merged: DriverInputState = { ...DEFAULT_DRIVER_INPUT };
  if (!raw || typeof raw !== 'object') return merged;
  const candidate = raw as Record<string, unknown>;

  if (
    typeof candidate.cornerPhase === 'string' &&
    VALID_PHASES.has(candidate.cornerPhase as CornerPhase)
  ) {
    merged.cornerPhase = candidate.cornerPhase as CornerPhase;
  }
  if (candidate.turnDirection === 'left' || candidate.turnDirection === 'right') {
    merged.turnDirection = candidate.turnDirection;
  }
  if (
    typeof candidate.surfaceCondition === 'string' &&
    VALID_SURFACES.has(candidate.surfaceCondition as SurfaceCondition)
  ) {
    merged.surfaceCondition = candidate.surfaceCondition as SurfaceCondition;
  }

  for (const numKey of [
    'speedKmh',
    'lateralG',
    'brakingG',
    'throttleG',
    'trailBrakeOverlapPct',
    'driverSmoothnessPct',
  ] as const) {
    const val = candidate[numKey];
    if (typeof val === 'number' && Number.isFinite(val)) {
      merged[numKey] = val;
    }
  }

  return merged;
}

/**
 * Loads and validates previously saved tuning state from browser localStorage.
 * Returns null safely in SSR/Node environments or on malformed/incompatible payloads.
 */
export function loadPersistedState(): Partial<PersistedTuningState> | null {
  const storage = getStorage();
  if (!storage) return null;

  try {
    const rawText = storage.getItem(STORAGE_KEY);
    if (!rawText) return null;
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) {
      return null;
    }

    const setup = sanitizeSetup(parsed.setup);
    if (!setup) return null;

    const driver = sanitizeDriver(parsed.driver);
    const activeTab: PersistedAppModeTab =
      parsed.activeTab === 'wizard' || parsed.activeTab === 'sandbox'
        ? parsed.activeTab
        : 'sandbox';
    const themeMode: PersistedThemeMode =
      parsed.themeMode === 'dark' || parsed.themeMode === 'daylight'
        ? parsed.themeMode
        : 'dark';
    const scopeFilter: 'all' | AdjustmentScope =
      parsed.scopeFilter === 'all' ||
      parsed.scopeFilter === 'trackside' ||
      parsed.scopeFilter === 'shop'
        ? parsed.scopeFilter
        : 'all';

    const baselineSetup =
      parsed.baselineSetup === null ? null : sanitizeSetup(parsed.baselineSetup) ?? setup;

    return {
      version: 1,
      activeTab,
      themeMode,
      scopeFilter,
      setup,
      driver,
      baselineSetup,
    };
  } catch {
    return null;
  }
}

/**
 * Writes the current tuning state to browser localStorage when available.
 */
export function savePersistedState(state: PersistedTuningState): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota or private-browsing errors cleanly
  }
}
