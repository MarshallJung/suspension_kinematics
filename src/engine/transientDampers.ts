import { CornerPhase, DriverInputState, VehicleSetup } from './types';

export interface DamperAnalysis {
  frontLsBumpZeta: number;
  frontLsReboundZeta: number;
  rearLsBumpZeta: number;
  rearLsReboundZeta: number;
  frontHsBumpZeta: number;
  rearHsBumpZeta: number;
  /**
   * Transient front lateral load transfer shift (-0.12 to +0.12) caused by damper low-speed
   * bump/rebound balance during transient roll/pitch rates in Entry and Exit.
   * In steady-state Mid-Corner, low-speed shaft velocity -> 0, so transientShift -> 0.
   */
  transientFrontLoadTransferShift: number;
  /**
   * High-speed bump contact patch compliance factor (0.75 to 1.0) on bumpy surfaces.
   */
  frontBumpComplianceFactor: number;
  rearBumpComplianceFactor: number;
}

/**
 * Maps 1–20 damper click setting to damping ratio zeta = C_wheel / C_crit.
 * Click 10 corresponds to ~0.38 critical damping (optimal track baseline ~0.35–0.45 for LS).
 */
export function clicksToDampingRatio(clicks: number, wheelRateNmm: number, baselineRateNmm: number): number {
  const clampedClicks = Math.max(1, Math.min(20, clicks));
  const baseZeta = 0.14 + (clampedClicks / 20) * 0.52;
  // Stiffer springs increase C_crit = 2*sqrt(K_w * m_s), slightly lowering effective zeta for fixed valving
  const rateScale = Math.sqrt(Math.max(30, baselineRateNmm) / Math.max(30, wheelRateNmm));
  return Number((baseZeta * (0.7 + 0.3 * rateScale)).toFixed(3));
}

export function evaluateTransientDampers(
  setup: VehicleSetup,
  driver: DriverInputState,
  frontWheelRateNmm: number,
  rearWheelRateNmm: number,
  phaseOverride?: CornerPhase
): DamperAnalysis {
  const phase = phaseOverride ?? driver.cornerPhase;

  const frontLsBumpZeta = clicksToDampingRatio(setup.frontLsBumpClicks, frontWheelRateNmm, 80);
  const frontLsReboundZeta = clicksToDampingRatio(setup.frontLsReboundClicks, frontWheelRateNmm, 80);
  const rearLsBumpZeta = clicksToDampingRatio(setup.rearLsBumpClicks, rearWheelRateNmm, 100);
  const rearLsReboundZeta = clicksToDampingRatio(setup.rearLsReboundClicks, rearWheelRateNmm, 100);
  const frontHsBumpZeta = clicksToDampingRatio(setup.frontHsBumpClicks, frontWheelRateNmm, 80);
  const rearHsBumpZeta = clicksToDampingRatio(setup.rearHsBumpClicks, rearWheelRateNmm, 100);

  // Driver abruptness amplifies damper shaft velocity during transient phases
  const abruptnessAmplifier = 1.0 + ((100 - driver.driverSmoothnessPct) / 100) * 0.65;

  let transientFrontLoadTransferShift = 0;

  if (phase === 'entry') {
    // Corner Entry (Braking + Turn-In):
    // Outside front compresses (Front LS Bump), Inside rear extends (Rear LS Rebound).
    // Stiffer Front LS Bump or stiffer Rear LS Rebound speeds up front load build-up and unloads inside rear -> increases transient front TLLTD (more entry understeer / or if rear unloads excessively on trail-brake, changes entry balance).
    // Specifically: higher Front LS Bump overloads outside front tire faster (+shift -> understeer).
    // Higher Rear LS Rebound resists rear extension / lifts inside rear wheel (-shift -> entry oversteer rotation).
    const frontBumpDelta = frontLsBumpZeta - 0.39;
    const rearReboundDelta = rearLsReboundZeta - 0.41;
    const frontReboundDelta = frontLsReboundZeta - 0.40;
    transientFrontLoadTransferShift =
      (frontBumpDelta * 0.22 - rearReboundDelta * 0.18 + frontReboundDelta * 0.08) *
      abruptnessAmplifier;
  } else if (phase === 'exit') {
    // Corner Exit (Throttle Application + Unwinding Steer):
    // Nose extends (Front LS Rebound) and Rear compresses (Rear LS Bump).
    // Stiffer Front LS Rebound holds weight on the front nose longer (-shift -> reduces exit understeer).
    // Stiffer Rear LS Bump spikes vertical load rate on outside rear tire (-shift -> more exit oversteer).
    const frontReboundDelta = frontLsReboundZeta - 0.40;
    const rearBumpDelta = rearLsBumpZeta - 0.39;
    transientFrontLoadTransferShift =
      (-frontReboundDelta * 0.18 - rearBumpDelta * 0.22) * abruptnessAmplifier;
  } else {
    // Mid-Corner (Apex steady-state): low-speed damper velocity approaches 0
    transientFrontLoadTransferShift = 0;
  }

  // High-Speed Bump & Anti-Geometry Compliance over Bumps/Curbs
  let bumpSeverity = 0;
  if (driver.surfaceCondition === 'moderately_bumpy') bumpSeverity = 0.5;
  if (driver.surfaceCondition === 'curbs_and_bumps') bumpSeverity = 1.0;

  // Optimal HS zeta is ~0.36; too stiff (>0.45) or too soft (<0.22) loses contact patch compliance over curbs
  const frontHsDeviation = Math.abs(frontHsBumpZeta - 0.36);
  const rearHsDeviation = Math.abs(rearHsBumpZeta - 0.36);

  // Excessive anti-dive (>40%) or anti-squat (>40%) also locks vertical link compliance over bumps (PDF Page 6 & 14)
  const frontAntiDivePenalty =
    phase === 'entry' && setup.frontAntiDivePct > 40
      ? ((setup.frontAntiDivePct - 40) / 100) * 0.18
      : 0;
  const rearAntiSquatPenalty =
    phase === 'exit' && setup.rearAntiSquatPct > 40
      ? ((setup.rearAntiSquatPct - 40) / 100) * 0.18
      : 0;

  const frontBumpComplianceFactor = Math.max(
    0.78,
    1 - bumpSeverity * (frontHsDeviation * 0.38 + frontAntiDivePenalty)
  );
  const rearBumpComplianceFactor = Math.max(
    0.78,
    1 - bumpSeverity * (rearHsDeviation * 0.38 + rearAntiSquatPenalty)
  );

  return {
    frontLsBumpZeta,
    frontLsReboundZeta,
    rearLsBumpZeta,
    rearLsReboundZeta,
    frontHsBumpZeta,
    rearHsBumpZeta,
    transientFrontLoadTransferShift,
    frontBumpComplianceFactor,
    rearBumpComplianceFactor,
  };
}
