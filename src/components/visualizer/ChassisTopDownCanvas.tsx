import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Image as SvgImage, Line, Rect, Path, Text as SvgText } from 'react-native-svg';
import { CornerPhase, SimulationResult, WheelId, WheelTelemetry, calculateAckermannSteerAngles, phaseAccelerations, kmhToMph, newtonsToLbs } from '../../engine';
import { TyreGlyph } from './TyreGlyph';
import { ThemePalette } from '../../theme/colors';

interface ChassisTopDownCanvasProps {
  sim: SimulationResult; baselineSim?: SimulationResult | null; previewSim?: SimulationResult | null;
  previewTitle?: string | null; selectedWheel: WheelId | null; onSelectWheel: (wheel: WheelId) => void;
  onSelectPhase: (phase: CornerPhase) => void; onToggleTurnDirection: () => void; theme: ThemePalette;
}
const WHEELS: WheelId[] = ['FL', 'FR', 'RL', 'RR'];
const POSITIONS: Record<WheelId, { x: number; y: number; plotX: number; plotY: number }> = {
  FL: { x: 244, y: 165, plotX: 105, plotY: 150 }, FR: { x: 456, y: 165, plotX: 595, plotY: 150 },
  RL: { x: 244, y: 425, plotX: 105, plotY: 442 }, RR: { x: 456, y: 425, plotX: 595, plotY: 442 },
};
const usageColor = (w: WheelTelemetry, t: ThemePalette) => w.dynamicFzN <= 0 || w.gripUtilizationPct > 100
  ? t.criticalColor : w.gripUtilizationPct > 85 ? t.warningColor : t.accentPrimary;
const balanceColor = (score: number, t: ThemePalette) => score > 6 ? t.understeerColor : score < -6 ? t.oversteerColor : t.neutralColor;
const scoreName = (score: number) => Math.abs(score) < 6 ? 'Near neutral' : `${Math.abs(score).toFixed(0)} ${score > 0 ? 'understeer' : 'oversteer'}`;

