import type { SimulationResult, WheelId } from '../../engine';
import type { ThemeMode } from '../../store/useTuningStore';

const WHEELS: WheelId[] = ['FL', 'FR', 'RL', 'RR'];

/** Calibrated wheel centers and force-plot anchors inside the 700 x 600 top-down SVG viewBox. */
export const TOP_DOWN_POSITIONS: Record<
  WheelId,
  { x: number; y: number; plotX: number; plotY: number }
> = {
  FL: { x: 249, y: 152, plotX: 104, plotY: 150 },
  FR: { x: 451, y: 152, plotX: 596, plotY: 150 },
  RL: { x: 249, y: 414, plotX: 104, plotY: 438 },
  RR: { x: 451, y: 414, plotX: 596, plotY: 438 },
};

/** Aligned bounding box for assets/custom-paint-top-down.png matching TOP_DOWN_POSITIONS arches. */
export const LIVERY_SPRITE_RECT = {
  x: 238,
  y: 14,
  width: 224,
  height: 560,
} as const;

/** Aligned bounding box for assets/gt3-wireframe-top-down-{dark|light}.png matching TOP_DOWN_POSITIONS arches. */
export const TOP_DOWN_WIREFRAME_RECT = {
  x: 243,
  y: 55,
  width: 214,
  height: 489,
} as const;

/**
 * Smooth nonlinear steering and toe exaggeration for visual clarity.
 * Preserves exact 0 at straight-ahead and keeps Ackermann inside/outside angle
 * differences visible without hard-clipping early.
 */
export function computeDisplayWheelAngle(
  steerDeg: number,
  toeDeg: number,
  actualHeadingDeg: number,
  enhanced: boolean
): number {
  if (!enhanced) return actualHeadingDeg;
  if (steerDeg === 0 && toeDeg === 0) return 0;
  const raw = 34 * Math.tanh((steerDeg * 3.2) / 34) + 10 * Math.tanh((toeDeg * 12) / 10);
  return Math.max(-40, Math.min(40, raw));
}

export interface ContactPatchZoneInput {
  dynamicCamberDeg: number;
  tirePsi: number;
  optimalPsi: number;
  isOutside: boolean;
  isLeft: boolean;
  lateralG: number;
  gripUtilizationPct: number;
  dynamicFzN: number;
}

