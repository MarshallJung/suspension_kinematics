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
  nmmToLbsPerIn,
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
    setTargetRideFrequencyHz,
    updateSetup,
    updateDriver,
    pinCurrentAsBaseline,
    revertToBaseline,
    resetToArchetypeDefault,
  } = useTuningStore();

  const [showCarSpecsDrawer, setShowCarSpecsDrawer] = useState(true);
  const [showDriverSliders, setShowDriverSliders] = useState(true);
  const [showGeometryPicker, setShowGeometryPicker] = useState(false);

  const activeArchetype = DRIVETRAIN_ARCHETYPES[setup.drivetrain];
  const baseSetup = pinnedBaseline?.setup;
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
            VEHICLE ARCHETYPE & SUSPENSION LINKAGE
          </Text>
          <View style={styles.topActionsGroup}>
            <Pressable
              onPress={() => setShowCarSpecsDrawer((v) => !v)}
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
                  { color: showCarSpecsDrawer ? '#0B0F17' : theme.accentPrimary },
                ]}
              >
                {showCarSpecsDrawer ? 'My Car Specs ▲' : 'My Car Specs ▼'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setShowGeometryPicker((v) => !v)}
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
              <Pressable
                key={archId}
                onPress={() => selectArchetype(archId)}
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
                    { color: isSelected ? '#0B0F17' : theme.textPrimary },
                  ]}
                >
                  {preset.shortLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.archExamplesText, { color: theme.textMuted }]}>
          {activeArchetype.examples} — {activeArchetype.handlingCharacter}
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
                  <Pressable
                    key={`front-${gId}`}
                    onPress={() => setFrontGeometry(gId)}
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
                        { color: active ? '#0B0F17' : theme.textSecondary },
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
                  <Pressable
                    key={`rear-${gId}`}
                    onPress={() => setRearGeometry(gId)}
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
                        { color: active ? '#0B0F17' : theme.textSecondary },
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

        {/* My Car's Existing Setup Drawer: Alignment, Tire Width (Stagger vs Square), Ride Freq & Roll Centers */}
        {showCarSpecsDrawer ? (
          <View
            style={[
              styles.carSpecsDrawer,
              { borderTopColor: theme.borderSubtle, backgroundColor: theme.bgSecondary },
            ]}
          >
            <Text style={[styles.subSectionHeader, { color: theme.accentPrimary }]}>
              1. EXISTING ALIGNMENT (CAMBER & TOE PRESETS OR CUSTOM)
            </Text>
            <Text style={[styles.subCaption, { color: theme.textMuted, marginBottom: 6 }]}>
              Not sure of your exact numbers? Pick OEM Road Default (safe understeer) or Maxed OEM Track window:
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
                    key={presetId}
                    onPress={() => applyAlignmentPreset(presetId)}
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
                        { color: isSelected ? '#0B0F17' : theme.textPrimary },
                      ]}
                    >
                      {p.shortLabel} ({p.frontStaticCamberDeg}°F / {p.rearStaticCamberDeg}°R)
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.compactSlidersGrid}>
              <ParameterSlider
                label="Front Static Camber (γ_0,f)"
                value={setup.frontStaticCamberDeg}
                baselineValue={baseSetup?.frontStaticCamberDeg}
                min={-4.2}
                max={-0.5}
                step={0.1}
                decimals={1}
                unit="°"
                leftHint="-4.2° (Track Plates)"
                rightHint="-0.5° (OEM Street)"
                onChange={(frontStaticCamberDeg) =>
                  updateSetup({ frontStaticCamberDeg })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Rear Static Camber (γ_0,r)"
                value={setup.rearStaticCamberDeg}
                baselineValue={baseSetup?.rearStaticCamberDeg}
                min={-3.8}
                max={-0.5}
                step={0.1}
                decimals={1}
                unit="°"
                leftHint="-3.8° (Max Rear Grip)"
                rightHint="-0.5° (OEM Street)"
                onChange={(rearStaticCamberDeg) =>
                  updateSetup({ rearStaticCamberDeg })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Front Static Toe (-Out / +In)"
                value={setup.frontStaticToeDeg}
                baselineValue={baseSetup?.frontStaticToeDeg}
                min={-0.35}
                max={0.35}
                step={0.04}
                decimals={2}
                unit="°"
                leftHint="-0.35° Toe-Out (Turn-In)"
                rightHint="+0.35° Toe-In (Safe US)"
                onChange={(frontStaticToeDeg) =>
                  updateSetup({ frontStaticToeDeg })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Rear Static Toe (+Toe-In Stabilizes)"
                value={setup.rearStaticToeDeg}
                baselineValue={baseSetup?.rearStaticToeDeg}
                min={-0.1}
                max={0.55}
                step={0.04}
                decimals={2}
                unit="°"
                leftHint="-0.10° (Loose)"
                rightHint="+0.55° Toe-In (Planted)"
                onChange={(rearStaticToeDeg) =>
                  updateSetup({ rearStaticToeDeg })
                }
                theme={theme}
              />
            </View>

            {/* Tire Widths: Staggered vs Square Setup */}
            <View style={[styles.subSectionDivider, { borderTopColor: theme.borderSubtle }]}>
              <Text style={[styles.subSectionHeader, { color: theme.accentSecondary }]}>
                2. TIRE WIDTH & SQUARE VS. STAGGERED SETUP (SAME COMPOUND)
              </Text>
              <Text style={[styles.subCaption, { color: theme.textMuted, marginBottom: 6 }]}>
                Wider tires expand contact patch area and raise nominal load capacity (Fz,nom), reducing load-sensitivity saturation:
              </Text>

              <View style={styles.presetPillRow}>
                <Pressable
                  onPress={() => applyTireSetupPreset('oem_stagger')}
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
                      { color: isOemStagger ? '#0B0F17' : theme.textPrimary },
                    ]}
                  >
                    OEM Tire Sizing ({activeArchetype.oemFrontTireWidthMm}F /{' '}
                    {activeArchetype.oemRearTireWidthMm}R mm)
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => applyTireSetupPreset('square_track')}
                  style={[
                    styles.geomPill,
                    {
                      backgroundColor:
                        isSquareSetup && !isOemStagger
                          ? theme.accentSecondary
                          : theme.bgCard,
                      borderColor:
                        isSquareSetup && !isOemStagger
                          ? theme.accentSecondary
                          : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.geomPillText,
                      {
                        color:
                          isSquareSetup && !isOemStagger
                            ? '#0B0F17'
                            : theme.textPrimary,
                      },
                    ]}
                  >
                    Square Track Setup ({activeArchetype.squareTireWidthMm}F /{' '}
                    {activeArchetype.squareTireWidthMm}R mm)
                  </Text>
                </Pressable>
              </View>

              <ParameterSlider
                label="Front Tire Section Width (mm)"
                value={setup.frontTireWidthMm}
                baselineValue={baseSetup?.frontTireWidthMm}
                min={195}
                max={325}
                step={10}
                unit="mm"
                leftHint="195mm (Narrower / Lower Fz,nom)"
                rightHint="325mm (Wider / Higher Front Grip)"
                onChange={(frontTireWidthMm) =>
                  updateSetup({ frontTireWidthMm })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Rear Tire Section Width (mm)"
                value={setup.rearTireWidthMm}
                baselineValue={baseSetup?.rearTireWidthMm}
                min={195}
                max={345}
                step={10}
                unit="mm"
                leftHint="195mm (Narrower)"
                rightHint="345mm (Steamroller Rear Grip)"
                onChange={(rearTireWidthMm) =>
                  updateSetup({ rearTireWidthMm })
                }
                theme={theme}
              />
            </View>

            {/* Ride Frequencies, Roll Centers & h_roll */}
            <View style={[styles.subSectionDivider, { borderTopColor: theme.borderSubtle }]}>
              <Text style={[styles.subSectionHeader, { color: theme.accentPrimary }]}>
                3. RIDE FREQUENCIES (f_n), ROLL CENTERS & ROLL MOMENT ARM (h_roll)
              </Text>
              <Text style={[styles.subCaption, { color: theme.textMuted, marginBottom: 6 }]}>
                Adjust target Ride Frequency (auto-solves spring rate K_s) or Roll Center heights (live h_roll ={' '}
                {currentSim.kinematics.rollMomentArmMm.toFixed(0)}mm):
              </Text>

              <View style={styles.presetPillRow}>
                {RIDE_FREQ_PRESET_LIST.map((rfId) => {
                  const rf = RIDE_FREQUENCY_PRESETS[rfId];
                  const isActive =
                    Math.abs(currentSim.kinematics.frontNaturalFreqHz - rf.targetFrontHz) < 0.12 &&
                    Math.abs(currentSim.kinematics.rearNaturalFreqHz - rf.targetRearHz) < 0.12;
                  return (
                    <Pressable
                      key={rfId}
                      onPress={() => applyRideFrequencyPreset(rfId)}
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
                          { color: isActive ? '#0B0F17' : theme.textPrimary },
                        ]}
                      >
                        {rf.shortLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <ParameterSlider
                label={`Target Front Ride Frequency (f_n,f • Spring ${Math.round(
                  nmmToLbsPerIn(setup.frontSpringRateNmm)
                )} lbs/in)`}
                value={Number(currentSim.kinematics.frontNaturalFreqHz.toFixed(2))}
                baselineValue={
                  pinnedBaseline
                    ? Number(pinnedBaseline.sim.kinematics.frontNaturalFreqHz.toFixed(2))
                    : undefined
                }
                min={1.2}
                max={3.1}
                step={0.05}
                decimals={2}
                unit="Hz"
                leftHint="1.20 Hz (Soft Street)"
                rightHint="3.10 Hz (Stiff Race)"
                onChange={(targetHz) => setTargetRideFrequencyHz('front', targetHz)}
                theme={theme}
              />
              <ParameterSlider
                label={`Target Rear Ride Frequency (f_n,r • Spring ${Math.round(
                  nmmToLbsPerIn(setup.rearSpringRateNmm)
                )} lbs/in)`}
                value={Number(currentSim.kinematics.rearNaturalFreqHz.toFixed(2))}
                baselineValue={
                  pinnedBaseline
                    ? Number(pinnedBaseline.sim.kinematics.rearNaturalFreqHz.toFixed(2))
                    : undefined
                }
                min={1.2}
                max={3.2}
                step={0.05}
                decimals={2}
                unit="Hz"
                leftHint="1.20 Hz (Soft Street)"
                rightHint="3.20 Hz (Stiff Race)"
                onChange={(targetHz) => setTargetRideFrequencyHz('rear', targetHz)}
                theme={theme}
              />

              <ParameterSlider
                label={`Nominal Front Roll Center (Dyn: ${currentSim.kinematics.effectiveFrontRollCenterMm.toFixed(0)}mm)`}
                value={setup.nominalFrontRollCenterMm}
                baselineValue={baseSetup?.nominalFrontRollCenterMm}
                min={10}
                max={120}
                step={5}
                unit="mm"
                leftHint="10mm (Larger h_roll)"
                rightHint="120mm (Raised RC Kit)"
                onChange={(nominalFrontRollCenterMm) =>
                  updateSetup({ nominalFrontRollCenterMm })
                }
                theme={theme}
              />
              <ParameterSlider
                label={`Nominal Rear Roll Center (Dyn: ${currentSim.kinematics.effectiveRearRollCenterMm.toFixed(0)}mm)`}
                value={setup.nominalRearRollCenterMm}
                baselineValue={baseSetup?.nominalRearRollCenterMm}
                min={20}
                max={150}
                step={5}
                unit="mm"
                leftHint="20mm (Lower Rear RC)"
                rightHint="150mm (Raised Rear RC)"
                onChange={(nominalRearRollCenterMm) =>
                  updateSetup({ nominalRearRollCenterMm })
                }
                theme={theme}
              />
            </View>
          </View>
        ) : null}

        {/* Baseline Pin & Revert Toolbar */}
        <View style={[styles.baselineToolbar, { borderTopColor: theme.borderSubtle }]}>
          <Pressable
            onPress={pinCurrentAsBaseline}
            style={[
              styles.baselineBtn,
              { backgroundColor: theme.bgElevated, borderColor: theme.accentSecondary },
            ]}
          >
            <Text style={[styles.baselineBtnText, { color: theme.accentSecondary }]}>
              📌 Pin Current as Baseline
            </Text>
          </Pressable>

          {pinnedBaseline ? (
            <Pressable
              onPress={revertToBaseline}
              style={[
                styles.baselineBtn,
                { backgroundColor: theme.bgElevated, borderColor: theme.border },
              ]}
            >
              <Text style={[styles.baselineBtnText, { color: theme.textPrimary }]}>
                ↩ Revert to Baseline
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={resetToArchetypeDefault}
            style={[
              styles.baselineBtn,
              { backgroundColor: theme.bgElevated, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.baselineBtnText, { color: theme.textSecondary }]}>
              ↺ Factory Reset
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Driver Input & Track Condition Controls (Instructor Coaching Panel) */}
      <View
        style={[
          styles.card,
          { backgroundColor: theme.bgCard, borderColor: theme.border },
        ]}
      >
        <Pressable
          onPress={() => setShowDriverSliders((v) => !v)}
          style={styles.topRow}
        >
          <View>
            <Text style={[styles.sectionHeader, { color: theme.accentSecondary }]}>
              DRIVER INPUTS & TRACK CONDITION (INSTRUCTOR COACHING)
            </Text>
            <Text style={[styles.subCaption, { color: theme.textMuted }]}>
              Demonstrate how trail-braking, throttle, and input smoothness shift tire loads
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
              value={Math.round(kmhToMph(driver.speedKmh) / 5) * 5}
              baselineValue={
                baseDriver ? Math.round(kmhToMph(baseDriver.speedKmh) / 5) * 5 : undefined
              }
              min={35}
              max={145}
              step={5}
              unit="mph"
              leftHint="35 mph (Hairpin)"
              rightHint="145 mph (Fast Sweeper)"
              onChange={(speedMph) =>
                updateDriver({ speedKmh: Math.round(mphToKmh(speedMph)) })
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
                  <Pressable
                    key={surf.id}
                    onPress={() => updateDriver({ surfaceCondition: surf.id })}
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
                        { color: active ? '#0B0F17' : theme.textSecondary },
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
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subSectionHeader: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  subCaption: {
    fontSize: 10.5,
    marginTop: 2,
  },
  smallToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  smallToggleBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  archetypePillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  archPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  archPillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  archExamplesText: {
    fontSize: 11,
    lineHeight: 15,
  },
  geometrySection: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  carSpecsDrawer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    borderTopWidth: 1,
  },
  subSectionDivider: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  presetPillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  compactSlidersGrid: {
    gap: 2,
  },
  geomLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  geomRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  geomPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  geomPillText: {
    fontSize: 11,
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
    fontSize: 11,
    fontWeight: '700',
  },
  driverControlsBody: {
    marginTop: 8,
  },
  surfaceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
});
