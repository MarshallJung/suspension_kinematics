import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  AdjustmentScope,
  CornerPhase,
  HandlingSymptomType,
  RankedAdjustmentRecommendation,
} from '../engine';
import { useTuningStore } from '../store/useTuningStore';
import { ThemePalette } from '../theme/colors';

interface SymptomWizardScreenProps {
  theme: ThemePalette;
}

const SYMPTOM_OPTIONS: {
  id: HandlingSymptomType;
  title: string;
  subtitle: string;
  accent: 'understeer' | 'oversteer' | 'warning';
}[] = [
  {
    id: 'understeer',
    title: 'Understeer (Front Pushes Wide)',
    subtitle: 'Front tires saturate first (α_F > α_R); car resists turning toward apex',
    accent: 'understeer',
  },
  {
    id: 'oversteer',
    title: 'Oversteer (Rear Loose / Rotates)',
    subtitle: 'Rear tires saturate first (α_R > α_F); tail steps out or requires counter-steer',
    accent: 'oversteer',
  },
  {
    id: 'slow_turn_in_response',
    title: 'Lazy / Slow Initial Turn-In',
    subtitle: 'Sluggish yaw build-up when transitioning from braking into corner entry',
    accent: 'understeer',
  },
  {
    id: 'instability_braking',
    title: 'Nervous Rear Under Braking',
    subtitle: 'Rear axle wanders or wants to swap ends during heavy braking / trail-braking',
    accent: 'oversteer',
  },
  {
    id: 'poor_traction_exit',
    title: 'Poor Exit Traction / Wheelspin',
    subtitle: 'Driven wheels spin or saturate combined-slip friction circle on throttle',
    accent: 'warning',
  },
  {
    id: 'mid_corner_bump_skittishness',
    title: 'Skittish Over Curbs & Bumps',
    subtitle: 'Tires skip or lose contact patch compliance over bumpy pavement or apex curbs',
    accent: 'warning',
  },
];

