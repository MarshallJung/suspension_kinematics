import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AdjustmentScope, HandlingSymptomType } from '../engine';
import { useTuningStore } from '../store/useTuningStore';
import { ThemePalette } from '../theme/colors';

interface SymptomWizardScreenProps { theme: ThemePalette; onPreview?: () => void; }
const SYMPTOMS: { id: HandlingSymptomType; title: string; detail: string }[] = [
  { id: 'understeer', title: 'Front pushes wide', detail: 'Understeer' },
  { id: 'oversteer', title: 'Rear steps out', detail: 'Oversteer' },
  { id: 'slow_turn_in_response', title: 'Slow turn-in', detail: 'Response' },
  { id: 'instability_braking', title: 'Nervous under braking', detail: 'Stability' },
  { id: 'poor_traction_exit', title: 'Poor exit traction', detail: 'Driven tyres' },
  { id: 'mid_corner_bump_skittishness', title: 'Skittish over bumps', detail: 'Compliance' },
];
export function SymptomWizardScreen({ theme, onPreview }: SymptomWizardScreenProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { selectedSymptom, driver, scopeFilter, recommendations, previewRecommendationId,
    setSelectedSymptom, setScopeFilter, setPreviewRecommendationId, applyRecommendation } = useTuningStore();
  const candidatesOnly = recommendations.every(r => r.evaluationBasis === 'candidate_only');
  return <View style={styles.container}>
    <View style={styles.section}>
      <Text style={[styles.eyebrow, { color: theme.textMuted }]}>WHAT ARE YOU FEELING?</Text>
      <View style={styles.symptoms}>
        {SYMPTOMS.map(item => <Pressable key={item.id} accessibilityRole="button"
          accessibilityState={{ selected: selectedSymptom === item.id }} onPress={() => setSelectedSymptom(item.id)}
          style={[styles.symptom, { backgroundColor: selectedSymptom === item.id ? theme.bgElevated : theme.bgSecondary,
            borderColor: selectedSymptom === item.id ? theme.accentPrimary : theme.borderSubtle }]}>
          <Text style={{ color: selectedSymptom === item.id ? theme.accentPrimary : theme.textPrimary, fontSize: 12, fontWeight: '600' }}>{item.title}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 5 }}>{item.detail}</Text>
        </Pressable>)}
      </View>
    </View>
    <View style={styles.filter}>
      {([{ id: 'all', label: 'All changes' }, { id: 'trackside', label: 'Trackside' }, { id: 'shop', label: 'Shop' }] as const).map(item =>
        <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: scopeFilter === item.id }}
          onPress={() => setScopeFilter(item.id as 'all' | AdjustmentScope)} style={[styles.filterButton, { backgroundColor: scopeFilter === item.id ? theme.bgElevated : 'transparent' }]}>
          <Text style={{ color: scopeFilter === item.id ? theme.accentPrimary : theme.textMuted, fontSize: 11 }}>{item.label}</Text>
        </Pressable>)}
    </View>
    <View>
      <Text style={[styles.listTitle, { color: theme.textPrimary }]}>{candidatesOnly ? 'Setup candidates' : 'Changes to explore'} <Text style={{ color: theme.textMuted, fontWeight: '400' }}> / {recommendations.length}</Text></Text>
      <Text style={[styles.caption, { color: theme.textMuted }]}>{driver.cornerPhase === 'mid' ? 'Apex' : driver.cornerPhase === 'entry' ? 'Entry' : 'Exit'} · {driver.surfaceCondition.replaceAll('_', ' ')} · {candidatesOnly ? 'Unranked guidance; this symptom or operating state is not quantitatively solved.' : 'Ordered by improvement in the stated model proxy, not confidence or measured performance.'}</Text>
    </View>
    {recommendations.length === 0 && <Text style={[styles.empty, { color: theme.textSecondary, borderColor: theme.border }]}>
      No improving changes were found within this filter. Try a different condition or explore the setup controls directly.
    </Text>}
    {recommendations.map((rec, index) => {
      const candidate = rec.evaluationBasis === 'candidate_only';
      const preview = previewRecommendationId === rec.id;
      return <View key={rec.id} style={[styles.recommendation, { borderColor: preview ? theme.accentPrimary : theme.borderSubtle, backgroundColor: theme.bgCard }]}>
        <View style={styles.recHeader}>
          <Text style={{ color: theme.textMuted, fontSize: 9, fontWeight: '600', letterSpacing: 1 }}>{candidate ? 'CANDIDATE · UNRANKED' : `MODEL RANK ${index + 1}`}</Text>
          <Text style={{ color: rec.scope === 'shop' ? theme.shopBadgeText : theme.tracksideBadgeText, fontSize: 9, fontWeight: '600', letterSpacing: 1 }}>{rec.scope.toUpperCase()}</Text>
        </View>
        <Text style={[styles.recTitle, { color: theme.textPrimary }]}>{rec.title}</Text>
        <Text style={[styles.direction, { color: theme.accentPrimary }]}>{rec.directionLabel}</Text>
        <Text style={[styles.caption, { color: theme.textMuted }]}>{rec.objectiveLabel}</Text>
        {!candidate && rec.predictedImprovement !== null && rec.predictedImprovement !== undefined &&
          <Text style={{ color: theme.neutralColor, fontSize: 11, marginTop: 7 }}>Model improvement: {rec.predictedImprovement.toFixed(2)} {rec.evaluationBasis === 'traction_reserve_proxy' ? 'demand ratio' : 'balance points'}</Text>}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Preview ${rec.title}`} onPress={() => {
            setPreviewRecommendationId(preview ? null : rec.id); if (!preview) onPreview?.();
          }} style={[styles.action, { borderColor: theme.accentPrimary, backgroundColor: preview ? theme.accentPrimary : 'transparent' }]}>
            <Text style={{ color: preview ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.accentPrimary, fontSize: 12, fontWeight: '600' }}>{preview ? 'Cancel preview' : 'Preview on car'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`Apply ${rec.title}`} onPress={() => applyRecommendation(rec)}
            style={[styles.action, { borderColor: theme.border }]}>
            <Text style={{ color: theme.textPrimary, fontSize: 12, fontWeight: '600' }}>Apply change</Text>
          </Pressable>
        </View>
        <Pressable accessibilityRole="button" aria-expanded={expanded === rec.id} accessibilityState={{ expanded: expanded === rec.id }}
          onPress={() => setExpanded(expanded === rec.id ? null : rec.id)} style={{ paddingTop: 13 }}>
          <Text style={{ color: theme.textMuted, fontSize: 11 }}>{expanded === rec.id ? 'Hide' : 'Why this change?'}{expanded !== rec.id ? '  /  mechanism & tradeoffs' : ''}</Text>
        </Pressable>
        {expanded === rec.id && <View style={[styles.explanation, { borderColor: theme.borderSubtle }]}>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>{rec.physicalMechanism}</Text>
          <Text style={[styles.caption, { color: theme.textMuted, marginTop: 12 }]}>Model relationship: {rec.equationReference}</Text>
          <Text style={[styles.caption, { color: theme.warningColor, marginTop: 12 }]}>Tradeoff: {rec.secondaryTradeoff}</Text>
          <Text style={[styles.caption, { color: theme.textMuted, marginTop: 12 }]}>Illustrative balance deltas: entry {rec.phaseImpact.entryDelta > 0 ? '+' : ''}{rec.phaseImpact.entryDelta} · apex {rec.phaseImpact.midDelta > 0 ? '+' : ''}{rec.phaseImpact.midDelta} · exit {rec.phaseImpact.exitDelta > 0 ? '+' : ''}{rec.phaseImpact.exitDelta}</Text>
        </View>}
      </View>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 16 }, section: { gap: 12 }, eyebrow: { fontSize: 9, fontWeight: '700', letterSpacing: 1.4 },
  symptoms: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, symptom: { flexBasis: '45%', flexGrow: 1, padding: 13, borderWidth: 1, borderRadius: 8 },
  filter: { flexDirection: 'row', gap: 5 }, filterButton: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 6 },
  listTitle: { fontSize: 17, fontWeight: '600' }, caption: { fontSize: 11, lineHeight: 18, marginTop: 5 },
  recommendation: { borderWidth: 1, borderRadius: 12, padding: 19 }, recHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  recTitle: { fontSize: 15, fontWeight: '600', lineHeight: 22 }, direction: { fontSize: 12, lineHeight: 19, marginTop: 7, marginBottom: 5 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 17 }, action: { flex: 1, padding: 10, borderWidth: 1, borderRadius: 7, alignItems: 'center' },
  explanation: { marginTop: 14, paddingTop: 10, borderTopWidth: 1 }, empty: { borderWidth: 1, borderRadius: 8, padding: 18, fontSize: 13, lineHeight: 21 },
});
