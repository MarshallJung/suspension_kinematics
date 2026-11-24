import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ALIGNMENT_PRESETS,
  AlignmentPresetId,
  DRIVETRAIN_ARCHETYPES,
  DrivetrainArchetype,
  RIDE_FREQUENCY_PRESETS,
  RideFrequencyPresetId,
  SUSPENSION_GEOMETRY_PROFILES,
  SurfaceCondition,
  SuspensionGeometryType,
  kmhToMph,
  mphToKmh,
  newtonsToLbs,
} from '../../engine';
import { useTuningStore } from '../../store/useTuningStore';
import { ThemePalette } from '../../theme/colors';
import { ParameterSlider } from '../common/ParameterSlider';

interface ArchetypeAndDriverBarProps {
  theme: ThemePalette;
}

const ARCHETYPE_LIST: DrivetrainArchetype[] = ['RR', 'MR', 'FR', 'FF', 'AWD'];
const GEOMETRY_LIST: SuspensionGeometryType[] = [
  'macpherson',
  'double_wishbone',
  'multilink',
];
const ALIGNMENT_PRESET_LIST: AlignmentPresetId[] = [
  'oem_road',
  'oem_track_max',
  'dedicated_track',
];
const RIDE_FREQ_PRESET_LIST: RideFrequencyPresetId[] = [
  'oem_street',
  'clubsport_track',
  'full_race',
];