export function ChassisTopDownCanvas({ sim, baselineSim, previewSim, previewTitle, selectedWheel,
  onSelectWheel, onSelectPhase, onToggleTurnDirection, theme }: ChassisTopDownCanvasProps) {
  const { height: viewportHeight, width: viewportWidth } = useWindowDimensions();
  const maxFigureHeight = Math.max(viewportHeight < 500 ? 220 : 280, Math.min(490, viewportHeight - 365));
  const [engineering, setEngineering] = useState(false);
  const [enhancedTyres, setEnhancedTyres] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [figureWidth, setFigureWidth] = useState(700);
  const fontScale = Math.max(1, 600 / figureWidth);
  const compact = figureWidth < 560;
  const narrowFigure = figureWidth < 330;
  const veryNarrow = viewportWidth < 370;
  const active = previewSim ?? sim;
  const reference = previewSim ? sim : baselineSim;
  const referenceLabel = previewSim ? 'current setup' : 'baseline';
  const selected = selectedWheel ?? (active.driver.turnDirection === 'left' ? 'FR' : 'FL');
  const wheel = active.wheels[selected];
  const refWheel = reference?.wheels[selected];
  const turnSign = active.driver.turnDirection === 'left' ? -1 : 1;
  const k = active.kinematics;
  const speedMs = active.driver.speedKmh / 3.6;
  const lateralG = phaseAccelerations(active.driver, active.driver.cornerPhase).lateralG;
  const nominalSteerDeg = speedMs > 0 ? Math.atan(active.setup.wheelbaseMm / 1000 * 9.81 * lateralG / (speedMs * speedMs)) * 180 / Math.PI : 0;
  // Recover geometric steering directly, rather than undoing toe after the
  // telemetry helper's non-negative angle clamp near straight ahead.
  const geometricSteer = nominalSteerDeg > 0 ? calculateAckermannSteerAngles({
    nominalSteerAngleDeg: nominalSteerDeg, trackWidthMm: active.setup.frontTrackMm,
    wheelbaseMm: active.setup.wheelbaseMm, ackermannPct: active.setup.ackermannPct, frontStaticToeDeg: 0,
  }) : { insideSteerDeg: 0, outsideSteerDeg: 0 };
  const cgY = 165 + (1 - active.setup.frontWeightFraction) * 260;
  const frontBarWidth = 2 + Math.max(0, active.setup.frontArbStiffnessNmPerDeg) / 950 * 12;
  const rearBarWidth = 2 + Math.max(0, active.setup.rearArbStiffnessNmPerDeg) / 950 * 12;
  const transferScale = 70 / Math.max(1, active.setup.massKg * 9.81 * 0.5);
  const transferX = -turnSign * (k.frontLateralLoadTransferN + k.rearLateralLoadTransferN) * transferScale;
  const transferY = k.longitudinalLoadTransferN * transferScale;
  const transferShrink = Math.min(1, 60 / Math.max(1, Math.hypot(transferX, transferY)));
  const phases: { id: CornerPhase; name: string; score: number }[] = [
    { id: 'entry', name: 'Entry', score: active.balance.entryScore },
    { id: 'mid', name: 'Apex', score: active.balance.midScore },
    { id: 'exit', name: 'Exit', score: active.balance.exitScore },
  ];
  const metric = (title: string, value: string, detail: string, color = theme.textPrimary) =>
    <View style={styles.metric} key={title}>
      <Text style={[styles.metricLabel, { color: theme.textMuted }]}>{title}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={[styles.metricDetail, { color: theme.textMuted }]}>{detail}</Text>
    </View>;

  return <View style={[styles.container, { backgroundColor: theme.canvasBg, borderColor: theme.borderSubtle }]}>
    <View style={[styles.heading, veryNarrow && { paddingHorizontal: 14 }]}>
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.eyebrow, { color: theme.textMuted }]}>FOUR-CORNER TELEMETRY</Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Vehicle overview</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Toggle turn direction" onPress={onToggleTurnDirection}
        style={[styles.toggle, { borderColor: theme.border }]}>
        <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{active.driver.turnDirection === 'left' ? 'Left' : 'Right'} turn</Text>
      </Pressable>
    </View>
    <View style={[styles.phases, { borderColor: theme.borderSubtle }]}>
      {phases.map((p, i) => <Pressable key={p.id} accessibilityRole="tab" aria-selected={active.driver.cornerPhase === p.id} accessibilityState={{ selected: active.driver.cornerPhase === p.id }}
        accessibilityLabel={`${p.name} phase`} onPress={() => onSelectPhase(p.id)}
        style={[styles.phase, veryNarrow && { paddingHorizontal: 4 }, { backgroundColor: active.driver.cornerPhase === p.id ? theme.bgElevated : 'transparent',
          borderColor: active.driver.cornerPhase === p.id ? theme.border : 'transparent' }]}>
        <Text style={[styles.phaseName, { color: active.driver.cornerPhase === p.id ? theme.textPrimary : theme.textMuted }]}>{`0${i + 1}  ${p.name}`}</Text>
        <Text style={[styles.phaseValue, { color: balanceColor(p.score, theme) }]}>{scoreName(p.score)}</Text>
      </Pressable>)}
    </View>
    <View style={styles.scenario}>
      <Text style={[styles.scenarioValue, { color: theme.textSecondary }]}>{Math.round(kmhToMph(active.driver.speedKmh))} <Text style={{ color: theme.textMuted }}>mph</Text></Text>
      <Text style={[styles.scenarioValue, { color: theme.textSecondary }]}>{active.driver.lateralG.toFixed(2)} <Text style={{ color: theme.textMuted }}>lateral G</Text></Text>
      <Text style={[styles.assumed, { color: theme.textMuted }]}>ILLUSTRATIVE PROFILES</Text>
    </View>
    {previewSim && <View style={[styles.preview, { borderColor: theme.accentPrimary, backgroundColor: theme.bgElevated }]}>
      <Text style={[styles.previewLabel, { color: theme.accentPrimary }]}>PREVIEW · NOT APPLIED</Text>
      <Text style={{ color: theme.textPrimary, fontSize: 12, lineHeight: 18 }}>{previewTitle}</Text>

    </View>}
    <View style={[styles.figure, { maxHeight: maxFigureHeight }]} onLayout={event => setFigureWidth(Math.min(event.nativeEvent.layout.width, event.nativeEvent.layout.height * 700 / 600))}>
      <Svg viewBox="0 0 700 600" width="100%" height="100%" accessibilityLabel="Overhead car with all four wheel force plots">
        {[125, 281, 438].map(y => <Line key={y} x1={190} x2={510} y1={y} y2={y} stroke={theme.canvasGrid} strokeDasharray="3 7" />)}
        <Line x1={350} y1={8} x2={350} y2={585} stroke={theme.canvasGrid} strokeDasharray="3 7" />
        <SvgText fontFamily="sans-serif" x={350} y={16} textAnchor="middle" fill={theme.textMuted} fontSize={10} letterSpacing={3}>FRONT</SvgText>
        <SvgImage href={require('../../../assets/custom-paint-top-down.png')} x={238} y={5} width={224} height={560} preserveAspectRatio="xMidYMid meet" />
        {WHEELS.map(id => {
          const w = active.wheels[id], r = reference?.wheels[id], p = POSITIONS[id];
          const isLeft = id.endsWith('L');
          const toeSign = isLeft ? 1 : -1;
          const toeHeading = toeSign * w.staticToeAngleDeg / 2;
          const steer = w.isFront ? turnSign * (w.isOutside ? geometricSteer.outsideSteerDeg : geometricSteer.insideSteerDeg) : 0;
          const actualHeading = w.isFront ? turnSign * w.steerAngleDeg : toeHeading;
          const color = usageColor(w, theme);
          const tyreWidthPx = 32 * w.tireWidthMm / 255;
          const maxForce = Math.max(0, w.maxTotalForceN);
          const refMax = Math.max(0, r?.maxTotalForceN ?? 0);
          const demand = Math.hypot(w.longitudinalFxN, w.lateralFyDemandN);
          const refDemand = r ? Math.hypot(r.longitudinalFxN, r.lateralFyDemandN) : 0;
          // One common force scale for this corner's current/reference capacities AND requests.
          // The ring can shrink when demand exceeds capacity: no hidden vector clipping.
          const scale = Math.max(1, maxForce, refMax, demand, refDemand) * 1.12;
          const pxPerN = 55 / scale;
          const radius = maxForce * pxPerN;
          const dotX = p.plotX + turnSign * w.lateralFyDemandN * pxPerN;
          const dotY = p.plotY - w.longitudinalFxN * pxPerN;
          const labelX = isLeft ? 32 : 518;
          const delta = r ? Math.round(newtonsToLbs(w.dynamicFzN - r.dynamicFzN)) : 0;
          return <G key={id}>
            <Line x1={isLeft ? 169 : 531} x2={isLeft ? p.x - 20 : p.x + 20} y1={p.plotY} y2={p.y}
              stroke={selected === id ? theme.accentPrimary : theme.border} strokeWidth={1} strokeDasharray="3 4" />
            {selected === id && <Rect x={labelX - 14} y={p.plotY - 101} width={180} height={233} rx={15}
              fill={theme.accentPrimary} fillOpacity={0.035} stroke={theme.accentPrimary} strokeOpacity={0.4} />}
            <SvgText fontFamily="sans-serif" x={labelX} y={p.plotY - 76} fill={theme.textPrimary} fontSize={19 * fontScale} fontWeight="700">{id}</SvgText>
            <SvgText fontFamily="sans-serif" x={compact ? labelX : labelX + 38} y={p.plotY - (compact ? 55 : 78)} fill={theme.textMuted} fontSize={12 * fontScale} letterSpacing={0.8}>{w.isOutside ? 'OUTSIDE' : 'INSIDE'}</SvgText>
            {!compact && <SvgText fontFamily="sans-serif" x={labelX} y={p.plotY - 57} fill={theme.textMuted} fontSize={11}>{w.tireWidthMm} mm tyre</SvgText>}
            <Line x1={p.plotX - 56} x2={p.plotX + 56} y1={p.plotY} y2={p.plotY} stroke={theme.borderSubtle} />
            <Line x1={p.plotX} x2={p.plotX} y1={p.plotY - 56} y2={p.plotY + 56} stroke={theme.borderSubtle} />
            {r && refMax > 0 && <Circle cx={p.plotX} cy={p.plotY} r={refMax * pxPerN} fill="none" stroke={theme.textMuted} strokeWidth={1.3} strokeDasharray="3 4" />}
            <Circle cx={p.plotX} cy={p.plotY} r={radius} fill={color} fillOpacity={0.07} stroke={color} strokeWidth={1.5} />
            {r && <Circle cx={p.plotX + turnSign * r.lateralFyDemandN * pxPerN} cy={p.plotY - r.longitudinalFxN * pxPerN}
              r={4} fill="none" stroke={theme.textMuted} strokeWidth={1.3} />}
            <Line x1={p.plotX} y1={p.plotY} x2={dotX} y2={dotY} stroke={color} strokeWidth={2} />
            <Circle cx={dotX} cy={dotY} r={4.5} fill={color} />
            <SvgText fontFamily="sans-serif" x={labelX} y={p.plotY + 87} fill={color} fontSize={22 * fontScale} fontWeight="700">{w.dynamicFzN <= 0 ? 'Unloaded' : `${Math.round(w.gripUtilizationPct)}%${narrowFigure ? '' : ' used'}`}</SvgText>
            <SvgText fontFamily="sans-serif" x={labelX} y={p.plotY + 112} fill={theme.textSecondary} fontSize={13 * fontScale}>{Math.round(newtonsToLbs(w.dynamicFzN))} lb{r && delta !== 0 && !narrowFigure ? `  (${delta > 0 ? '+' : ''}${delta})` : ''}</SvgText>
            <TyreGlyph x={p.x} y={p.y} width={tyreWidthPx} steerDeg={steer}
              actualHeadingDeg={actualHeading} toeDeg={toeHeading} camberDeg={w.dynamicCamberDeg}
              isLeft={isLeft} enhanced={enhancedTyres} selected={selected === id} color={color} />
          </G>;
        })}
        {engineering && <G>
          {[{ y: 165, width: frontBarWidth, color: theme.accentPrimary },
            { y: 425, width: rearBarWidth, color: theme.accentSecondary }].map(bar => {
            const d = `M 264 ${bar.y - 10} L 282 ${bar.y - 10} L 282 ${bar.y + 13} L 418 ${bar.y + 13} L 418 ${bar.y - 10} L 436 ${bar.y - 10}`;
            return <G key={bar.y}>
              <Rect x={266} y={bar.y - 25} width={168} height={58} rx={12} fill={theme.canvasBg} fillOpacity={0.94} stroke={bar.color} strokeOpacity={0.5} />
              <Path d={d} fill="none" stroke={theme.canvasBg} strokeWidth={bar.width + 6} strokeLinejoin="round" />
              <Path d={d} fill="none" stroke={bar.color} strokeWidth={bar.width} strokeLinejoin="round" strokeLinecap="round" />
            </G>;
          })}
          <Rect x={316} y={cgY - 32} width={68} height={64} rx={12} fill={theme.canvasBg} fillOpacity={0.95} stroke={theme.warningColor} />
          <Circle cx={350} cy={cgY} r={12} fill={theme.warningColor} stroke={theme.canvasBg} strokeWidth={3} />
          <Line x1={335} x2={365} y1={cgY} y2={cgY} stroke={theme.canvasBg} strokeWidth={2} />
          <Line x1={350} x2={350} y1={cgY - 15} y2={cgY + 15} stroke={theme.canvasBg} strokeWidth={2} />
          <Line x1={350} y1={cgY} x2={350 + transferX * transferShrink} y2={cgY + transferY * transferShrink}
            stroke={theme.canvasBg} strokeWidth={9} />
          <Line x1={350} y1={cgY} x2={350 + transferX * transferShrink} y2={cgY + transferY * transferShrink}
            stroke={theme.warningColor} strokeWidth={4} />
          <Circle cx={350 + transferX * transferShrink} cy={cgY + transferY * transferShrink} r={5} fill={theme.warningColor} />
        </G>}
        <SvgText fontFamily="sans-serif" x={350} y={594} textAnchor="middle" fill={theme.textMuted} fontSize={10} letterSpacing={3}>REAR</SvgText>
      </Svg>
      {WHEELS.map(id => <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: selected === id }}
        accessibilityLabel={`Inspect ${id} wheel, ${Math.round(newtonsToLbs(active.wheels[id].dynamicFzN))} pounds, ${active.wheels[id].dynamicFzN <= 0 ? 'unloaded' : `${Math.round(active.wheels[id].gripUtilizationPct)} percent used`}`}
        onPress={() => onSelectWheel(id)} style={[styles.cornerTarget, { left: id.endsWith('L') ? '0%' : '50%', top: id.startsWith('F') ? '0%' : '50%' }]} />)}
    </View>
    <View style={[styles.legend, { borderColor: theme.borderSubtle }]}>
      <Text style={[styles.legendText, { color: theme.textMuted }]}>Solid ring: grip limit · Dot: requested force{reference ? ` · Dashed: ${referenceLabel}` : ''}</Text>
      <Text style={[styles.legendText, { color: theme.textMuted }]}>Per-corner force scale; schematic car. Percent: grip used. Up: drive · Down: brake · Lateral: into the turn.</Text>
      <Text style={[styles.legendText, { color: theme.textMuted }]}>{enhancedTyres ? 'Tyres exaggerated: steering ×5, toe ×12; raised sidewalls indicate camber. Angles capped at 42° for display.' : 'Tyres: actual steering + toe angles; camber projection hidden.'} Telemetry stays at calculated values.</Text>
      <View style={styles.viewSwitches}>
        <Pressable accessibilityRole="switch" accessibilityLabel="Enhanced tyre view" aria-checked={enhancedTyres} accessibilityState={{ checked: enhancedTyres }} onPress={() => setEnhancedTyres(!enhancedTyres)} style={styles.viewSwitch}>
          <Text style={[styles.link, { color: theme.accentPrimary }]}>{enhancedTyres ? '✓ ' : ''}Enhanced tyre view</Text>
        </Pressable>
        <Pressable accessibilityRole="switch" accessibilityLabel="Show engineering overlay" aria-checked={engineering} accessibilityState={{ checked: engineering }} onPress={() => setEngineering(!engineering)} style={styles.viewSwitch}>
          <Text style={[styles.link, { color: theme.accentPrimary }]}>{engineering ? 'Hide' : 'Show'} engineering overlay</Text>
        </Pressable>
      </View>
      {engineering && <View style={[styles.engineeringPanel, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        <Text style={[styles.engineeringTitle, { color: theme.textPrimary }]}>ENGINEERING KEY</Text>
        <Text style={[styles.engineeringText, { color: theme.warningColor }]}>⊕ CG · {Math.round(active.setup.frontWeightFraction * 100)}% front static weight</Text>
        <Text style={[styles.legendText, { color: theme.textSecondary }]}>Gold line: schematic load-transfer direction; the CG itself stays fixed.</Text>
        {[{ name: 'Front bar', value: active.setup.frontArbStiffnessNmPerDeg, color: theme.accentPrimary, width: frontBarWidth },
          { name: 'Rear bar', value: active.setup.rearArbStiffnessNmPerDeg, color: theme.accentSecondary, width: rearBarWidth }].map(bar => <View style={styles.barKey} key={bar.name}>
          <View style={{ width: 38, height: bar.width, borderRadius: 5, backgroundColor: bar.color }} />
          <Text style={[styles.engineeringText, { color: theme.textPrimary }]}>{bar.name} · {Math.round(bar.value)} Nm/deg</Text>
        </View>)}
        <Text style={[styles.legendText, { color: theme.textMuted }]}>Thicker = stiffer on a shared scale. Bar shape and thickness are schematic.</Text>
      </View>}
    </View>
    <View style={[styles.inspector, { borderColor: theme.borderSubtle }]}>
      <View style={styles.inspectorHeading}>
        <Text style={[styles.inspectorTitle, { color: theme.textPrimary }]}>{selected} <Text style={{ color: theme.textMuted, fontWeight: '400' }}> / {wheel.isOutside ? 'Outside' : 'Inside'} {wheel.isFront ? 'front' : 'rear'}</Text></Text>
        <View style={styles.wheelButtons}>{WHEELS.map(id => <Pressable key={id} onPress={() => onSelectWheel(id)} accessibilityRole="button"
          accessibilityLabel={`Inspect ${id}`} accessibilityState={{ selected: selected === id }}
          style={[styles.wheelButton, { backgroundColor: selected === id ? theme.accentPrimary : theme.bgElevated }]}>
          <Text style={{ color: selected === id ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.textMuted, fontSize: 11, fontWeight: '700' }}>{id}</Text>
        </Pressable>)}</View>
      </View>
      <View style={styles.metrics}>
        {metric('Vertical load', `${Math.round(newtonsToLbs(wheel.dynamicFzN))} lb`, `Static ${Math.round(newtonsToLbs(wheel.staticFzN))} lb`)}
        {metric('Grip demand', wheel.dynamicFzN <= 0 ? 'Unloaded' : `${wheel.gripUtilizationPct.toFixed(0)}%`, `${Math.round(wheel.maxTotalForceN)} N capacity`, usageColor(wheel, theme))}
        {metric('Camber estimate', `${wheel.dynamicCamberDeg.toFixed(2)}°`, `${wheel.suspensionDeflectionMm.toFixed(1)} mm travel`)}
        {metric('Steer / axle toe', `${wheel.steerAngleDeg.toFixed(2)}° / ${wheel.staticToeAngleDeg.toFixed(2)}°`, 'Actual steer magnitude / total toe')}
        {metric('Slip estimate', wheel.gripUtilizationPct > 100 || wheel.dynamicFzN <= 0 ? 'Beyond limit' : `${wheel.slipAngleDeg.toFixed(1)}°`, `μ estimate ${wheel.effectiveFrictionMu.toFixed(2)}`)}
      </View>
      <Pressable accessibilityRole="button" aria-expanded={expanded} accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}>
        <Text style={[styles.link, { color: theme.accentPrimary }]}>{expanded ? 'Hide' : 'Show'} geometry & ride metrics</Text>
      </Pressable>
      {expanded && <View style={styles.metrics}>
        {metric('Body roll / pitch', `${k.bodyRollDeg.toFixed(2)}° / ${k.bodyPitchDeg.toFixed(2)}°`, 'Quasi-static equilibrium')}
        {metric('Ride frequency F / R', `${k.frontNaturalFreqHz.toFixed(2)} / ${k.rearNaturalFreqHz.toFixed(2)} Hz`, 'Single-mode approximation')}
        {metric('Roll centre F / R', `${k.effectiveFrontRollCenterMm.toFixed(0)} / ${k.effectiveRearRollCenterMm.toFixed(0)} mm`, 'Illustrative geometry migration')}
        {metric('Roll arm / front transfer', `${k.rollMomentArmMm.toFixed(0)} mm / ${(k.totalLateralLoadTransferDistributionFront * 100).toFixed(0)}%`, `Front roll stiffness ${(k.frontRollStiffnessRatio * 100).toFixed(0)}%`)}
        {metric('Axle slip estimate F / R', `${k.frontAxleSlipAngleDeg.toFixed(1)}° / ${k.rearAxleSlipAngleDeg.toFixed(1)}°`, 'Illustrative handling proxy')}
        {metric('Weight / front share', `${Math.round(newtonsToLbs(active.setup.massKg * 9.81))} lb / ${Math.round(active.setup.frontWeightFraction * 100)}%`, 'Illustrative vehicle profile')}
        {metric('Slip-difference ratio', `${k.understeerGradientDegPerG.toFixed(2)}°/G`, 'Illustrative ratio, not a measured gradient')}
        {metric('Aero downforce', `${Math.round(newtonsToLbs(k.totalAeroDownforceN))} lb`, 'Normal force; no added mass')}
      </View>}
      {refWheel && <Text style={[styles.modelNote, { color: theme.textMuted }]}>Comparison: {referenceLabel}, at the current speed, inputs, phase and surface.</Text>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  viewSwitches: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
  viewSwitch: { minHeight: 44, justifyContent: 'center' },
  engineeringPanel: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 9, marginTop: 4 },
  engineeringTitle: { fontSize: 10, letterSpacing: 1.3, fontWeight: '700' },
  engineeringText: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  barKey: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 24 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 22, paddingBottom: 17 },
  eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.7, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.5 },
  toggle: { borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 7 },
  phases: { marginHorizontal: 20, padding: 4, borderWidth: 1, borderRadius: 10, flexDirection: 'row', gap: 4 },
  phase: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 7, borderWidth: 1 },
  phaseName: { fontSize: 12, fontWeight: '600' }, phaseValue: { fontSize: 10, marginTop: 4 },
  scenario: { flexDirection: 'row', gap: 20, alignItems: 'center', padding: 20, paddingBottom: 2, flexWrap: 'wrap' },
  scenarioValue: { fontSize: 14, fontWeight: '600' }, assumed: { fontSize: 8, letterSpacing: 1.1, marginLeft: 'auto' },
  preview: { margin: 20, marginBottom: 0, borderWidth: 1, borderRadius: 8, padding: 12 },
  previewLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 5 },
  figure: { maxHeight: 490, width: '100%', aspectRatio: 700 / 600 },
  cornerTarget: { position: 'absolute', width: '50%', height: '50%', borderRadius: 10 },
  legend: { paddingHorizontal: 22, paddingVertical: 14, borderTopWidth: 1, gap: 5 },
  legendText: { fontSize: 10, lineHeight: 15 }, link: { fontSize: 11, fontWeight: '600', paddingVertical: 7 },
  inspector: { padding: 20, borderTopWidth: 1 }, inspectorHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  inspectorTitle: { fontSize: 14, fontWeight: '700' }, wheelButtons: { flexDirection: 'row', gap: 4 },
  wheelButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 5 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 18, gap: 16 },
  metric: { flexBasis: '43%', flexGrow: 1, minWidth: 110, marginBottom: 8 }, metricLabel: { fontSize: 10, marginBottom: 7 },
  metricValue: { fontSize: 19, fontWeight: '600', fontVariant: ['tabular-nums'] }, metricDetail: { fontSize: 10, lineHeight: 15, marginTop: 4 },
  modelNote: { fontSize: 10, lineHeight: 16, marginTop: 14 },
});