export const SymptomWizardScreen: React.FC<SymptomWizardScreenProps> = ({
  theme,
}) => {
  const {
    selectedSymptom,
    driver,
    scopeFilter,
    recommendations,
    previewRecommendationId,
    setSelectedSymptom,
    setCornerPhase,
    setScopeFilter,
    setPreviewRecommendationId,
    applyRecommendation,
  } = useTuningStore();

  return (
    <View style={styles.container}>
      {/* Step 1: Select Symptom */}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: theme.bgCard, borderColor: theme.border },
        ]}
      >
        <Text style={[styles.stepBadge, { color: theme.accentPrimary }]}>
          STEP 1 • WHAT IS THE CAR DOING?
        </Text>
        <View style={styles.symptomGrid}>
          {SYMPTOM_OPTIONS.map((item) => {
            const isSelected = selectedSymptom === item.id;
            const accentColor =
              item.accent === 'understeer'
                ? theme.understeerColor
                : item.accent === 'oversteer'
                ? theme.oversteerColor
                : theme.warningColor;

            return (
              <Pressable
                key={item.id}
                onPress={() => setSelectedSymptom(item.id)}
                style={[
                  styles.symptomCard,
                  {
                    backgroundColor: isSelected ? theme.bgElevated : theme.bgSecondary,
                    borderColor: isSelected ? accentColor : theme.borderSubtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.symptomTitle,
                    { color: isSelected ? accentColor : theme.textPrimary },
                  ]}
                >
                  {item.title}
                </Text>
                <Text style={[styles.symptomSub, { color: theme.textMuted }]}>
                  {item.subtitle}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Step 2 & 3: Corner Phase + Trackside vs Shop Filter */}
      <View
        style={[
          styles.sectionCard,
          { backgroundColor: theme.bgCard, borderColor: theme.border },
        ]}
      >
        <Text style={[styles.stepBadge, { color: theme.accentPrimary }]}>
          STEP 2 • CORNER PHASE & PADDOCK ADJUSTABILITY FILTER
        </Text>

        <View style={styles.filterGroupRow}>
          {(
            [
              { id: 'entry', label: '1. Entry (Brake / Turn-In)' },
              { id: 'mid', label: '2. Mid-Corner (Apex)' },
              { id: 'exit', label: '3. Exit (Throttle)' },
            ] as { id: CornerPhase; label: string }[]
          ).map((ph) => {
            const active = driver.cornerPhase === ph.id;
            return (
              <Pressable
                key={ph.id}
                onPress={() => setCornerPhase(ph.id)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? theme.accentPrimary : theme.bgSecondary,
                    borderColor: active ? theme.accentPrimary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: active ? '#0B0F17' : theme.textSecondary },
                  ]}
                >
                  {ph.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.filterGroupRow, { marginTop: 8 }]}>
          {(
            [
              { id: 'all', label: 'All Adjustments' },
              { id: 'trackside', label: '⚡ Trackside Quick Tweaks' },
              { id: 'shop', label: '🔧 Alignment & Shop Setup' },
            ] as { id: 'all' | AdjustmentScope; label: string }[]
          ).map((sc) => {
            const active = scopeFilter === sc.id;
            return (
              <Pressable
                key={sc.id}
                onPress={() => setScopeFilter(sc.id)}
                style={[
                  styles.filterPill,
                  {
                    backgroundColor: active ? theme.accentSecondary : theme.bgSecondary,
                    borderColor: active ? theme.accentSecondary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    { color: active ? '#0B0F17' : theme.textSecondary },
                  ]}
                >
                  {sc.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Ranked Deterministic Adjustment Cards */}
      <View style={styles.recommendationsList}>
        <Text style={[styles.listHeader, { color: theme.textSecondary }]}>
          RANKED DETERMINISTIC SOLUTIONS ({recommendations.length} AVAILABLE)
        </Text>

        {recommendations.map((rec: RankedAdjustmentRecommendation, idx: number) => {
          const isPreviewing = previewRecommendationId === rec.id;

          return (
            <View
              key={rec.id}
              style={[
                styles.recCard,
                {
                  backgroundColor: theme.bgCard,
                  borderColor: isPreviewing ? theme.accentPrimary : theme.border,
                  borderWidth: isPreviewing ? 2 : 1,
                },
              ]}
            >
              <View style={styles.recTopRow}>
                <View style={styles.recRankTitleRow}>
                  <View
                    style={[
                      styles.rankCircle,
                      { backgroundColor: theme.accentPrimary },
                    ]}
                  >
                    <Text style={styles.rankNumberText}>#{idx + 1}</Text>
                  </View>
                  <View style={{ flexShrink: 1 }}>
                    <Text style={[styles.recTitle, { color: theme.textPrimary }]}>
                      {rec.title}
                    </Text>
                    <Text style={[styles.recDirection, { color: theme.accentPrimary }]}>
                      {rec.directionLabel}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.scopeTag,
                    {
                      backgroundColor:
                        rec.scope === 'trackside'
                          ? theme.tracksideBadgeBg
                          : theme.shopBadgeBg,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.scopeTagText,
                      {
                        color:
                          rec.scope === 'trackside'
                            ? theme.tracksideBadgeText
                            : theme.shopBadgeText,
                      },
                    ]}
                  >
                    {rec.scope === 'trackside' ? '⚡ TRACKSIDE' : '🔧 SHOP'}
                  </Text>
                </View>
              </View>

              {/* Physical Mechanism & Equation */}
              <View
                style={[
                  styles.mechanismBox,
                  { backgroundColor: theme.bgSecondary, borderColor: theme.borderSubtle },
                ]}
              >
                <Text style={[styles.mechanismLabel, { color: theme.textSecondary }]}>
                  Physical Mechanism ({rec.category}):
                </Text>
                <Text style={[styles.mechanismBody, { color: theme.textPrimary }]}>
                  {rec.physicalMechanism}
                </Text>
                <Text style={[styles.equationText, { color: theme.accentPrimary }]}>
                  Governing Law: {rec.equationReference}
                </Text>
              </View>

              {/* Secondary Tradeoff Warning */}
              <View
                style={[
                  styles.tradeoffBox,
                  { borderColor: theme.borderSubtle },
                ]}
              >
                <Text style={[styles.tradeoffTitle, { color: theme.warningColor }]}>
                  ⚠ Secondary Tradeoff / Watch Out For:
                </Text>
                <Text style={[styles.tradeoffBody, { color: theme.textSecondary }]}>
                  {rec.secondaryTradeoff}
                </Text>
              </View>

              {/* Quantitative Phase Deltas */}
              <View style={styles.phaseDeltasRow}>
                <Text style={[styles.phaseDeltaItem, { color: theme.textMuted }]}>
                  Entry Δ: {rec.phaseImpact.entryDelta > 0 ? `+${rec.phaseImpact.entryDelta}` : rec.phaseImpact.entryDelta}
                </Text>
                <Text style={[styles.phaseDeltaItem, { color: theme.textMuted }]}>
                  Mid Δ: {rec.phaseImpact.midDelta > 0 ? `+${rec.phaseImpact.midDelta}` : rec.phaseImpact.midDelta}
                </Text>
                <Text style={[styles.phaseDeltaItem, { color: theme.textMuted }]}>
                  Exit Δ: {rec.phaseImpact.exitDelta > 0 ? `+${rec.phaseImpact.exitDelta}` : rec.phaseImpact.exitDelta}
                </Text>
              </View>

              {/* Interactive Action Buttons */}
              <View style={styles.actionBtnRow}>
                <Pressable
                  onPress={() =>
                    setPreviewRecommendationId(isPreviewing ? null : rec.id)
                  }
                  style={[
                    styles.previewBtn,
                    {
                      backgroundColor: isPreviewing
                        ? theme.accentPrimary
                        : theme.bgElevated,
                      borderColor: theme.accentPrimary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.previewBtnText,
                      { color: isPreviewing ? '#0B0F17' : theme.accentPrimary },
                    ]}
                  >
                    {isPreviewing ? '👁 Previewing on Car' : '👁 Preview on 2D Car'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => applyRecommendation(rec)}
                  style={[
                    styles.applyBtn,
                    { backgroundColor: theme.neutralColor },
                  ]}
                >
                  <Text style={styles.applyBtnText}>✓ Apply to Setup</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  sectionCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  stepBadge: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  symptomGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  symptomCard: {
    width: '48.5%',
    minWidth: 150,
    flexGrow: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  symptomTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    marginBottom: 3,
  },
  symptomSub: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  filterGroupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  recommendationsList: {
    gap: 10,
  },
  listHeader: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginLeft: 2,
  },
  recCard: {
    padding: 12,
    borderRadius: 12,
  },
  recTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  recRankTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNumberText: {
    color: '#0B0F17',
    fontSize: 12,
    fontWeight: '900',
  },
  recTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  recDirection: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 1,
  },
  scopeTag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  scopeTagText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  mechanismBox: {
    padding: 9,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  mechanismLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    marginBottom: 2,
  },
  mechanismBody: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  equationText: {
    fontSize: 10.5,
    fontWeight: '700',
    marginTop: 5,
    fontFamily: 'monospace',
  },
  tradeoffBox: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginBottom: 6,
  },
  tradeoffTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    marginBottom: 2,
  },
  tradeoffBody: {
    fontSize: 11,
    lineHeight: 15,
  },
  phaseDeltasRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  phaseDeltaItem: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  previewBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  previewBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  applyBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
  },
  applyBtnText: {
    color: '#0B0F17',
    fontSize: 11.5,
    fontWeight: '800',
  },
});