export const ArchetypeAndDriverBar: React.FC<ArchetypeAndDriverBarProps> = ({
  theme,
}) => {
  const {
    setup,
    driver,
    currentSim,
    pinnedBaseline,
    selectArchetype,
    setFrontGeometry,
    setRearGeometry,
    applyAlignmentPreset,
    applyTireSetupPreset,
    applyRideFrequencyPreset,
    updateDriver,
    resetToArchetypeDefault,
  } = useTuningStore();

  const [showCarSpecsDrawer, setShowCarSpecsDrawer] = useState(false);
  const [showDriverSliders, setShowDriverSliders] = useState(false);
  const [showGeometryPicker, setShowGeometryPicker] = useState(false);

  const activeArchetype = DRIVETRAIN_ARCHETYPES[setup.drivetrain];
  const baseDriver = pinnedBaseline?.driver;

  const isOemStagger =
    setup.frontTireWidthMm === activeArchetype.oemFrontTireWidthMm &&
    setup.rearTireWidthMm === activeArchetype.oemRearTireWidthMm;
  const isSquareSetup =
    Math.abs(setup.frontTireWidthMm - setup.rearTireWidthMm) <= 5;

  return (
    <View style={styles.wrapper}>
      {/* Archetype Selector & Baseline Setup Card */}
      <View
        style={[
          styles.card,
          { backgroundColor: theme.bgCard, borderColor: theme.border },
        ]}
      >
        <View style={styles.topRow}>
          <Text style={[styles.sectionHeader, { color: theme.textSecondary }]}>
            VEHICLE PROFILE
          </Text>
          <View style={styles.topActionsGroup}>
            <Pressable accessibilityRole="button"
              onPress={() => setShowCarSpecsDrawer((v) => !v)}
              aria-expanded={showCarSpecsDrawer} accessibilityState={{ expanded: showCarSpecsDrawer }}
              style={[
                styles.smallToggleBtn,
                {
                  backgroundColor: showCarSpecsDrawer ? theme.accentPrimary : theme.bgElevated,
                  borderColor: theme.accentPrimary,
                },
              ]}
            >
              <Text
                style={[
                  styles.smallToggleBtnText,
                  { color: showCarSpecsDrawer ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.accentPrimary },
                ]}
              >
                {showCarSpecsDrawer ? 'Vehicle details ▲' : 'Vehicle details ▼'}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              onPress={() => setShowGeometryPicker((v) => !v)}
              aria-expanded={showGeometryPicker} accessibilityState={{ expanded: showGeometryPicker }}
              style={[
                styles.smallToggleBtn,
                { backgroundColor: theme.bgElevated, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.smallToggleBtnText, { color: theme.accentPrimary }]}>
                {showGeometryPicker ? 'Linkage ▲' : 'Linkage ▼'}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.archetypePillRow}>
          {ARCHETYPE_LIST.map((archId) => {
            const preset = DRIVETRAIN_ARCHETYPES[archId];
            const isSelected = setup.drivetrain === archId;
            return (
              <Pressable accessibilityRole="button"
                key={archId}
                onPress={() => selectArchetype(archId)}
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={preset.shortLabel}
                style={[
                  styles.archPill,
                  {
                    backgroundColor: isSelected ? theme.accentPrimary : theme.bgElevated,
                    borderColor: isSelected ? theme.accentPrimary : theme.borderSubtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.archPillText,
                    { color: isSelected ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.textPrimary },
                  ]}
                >
                  {archId}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.archExamplesText, { color: theme.textMuted }]}>
          {showCarSpecsDrawer ? `${activeArchetype.examples} · Illustrative inputs, not an OEM specification.` :
            `${activeArchetype.name} · ${Math.round(setup.frontWeightFraction * 100)}/${Math.round((1 - setup.frontWeightFraction) * 100)} weight split`}
        </Text>

        {/* Optional Front / Rear Suspension Geometry Selector */}
        {showGeometryPicker ? (
          <View
            style={[
              styles.geometrySection,
              { borderTopColor: theme.borderSubtle },
            ]}
          >
            <Text style={[styles.geomLabel, { color: theme.textSecondary }]}>
              Front Suspension Geometry:
            </Text>
            <View style={styles.geomRow}>
              {GEOMETRY_LIST.map((gId) => {
                const prof = SUSPENSION_GEOMETRY_PROFILES[gId];
                const active = setup.frontGeometry === gId;
                return (
                  <Pressable accessibilityRole="button"
                    key={`front-${gId}`}
                    onPress={() => setFrontGeometry(gId)}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.geomPill,
                      {
                        backgroundColor: active ? theme.accentPrimary : theme.bgSecondary,
                        borderColor: active ? theme.accentPrimary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.geomPillText,
                        { color: active ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.textSecondary },
                      ]}
                    >
                      {prof.shortName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.geomLabel, { color: theme.textSecondary, marginTop: 6 }]}>
              Rear Suspension Geometry:
            </Text>
            <View style={styles.geomRow}>
              {GEOMETRY_LIST.map((gId) => {
                const prof = SUSPENSION_GEOMETRY_PROFILES[gId];
                const active = setup.rearGeometry === gId;
                return (
                  <Pressable accessibilityRole="button"
                    key={`rear-${gId}`}
                    onPress={() => setRearGeometry(gId)}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.geomPill,
                      {
                        backgroundColor: active ? theme.accentPrimary : theme.bgSecondary,
                        borderColor: active ? theme.accentPrimary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.geomPillText,
                        { color: active ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.textSecondary },
                      ]}
                    >
                      {prof.shortName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Platform Summary & Quick Presets Drawer (sliders live in Tune setup below) */}
        {showCarSpecsDrawer ? (
          <View
            style={[
              styles.carSpecsDrawer,
              { borderTopColor: theme.borderSubtle, backgroundColor: theme.bgSecondary },
            ]}
          >
            <Text style={[styles.subSectionHeader, { color: theme.accentPrimary }]}>
              PLATFORM SUMMARY
            </Text>
            <View style={styles.specSummaryGrid}>
              {[
                {
                  label: 'Curb weight',
                  value: `${Math.round(newtonsToLbs(setup.massKg * 9.81))} lb (${setup.massKg} kg)`,
                },
                {
                  label: 'Wheelbase / track',
                  value: `${setup.wheelbaseMm} · ${setup.frontTrackMm}/${setup.rearTrackMm} mm`,
                },
                {
                  label: 'Weight split / CG',
                  value: `${Math.round(setup.frontWeightFraction * 100)}/${Math.round((1 - setup.frontWeightFraction) * 100)} · ${setup.cgHeightMm} mm`,
                },
                {
                  label: 'Ride freq F / R',
                  value: `${currentSim.kinematics.frontNaturalFreqHz.toFixed(2)} / ${currentSim.kinematics.rearNaturalFreqHz.toFixed(2)} Hz`,
                },
                {
                  label: 'Dyn RC F / R · h_roll',
                  value: `${currentSim.kinematics.effectiveFrontRollCenterMm.toFixed(0)}/${currentSim.kinematics.effectiveRearRollCenterMm.toFixed(0)} · ${currentSim.kinematics.rollMomentArmMm.toFixed(0)} mm`,
                },
                {
                  label: 'Alignment F / R',
                  value: `${setup.frontStaticCamberDeg.toFixed(1)}°/${setup.rearStaticCamberDeg.toFixed(1)}° cam · ${setup.frontStaticToeDeg.toFixed(2)}°/${setup.rearStaticToeDeg.toFixed(2)}° toe`,
                },
              ].map((item) => (
                <View
                  key={item.label}
                  style={[styles.specCell, { borderColor: theme.borderSubtle, backgroundColor: theme.bgCard }]}
                >
                  <Text style={[styles.specLabel, { color: theme.textMuted }]}>{item.label}</Text>
                  <Text style={[styles.specValue, { color: theme.textPrimary }]}>{item.value}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.subSectionDivider, { borderTopColor: theme.borderSubtle }]}>
              <Text style={[styles.subSectionHeader, { color: theme.accentPrimary }]}>
                1. QUICK ALIGNMENT PRESETS
              </Text>
              <View style={styles.presetPillRow}>
                {ALIGNMENT_PRESET_LIST.map((presetId) => {
                  const p = ALIGNMENT_PRESETS[presetId];
                  const isSelected =
                    Math.abs(setup.frontStaticCamberDeg - p.frontStaticCamberDeg) < 0.08 &&
                    Math.abs(setup.rearStaticCamberDeg - p.rearStaticCamberDeg) < 0.08 &&
                    Math.abs(setup.frontStaticToeDeg - p.frontStaticToeDeg) < 0.03 &&
                    Math.abs(setup.rearStaticToeDeg - p.rearStaticToeDeg) < 0.03;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={presetId}
                      onPress={() => applyAlignmentPreset(presetId)}
                      accessibilityState={{ selected: isSelected }}
                      style={[
                        styles.geomPill,
                        {
                          backgroundColor: isSelected ? theme.accentPrimary : theme.bgCard,
                          borderColor: isSelected ? theme.accentPrimary : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.geomPillText,
                          { color: isSelected ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.textPrimary },
                        ]}
                      >
                        {p.shortLabel} ({p.frontStaticCamberDeg}°F / {p.rearStaticCamberDeg}°R)
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.subSectionDivider, { borderTopColor: theme.borderSubtle }]}>
              <Text style={[styles.subSectionHeader, { color: theme.accentSecondary }]}>
                2. TIRE SIZING PRESETS (SQUARE VS. STAGGERED)
              </Text>
              <View style={styles.presetPillRow}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => applyTireSetupPreset('oem_stagger')}
                  accessibilityState={{ selected: isOemStagger }}
                  style={[
                    styles.geomPill,
                    {
                      backgroundColor: isOemStagger ? theme.accentSecondary : theme.bgCard,
                      borderColor: isOemStagger ? theme.accentSecondary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.geomPillText,
                      { color: isOemStagger ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.textPrimary },
                    ]}
                  >
                    Baseline sizing ({activeArchetype.oemFrontTireWidthMm}F /{' '}
                    {activeArchetype.oemRearTireWidthMm}R mm)
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  onPress={() => applyTireSetupPreset('square_track')}
                  accessibilityState={{ selected: isSquareSetup && !isOemStagger }}
                  style={[
                    styles.geomPill,
                    {
                      backgroundColor:
                        isSquareSetup && !isOemStagger ? theme.accentSecondary : theme.bgCard,
                      borderColor:
                        isSquareSetup && !isOemStagger ? theme.accentSecondary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.geomPillText,
                      {
                        color:
                          isSquareSetup && !isOemStagger
                            ? theme.mode === 'daylight'
                              ? '#FFFFFF'
                              : '#0A111A'
                            : theme.textPrimary,
                      },
                    ]}
                  >
                    Square Track Setup ({activeArchetype.squareTireWidthMm}F /{' '}
                    {activeArchetype.squareTireWidthMm}R mm)
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={[styles.subSectionDivider, { borderTopColor: theme.borderSubtle }]}>
              <Text style={[styles.subSectionHeader, { color: theme.accentPrimary }]}>
                3. RIDE FREQUENCY TARGETS
              </Text>
              <View style={styles.presetPillRow}>
                {RIDE_FREQ_PRESET_LIST.map((rfId) => {
                  const rf = RIDE_FREQUENCY_PRESETS[rfId];
                  const isActive =
                    Math.abs(currentSim.kinematics.frontNaturalFreqHz - rf.targetFrontHz) < 0.12 &&
                    Math.abs(currentSim.kinematics.rearNaturalFreqHz - rf.targetRearHz) < 0.12;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={rfId}
                      onPress={() => applyRideFrequencyPreset(rfId)}
                      accessibilityState={{ selected: isActive }}
                      style={[
                        styles.geomPill,
                        {
                          backgroundColor: isActive ? theme.accentPrimary : theme.bgCard,
                          borderColor: isActive ? theme.accentPrimary : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.geomPillText,
                          { color: isActive ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.textPrimary },
                        ]}
                      >
                        {rf.shortLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.subCaption, { color: theme.textMuted }]}>
                Fine-tune individual camber, toe, spring, and tire values in Tune setup below.
              </Text>
            </View>
          </View>
        ) : null}

        <Pressable accessibilityRole="button" onPress={resetToArchetypeDefault} style={styles.resetBtn}>
          <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '600' }}>Reset profile defaults</Text>
        </Pressable>
      </View>

      {/* Driver Input & Track Condition Controls (Instructor Coaching Panel) */}
      <View
        style={[
          styles.card,
          { backgroundColor: theme.bgCard, borderColor: theme.border },
        ]}
      >
        <Pressable accessibilityRole="button"
          onPress={() => setShowDriverSliders((v) => !v)}
          aria-expanded={showDriverSliders} accessibilityState={{ expanded: showDriverSliders }}
          style={[styles.topRow, styles.driverHeaderBtn]}
        >
          <View style={{ flexShrink: 1, maxWidth: '100%' }}>
            <Text style={[styles.sectionHeader, { color: theme.accentSecondary }]}>
              SCENARIO & DRIVER INPUTS
            </Text>
            <Text style={[styles.subCaption, { color: theme.textMuted }]}>
              Adjust requested speed, acceleration and track surface
            </Text>
          </View>
          <Text style={[styles.smallToggleBtnText, { color: theme.accentPrimary }]}>
            {showDriverSliders ? 'Collapse ▲' : 'Expand ▼'}
          </Text>
        </Pressable>

        {showDriverSliders ? (
          <View style={styles.driverControlsBody}>
            {driver.cornerPhase === 'entry' ? (
              <>
                <ParameterSlider
                  label="Trail-Brake Overlap Into Turn-In"
                  value={driver.trailBrakeOverlapPct}
                  baselineValue={baseDriver?.trailBrakeOverlapPct}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  leftHint="0% (Coast in / No nose load)"
                  rightHint="100% (Deep trail-brake)"
                  onChange={(trailBrakeOverlapPct) =>
                    updateDriver({ trailBrakeOverlapPct })
                  }
                  theme={theme}
                />
                <ParameterSlider
                  label="Entry Braking Deceleration"
                  value={driver.brakingG}
                  baselineValue={baseDriver?.brakingG}
                  min={0.1}
                  max={1.15}
                  step={0.05}
                  decimals={2}
                  unit="G"
                  leftHint="Light brush (0.1G)"
                  rightHint="Threshold brake (1.15G)"
                  onChange={(brakingG) => updateDriver({ brakingG })}
                  theme={theme}
                />
              </>
            ) : null}

            {driver.cornerPhase === 'exit' ? (
              <ParameterSlider
                label="Corner-Exit Throttle Acceleration"
                value={driver.throttleG}
                baselineValue={baseDriver?.throttleG}
                min={0.05}
                max={0.75}
                step={0.05}
                decimals={2}
                unit="G"
                leftHint="Maintenance throttle"
                rightHint="Full power exit (0.75G)"
                onChange={(throttleG) => updateDriver({ throttleG })}
                theme={theme}
              />
            ) : null}

            <ParameterSlider
              label="Cornering Lateral Demand (a_y)"
              value={driver.lateralG}
              baselineValue={baseDriver?.lateralG}
              min={0.5}
              max={1.4}
              step={0.05}
              decimals={2}
              unit="G"
              leftHint="Moderate (0.5G)"
              rightHint="Limit cornering (1.4G)"
              onChange={(lateralG) => updateDriver({ lateralG })}
              theme={theme}
            />

            <ParameterSlider
              label="Driver Input Smoothness (Hands & Pedals)"
              value={driver.driverSmoothnessPct}
              baselineValue={baseDriver?.driverSmoothnessPct}
              min={15}
              max={100}
              step={5}
              unit="%"
              leftHint="15% (Abrupt / Spikes dampers)"
              rightHint="100% (Progressive)"
              onChange={(driverSmoothnessPct) =>
                updateDriver({ driverSmoothnessPct })
              }
              theme={theme}
            />

            <ParameterSlider
              label="Cornering Speed (Aero Downforce ∝ v²)"
              value={Number(kmhToMph(driver.speedKmh).toFixed(1))}
              baselineValue={
                baseDriver ? Number(kmhToMph(baseDriver.speedKmh).toFixed(1)) : undefined
              }
              min={0}
              max={200}
              step={5}
              unit="mph"
              decimals={1}
              leftHint="0 mph (No aero load)"
              rightHint="200 mph (Fast Sweeper)"
              onChange={(speedMph) =>
                updateDriver({ speedKmh: mphToKmh(speedMph) })
              }
              theme={theme}
            />

            {/* Surface Bumps Selector */}
            <View style={styles.surfaceRow}>
              <Text style={[styles.geomLabel, { color: theme.textSecondary }]}>
                Track Surface:
              </Text>
              {(
                [
                  { id: 'smooth', label: 'Smooth Asphalt' },
                  { id: 'moderately_bumpy', label: 'Bumpy Track' },
                  { id: 'curbs_and_bumps', label: 'Heavy Curbs & Bumps' },
                ] as { id: SurfaceCondition; label: string }[]
              ).map((surf) => {
                const active = driver.surfaceCondition === surf.id;
                return (
                  <Pressable accessibilityRole="button"
                    key={surf.id}
                    onPress={() => updateDriver({ surfaceCondition: surf.id })}
                    accessibilityState={{ selected: active }}
                    style={[
                      styles.geomPill,
                      {
                        backgroundColor: active ? theme.accentSecondary : theme.bgSecondary,
                        borderColor: active ? theme.accentSecondary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.geomPillText,
                        { color: active ? (theme.mode === 'daylight' ? '#FFFFFF' : '#0A111A') : theme.textSecondary },
                      ]}
                    >
                      {surf.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    gap: 10,
    marginBottom: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
    gap: 6,
  },
  topActionsGroup: {
    flexDirection: 'row',
    gap: 6,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  subSectionHeader: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  subCaption: {
    fontSize: 12,
    marginTop: 2,
  },
  smallToggleBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 7,
    borderWidth: 1,
  },
  smallToggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  archetypePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  archPill: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
  },
  archPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  archExamplesText: {
    fontSize: 12,
    lineHeight: 16,
  },
  resetBtn: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  geometrySection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  carSpecsDrawer: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    borderTopWidth: 1,
  },
  specSummaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  specCell: {
    flexBasis: '46%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  specLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  specValue: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  subSectionDivider: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  presetPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  geomLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  geomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  geomPill: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 7,
    borderWidth: 1,
  },
  geomPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  baselineToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  baselineBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 7,
    borderWidth: 1,
  },
  baselineBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  driverControlsBody: {
    marginTop: 8,
  },
  driverHeaderBtn: {
    minHeight: 44,
    marginBottom: 0,
  },
  surfaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
});
