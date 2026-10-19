import {
  AlignmentPresetId,
  DriverInputState,
  DrivetrainArchetype,
  RideFrequencyPresetId,
  SuspensionGeometryType,
  VehicleSetup,
} from './types';

export interface ArchetypePreset {
  id: DrivetrainArchetype;
  name: string;
  shortLabel: string;
  subtitle: string;
  examples: string;
  handlingCharacter: string;
  oemFrontTireWidthMm: number;
  oemRearTireWidthMm: number;
  squareTireWidthMm: number;
  defaultSetup: VehicleSetup;
}

export interface AlignmentPreset {
  id: AlignmentPresetId;
  name: string;
  shortLabel: string;
  description: string;
  frontStaticCamberDeg: number;
  rearStaticCamberDeg: number;
  frontStaticToeDeg: number;
  rearStaticToeDeg: number;
}

export interface RideFrequencyPreset {
  id: RideFrequencyPresetId;
  name: string;
  shortLabel: string;
  description: string;
  targetFrontHz: number;
  targetRearHz: number;
}

export const ALIGNMENT_PRESETS: Record<AlignmentPresetId, AlignmentPreset> = {
  oem_road: {
    id: 'oem_road',
    name: 'Illustrative Road Alignment',
    shortLabel: 'Road alignment',
    description:
      'Illustrative mild negative camber (-0.9° F / -1.4° R) and front/rear toe-in (+0.12° F / +0.26° R) as an assumed road-like profile; no manufacturer specification is implied.',
    frontStaticCamberDeg: -0.9,
    rearStaticCamberDeg: -1.4,
    frontStaticToeDeg: 0.12,
    rearStaticToeDeg: 0.26,
  },
  oem_track_max: {
    id: 'oem_track_max',
    name: 'Illustrative Track Alignment',
    shortLabel: 'Track alignment',
    description:
      'Illustrative moderate negative camber profile (-1.9° F / -2.0° R) with zero front toe (0.00°) and stabilizing rear toe-in (+0.24°).',
    frontStaticCamberDeg: -1.9,
    rearStaticCamberDeg: -2.0,
    frontStaticToeDeg: 0.0,
    rearStaticToeDeg: 0.24,
  },
  dedicated_track: {
    id: 'dedicated_track',
    name: 'Illustrative High-Camber Alignment',
    shortLabel: 'High camber',
    description:
      'Aftermarket camber plates or LCA shims (-3.0° F / -2.5° R) with slight front toe-out (-0.08°) for crisp turn-in and +0.28° rear toe-in under heavy braking.',
    frontStaticCamberDeg: -3.0,
    rearStaticCamberDeg: -2.5,
    frontStaticToeDeg: -0.08,
    rearStaticToeDeg: 0.28,
  },
};

export const RIDE_FREQUENCY_PRESETS: Record<
  RideFrequencyPresetId,
  RideFrequencyPreset
> = {
  oem_street: {
    id: 'oem_street',
    name: 'Street-like Frequency Target',
    shortLabel: 'Street (1.5 Hz)',
    description:
      'Illustrative street-like targets (1.45 Hz F / 1.60 Hz R). High mechanical compliance over bumps, larger body roll & pitch excursions.',
    targetFrontHz: 1.45,
    targetRearHz: 1.60,
  },
  clubsport_track: {
    id: 'clubsport_track',
    name: 'Clubsport / Track Day Coilover (~2.1 Hz)',
    shortLabel: 'Track Coilover (2.1 Hz)',
    description:
      'Dual-duty track/HPDE coilover rates (2.05 Hz F / 2.20 Hz R). Balances platform roll control with curb compliance.',
    targetFrontHz: 2.05,
    targetRearHz: 2.20,
  },
  full_race: {
    id: 'full_race',
    name: 'Dedicated Cup / Spec Race (~2.7 Hz)',
    shortLabel: 'Full Race (2.7 Hz)',
    description:
      'Stiff non-aero/GT race spring rates (2.65 Hz F / 2.80 Hz R). Minimal roll & pitch, rapid weight transfer response.',
    targetFrontHz: 2.65,
    targetRearHz: 2.80,
  },
};

