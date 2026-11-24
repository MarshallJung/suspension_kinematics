import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  CornerPhase,
  SimulationResult,
  WheelId,
  WheelTelemetry,
  calculateAckermannSteerAngles,
  kmhToMph,
  newtonsToLbs,
  phaseAccelerations,
} from '../../engine';
import type { ThemePalette } from '../../theme/colors';
import { formatSignedDelta } from '../../utils/setupDiff';
import { PitchAeroSvg } from './PitchAeroSvg';
import { RollElevationSvg } from './RollElevationSvg';
import { TyreGlyph } from './TyreGlyph';
import { VectorChassisSvg } from './VectorChassisSvg';
import { useAnimatedVisualState } from './useAnimatedVisualState';
import {
  LIVERY_SPRITE_RECT,
  TOP_DOWN_POSITIONS,
  TOP_DOWN_WIREFRAME_RECT,
  arrowHeadPoints,
  computeCornerForceScales,
} from './visualMath';

const TOP_DOWN_WIREFRAMES = {
  dark: require('../../../assets/gt3-wireframe-top-down-dark.png'),
  light: require('../../../assets/gt3-wireframe-top-down-light.png'),
} as const;

interface ChassisTopDownCanvasProps {
  sim: SimulationResult;
  baselineSim?: SimulationResult | null;
  previewSim?: SimulationResult | null;
  previewTitle?: string | null;
  previewBannerLabel?: string;
  selectedWheel: WheelId | null;
  onSelectWheel: (wheel: WheelId) => void;
  onSelectPhase: (phase: CornerPhase) => void;
  onToggleTurnDirection: () => void;
  theme: ThemePalette;
}

type CanvasViewMode = 'top_down' | 'roll_rc' | 'pitch_aero';
type ChassisSkin = 'wireframe' | 'livery' | 'vector';

const WHEELS: WheelId[] = ['FL', 'FR', 'RL', 'RR'];

const usageColor = (w: WheelTelemetry, t: ThemePalette) =>
  w.dynamicFzN <= 0 || w.gripUtilizationPct > 100
    ? t.criticalColor
    : w.gripUtilizationPct > 85
    ? t.warningColor
    : t.accentPrimary;

const balanceColor = (score: number, t: ThemePalette) =>
  score > 6 ? t.understeerColor : score < -6 ? t.oversteerColor : t.neutralColor;

const scoreName = (score: number) =>
  Math.abs(score) < 6
    ? 'Near neutral'
    : `${Math.abs(score).toFixed(0)} ${score > 0 ? 'understeer' : 'oversteer'}`;

