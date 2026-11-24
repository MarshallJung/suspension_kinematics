import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DRIVER_INPUT, DRIVETRAIN_ARCHETYPES } from '../../engine';
import { countModifiedSetupFields, formatSignedDelta } from '../../utils/setupDiff';
import { STORAGE_KEY, loadPersistedState, savePersistedState } from '../persistence';
import { useTuningStore } from '../useTuningStore';

function installMockStorage() {
  const backing = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return backing.size;
    },
    clear() {
      backing.clear();
    },
    getItem(key: string) {
      return backing.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(backing.keys())[index] ?? null;
    },
    removeItem(key: string) {
      backing.delete(key);
    },
    setItem(key: string, value: string) {
      backing.set(key, value);
    },
  };
  (globalThis as unknown as { window?: { localStorage: Storage } }).window = {
    localStorage: mockStorage,
  };
  return mockStorage;
}

describe('setupDiff, persistence & store A/B comparison', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
    useTuningStore.getState().selectArchetype('RR');
  });

  it('counts modified fields accurately and formats signed deltas', () => {
    const base = { ...DRIVETRAIN_ARCHETYPES.RR.defaultSetup };
    expect(countModifiedSetupFields(base, base)).toBe(0);
    expect(countModifiedSetupFields(base, null)).toBe(0);

    const modified = {
      ...base,
      frontArbStiffnessNmPerDeg: base.frontArbStiffnessNmPerDeg + 40,
      frontStaticCamberDeg: base.frontStaticCamberDeg - 0.5,
    };
    expect(countModifiedSetupFields(modified, base)).toBe(2);
    expect(formatSignedDelta(0.01, 1, '°')).toBe('');
    expect(formatSignedDelta(42.2, 0, ' lb')).toBe('+42 lb');
    expect(formatSignedDelta(-0.25, 2, '°')).toBe('-0.25°');
  });

  it('toggles A/B baseline viewing without mutating setup and auto-clears on edits or revert', () => {
    const store = useTuningStore.getState();
    store.selectArchetype('FR');
    const initialArb = useTuningStore.getState().setup.frontArbStiffnessNmPerDeg;

    store.updateSetup({ frontArbStiffnessNmPerDeg: initialArb + 60 });
    expect(countModifiedSetupFields(useTuningStore.getState().setup, useTuningStore.getState().pinnedBaseline?.setup)).toBe(1);

    useTuningStore.getState().toggleViewingBaseline();
    expect(useTuningStore.getState().viewingBaseline).toBe(true);
    expect(useTuningStore.getState().setup.frontArbStiffnessNmPerDeg).toBe(initialArb + 60);

    // Editing setup automatically exits A/B compare
    useTuningStore.getState().updateSetup({ rearArbStiffnessNmPerDeg: 220 });
    expect(useTuningStore.getState().viewingBaseline).toBe(false);

    // Reverting exits A/B compare and restores baseline
    useTuningStore.getState().toggleViewingBaseline();
    expect(useTuningStore.getState().viewingBaseline).toBe(true);
    useTuningStore.getState().revertToBaseline();
    expect(useTuningStore.getState().viewingBaseline).toBe(false);
    expect(useTuningStore.getState().setup.frontArbStiffnessNmPerDeg).toBe(initialArb);
  });

  it('round-trips valid localStorage persistence and rejects corrupt or mismatched payloads', () => {
    const storage = installMockStorage();
    const base = { ...DRIVETRAIN_ARCHETYPES.MR.defaultSetup };
    const edited = { ...base, frontArbStiffnessNmPerDeg: base.frontArbStiffnessNmPerDeg + 80 };

    savePersistedState({
      version: 1,
      activeTab: 'wizard',
      themeMode: 'daylight',
      scopeFilter: 'trackside',
      setup: edited,
      driver: { ...DEFAULT_DRIVER_INPUT, cornerPhase: 'exit', speedKmh: 160 },
      baselineSetup: base,
    });

    const loaded = loadPersistedState();
    expect(loaded).not.toBeNull();
    expect(loaded?.themeMode).toBe('daylight');
    expect(loaded?.activeTab).toBe('wizard');
    expect(loaded?.setup?.drivetrain).toBe('MR');
    expect(loaded?.setup?.frontArbStiffnessNmPerDeg).toBe(edited.frontArbStiffnessNmPerDeg);
    expect(loaded?.baselineSetup?.frontArbStiffnessNmPerDeg).toBe(base.frontArbStiffnessNmPerDeg);
    expect(loaded?.driver?.cornerPhase).toBe('exit');

    // Corrupt JSON returns null gracefully
    storage.setItem(STORAGE_KEY, '{not-json');
    expect(loadPersistedState()).toBeNull();

    // Wrong version or unknown drivetrain returns null gracefully
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, setup: edited }));
    expect(loadPersistedState()).toBeNull();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, setup: { drivetrain: 'UNKNOWN' } }));
    expect(loadPersistedState()).toBeNull();
  });
});