export interface GeometryKinematicProfile {
  id: SuspensionGeometryType;
  name: string;
  shortName: string;
  description: string;
  baseBumpCamberGainDegPerMm: number;
  rollCamberLossFactor: number;
  rcMigrationRatePerMmDrop: number;
  overLoweringThresholdMm: number;
}

export const SUSPENSION_GEOMETRY_PROFILES: Record<
  SuspensionGeometryType,
  GeometryKinematicProfile
> = {
  macpherson: {
    id: 'macpherson',
    name: 'MacPherson Strut',
    shortName: 'Strut',
    description:
      'Compact upright guided by a telescopic strut and lower control arm. Loses negative camber with body roll unless supported by static camber, caster, and roll stiffness; sensitive to over-lowering.',
    baseBumpCamberGainDegPerMm: -0.014,
    rollCamberLossFactor: 0.88,
    rcMigrationRatePerMmDrop: 2.1,
    overLoweringThresholdMm: -20,
  },
  double_wishbone: {
    id: 'double_wishbone',
    name: 'Double Wishbone (Unequal A-Arm)',
    shortName: 'Double Wishbone',
    description:
      'Shorter, inward-inclined upper control arm and longer lower control arm. Generates strong negative camber recovery in bump (dγ/dz < 0) and controlled roll center migration.',
    baseBumpCamberGainDegPerMm: -0.038,
    rollCamberLossFactor: 0.52,
    rcMigrationRatePerMmDrop: 1.15,
    overLoweringThresholdMm: -32,
  },
  multilink: {
    id: 'multilink',
    name: '5-Link / Multi-Link Independent',
    shortName: 'Multi-Link',
    description:
      'Five spatial links create a virtual instant center with strong camber recovery in bump and passive toe-in stability under braking and cornering loads.',
    baseBumpCamberGainDegPerMm: -0.031,
    rollCamberLossFactor: 0.62,
    rcMigrationRatePerMmDrop: 1.35,
    overLoweringThresholdMm: -28,
  },
};

