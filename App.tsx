import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ArchetypeAndDriverBar } from './src/components/visualizer/ArchetypeAndDriverBar';
import { ChassisTopDownCanvas } from './src/components/visualizer/ChassisTopDownCanvas';
import { simulateVehicleState } from './src/engine';
import { SandboxTuningScreen } from './src/screens/SandboxTuningScreen';
import { SymptomWizardScreen } from './src/screens/SymptomWizardScreen';
import { useTuningStore } from './src/store/useTuningStore';
import { THEMES } from './src/theme/colors';

export default function App() {
  const { width } = useWindowDimensions();
  const desktop = width >= 960;
  const overviewRef = useRef<ScrollView>(null);
  const [showModel, setShowModel] = useState(false);
  const { activeTab, themeMode, setup, driver, currentSim, pinnedBaseline, recommendations,
    previewRecommendationId, selectedWheel, frequencyNotice, setActiveTab, toggleThemeMode,
    setSelectedWheel, setCornerPhase, updateDriver, pinCurrentAsBaseline, revertToBaseline,
    setPreviewRecommendationId, applyRecommendation } = useTuningStore();
  const theme = THEMES[themeMode];
  useEffect(() => {
    if (!previewRecommendationId) return;
    // Run after the preview layout commits. Immediate scrolling can race the
    // browser's focus scroll when a card is far below the mobile overview.
    const frame = requestAnimationFrame(() => overviewRef.current?.scrollTo({ y: 0, animated: false }));
    return () => cancelAnimationFrame(frame);
  }, [previewRecommendationId, desktop]);
  const previewData = useMemo(() => {
    const rec = recommendations.find(r => r.id === previewRecommendationId);
    if (!rec) return null;
    return { rec, sim: simulateVehicleState({ ...setup, ...rec.suggestedSetupPatch },
      { ...driver, ...(rec.suggestedDriverPatch ?? {}) }) };
  }, [previewRecommendationId, recommendations, setup, driver]);
  const activeWarnings = (previewData?.sim ?? currentSim).warnings;
  const overview = <View style={styles.overviewContent}>
    <ChassisTopDownCanvas sim={currentSim} baselineSim={pinnedBaseline?.sim} previewSim={previewData?.sim}
      previewTitle={previewData?.rec.directionLabel} selectedWheel={selectedWheel}
      onSelectWheel={setSelectedWheel} onSelectPhase={setCornerPhase}
      onToggleTurnDirection={() => updateDriver({ turnDirection: driver.turnDirection === 'left' ? 'right' : 'left' })} theme={theme} />
    {previewData && <View style={[styles.previewActions, { backgroundColor: theme.bgCard, borderColor: theme.accentPrimary }]}>
      <Pressable accessibilityRole="button" onPress={() => setPreviewRecommendationId(null)} style={[styles.action, { borderColor: theme.border }]}>
        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>Cancel preview</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => applyRecommendation(previewData.rec)} style={[styles.action, { backgroundColor: theme.accentPrimary }]}>
        <Text style={{ color: theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A', fontSize: 12, fontWeight: '700' }}>Apply this change</Text>
      </Pressable>
    </View>}
    {activeWarnings.map(warn => <View key={warn.id} style={[styles.warning, { borderLeftColor: warn.severity === 'critical' ? theme.criticalColor : theme.warningColor, backgroundColor: theme.bgCard }]}>
      <Text style={{ color: warn.severity === 'critical' ? theme.criticalColor : theme.warningColor, fontSize: 12, fontWeight: '700', marginBottom: 5 }}>{warn.title}</Text>
      <Text style={{ color: theme.textSecondary, fontSize: 11, lineHeight: 17 }}>{warn.explanation}</Text>
    </View>)}
  </View>;
  const editor = <View style={styles.editorContent}>
    <ArchetypeAndDriverBar theme={theme} />
    <View style={[styles.modeBar, { backgroundColor: theme.bgSecondary, borderColor: theme.borderSubtle }]}>
      {([{ id: 'sandbox', title: 'Tune setup', subtitle: 'Explore a change' }, { id: 'wizard', title: 'Diagnose handling', subtitle: 'Start with a symptom' }] as const).map(tab =>
        <Pressable key={tab.id} accessibilityRole="tab" aria-selected={activeTab === tab.id} accessibilityState={{ selected: activeTab === tab.id }} onPress={() => setActiveTab(tab.id)}
          style={[styles.modeTab, { backgroundColor: activeTab === tab.id ? theme.bgElevated : 'transparent', borderColor: activeTab === tab.id ? theme.border : 'transparent' }]}>
          <Text style={{ color: activeTab === tab.id ? theme.accentPrimary : theme.textSecondary, fontSize: 14, fontWeight: '600' }}>{tab.title}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 10, marginTop: 4 }}>{tab.subtitle}</Text>
        </Pressable>)}
    </View>
    {frequencyNotice && <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: theme.bgElevated, borderColor: theme.warningColor }]}>
      <Text style={{ color: theme.warningColor, fontSize: 12, lineHeight: 18 }}>{frequencyNotice}</Text>
    </View>}
    {activeTab === 'wizard' ? <SymptomWizardScreen theme={theme} onPreview={() => overviewRef.current?.scrollTo({ y: 0, animated: false })} /> : <SandboxTuningScreen theme={theme} />}
    <Pressable accessibilityRole="button" aria-expanded={showModel} accessibilityState={{ expanded: showModel }} onPress={() => setShowModel(!showModel)} style={[styles.modelInfo, { borderColor: theme.borderSubtle }]}>
      <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '600' }}>{showModel ? 'Hide' : 'About'} this model</Text>
    </Pressable>
    {showModel && <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 19, marginBottom: 25 }}>
      Quasi-static force and attitude calculations with illustrative geometry, tire and damper profiles. Balance scores and slip estimates show model tendencies; measured tire data and suspension hardpoints are needed for vehicle-specific predictions. The standalone spatial linkage solver is separate from these profiles. Wheel lift and grip-limit requests are flagged rather than treated as solved handling states.
    </Text>}
  </View>;

  return <SafeAreaProvider><SafeAreaView style={[styles.safe, { backgroundColor: theme.bgPrimary }]}>
    <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
    <View style={[styles.header, !desktop && styles.mobileHeader, { borderColor: theme.borderSubtle }]}>
      <View style={styles.brand}>
        <Text style={[styles.brandName, !desktop && styles.mobileBrandName, { color: theme.textPrimary }]}>PADDOCK<Text style={{ color: theme.accentPrimary }}> / </Text>KINEMATICS</Text>
        <Text style={[styles.tagline, { color: theme.textMuted }]}>Understand the balance. Explore the setup.</Text>
      </View>
      <View style={styles.headerActions}>
        {desktop && <Text style={[styles.localLabel, { color: theme.textMuted }]}>LOCAL WORKSPACE</Text>}
        <Pressable accessibilityRole="button" onPress={toggleThemeMode} style={[styles.headerButton, { borderColor: theme.border }]}>
          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{themeMode === 'dark' ? 'Daylight' : 'Dark mode'}</Text>
        </Pressable>
      </View>
    </View>
    <View style={[styles.toolbar, !desktop && styles.mobileToolbar, { borderColor: theme.borderSubtle }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textPrimary, fontSize: 14, fontWeight: '600' }}>Setup lab</Text>
        {desktop && <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>Change one variable. Compare all four corners.</Text>}
      </View>
      <Pressable accessibilityRole="button" onPress={pinCurrentAsBaseline} style={[styles.action, { borderColor: theme.border }]}>
        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>Pin baseline</Text>
      </Pressable>
      {pinnedBaseline && <Pressable accessibilityRole="button" onPress={revertToBaseline} style={[styles.action, { borderColor: theme.border }]}>
        <Text style={{ color: theme.textSecondary, fontSize: 11 }}>Revert setup</Text>
      </Pressable>}
    </View>
    {desktop ? <View style={styles.desktop}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ref={overviewRef} style={styles.overviewPane} contentContainerStyle={styles.panePadding}>{overview}</ScrollView>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={[styles.editorPane, { borderLeftColor: theme.borderSubtle }]} contentContainerStyle={styles.panePadding}>{editor}</ScrollView>
    </View> : <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" ref={overviewRef} contentContainerStyle={styles.mobileContent}>{overview}{editor}</ScrollView>}
  </SafeAreaView></SafeAreaProvider>;
}
const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, paddingHorizontal: 28, paddingVertical: 20, gap: 12 },
  mobileHeader: { paddingHorizontal: 14, paddingVertical: 13, gap: 8 },
  mobileBrandName: { fontSize: 13, letterSpacing: 0.6 },
  mobileToolbar: { paddingHorizontal: 14, paddingVertical: 10 },
  brand: { flex: 1 }, brandName: { fontSize: 16, fontWeight: '700', letterSpacing: 1.2 }, tagline: { fontSize: 11, marginTop: 6 },
  headerActions: { flexDirection: 'row', gap: 22, alignItems: 'center' }, localLabel: { fontSize: 8, letterSpacing: 1.5 },
  headerButton: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderRadius: 7, paddingHorizontal: 13, paddingVertical: 9 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 17, borderBottomWidth: 1 },
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 7, borderWidth: 1, borderColor: 'transparent' },
  desktop: { flex: 1, flexDirection: 'row', width: '100%', maxWidth: 1700, alignSelf: 'center' },
  overviewPane: { flex: 1.12 }, editorPane: { flex: 1, borderLeftWidth: 1 }, panePadding: { padding: 24, paddingBottom: 48 },
  mobileContent: { padding: 12, paddingBottom: 48, gap: 20 }, overviewContent: { gap: 12 }, editorContent: { gap: 15 },
  modeBar: { flexDirection: 'row', padding: 4, borderRadius: 10, borderWidth: 1, gap: 4 },
  modeTab: { flex: 1, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 7, borderWidth: 1 },
  warning: { padding: 15, borderLeftWidth: 3, borderRadius: 8 },
  notice: { borderWidth: 1, borderRadius: 8, padding: 12 }, modelInfo: { paddingVertical: 16, borderTopWidth: 1 },
  previewActions: { padding: 12, borderWidth: 1, borderRadius: 10, flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
});
