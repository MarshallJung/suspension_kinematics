/** Fixed air density used by this constant-coefficient downforce model (kg/m³). */
export const AERO_AIR_DENSITY_KG_M3 = 1.225;

/** Positive C_L A denotes downforce. Speed is the model's non-negative road speed. */
export function calculateAeroDownforceN(aeroClA: number, speedKmh: number): number {
  const speedMs = speedKmh / 3.6;
  return 0.5 * AERO_AIR_DENSITY_KG_M3 * aeroClA * speedMs * speedMs;
}

/** Convert a measured/specified downforce at a reference speed to the canonical C_L A. */
export function aeroClAFromReferenceDownforce(downforceN: number, referenceSpeedKmh: number): number {
  if (!Number.isFinite(downforceN) || downforceN < 0 ||
      !Number.isFinite(referenceSpeedKmh) || referenceSpeedKmh <= 0) {
    throw new RangeError('Reference downforce must be non-negative and reference speed must be positive.');
  }
  const coefficient = downforceN / calculateAeroDownforceN(1, referenceSpeedKmh);
  if (!Number.isFinite(coefficient)) throw new RangeError('Reference rating must define a finite aero coefficient.');
  return coefficient;
}