export const DRIVETRAIN_ARCHETYPES: Record<DrivetrainArchetype, ArchetypePreset> = {
  RR: {
    id: 'RR',
    name: 'Rear-Engine / Rear-Wheel Drive (RR)',
    shortLabel: 'RR (39/61)',
    subtitle: 'Rear mass bias, staggered rear tires, high braking & exit traction stability',
    examples: 'Porsche 911 (996 / 997 / 991 / 992 Carrera, GT3)',
    handlingCharacter:
      'Strong rear braking stability and corner-exit traction from 61% rear weight bias. Requires deliberate trail-braking to load the front axle at turn-in.',
    oemFrontTireWidthMm: 245,
    oemRearTireWidthMm: 305,
    squareTireWidthMm: 265,
    defaultSetup: {
      drivetrain: 'RR',
      frontGeometry: 'macpherson',
      rearGeometry: 'multilink',
      massKg: 1430,
      frontWeightFraction: 0.39,
      cgHeightMm: 455,
      wheelbaseMm: 2457,
      frontTrackMm: 1552,
      rearTrackMm: 1558,
      frontSpringRateNmm: 75,
      rearSpringRateNmm: 120,
      frontMotionRatio: 0.92,
      rearMotionRatio: 0.84,
      frontSpringInclinationDeg: 85,
      rearSpringInclinationDeg: 82,
      frontArbStiffnessNmPerDeg: 420,
      rearArbStiffnessNmPerDeg: 540,
      frontRideHeightDeltaMm: 0,
      rearRideHeightDeltaMm: 0,
      nominalFrontRollCenterMm: 52,
      nominalRearRollCenterMm: 88,
      frontStaticCamberDeg: -1.9,
      rearStaticCamberDeg: -2.0,
      frontStaticToeDeg: 0.0,
      rearStaticToeDeg: 0.24,
      frontCasterDeg: 8.6,
      frontKpiDeg: 12.2,
      ackermannPct: 65,
      frontAntiDivePct: 28,
      rearAntiSquatPct: 34,
      frontLsBumpClicks: 10,
      frontLsReboundClicks: 11,
      rearLsBumpClicks: 10,
      rearLsReboundClicks: 12,
      frontHsBumpClicks: 10,
      rearHsBumpClicks: 10,
      frontTireWidthMm: 245,
      rearTireWidthMm: 305,
      frontTirePressurePsi: 31.0,
      rearTirePressurePsi: 33.0,
      optimalTirePressurePsi: 32.0,
      peakFrictionCoefficient: 1.28,
      tireLoadSensitivityExponent: 0.14,
      brakeBiasFrontPct: 60,
      frontTorqueSplitPct: 0,
      lsdAccelLockPct: 40,
      lsdDecelLockPct: 50,
      aeroClA: 0.55,
      aeroFrontBalancePct: 39,
    },
  },
  MR: {
    id: 'MR',
    name: 'Mid-Engine / Rear-Wheel Drive (MR)',
    shortLabel: 'MR (45/55)',
    subtitle: 'Low polar moment of inertia, crisp rotation, balanced front-to-rear weight distribution',
    examples: 'Porsche 718 Cayman / Boxster GT4, Spec Boxster, Lotus Emira',
    handlingCharacter:
      'Low yaw inertia (I_zz) yields immediate turn-in response and neutral mid-corner balance, with mild factory tire stagger (245F / 295R).',
    oemFrontTireWidthMm: 245,
    oemRearTireWidthMm: 295,
    squareTireWidthMm: 265,
    defaultSetup: {
      drivetrain: 'MR',
      frontGeometry: 'macpherson',
      rearGeometry: 'macpherson',
      massKg: 1380,
      frontWeightFraction: 0.45,
      cgHeightMm: 445,
      wheelbaseMm: 2484,
      frontTrackMm: 1538,
      rearTrackMm: 1534,
      frontSpringRateNmm: 80,
      rearSpringRateNmm: 100,
      frontMotionRatio: 0.93,
      rearMotionRatio: 0.90,
      frontSpringInclinationDeg: 86,
      rearSpringInclinationDeg: 84,
      frontArbStiffnessNmPerDeg: 470,
      rearArbStiffnessNmPerDeg: 440,
      frontRideHeightDeltaMm: 0,
      rearRideHeightDeltaMm: 0,
      nominalFrontRollCenterMm: 55,
      nominalRearRollCenterMm: 72,
      frontStaticCamberDeg: -1.9,
      rearStaticCamberDeg: -2.0,
      frontStaticToeDeg: 0.0,
      rearStaticToeDeg: 0.24,
      frontCasterDeg: 8.2,
      frontKpiDeg: 12.5,
      ackermannPct: 70,
      frontAntiDivePct: 26,
      rearAntiSquatPct: 30,
      frontLsBumpClicks: 10,
      frontLsReboundClicks: 10,
      rearLsBumpClicks: 10,
      rearLsReboundClicks: 11,
      frontHsBumpClicks: 10,
      rearHsBumpClicks: 10,
      frontTireWidthMm: 245,
      rearTireWidthMm: 295,
      frontTirePressurePsi: 31.5,
      rearTirePressurePsi: 32.0,
      optimalTirePressurePsi: 31.5,
      peakFrictionCoefficient: 1.28,
      tireLoadSensitivityExponent: 0.14,
      brakeBiasFrontPct: 63,
      frontTorqueSplitPct: 0,
      lsdAccelLockPct: 35,
      lsdDecelLockPct: 40,
      aeroClA: 0.50,
      aeroFrontBalancePct: 44,
    },
  },
  FR: {
    id: 'FR',
    name: 'Front-Engine / Rear-Wheel Drive (FR)',
    shortLabel: 'FR (51/49)',
    subtitle: 'Near 50/50 weight split; responds dramatically to Square Tire Setup upgrades',
    examples: 'Porsche 944 / 968, BMW M2 / M3 / M4, Mazda MX-5, Corvette',
    handlingCharacter:
      'Near 50/50 static balance, often shipped from the factory with narrower front tires (e.g. 225F / 255R) for safe understeer. Widening the front tires to a Square Setup (255/255) unlocks huge front turn-in and apex grip.',
    oemFrontTireWidthMm: 225,
    oemRearTireWidthMm: 255,
    squareTireWidthMm: 255,
    defaultSetup: {
      drivetrain: 'FR',
      frontGeometry: 'macpherson',
      rearGeometry: 'multilink',
      massKg: 1360,
      frontWeightFraction: 0.51,
      cgHeightMm: 475,
      wheelbaseMm: 2470,
      frontTrackMm: 1520,
      rearTrackMm: 1530,
      frontSpringRateNmm: 85,
      rearSpringRateNmm: 80,
      frontMotionRatio: 0.90,
      rearMotionRatio: 0.82,
      frontSpringInclinationDeg: 84,
      rearSpringInclinationDeg: 82,
      frontArbStiffnessNmPerDeg: 520,
      rearArbStiffnessNmPerDeg: 380,
      frontRideHeightDeltaMm: 0,
      rearRideHeightDeltaMm: 0,
      nominalFrontRollCenterMm: 58,
      nominalRearRollCenterMm: 76,
      frontStaticCamberDeg: -1.9,
      rearStaticCamberDeg: -2.0,
      frontStaticToeDeg: 0.0,
      rearStaticToeDeg: 0.24,
      frontCasterDeg: 7.5,
      frontKpiDeg: 11.5,
      ackermannPct: 75,
      frontAntiDivePct: 30,
      rearAntiSquatPct: 28,
      frontLsBumpClicks: 10,
      frontLsReboundClicks: 10,
      rearLsBumpClicks: 10,
      rearLsReboundClicks: 10,
      frontHsBumpClicks: 10,
      rearHsBumpClicks: 10,
      frontTireWidthMm: 225,
      rearTireWidthMm: 255,
      frontTirePressurePsi: 32.0,
      rearTirePressurePsi: 31.5,
      optimalTirePressurePsi: 32.0,
      peakFrictionCoefficient: 1.25,
      tireLoadSensitivityExponent: 0.14,
      brakeBiasFrontPct: 66,
      frontTorqueSplitPct: 0,
      lsdAccelLockPct: 45,
      lsdDecelLockPct: 35,
      aeroClA: 0.42,
      aeroFrontBalancePct: 48,
    },
  },
  FF: {
    id: 'FF',
    name: 'Front-Engine / Front-Wheel Drive (FF)',
    shortLabel: 'FF (62/38)',
    subtitle: 'Heavy front axle combined slip (steer + braking + traction), tuned via rear roll stiffness',
    examples: 'Civic Type R, GTI / TCR Touring Cars, MINI Cooper S',
    handlingCharacter:
      'Front tires carry steering, braking, and acceleration simultaneously. Runs square or reverse-staggered tires with stiff rear roll rates (low FRSR) to help rotate at turn-in.',
    oemFrontTireWidthMm: 265,
    oemRearTireWidthMm: 265,
    squareTireWidthMm: 265,
    defaultSetup: {
      drivetrain: 'FF',
      frontGeometry: 'macpherson',
      rearGeometry: 'multilink',
      massKg: 1390,
      frontWeightFraction: 0.62,
      cgHeightMm: 495,
      wheelbaseMm: 2650,
      frontTrackMm: 1580,
      rearTrackMm: 1565,
      frontSpringRateNmm: 90,
      rearSpringRateNmm: 110,
      frontMotionRatio: 0.94,
      rearMotionRatio: 0.85,
      frontSpringInclinationDeg: 86,
      rearSpringInclinationDeg: 84,
      frontArbStiffnessNmPerDeg: 410,
      rearArbStiffnessNmPerDeg: 620,
      frontRideHeightDeltaMm: 0,
      rearRideHeightDeltaMm: 0,
      nominalFrontRollCenterMm: 48,
      nominalRearRollCenterMm: 85,
      frontStaticCamberDeg: -2.2,
      rearStaticCamberDeg: -1.8,
      frontStaticToeDeg: -0.04,
      rearStaticToeDeg: 0.10,
      frontCasterDeg: 6.8,
      frontKpiDeg: 10.5,
      ackermannPct: 80,
      frontAntiDivePct: 32,
      rearAntiSquatPct: 20,
      frontLsBumpClicks: 10,
      frontLsReboundClicks: 11,
      rearLsBumpClicks: 11,
      rearLsReboundClicks: 12,
      frontHsBumpClicks: 10,
      rearHsBumpClicks: 10,
      frontTireWidthMm: 265,
      rearTireWidthMm: 265,
      frontTirePressurePsi: 33.0,
      rearTirePressurePsi: 34.0,
      optimalTirePressurePsi: 32.5,
      peakFrictionCoefficient: 1.24,
      tireLoadSensitivityExponent: 0.15,
      brakeBiasFrontPct: 72,
      frontTorqueSplitPct: 100,
      lsdAccelLockPct: 50,
      lsdDecelLockPct: 20,
      aeroClA: 0.38,
      aeroFrontBalancePct: 55,
    },
  },
  AWD: {
    id: 'AWD',
    name: 'All-Wheel Drive (AWD)',
    shortLabel: 'AWD (54/46)',
    subtitle: 'Traction shared across all four contact patches, sensitive to torque split & entry speed',
    examples: 'Porsche 911 Turbo / Carrera 4S, GT-R, GR Corolla, RS3 / WRX STI',
    handlingCharacter:
      'Immense corner-exit traction by distributing longitudinal drive force across all four friction circles. Responds strongly to square tire setups and rear ARB tuning.',
    oemFrontTireWidthMm: 245,
    oemRearTireWidthMm: 285,
    squareTireWidthMm: 265,
    defaultSetup: {
      drivetrain: 'AWD',
      frontGeometry: 'macpherson',
      rearGeometry: 'multilink',
      massKg: 1580,
      frontWeightFraction: 0.54,
      cgHeightMm: 475,
      wheelbaseMm: 2550,
      frontTrackMm: 1575,
      rearTrackMm: 1580,
      frontSpringRateNmm: 95,
      rearSpringRateNmm: 105,
      frontMotionRatio: 0.90,
      rearMotionRatio: 0.85,
      frontSpringInclinationDeg: 85,
      rearSpringInclinationDeg: 83,
      frontArbStiffnessNmPerDeg: 490,
      rearArbStiffnessNmPerDeg: 520,
      frontRideHeightDeltaMm: 0,
      rearRideHeightDeltaMm: 0,
      nominalFrontRollCenterMm: 54,
      nominalRearRollCenterMm: 80,
      frontStaticCamberDeg: -1.9,
      rearStaticCamberDeg: -2.0,
      frontStaticToeDeg: 0.0,
      rearStaticToeDeg: 0.22,
      frontCasterDeg: 7.8,
      frontKpiDeg: 12.0,
      ackermannPct: 70,
      frontAntiDivePct: 28,
      rearAntiSquatPct: 32,
      frontLsBumpClicks: 11,
      frontLsReboundClicks: 11,
      rearLsBumpClicks: 10,
      rearLsReboundClicks: 11,
      frontHsBumpClicks: 10,
      rearHsBumpClicks: 10,
      frontTireWidthMm: 245,
      rearTireWidthMm: 285,
      frontTirePressurePsi: 32.5,
      rearTirePressurePsi: 32.0,
      optimalTirePressurePsi: 32.0,
      peakFrictionCoefficient: 1.26,
      tireLoadSensitivityExponent: 0.14,
      brakeBiasFrontPct: 65,
      frontTorqueSplitPct: 35,
      lsdAccelLockPct: 45,
      lsdDecelLockPct: 40,
      aeroClA: 0.50,
      aeroFrontBalancePct: 46,
    },
  },
};

export const DEFAULT_DRIVER_INPUT: DriverInputState = {
  cornerPhase: 'mid',
  turnDirection: 'left',
  speedKmh: 125,
  lateralG: 1.05,
  brakingG: 0.45,
  throttleG: 0.40,
  trailBrakeOverlapPct: 40,
  driverSmoothnessPct: 75,
  surfaceCondition: 'smooth',
};
