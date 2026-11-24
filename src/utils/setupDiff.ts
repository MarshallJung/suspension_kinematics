import type { VehicleSetup } from '../engine';

/** Ordered list of tunable setup keys tracked for baseline diff counts. */
export const SETUP_COMPARISON_KEYS: (keyof VehicleSetup)[] = [
  'drivetrain',
  'frontGeometry',
  'rearGeometry',
  'massKg',
  'frontWeightFraction',
  'cgHeightMm',
  'wheelbaseMm',
  'frontTrackMm',
  'rearTrackMm',
  'frontSpringRateNmm',
  'rearSpringRateNmm',
  'frontMotionRatio',
  'rearMotionRatio',
  'frontSpringInclinationDeg',
  'rearSpringInclinationDeg',
  'frontArbStiffnessNmPerDeg',
  'rearArbStiffnessNmPerDeg',
  'frontRideHeightDeltaMm',
  'rearRideHeightDeltaMm',
  'nominalFrontRollCenterMm',
  'nominalRearRollCenterMm',
  'frontStaticCamberDeg',
  'rearStaticCamberDeg',
  'frontStaticToeDeg',
  'rearStaticToeDeg',
  'frontCasterDeg',
  'frontKpiDeg',
  'ackermannPct',
  'frontAntiDivePct',
  'rearAntiSquatPct',
  'frontLsBumpClicks',
  'frontLsReboundClicks',
  'rearLsBumpClicks',
  'rearLsReboundClicks',
  'frontHsBumpClicks',
  'rearHsBumpClicks',
  'frontTireWidthMm',
  'rearTireWidthMm',
  'frontTirePressurePsi',
  'rearTirePressurePsi',
  'optimalTirePressurePsi',
  'peakFrictionCoefficient',
  'tireLoadSensitivityExponent',
  'brakeBiasFrontPct',
  'frontTorqueSplitPct',
  'lsdAccelLockPct',
  'lsdDecelLockPct',
  'aeroClA',
  'aeroFrontBalancePct',
];

/**
 * Counts how many VehicleSetup fields differ from `baseline` beyond numeric tolerance.
 * Returns 0 when no baseline is pinned or every field matches.
 */
export function countModifiedSetupFields(
  current: VehicleSetup,
  baseline: VehicleSetup | null | undefined
): number {
  if (!baseline) return 0;
  let count = 0;
  for (const key of SETUP_COMPARISON_KEYS) {
    const a = current[key];
    const b = baseline[key];
    if (typeof a === 'number' && typeof b === 'number') {
      if (Math.abs(a - b) > 1e-4) count += 1;
    } else if (a !== b) {
      count += 1;
    }
  }
  return count;
}

/**
 * Formats a signed comparison delta string (e.g. "+42 lb" or "-0.25°"),
 * returning an empty string when the rounded delta is effectively zero.
 */
export function formatSignedDelta(
  delta: number,
  decimals: number = 0,
  unit: string = ''
): string {
  if (!Number.isFinite(delta)) return '';
  const factor = Math.pow(10, Math.max(0, decimals));
  const rounded = Math.round(delta * factor) / factor;
  if (Math.abs(rounded) < 0.5 / factor) return '';
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(decimals)}${unit}`;
}
