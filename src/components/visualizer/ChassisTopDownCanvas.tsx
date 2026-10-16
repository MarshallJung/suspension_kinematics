import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import {
  CornerPhase,
  SimulationResult,
  WheelId,
  WheelTelemetry,
  kmhToMph,
  newtonsToLbs,
} from '../../engine';
import { ThemePalette } from '../../theme/colors';

interface ChassisTopDownCanvasProps {
  sim: SimulationResult;
  baselineSim?: SimulationResult | null;
  previewSim?: SimulationResult | null;
  previewTitle?: string | null;
  selectedWheel: WheelId | null;
  onSelectWheel: (wheel: WheelId) => void;
  onSelectPhase: (phase: CornerPhase) => void;
  onToggleTurnDirection: () => void;
  theme: ThemePalette;
}

/**
 * Spacious 420x420 coordinate system:
 * - Track width between left (cx=96) and right (cx=324) wheels is 228px (68% wider than before)
 * - Wheelbase between front (cy=112) and rear (cy=312) axles is 200px
 * - Gives friction circles, tire footprints, slip vectors, and chassis force arrows generous room.
 */
const WHEEL_POSITIONS: Record<WheelId, { cx: number; cy: number }> = {
  FL: { cx: 96, cy: 112 },
  FR: { cx: 324, cy: 112 },
  RL: { cx: 94, cy: 312 },
  RR: { cx: 326, cy: 312 },
};

function getUtilizationColor(utilizationPct: number, theme: ThemePalette): string {
  if (utilizationPct >= 100) return theme.criticalColor;
  if (utilizationPct >= 88) return theme.warningColor;
  if (utilizationPct >= 70) return theme.accentPrimary;
  return theme.neutralColor;
}

function getBalanceColor(score: number, theme: ThemePalette): string {
  if (score >= 8) return theme.understeerColor;
  if (score <= -8) return theme.oversteerColor;
  return theme.neutralColor;
}

function formatScoreLabel(score: number): string {
  if (Math.abs(score) < 5) return 'Neutral (0)';
  if (score > 0) return `US +${score.toFixed(0)}`;
  return `OS ${score.toFixed(0)}`;
}

