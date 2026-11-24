import React from 'react';
import Svg, {
  Circle,
  G,
  Image as SvgImage,
  Line,
  Path,
  Polygon,
  Rect,
  Text as SvgText,
} from 'react-native-svg';
import {
  SimulationResult,
  newtonsToLbs,
} from '../../engine';
import type { ThemePalette } from '../../theme/colors';
import { arrowHeadPoints, computeElevationWireframeRect } from './visualMath';

const ELEVATION_WIREFRAMES = {
  front: {
    dark: require('../../../assets/gt3-wireframe-front-dark.png'),
    light: require('../../../assets/gt3-wireframe-front-light.png'),
  },
  rear: {
    dark: require('../../../assets/gt3-wireframe-rear-dark.png'),
    light: require('../../../assets/gt3-wireframe-rear-light.png'),
  },
} as const;

interface RollElevationSvgProps {
  active: SimulationResult;
  reference?: SimulationResult | null;
  axle: 'front' | 'rear';
  theme: ThemePalette;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Live Y-Z elevation cross-section showing suspension linkage geometry,
 * dynamic camber tilt, roll center migration (including subterranean over-lowering),
 * CG height, roll moment arm h_roll, body roll, ARB, and jacking force.
 */
export function RollElevationSvg({
  active,
  reference,
  axle,
  theme,
}: RollElevationSvgProps) {
  const isFront = axle === 'front';
  const isDaylight = theme.mode === 'daylight';
  const k = active.kinematics;
  const s = active.setup;
  const leftWheel = active.wheels[isFront ? 'FL' : 'RL'];
  const rightWheel = active.wheels[isFront ? 'FR' : 'RR'];

  const geometry = isFront ? s.frontGeometry : s.rearGeometry;
  const trackMm = isFront ? s.frontTrackMm : s.rearTrackMm;
  const rideDeltaMm = isFront ? s.frontRideHeightDeltaMm : s.rearRideHeightDeltaMm;
  const staticRcMm = isFront ? k.staticFrontRollCenterMm : k.staticRearRollCenterMm;
  const effectiveRcMm = isFront ? k.effectiveFrontRollCenterMm : k.effectiveRearRollCenterMm;
  const arbNmDeg = isFront ? s.frontArbStiffnessNmPerDeg : s.rearArbStiffnessNmPerDeg;
  const jackingN = isFront ? k.frontJackingForceN : k.rearJackingForceN;
  const latTransferN = isFront ? k.frontLateralLoadTransferN : k.rearLateralLoadTransferN;

  // Approximate live CG height above ground from rollMomentArm + rollAxisAtCg
  const effectiveCgMm = k.rollMomentArmMm + k.rollAxisAtCgMm;

  const cx = 350;
  const groundY = 315;
  const pxPerMm = 0.42;

  const halfTrackPx = clamp(150 * (trackMm / 1550), 134, 158);
  const leftX = cx - halfTrackPx;
  const rightX = cx + halfTrackPx;

  const cgY = clamp(groundY - effectiveCgMm * pxPerMm, 52, groundY - 24);
  const rcY = clamp(groundY - effectiveRcMm * pxPerMm, 115, 360);
  const isSubterraneanRc = effectiveRcMm < 0;
  const isOverLowered = isFront
    ? effectiveRcMm < 0 || rideDeltaMm < -20
    : effectiveRcMm < 0 || rideDeltaMm < -28;

  const turnSign = active.driver.turnDirection === 'left' ? 1 : -1;
  const visualRollDeg = clamp(turnSign * k.bodyRollDeg * 2.5, -18, 18);

  // Reference (baseline / current) ghost markers
  const refK = reference?.kinematics;
  const refEffectiveRcMm = refK
    ? isFront
      ? refK.effectiveFrontRollCenterMm
      : refK.effectiveRearRollCenterMm
    : null;
  const refCgMm = refK ? refK.rollMomentArmMm + refK.rollAxisAtCgMm : null;
  const refRcY = refEffectiveRcMm !== null ? clamp(groundY - refEffectiveRcMm * pxPerMm, 115, 360) : null;
  const refCgY = refCgMm !== null ? clamp(groundY - refCgMm * pxPerMm, 52, groundY - 24) : null;
  const refTurnSign = reference ? (reference.driver.turnDirection === 'left' ? 1 : -1) : turnSign;
  const refVisualRollDeg = refK ? clamp(refTurnSign * refK.bodyRollDeg * 2.5, -18, 18) : 0;

  // Tire visual dimensions (2.5x camber clarity around contact patch)
  const tireW = clamp(46 * (((leftWheel.tireWidthMm + rightWheel.tireWidthMm) / 2) / 255), 36, 56);
  const tireH = 104;
  const leftTireTilt = clamp(-leftWheel.dynamicCamberDeg * 2.5, -16, 16);
  const rightTireTilt = clamp(rightWheel.dynamicCamberDeg * 2.5, -16, 16);

  // Suspension linkage anchor heights (reflecting ride height drop & wheel deflection)
  const bodyRideShiftY = clamp(-rideDeltaMm * 0.55, -18, 22);
  const wireframeSrc = ELEVATION_WIREFRAMES[axle][isDaylight ? 'light' : 'dark'];
  const wireframeRect = computeElevationWireframeRect(
    axle,
    cx,
    halfTrackPx,
    groundY,
    bodyRideShiftY
  );
  const refRideDeltaMm = reference
    ? isFront
      ? reference.setup.frontRideHeightDeltaMm
      : reference.setup.rearRideHeightDeltaMm
    : rideDeltaMm;
  const refBodyRideShiftY = clamp(-refRideDeltaMm * 0.55, -18, 22);
  const refWireframeRect = reference
    ? computeElevationWireframeRect(axle, cx, halfTrackPx, groundY, refBodyRideShiftY)
    : null;
  const leftDeflShift = clamp(leftWheel.suspensionDeflectionMm * 0.35, -16, 16);
  const rightDeflShift = clamp(rightWheel.suspensionDeflectionMm * 0.35, -16, 16);

  const lcaOutYLeft = groundY - 38;
  const lcaOutYRight = groundY - 38;
  const lcaInBaseY = groundY - 50 + bodyRideShiftY;
  const lcaInYLeft = clamp(lcaInBaseY + leftDeflShift * 0.5, groundY - 76, groundY - 18);
  const lcaInYRight = clamp(lcaInBaseY + rightDeflShift * 0.5, groundY - 76, groundY - 18);

  const lcaSlopeColor = (inY: number, outY: number) =>
    inY > outY + 1 ? theme.criticalColor : isOverLowered ? theme.warningColor : theme.textSecondary;

  const rcColor = isSubterraneanRc
    ? theme.criticalColor
    : isOverLowered
    ? theme.warningColor
    : theme.neutralColor;

  const arbStrokeW = 3 + clamp(arbNmDeg / 950, 0, 1) * 9;
  const arbColor = isFront ? theme.accentPrimary : theme.accentSecondary;

  // Jacking arrow centered at RC
  const jackScale = clamp(Math.abs(jackingN) / 1400, 0, 1) * 44;
  const jackEndY = jackingN >= 0 ? rcY - jackScale : rcY + jackScale;
  const jackArrowPts = Math.abs(jackScale) > 6 ? arrowHeadPoints(cx, rcY, cx, jackEndY, 8, 4) : '';

  // Roll moment arm brace at cx - 28
  const dimX = cx - 28;
  const dimTopArrow = Math.abs(rcY - cgY) > 22 ? arrowHeadPoints(dimX, rcY, dimX, cgY, 8, 3.8) : '';
  const dimBotArrow = Math.abs(rcY - cgY) > 22 ? arrowHeadPoints(dimX, cgY, dimX, rcY, 8, 3.8) : '';

  const renderWheel = (
    wx: number,
    labelX: number,
    tiltDeg: number,
    camberDeg: number,
    fzN: number,
    isOutside: boolean,
    label: 'FL' | 'FR' | 'RL' | 'RR',
    alignRight: boolean
  ) => {
    const unloaded = fzN <= 0;
    const fzRatio = clamp(fzN / Math.max(1, active.setup.massKg * 9.81 * 0.45), 0.1, 1.15);
    const barW = unloaded ? 0 : Math.round(fzRatio * 64);
    const tireStroke = unloaded
      ? theme.criticalColor
      : isOutside
      ? theme.accentPrimary
      : theme.textMuted;

    return (
      <G key={label}>
        <G transform={`translate(${wx}, ${groundY}) rotate(${tiltDeg})`}>
          <Rect
            x={-tireW / 2}
            y={-tireH}
            width={tireW}
            height={tireH}
            rx={8}
            fill={isDaylight ? '#1E293B' : '#141E29'}
            fillOpacity={unloaded ? 0.32 : 0.84}
            stroke={tireStroke}
            strokeWidth={unloaded ? 1.8 : 2.2}
            strokeDasharray={unloaded ? '4 3' : undefined}
          />
          {/* Subtle longitudinal tread ribs */}
          <Line
            x1={-tireW * 0.18}
            x2={-tireW * 0.18}
            y1={-tireH + 10}
            y2={-8}
            stroke={theme.border}
            strokeOpacity={0.45}
            strokeWidth={1}
          />
          <Line
            x1={tireW * 0.18}
            x2={tireW * 0.18}
            y1={-tireH + 10}
            y2={-8}
            stroke={theme.border}
            strokeOpacity={0.45}
            strokeWidth={1}
          />
          {/* Rim / brake hub profile */}
          <Rect
            x={-tireW / 2 + 6}
            y={-tireH + 16}
            width={tireW - 12}
            height={tireH - 32}
            rx={4}
            fill={isDaylight ? '#334155' : '#0B121A'}
            fillOpacity={unloaded ? 0.4 : 0.88}
            stroke={theme.border}
            strokeWidth={1}
          />
          {/* Contact patch highlight */}
          {!unloaded && (
            <Line
              x1={-tireW / 2 + 4}
              x2={tireW / 2 - 4}
              y1={-1.5}
              y2={-1.5}
              stroke={theme.warningColor}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
        </G>

        {/* Wheel label + camber readout outside widebody fender */}
        <SvgText
          fontFamily="sans-serif"
          x={labelX}
          y={groundY - tireH + 16}
          textAnchor={alignRight ? 'start' : 'end'}
          fill={theme.textPrimary}
          fontSize={13}
          fontWeight="700"
        >
          {label}
        </SvgText>
        <SvgText
          fontFamily="sans-serif"
          x={labelX}
          y={groundY - tireH + 34}
          textAnchor={alignRight ? 'start' : 'end'}
          fill={Math.abs(camberDeg) > 2.5 || camberDeg > 0.2 ? theme.warningColor : theme.textSecondary}
          fontSize={12}
          fontWeight="600"
        >
          {camberDeg.toFixed(2)}° cam
        </SvgText>
        <SvgText
          fontFamily="sans-serif"
          x={labelX}
          y={groundY - tireH + 50}
          textAnchor={alignRight ? 'start' : 'end'}
          fill={theme.textMuted}
          fontSize={10.5}
        >
          {isOutside ? 'OUTSIDE' : 'INSIDE'}
        </SvgText>

        {/* Normal load meter below ground line */}
        <Rect
          x={wx - 34}
          y={groundY + 12}
          width={68}
          height={7}
          rx={3.5}
          fill={theme.bgElevated}
          stroke={theme.borderSubtle}
        />
        {barW > 0 && (
          <Rect
            x={wx - 34}
            y={groundY + 12}
            width={barW}
            height={7}
            rx={3.5}
            fill={isOutside ? theme.accentPrimary : theme.neutralColor}
          />
        )}
        <SvgText
          fontFamily="sans-serif"
          x={wx}
          y={groundY + 34}
          textAnchor="middle"
          fill={unloaded ? theme.criticalColor : theme.textPrimary}
          fontSize={12}
          fontWeight="700"
        >
          {unloaded ? 'UNLOADED' : `${Math.round(newtonsToLbs(fzN))} lb`}
        </SvgText>
      </G>
    );
  };

  const renderLinkage = (isLeftSide: boolean) => {
    const dir = isLeftSide ? -1 : 1;
    const wx = isLeftSide ? leftX : rightX;
    const outX = wx - dir * 14;
    const inLcaX = cx + dir * 58;
    const inUcaX = cx + dir * 74;
    const inLcaY = isLeftSide ? lcaInYLeft : lcaInYRight;
    const outLcaY = isLeftSide ? lcaOutYLeft : lcaOutYRight;
    const deflShift = isLeftSide ? leftDeflShift : rightDeflShift;
    const ubjY = clamp(groundY - 94 + deflShift * 0.25, groundY - 115, groundY - 70);
    const inUcaY = clamp(groundY - 102 + bodyRideShiftY + deflShift * 0.45, groundY - 126, groundY - 65);
    const towerX = cx + dir * Math.round(halfTrackPx * 0.76);
    const towerY = clamp(groundY - 178 + bodyRideShiftY, 95, groundY - 120);

    return (
      <G key={isLeftSide ? 'L' : 'R'}>
        {/* Virtual swing-arm line from contact patch through Roll Center */}
        <Line
          x1={wx}
          y1={groundY}
          x2={cx}
          y2={rcY}
          stroke={rcColor}
          strokeOpacity={0.55}
          strokeWidth={1.6}
          strokeDasharray="4 4"
        />

        {/* Lower Control Arm (with canvas halo for contrast over wireframe) */}
        <Line
          x1={inLcaX}
          y1={inLcaY}
          x2={outX}
          y2={outLcaY}
          stroke={theme.canvasBg}
          strokeOpacity={0.62}
          strokeWidth={7}
          strokeLinecap="round"
        />
        <Line
          x1={inLcaX}
          y1={inLcaY}
          x2={outX}
          y2={outLcaY}
          stroke={lcaSlopeColor(inLcaY, outLcaY)}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <Circle cx={inLcaX} cy={inLcaY} r={4} fill={theme.warningColor} />
        <Circle cx={outX} cy={outLcaY} r={4} fill={theme.warningColor} />

        {geometry === 'macpherson' ? (
          <>
            {/* Telescopic MacPherson Strut & Coil */}
            <Line
              x1={outX}
              y1={groundY - 62}
              x2={towerX}
              y2={towerY}
              stroke={theme.canvasBg}
              strokeOpacity={0.62}
              strokeWidth={6.2}
              strokeLinecap="round"
            />
            <Line
              x1={outX}
              y1={groundY - 62}
              x2={towerX}
              y2={towerY}
              stroke={theme.accentPrimary}
              strokeWidth={3.2}
            />
            <Line
              x1={outX + dir * 2}
              y1={outLcaY}
              x2={outX}
              y2={groundY - 62}
              stroke={theme.canvasBg}
              strokeOpacity={0.62}
              strokeWidth={7}
              strokeLinecap="round"
            />
            <Line
              x1={outX + dir * 2}
              y1={outLcaY}
              x2={outX}
              y2={groundY - 62}
              stroke={theme.textSecondary}
              strokeWidth={4}
            />
            <Circle cx={towerX} cy={towerY} r={4.5} fill={theme.accentPrimary} />
          </>
        ) : (
          <>
            {/* Upright */}
            <Line
              x1={outX}
              y1={outLcaY}
              x2={outX + dir * 4}
              y2={ubjY}
              stroke={theme.canvasBg}
              strokeOpacity={0.62}
              strokeWidth={7}
              strokeLinecap="round"
            />
            <Line
              x1={outX}
              y1={outLcaY}
              x2={outX + dir * 4}
              y2={ubjY}
              stroke={theme.textSecondary}
              strokeWidth={4}
            />
            {/* Upper Control Arm / Multi-link upper arms */}
            <Line
              x1={inUcaX}
              y1={inUcaY}
              x2={outX + dir * 4}
              y2={ubjY}
              stroke={theme.canvasBg}
              strokeOpacity={0.62}
              strokeWidth={6.2}
              strokeLinecap="round"
            />
            <Line
              x1={inUcaX}
              y1={inUcaY}
              x2={outX + dir * 4}
              y2={ubjY}
              stroke={geometry === 'multilink' ? theme.accentSecondary : theme.textPrimary}
              strokeWidth={3.2}
              strokeLinecap="round"
            />
            {geometry === 'multilink' && (
              <Line
                x1={inUcaX - dir * 8}
                y1={inUcaY + 12}
                x2={outX + dir * 2}
                y2={ubjY + 8}
                stroke={theme.textMuted}
                strokeWidth={2}
                strokeDasharray="3 2"
              />
            )}
            {/* Coilover */}
            <Line
              x1={outX + dir * 18}
              y1={outLcaY - 8}
              x2={towerX}
              y2={towerY + 14}
              stroke={theme.canvasBg}
              strokeOpacity={0.62}
              strokeWidth={5.5}
              strokeLinecap="round"
            />
            <Line
              x1={outX + dir * 18}
              y1={outLcaY - 8}
              x2={towerX}
              y2={towerY + 14}
              stroke={theme.accentPrimary}
              strokeWidth={2.5}
              strokeDasharray="4 2"
            />
            <Circle cx={inUcaX} cy={inUcaY} r={3.5} fill={theme.accentPrimary} />
            <Circle cx={outX + dir * 4} cy={ubjY} r={3.5} fill={theme.accentPrimary} />
          </>
        )}
      </G>
    );
  };

  const bodyBottom = clamp(groundY - 46 + bodyRideShiftY, groundY - 90, groundY - 18);

  return (
    <Svg
      viewBox="0 0 700 430"
      width="100%"
      height="100%"
      accessibilityLabel={`${axle} axle roll and roll center elevation diagram`}
    >
      {/* Header badge */}
      <SvgText
        fontFamily="sans-serif"
        x={24}
        y={26}
        fill={theme.textMuted}
        fontSize={10}
        fontWeight="700"
        letterSpacing={1.4}
      >
        {`${axle.toUpperCase()} AXLE Y-Z KINEMATICS · ${geometry.replace('_', ' ').toUpperCase()}`}
      </SvgText>
      <SvgText
        fontFamily="sans-serif"
        x={676}
        y={26}
        textAnchor="end"
        fill={theme.textMuted}
        fontSize={10}
      >
        2.5× visual roll &amp; camber clarity
      </SvgText>

      {/* Subterranean warning zone below ground when RC < 0 */}
      {isSubterraneanRc && (
        <Rect
          x={40}
          y={groundY}
          width={620}
          height={64}
          rx={6}
          fill={theme.criticalColor}
          fillOpacity={0.09}
        />
      )}

      {/* Vehicle vertical centerline */}
      <Line
        x1={cx}
        y1={42}
        x2={cx}
        y2={394}
        stroke={theme.canvasGrid}
        strokeDasharray="4 4"
      />

      {/* Ground plane z = 0 */}
      <Line x1={36} y1={groundY} x2={664} y2={groundY} stroke={theme.border} strokeWidth={2} />
      <SvgText
        fontFamily="sans-serif"
        x={44}
        y={groundY - 8}
        fill={theme.textMuted}
        fontSize={10}
        fontWeight="700"
      >
        GROUND (z = 0 mm)
      </SvgText>

      {/* Reference / Baseline ghost wireframe & markers */}
      {reference && refRcY !== null && refCgY !== null && refWireframeRect && (
        <G>
          <G transform={`rotate(${refVisualRollDeg}, ${cx}, ${refRcY})`}>
            <SvgImage
              href={wireframeSrc}
              x={refWireframeRect.x}
              y={refWireframeRect.y}
              width={refWireframeRect.width}
              height={refWireframeRect.height}
              opacity={isDaylight ? 0.16 : 0.22}
              preserveAspectRatio="xMidYMid meet"
            />
          </G>
          <Circle cx={cx} cy={refRcY} r={5} fill="none" stroke={theme.textMuted} strokeWidth={1.6} strokeDasharray="2 2" />
          <Circle cx={cx} cy={refCgY} r={6} fill="none" stroke={theme.textMuted} strokeWidth={1.6} strokeDasharray="2 2" />
        </G>
      )}

      {/* Rolled sprung Mustang GT3 CAD wireframe + integrated ARB */}
      <G transform={`rotate(${visualRollDeg}, ${cx}, ${rcY})`}>
        <SvgImage
          href={wireframeSrc}
          x={wireframeRect.x}
          y={wireframeRect.y}
          width={wireframeRect.width}
          height={wireframeRect.height}
          opacity={isDaylight ? 0.42 : 0.56}
          preserveAspectRatio="xMidYMid meet"
        />
        {/* Anti-roll bar across axle with contrast halo */}
        <Path
          d={`M ${cx - 108} ${bodyBottom - 10} L ${cx - 88} ${bodyBottom - 22} L ${cx + 88} ${bodyBottom - 22} L ${cx + 108} ${bodyBottom - 10}`}
          fill="none"
          stroke={theme.canvasBg}
          strokeOpacity={0.65}
          strokeWidth={arbStrokeW + 4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path
          d={`M ${cx - 108} ${bodyBottom - 10} L ${cx - 88} ${bodyBottom - 22} L ${cx + 88} ${bodyBottom - 22} L ${cx + 108} ${bodyBottom - 10}`}
          fill="none"
          stroke={arbColor}
          strokeWidth={arbStrokeW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </G>

      {/* Suspension linkages */}
      {renderLinkage(true)}
      {renderLinkage(false)}

      {/* Left and Right Tires */}
      {renderWheel(
        leftX,
        wireframeRect.leftLabelX,
        leftTireTilt,
        leftWheel.dynamicCamberDeg,
        leftWheel.dynamicFzN,
        leftWheel.isOutside,
        isFront ? 'FL' : 'RL',
        false
      )}
      {renderWheel(
        rightX,
        wireframeRect.rightLabelX,
        rightTireTilt,
        rightWheel.dynamicCamberDeg,
        rightWheel.dynamicFzN,
        rightWheel.isOutside,
        isFront ? 'FR' : 'RR',
        true
      )}

      {/* Roll moment arm h_roll brace */}
      {Math.abs(rcY - cgY) > 14 && (
        <G>
          <Line
            x1={dimX}
            y1={cgY}
            x2={dimX}
            y2={rcY}
            stroke={theme.canvasBg}
            strokeOpacity={0.65}
            strokeWidth={5}
          />
          <Line
            x1={dimX}
            y1={cgY}
            x2={dimX}
            y2={rcY}
            stroke={theme.warningColor}
            strokeWidth={2}
          />
          {dimTopArrow && <Polygon points={dimTopArrow} fill={theme.warningColor} />}
          {dimBotArrow && <Polygon points={dimBotArrow} fill={theme.warningColor} />}
          <Rect
            x={dimX - 96}
            y={(cgY + rcY) / 2 - 9}
            width={92}
            height={18}
            rx={4}
            fill={theme.canvasBg}
            fillOpacity={0.78}
          />
          <SvgText
            fontFamily="sans-serif"
            x={dimX - 8}
            y={(cgY + rcY) / 2 + 4}
            textAnchor="end"
            fill={theme.warningColor}
            fontSize={11.5}
            fontWeight="700"
          >
            h_roll {k.rollMomentArmMm.toFixed(0)} mm
          </SvgText>
        </G>
      )}

      {/* CG marker */}
      <Circle cx={cx} cy={cgY} r={8} fill={theme.warningColor} stroke={theme.canvasBg} strokeWidth={2} />
      <Line x1={cx - 11} x2={cx + 11} y1={cgY} y2={cgY} stroke={theme.canvasBg} strokeWidth={1.6} />
      <Line x1={cx} x2={cx} y1={cgY - 11} y2={cgY + 11} stroke={theme.canvasBg} strokeWidth={1.6} />
      <Rect
        x={cx + 10}
        y={cgY - 9}
        width={88}
        height={18}
        rx={4}
        fill={theme.canvasBg}
        fillOpacity={0.78}
      />
      <SvgText
        fontFamily="sans-serif"
        x={cx + 14}
        y={cgY + 4}
        fill={theme.warningColor}
        fontSize={11.5}
        fontWeight="700"
      >
        CG {effectiveCgMm.toFixed(0)} mm
      </SvgText>

      {/* Roll Center marker */}
      <Circle cx={cx} cy={rcY} r={7} fill={rcColor} stroke={theme.canvasBg} strokeWidth={2} />
      <Rect
        x={cx + 9}
        y={rcY - 9}
        width={isSubterraneanRc ? 84 : 80}
        height={isSubterraneanRc ? 30 : 18}
        rx={4}
        fill={theme.canvasBg}
        fillOpacity={0.78}
      />
      <SvgText
        fontFamily="sans-serif"
        x={cx + 12}
        y={rcY + 4}
        fill={rcColor}
        fontSize={12}
        fontWeight="700"
      >
        {`RC ${effectiveRcMm.toFixed(0)} mm`}
      </SvgText>
      {isSubterraneanRc && (
        <SvgText
          fontFamily="sans-serif"
          x={cx + 12}
          y={rcY + 17}
          fill={rcColor}
          fontSize={9.5}
          fontWeight="700"
          letterSpacing={0.6}
        >
          UNDERGROUND
        </SvgText>
      )}

      {/* Jacking force arrow */}
      {jackArrowPts && (
        <G>
          <Line
            x1={cx}
            y1={rcY}
            x2={cx}
            y2={jackEndY}
            stroke={theme.accentPrimary}
            strokeWidth={2.5}
          />
          <Polygon points={jackArrowPts} fill={theme.accentPrimary} />
        </G>
      )}

      {/* Bottom Telemetry Strip */}
      <Rect
        x={24}
        y={386}
        width={652}
        height={36}
        rx={8}
        fill={theme.bgElevated}
        stroke={theme.borderSubtle}
      />
      <SvgText
        fontFamily="sans-serif"
        x={350}
        y={408}
        textAnchor="middle"
        fill={theme.textSecondary}
        fontSize={11}
        fontWeight="600"
      >
        {`Roll ${k.bodyRollDeg.toFixed(2)}°  ·  Static RC ${staticRcMm.toFixed(0)} → Dyn ${effectiveRcMm.toFixed(0)} mm  ·  Transfer ${Math.round(newtonsToLbs(Math.abs(latTransferN)))} lb  ·  Jacking ${Math.round(jackingN)} N`}
      </SvgText>
    </Svg>
  );
}
