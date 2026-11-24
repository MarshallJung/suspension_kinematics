import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIVER_INPUT, DRIVETRAIN_ARCHETYPES, simulateVehicleState } from '../../../engine';
import {
  LIVERY_SPRITE_RECT,
  TOP_DOWN_POSITIONS,
  TOP_DOWN_WIREFRAME_RECT,
  WIREFRAME_METRICS,
  arrowHeadPoints,
  computeContactPatchZones,
  computeCornerForceScales,
  computeDisplayWheelAngle,
  computeElevationWireframeRect,
  computeSidePitchDeg,
  computeSideWireframeLayout,
  zoneHeatColor,
} from '../visualMath';

describe('Visualizer math & geometry alignment helpers', () => {
  it('aligns top-down wheel centers cleanly inside both livery and wireframe footprints', () => {
    expect(TOP_DOWN_POSITIONS.FL.x).toBeGreaterThan(LIVERY_SPRITE_RECT.x);
    expect(TOP_DOWN_POSITIONS.FR.x).toBeLessThan(LIVERY_SPRITE_RECT.x + LIVERY_SPRITE_RECT.width);
    expect(TOP_DOWN_POSITIONS.FL.y).toBe(TOP_DOWN_POSITIONS.FR.y);
    expect(TOP_DOWN_POSITIONS.RL.y).toBe(TOP_DOWN_POSITIONS.RR.y);
    expect(TOP_DOWN_POSITIONS.RL.y).toBeGreaterThan(TOP_DOWN_POSITIONS.FL.y);

    const wfScaleY = TOP_DOWN_WIREFRAME_RECT.height / WIREFRAME_METRICS.topDown.height;
    const wfFrontAxleY =
      TOP_DOWN_WIREFRAME_RECT.y + WIREFRAME_METRICS.topDown.frontAxleY * wfScaleY;
    const wfRearAxleY =
      TOP_DOWN_WIREFRAME_RECT.y + WIREFRAME_METRICS.topDown.rearAxleY * wfScaleY;
    expect(TOP_DOWN_WIREFRAME_RECT.x + TOP_DOWN_WIREFRAME_RECT.width / 2).toBeCloseTo(350, 6);
    expect(Math.abs(wfFrontAxleY - TOP_DOWN_POSITIONS.FL.y)).toBeLessThan(1);
    expect(Math.abs(wfRearAxleY - TOP_DOWN_POSITIONS.RL.y)).toBeLessThan(1);
    expect(TOP_DOWN_WIREFRAME_RECT.y).toBeGreaterThanOrEqual(50);
    expect(TOP_DOWN_WIREFRAME_RECT.y + TOP_DOWN_WIREFRAME_RECT.height).toBeLessThanOrEqual(550);
  });

  it('returns exact zero display wheel angle at straight ahead and preserves Ackermann separation', () => {
    expect(computeDisplayWheelAngle(0, 0, 0, true)).toBe(0);
    expect(computeDisplayWheelAngle(0, 0, 0, false)).toBe(0);

    const outside = computeDisplayWheelAngle(10, 0, 10, true);
    const inside = computeDisplayWheelAngle(12, 0, 12, true);
    expect(inside).toBeGreaterThan(outside);
    expect(inside).toBeLessThanOrEqual(40);
    expect(computeDisplayWheelAngle(10, 0.2, 10.1, false)).toBeCloseTo(10.1, 10);
  });

  it('shifts contact patch heat zones with camber and pressure, stays symmetric at 0g, and marks unloaded wheels', () => {
    const unloaded = computeContactPatchZones({
      dynamicCamberDeg: -2,
      tirePsi: 32,
      optimalPsi: 32,
      isOutside: false,
      isLeft: true,
      lateralG: 1.0,
      gripUtilizationPct: 0,
      dynamicFzN: 0,
    });
    expect(unloaded).toEqual({ leftZone: 0, centerZone: 0, rightZone: 0, unloaded: true });

    // Excess negative camber loads inner shoulder (right side of FL, left side of FR)
    const excessNegLeft = computeContactPatchZones({
      dynamicCamberDeg: -3.5,
      tirePsi: 32,
      optimalPsi: 32,
      isOutside: true,
      isLeft: true,
      lateralG: 1.0,
      gripUtilizationPct: 85,
      dynamicFzN: 4500,
    });
    expect(excessNegLeft.rightZone).toBeGreaterThan(excessNegLeft.leftZone);

    // Positive roll camber error loads outer shoulder (right side of FR)
    const underCamberRight = computeContactPatchZones({
      dynamicCamberDeg: 0.4,
      tirePsi: 32,
      optimalPsi: 32,
      isOutside: true,
      isLeft: false,
      lateralG: 1.0,
      gripUtilizationPct: 85,
      dynamicFzN: 4500,
    });
    expect(underCamberRight.rightZone).toBeGreaterThan(underCamberRight.leftZone);

    // Over-inflation crowns center strip
    const overInflated = computeContactPatchZones({
      dynamicCamberDeg: -1.5,
      tirePsi: 40,
      optimalPsi: 32,
      isOutside: true,
      isLeft: false,
      lateralG: 1.0,
      gripUtilizationPct: 80,
      dynamicFzN: 4000,
    });
    expect(overInflated.centerZone).toBeGreaterThan(overInflated.leftZone);
    expect(overInflated.centerZone).toBeGreaterThan(overInflated.rightZone);

    // Strict left/right mirror symmetry at 0g lateral
    const straightFL = computeContactPatchZones({
      dynamicCamberDeg: -1.9,
      tirePsi: 32,
      optimalPsi: 32,
      isOutside: false,
      isLeft: true,
      lateralG: 0,
      gripUtilizationPct: 40,
      dynamicFzN: 3000,
    });
    const straightFR = computeContactPatchZones({
      dynamicCamberDeg: -1.9,
      tirePsi: 32,
      optimalPsi: 32,
      isOutside: true,
      isLeft: false,
      lateralG: 0,
      gripUtilizationPct: 40,
      dynamicFzN: 3000,
    });
    expect(straightFL.leftZone).toBeCloseTo(straightFR.rightZone, 10);
    expect(straightFL.rightZone).toBeCloseTo(straightFR.leftZone, 10);
    expect(straightFL.centerZone).toBeCloseTo(straightFR.centerZone, 10);
  });

  it('uses one uniform px/N scale in shared-scale mode so loaded corners draw larger than unloaded corners', () => {
    const setup = DRIVETRAIN_ARCHETYPES.RR.defaultSetup;
    const sim = simulateVehicleState(setup, { ...DEFAULT_DRIVER_INPUT, turnDirection: 'left', lateralG: 1.0 });
    const shared = computeCornerForceScales(sim, null, true);
    expect(shared.FL).toBe(shared.FR);
    expect(shared.FR).toBe(shared.RL);
    expect(shared.RL).toBe(shared.RR);
    expect(sim.wheels.FR.maxTotalForceN * shared.FR).toBeGreaterThan(
      sim.wheels.FL.maxTotalForceN * shared.FL
    );

    // Higher aero speed increases circle radius under shared scale when compared against low speed
    const fastSim = simulateVehicleState(setup, { ...DEFAULT_DRIVER_INPUT, speedKmh: 240, lateralG: 0.9 });
    const slowSim = simulateVehicleState(setup, { ...DEFAULT_DRIVER_INPUT, speedKmh: 80, lateralG: 0.9 });
    const fastVsSlow = computeCornerForceScales(fastSim, slowSim, true);
    expect(fastSim.wheels.FR.maxTotalForceN * fastVsSlow.FR).toBeGreaterThan(
      slowSim.wheels.FR.maxTotalForceN * fastVsSlow.FR
    );

    const normalized = computeCornerForceScales(sim, null, false);
    expect(normalized.FL).toBeGreaterThan(normalized.FR);
  });

  it('produces valid finite arrowHeadPoints polygons and distinct heat colors', () => {
    expect(arrowHeadPoints(10, 10, 10, 10)).toBe('');
    const pts = arrowHeadPoints(0, 0, 0, 50, 10, 4);
    expect(pts).toBe('0.0,50.0 -4.0,40.0 4.0,40.0');
    expect(zoneHeatColor(1.1, 'dark')).toBe('#EF4444');
    expect(zoneHeatColor(0.6, 'daylight')).toBe('#059669');
  });

  it('uses nose-left side pitch sign convention (dive CCW negative, squat CW positive)', () => {
    expect(computeSidePitchDeg(0)).toBe(0);
    expect(computeSidePitchDeg(-1.1)).toBeCloseTo(-5.5, 6);
    expect(computeSidePitchDeg(0.9)).toBeCloseTo(4.5, 6);
    expect(computeSidePitchDeg(-3.5)).toBe(-10);
    expect(computeSidePitchDeg(3.5)).toBe(10);
  });

  it('aligns nose-left side wireframe wheel arches precisely to grounded axle centers across wheelbases', () => {
    for (const wheelbaseMm of [2300, 2600, 2900]) {
      const layout = computeSideWireframeLayout(wheelbaseMm, 304, 0);
      expect(layout.frontX).toBeLessThan(layout.rearX);
      const scale = (layout.rearX - layout.frontX) / WIREFRAME_METRICS.side.wheelbase;

      const renderedFrontArchX = layout.bodyX + WIREFRAME_METRICS.side.frontWheelCx * scale;
      const renderedRearArchX = layout.bodyX + WIREFRAME_METRICS.side.rearWheelCx * scale;
      const renderedArchY = layout.bodyY + WIREFRAME_METRICS.side.wheelCy * scale;

      expect(renderedFrontArchX).toBeCloseTo(layout.frontX, 5);
      expect(renderedRearArchX).toBeCloseTo(layout.rearX, 5);
      expect(renderedArchY).toBeCloseTo(layout.wheelCenterY, 1);

      expect(layout.bodyX).toBeGreaterThan(80);
      expect(layout.bodyX + layout.bodyWidth).toBeLessThan(620);
      expect(layout.frontGaugeX).toBeGreaterThanOrEqual(82);
      expect(layout.rearGaugeX).toBeLessThanOrEqual(618);
      expect(layout.frontAeroX).toBeLessThan(layout.frontX);
      expect(layout.rearAeroX).toBeGreaterThan(layout.rearX);
    }
  });

  it('centers front and rear elevation wireframes cleanly and clamps splitter clearance', () => {
    for (const axle of ['front', 'rear'] as const) {
      for (const halfTrackPx of [134, 150, 158]) {
        const nominal = computeElevationWireframeRect(axle, 350, halfTrackPx, 315, 0);
        const m = WIREFRAME_METRICS[axle];
        expect(nominal.x + m.centerX * nominal.scale).toBeCloseTo(350, 6);
        expect(nominal.y).toBeGreaterThanOrEqual(32);
        expect(nominal.leftLabelX).toBeLessThanOrEqual(nominal.x - 12);
        expect(nominal.rightLabelX).toBeGreaterThanOrEqual(nominal.x + nominal.width + 12);

        const slammed = computeElevationWireframeRect(axle, 350, halfTrackPx, 315, 22);
        const bottomDatumY = slammed.y + m.groundY * slammed.scale;
        expect(bottomDatumY).toBeLessThanOrEqual(327);
        if (axle === 'front') {
          expect(bottomDatumY).toBeLessThanOrEqual(315.01);
        }
      }
    }
  });
});