export const ChassisTopDownCanvas: React.FC<ChassisTopDownCanvasProps> = ({
  sim,
  baselineSim,
  previewSim,
  previewTitle,
  selectedWheel,
  onSelectWheel,
  onSelectPhase,
  onToggleTurnDirection,
  theme,
}) => {
  const activeSim = previewSim ?? sim;
  const referenceSim = previewSim ? sim : baselineSim;

  const isLeftTurn = activeSim.driver.turnDirection === 'left';
  const turnSign = isLeftTurn ? -1 : 1;

  // Longitudinal CG position between front axle (y=112) and rear axle (y=312)
  const frontY = 112;
  const rearY = 312;
  const wheelbasePx = rearY - frontY;
  // Distance from front axle to CG is (1 - frontWeightFraction) * L
  const cgY = frontY + (1 - activeSim.setup.frontWeightFraction) * wheelbasePx;
  const cgX = 210;

  // Dynamic Weight Transfer Vector from CG
  // In a left turn, lateral weight transfers to the RIGHT (+X)
  const totalLatTransferN =
    activeSim.kinematics.frontLateralLoadTransferN +
    activeSim.kinematics.rearLateralLoadTransferN;
  const latVectorPx =
    Math.min(
      68,
      (totalLatTransferN / Math.max(1, activeSim.setup.massKg * 9.81 * 0.55)) * 62
    ) * (isLeftTurn ? 1 : -1);

  // Negative longitudinalLoadTransferN = forward transfer under braking (-Y towards front axle)
  const longVectorPx = Math.max(
    -58,
    Math.min(
      58,
      (activeSim.kinematics.longitudinalLoadTransferN /
        Math.max(1, activeSim.setup.massKg * 9.81 * 0.35)) *
        52
    )
  );

  const loadTargetX = cgX + latVectorPx;
  const loadTargetY = cgY + longVectorPx;

  const inspectedWheelId: WheelId = selectedWheel ?? (isLeftTurn ? 'FR' : 'FL');
  const inspectedWheel = activeSim.wheels[inspectedWheelId];
  const refWheel = referenceSim ? referenceSim.wheels[inspectedWheelId] : null;

  const inspectedDynamicLbs = Math.round(newtonsToLbs(inspectedWheel.dynamicFzN));
  const inspectedStaticLbs = Math.round(newtonsToLbs(inspectedWheel.staticFzN));
  const inspectedDeltaLbs = refWheel
    ? Math.round(newtonsToLbs(inspectedWheel.dynamicFzN - refWheel.dynamicFzN))
    : 0;

  const speedMph = Math.round(kmhToMph(activeSim.driver.speedKmh));
  const totalVehicleWeightLbs = Math.round(
    newtonsToLbs(activeSim.setup.massKg * 9.81)
  );

  const activeBalanceScore = activeSim.balance.activeScore;
  const refBalanceScore = referenceSim ? referenceSim.balance.activeScore : null;
  const balanceDelta =
    refBalanceScore !== null ? Number((activeBalanceScore - refBalanceScore).toFixed(1)) : null;

  const phases: {
    id: CornerPhase;
    label: string;
    short: string;
    score: number;
    refScore?: number;
  }[] = [
    {
      id: 'entry',
      label: '1. Entry (Brake & Turn-In)',
      short: '1. ENTRY',
      score: activeSim.balance.entryScore,
      refScore: referenceSim?.balance.entryScore,
    },
    {
      id: 'mid',
      label: '2. Mid-Corner (Apex)',
      short: '2. APEX',
      score: activeSim.balance.midScore,
      refScore: referenceSim?.balance.midScore,
    },
    {
      id: 'exit',
      label: '3. Exit (Throttle)',
      short: '3. EXIT',
      score: activeSim.balance.exitScore,
      refScore: referenceSim?.balance.exitScore,
    },
  ];

  // Visual thickness of front and rear ARB bars
  const frontArbStroke = Math.max(
    2.2,
    Math.min(6.5, activeSim.setup.frontArbStiffnessNmPerDeg / 135)
  );
  const rearArbStroke = Math.max(
    2.2,
    Math.min(6.5, activeSim.setup.rearArbStiffnessNmPerDeg / 135)
  );

  const isSquareTireSetup =
    Math.abs(activeSim.setup.frontTireWidthMm - activeSim.setup.rearTireWidthMm) <= 5;

  const renderCornerCard = (wheelId: WheelId) => {
    const w = activeSim.wheels[wheelId];
    const refW = referenceSim ? referenceSim.wheels[wheelId] : null;
    const isSelected = inspectedWheelId === wheelId;
    const utilColor = getUtilizationColor(w.gripUtilizationPct, theme);
    const dynamicLbs = Math.round(newtonsToLbs(w.dynamicFzN));
    const fzDeltaLbs = refW ? Math.round(newtonsToLbs(w.dynamicFzN - refW.dynamicFzN)) : 0;
    const tireWidthMm = w.isFront
      ? activeSim.setup.frontTireWidthMm
      : activeSim.setup.rearTireWidthMm;

    return (
      <Pressable
        key={`card-${wheelId}`}
        onPress={() => onSelectWheel(wheelId)}
        style={[
          styles.cornerHudCard,
          {
            backgroundColor: isSelected ? theme.bgElevated : theme.bgSecondary,
            borderColor: isSelected ? theme.accentPrimary : theme.borderSubtle,
          },
        ]}
      >
        <View style={styles.cornerHudTopRow}>
          <View style={styles.cornerTitleGroup}>
            <Text style={[styles.cornerWheelId, { color: theme.textPrimary }]}>
              {wheelId}
            </Text>
            <Text
              style={[
                styles.cornerInOutBadge,
                {
                  color: w.isOutside ? theme.accentSecondary : theme.textMuted,
                },
              ]}
            >
              {w.isOutside ? 'OUTSIDE' : 'INSIDE'} • {tireWidthMm}mm
            </Text>
          </View>
          <View
            style={[
              styles.cornerUtilPill,
              { backgroundColor: utilColor + '22', borderColor: utilColor },
            ]}
          >
            <Text style={[styles.cornerUtilText, { color: utilColor }]}>
              {Math.round(w.gripUtilizationPct)}% Grip
            </Text>
          </View>
        </View>

        <View style={styles.cornerMetricsRow}>
          <Text style={[styles.cornerMetricText, { color: theme.textSecondary }]}>
            Load:{' '}
            <Text style={{ color: theme.textPrimary, fontWeight: '800' }}>
              {dynamicLbs} lbs
            </Text>
            {Math.abs(fzDeltaLbs) >= 3 ? (
              <Text
                style={{
                  color: fzDeltaLbs > 0 ? theme.accentSecondary : theme.accentPrimary,
                  fontWeight: '700',
                }}
              >
                {` (${fzDeltaLbs > 0 ? `+${fzDeltaLbs}` : fzDeltaLbs})`}
              </Text>
            ) : null}
          </Text>

          <Text style={[styles.cornerMetricText, { color: theme.textSecondary }]}>
            γ_dyn:{' '}
            <Text style={{ color: theme.textPrimary, fontWeight: '700' }}>
              {w.dynamicCamberDeg.toFixed(1)}°
            </Text>
          </Text>

          <Text style={[styles.cornerMetricText, { color: theme.accentSecondary, fontWeight: '700' }]}>
            α: {w.slipAngleDeg.toFixed(1)}°
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.bgCard, borderColor: theme.border },
      ]}
    >
      {/* Preview Banner if active */}
      {previewSim && previewTitle ? (
        <View style={[styles.previewBanner, { backgroundColor: theme.accentPrimary }]}>
          <Text style={styles.previewBannerText}>
            PREVIEWING ON CAR: {previewTitle} (Dashed rings = Current Setup)
          </Text>
        </View>
      ) : null}

      {/* 3-Phase Handling Balance Timeline Selector */}
      <View style={[styles.phaseRow, { borderBottomColor: theme.borderSubtle }]}>
        {phases.map((p) => {
          const isSelected = activeSim.driver.cornerPhase === p.id;
          const phaseColor = getBalanceColor(p.score, theme);
          const delta =
            p.refScore !== undefined ? Number((p.score - p.refScore).toFixed(1)) : null;

          return (
            <Pressable
              key={p.id}
              onPress={() => onSelectPhase(p.id)}
              style={[
                styles.phaseTab,
                {
                  backgroundColor: isSelected ? theme.bgElevated : 'transparent',
                  borderColor: isSelected ? phaseColor : theme.borderSubtle,
                },
              ]}
            >
              <Text
                style={[
                  styles.phaseTabTitle,
                  { color: isSelected ? theme.textPrimary : theme.textMuted },
                ]}
              >
                {p.short}
              </Text>
              <View style={styles.phaseScoreRow}>
                <Text style={[styles.phaseScoreValue, { color: phaseColor }]}>
                  {formatScoreLabel(p.score)}
                </Text>
                {delta !== null && Math.abs(delta) >= 0.4 ? (
                  <Text
                    style={[
                      styles.phaseDeltaBadge,
                      { color: theme.textSecondary },
                    ]}
                  >
                    ({delta > 0 ? `+${delta}` : delta})
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Active Balance Meter Bar (Oversteer <-> Neutral <-> Understeer) */}
      <View style={[styles.balanceMeterContainer, { backgroundColor: theme.bgSecondary }]}>
        <View style={styles.balanceLabelsRow}>
          <Text style={[styles.balancePoleLabel, { color: theme.oversteerColor }]}>
            ◀ OVERSTEER (Rotate)
          </Text>
          <Pressable
            onPress={onToggleTurnDirection}
            style={[
              styles.turnTogglePill,
              { borderColor: theme.border, backgroundColor: theme.bgCard },
            ]}
          >
            <Text style={[styles.turnToggleText, { color: theme.textPrimary }]}>
              {isLeftTurn ? '↰ Left Turn' : '↱ Right Turn'} ({speedMph} mph,{' '}
              {activeSim.driver.lateralG.toFixed(2)}G)
            </Text>
          </Pressable>
          <Text style={[styles.balancePoleLabel, { color: theme.understeerColor }]}>
            UNDERSTEER (Push) ▶
          </Text>
        </View>

        <View
          style={[
            styles.meterTrack,
            { backgroundColor: theme.canvasBg, borderColor: theme.borderSubtle },
          ]}
        >
          {/* Center Neutral Tick */}
          <View style={[styles.meterCenterTick, { backgroundColor: theme.neutralColor }]} />

          {/* Ghost Reference Marker if Baseline/Preview active */}
          {refBalanceScore !== null ? (
            <View
              style={[
                styles.meterGhostMarker,
                {
                  left: `${Math.max(4, Math.min(96, 50 + refBalanceScore * 0.45))}%`,
                  borderColor: theme.textMuted,
                },
              ]}
            />
          ) : null}

          {/* Active Balance Indicator Pill */}
          <View
            style={[
              styles.meterActiveThumb,
              {
                left: `${Math.max(4, Math.min(96, 50 + activeBalanceScore * 0.45))}%`,
                backgroundColor: getBalanceColor(activeBalanceScore, theme),
              },
            ]}
          />
        </View>

        <View style={styles.balanceSummaryRow}>
          <Text
            style={[
              styles.balanceStatusText,
              { color: getBalanceColor(activeBalanceScore, theme) },
            ]}
          >
            {activeSim.balance.activeClassification}
            {balanceDelta !== null && Math.abs(balanceDelta) >= 0.4
              ? ` (${balanceDelta > 0 ? `+${balanceDelta} toward US` : `${balanceDelta} toward OS`} vs Baseline)`
              : ''}
          </Text>
          <Text style={[styles.slipComparisonText, { color: theme.textSecondary }]}>
            Slip Angles: α_F {activeSim.kinematics.frontAxleSlipAngleDeg.toFixed(1)}° vs α_R{' '}
            {activeSim.kinematics.rearAxleSlipAngleDeg.toFixed(1)}°
          </Text>
        </View>
      </View>

      {/* Top Front-Axle Corner HUD Row (FL | FR) */}
      <View style={[styles.cornerHudRow, { backgroundColor: theme.canvasBg }]}>
        {renderCornerCard('FL')}
        {renderCornerCard('FR')}
      </View>

      {/* Spacious 2D Top-Down SVG Telemetry Canvas */}
      <View style={[styles.svgWrapper, { backgroundColor: theme.canvasBg }]}>
        <Svg viewBox="0 0 420 420" width="100%" height={400}>
          <Defs>
            <LinearGradient id="chassisGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={theme.chassisFill} stopOpacity="0.96" />
              <Stop offset="100%" stopColor={theme.bgSecondary} stopOpacity="0.96" />
            </LinearGradient>
          </Defs>

          {[40, 90, 140, 190, 240, 290, 340, 390].map((y) => (
            <Line
              key={`grid-h-${y}`}
              x1={0}
              y1={y}
              x2={420}
              y2={y}
              stroke={theme.canvasGrid}
              strokeWidth={1}
            />
          ))}
          {[50, 105, 160, 210, 260, 315, 370].map((x) => (
            <Line
              key={`grid-v-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={420}
              stroke={theme.canvasGrid}
              strokeWidth={1}
            />
          ))}

          <Line
            x1={210}
            y1={14}
            x2={210}
            y2={406}
            stroke={theme.border}
            strokeWidth={1.2}
            strokeDasharray="5,5"
          />

          <Path
            d={
              isLeftTurn
                ? 'M 210 50 Q 198 20 148 16'
                : 'M 210 50 Q 222 20 272 16'
            }
            stroke={theme.neutralColor}
            strokeWidth={2.5}
            strokeDasharray="4,4"
            fill="none"
          />
          <SvgText
            x={isLeftTurn ? 140 : 280}
            y={19}
            fill={theme.neutralColor}
            fontSize="11"
            fontWeight="800"
            textAnchor={isLeftTurn ? 'end' : 'start'}
          >
            {isLeftTurn ? '◀ TURN PATH' : 'TURN PATH ▶'}
          </SvgText>

          {Math.abs(activeBalanceScore) >= 6 ? (
            <G>
              <Path
                d={
                  activeBalanceScore > 0
                    ? isLeftTurn
                      ? 'M 210 42 Q 246 34 274 42'
                      : 'M 210 42 Q 174 34 146 42'
                    : isLeftTurn
                    ? 'M 210 378 Q 254 388 284 374'
                    : 'M 210 378 Q 166 388 136 374'
                }
                stroke={getBalanceColor(activeBalanceScore, theme)}
                strokeWidth={3.5}
                fill="none"
              />
              <SvgText
                x={210}
                y={activeBalanceScore > 0 ? 33 : 402}
                fill={getBalanceColor(activeBalanceScore, theme)}
                fontSize="11"
                fontWeight="800"
                textAnchor="middle"
              >
                {activeBalanceScore > 0
                  ? isLeftTurn
                    ? 'NOSE PUSHING WIDE (UNDERSTEER ▶)'
                    : '◀ NOSE PUSHING WIDE (UNDERSTEER)'
                  : isLeftTurn
                  ? 'TAIL ROTATING OUT (OVERSTEER ▶)'
                  : '◀ TAIL ROTATING OUT (OVERSTEER)'}
              </SvgText>
            </G>
          ) : null}

          <Path
            d="M 156 52 C 180 42, 240 42, 264 52 L 280 96 L 276 162 L 282 276 L 276 356 C 250 368, 170 368, 144 356 L 138 276 L 144 162 L 140 96 Z"
            fill="url(#chassisGrad)"
            stroke={theme.chassisStroke}
            strokeWidth={2}
          />
          <Path
            d="M 176 68 L 244 68 L 238 82 L 182 82 Z"
            fill={theme.bgPrimary}
            fillOpacity={0.38}
            stroke={theme.chassisStroke}
            strokeWidth={1}
          />
          <Path
            d="M 158 140 Q 210 124 262 140 L 252 250 Q 210 264 168 250 Z"
            fill={theme.bgPrimary}
            fillOpacity={0.58}
            stroke={theme.chassisStroke}
            strokeWidth={1.4}
          />
          <Rect
            x={138}
            y={346}
            width={144}
            height={10}
            rx={3}
            fill={theme.bgElevated}
            stroke={theme.chassisStroke}
            strokeWidth={1.4}
          />

          <Line x1={164} y1={112} x2={96} y2={112} stroke={theme.textMuted} strokeWidth={3.2} />
          <Line x1={256} y1={112} x2={324} y2={112} stroke={theme.textMuted} strokeWidth={3.2} />
          <Path
            d="M 112 112 L 154 92 L 266 92 L 308 112"
            stroke={theme.understeerColor}
            strokeWidth={frontArbStroke}
            fill="none"
            strokeOpacity={0.9}
          />

          <Line x1={164} y1={312} x2={94} y2={312} stroke={theme.textMuted} strokeWidth={3.2} />
          <Line x1={256} y1={312} x2={326} y2={312} stroke={theme.textMuted} strokeWidth={3.2} />
          <Path
            d="M 110 312 L 154 332 L 266 332 L 310 312"
            stroke={theme.oversteerColor}
            strokeWidth={rearArbStroke}
            fill="none"
            strokeOpacity={0.9}
          />

          <Rect
            x={124}
            y={71}
            width={172}
            height={17}
            rx={4}
            fill={theme.bgPrimary}
            fillOpacity={0.78}
          />
          <SvgText
            x={210}
            y={83}
            fill={theme.understeerColor}
            fontSize="10"
            fontWeight="800"
            textAnchor="middle"
          >
            {`TLLTD Front: ${(activeSim.kinematics.totalLateralLoadTransferDistributionFront * 100).toFixed(1)}% (FRSR ${(activeSim.kinematics.frontRollStiffnessRatio * 100).toFixed(0)}%)`}
          </SvgText>

          <Rect
            x={124}
            y={334}
            width={172}
            height={17}
            rx={4}
            fill={theme.bgPrimary}
            fillOpacity={0.78}
          />
          <SvgText
            x={210}
            y={346}
            fill={theme.oversteerColor}
            fontSize="10"
            fontWeight="800"
            textAnchor="middle"
          >
            {`TLLTD Rear: ${((1 - activeSim.kinematics.totalLateralLoadTransferDistributionFront) * 100).toFixed(1)}% (Mass ${(100 - activeSim.setup.frontWeightFraction * 100).toFixed(0)}%)`}
          </SvgText>

          <Circle
            cx={cgX}
            cy={cgY}
            r={9}
            fill={theme.accentSecondary}
            stroke={theme.bgPrimary}
            strokeWidth={2}
          />
          <Line
            x1={cgX - 8}
            y1={cgY}
            x2={cgX + 8}
            y2={cgY}
            stroke={theme.bgPrimary}
            strokeWidth={1.8}
          />
          <Line
            x1={cgX}
            y1={cgY - 8}
            x2={cgX}
            y2={cgY + 8}
            stroke={theme.bgPrimary}
            strokeWidth={1.8}
          />
          <Line
            x1={cgX}
            y1={cgY}
            x2={loadTargetX}
            y2={loadTargetY}
            stroke={theme.accentSecondary}
            strokeWidth={3.8}
          />
          <Circle
            cx={loadTargetX}
            cy={loadTargetY}
            r={5.5}
            fill={theme.accentSecondary}
          />
          <Rect
            x={cgX - 64}
            y={cgY - 26}
            width={128}
            height={15}
            rx={4}
            fill={theme.bgPrimary}
            fillOpacity={0.82}
          />
          <SvgText
            x={cgX}
            y={cgY - 15}
            fill={theme.accentSecondary}
            fontSize="9.5"
            fontWeight="800"
            textAnchor="middle"
          >
            {`CG (${Math.round(activeSim.setup.frontWeightFraction * 100)}/${Math.round((1 - activeSim.setup.frontWeightFraction) * 100)} • ${totalVehicleWeightLbs} lbs)`}
          </SvgText>

          {(['FL', 'FR', 'RL', 'RR'] as WheelId[]).map((wheelId) => {
            const w: WheelTelemetry = activeSim.wheels[wheelId];
            const refW: WheelTelemetry | null = referenceSim ? referenceSim.wheels[wheelId] : null;
            const pos = WHEEL_POSITIONS[wheelId];
            const isSelected = inspectedWheelId === wheelId;
            const utilColor = getUtilizationColor(w.gripUtilizationPct, theme);

            const fzRadius = Math.max(18, Math.min(50, Math.sqrt(w.dynamicFzN / 3500) * 33));
            const refFzRadius = refW
              ? Math.max(18, Math.min(50, Math.sqrt(refW.dynamicFzN / 3500) * 33))
              : null;

            const utilRadius = fzRadius * Math.min(1.15, w.gripUtilizationPct / 100);

            const tireWidthMm = w.isFront
              ? activeSim.setup.frontTireWidthMm
              : activeSim.setup.rearTireWidthMm;
            const tireWidthPx = Math.max(17, Math.min(31, (tireWidthMm / 245) * 23));
            const tireHeightPx = 46;

            const isLeftWheel = wheelId === 'FL' || wheelId === 'RL';
            const toeVisualSign = isLeftWheel ? 1 : -1;
            const visualSteerDeg = w.isFront
              ? turnSign * w.steerAngleDeg * 1.45 + toeVisualSign * w.staticToeAngleDeg * 6
              : toeVisualSign * w.staticToeAngleDeg * 6;

            const latForceRatio = Math.min(
              1.15,
              w.lateralFyDemandN / Math.max(1, w.maxTotalForceN)
            );
            const longForceRatio = Math.max(
              -1.15,
              Math.min(1.15, w.longitudinalFxN / Math.max(1, w.maxTotalForceN))
            );
            const forceVecX = pos.cx + (-turnSign) * latForceRatio * fzRadius;
            const forceVecY = pos.cy - longForceRatio * fzRadius;

            const badgeY = w.isFront ? pos.cy - fzRadius - 14 : pos.cy + fzRadius + 6;
            const wheelDynamicLbs = Math.round(newtonsToLbs(w.dynamicFzN));

            return (
              <G key={wheelId}>
                {isSelected ? (
                  <Circle
                    cx={pos.cx}
                    cy={pos.cy}
                    r={fzRadius + 8}
                    fill="none"
                    stroke={theme.accentPrimary}
                    strokeWidth={2.2}
                    strokeDasharray="4,3"
                  />
                ) : null}

                {refFzRadius !== null ? (
                  <Circle
                    cx={pos.cx}
                    cy={pos.cy}
                    r={refFzRadius}
                    fill="none"
                    stroke={theme.textMuted}
                    strokeWidth={1.6}
                    strokeDasharray="4,4"
                  />
                ) : null}

                <Circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r={fzRadius}
                  fill={utilColor}
                  fillOpacity={0.14}
                  stroke={utilColor}
                  strokeWidth={2.4}
                />

                <Circle
                  cx={pos.cx}
                  cy={pos.cy}
                  r={utilRadius}
                  fill={utilColor}
                  fillOpacity={0.28}
                />

                <G transform={`translate(${pos.cx}, ${pos.cy}) rotate(${visualSteerDeg})`}>
                  <Rect
                    x={-tireWidthPx / 2}
                    y={-tireHeightPx / 2}
                    width={tireWidthPx}
                    height={tireHeightPx}
                    rx={4}
                    fill={theme.bgPrimary}
                    stroke={isSelected ? theme.accentPrimary : theme.textSecondary}
                    strokeWidth={isSelected ? 2.4 : 1.6}
                  />
                  <Line
                    x1={-tireWidthPx / 4}
                    y1={-tireHeightPx / 2 + 4}
                    x2={-tireWidthPx / 4}
                    y2={tireHeightPx / 2 - 4}
                    stroke={theme.border}
                    strokeWidth={1}
                  />
                  <Line
                    x1={tireWidthPx / 4}
                    y1={-tireHeightPx / 2 + 4}
                    x2={tireWidthPx / 4}
                    y2={tireHeightPx / 2 - 4}
                    stroke={theme.border}
                    strokeWidth={1}
                  />
                  <Line
                    x1={0}
                    y1={-tireHeightPx / 2 + 3}
                    x2={0}
                    y2={-tireHeightPx / 2 - 10}
                    stroke={theme.textPrimary}
                    strokeWidth={2}
                  />
                </G>

                <Line
                  x1={pos.cx}
                  y1={pos.cy}
                  x2={pos.cx + (-turnSign) * Math.min(34, w.slipAngleDeg * 4.4)}
                  y2={pos.cy - 34}
                  stroke={theme.accentSecondary}
                  strokeWidth={2}
                  strokeDasharray="3,3"
                />

                <Line
                  x1={pos.cx}
                  y1={pos.cy}
                  x2={forceVecX}
                  y2={forceVecY}
                  stroke={utilColor}
                  strokeWidth={3.2}
                />
                <Circle cx={forceVecX} cy={forceVecY} r={3.8} fill={utilColor} />

                <Rect
                  x={pos.cx - 52}
                  y={badgeY}
                  width={104}
                  height={16}
                  rx={5}
                  fill={theme.bgElevated}
                  fillOpacity={0.92}
                  stroke={isSelected ? theme.accentPrimary : theme.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={pos.cx}
                  y={badgeY + 11.5}
                  fill={utilColor}
                  fontSize="9.5"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  {`${wheelId} ${Math.round(w.gripUtilizationPct)}% • ${wheelDynamicLbs} lbs`}
                </SvgText>
              </G>
            );
          })}
        </Svg>

        {/* Native React Native Pressable 4-Corner Hit-Target Overlay (avoids RNSVGGroup onPress Fabric warning) */}
        <View style={styles.svgTouchOverlay} pointerEvents="box-none">
          <View style={styles.svgTouchRow}>
            <Pressable
              style={styles.svgTouchQuadrant}
              onPress={() => onSelectWheel('FL')}
              accessibilityLabel="Select Front Left Wheel"
            />
            <Pressable
              style={styles.svgTouchQuadrant}
              onPress={() => onSelectWheel('FR')}
              accessibilityLabel="Select Front Right Wheel"
            />
          </View>
          <View style={styles.svgTouchRow}>
            <Pressable
              style={styles.svgTouchQuadrant}
              onPress={() => onSelectWheel('RL')}
              accessibilityLabel="Select Rear Left Wheel"
            />
            <Pressable
              style={styles.svgTouchQuadrant}
              onPress={() => onSelectWheel('RR')}
              accessibilityLabel="Select Rear Right Wheel"
            />
          </View>
        </View>
      </View>

      {/* Bottom Rear-Axle Corner HUD Row (RL | RR) */}
      <View
        style={[
          styles.cornerHudRow,
          styles.cornerHudBottomRow,
          { backgroundColor: theme.canvasBg },
        ]}
      >
        {renderCornerCard('RL')}
        {renderCornerCard('RR')}
      </View>

      {/* Wheel Tap-to-Inspect & Live Dynamic Roll Centers / Ride Frequency Strip */}
      <View
        style={[
          styles.inspectorCard,
          { backgroundColor: theme.bgSecondary, borderTopColor: theme.borderSubtle },
        ]}
      >
        <View style={styles.inspectorHeaderRow}>
          <View style={styles.wheelSelectorPills}>
            {(['FL', 'FR', 'RL', 'RR'] as WheelId[]).map((id) => {
              const active = inspectedWheelId === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => onSelectWheel(id)}
                  style={[
                    styles.wheelPill,
                    {
                      backgroundColor: active ? theme.accentPrimary : theme.bgCard,
                      borderColor: active ? theme.accentPrimary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.wheelPillText,
                      { color: active ? '#0B0F17' : theme.textSecondary },
                    ]}
                  >
                    {id}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.inspectorTitle, { color: theme.textPrimary }]}>
            {inspectedWheel.id} ({inspectedWheel.isOutside ? 'Outside Loaded' : 'Inside Unloaded'}{' '}
            • {inspectedWheel.isFront ? activeSim.setup.frontTireWidthMm : activeSim.setup.rearTireWidthMm}mm)
          </Text>
        </View>

        <View style={styles.metricsGrid}>
          <View style={[styles.metricCell, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Dynamic Load Fz</Text>
            <Text style={[styles.metricValue, { color: theme.textPrimary }]}>
              {inspectedDynamicLbs} lbs
              {refWheel && Math.abs(inspectedDeltaLbs) >= 2
                ? ` (${inspectedDeltaLbs > 0 ? '+' : ''}${inspectedDeltaLbs})`
                : ''}
            </Text>
            <Text style={[styles.metricSub, { color: theme.textMuted }]}>
              Static: {inspectedStaticLbs} lbs
            </Text>
          </View>

          <View style={[styles.metricCell, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Grip Circle</Text>
            <Text
              style={[
                styles.metricValue,
                { color: getUtilizationColor(inspectedWheel.gripUtilizationPct, theme) },
              ]}
            >
              {inspectedWheel.gripUtilizationPct.toFixed(0)}% Used
            </Text>
            <Text style={[styles.metricSub, { color: theme.textMuted }]}>
              μ_eff: {inspectedWheel.effectiveFrictionMu.toFixed(2)}
            </Text>
          </View>

          <View style={[styles.metricCell, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Dynamic Camber</Text>
            <Text style={[styles.metricValue, { color: theme.textPrimary }]}>
              {inspectedWheel.dynamicCamberDeg.toFixed(2)}°
            </Text>
            <Text style={[styles.metricSub, { color: theme.textMuted }]}>
              Δz: {inspectedWheel.suspensionDeflectionMm >= 0 ? '+' : ''}
              {inspectedWheel.suspensionDeflectionMm.toFixed(1)} mm
            </Text>
          </View>

          <View style={[styles.metricCell, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Chassis Attitude</Text>
            <Text style={[styles.metricValue, { color: theme.textPrimary }]}>
              Roll {activeSim.kinematics.bodyRollDeg.toFixed(1)}°
            </Text>
            <Text style={[styles.metricSub, { color: theme.textMuted }]}>
              Pitch {activeSim.kinematics.bodyPitchDeg >= 0 ? '+' : ''}
              {activeSim.kinematics.bodyPitchDeg.toFixed(1)}°
            </Text>
          </View>
        </View>

        {/* Live Kinematic & Roll Center / Ride Frequency Telemetry Cards */}
        <View style={[styles.kinematicCardsRow, { borderTopColor: theme.borderSubtle }]}>
          <View style={[styles.kinematicMiniCard, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.kinematicMiniLabel, { color: theme.textMuted }]}>
              Dynamic Roll Centers (F / R)
            </Text>
            <Text style={[styles.kinematicMiniValue, { color: theme.accentPrimary }]}>
              {activeSim.kinematics.effectiveFrontRollCenterMm.toFixed(0)}mm F /{' '}
              {activeSim.kinematics.effectiveRearRollCenterMm.toFixed(0)}mm R
            </Text>
            <Text style={[styles.kinematicMiniSub, { color: theme.textMuted }]}>
              Static: {activeSim.kinematics.staticFrontRollCenterMm.toFixed(0)} /{' '}
              {activeSim.kinematics.staticRearRollCenterMm.toFixed(0)}mm
            </Text>
          </View>

          <View style={[styles.kinematicMiniCard, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.kinematicMiniLabel, { color: theme.textMuted }]}>
              Roll Moment Arm (h_roll)
            </Text>
            <Text style={[styles.kinematicMiniValue, { color: theme.accentSecondary }]}>
              {activeSim.kinematics.rollMomentArmMm.toFixed(0)} mm
            </Text>
            <Text style={[styles.kinematicMiniSub, { color: theme.textMuted }]}>
              CG {activeSim.setup.cgHeightMm}mm → Roll Axis
            </Text>
          </View>

          <View style={[styles.kinematicMiniCard, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.kinematicMiniLabel, { color: theme.textMuted }]}>
              Ride Frequencies (f_n)
            </Text>
            <Text style={[styles.kinematicMiniValue, { color: theme.textPrimary }]}>
              {activeSim.kinematics.frontNaturalFreqHz.toFixed(2)}F /{' '}
              {activeSim.kinematics.rearNaturalFreqHz.toFixed(2)}R Hz
            </Text>
            <Text style={[styles.kinematicMiniSub, { color: theme.textMuted }]}>
              Tires: {activeSim.setup.frontTireWidthMm}/{activeSim.setup.rearTireWidthMm}mm (
              {isSquareTireSetup ? 'Square' : 'Stagger'})
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 12,
  },
  previewBanner: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  previewBannerText: {
    color: '#0B0F17',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  phaseRow: {
    flexDirection: 'row',
    padding: 8,
    gap: 6,
    borderBottomWidth: 1,
  },
  phaseTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  phaseTabTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  phaseScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  phaseScoreValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  phaseDeltaBadge: {
    fontSize: 10,
    fontWeight: '700',
  },
  balanceMeterContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  balanceLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  balancePoleLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  turnTogglePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  turnToggleText: {
    fontSize: 10,
    fontWeight: '700',
  },
  meterTrack: {
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    position: 'relative',
    justifyContent: 'center',
    marginBottom: 6,
  },
  meterCenterTick: {
    position: 'absolute',
    left: '50%',
    width: 2,
    height: 12,
    marginLeft: -1,
  },
  meterGhostMarker: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    marginLeft: -6,
  },
  meterActiveThumb: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
  },
  balanceSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  balanceStatusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  slipComparisonText: {
    fontSize: 11,
    fontWeight: '600',
  },
  cornerHudRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 4,
  },
  cornerHudBottomRow: {
    paddingTop: 4,
    paddingBottom: 10,
  },
  cornerHudCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.2,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  cornerHudTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cornerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  cornerWheelId: {
    fontSize: 13,
    fontWeight: '900',
  },
  cornerInOutBadge: {
    fontSize: 10,
    fontWeight: '700',
  },
  cornerUtilPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  cornerUtilText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  cornerMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
  },
  cornerMetricText: {
    fontSize: 10.5,
  },
  svgWrapper: {
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  svgTouchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  svgTouchRow: {
    flex: 1,
    flexDirection: 'row',
  },
  svgTouchQuadrant: {
    flex: 1,
  },
  inspectorCard: {
    padding: 10,
    borderTopWidth: 1,
  },
  inspectorHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'wrap',
    gap: 6,
  },
  wheelSelectorPills: {
    flexDirection: 'row',
    gap: 4,
  },
  wheelPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  wheelPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  inspectorTitle: {
    fontSize: 12,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metricCell: {
    flex: 1,
    minWidth: 75,
    padding: 7,
    borderRadius: 8,
  },
  metricLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '800',
  },
  metricSub: {
    fontSize: 9.5,
    marginTop: 1,
  },
  kinematicCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  kinematicMiniCard: {
    flex: 1,
    minWidth: 100,
    padding: 7,
    borderRadius: 8,
  },
  kinematicMiniLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginBottom: 2,
  },
  kinematicMiniValue: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  kinematicMiniSub: {
    fontSize: 9,
    marginTop: 1,
  },
});
