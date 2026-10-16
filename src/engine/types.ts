export type DrivetrainArchetype = 'RR' | 'MR' | 'FR' | 'FF' | 'AWD';

export type SuspensionGeometryType = 'macpherson' | 'double_wishbone' | 'multilink';

export type CornerPhase = 'entry' | 'mid' | 'exit';

export type AdjustmentScope = 'trackside' | 'shop';

export type SurfaceCondition = 'smooth' | 'moderately_bumpy' | 'curbs_and_bumps';

export type WheelId = 'FL' | 'FR' | 'RL' | 'RR';

export type AlignmentPresetId = 'oem_road' | 'oem_track_max' | 'dedicated_track';

export type TireSetupPresetId = 'oem_stagger' | 'square_track' | 'wide_rear_stagger';

export type RideFrequencyPresetId = 'oem_street' | 'clubsport_track' | 'full_race';

export interface VehicleSetup {
  // Archetype identifiers
  drivetrain: DrivetrainArchetype;
  frontGeometry: SuspensionGeometryType;
  rearGeometry: SuspensionGeometryType;

  // 1. Mass & Dimensions
  massKg: number;
  frontWeightFraction: number; // 0.35 to 0.65 (e.g. 0.39 for RR 911, 0.45 for MR Cayman, 0.50 for 944)
  cgHeightMm: number; // h_CG (e.g. 460 mm)
  wheelbaseMm: number; // L (e.g. 2450 mm)
  frontTrackMm: number; // t_f (e.g. 1540 mm)
  rearTrackMm: number; // t_r (e.g. 1560 mm)

  // 2. Elastic Properties (Springs & Anti-Roll Bars)
  frontSpringRateNmm: number; // K_s,f (N/mm)
  rearSpringRateNmm: number; // K_s,r (N/mm)
  frontMotionRatio: number; // MR_f = dx_damper / dx_wheel
  rearMotionRatio: number; // MR_r
  frontSpringInclinationDeg: number; // theta_spring,f (deg, 90 = perpendicular)
  rearSpringInclinationDeg: number; // theta_spring,r (deg)
  frontArbStiffnessNmPerDeg: number; // Added axle roll stiffness from front ARB (Nm/deg)
  rearArbStiffnessNmPerDeg: number; // Added axle roll stiffness from rear ARB (Nm/deg)

  // 3. Kinematic & Pitch Geometry Parameters
  frontRideHeightDeltaMm: number; // Change from nominal design ride height (-40 to +25 mm)
  rearRideHeightDeltaMm: number; // Change from nominal design ride height (-40 to +25 mm)
  nominalFrontRollCenterMm: number; // z_rc,f at design ride height (mm)
  nominalRearRollCenterMm: number; // z_rc,r at design ride height (mm)
  frontStaticCamberDeg: number; // gamma_0,f (negative = top tilted in, e.g. -2.5 deg)
  rearStaticCamberDeg: number; // gamma_0,r (e.g. -2.0 deg)
  frontStaticToeDeg: number; // delta_T,f (+ = toe-in, - = toe-out, total deg)
  rearStaticToeDeg: number; // delta_T,r (+ = toe-in, - = toe-out, total deg)
  frontCasterDeg: number; // nu (positive caster, e.g. 8.0 deg)
  frontKpiDeg: number; // Kingpin inclination / SAI (e.g. 12.5 deg)
  ackermannPct: number; // 100% = pure geometric Ackermann, 0% = parallel, <0% = anti-Ackermann
  frontAntiDivePct: number; // %AD (0 to 80%)
  rearAntiSquatPct: number; // %AS (0 to 80%)

  // 4. Dampers (1 to 20 clicks; 10 = baseline nominal)
  frontLsBumpClicks: number;
  frontLsReboundClicks: number;
  rearLsBumpClicks: number;
  rearLsReboundClicks: number;
  frontHsBumpClicks: number;
  rearHsBumpClicks: number;

  // 5. Tire Contact Patch, Section Width & Pressure
  frontTireWidthMm: number; // e.g. 225, 245, 255, 265 mm
  rearTireWidthMm: number; // e.g. 255, 265, 295, 305 mm
  frontTirePressurePsi: number; // Hot track pressure (e.g. 31 psi)
  rearTirePressurePsi: number; // Hot track pressure (e.g. 32 psi)
  optimalTirePressurePsi: number; // Target hot pressure for compound (e.g. 31.5 psi)
  peakFrictionCoefficient: number; // mu_0 (e.g. 1.25 for 200TW track tire / slick)
  tireLoadSensitivityExponent: number; // k_sens (e.g. 0.14)

  // 6. Drivetrain, Brakes & Aerodynamics
  brakeBiasFrontPct: number; // BFD % (e.g. 62%)
  frontTorqueSplitPct: number; // 0% for RWD (RR/MR/FR), 100% for FF, 35% for AWD
  lsdAccelLockPct: number; // 0 to 100%
  lsdDecelLockPct: number; // 0 to 100%
  aeroClA: number; // Lift/Downforce area C_L * A (m^2, e.g. 0.65)
  aeroFrontBalancePct: number; // % of aero downforce on front axle (e.g. 42%)
}

export interface DriverInputState {
  cornerPhase: CornerPhase;
  turnDirection: 'left' | 'right';
  speedKmh: number; // 50 to 240 km/h
  lateralG: number; // 0.3 to 1.5 g
  brakingG: number; // 0.0 to 1.2 g (active in entry / trail-braking)
  throttleG: number; // 0.0 to 0.8 g (active in exit)
  trailBrakeOverlapPct: number; // 0 to 100% (how deep braking is carried into turn-in)
  driverSmoothnessPct: number; // 0% = abrupt / jerky inputs, 100% = smooth progressive inputs
  surfaceCondition: SurfaceCondition;
}

