import React from 'react';
import Svg, {
  Circle,
  G,
  Image as SvgImage,
  Line,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import { SimulationResult, newtonsToLbs, phaseAccelerations } from '../../engine';
import type { ThemePalette } from '../../theme/colors';
import {
  arrowHeadPoints,
  computeSidePitchDeg,
  computeSideWireframeLayout,
} from './visualMath';

const SIDE_WIREFRAMES = {
  body: {
    dark: require('../../../assets/gt3-wireframe-side-dark.png'),
    light: require('../../../assets/gt3-wireframe-side-light.png'),
  },
  wheel: {
    dark: require('../../../assets/gt3-wireframe-wheel-dark.png'),
    light: require('../../../assets/gt3-wireframe-wheel-light.png'),
  },
} as const;

interface PitchAeroSvgProps {
  active: SimulationResult;
  reference?: SimulationResult | null;
  theme: ThemePalette;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Live X-Z side elevation (nose facing LEFT) illustrating static ride height / rake,
 * dynamic pitch (dive/squat), spring heave travel, SVIC anti-dive & anti-squat force lines,
 * CG longitudinal weight transfer, and speed-scaled aero downforce vectors + CoP.
 */
export function PitchAeroSvg({ active, reference, theme }: PitchAeroSvgProps) {
  const isDaylight = theme.mode === 'daylight';
  const bodySrc = SIDE_WIREFRAMES.body[isDaylight ? 'light' : 'dark'];
  const wheelSrc = SIDE_WIREFRAMES.wheel[isDaylight ? 'light' : 'dark'];

  const k = active.kinematics;
  const s = active.setup;

  const groundY = 304;
  const avgRideShiftY = clamp(
    (-(s.frontRideHeightDeltaMm + s.rearRideHeightDeltaMm) / 2) * 0.30,
    -12,
    8
  );
  const layout = computeSideWireframeLayout(s.wheelbaseMm, groundY, avgRideShiftY);
  const { midX, frontX, rearX, wheelR, wheelCenterY } = layout;

  const effectiveCgMm = k.rollMomentArmMm + k.rollAxisAtCgMm;
  const cgX = frontX + (1 - s.frontWeightFraction) * (rearX - frontX);
  const cgY = clamp(groundY - effectiveCgMm * 0.15, layout.bodyY + 26, groundY - 44);

  const frontAxleFzN = active.wheels.FL.dynamicFzN + active.wheels.FR.dynamicFzN;
  const rearAxleFzN = active.wheels.RL.dynamicFzN + active.wheels.RR.dynamicFzN;
  const frontTravelMm =
    (active.wheels.FL.suspensionDeflectionMm + active.wheels.FR.suspensionDeflectionMm) / 2;
  const rearTravelMm =
    (active.wheels.RL.suspensionDeflectionMm + active.wheels.RR.suspensionDeflectionMm) / 2;

  const visualPitchDeg = computeSidePitchDeg(k.bodyPitchDeg);

  // Reference ghost silhouette
  const refK = reference?.kinematics;
  const refAvgRideY = reference
    ? clamp(
        (-(reference.setup.frontRideHeightDeltaMm + reference.setup.rearRideHeightDeltaMm) / 2) *
          0.30,
        -12,
        8
      )
    : avgRideShiftY;
  const refLayout = reference
    ? computeSideWireframeLayout(reference.setup.wheelbaseMm, groundY, refAvgRideY)
    : null;
  const refPitchDeg = refK ? computeSidePitchDeg(refK.bodyPitchDeg) : 0;

  // Phase longitudinal acceleration to highlight active anti-geometry path
  const accel = phaseAccelerations(active.driver, active.driver.cornerPhase);
  const brakingActive = accel.longitudinalG < -0.02;
  const throttleActive = accel.longitudinalG > 0.02;

  // Anti-Dive line: from front contact patch (LEFT) rightward & up toward CG scaled by %AD
  const adFrac = clamp(s.frontAntiDivePct / 100, 0, 1);
  const adEndX = frontX + (cgX - frontX) * 0.54;
  const adEndY = groundY - (groundY - cgY) * Math.max(0.08, adFrac) * 0.54;

  // Anti-Squat line: from rear wheel center (RIGHT, IRS datum z = r_w) leftward & up scaled by %AS
  const asFrac = clamp(s.rearAntiSquatPct / 100, 0, 1);
  const asEndX = rearX - (rearX - cgX) * 0.54;
  const asEndY = wheelCenterY - (wheelCenterY - cgY) * Math.max(0.08, asFrac) * 0.54;

  // Aerodynamic downforce vectors & Center of Pressure (front = LEFT, rear = RIGHT)
  const totalAeroN = k.totalAeroDownforceN;
  const frontAeroN = totalAeroN * (s.aeroFrontBalancePct / 100);
  const rearAeroN = totalAeroN - frontAeroN;
  const copX = frontX + (1 - s.aeroFrontBalancePct / 100) * (rearX - frontX);
  const copLabelX = clamp(copX, layout.frontAeroX + 74, layout.rearAeroX - 74);

  const aeroArrowLen = (forceN: number) =>
    forceN > 10 ? clamp(16 + (forceN / 4500) * 52, 16, 68) : 0;
  const frontAeroLen = aeroArrowLen(frontAeroN);
  const rearAeroLen = aeroArrowLen(rearAeroN);
  const frontAeroY1 = 62;
  const frontAeroY2 = frontAeroY1 + frontAeroLen;
  const rearAeroY1 = 62;
  const rearAeroY2 = rearAeroY1 + rearAeroLen;

  // Longitudinal weight transfer arrow at CG (nose LEFT -> braking points left, throttle points right)
  const longN = k.longitudinalLoadTransferN;
  const longArrowLen = clamp(Math.abs(longN) / 5000, 0, 1) * 76;
  const longDir = longN < 0 ? -1 : 1;
  const longEndX = cgX + longDir * longArrowLen;
  const longArrowPts =
    longArrowLen > 8 ? arrowHeadPoints(cgX, cgY, longEndX, cgY, 9, 4) : '';

  const pitchLabel =
    Math.abs(k.bodyPitchDeg) < 0.02
      ? '0.00° level'
      : k.bodyPitchDeg < 0
      ? `${k.bodyPitchDeg.toFixed(2)}° dive`
      : `+${k.bodyPitchDeg.toFixed(2)}° squat`;

  const renderWheel = (wx: number, isFront: boolean) => (
    <G key={isFront ? 'front' : 'rear'}>
      <Circle
        cx={wx}
        cy={wheelCenterY}
        r={wheelR}
        fill={theme.canvasBg}
        fillOpacity={0.84}
      />
      <SvgImage
        href={wheelSrc}
        x={wx - layout.wheelSpriteSize / 2}
        y={wheelCenterY - layout.wheelSpriteSize / 2}
        width={layout.wheelSpriteSize}
        height={layout.wheelSpriteSize}
        opacity={isDaylight ? 0.78 : 0.88}
        preserveAspectRatio="xMidYMid meet"
      />
      <Circle
        cx={wx}
        cy={wheelCenterY}
        r={wheelR}
        fill="none"
        stroke={isFront ? theme.accentPrimary : theme.accentSecondary}
        strokeWidth={2.2}
        strokeOpacity={0.88}
      />
      <Circle
        cx={wx}
        cy={wheelCenterY}
        r={3.5}
        fill={isFront ? theme.accentPrimary : theme.accentSecondary}
      />
    </G>
  );

  const renderTravelGauge = (
    gx: number,
    travelMm: number,
    axleFzN: number,
    label: string,
    alignStart: boolean
  ) => {
    const gaugeH = 66;
    const midY = wheelCenterY;
    const fillOffset = clamp((travelMm / 40) * (gaugeH / 2), -gaugeH / 2, gaugeH / 2);
    const barColor =
      travelMm > 1 ? theme.warningColor : travelMm < -1 ? theme.accentPrimary : theme.neutralColor;
    const textX = alignStart ? gx + 12 : gx - 12;
    const anchor = alignStart ? 'start' : 'end';

    return (
      <G>
        <Rect
          x={gx - 4}
          y={midY - gaugeH / 2}
          width={8}
          height={gaugeH}
          rx={4}
          fill={theme.bgElevated}
          stroke={theme.borderSubtle}
        />
        <Line x1={gx - 7} x2={gx + 7} y1={midY} y2={midY} stroke={theme.textMuted} strokeWidth={1} />
        {Math.abs(fillOffset) > 1 && (
          <Rect
            x={gx - 3}
            y={fillOffset >= 0 ? midY : midY + fillOffset}
            width={6}
            height={Math.abs(fillOffset)}
            rx={2}
            fill={barColor}
          />
        )}
        <SvgText
          fontFamily="sans-serif"
          x={textX}
          y={midY - 12}
          textAnchor={anchor}
          fill={theme.textPrimary}
          fontSize={12}
          fontWeight="700"
        >
          {label}
        </SvgText>
        <SvgText
          fontFamily="sans-serif"
          x={textX}
          y={midY + 4}
          textAnchor={anchor}
          fill={barColor}
          fontSize={11.5}
          fontWeight="600"
        >
          {`${travelMm >= 0 ? '+' : ''}${travelMm.toFixed(1)} mm`}
        </SvgText>
        <SvgText
          fontFamily="sans-serif"
          x={textX}
          y={midY + 20}
          textAnchor={anchor}
          fill={theme.textSecondary}
          fontSize={11}
        >
          {`${Math.round(newtonsToLbs(axleFzN))} lb`}
        </SvgText>
      </G>
    );
  };

  return (
    <Svg
      viewBox="0 0 700 390"
      width="100%"
      height="100%"
      accessibilityLabel="Side view showing pitch attitude, anti-dive, anti-squat, and aerodynamic downforce"
    >
      <SvgText
        fontFamily="sans-serif"
        x={24}
        y={26}
        fill={theme.textMuted}
        fontSize={10}
        fontWeight="700"
        letterSpacing={1.4}
      >
        X-Z SIDE PITCH · ANTI-GEOMETRY · AERO DOWNFORCE
      </SvgText>
      <SvgText
        fontFamily="sans-serif"
        x={676}
        y={26}
        textAnchor="end"
        fill={theme.textMuted}
        fontSize={10}
      >
        ← FRONT  ·  REAR → (5× pitch clarity)
      </SvgText>

      {/* Ground plane */}
      <Line x1={32} y1={groundY} x2={668} y2={groundY} stroke={theme.border} strokeWidth={2} />

      {/* Baseline ghost wireframe silhouette */}
      {reference && refLayout && (
        <G transform={`rotate(${refPitchDeg}, ${midX}, ${wheelCenterY})`}>
          <SvgImage
            href={bodySrc}
            x={refLayout.bodyX}
            y={refLayout.bodyY}
            width={refLayout.bodyWidth}
            height={refLayout.bodyHeight}
            opacity={isDaylight ? 0.16 : 0.22}
            preserveAspectRatio="xMidYMid meet"
          />
        </G>
      )}

      {/* Grounded stationary CAD wireframe wheels */}
      {renderWheel(frontX, true)}
      {renderWheel(rearX, false)}

      {/* Pitched Mustang GT3 side CAD wireframe body */}
      <G transform={`rotate(${visualPitchDeg}, ${midX}, ${wheelCenterY})`}>
        <SvgImage
          href={bodySrc}
          x={layout.bodyX}
          y={layout.bodyY}
          width={layout.bodyWidth}
          height={layout.bodyHeight}
          opacity={isDaylight ? 0.48 : 0.64}
          preserveAspectRatio="xMidYMid meet"
        />
      </G>

      {/* Front Anti-Dive (LEFT) & Rear Anti-Squat (RIGHT) SVIC Force Paths */}
      {brakingActive && (
        <Line
          x1={frontX}
          y1={groundY}
          x2={adEndX}
          y2={adEndY}
          stroke={theme.canvasBg}
          strokeOpacity={0.62}
          strokeWidth={5.5}
        />
      )}
      <Line
        x1={frontX}
        y1={groundY}
        x2={adEndX}
        y2={adEndY}
        stroke={theme.accentPrimary}
        strokeWidth={brakingActive ? 2.6 : 1.6}
        strokeOpacity={brakingActive ? 0.96 : 0.52}
        strokeDasharray={brakingActive ? undefined : '4 4'}
      />
      <Rect
        x={adEndX - 66}
        y={adEndY - 19}
        width={64}
        height={16}
        rx={4}
        fill={theme.canvasBg}
        fillOpacity={0.78}
      />
      <SvgText
        fontFamily="sans-serif"
        x={adEndX - 6}
        y={adEndY - 7}
        textAnchor="end"
        fill={theme.accentPrimary}
        fontSize={10.5}
        fontWeight="700"
      >
        {`%AD ${s.frontAntiDivePct}%`}
      </SvgText>

      {throttleActive && (
        <Line
          x1={rearX}
          y1={wheelCenterY}
          x2={asEndX}
          y2={asEndY}
          stroke={theme.canvasBg}
          strokeOpacity={0.62}
          strokeWidth={5.5}
        />
      )}
      <Line
        x1={rearX}
        y1={wheelCenterY}
        x2={asEndX}
        y2={asEndY}
        stroke={theme.accentSecondary}
        strokeWidth={throttleActive ? 2.6 : 1.6}
        strokeOpacity={throttleActive ? 0.96 : 0.52}
        strokeDasharray={throttleActive ? undefined : '4 4'}
      />
      <Rect
        x={asEndX + 2}
        y={asEndY - 19}
        width={64}
        height={16}
        rx={4}
        fill={theme.canvasBg}
        fillOpacity={0.78}
      />
      <SvgText
        fontFamily="sans-serif"
        x={asEndX + 6}
        y={asEndY - 7}
        textAnchor="start"
        fill={theme.accentSecondary}
        fontSize={10.5}
        fontWeight="700"
      >
        {`%AS ${s.rearAntiSquatPct}%`}
      </SvgText>

      {/* Spring travel gauges: FRONT on LEFT, REAR on RIGHT */}
      {renderTravelGauge(layout.frontGaugeX, frontTravelMm, frontAxleFzN, 'FRONT', false)}
      {renderTravelGauge(layout.rearGaugeX, rearTravelMm, rearAxleFzN, 'REAR', true)}

      {/* CG & Longitudinal Weight Transfer Vector */}
      <Circle cx={cgX} cy={cgY} r={8} fill={theme.warningColor} stroke={theme.canvasBg} strokeWidth={2} />
      <Line x1={cgX - 10} x2={cgX + 10} y1={cgY} y2={cgY} stroke={theme.canvasBg} strokeWidth={1.6} />
      <Line x1={cgX} x2={cgX} y1={cgY - 10} y2={cgY + 10} stroke={theme.canvasBg} strokeWidth={1.6} />
      <Rect
        x={cgX - 38}
        y={cgY + 11}
        width={76}
        height={16}
        rx={4}
        fill={theme.canvasBg}
        fillOpacity={0.78}
      />
      <SvgText
        fontFamily="sans-serif"
        x={cgX}
        y={cgY + 23}
        textAnchor="middle"
        fill={theme.warningColor}
        fontSize={11}
        fontWeight="700"
      >
        {`CG (${Math.round(s.frontWeightFraction * 100)}/${Math.round((1 - s.frontWeightFraction) * 100)})`}
      </SvgText>
      {longArrowPts && (
        <G>
          <Line
            x1={cgX}
            y1={cgY}
            x2={longEndX}
            y2={cgY}
            stroke={theme.canvasBg}
            strokeOpacity={0.62}
            strokeWidth={6}
          />
          <Line x1={cgX} y1={cgY} x2={longEndX} y2={cgY} stroke={theme.warningColor} strokeWidth={3} />
          <Polygon points={longArrowPts} fill={theme.warningColor} />
          <Rect
            x={(cgX + longEndX) / 2 - 48}
            y={cgY - 24}
            width={96}
            height={16}
            rx={4}
            fill={theme.canvasBg}
            fillOpacity={0.78}
          />
          <SvgText
            fontFamily="sans-serif"
            x={(cgX + longEndX) / 2}
            y={cgY - 12}
            textAnchor="middle"
            fill={theme.warningColor}
            fontSize={10.5}
            fontWeight="700"
          >
            {`ΔFz,long ${Math.round(newtonsToLbs(Math.abs(longN)))} lb`}
          </SvgText>
        </G>
      )}

      {/* Aero Downforce Vectors (Front = LEFT above splitter, Rear = RIGHT above wing) & Center of Pressure */}
      {totalAeroN > 10 ? (
        <G>
          {frontAeroLen > 0 && (
            <G>
              <Line
                x1={layout.frontAeroX}
                y1={frontAeroY1}
                x2={layout.frontAeroX}
                y2={frontAeroY2}
                stroke={theme.accentPrimary}
                strokeWidth={2.8}
              />
              <Polygon
                points={arrowHeadPoints(
                  layout.frontAeroX,
                  frontAeroY1,
                  layout.frontAeroX,
                  frontAeroY2,
                  9,
                  4
                )}
                fill={theme.accentPrimary}
              />
              <SvgText
                fontFamily="sans-serif"
                x={layout.frontAeroX}
                y={frontAeroY1 - 6}
                textAnchor="middle"
                fill={theme.accentPrimary}
                fontSize={11}
                fontWeight="700"
              >
                {`Front aero ${Math.round(newtonsToLbs(frontAeroN))} lb`}
              </SvgText>
            </G>
          )}
          {rearAeroLen > 0 && (
            <G>
              <Line
                x1={layout.rearAeroX}
                y1={rearAeroY1}
                x2={layout.rearAeroX}
                y2={rearAeroY2}
                stroke={theme.accentSecondary}
                strokeWidth={2.8}
              />
              <Polygon
                points={arrowHeadPoints(
                  layout.rearAeroX,
                  rearAeroY1,
                  layout.rearAeroX,
                  rearAeroY2,
                  9,
                  4
                )}
                fill={theme.accentSecondary}
              />
              <SvgText
                fontFamily="sans-serif"
                x={layout.rearAeroX}
                y={rearAeroY1 - 6}
                textAnchor="middle"
                fill={theme.accentSecondary}
                fontSize={11}
                fontWeight="700"
              >
                {`Rear aero ${Math.round(newtonsToLbs(rearAeroN))} lb`}
              </SvgText>
            </G>
          )}
          <Line
            x1={copX}
            y1={74}
            x2={copX}
            y2={110}
            stroke={theme.textMuted}
            strokeWidth={1.4}
            strokeDasharray="3 3"
          />
          <SvgText
            fontFamily="sans-serif"
            x={copLabelX}
            y={66}
            textAnchor="middle"
            fill={theme.textSecondary}
            fontSize={10.5}
            fontWeight="700"
          >
            {`Aero CoP (${Math.round(s.aeroFrontBalancePct)}% F)`}
          </SvgText>
        </G>
      ) : (
        <SvgText
          fontFamily="sans-serif"
          x={350}
          y={60}
          textAnchor="middle"
          fill={theme.textMuted}
          fontSize={11}
        >
          0 lb aero downforce at current speed / C_L A
        </SvgText>
      )}

      {/* Bottom Telemetry Strip */}
      <Rect
        x={24}
        y={344}
        width={652}
        height={36}
        rx={8}
        fill={theme.bgElevated}
        stroke={theme.borderSubtle}
      />
      <SvgText
        fontFamily="sans-serif"
        x={350}
        y={366}
        textAnchor="middle"
        fill={theme.textSecondary}
        fontSize={11}
        fontWeight="600"
      >
        {`Pitch ${pitchLabel}  ·  Ride height F/R ${s.frontRideHeightDeltaMm}/${s.rearRideHeightDeltaMm} mm  ·  Total aero ${Math.round(newtonsToLbs(totalAeroN))} lb`}
      </SvgText>
    </Svg>
  );
}
