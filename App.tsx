import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ArchetypeAndDriverBar } from './src/components/visualizer/ArchetypeAndDriverBar';
import { ChassisTopDownCanvas } from './src/components/visualizer/ChassisTopDownCanvas';
import { simulateVehicleState } from './src/engine';
import { SandboxTuningScreen } from './src/screens/SandboxTuningScreen';
import { SymptomWizardScreen } from './src/screens/SymptomWizardScreen';
import { useTuningStore } from './src/store/useTuningStore';
import { THEMES } from './src/theme/colors';

export default function App() {
  const {
    activeTab,
    themeMode,
    setup,
    driver,
    currentSim,
    pinnedBaseline,
    recommendations,
    previewRecommendationId,
    selectedWheel,
    setActiveTab,
    toggleThemeMode,
    setSelectedWheel,
    setCornerPhase,
    updateDriver,
  } = useTuningStore();

  const theme = THEMES[themeMode];

  // Compute live preview simulation if a recommendation card's "Preview on 2D Car" is toggled
  const previewData = useMemo(() => {
    if (!previewRecommendationId) return null;
    const rec = recommendations.find((r) => r.id === previewRecommendationId);
    if (!rec) return null;
    const nextSetup = { ...setup, ...rec.suggestedSetupPatch };
    const nextDriver = { ...driver, ...(rec.suggestedDriverPatch ?? {}) };
    return {
      sim: simulateVehicleState(nextSetup, nextDriver),
      title: rec.directionLabel,
    };
  }, [previewRecommendationId, recommendations, setup, driver]);

  const activeWarnings = (previewData?.sim ?? currentSim).warnings;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.bgPrimary }]}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />

      {/* Top App Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border },
        ]}
      >
        <View style={styles.headerTitleBlock}>
          <Text style={[styles.appTitle, { color: theme.textPrimary }]}>
            PADDOCK KINEMATICS
          </Text>
          <Text style={[styles.appSubtitle, { color: theme.textMuted }]}>
            Deterministic Track Suspension & Handling Visualizer
          </Text>
        </View>

        <Pressable
          onPress={toggleThemeMode}
          style={[
            styles.themeBtn,
            { backgroundColor: theme.bgCard, borderColor: theme.border },
          ]}
        >
          <Text style={[styles.themeBtnText, { color: theme.textPrimary }]}>
            {themeMode === 'dark' ? '☀ Daylight' : '🌙 Dark Mode'}
          </Text>
        </Pressable>
      </View>

      {/* Primary Mode Switcher (Symptom Wizard vs What-If Sandbox) */}
      <View
        style={[
          styles.modeBar,
          { backgroundColor: theme.bgSecondary, borderBottomColor: theme.border },
        ]}
      >
        <Pressable
          onPress={() => setActiveTab('wizard')}
          style={[
            styles.modeTab,
            {
              backgroundColor:
                activeTab === 'wizard' ? theme.accentPrimary : theme.bgCard,
              borderColor:
                activeTab === 'wizard' ? theme.accentPrimary : theme.borderSubtle,
            },
          ]}
        >
          <Text
            style={[
              styles.modeTabText,
              { color: activeTab === 'wizard' ? '#0B0F17' : theme.textPrimary },
            ]}
          >
            🧭 Symptom / Question Wizard
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('sandbox')}
          style={[
            styles.modeTab,
            {
              backgroundColor:
                activeTab === 'sandbox' ? theme.accentPrimary : theme.bgCard,
              borderColor:
                activeTab === 'sandbox' ? theme.accentPrimary : theme.borderSubtle,
            },
          ]}
        >
          <Text
            style={[
              styles.modeTabText,
              { color: activeTab === 'sandbox' ? '#0B0F17' : theme.textPrimary },
            ]}
          >
            🎛 What-If Tuning Sandbox
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Interactive 2D Top-Down Chassis View */}
        <ChassisTopDownCanvas
          sim={currentSim}
          baselineSim={pinnedBaseline?.sim}
          previewSim={previewData?.sim}
          previewTitle={previewData?.title}
          selectedWheel={selectedWheel}
          onSelectWheel={setSelectedWheel}
          onSelectPhase={setCornerPhase}
          onToggleTurnDirection={() =>
            updateDriver({
              turnDirection: driver.turnDirection === 'left' ? 'right' : 'left',
            })
          }
          theme={theme}
        />

        {/* Engineering & Kinematic Warnings */}
        {activeWarnings.length > 0 ? (
          <View style={styles.warningsList}>
            {activeWarnings.map((warn) => {
              const borderCol =
                warn.severity === 'critical'
                  ? theme.criticalColor
                  : warn.severity === 'warning'
                  ? theme.warningColor
                  : theme.accentPrimary;
              return (
                <View
                  key={warn.id}
                  style={[
                    styles.warningCard,
                    {
                      backgroundColor: theme.bgCard,
                      borderColor: borderCol,
                    },
                  ]}
                >
                  <Text style={[styles.warningTitle, { color: borderCol }]}>
                    ⚠ {warn.title}
                  </Text>
                  <Text style={[styles.warningBody, { color: theme.textSecondary }]}>
                    {warn.explanation}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Archetype, Linkage & Driver Coaching Input Bar */}
        <ArchetypeAndDriverBar theme={theme} />

        {/* Active Synchronized Screen */}
        {activeTab === 'wizard' ? (
          <SymptomWizardScreen theme={theme} />
        ) : (
          <SandboxTuningScreen theme={theme} />
        )}

        {/* Paddock Safety & Educational Disclaimer Footer */}
        <View
          style={[
            styles.footer,
            { borderTopColor: theme.borderSubtle },
          ]}
        >
          <Text style={[styles.footerText, { color: theme.textMuted }]}>
            Paddock Kinematics • Grounded in Milliken RCVD, Dixon, Gillespie, Carroll Smith & Pacejka formulations. For HPDE instructional & setup visualization—always verify mechanical clearances, tire temperatures/pressures, and manufacturer torque specifications before going on track.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerTitleBlock: {
    flex: 1,
  },
  appTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  appSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  themeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  themeBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  modeBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  modeTabText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 36,
  },
  warningsList: {
    gap: 8,
    marginBottom: 12,
  },
  warningCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  warningBody: {
    fontSize: 11,
    lineHeight: 15,
  },
  footer: {
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  footerText: {
    fontSize: 10.5,
    lineHeight: 15,
    textAlign: 'center',
  },
});