export interface ContactPatchZones {
  /** Leftmost longitudinal tread strip in screen space. */
  leftZone: number;
  /** Center longitudinal tread strip. */
  centerZone: number;
  /** Rightmost longitudinal tread strip in screen space. */
  rightZone: number;
  unloaded: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Computes three longitudinal contact-patch load/heat intensities driven by
 * dynamic camber error relative to cornering target and hot tire pressure error.
 * Strictly symmetric left-to-right at 0g lateral.
 */
export function computeContactPatchZones(input: ContactPatchZoneInput): ContactPatchZones {
  if (!Number.isFinite(input.dynamicFzN) || input.dynamicFzN <= 0) {
    return { leftZone: 0, centerZone: 0, rightZone: 0, unloaded: true };
  }

  const lateralBlend = Math.min(1, Math.abs(input.lateralG) / 0.35);
  const targetCamber = (input.isOutside ? -1.5 : -0.5) * lateralBlend;
  const camberError = input.dynamicCamberDeg - targetCamber;
  // Negative error (excess negative camber) biases inner shoulder; positive error biases outer shoulder.
  const camberBias = clamp(camberError * 0.14, -0.48, 0.48);

  const psiError = input.tirePsi - input.optimalPsi;
  const crownBias = clamp(psiError * 0.045, -0.35, 0.45);

  const baseIntensity = clamp(0.28 + (input.gripUtilizationPct / 100) * 0.68, 0.18, 1.12);
  const shoulderScale = 1 - 0.5 * crownBias;

  const innerZone = clamp(baseIntensity * shoulderScale * (1 - camberBias), 0.08, 1.25);
  const outerZone = clamp(baseIntensity * shoulderScale * (1 + camberBias), 0.08, 1.25);
  const centerZone = clamp(baseIntensity * (1 + crownBias), 0.08, 1.25);

  return {
    leftZone: input.isLeft ? outerZone : innerZone,
    centerZone,
    rightZone: input.isLeft ? innerZone : outerZone,
    unloaded: false,
  };
}

/**
 * Computes pixels-per-Newton scale factors for the four friction circles.
 * Shared scale preserves true relative load transfer and aero growth across corners.
 */
export function computeCornerForceScales(
  active: SimulationResult,
  reference: SimulationResult | null | undefined,
  sharedScale: boolean,
  maxRadiusPx: number = 54
): Record<WheelId, number> {
  const cornerMaxForce = (id: WheelId): number => {
    const w = active.wheels[id];
    const r = reference?.wheels[id];
    const demand = Math.hypot(w.longitudinalFxN, w.lateralFyDemandN);
    const refDemand = r ? Math.hypot(r.longitudinalFxN, r.lateralFyDemandN) : 0;
    return Math.max(1, w.maxTotalForceN, r?.maxTotalForceN ?? 0, demand, refDemand);
  };

  if (sharedScale) {
    const globalMax = Math.max(...WHEELS.map(cornerMaxForce)) * 1.12;
    const sharedPxPerN = maxRadiusPx / globalMax;
    return {
      FL: sharedPxPerN,
      FR: sharedPxPerN,
      RL: sharedPxPerN,
      RR: sharedPxPerN,
    };
  }

  return {
    FL: maxRadiusPx / (cornerMaxForce('FL') * 1.12),
    FR: maxRadiusPx / (cornerMaxForce('FR') * 1.12),
    RL: maxRadiusPx / (cornerMaxForce('RL') * 1.12),
    RR: maxRadiusPx / (cornerMaxForce('RR') * 1.12),
  };
}

/**
 * Builds an SVG `<Polygon points="...">` arrowhead at `(x2, y2)` pointing along `(x1, y1) -> (x2, y2)`.
 * Avoids `<Marker>` cross-platform quirks in `react-native-svg` on Android.
 */
export function arrowHeadPoints(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  length: number = 10,
  halfWidth: number = 4.5
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (!Number.isFinite(dist) || dist < 1) return '';
  const ux = dx / dist;
  const uy = dy / dist;
  const px = -uy;
  const py = ux;
  const tipX = x2;
  const tipY = y2;
  const baseX = x2 - ux * length;
  const baseY = y2 - uy * length;
  const p1X = baseX + px * halfWidth;
  const p1Y = baseY + py * halfWidth;
  const p2X = baseX - px * halfWidth;
  const p2Y = baseY - py * halfWidth;
  return `${tipX.toFixed(1)},${tipY.toFixed(1)} ${p1X.toFixed(1)},${p1Y.toFixed(1)} ${p2X.toFixed(1)},${p2Y.toFixed(1)}`;
}

/** Maps normalized zone load/heat intensity `[0..1.25]` to a readable thermal ramp. */
export function zoneHeatColor(intensity: number, themeMode: ThemeMode): string {
  if (themeMode === 'daylight') {
    if (intensity > 1.0) return '#B91C1C';
    if (intensity > 0.82) return '#D97706';
    if (intensity > 0.55) return '#059669';
    if (intensity > 0.32) return '#0284C7';
    return '#64748B';
  }
  if (intensity > 1.0) return '#EF4444';
  if (intensity > 0.82) return '#F59E0B';
  if (intensity > 0.55) return '#10B981';
  if (intensity > 0.32) return '#38BDF8';
  return '#475569';
}

/** Exact pixel geometry constants matching the cropped dual-theme Mustang GT3 wireframe PNGs. */
export const WIREFRAME_METRICS = {
  topDown: {
    width: 428,
    height: 976,
    centerX: 214,
    frontAxleY: 194,
    rearAxleY: 717,
    wheelbase: 523,
  },
  side: {
    width: 964,
    height: 260,
    frontWheelCx: 185.5,
    rearWheelCx: 726.5,
    wheelCy: 191.0,
    wheelRadius: 68.0,
    groundY: 259.0,
    wheelbase: 541.0,
  },
  wheel: {
    size: 140,
    radius: 68.0,
  },
  front: {
    width: 983,
    height: 628,
    centerX: 491.5,
    halfTrack: 368.5,
    groundY: 624.0,
  },
  rear: {
    width: 936,
    height: 618,
    centerX: 468.0,
    halfTrack: 367.5,
    groundY: 616.0,
  },
} as const;

export interface SideWireframeLayout {
  midX: number;
  frontX: number;
  rearX: number;
  wheelR: number;
  wheelCenterY: number;
  bodyX: number;
  bodyY: number;
  bodyWidth: number;
  bodyHeight: number;
  wheelSpriteSize: number;
  frontAeroX: number;
  rearAeroX: number;
  frontGaugeX: number;
  rearGaugeX: number;
}

export interface ElevationWireframeRect {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  leftLabelX: number;
  rightLabelX: number;
}

/**
 * Maps engine body pitch (negative = nose dive, positive = squat) to SVG rotation
 * in degrees for the nose-LEFT side view (dive = CCW negative, squat = CW positive).
 */
export function computeSidePitchDeg(bodyPitchDeg: number): number {
  return clamp(bodyPitchDeg * 5, -10, 10);
}

/**
 * Computes aligned nose-LEFT side wireframe image placement, wheel arch centers,
 * aerodynamic force X coordinates, and side heave gauge positions for Pitch & Aero.
 */
export function computeSideWireframeLayout(
  wheelbaseMm: number,
  groundY: number,
  rideShiftY: number
): SideWireframeLayout {
  const halfSpan = clamp(132 * (wheelbaseMm / 2500), 118, 142);
  const midX = 340;
  const frontX = midX - halfSpan;
  const rearX = midX + halfSpan;
  const wheelbasePx = rearX - frontX;
  const scale = wheelbasePx / WIREFRAME_METRICS.side.wheelbase;
  const wheelR = WIREFRAME_METRICS.side.wheelRadius * scale;
  const wheelCenterY = groundY - wheelR;
  const bodyWidth = WIREFRAME_METRICS.side.width * scale;
  const bodyHeight = WIREFRAME_METRICS.side.height * scale;
  const bodyX = frontX - WIREFRAME_METRICS.side.frontWheelCx * scale;
  const bodyY = groundY - WIREFRAME_METRICS.side.groundY * scale + rideShiftY;
  const wheelSpriteSize = WIREFRAME_METRICS.wheel.size * scale;

  return {
    midX,
    frontX,
    rearX,
    wheelR,
    wheelCenterY,
    bodyX,
    bodyY,
    bodyWidth,
    bodyHeight,
    wheelSpriteSize,
    frontAeroX: bodyX + bodyWidth * 0.09,
    rearAeroX: bodyX + bodyWidth * 0.91,
    frontGaugeX: Math.max(82, bodyX - 16),
    rearGaugeX: Math.min(618, bodyX + bodyWidth + 16),
  };
}

/**
 * Computes aligned Front or Rear elevation wireframe sprite bounds centered at `cx`
 * with wheel arches matched to `halfTrackPx` and fender/header/splitter clearances clamped.
 */
export function computeElevationWireframeRect(
  axle: 'front' | 'rear',
  cx: number,
  halfTrackPx: number,
  groundY: number,
  bodyRideShiftY: number
): ElevationWireframeRect {
  const m = WIREFRAME_METRICS[axle];
  const scale = halfTrackPx / m.halfTrack;
  const width = m.width * scale;
  const height = m.height * scale;
  const x = cx - m.centerX * scale;
  const y =
    axle === 'front'
      ? groundY - 10 - m.groundY * scale + clamp(bodyRideShiftY, -14, 10)
      : groundY - m.groundY * scale + clamp(bodyRideShiftY, -14, 12);

  return {
    x,
    y,
    width,
    height,
    scale,
    leftLabelX: Math.max(88, x - 12),
    rightLabelX: Math.min(612, x + width + 12),
  };
}