export interface WheelTelemetry {
  id: WheelId;
  isOutside: boolean;
  isFront: boolean;
  tireWidthMm: number;
  staticFzN: number;
  dynamicFzN: number;
  longitudinalFxN: number; // negative = braking, positive = traction
  lateralFyDemandN: number;
  maxLateralFyAvailableN: number;
  maxTotalForceN: number;
  gripUtilizationPct: number; // 0 to 150%
  dynamicCamberDeg: number;
  camberGainFromBumpDeg: number;
  camberGainFromSteerDeg: number;
  steerAngleDeg: number;
  staticToeAngleDeg: number;
  slipAngleDeg: number;
  suspensionDeflectionMm: number; // positive = bump compression, negative = droop
  effectiveFrictionMu: number;
}

export interface PhaseBalanceSummary {
  entryScore: number; // -100 (Heavy Oversteer) to +100 (Heavy Understeer), 0 = Neutral
  midScore: number;
  exitScore: number;
  activeScore: number;
  activeClassification:
    | 'Severe Oversteer'
    | 'Moderate Oversteer'
    | 'Slight Oversteer'
    | 'Neutral / Balanced'
    | 'Slight Understeer'
    | 'Moderate Understeer'
    | 'Severe Understeer';
}

export interface KinematicMetrics {
  // Elastic & Ride Rates
  frontWheelRateNmm: number;
  rearWheelRateNmm: number;
  frontRideRateNmm: number;
  rearRideRateNmm: number;
  frontNaturalFreqHz: number;
  rearNaturalFreqHz: number;

  // Roll Stiffness & LLTD
  frontSpringRollStiffnessNmRad: number;
  rearSpringRollStiffnessNmRad: number;
  frontArbRollStiffnessNmRad: number;
  rearArbRollStiffnessNmRad: number;
  totalFrontRollStiffnessNmRad: number;
  totalRearRollStiffnessNmRad: number;
  frontRollStiffnessRatio: number; // FRSR = K_phi,f / (K_phi,f + K_phi,r)
  totalLateralLoadTransferDistributionFront: number; // TLLTD_f including geometric RC

  // Roll Center & Dynamic Migration
  staticFrontRollCenterMm: number;
  staticRearRollCenterMm: number;
  effectiveFrontRollCenterMm: number; // Includes dynamic pitch & roll migration
  effectiveRearRollCenterMm: number; // Includes dynamic pitch & roll migration
  rollAxisAtCgMm: number;
  rollMomentArmMm: number; // Dynamic h_roll = h_CG,dyn - z_rc,CG,dyn
  frontJackingForceN: number;
  rearJackingForceN: number;

  // Tire Sizing Balance
  frontTireWidthShare: number; // W_tire,f / (W_tire,f + W_tire,r)

  // Attitude & Weight Transfer
  bodyRollDeg: number;
  bodyPitchDeg: number; // positive = squat (nose up), negative = dive (nose down)
  longitudinalLoadTransferN: number;
  frontLateralLoadTransferN: number;
  rearLateralLoadTransferN: number;
  diagonalLoadTransferN: number;
  totalAeroDownforceN: number;

  // Damping Ratios
  frontLsBumpZeta: number;
  frontLsReboundZeta: number;
  rearLsBumpZeta: number;
  rearLsReboundZeta: number;

  // Axle Slip Angles
  frontAxleSlipAngleDeg: number;
  rearAxleSlipAngleDeg: number;
  understeerGradientDegPerG: number;
}

export interface EngineeringWarning {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  explanation: string;
}

export interface SimulationResult {
  setup: VehicleSetup;
  driver: DriverInputState;
  wheels: Record<WheelId, WheelTelemetry>;
  kinematics: KinematicMetrics;
  balance: PhaseBalanceSummary;
  warnings: EngineeringWarning[];
}

export type HandlingSymptomType =
  | 'understeer'
  | 'oversteer'
  | 'instability_braking'
  | 'poor_traction_exit'
  | 'slow_turn_in_response'
  | 'mid_corner_bump_skittishness';

export interface DiagnosticQuery {
  symptom: HandlingSymptomType;
  phase: CornerPhase;
  scopeFilter: 'all' | AdjustmentScope;
}

export interface RankedAdjustmentRecommendation {
  id: string;
  parameterKey: keyof VehicleSetup | 'driverTrailBrake' | 'driverSmoothness';
  title: string;
  category:
    | 'Anti-Roll Bars'
    | 'Dampers'
    | 'Tire Pressures & Sizing'
    | 'Alignment (Camber & Toe)'
    | 'Springs, Ride Freq & Roll Centers'
    | 'Pitch Anti-Geometry'
    | 'Differential & Brakes'
    | 'Aerodynamics'
    | 'Driver Technique';
  scope: AdjustmentScope;
  directionLabel: string;
  suggestedSetupPatch: Partial<VehicleSetup>;
  suggestedDriverPatch?: Partial<DriverInputState>;
  effectivenessScore: number; // 0 to 100
  balanceDeltaInTargetPhase: number;
  physicalMechanism: string;
  equationReference: string;
  secondaryTradeoff: string;
  phaseImpact: {
    entryDelta: number;
    midDelta: number;
    exitDelta: number;
  };
}
