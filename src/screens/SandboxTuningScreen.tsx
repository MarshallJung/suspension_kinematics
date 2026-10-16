import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ParameterSlider } from '../components/common/ParameterSlider';
import {
  ALIGNMENT_PRESETS,
  AdjustmentScope,
  AlignmentPresetId,
  DRIVETRAIN_ARCHETYPES,
  RIDE_FREQUENCY_PRESETS,
  RideFrequencyPresetId,
  newtonsToLbs,
  nmmToLbsPerIn,
} from '../engine';
import { useTuningStore } from '../store/useTuningStore';
import { ThemePalette } from '../theme/colors';

interface SandboxTuningScreenProps {
  theme: ThemePalette;
}

type SandboxCategory =
  | 'arb_springs'
  | 'dampers'
  | 'alignment'
  | 'kinematics_anti'
  | 'tires_diff_aero';

const CATEGORIES: { id: SandboxCategory; label: string }[] = [
  { id: 'arb_springs', label: 'ARBs, Springs & Ride Freq' },
  { id: 'dampers', label: 'Dampers (4-Way)' },
  { id: 'alignment', label: 'Camber & Toe' },
  { id: 'kinematics_anti', label: 'Roll Centers & Anti-%' },
  { id: 'tires_diff_aero', label: 'Tires (Width/PSI), Diff & Aero' },
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

export const SandboxTuningScreen: React.FC<SandboxTuningScreenProps> = ({
  theme,
}) => {
  const {
    setup,
    currentSim,
    pinnedBaseline,
    scopeFilter,
    setScopeFilter,
    applyAlignmentPreset,
    applyTireSetupPreset,
    applyRideFrequencyPreset,
    setTargetRideFrequencyHz,
    updateSetup,
  } = useTuningStore();

  const [activeCategory, setActiveCategory] = useState<SandboxCategory>('arb_springs');
  const base = pinnedBaseline?.setup;
  const activeArchetype = DRIVETRAIN_ARCHETYPES[setup.drivetrain];

  const isVisibleByScope = (itemScope: AdjustmentScope) =>
    scopeFilter === 'all' || scopeFilter === itemScope;

  return (
    <View style={styles.container}>
      {/* Scope Filter + Category Tabs */}
      <View
        style={[
          styles.filterCard,
          { backgroundColor: theme.bgCard, borderColor: theme.border },
        ]}
      >
        <Text style={[styles.sectionHeader, { color: theme.accentPrimary }]}>
          WHAT-IF PARAMETER SANDBOX • FILTER BY ADJUSTABILITY
        </Text>

        <View style={styles.scopeRow}>
          {(
            [
              { id: 'all', label: 'All Parameters' },
              { id: 'trackside', label: '⚡ Trackside Only' },
              { id: 'shop', label: '🔧 Shop / Alignment Only' },
            ] as { id: 'all' | AdjustmentScope; label: string }[]
          ).map((sc) => {
            const active = scopeFilter === sc.id;
            return (
              <Pressable
                key={sc.id}
                onPress={() => setScopeFilter(sc.id)}
                style={[
                  styles.pillBtn,
                  {
                    backgroundColor: active ? theme.accentSecondary : theme.bgSecondary,
                    borderColor: active ? theme.accentSecondary : theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: active ? '#0B0F17' : theme.textSecondary },
                  ]}
                >
                  {sc.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.categoryRow}>
          {CATEGORIES.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setActiveCategory(cat.id)}
                style={[
                  styles.catBtn,
                  {
                    backgroundColor: active ? theme.accentPrimary : theme.bgElevated,
                    borderColor: active ? theme.accentPrimary : theme.borderSubtle,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.catBtnText,
                    { color: active ? '#0B0F17' : theme.textPrimary },
                  ]}
                >
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Sliders for Selected Category */}
      <View>
        {activeCategory === 'arb_springs' ? (
          <>
            {isVisibleByScope('trackside') ? (
              <>
                <ParameterSlider
                  label="Front Anti-Roll Bar Stiffness (K_φ,ARB,f)"
                  value={setup.frontArbStiffnessNmPerDeg}
                  baselineValue={base?.frontArbStiffnessNmPerDeg}
                  min={80}
                  max={950}
                  step={20}
                  unit="Nm/deg"
                  scope="trackside"
                  leftHint="Softer Front (More Grip / OS)"
                  rightHint="Stiffer Front (Higher FRSR / US)"
                  onChange={(frontArbStiffnessNmPerDeg) =>
                    updateSetup({ frontArbStiffnessNmPerDeg })
                  }
                  theme={theme}
                />
                <ParameterSlider
                  label="Rear Anti-Roll Bar Stiffness (K_φ,ARB,r)"
                  value={setup.rearArbStiffnessNmPerDeg}
                  baselineValue={base?.rearArbStiffnessNmPerDeg}
                  min={60}
                  max={950}
                  step={20}
                  unit="Nm/deg"
                  scope="trackside"
                  leftHint="Softer Rear (More Stability / US)"
                  rightHint="Stiffer Rear (More Rotation / OS)"
                  onChange={(rearArbStiffnessNmPerDeg) =>
                    updateSetup({ rearArbStiffnessNmPerDeg })
                  }
                  theme={theme}
                />
              </>
            ) : null}

            {isVisibleByScope('shop') ? (
              <>
                <View
                  style={[
                    styles.presetBannerCard,
                    { backgroundColor: theme.bgCard, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.presetBannerTitle, { color: theme.accentPrimary }]}>
                    TARGET RIDE FREQUENCY PRESETS (f_n = 1/2π · √(K_ride / m_s))
                  </Text>
                  <View style={styles.presetRow}>
                    {RIDE_FREQ_PRESET_LIST.map((rfId) => {
                      const rf = RIDE_FREQUENCY_PRESETS[rfId];
                      return (
                        <Pressable
                          key={rfId}
                          onPress={() => applyRideFrequencyPreset(rfId)}
                          style={[
                            styles.pillBtn,
                            {
                              backgroundColor: theme.bgElevated,
                              borderColor: theme.accentPrimary,
                            },
                          ]}
                        >
                          <Text style={[styles.pillText, { color: theme.textPrimary }]}>
                            {rf.shortLabel}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <ParameterSlider
                  label="Target Front Ride Frequency (f_n,f • Auto-Solves K_s,f)"
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
                  scope="shop"
                  leftHint="1.20 Hz (Plush Street)"
                  rightHint="3.10 Hz (Track / Cup Car)"
                  onChange={(targetHz) => setTargetRideFrequencyHz('front', targetHz)}
                  theme={theme}
                />
                <ParameterSlider
                  label="Target Rear Ride Frequency (f_n,r • Auto-Solves K_s,r)"
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
                  scope="shop"
                  leftHint="1.20 Hz (Plush Street)"
                  rightHint="3.20 Hz (Track / Cup Car)"
                  onChange={(targetHz) => setTargetRideFrequencyHz('rear', targetHz)}
                  theme={theme}
                />

                <ParameterSlider
                  label={`Front Main Spring Rate (${Math.round(
                    nmmToLbsPerIn(setup.frontSpringRateNmm)
                  )} lbs/in • K_s,f)`}
                  value={setup.frontSpringRateNmm}
                  baselineValue={base?.frontSpringRateNmm}
                  min={35}
                  max={220}
                  step={5}
                  unit="N/mm"
                  scope="shop"
                  leftHint="Softer Front (More Mechanical Grip)"
                  rightHint="Stiffer Front (Less Dive / More US)"
                  onChange={(frontSpringRateNmm) =>
                    updateSetup({ frontSpringRateNmm })
                  }
                  theme={theme}
                />
                <ParameterSlider
                  label={`Rear Main Spring Rate (${Math.round(
                    nmmToLbsPerIn(setup.rearSpringRateNmm)
                  )} lbs/in • K_s,r)`}
                  value={setup.rearSpringRateNmm}
                  baselineValue={base?.rearSpringRateNmm}
                  min={40}
                  max={240}
                  step={5}
                  unit="N/mm"
                  scope="shop"
                  leftHint="Softer Rear (More Exit Traction)"
                  rightHint="Stiffer Rear (Less Squat / More OS)"
                  onChange={(rearSpringRateNmm) =>
                    updateSetup({ rearSpringRateNmm })
                  }
                  theme={theme}
                />
                <ParameterSlider
                  label="Front Motion Ratio (MR_f = Δx_damper / Δx_wheel)"
                  value={setup.frontMotionRatio}
                  baselineValue={base?.frontMotionRatio}
                  min={0.55}
                  max={1.0}
                  step={0.02}
                  decimals={2}
                  unit="ratio"
                  scope="shop"
                  leftHint="0.55 (High rocker leverage)"
                  rightHint="1.00 (Direct 1:1 strut)"
                  onChange={(frontMotionRatio) =>
                    updateSetup({ frontMotionRatio })
                  }
                  theme={theme}
                />
                <ParameterSlider
                  label="Rear Motion Ratio (MR_r)"
                  value={setup.rearMotionRatio}
                  baselineValue={base?.rearMotionRatio}
                  min={0.55}
                  max={1.0}
                  step={0.02}
                  decimals={2}
                  unit="ratio"
                  scope="shop"
                  leftHint="0.55 (High leverage)"
                  rightHint="1.00 (Direct 1:1)"
                  onChange={(rearMotionRatio) =>
                    updateSetup({ rearMotionRatio })
                  }
                  theme={theme}
                />
              </>
            ) : null}
          </>
        ) : null}

        {activeCategory === 'dampers' ? (
          isVisibleByScope('trackside') ? (
            <>
              <ParameterSlider
                label="Front Low-Speed Bump (Entry Turn-In & Braking)"
                value={setup.frontLsBumpClicks}
                baselineValue={base?.frontLsBumpClicks}
                min={1}
                max={20}
                step={1}
                unit="clicks"
                scope="trackside"
                leftHint="1 (Softer = Better Turn-In Bite)"
                rightHint="20 (Stiffer = Faster Front Load / US)"
                onChange={(frontLsBumpClicks) =>
                  updateSetup({ frontLsBumpClicks })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Front Low-Speed Rebound (Exit Nose Extension)"
                value={setup.frontLsReboundClicks}
                baselineValue={base?.frontLsReboundClicks}
                min={1}
                max={20}
                step={1}
                unit="clicks"
                scope="trackside"
                leftHint="1 (Softer = Nose Rises Faster on Exit)"
                rightHint="20 (Stiffer = Holds Weight on Nose)"
                onChange={(frontLsReboundClicks) =>
                  updateSetup({ frontLsReboundClicks })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Rear Low-Speed Bump (Exit Throttle Squat)"
                value={setup.rearLsBumpClicks}
                baselineValue={base?.rearLsBumpClicks}
                min={1}
                max={20}
                step={1}
                unit="clicks"
                scope="trackside"
                leftHint="1 (Softer = Better Exit Traction)"
                rightHint="20 (Stiffer = Faster Rear Load / Exit OS)"
                onChange={(rearLsBumpClicks) => updateSetup({ rearLsBumpClicks })}
                theme={theme}
              />
              <ParameterSlider
                label="Rear Low-Speed Rebound (Entry Braking Pitch)"
                value={setup.rearLsReboundClicks}
                baselineValue={base?.rearLsReboundClicks}
                min={1}
                max={20}
                step={1}
                unit="clicks"
                scope="trackside"
                leftHint="1 (Softer = Stable Rear Under Braking)"
                rightHint="20 (Stiffer = Faster Entry Rotation / OS)"
                onChange={(rearLsReboundClicks) =>
                  updateSetup({ rearLsReboundClicks })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Front High-Speed Bump (Curb & Bump Compliance)"
                value={setup.frontHsBumpClicks}
                baselineValue={base?.frontHsBumpClicks}
                min={1}
                max={20}
                step={1}
                unit="clicks"
                scope="trackside"
                leftHint="1 (Plush Over Curbs)"
                rightHint="20 (Stiff / Risk of Skipping)"
                onChange={(frontHsBumpClicks) =>
                  updateSetup({ frontHsBumpClicks })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Rear High-Speed Bump (Curb & Bump Compliance)"
                value={setup.rearHsBumpClicks}
                baselineValue={base?.rearHsBumpClicks}
                min={1}
                max={20}
                step={1}
                unit="clicks"
                scope="trackside"
                leftHint="1 (Plush Over Curbs)"
                rightHint="20 (Stiff / Risk of Skipping)"
                onChange={(rearHsBumpClicks) => updateSetup({ rearHsBumpClicks })}
                theme={theme}
              />
            </>
          ) : (
            <Text style={[styles.emptyScopeMsg, { color: theme.textMuted }]}>
              Dampers are categorized as Trackside Quick Adjustments. Switch filter to "All" or "Trackside Only" to adjust dampers.
            </Text>
          )
        ) : null}

        {activeCategory === 'alignment' ? (
          isVisibleByScope('shop') ? (
            <>
              <View
                style={[
                  styles.presetBannerCard,
                  { backgroundColor: theme.bgCard, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.presetBannerTitle, { color: theme.accentPrimary }]}>
                  ONE-TAP ALIGNMENT PRESETS (ROAD SAFE VS. MAXED OEM VS. TRACK PLATES)
                </Text>
                <View style={styles.presetRow}>
                  {ALIGNMENT_PRESET_LIST.map((presetId) => {
                    const p = ALIGNMENT_PRESETS[presetId];
                    return (
                      <Pressable
                        key={presetId}
                        onPress={() => applyAlignmentPreset(presetId)}
                        style={[
                          styles.pillBtn,
                          {
                            backgroundColor: theme.bgElevated,
                            borderColor: theme.accentPrimary,
                          },
                        ]}
                      >
                        <Text style={[styles.pillText, { color: theme.textPrimary }]}>
                          {p.shortLabel} ({p.frontStaticCamberDeg}°F / {p.rearStaticCamberDeg}°R)
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <ParameterSlider
                label="Front Static Camber (γ_0,f)"
                value={setup.frontStaticCamberDeg}
                baselineValue={base?.frontStaticCamberDeg}
                min={-4.2}
                max={-0.5}
                step={0.1}
                decimals={1}
                unit="°"
                scope="shop"
                leftHint="-4.2° (Max Cornering Camber)"
                rightHint="-0.5° (Street / Less Front Grip)"
                onChange={(frontStaticCamberDeg) =>
                  updateSetup({ frontStaticCamberDeg })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Rear Static Camber (γ_0,r)"
                value={setup.rearStaticCamberDeg}
                baselineValue={base?.rearStaticCamberDeg}
                min={-3.8}
                max={-0.5}
                step={0.1}
                decimals={1}
                unit="°"
                scope="shop"
                leftHint="-3.8° (More Rear Lateral Grip)"
                rightHint="-0.5° (Less Rear Lateral Grip / OS)"
                onChange={(rearStaticCamberDeg) =>
                  updateSetup({ rearStaticCamberDeg })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Front Static Toe (δ_T,f • -Out / +In)"
                value={setup.frontStaticToeDeg}
                baselineValue={base?.frontStaticToeDeg}
                min={-0.35}
                max={0.35}
                step={0.04}
                decimals={2}
                unit="°"
                scope="shop"
                leftHint="-0.35° Toe-Out (Crisp Turn-In)"
                rightHint="+0.35° Toe-In (Straight Stability / US)"
                onChange={(frontStaticToeDeg) =>
                  updateSetup({ frontStaticToeDeg })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Rear Static Toe (δ_T,r • +Toe-In Stabilizes Rear)"
                value={setup.rearStaticToeDeg}
                baselineValue={base?.rearStaticToeDeg}
                min={-0.1}
                max={0.55}
                step={0.04}
                decimals={2}
                unit="°"
                scope="shop"
                leftHint="-0.10° (Free Rotation / Unstable)"
                rightHint="+0.55° Toe-In (Planted Rear / US)"
                onChange={(rearStaticToeDeg) => updateSetup({ rearStaticToeDeg })}
                theme={theme}
              />
              <ParameterSlider
                label="Front Caster Angle (ν • Dynamic Steer Camber Gain)"
                value={setup.frontCasterDeg}
                baselineValue={base?.frontCasterDeg}
                min={4.5}
                max={11.5}
                step={0.3}
                decimals={1}
                unit="°"
                scope="shop"
                leftHint="4.5° (Lighter Steer / Less Gain)"
                rightHint="11.5° (More Negative Camber on Steer)"
                onChange={(frontCasterDeg) => updateSetup({ frontCasterDeg })}
                theme={theme}
              />
              <ParameterSlider
                label="Ackermann Steering Geometry (%)"
                value={setup.ackermannPct}
                baselineValue={base?.ackermannPct}
                min={-20}
                max={100}
                step={10}
                unit="%"
                scope="shop"
                leftHint="-20% Anti-Ackermann"
                rightHint="100% Pure Geometric Ackermann"
                onChange={(ackermannPct) => updateSetup({ ackermannPct })}
                theme={theme}
              />
            </>
          ) : (
            <Text style={[styles.emptyScopeMsg, { color: theme.textMuted }]}>
              Alignment settings require a setup rack. Switch filter to "All" or "Shop / Alignment Only" to adjust camber, toe, and caster.
            </Text>
          )
        ) : null}

        {activeCategory === 'kinematics_anti' ? (
          isVisibleByScope('shop') ? (
            <>
              <View
                style={[
                  styles.presetBannerCard,
                  { backgroundColor: theme.bgCard, borderColor: theme.border },
                ]}
              >
                <Text style={[styles.presetBannerTitle, { color: theme.accentSecondary }]}>
                  LIVE ROLL CENTER & ROLL MOMENT ARM TELEMETRY
                </Text>
                <Text style={[styles.presetDescText, { color: theme.textSecondary }]}>
                  Dynamic RCs: {currentSim.kinematics.effectiveFrontRollCenterMm.toFixed(0)}mm F /{' '}
                  {currentSim.kinematics.effectiveRearRollCenterMm.toFixed(0)}mm R (Static:{' '}
                  {currentSim.kinematics.staticFrontRollCenterMm.toFixed(0)} /{' '}
                  {currentSim.kinematics.staticRearRollCenterMm.toFixed(0)}mm) • Roll Moment Arm h_roll ={' '}
                  {currentSim.kinematics.rollMomentArmMm.toFixed(0)}mm
                </Text>
              </View>

              <ParameterSlider
                label="Front Ride Height Change (Δz_ride,f • Watch RC Migration!)"
                value={setup.frontRideHeightDeltaMm}
                baselineValue={base?.frontRideHeightDeltaMm}
                min={-35}
                max={20}
                step={2}
                unit="mm"
                scope="shop"
                leftHint="-35mm (Over-Lowered Trap < -20mm!)"
                rightHint="+20mm (Raised)"
                onChange={(frontRideHeightDeltaMm) =>
                  updateSetup({ frontRideHeightDeltaMm })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Rear Ride Height Change (Δz_ride,r)"
                value={setup.rearRideHeightDeltaMm}
                baselineValue={base?.rearRideHeightDeltaMm}
                min={-35}
                max={20}
                step={2}
                unit="mm"
                scope="shop"
                leftHint="-35mm (Lowered)"
                rightHint="+20mm (More Forward Rake)"
                onChange={(rearRideHeightDeltaMm) =>
                  updateSetup({ rearRideHeightDeltaMm })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Nominal Front Roll Center Height (z_rc,f)"
                value={setup.nominalFrontRollCenterMm}
                baselineValue={base?.nominalFrontRollCenterMm}
                min={10}
                max={120}
                step={5}
                unit="mm"
                scope="shop"
                leftHint="10mm (Longer Moment Arm)"
                rightHint="120mm (Less Roll / More Jacking)"
                onChange={(nominalFrontRollCenterMm) =>
                  updateSetup({ nominalFrontRollCenterMm })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Nominal Rear Roll Center Height (z_rc,r)"
                value={setup.nominalRearRollCenterMm}
                baselineValue={base?.nominalRearRollCenterMm}
                min={20}
                max={150}
                step={5}
                unit="mm"
                scope="shop"
                leftHint="20mm (Lower Rear RC)"
                rightHint="150mm (Higher Rear RC / More Rotation)"
                onChange={(nominalRearRollCenterMm) =>
                  updateSetup({ nominalRearRollCenterMm })
                }
                theme={theme}
              />
              <ParameterSlider
                label="Center of Gravity Height (h_CG • Directly Sets h_roll)"
                value={setup.cgHeightMm}
                baselineValue={base?.cgHeightMm}
                min={390}
                max={580}
                step={5}
                unit="mm"
                scope="shop"
                leftHint="390mm (Low Flat-6 / GT Race)"
                rightHint="580mm (Tall Upright Sedan)"
                onChange={(cgHeightMm) => updateSetup({ cgHeightMm })}
                theme={theme}
              />
              <ParameterSlider
                label="Front Anti-Dive Geometry (%AD)"
                value={setup.frontAntiDivePct}
                baselineValue={base?.frontAntiDivePct}
                min={0}
                max={75}
                step={5}
                unit="%"
                scope="shop"
                leftHint="0% (Max Dive / Max Compliance)"
                rightHint="75% (Less Dive / Binds Over Bumps >45%)"
                onChange={(frontAntiDivePct) => updateSetup({ frontAntiDivePct })}
                theme={theme}
              />
              <ParameterSlider
                label="Rear Anti-Squat Geometry (%AS)"
                value={setup.rearAntiSquatPct}
                baselineValue={base?.rearAntiSquatPct}
                min={0}
                max={75}
                step={5}
                unit="%"
                scope="shop"
                leftHint="0% (Max Squat / Max Compliance)"
                rightHint="75% (Less Squat / Binds Over Bumps >45%)"
                onChange={(rearAntiSquatPct) => updateSetup({ rearAntiSquatPct })}
                theme={theme}
              />
            </>
          ) : (
            <Text style={[styles.emptyScopeMsg, { color: theme.textMuted }]}>
              Ride height and kinematic hardpoints are Shop adjustments. Switch filter to "All" or "Shop / Alignment Only" to view.
            </Text>
          )
        ) : null}

        {activeCategory === 'tires_diff_aero' ? (
          <>
            {isVisibleByScope('shop') ? (
              <>
                <View
                  style={[
                    styles.presetBannerCard,
                    { backgroundColor: theme.bgCard, borderColor: theme.border },
                  ]}
                >
                  <Text style={[styles.presetBannerTitle, { color: theme.accentSecondary }]}>
                    TIRE SECTION WIDTH PRESETS (STAGGERED VS. SQUARE SETUP)
                  </Text>
                  <View style={styles.presetRow}>
                    <Pressable
                      onPress={() => applyTireSetupPreset('oem_stagger')}
                      style={[
                        styles.pillBtn,
                        {
                          backgroundColor: theme.bgElevated,
                          borderColor: theme.accentSecondary,
                        },
                      ]}
                    >
                      <Text style={[styles.pillText, { color: theme.textPrimary }]}>
                        OEM Sizing ({activeArchetype.oemFrontTireWidthMm}F /{' '}
                        {activeArchetype.oemRearTireWidthMm}R mm)
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => applyTireSetupPreset('square_track')}
                      style={[
                        styles.pillBtn,
                        {
                          backgroundColor: theme.bgElevated,
                          borderColor: theme.accentSecondary,
                        },
                      ]}
                    >
                      <Text style={[styles.pillText, { color: theme.textPrimary }]}>
                        Square Track Setup ({activeArchetype.squareTireWidthMm}F /{' '}
                        {activeArchetype.squareTireWidthMm}R mm)
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <ParameterSlider
                  label="Front Tire Section Width (W_tire,f • Scales Fz,nom,f)"
                  value={setup.frontTireWidthMm}
                  baselineValue={base?.frontTireWidthMm}
                  min={195}
                  max={325}
                  step={10}
                  unit="mm"
                  scope="shop"
                  leftHint="195mm (Narrower / Earlier Saturation)"
                  rightHint="325mm (Wider / Square Track Front)"
                  onChange={(frontTireWidthMm) =>
                    updateSetup({ frontTireWidthMm })
                  }
                  theme={theme}
                />
                <ParameterSlider
                  label="Rear Tire Section Width (W_tire,r • Scales Fz,nom,r)"
                  value={setup.rearTireWidthMm}
                  baselineValue={base?.rearTireWidthMm}
                  min={195}
                  max={345}
                  step={10}
                  unit="mm"
                  scope="shop"
                  leftHint="195mm (Narrower Rear)"
                  rightHint="345mm (Wide Rear Stagger)"
                  onChange={(rearTireWidthMm) =>
                    updateSetup({ rearTireWidthMm })
                  }
                  theme={theme}
                />
              </>
            ) : null}

            {isVisibleByScope('trackside') ? (
              <>
                <ParameterSlider
                  label="Front Hot Tire Pressure (Optimal ~31.5–32 PSI)"
                  value={setup.frontTirePressurePsi}
                  baselineValue={base?.frontTirePressurePsi}
                  min={26.0}
                  max={40.0}
                  step={0.5}
                  decimals={1}
                  unit="PSI"
                  scope="trackside"
                  leftHint="26 PSI (Under-inflated)"
                  rightHint="40 PSI (Over-inflated / Crowns Tread)"
                  onChange={(frontTirePressurePsi) =>
                    updateSetup({ frontTirePressurePsi })
                  }
                  theme={theme}
                />
                <ParameterSlider
                  label="Rear Hot Tire Pressure (Optimal ~31.5–32 PSI)"
                  value={setup.rearTirePressurePsi}
                  baselineValue={base?.rearTirePressurePsi}
                  min={26.0}
                  max={40.0}
                  step={0.5}
                  decimals={1}
                  unit="PSI"
                  scope="trackside"
                  leftHint="26 PSI"
                  rightHint="40 PSI (Over-inflated / Less Rear Grip)"
                  onChange={(rearTirePressurePsi) =>
                    updateSetup({ rearTirePressurePsi })
                  }
                  theme={theme}
                />
                <ParameterSlider
                  label="Front Brake Bias Distribution (BFD %)"
                  value={setup.brakeBiasFrontPct}
                  baselineValue={base?.brakeBiasFrontPct}
                  min={52}
                  max={76}
                  step={1}
                  unit="%"
                  scope="trackside"
                  leftHint="52% (Rear-Biased / Trail-Brake OS)"
                  rightHint="76% (Front-Biased / Entry Stability)"
                  onChange={(brakeBiasFrontPct) =>
                    updateSetup({ brakeBiasFrontPct })
                  }
                  theme={theme}
                />
                <ParameterSlider
                  label={`Aero Downforce Balance (Total: ${Math.round(
                    newtonsToLbs(currentSim.kinematics.totalAeroDownforceN)
                  )} lbs)`}
                  value={setup.aeroFrontBalancePct}
                  baselineValue={base?.aeroFrontBalancePct}
                  min={25}
                  max={60}
                  step={2}
                  unit="% Front"
                  scope="trackside"
                  leftHint="25% Front (More Rear Wing / High-Speed US)"
                  rightHint="60% Front (More Front Splitter / High-Speed OS)"
                  onChange={(aeroFrontBalancePct) =>
                    updateSetup({ aeroFrontBalancePct })
                  }
                  theme={theme}
                />
              </>
            ) : null}

            {isVisibleByScope('shop') ? (
              <>
                <ParameterSlider
                  label="LSD Acceleration Lock (%)"
                  value={setup.lsdAccelLockPct}
                  baselineValue={base?.lsdAccelLockPct}
                  min={0}
                  max={90}
                  step={5}
                  unit="%"
                  scope="shop"
                  leftHint="0% (Open Diff)"
                  rightHint="90% (Locked / Power Rotation on RWD)"
                  onChange={(lsdAccelLockPct) => updateSetup({ lsdAccelLockPct })}
                  theme={theme}
                />
                <ParameterSlider
                  label="LSD Deceleration Lock (% • Braking Stability)"
                  value={setup.lsdDecelLockPct}
                  baselineValue={base?.lsdDecelLockPct}
                  min={0}
                  max={90}
                  step={5}
                  unit="%"
                  scope="shop"
                  leftHint="0% (Free Turn-In Rotation)"
                  rightHint="90% (High Entry Yaw Damping / US)"
                  onChange={(lsdDecelLockPct) => updateSetup({ lsdDecelLockPct })}
                  theme={theme}
                />
              </>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  filterCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionHeader: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  scopeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  pillBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  catBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  catBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  presetBannerCard: {
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  presetBannerTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  presetDescText: {
    fontSize: 11,
    lineHeight: 16,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  emptyScopeMsg: {
    padding: 16,
    textAlign: 'center',
    fontSize: 12,
    fontStyle: 'italic',
  },
});