export function ChassisTopDownCanvas({
  sim,
  baselineSim,
  previewSim,
  previewTitle,
  previewBannerLabel,
  selectedWheel,
  onSelectWheel,
  onSelectPhase,
  onToggleTurnDirection,
  theme,
}: ChassisTopDownCanvasProps) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const maxFigureHeight = Math.max(
    viewportHeight < 500 ? 240 : 320,
    Math.min(540, viewportHeight - 280)
  );

  const [viewMode, setViewMode] = useState<CanvasViewMode>('top_down');
  const [rollAxle, setRollAxle] = useState<'front' | 'rear'>('front');
  const [chassisSkin, setChassisSkin] = useState<ChassisSkin>('wireframe');
  const [sharedScale, setSharedScale] = useState(true);
  const [engineering, setEngineering] = useState(true);
  const [enhancedTyres, setEnhancedTyres] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [figureWidth, setFigureWidth] = useState(700);

  const fontScale = Math.min(1.35, Math.max(1, 560 / figureWidth));
  const compact = figureWidth < 500;
  const narrowFigure = figureWidth < 410;
  const veryNarrow = viewportWidth < 370;

  const active = previewSim ?? sim;
  const reference = previewSim ? sim : baselineSim;
  const referenceLabel = previewSim ? 'current setup' : 'baseline';

  const transitionKey = `${active.setup.drivetrain}|${active.driver.cornerPhase}|${active.driver.turnDirection}|${previewSim ? '1' : '0'}`;
  const animatedActive = useAnimatedVisualState(active, transitionKey);

  const selected =
    selectedWheel ?? (active.driver.turnDirection === 'left' ? 'FR' : 'FL');
  const wheel = active.wheels[selected];
  const refWheel = reference?.wheels[selected];
  const turnSign = animatedActive.driver.turnDirection === 'left' ? -1 : 1;
  const k = active.kinematics;
  const animK = animatedActive.kinematics;

  const speedMs = animatedActive.driver.speedKmh / 3.6;
  const lateralG = phaseAccelerations(
    animatedActive.driver,
    animatedActive.driver.cornerPhase
  ).lateralG;
  const nominalSteerDeg =
    speedMs > 0
      ? (Math.atan(
          ((animatedActive.setup.wheelbaseMm / 1000) * 9.81 * lateralG) /
            (speedMs * speedMs)
        ) *
          180) /
        Math.PI
      : 0;
  const geometricSteer =
    nominalSteerDeg > 0
      ? calculateAckermannSteerAngles({
          nominalSteerAngleDeg: nominalSteerDeg,
          trackWidthMm: animatedActive.setup.frontTrackMm,
          wheelbaseMm: animatedActive.setup.wheelbaseMm,
          ackermannPct: animatedActive.setup.ackermannPct,
          frontStaticToeDeg: 0,
        })
      : { insideSteerDeg: 0, outsideSteerDeg: 0 };

  const fY = TOP_DOWN_POSITIONS.FL.y; // 152
  const rY = TOP_DOWN_POSITIONS.RL.y; // 414
  const cgY = fY + (1 - animatedActive.setup.frontWeightFraction) * (rY - fY);

  const frontBarWidth =
    2 + (Math.max(0, animatedActive.setup.frontArbStiffnessNmPerDeg) / 950) * 11;
  const rearBarWidth =
    2 + (Math.max(0, animatedActive.setup.rearArbStiffnessNmPerDeg) / 950) * 11;

  const transferScale = 70 / Math.max(1, animatedActive.setup.massKg * 9.81 * 0.5);
  const transferX =
    -turnSign *
    (animK.frontLateralLoadTransferN + animK.rearLateralLoadTransferN) *
    transferScale;
  const transferY = animK.longitudinalLoadTransferN * transferScale;
  const transferShrink = Math.min(1, 56 / Math.max(1, Math.hypot(transferX, transferY)));
  const transferEndX = 350 + transferX * transferShrink;
  const transferEndY = cgY + transferY * transferShrink;
  const transferArrow = arrowHeadPoints(350, cgY, transferEndX, transferEndY, 9, 4.2);

  const cornerScales = computeCornerForceScales(animatedActive, reference, sharedScale, 54);

  // Path & handling tendency cues ahead of car nose
  const showTurnCue = Math.abs(lateralG) > 0.05;
  const pathEndX = 350 + turnSign * 56;
  const pathArrow = showTurnCue ? arrowHeadPoints(350, 40, pathEndX, 34, 8, 3.6) : '';
  const yawScore = animatedActive.balance.activeScore;
  const isUndersteer = yawScore > 6;
  const isOversteer = yawScore < -6;
  const pushEndX = 350 - turnSign * 50;
  const pushArrow =
    showTurnCue && isUndersteer ? arrowHeadPoints(350, 44, pushEndX, 40, 8, 3.6) : '';
  const tailSwingX = 350 + turnSign * 48;
  const tailArrow =
    showTurnCue && isOversteer ? arrowHeadPoints(350, 566, tailSwingX, 554, 8, 3.6) : '';

  const phases: { id: CornerPhase; name: string; score: number; refScore?: number }[] = [
    {
      id: 'entry',
      name: 'Entry',
      score: active.balance.entryScore,
      refScore: reference?.balance.entryScore,
    },
    {
      id: 'mid',
      name: 'Apex',
      score: active.balance.midScore,
      refScore: reference?.balance.midScore,
    },
    {
      id: 'exit',
      name: 'Exit',
      score: active.balance.exitScore,
      refScore: reference?.balance.exitScore,
    },
  ];

  const views: { id: CanvasViewMode; label: string }[] = [
    { id: 'top_down', label: 'Top-Down' },
    { id: 'roll_rc', label: 'Roll & RC' },
    { id: 'pitch_aero', label: 'Pitch & Aero' },
  ];

  const aspectForView =
    viewMode === 'top_down' ? 700 / 600 : viewMode === 'roll_rc' ? 700 / 430 : 700 / 390;

  const metric = (title: string, value: string, detail: string, color = theme.textPrimary) => (
    <View style={styles.metric} key={title}>
      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{title}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={[styles.metricDetail, { color: theme.textMuted }]}>{detail}</Text>
    </View>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.canvasBg, borderColor: theme.borderSubtle },
      ]}
    >
      <View style={[styles.heading, veryNarrow && { paddingHorizontal: 14 }]}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[styles.eyebrow, { color: theme.textMuted }]}>
            FOUR-CORNER TELEMETRY
          </Text>
          <Text style={[styles.title, { color: theme.textPrimary }]}>Vehicle overview</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle turn direction"
          onPress={onToggleTurnDirection}
          style={[styles.toggle, { borderColor: theme.border }]}
        >
          <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>
            {active.driver.turnDirection === 'left' ? 'Left' : 'Right'} turn
          </Text>
        </Pressable>
      </View>

      {/* Corner Phase Tabs */}
      <View style={[styles.phases, { borderColor: theme.borderSubtle }]}>
        {phases.map((p, i) => (
          <Pressable
            key={p.id}
            accessibilityRole="tab"
            aria-selected={active.driver.cornerPhase === p.id}
            accessibilityState={{ selected: active.driver.cornerPhase === p.id }}
            accessibilityLabel={`${p.name} phase`}
            onPress={() => onSelectPhase(p.id)}
            style={[
              styles.phase,
              veryNarrow && { paddingHorizontal: 4 },
              {
                backgroundColor:
                  active.driver.cornerPhase === p.id ? theme.bgElevated : 'transparent',
                borderColor:
                  active.driver.cornerPhase === p.id ? theme.border : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                styles.phaseName,
                {
                  color:
                    active.driver.cornerPhase === p.id ? theme.textPrimary : theme.textMuted,
                },
              ]}
            >
              {`0${i + 1}  ${p.name}`}
            </Text>
            <Text style={[styles.phaseValue, { color: balanceColor(p.score, theme) }]}>
              {scoreName(p.score)}
              {p.refScore !== undefined && Math.abs(p.score - p.refScore) >= 1
                ? ` (${formatSignedDelta(p.score - p.refScore, 0)})`
                : ''}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 2D View Switcher (Top-Down | Roll & RC | Pitch & Aero) */}
      <View
        accessibilityRole="tablist"
        style={[styles.viewBar, { borderColor: theme.borderSubtle }]}
      >
        {views.map((v) => {
          const isSelected = viewMode === v.id;
          return (
            <Pressable
              key={v.id}
              accessibilityRole="tab"
              aria-selected={isSelected}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setViewMode(v.id)}
              style={[
                styles.viewTab,
                {
                  backgroundColor: isSelected ? theme.accentPrimary : theme.bgElevated,
                  borderColor: isSelected ? theme.accentPrimary : theme.borderSubtle,
                },
              ]}
            >
              <Text
                style={{
                  color: isSelected
                    ? theme.mode === 'daylight'
                      ? '#FFFFFF'
                      : '#0A111A'
                    : theme.textSecondary,
                  fontSize: 12,
                  fontWeight: '700',
                }}
              >
                {v.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Roll & RC Axle Selector */}
      {viewMode === 'roll_rc' && (
        <View style={styles.axleBar}>
          {(['front', 'rear'] as const).map((axle) => {
            const activeAxle = rollAxle === axle;
            return (
              <Pressable
                key={axle}
                accessibilityRole="button"
                accessibilityState={{ selected: activeAxle }}
                onPress={() => setRollAxle(axle)}
                style={[
                  styles.axlePill,
                  {
                    backgroundColor: activeAxle ? theme.bgElevated : 'transparent',
                    borderColor: activeAxle ? theme.accentPrimary : theme.borderSubtle,
                  },
                ]}
              >
                <Text
                  style={{
                    color: activeAxle ? theme.accentPrimary : theme.textMuted,
                    fontSize: 12,
                    fontWeight: '600',
                  }}
                >
                  {axle === 'front' ? 'Front axle' : 'Rear axle'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.scenario}>
        <Text style={[styles.scenarioValue, { color: theme.textSecondary }]}>
          {Math.round(kmhToMph(active.driver.speedKmh))}{' '}
          <Text style={{ color: theme.textMuted }}>mph</Text>
        </Text>
        <Text style={[styles.scenarioValue, { color: theme.textSecondary }]}>
          {active.driver.lateralG.toFixed(2)}{' '}
          <Text style={{ color: theme.textMuted }}>lateral G</Text>
        </Text>
        <Text style={[styles.assumed, { color: theme.textMuted }]}>
          ILLUSTRATIVE PROFILES
        </Text>
      </View>

      {previewSim && (
        <View
          style={[
            styles.preview,
            { borderColor: theme.accentPrimary, backgroundColor: theme.bgElevated },
          ]}
        >
          <Text style={[styles.previewLabel, { color: theme.accentPrimary }]}>
            {previewBannerLabel ?? 'PREVIEW · NOT APPLIED'}
          </Text>
          <Text style={{ color: theme.textPrimary, fontSize: 12, lineHeight: 18 }}>
            {previewTitle}
          </Text>
        </View>
      )}

      {/* Main 2D Visualization Viewport */}
      <View
        style={[
          styles.figure,
          { maxHeight: maxFigureHeight, aspectRatio: aspectForView },
        ]}
        onLayout={(event) =>
          setFigureWidth(
            Math.max(
              240,
              Math.min(
                event.nativeEvent.layout.width,
                event.nativeEvent.layout.height * aspectForView
              )
            )
          )
        }
      >
        {viewMode === 'top_down' ? (
          <>
            <Svg
              viewBox="0 0 700 600"
              width="100%"
              height="100%"
              accessibilityLabel="Overhead car with all four wheel force plots"
            >
              {/* Calibrated front axle, CG, and rear axle grid lines */}
              {[fY, cgY, rY].map((y, idx) => (
                <Line
                  key={idx}
                  x1={186}
                  x2={514}
                  y1={y}
                  y2={y}
                  stroke={theme.canvasGrid}
                  strokeDasharray="3 7"
                />
              ))}
              <Line
                x1={350}
                y1={18}
                x2={350}
                y2={582}
                stroke={theme.canvasGrid}
                strokeDasharray="3 7"
              />
              <SvgText
                fontFamily="sans-serif"
                x={350}
                y={16}
                textAnchor="middle"
                fill={theme.textMuted}
                fontSize={10}
                letterSpacing={3}
              >
                FRONT
              </SvgText>

              {/* Turn Path & Handling Tendency Arc */}
              {showTurnCue && (
                <G>
                  <Path
                    d={`M 350 56 Q ${350 + turnSign * 14} 38 ${pathEndX} 34`}
                    fill="none"
                    stroke={theme.neutralColor}
                    strokeWidth={2.2}
                    strokeDasharray="4 3"
                  />
                  {pathArrow && <Polygon points={pathArrow} fill={theme.neutralColor} />}
                  <SvgText
                    fontFamily="sans-serif"
                    x={pathEndX + turnSign * 8}
                    y={37}
                    textAnchor={turnSign < 0 ? 'end' : 'start'}
                    fill={theme.neutralColor}
                    fontSize={9.5}
                    fontWeight="700"
                  >
                    TURN
                  </SvgText>

                  {isUndersteer && (
                    <G>
                      <Path
                        d={`M 350 56 Q ${350 - turnSign * 12} 44 ${pushEndX} 40`}
                        fill="none"
                        stroke={theme.understeerColor}
                        strokeWidth={2.4}
                      />
                      {pushArrow && <Polygon points={pushArrow} fill={theme.understeerColor} />}
                      <SvgText
                        fontFamily="sans-serif"
                        x={pushEndX - turnSign * 8}
                        y={43}
                        textAnchor={turnSign < 0 ? 'start' : 'end'}
                        fill={theme.understeerColor}
                        fontSize={9.5}
                        fontWeight="700"
                      >
                        PUSH
                      </SvgText>
                    </G>
                  )}

                  {isOversteer && (
                    <G>
                      <Path
                        d={`M 350 550 Q ${350 + turnSign * 16} 562 ${tailSwingX} 554`}
                        fill="none"
                        stroke={theme.oversteerColor}
                        strokeWidth={2.4}
                      />
                      {tailArrow && <Polygon points={tailArrow} fill={theme.oversteerColor} />}
                      <SvgText
                        fontFamily="sans-serif"
                        x={tailSwingX + turnSign * 8}
                        y={562}
                        textAnchor={turnSign < 0 ? 'end' : 'start'}
                        fill={theme.oversteerColor}
                        fontSize={9.5}
                        fontWeight="700"
                      >
                        TAIL ROTATION
                      </SvgText>
                    </G>
                  )}
                </G>
              )}

              {/* Chassis Layer: GT3 CAD Wireframe, GT3 Livery Artwork, or Vector Silhouette */}
              {chassisSkin === 'wireframe' ? (
                <SvgImage
                  href={TOP_DOWN_WIREFRAMES[theme.mode === 'daylight' ? 'light' : 'dark']}
                  x={TOP_DOWN_WIREFRAME_RECT.x}
                  y={TOP_DOWN_WIREFRAME_RECT.y}
                  width={TOP_DOWN_WIREFRAME_RECT.width}
                  height={TOP_DOWN_WIREFRAME_RECT.height}
                  opacity={theme.mode === 'daylight' ? 0.46 : 0.62}
                  preserveAspectRatio="xMidYMid meet"
                />
              ) : chassisSkin === 'livery' ? (
                <SvgImage
                  href={require('../../../assets/custom-paint-top-down.png')}
                  x={LIVERY_SPRITE_RECT.x}
                  y={LIVERY_SPRITE_RECT.y}
                  width={LIVERY_SPRITE_RECT.width}
                  height={LIVERY_SPRITE_RECT.height}
                  preserveAspectRatio="xMidYMid meet"
                />
              ) : (
                <VectorChassisSvg setup={animatedActive.setup} theme={theme} />
              )}

              {/* Clean Chassis-Integrated Engineering Overlay (no opaque boxes) */}
              {engineering && (
                <G>
                  {/* Control arm linkages connecting wheels to chassis */}
                  {[
                    { x1: 274, x2: 249, y: fY },
                    { x1: 426, x2: 451, y: fY },
                    { x1: 274, x2: 249, y: rY },
                    { x1: 426, x2: 451, y: rY },
                  ].map((arm, idx) => (
                    <Line
                      key={idx}
                      x1={arm.x1}
                      x2={arm.x2}
                      y1={arm.y}
                      y2={arm.y}
                      stroke={theme.textMuted}
                      strokeOpacity={0.7}
                      strokeWidth={3}
                    />
                  ))}

                  {/* Rate-dependent Front & Rear Anti-Roll Bars */}
                  {[
                    { y: fY, width: frontBarWidth, color: theme.accentPrimary, sign: -1 },
                    { y: rY, width: rearBarWidth, color: theme.accentSecondary, sign: 1 },
                  ].map((bar) => {
                    const yArm = bar.y + bar.sign * 20;
                    const d = `M 268 ${bar.y} L 284 ${bar.y} L 284 ${yArm} L 416 ${yArm} L 416 ${bar.y} L 432 ${bar.y}`;
                    return (
                      <G key={bar.y}>
                        <Path
                          d={d}
                          fill="none"
                          stroke={theme.canvasBg}
                          strokeOpacity={0.55}
                          strokeWidth={bar.width + 4}
                          strokeLinejoin="round"
                        />
                        <Path
                          d={d}
                          fill="none"
                          stroke={bar.color}
                          strokeWidth={bar.width}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </G>
                    );
                  })}

                  {/* Subtle TLLTD Front / Rear pills */}
                  <Rect
                    x={290}
                    y={fY + 14}
                    width={120}
                    height={16}
                    rx={4}
                    fill={theme.canvasBg}
                    fillOpacity={0.72}
                  />
                  <SvgText
                    fontFamily="sans-serif"
                    x={350}
                    y={fY + 25}
                    textAnchor="middle"
                    fill={theme.accentPrimary}
                    fontSize={9}
                    fontWeight="700"
                  >
                    {`TLLTD F ${Math.round(animK.totalLateralLoadTransferDistributionFront * 100)}%`}
                  </SvgText>

                  <Rect
                    x={290}
                    y={rY - 30}
                    width={120}
                    height={16}
                    rx={4}
                    fill={theme.canvasBg}
                    fillOpacity={0.72}
                  />
                  <SvgText
                    fontFamily="sans-serif"
                    x={350}
                    y={rY - 19}
                    textAnchor="middle"
                    fill={theme.accentSecondary}
                    fontSize={9}
                    fontWeight="700"
                  >
                    {`TLLTD R ${Math.round((1 - animK.totalLateralLoadTransferDistributionFront) * 100)}%`}
                  </SvgText>

                  {/* CG & Diagonal Load Transfer Vector */}
                  <Circle
                    cx={350}
                    cy={cgY}
                    r={10}
                    fill={theme.warningColor}
                    stroke={theme.canvasBg}
                    strokeWidth={2.5}
                  />
                  <Line
                    x1={338}
                    x2={362}
                    y1={cgY}
                    y2={cgY}
                    stroke={theme.canvasBg}
                    strokeWidth={1.8}
                  />
                  <Line
                    x1={350}
                    x2={350}
                    y1={cgY - 12}
                    y2={cgY + 12}
                    stroke={theme.canvasBg}
                    strokeWidth={1.8}
                  />
                  <Line
                    x1={350}
                    y1={cgY}
                    x2={transferEndX}
                    y2={transferEndY}
                    stroke={theme.canvasBg}
                    strokeOpacity={0.65}
                    strokeWidth={7}
                  />
                  <Line
                    x1={350}
                    y1={cgY}
                    x2={transferEndX}
                    y2={transferEndY}
                    stroke={theme.warningColor}
                    strokeWidth={3.4}
                  />
                  {transferArrow ? (
                    <Polygon points={transferArrow} fill={theme.warningColor} />
                  ) : (
                    <Circle cx={transferEndX} cy={transferEndY} r={4} fill={theme.warningColor} />
                  )}
                </G>
              )}

              {/* Four Corners: Friction Circles, Projections & TyreGlyphs */}
              {WHEELS.map((id) => {
                const w = animatedActive.wheels[id];
                const rawW = active.wheels[id];
                const r = reference?.wheels[id];
                const p = TOP_DOWN_POSITIONS[id];
                const isLeft = id.endsWith('L');
                const toeSign = isLeft ? 1 : -1;
                const toeHeading = (toeSign * w.staticToeAngleDeg) / 2;
                const steer = w.isFront
                  ? turnSign *
                    (w.isOutside
                      ? geometricSteer.outsideSteerDeg
                      : geometricSteer.insideSteerDeg)
                  : 0;
                const actualHeading = w.isFront ? turnSign * w.steerAngleDeg : toeHeading;
                const color = usageColor(rawW, theme);
                const tyreWidthPx = (32 * w.tireWidthMm) / 255;

                const pxPerN = cornerScales[id];
                const maxForce = Math.max(0, w.maxTotalForceN);
                const refMax = Math.max(0, r?.maxTotalForceN ?? 0);
                const demand = Math.hypot(w.longitudinalFxN, w.lateralFyDemandN);
                const radius = maxForce * pxPerN;
                const demandRadius = demand * pxPerN;
                const dotX = p.plotX + turnSign * w.lateralFyDemandN * pxPerN;
                const dotY = p.plotY - w.longitudinalFxN * pxPerN;
                const labelX = isLeft ? 30 : 518;
                const delta = r
                  ? Math.round(newtonsToLbs(rawW.dynamicFzN - r.dynamicFzN))
                  : 0;
                const tirePsi = w.isFront
                  ? animatedActive.setup.frontTirePressurePsi
                  : animatedActive.setup.rearTirePressurePsi;

                return (
                  <G key={id}>
                    <Line
                      x1={isLeft ? 166 : 534}
                      x2={isLeft ? p.x - 22 : p.x + 22}
                      y1={p.plotY}
                      y2={p.y}
                      stroke={selected === id ? theme.accentPrimary : theme.border}
                      strokeWidth={1}
                      strokeDasharray="3 4"
                    />
                    {selected === id && (
                      <Rect
                        x={labelX - 14}
                        y={p.plotY - 101}
                        width={182}
                        height={232}
                        rx={15}
                        fill={theme.accentPrimary}
                        fillOpacity={0.04}
                        stroke={theme.accentPrimary}
                        strokeOpacity={0.45}
                      />
                    )}
                    <SvgText
                      fontFamily="sans-serif"
                      x={labelX}
                      y={p.plotY - 76}
                      fill={theme.textPrimary}
                      fontSize={19 * fontScale}
                      fontWeight="700"
                    >
                      {id}
                    </SvgText>
                    <SvgText
                      fontFamily="sans-serif"
                      x={compact ? labelX : labelX + 38}
                      y={p.plotY - (compact ? 55 : 78)}
                      fill={theme.textMuted}
                      fontSize={12 * fontScale}
                      letterSpacing={0.8}
                    >
                      {rawW.isOutside ? 'OUTSIDE' : 'INSIDE'}
                    </SvgText>
                    {!compact && (
                      <SvgText
                        fontFamily="sans-serif"
                        x={labelX}
                        y={p.plotY - 57}
                        fill={theme.textMuted}
                        fontSize={11}
                      >
                        {`${rawW.tireWidthMm} mm tyre`}
                      </SvgText>
                    )}

                    {/* Friction Circle Crosshair */}
                    <Line
                      x1={p.plotX - 54}
                      x2={p.plotX + 54}
                      y1={p.plotY}
                      y2={p.plotY}
                      stroke={theme.borderSubtle}
                    />
                    <Line
                      x1={p.plotX}
                      x2={p.plotX}
                      y1={p.plotY - 54}
                      y2={p.plotY + 54}
                      stroke={theme.borderSubtle}
                    />

                    {/* Overflow halo when demand exceeds friction circle */}
                    {rawW.dynamicFzN > 0 && rawW.gripUtilizationPct > 100 && (
                      <Circle
                        cx={p.plotX}
                        cy={p.plotY}
                        r={Math.min(62, demandRadius)}
                        fill="none"
                        stroke={theme.criticalColor}
                        strokeOpacity={0.45}
                        strokeWidth={1.3}
                        strokeDasharray="2 3"
                      />
                    )}

                    {/* Reference capacity ghost ring */}
                    {r && refMax > 0 && (
                      <Circle
                        cx={p.plotX}
                        cy={p.plotY}
                        r={refMax * pxPerN}
                        fill="none"
                        stroke={theme.textMuted}
                        strokeWidth={1.3}
                        strokeDasharray="3 4"
                      />
                    )}

                    {/* Active grip capacity circle */}
                    <Circle
                      cx={p.plotX}
                      cy={p.plotY}
                      r={radius}
                      fill={color}
                      fillOpacity={0.08}
                      stroke={color}
                      strokeWidth={1.6}
                    />

                    {/* Fx / Fy dashed component projections */}
                    {Math.abs(dotX - p.plotX) > 2 && Math.abs(dotY - p.plotY) > 2 && (
                      <G opacity={0.45}>
                        <Line
                          x1={p.plotX}
                          y1={p.plotY}
                          x2={dotX}
                          y2={p.plotY}
                          stroke={color}
                          strokeWidth={1}
                          strokeDasharray="2 2"
                        />
                        <Line
                          x1={dotX}
                          y1={p.plotY}
                          x2={dotX}
                          y2={dotY}
                          stroke={color}
                          strokeWidth={1}
                          strokeDasharray="2 2"
                        />
                      </G>
                    )}

                    {/* Reference demand marker */}
                    {r && (
                      <Circle
                        cx={p.plotX + turnSign * r.lateralFyDemandN * pxPerN}
                        cy={p.plotY - r.longitudinalFxN * pxPerN}
                        r={4}
                        fill="none"
                        stroke={theme.textMuted}
                        strokeWidth={1.3}
                      />
                    )}

                    {/* Active resultant force vector */}
                    <Line
                      x1={p.plotX}
                      y1={p.plotY}
                      x2={dotX}
                      y2={dotY}
                      stroke={color}
                      strokeWidth={2}
                    />
                    <Circle cx={dotX} cy={dotY} r={4.5} fill={color} />

                    <SvgText
                      fontFamily="sans-serif"
                      x={labelX}
                      y={p.plotY + 87}
                      fill={color}
                      fontSize={21 * fontScale}
                      fontWeight="700"
                    >
                      {rawW.dynamicFzN <= 0
                        ? 'Unloaded'
                        : `${Math.round(rawW.gripUtilizationPct)}%${narrowFigure ? '' : ' used'}`}
                    </SvgText>
                    <SvgText
                      fontFamily="sans-serif"
                      x={labelX}
                      y={p.plotY + 111}
                      fill={theme.textSecondary}
                      fontSize={12.5 * fontScale}
                    >
                      {`${Math.round(newtonsToLbs(rawW.dynamicFzN))} lb${
                        r && delta !== 0 && !narrowFigure
                          ? `  (${delta > 0 ? '+' : ''}${delta})`
                          : ''
                      }`}
                    </SvgText>

                    <TyreGlyph
                      x={p.x}
                      y={p.y}
                      width={tyreWidthPx}
                      steerDeg={steer}
                      actualHeadingDeg={actualHeading}
                      toeDeg={toeHeading}
                      camberDeg={w.dynamicCamberDeg}
                      tirePsi={tirePsi}
                      optimalPsi={animatedActive.setup.optimalTirePressurePsi}
                      lateralG={lateralG}
                      gripUtilizationPct={rawW.gripUtilizationPct}
                      dynamicFzN={rawW.dynamicFzN}
                      isOutside={w.isOutside}
                      isLeft={isLeft}
                      enhanced={enhancedTyres}
                      selected={selected === id}
                      color={color}
                      themeMode={theme.mode}
                    />
                  </G>
                );
              })}

              <SvgText
                fontFamily="sans-serif"
                x={350}
                y={594}
                textAnchor="middle"
                fill={theme.textMuted}
                fontSize={10}
                letterSpacing={3}
              >
                REAR
              </SvgText>
            </Svg>

            {/* Android-safe transparent quadrant tap overlays */}
            {WHEELS.map((id) => (
              <Pressable
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected: selected === id }}
                accessibilityLabel={`Inspect ${id} wheel, ${Math.round(
                  newtonsToLbs(active.wheels[id].dynamicFzN)
                )} pounds, ${
                  active.wheels[id].dynamicFzN <= 0
                    ? 'unloaded'
                    : `${Math.round(active.wheels[id].gripUtilizationPct)} percent used`
                }`}
                onPress={() => onSelectWheel(id)}
                style={[
                  styles.cornerTarget,
                  {
                    left: id.endsWith('L') ? '0%' : '50%',
                    top: id.startsWith('F') ? '0%' : '50%',
                  },
                ]}
              />
            ))}
          </>
        ) : viewMode === 'roll_rc' ? (
          <RollElevationSvg
            active={animatedActive}
            reference={reference}
            axle={rollAxle}
            theme={theme}
          />
        ) : (
          <PitchAeroSvg active={animatedActive} reference={reference} theme={theme} />
        )}
      </View>

      {/* Legend & Visual Toggles */}
      <View style={[styles.legend, { borderColor: theme.borderSubtle }]}>
        {viewMode === 'top_down' ? (
          <>
            <Text style={[styles.legendText, { color: theme.textMuted }]}>
              Solid ring: grip limit · Dot: requested force
              {reference ? ` · Dashed: ${referenceLabel}` : ''} ·{' '}
              {sharedScale
                ? 'Shared scale across all 4 corners (shows weight transfer & aero)'
                : 'Normalized per corner'}
            </Text>
            <Text style={[styles.legendText, { color: theme.textMuted }]}>
              Tread heat strips show inner / center / outer contact load from camber &amp; pressure.
              {enhancedTyres
                ? ' Smooth nonlinear steer & toe amplification active; telemetry stays exact.'
                : ' Actual geometric steer & toe angles shown.'}
            </Text>
            <View style={styles.viewSwitches}>
              <View
                accessibilityRole="radiogroup"
                accessibilityLabel="Chassis artwork style"
                style={[styles.skinGroup, { borderColor: theme.borderSubtle, backgroundColor: theme.bgElevated }]}
              >
                {(
                  [
                    { id: 'wireframe', label: 'Wireframe' },
                    { id: 'livery', label: 'Livery' },
                    { id: 'vector', label: 'Vector' },
                  ] as const
                ).map((skin) => {
                  const isSkinSelected = chassisSkin === skin.id;
                  return (
                    <Pressable
                      key={skin.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSkinSelected }}
                      onPress={() => setChassisSkin(skin.id)}
                      style={[
                        styles.skinBtn,
                        {
                          backgroundColor: isSkinSelected ? theme.accentPrimary : 'transparent',
                          borderColor: isSkinSelected ? theme.accentPrimary : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: isSkinSelected
                            ? theme.mode === 'daylight'
                              ? '#FFFFFF'
                              : '#0A111A'
                            : theme.textSecondary,
                        }}
                      >
                        {skin.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Shared force scale"
                aria-checked={sharedScale}
                accessibilityState={{ checked: sharedScale }}
                onPress={() => setSharedScale(!sharedScale)}
                style={styles.viewSwitch}
              >
                <Text style={[styles.link, { color: theme.accentPrimary }]}>
                  {sharedScale ? '✓ ' : ''}Shared force scale
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Enhanced tyre view"
                aria-checked={enhancedTyres}
                accessibilityState={{ checked: enhancedTyres }}
                onPress={() => setEnhancedTyres(!enhancedTyres)}
                style={styles.viewSwitch}
              >
                <Text style={[styles.link, { color: theme.accentPrimary }]}>
                  {enhancedTyres ? '✓ ' : ''}Enhanced tyre view
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="switch"
                accessibilityLabel="Show engineering overlay"
                aria-checked={engineering}
                accessibilityState={{ checked: engineering }}
                onPress={() => setEngineering(!engineering)}
                style={styles.viewSwitch}
              >
                <Text style={[styles.link, { color: theme.accentPrimary }]}>
                  {engineering ? 'Hide' : 'Show'} engineering overlay
                </Text>
              </Pressable>
            </View>
            {engineering && (
              <View
                style={[
                  styles.engineeringPanel,
                  { backgroundColor: theme.bgElevated, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.engineeringTitle, { color: theme.textPrimary }]}>
                  ENGINEERING KEY
                </Text>
                <Text style={[styles.engineeringText, { color: theme.warningColor }]}>
                  ⊕ CG · {Math.round(active.setup.frontWeightFraction * 100)}% front static weight ·
                  Gold arrow: load-transfer direction
                </Text>
                <View style={styles.barKeyRow}>
                  {[
                    {
                      name: 'Front ARB',
                      value: active.setup.frontArbStiffnessNmPerDeg,
                      color: theme.accentPrimary,
                      width: frontBarWidth,
                    },
                    {
                      name: 'Rear ARB',
                      value: active.setup.rearArbStiffnessNmPerDeg,
                      color: theme.accentSecondary,
                      width: rearBarWidth,
                    },
                  ].map((bar) => (
                    <View style={styles.barKey} key={bar.name}>
                      <View
                        style={{
                          width: 28,
                          height: bar.width,
                          borderRadius: 4,
                          backgroundColor: bar.color,
                        }}
                      />
                      <Text style={[styles.engineeringText, { color: theme.textPrimary }]}>
                        {bar.name} · {Math.round(bar.value)} Nm/deg
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        ) : viewMode === 'roll_rc' ? (
          <Text style={[styles.legendText, { color: theme.textMuted }]}>
            {`Live ${rollAxle} axle Y-Z geometry (${
              rollAxle === 'front' ? active.setup.frontGeometry : active.setup.rearGeometry
            }). Lowering past the nominal LCA angle drops the Roll Center (z_rc) underground (red) and increases h_roll.`}
            {reference ? ` Ghost outline: ${referenceLabel}.` : ''}
          </Text>
        ) : (
          <Text style={[styles.legendText, { color: theme.textMuted }]}>
            {`Live X-Z side elevation showing dive/squat attitude, spring heave travel gauges, ${active.setup.frontAntiDivePct}% %AD / ${active.setup.rearAntiSquatPct}% %AS force lines, and v² aerodynamic downforce.`}
            {reference ? ` Ghost outline: ${referenceLabel}.` : ''}
          </Text>
        )}
      </View>

      {/* Corner Inspector */}
      <View style={[styles.inspector, { borderColor: theme.borderSubtle }]}>
        <View style={styles.inspectorHeading}>
          <Text style={[styles.inspectorTitle, { color: theme.textPrimary }]}>
            {selected}{' '}
            <Text style={{ color: theme.textMuted, fontWeight: '400' }}>
              / {wheel.isOutside ? 'Outside' : 'Inside'} {wheel.isFront ? 'front' : 'rear'}
            </Text>
          </Text>
          <View style={styles.wheelButtons}>
            {WHEELS.map((id) => (
              <Pressable
                key={id}
                onPress={() => onSelectWheel(id)}
                accessibilityRole="button"
                accessibilityLabel={`Inspect ${id}`}
                accessibilityState={{ selected: selected === id }}
                style={[
                  styles.wheelButton,
                  {
                    backgroundColor:
                      selected === id ? theme.accentPrimary : theme.bgElevated,
                  },
                ]}
              >
                <Text
                  style={{
                    color:
                      selected === id
                        ? theme.mode === 'daylight'
                          ? '#FFFFFF'
                          : '#0A111A'
                        : theme.textMuted,
                    fontSize: 11,
                    fontWeight: '700',
                  }}
                >
                  {id}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.metrics}>
          {metric(
            'Vertical load',
            `${Math.round(newtonsToLbs(wheel.dynamicFzN))} lb`,
            `Static ${Math.round(newtonsToLbs(wheel.staticFzN))} lb${
              refWheel &&
              Math.abs(newtonsToLbs(wheel.dynamicFzN - refWheel.dynamicFzN)) >= 5
                ? ` · Δ ${formatSignedDelta(
                    newtonsToLbs(wheel.dynamicFzN - refWheel.dynamicFzN),
                    0,
                    ' lb'
                  )}`
                : ''
            }`
          )}
          {metric(
            'Grip demand',
            wheel.dynamicFzN <= 0 ? 'Unloaded' : `${wheel.gripUtilizationPct.toFixed(0)}%`,
            `${Math.round(wheel.maxTotalForceN)} N capacity${
              refWheel && Math.abs(wheel.gripUtilizationPct - refWheel.gripUtilizationPct) >= 1
                ? ` · Δ ${formatSignedDelta(
                    wheel.gripUtilizationPct - refWheel.gripUtilizationPct,
                    0,
                    '%'
                  )}`
                : ''
            }`,
            usageColor(wheel, theme)
          )}
          {metric(
            'Camber estimate',
            `${wheel.dynamicCamberDeg.toFixed(2)}°`,
            `${wheel.suspensionDeflectionMm.toFixed(1)} mm travel${
              refWheel && Math.abs(wheel.dynamicCamberDeg - refWheel.dynamicCamberDeg) >= 0.05
                ? ` · Δ ${formatSignedDelta(
                    wheel.dynamicCamberDeg - refWheel.dynamicCamberDeg,
                    2,
                    '°'
                  )}`
                : ''
            }`
          )}
          {metric(
            'Steer / axle toe',
            `${wheel.steerAngleDeg.toFixed(2)}° / ${wheel.staticToeAngleDeg.toFixed(2)}°`,
            'Actual steer magnitude / total toe'
          )}
          {metric(
            'Slip estimate',
            wheel.gripUtilizationPct > 100 || wheel.dynamicFzN <= 0
              ? 'Beyond limit'
              : `${wheel.slipAngleDeg.toFixed(1)}°`,
            `μ estimate ${wheel.effectiveFrictionMu.toFixed(2)}`
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          aria-expanded={expanded}
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={styles.expandMetricsBtn}
        >
          <Text style={[styles.link, { color: theme.accentPrimary }]}>
            {expanded ? 'Hide' : 'Show'} geometry &amp; ride metrics
          </Text>
        </Pressable>
        {expanded && (
          <View style={styles.metrics}>
            {metric(
              'Body roll / pitch',
              `${k.bodyRollDeg.toFixed(2)}° / ${k.bodyPitchDeg.toFixed(2)}°`,
              'Quasi-static equilibrium'
            )}
            {metric(
              'Ride frequency F / R',
              `${k.frontNaturalFreqHz.toFixed(2)} / ${k.rearNaturalFreqHz.toFixed(2)} Hz`,
              'Single-mode approximation'
            )}
            {metric(
              'Roll centre F / R',
              `${k.effectiveFrontRollCenterMm.toFixed(0)} / ${k.effectiveRearRollCenterMm.toFixed(0)} mm`,
              'Illustrative geometry migration'
            )}
            {metric(
              'Roll arm / front transfer',
              `${k.rollMomentArmMm.toFixed(0)} mm / ${(
                k.totalLateralLoadTransferDistributionFront * 100
              ).toFixed(0)}%`,
              `Front roll stiffness ${(k.frontRollStiffnessRatio * 100).toFixed(0)}%`
            )}
            {metric(
              'Axle slip estimate F / R',
              `${k.frontAxleSlipAngleDeg.toFixed(1)}° / ${k.rearAxleSlipAngleDeg.toFixed(1)}°`,
              'Illustrative handling proxy'
            )}
            {metric(
              'Weight / front share',
              `${Math.round(newtonsToLbs(active.setup.massKg * 9.81))} lb / ${Math.round(
                active.setup.frontWeightFraction * 100
              )}%`,
              'Illustrative vehicle profile'
            )}
            {metric(
              'Slip-difference ratio',
              `${k.understeerGradientDegPerG.toFixed(2)}°/G`,
              'Illustrative ratio, not a measured gradient'
            )}
            {metric(
              'Aero downforce',
              `${Math.round(newtonsToLbs(k.totalAeroDownforceN))} lb`,
              'Normal force; no added mass'
            )}
          </View>
        )}
        {refWheel && (
          <Text style={[styles.modelNote, { color: theme.textMuted }]}>
            Comparison: {referenceLabel}, at the current speed, inputs, phase and surface.
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  viewSwitches: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 8 },
  viewSwitch: { minHeight: 44, justifyContent: 'center' },
  skinGroup: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  skinBtn: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  engineeringPanel: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  engineeringTitle: { fontSize: 10, letterSpacing: 1.3, fontWeight: '700' },
  engineeringText: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  barKeyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  barKey: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 24 },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 14,
  },
  eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.7, marginBottom: 6 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  toggle: {
    minHeight: 44,
    justifyContent: 'center',
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 7,
  },
  phases: {
    marginHorizontal: 20,
    padding: 4,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 4,
  },
  phase: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 7,
    borderWidth: 1,
  },
  phaseName: { fontSize: 12, fontWeight: '600' },
  phaseValue: { fontSize: 10, marginTop: 4 },
  viewBar: {
    marginHorizontal: 20,
    marginTop: 10,
    padding: 4,
    borderWidth: 1,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
  },
  viewTab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  axleBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 10,
  },
  axlePill: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scenario: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
    padding: 20,
    paddingBottom: 2,
    flexWrap: 'wrap',
  },
  scenarioValue: { fontSize: 14, fontWeight: '600' },
  assumed: { fontSize: 9, letterSpacing: 1.1, marginLeft: 'auto' },
  preview: {
    margin: 20,
    marginBottom: 0,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  previewLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 5 },
  figure: { maxHeight: 540, width: '100%' },
  cornerTarget: { position: 'absolute', width: '50%', height: '50%', borderRadius: 10 },
  legend: { paddingHorizontal: 22, paddingVertical: 14, borderTopWidth: 1, gap: 5 },
  legendText: { fontSize: 10, lineHeight: 15 },
  link: { fontSize: 11, fontWeight: '600', paddingVertical: 7 },
  inspector: { padding: 20, borderTopWidth: 1 },
  inspectorHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 10,
  },
  inspectorTitle: { fontSize: 14, fontWeight: '700' },
  wheelButtons: { flexDirection: 'row', gap: 4 },
  wheelButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 5,
  },
  expandMetricsBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18, gap: 16 },
  metric: { flexBasis: '43%', flexGrow: 1, minWidth: 110, marginBottom: 8 },
  metricLabel: { fontSize: 10, marginBottom: 7 },
  metricValue: { fontSize: 19, fontWeight: '600', fontVariant: ['tabular-nums'] },
  metricDetail: { fontSize: 10, lineHeight: 15, marginTop: 4 },
  modelNote: { fontSize: 10, lineHeight: 16, marginTop: 14 },
});
