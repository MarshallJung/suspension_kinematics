import { simulateVehicleState } from './tireModel';
import {
  AdjustmentScope,
  CornerPhase,
  DiagnosticQuery,
  DriverInputState,
  HandlingSymptomType,
  RankedAdjustmentRecommendation,
  VehicleSetup,
} from './types';

interface CandidateAdjustmentBlueprint {
  id: string;
  parameterKey: RankedAdjustmentRecommendation['parameterKey'];
  title: string;
  category: RankedAdjustmentRecommendation['category'];
  scope: AdjustmentScope;
  applicableSymptoms: HandlingSymptomType[];
  applicablePhases: CornerPhase[];
  buildPatch: (
    setup: VehicleSetup,
    driver: DriverInputState
  ) => {
    directionLabel: string;
    setupPatch: Partial<VehicleSetup>;
    driverPatch?: Partial<DriverInputState>;
  } | null;
  physicalMechanism: string;
  equationReference: string;
  secondaryTradeoff: string;
  basePriority: number;
}

const CANDIDATE_BLUEPRINTS: CandidateAdjustmentBlueprint[] = [
  // ============================================================================
  // SCENARIO B: CORRECTING EXCESSIVE UNDERSTEER (INCREASING ROTATION / OVERSTEER)
  // ============================================================================
  {
    id: 'us_soften_front_arb',
    parameterKey: 'frontArbStiffnessNmPerDeg',
    title: 'Soften Front Anti-Roll Bar (ARB)',
    category: 'Anti-Roll Bars',
    scope: 'trackside',
    applicableSymptoms: ['understeer', 'slow_turn_in_response'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 94,
    buildPatch: (setup) => {
      if (setup.frontArbStiffnessNmPerDeg <= 120) return null;
      const next = Math.max(100, Math.round(setup.frontArbStiffnessNmPerDeg - 90));
      return {
        directionLabel: `Soften Front ARB (${setup.frontArbStiffnessNmPerDeg} → ${next} Nm/deg)`,
        setupPatch: { frontArbStiffnessNmPerDeg: next },
      };
    },
    physicalMechanism:
      'Reduces front roll stiffness (K_φ,f) and lowers Front Roll Stiffness Ratio (FRSR), shifting lateral load transfer rearward so the outer front tire operates at a lower vertical load and generates higher cornering efficiency.',
    equationReference: 'FRSR = K_φ,f / (K_φ,f + K_φ,r)',
    secondaryTradeoff:
      'Increases total chassis roll angle (φ); on MacPherson strut fronts, excessive roll can cost dynamic negative camber if front spring rate is too soft.',
  },
  {
    id: 'us_stiffen_rear_arb',
    parameterKey: 'rearArbStiffnessNmPerDeg',
    title: 'Stiffen Rear Anti-Roll Bar (ARB)',
    category: 'Anti-Roll Bars',
    scope: 'trackside',
    applicableSymptoms: ['understeer', 'slow_turn_in_response'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 92,
    buildPatch: (setup) => {
      if (setup.rearArbStiffnessNmPerDeg >= 900) return null;
      const next = Math.min(950, Math.round(setup.rearArbStiffnessNmPerDeg + 90));
      return {
        directionLabel: `Stiffen Rear ARB (${setup.rearArbStiffnessNmPerDeg} → ${next} Nm/deg)`,
        setupPatch: { rearArbStiffnessNmPerDeg: next },
      };
    },
    physicalMechanism:
      'Increases rear roll stiffness (K_φ,r), lowering FRSR and overloading the outside rear tire via tire load sensitivity to increase rear slip angle (α_r) and help the chassis rotate.',
    equationReference: 'FRSR = K_φ,f / (K_φ,f + K_φ,r)',
    secondaryTradeoff:
      'Unloads the inside rear tire on corner exit, which can reduce rear forward traction and cause inside wheelspin if LSD lock is low.',
  },
  {
    id: 'us_increase_front_neg_camber',
    parameterKey: 'frontStaticCamberDeg',
    title: 'Increase Front Negative Camber',
    category: 'Alignment (Camber & Toe)',
    scope: 'shop',
    applicableSymptoms: ['understeer', 'slow_turn_in_response'],
    applicablePhases: ['entry', 'mid'],
    basePriority: 93,
    buildPatch: (setup) => {
      if (setup.frontStaticCamberDeg <= -3.8) return null;
      const step = setup.frontStaticCamberDeg > -1.5 ? 0.8 : 0.5;
      const next = Number((setup.frontStaticCamberDeg - step).toFixed(1));
      return {
        directionLabel: `Add Front Negative Camber (${setup.frontStaticCamberDeg.toFixed(1)}° → ${next.toFixed(1)}°)`,
        setupPatch: { frontStaticCamberDeg: next },
      };
    },
    physicalMechanism:
      'Compensates for chassis body roll angle (φ) and radial sidewall rollover, keeping the outside front tire contact patch flat against the asphalt and generating additional lateral camber thrust (C_γ).',
    equationReference: 'γ_dyn = γ_0 + (dγ/dz)Δz + (dγ/dφ)φ - ν sin(δ)',
    secondaryTradeoff:
      'Slightly reduces straight-line braking contact patch area and increases inner shoulder tire wear on street/highway drives.',
  },
  {
    id: 'us_widen_front_tire_square',
    parameterKey: 'frontTireWidthMm',
    title: 'Widen Front Tire Section Width (Toward Square Setup)',
    category: 'Tire Pressures & Sizing',
    scope: 'shop',
    applicableSymptoms: ['understeer', 'slow_turn_in_response'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 91,
    buildPatch: (setup) => {
      if (setup.frontTireWidthMm >= setup.rearTireWidthMm + 10) return null;
      const nextWidth =
        setup.frontTireWidthMm < setup.rearTireWidthMm
          ? Math.min(setup.rearTireWidthMm, setup.frontTireWidthMm + 20)
          : Math.min(315, setup.frontTireWidthMm + 15);
      if (nextWidth === setup.frontTireWidthMm) return null;
      const isSquare = nextWidth === setup.rearTireWidthMm;
      return {
        directionLabel: `Increase Front Tire Width (${setup.frontTireWidthMm}mm → ${nextWidth}mm${
          isSquare ? ' Square Setup' : ''
        })`,
        setupPatch: { frontTireWidthMm: nextWidth },
      };
    },
    physicalMechanism:
      'Enlarges the front contact patch footprint and raises the front tires’ nominal vertical load rating (F_z,nom), lowering contact stress (F_z / F_z,nom) under lateral load transfer and increasing front cornering stiffness (C_α,f) and peak lateral capacity (F_y,max,f).',
    equationReference: 'F_z,nom,eff ∝ (W_tire,f / W_tire,ref)^1.35',
    secondaryTradeoff:
      'Requires checking front fender/strut clearance, wheel offset (scrub radius change), and slightly increases steering effort and aerodynamic frontal area.',
  },
  {
    id: 'us_front_toe_out',
    parameterKey: 'frontStaticToeDeg',
    title: 'Decrease Front Toe-In / Add Slight Toe-Out',
    category: 'Alignment (Camber & Toe)',
    scope: 'shop',
    applicableSymptoms: ['understeer', 'slow_turn_in_response'],
    applicablePhases: ['entry'],
    basePriority: 88,
    buildPatch: (setup) => {
      if (setup.frontStaticToeDeg <= -0.25) return null;
      const next = Number((setup.frontStaticToeDeg - 0.12).toFixed(2));
      return {
        directionLabel: `Adjust Front Toe Toward Toe-Out (${setup.frontStaticToeDeg.toFixed(2)}° → ${next.toFixed(2)}°)`,
        setupPatch: { frontStaticToeDeg: next },
      };
    },
    physicalMechanism:
      'Pre-loads the inside wheel slip angle and enhances Ackermann turn-in geometry, sharpening initial turn-in response and reducing entry understeer compliance.',
    equationReference: 'cot(δ_o) - cot(δ_i) = w / L',
    secondaryTradeoff:
      'Reduces straight-line high-speed stability (car feels darty on straights) and increases inner edge tire scrub.',
  },
  {
    id: 'us_reduce_rear_toe_in',
    parameterKey: 'rearStaticToeDeg',
    title: 'Reduce Rear Static Toe-In Toward Neutral',
    category: 'Alignment (Camber & Toe)',
    scope: 'shop',
    applicableSymptoms: ['understeer'],
    applicablePhases: ['mid', 'exit'],
    basePriority: 80,
    buildPatch: (setup) => {
      if (setup.rearStaticToeDeg <= 0.05) return null;
      const next = Number(Math.max(0, setup.rearStaticToeDeg - 0.12).toFixed(2));
      return {
        directionLabel: `Reduce Rear Toe-In (${setup.rearStaticToeDeg.toFixed(2)}° → ${next.toFixed(2)}°)`,
        setupPatch: { rearStaticToeDeg: next },
      };
    },
    physicalMechanism:
      'Reduces rear understeer stabilizing slip angle (δ_RU), allowing the rear axle to rotate more freely through mid-corner and apex.',
    equationReference: 'α_r,eff = α_r - k_toe · δ_T,r',
    secondaryTradeoff:
      'Reduces rear stability under heavy straight-line braking and fast direction changes; never run rear toe-out on RWD track cars.',
  },
  {
    id: 'us_soften_front_ls_bump_damper',
    parameterKey: 'frontLsBumpClicks',
    title: 'Soften Front Low-Speed Bump Damping',
    category: 'Dampers',
    scope: 'trackside',
    applicableSymptoms: ['understeer', 'slow_turn_in_response'],
    applicablePhases: ['entry'],
    basePriority: 89,
    buildPatch: (setup) => {
      if (setup.frontLsBumpClicks <= 3) return null;
      const next = Math.max(2, setup.frontLsBumpClicks - 3);
      return {
        directionLabel: `Soften Front LS Bump (${setup.frontLsBumpClicks} → ${next} clicks)`,
        setupPatch: { frontLsBumpClicks: next },
      };
    },
    physicalMechanism:
      'Reduces transient compressive force resistance on the outside front damper during initial turn-in and trail-braking, slowing the rate of front lateral load transfer so the outer front tire does not spike and wash out.',
    equationReference: 'ζ_LS,f = C_wheel,f / (2√(K_w,f · m_s,f))',
    secondaryTradeoff:
      'Allows slightly faster nose dive on initial brake pedal application.',
  },
  {
    id: 'us_stiffen_front_ls_rebound_exit',
    parameterKey: 'frontLsReboundClicks',
    title: 'Stiffen Front Low-Speed Rebound Damping',
    category: 'Dampers',
    scope: 'trackside',
    applicableSymptoms: ['understeer'],
    applicablePhases: ['exit'],
    basePriority: 88,
    buildPatch: (setup) => {
      if (setup.frontLsReboundClicks >= 18) return null;
      const next = Math.min(19, setup.frontLsReboundClicks + 3);
      return {
        directionLabel: `Stiffen Front LS Rebound (${setup.frontLsReboundClicks} → ${next} clicks)`,
        setupPatch: { frontLsReboundClicks: next },
      };
    },
    physicalMechanism:
      'Resists front suspension extension when applying throttle at corner exit, holding vertical load on the front contact patches longer (especially critical on RR 911 and MR platforms).',
    equationReference: 'F_damper,reb = -C_LS,reb · dz/dt',
    secondaryTradeoff:
      'If stiffened excessively, the front suspension can "pack down" over successive mid-corner bumps.',
  },
  {
    id: 'us_spring_rate_shift_rearward',
    parameterKey: 'rearSpringRateNmm',
    title: 'Increase Rear Spring Rate / Target Ride Frequency (f_n,r)',
    category: 'Springs, Ride Freq & Roll Centers',
    scope: 'shop',
    applicableSymptoms: ['understeer'],
    applicablePhases: ['mid', 'exit'],
    basePriority: 84,
    buildPatch: (setup) => {
      const nextRear = Math.min(220, setup.rearSpringRateNmm + 15);
      return {
        directionLabel: `Increase Rear Spring Rate (${setup.rearSpringRateNmm} → ${nextRear} N/mm)`,
        setupPatch: { rearSpringRateNmm: nextRear },
      };
    },
    physicalMechanism:
      'Increases rear wheel rate (K_w,r = K_s,r · MR_r²), rear ride frequency (f_n,r), and rear spring roll stiffness (0.5 · K_w,r · t_r²), shifting elastic roll stiffness rearward so the front axle maintains a more equal vertical load distribution.',
    equationReference: 'K_φ,spring = ½ K_w t²,  f_n = (1/2π)√(K_ride / m_s)',
    secondaryTradeoff:
      'Increases rear ride frequency (f_n,r) and reduces rear mechanical compliance over bumpy exit curbs.',
  },
  {
    id: 'us_optimize_front_tire_pressure',
    parameterKey: 'frontTirePressurePsi',
    title: 'Optimize Front Hot Tire Pressure',
    category: 'Tire Pressures & Sizing',
    scope: 'trackside',
    applicableSymptoms: ['understeer'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 86,
    buildPatch: (setup) => {
      const diff = setup.frontTirePressurePsi - setup.optimalTirePressurePsi;
      const target =
        Math.abs(diff) > 0.6
          ? setup.optimalTirePressurePsi
          : Number((setup.frontTirePressurePsi - 1.0).toFixed(1));
      if (Math.abs(target - setup.frontTirePressurePsi) < 0.2) return null;
      return {
        directionLabel: `Set Front Hot Pressure (${setup.frontTirePressurePsi.toFixed(1)} → ${target.toFixed(1)} PSI)`,
        setupPatch: { frontTirePressurePsi: target },
      };
    },
    physicalMechanism:
      'Bleeding down an over-inflated hot front tire flattens the contact patch crown and maximizes cornering stiffness (C_α) up to the optimal inflation pressure.',
    equationReference: 'F_y = C_α(P_tire, F_z) · α',
    secondaryTradeoff:
      'Dropping too far below optimal pressure reduces sidewall stiffness and makes steering response feel vague.',
  },
  {
    id: 'us_driver_trail_brake',
    parameterKey: 'driverTrailBrake',
    title: 'Driver Technique: Progressive Trail-Braking to Load Nose',
    category: 'Driver Technique',
    scope: 'trackside',
    applicableSymptoms: ['understeer', 'slow_turn_in_response'],
    applicablePhases: ['entry'],
    basePriority: 90,
    buildPatch: (_setup, driver) => {
      if (driver.trailBrakeOverlapPct > 65) {
        const next = 40;
        return {
          directionLabel: `Reduce Excess Trail-Brake Overlap (${driver.trailBrakeOverlapPct}% → ${next}%)`,
          setupPatch: {},
          driverPatch: { trailBrakeOverlapPct: next },
        };
      }
      const next = Math.min(60, driver.trailBrakeOverlapPct + 20);
      return {
        directionLabel: `Increase Progressive Trail-Braking (${driver.trailBrakeOverlapPct}% → ${next}%)`,
        setupPatch: {},
        driverPatch: { trailBrakeOverlapPct: next, brakingG: Math.max(0.35, driver.brakingG) },
      };
    },
    physicalMechanism:
      'Carrying light, progressive braking into turn-in transfers longitudinal weight (ΔW_long = W·h_CG·a_x / g·L) onto the front axle, enlarging the front contact patch normal load before blending to pure cornering.',
    equationReference: 'ΔW_long = (W · h_CG · a_x) / (g · L)',
    secondaryTradeoff:
      'Over-braking past the friction ellipse limit consumes longitudinal capacity (F_x) at the expense of available lateral cornering force (F_y,avail).',
  },

  // ============================================================================
  // SCENARIO A: CORRECTING EXCESSIVE OVERSTEER (INCREASING STABILITY / UNDERSTEER)
  // ============================================================================
  {
    id: 'os_stiffen_front_arb',
    parameterKey: 'frontArbStiffnessNmPerDeg',
    title: 'Stiffen Front Anti-Roll Bar (ARB)',
    category: 'Anti-Roll Bars',
    scope: 'trackside',
    applicableSymptoms: ['oversteer', 'instability_braking'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 94,
    buildPatch: (setup) => {
      if (setup.frontArbStiffnessNmPerDeg >= 900) return null;
      const next = Math.min(950, Math.round(setup.frontArbStiffnessNmPerDeg + 90));
      return {
        directionLabel: `Stiffen Front ARB (${setup.frontArbStiffnessNmPerDeg} → ${next} Nm/deg)`,
        setupPatch: { frontArbStiffnessNmPerDeg: next },
      };
    },
    physicalMechanism:
      'Increases front roll stiffness (K_φ,f) and raises FRSR, transferring more lateral load to the outside front tire while allowing the rear tires to share vertical load more evenly.',
    equationReference: 'FRSR = K_φ,f / (K_φ,f + K_φ,r)',
    secondaryTradeoff:
      'Reduces peak front axle mid-corner grip due to tire load sensitivity on the heavily loaded outer front tire.',
  },
  {
    id: 'os_soften_rear_arb',
    parameterKey: 'rearArbStiffnessNmPerDeg',
    title: 'Soften Rear Anti-Roll Bar (ARB)',
    category: 'Anti-Roll Bars',
    scope: 'trackside',
    applicableSymptoms: ['oversteer', 'poor_traction_exit'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 93,
    buildPatch: (setup) => {
      if (setup.rearArbStiffnessNmPerDeg <= 100) return null;
      const next = Math.max(80, Math.round(setup.rearArbStiffnessNmPerDeg - 90));
      return {
        directionLabel: `Soften Rear ARB (${setup.rearArbStiffnessNmPerDeg} → ${next} Nm/deg)`,
        setupPatch: { rearArbStiffnessNmPerDeg: next },
      };
    },
    physicalMechanism:
      'Reduces rear lateral load transfer (ΔF_z,lat,r), keeping both rear tires more evenly loaded to maximize total rear lateral grip and corner-exit forward traction.',
    equationReference: 'K_φ,rear = ½ K_w,r t_r² + K_φ,ARB,r',
    secondaryTradeoff:
      'Slightly slows initial turn-in rotation and increases body roll angle.',
  },
  {
    id: 'os_increase_rear_neg_camber',
    parameterKey: 'rearStaticCamberDeg',
    title: 'Increase Rear Negative Camber',
    category: 'Alignment (Camber & Toe)',
    scope: 'shop',
    applicableSymptoms: ['oversteer'],
    applicablePhases: ['mid', 'exit'],
    basePriority: 90,
    buildPatch: (setup) => {
      if (setup.rearStaticCamberDeg <= -3.4) return null;
      const next = Number((setup.rearStaticCamberDeg - 0.4).toFixed(1));
      return {
        directionLabel: `Add Rear Negative Camber (${setup.rearStaticCamberDeg.toFixed(1)}° → ${next.toFixed(1)}°)`,
        setupPatch: { rearStaticCamberDeg: next },
      };
    },
    physicalMechanism:
      'Counteracts chassis body roll angle (φ) at the rear axle, maximizing the outside rear tire contact patch area and generating stabilizing camber thrust (C_γ).',
    equationReference: 'γ_dyn,r = γ_0,r + (dγ/dz)Δz_r + (dγ/dφ)φ',
    secondaryTradeoff:
      'Excessive rear negative camber (> -3.0°) slightly reduces straight-line acceleration contact patch footprint.',
  },
  {
    id: 'os_increase_rear_toe_in',
    parameterKey: 'rearStaticToeDeg',
    title: 'Increase Rear Static Toe-In',
    category: 'Alignment (Camber & Toe)',
    scope: 'shop',
    applicableSymptoms: ['oversteer', 'instability_braking'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 91,
    buildPatch: (setup) => {
      if (setup.rearStaticToeDeg >= 0.48) return null;
      const next = Number((setup.rearStaticToeDeg + 0.12).toFixed(2));
      return {
        directionLabel: `Increase Rear Toe-In (${setup.rearStaticToeDeg.toFixed(2)}° → ${next.toFixed(2)}°)`,
        setupPatch: { rearStaticToeDeg: next },
      };
    },
    physicalMechanism:
      'Produces a stabilizing understeer slip bias on the heavily loaded outside rear wheel during cornering and braking, reducing attitude angle (β) and resisting tail-out yaw.',
    equationReference: 'δ_rear,out = +½ δ_T,r (toe-in opposes yaw rotation)',
    secondaryTradeoff:
      'Slightly increases rolling drag and rear tire temperature/wear.',
  },
  {
    id: 'os_soften_rear_ls_rebound_entry',
    parameterKey: 'rearLsReboundClicks',
    title: 'Soften Rear Low-Speed Rebound Damping',
    category: 'Dampers',
    scope: 'trackside',
    applicableSymptoms: ['oversteer', 'instability_braking'],
    applicablePhases: ['entry'],
    basePriority: 89,
    buildPatch: (setup) => {
      if (setup.rearLsReboundClicks <= 3) return null;
      const next = Math.max(2, setup.rearLsReboundClicks - 3);
      return {
        directionLabel: `Soften Rear LS Rebound (${setup.rearLsReboundClicks} → ${next} clicks)`,
        setupPatch: { rearLsReboundClicks: next },
      };
    },
    physicalMechanism:
      'Allows the rear suspension to extend smoothly as weight pitches forward under braking, keeping the inside rear tire pressed onto the track surface instead of hiking it in the air on turn-in.',
    equationReference: 'ζ_LS,reb,r = C_reb,r / (2√(K_w,r · m_s,r))',
    secondaryTradeoff:
      'Slightly faster forward pitch rate on initial brake application.',
  },
  {
    id: 'os_soften_rear_ls_bump_exit',
    parameterKey: 'rearLsBumpClicks',
    title: 'Soften Rear Low-Speed Bump Damping',
    category: 'Dampers',
    scope: 'trackside',
    applicableSymptoms: ['oversteer', 'poor_traction_exit'],
    applicablePhases: ['exit'],
    basePriority: 90,
    buildPatch: (setup) => {
      if (setup.rearLsBumpClicks <= 3) return null;
      const next = Math.max(2, setup.rearLsBumpClicks - 3);
      return {
        directionLabel: `Soften Rear LS Bump (${setup.rearLsBumpClicks} → ${next} clicks)`,
        setupPatch: { rearLsBumpClicks: next },
      };
    },
    physicalMechanism:
      'Allows the rear suspension to compress progressively under corner-exit throttle squat, preventing a sudden vertical force spike that saturates the outside rear tire friction circle.',
    equationReference: 'F_y,avail = √(F_max² - F_x²)',
    secondaryTradeoff:
      'Slightly more rear chassis squat under full acceleration.',
  },
  {
    id: 'os_increase_lsd_decel_entry',
    parameterKey: 'lsdDecelLockPct',
    title: 'Increase Differential Deceleration Lock / Preload',
    category: 'Differential & Brakes',
    scope: 'shop',
    applicableSymptoms: ['oversteer', 'instability_braking'],
    applicablePhases: ['entry'],
    basePriority: 85,
    buildPatch: (setup) => {
      if (setup.lsdDecelLockPct >= 80) return null;
      const next = Math.min(85, setup.lsdDecelLockPct + 15);
      return {
        directionLabel: `Increase LSD Decel Lock (${setup.lsdDecelLockPct}% → ${next}%)`,
        setupPatch: { lsdDecelLockPct: next },
      };
    },
    physicalMechanism:
      'Couples the left and right rear axle half-shafts under braking/off-throttle deceleration, generating a yaw-damping restoring moment that resists corner-entry rotation (critical on rear-engine 911s).',
    equationReference: 'M_yaw,LSD = ΔF_x,rear · (t_r / 2)',
    secondaryTradeoff:
      'Can induce slight entry understeer in tight slow-speed hairpins.',
  },
  {
    id: 'os_shift_brake_bias_forward',
    parameterKey: 'brakeBiasFrontPct',
    title: 'Shift Brake Force Distribution (BFD) Forward',
    category: 'Differential & Brakes',
    scope: 'trackside',
    applicableSymptoms: ['oversteer', 'instability_braking'],
    applicablePhases: ['entry'],
    basePriority: 87,
    buildPatch: (setup) => {
      if (setup.brakeBiasFrontPct >= 74) return null;
      const next = Math.min(75, setup.brakeBiasFrontPct + 3);
      return {
        directionLabel: `Shift Brake Bias Forward (${setup.brakeBiasFrontPct}% → ${next}% Front)`,
        setupPatch: { brakeBiasFrontPct: next },
      };
    },
    physicalMechanism:
      'Reduces longitudinal braking force (F_x,r) demanded from the unloaded rear tires during trail-braking, freeing up rear lateral capacity inside the friction ellipse.',
    equationReference: 'F_y,avail,r = μ F_z,r √(1 - (F_x,r / μ F_z,r)²)',
    secondaryTradeoff:
      'Increases front tire combined-slip demand under trail-braking.',
  },
  {
    id: 'os_optimize_rear_tire_pressure',
    parameterKey: 'rearTirePressurePsi',
    title: 'Optimize Rear Hot Tire Pressure',
    category: 'Tire Pressures & Sizing',
    scope: 'trackside',
    applicableSymptoms: ['oversteer', 'poor_traction_exit'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 86,
    buildPatch: (setup) => {
      const diff = setup.rearTirePressurePsi - setup.optimalTirePressurePsi;
      const target =
        Math.abs(diff) > 0.6
          ? setup.optimalTirePressurePsi
          : Number((setup.rearTirePressurePsi - 1.0).toFixed(1));
      if (Math.abs(target - setup.rearTirePressurePsi) < 0.2) return null;
      return {
        directionLabel: `Lower/Optimize Rear Hot Pressure (${setup.rearTirePressurePsi.toFixed(1)} → ${target.toFixed(1)} PSI)`,
        setupPatch: { rearTirePressurePsi: target },
      };
    },
    physicalMechanism:
      'Enlarges the rear tire contact patch footprint and maximizes rear cornering stiffness (C_α) and longitudinal traction up to the optimal inflation limit.',
    equationReference: 'F_y,r = C_α,r(P_tire) · α_r',
    secondaryTradeoff:
      'Avoid dropping below minimum safe sidewall pressure (~27 PSI hot) to prevent tire rollover.',
  },
  {
    id: 'os_aero_rear_wing',
    parameterKey: 'aeroFrontBalancePct',
    title: 'Increase Rear Wing Angle of Attack (Shift Aero CoP Rearward)',
    category: 'Aerodynamics',
    scope: 'trackside',
    applicableSymptoms: ['oversteer'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 82,
    buildPatch: (setup) => {
      if (setup.aeroFrontBalancePct <= 30) return null;
      const next = Math.max(28, setup.aeroFrontBalancePct - 5);
      return {
        directionLabel: `Shift Aero Balance Rearward (${100 - setup.aeroFrontBalancePct}% → ${100 - next}% Rear)`,
        setupPatch: {
          aeroFrontBalancePct: next,
          aeroClA: Number((setup.aeroClA + 0.06).toFixed(2)),
        },
      };
    },
    physicalMechanism:
      'Increases aerodynamic vertical load (F_z,aero ∝ v²) on the rear axle without adding mass inertia, planting the rear tires in medium- and high-speed corners.',
    equationReference: 'F_z,aero,r = ½ ρ (C_L A)_r v²',
    secondaryTradeoff:
      'Slightly increases aerodynamic drag on long straights and shifts high-speed balance toward understeer if uncompensated by a front splitter.',
  },

  // ============================================================================
  // SURFACE BUMPS, ANTI-GEOMETRY & TRACTION SPECIALIZED RULES
  // ============================================================================
  {
    id: 'bump_soften_hs_damping',
    parameterKey: 'frontHsBumpClicks',
    title: 'Soften High-Speed Bump Damping for Curb & Bump Compliance',
    category: 'Dampers',
    scope: 'trackside',
    applicableSymptoms: ['mid_corner_bump_skittishness', 'poor_traction_exit', 'instability_braking'],
    applicablePhases: ['entry', 'mid', 'exit'],
    basePriority: 92,
    buildPatch: (setup) => {
      const nextF = Math.max(4, setup.frontHsBumpClicks - 3);
      const nextR = Math.max(4, setup.rearHsBumpClicks - 3);
      return {
        directionLabel: `Soften Front/Rear HS Bump (${setup.frontHsBumpClicks}/${setup.rearHsBumpClicks} → ${nextF}/${nextR} clicks)`,
        setupPatch: { frontHsBumpClicks: nextF, rearHsBumpClicks: nextR },
      };
    },
    physicalMechanism:
      'Reduces high-velocity damper blow-off resistance over curbs and surface imperfections, preventing vertical contact patch load spikes (ΔF_z) that skip the tire across the pavement.',
    equationReference: 'F_damper(v_shaft) at v_shaft > 100 mm/s',
    secondaryTradeoff:
      'Slightly increases bottoming risk over extreme compression dips if bump stops are short.',
  },
  {
    id: 'anti_geometry_tune_window',
    parameterKey: 'frontAntiDivePct',
    title: 'Tune Anti-Dive / Anti-Squat into Optimal 25–35% Race Window',
    category: 'Pitch Anti-Geometry',
    scope: 'shop',
    applicableSymptoms: ['instability_braking', 'poor_traction_exit', 'mid_corner_bump_skittishness'],
    applicablePhases: ['entry', 'exit'],
    basePriority: 84,
    buildPatch: (setup) => {
      const targetAd = setup.frontAntiDivePct > 40 ? 30 : Math.min(35, setup.frontAntiDivePct + 10);
      const targetAs = setup.rearAntiSquatPct > 40 ? 32 : Math.min(35, setup.rearAntiSquatPct + 10);
      return {
        directionLabel: `Set Anti-Dive ${setup.frontAntiDivePct}%→${targetAd}%, Anti-Squat ${setup.rearAntiSquatPct}%→${targetAs}%`,
        setupPatch: { frontAntiDivePct: targetAd, rearAntiSquatPct: targetAs },
      };
    },
    physicalMechanism:
      'Anti-geometry does not change total longitudinal weight transfer (ΔW_long), but partitions pitch reaction between rigid links (instantaneous) and coil springs. Keeping %AD and %AS in the 20–40% window controls pitch attitude without locking vertical compliance over braking/traction bumps.',
    equationReference: '%AD = (Z_SVIC / X_SVIC) · (L / h_CG) · BFD × 100',
    secondaryTradeoff:
      'Exceeding 45% anti-geometry causes suspension binding and wheel hop over uneven braking zones.',
  },
];

export function solveDiagnosticRecommendations(
  setup: VehicleSetup,
  driver: DriverInputState,
  query: DiagnosticQuery
): RankedAdjustmentRecommendation[] {
  const baselineDriver: DriverInputState = {
    ...driver,
    cornerPhase: query.phase,
    surfaceCondition:
      query.symptom === 'mid_corner_bump_skittishness'
        ? 'curbs_and_bumps'
        : driver.surfaceCondition,
  };

  const baselineSim = simulateVehicleState(setup, baselineDriver);

  const filteredBlueprints = CANDIDATE_BLUEPRINTS.filter((bp) => {
    const matchesSymptom = bp.applicableSymptoms.includes(query.symptom);
    const matchesPhase = bp.applicablePhases.includes(query.phase);
    const matchesScope = query.scopeFilter === 'all' || bp.scope === query.scopeFilter;
    return matchesSymptom && matchesPhase && matchesScope;
  });

  const recommendations: RankedAdjustmentRecommendation[] = [];

  for (const bp of filteredBlueprints) {
    const patchSpec = bp.buildPatch(setup, baselineDriver);
    if (!patchSpec) continue;

    const patchedSetup: VehicleSetup = {
      ...setup,
      ...patchSpec.setupPatch,
    };
    const patchedDriver: DriverInputState = {
      ...baselineDriver,
      ...(patchSpec.driverPatch ?? {}),
    };

    const patchedSim = simulateVehicleState(patchedSetup, patchedDriver);

    const entryDelta = Number(
      (patchedSim.balance.entryScore - baselineSim.balance.entryScore).toFixed(1)
    );
    const midDelta = Number(
      (patchedSim.balance.midScore - baselineSim.balance.midScore).toFixed(1)
    );
    const exitDelta = Number(
      (patchedSim.balance.exitScore - baselineSim.balance.exitScore).toFixed(1)
    );

    const targetDelta =
      query.phase === 'entry'
        ? entryDelta
        : query.phase === 'mid'
        ? midDelta
        : exitDelta;

    const effectivenessScore = Math.min(
      99,
      Math.max(60, Math.round(bp.basePriority + Math.min(8, Math.abs(targetDelta) * 0.9)))
    );

    recommendations.push({
      id: bp.id,
      parameterKey: bp.parameterKey,
      title: bp.title,
      category: bp.category,
      scope: bp.scope,
      directionLabel: patchSpec.directionLabel,
      suggestedSetupPatch: patchSpec.setupPatch,
      suggestedDriverPatch: patchSpec.driverPatch,
      effectivenessScore,
      balanceDeltaInTargetPhase: targetDelta,
      physicalMechanism: bp.physicalMechanism,
      equationReference: bp.equationReference,
      secondaryTradeoff: bp.secondaryTradeoff,
      phaseImpact: {
        entryDelta,
        midDelta,
        exitDelta,
      },
    });
  }

  return recommendations.sort((a, b) => b.effectivenessScore - a.effectivenessScore);
}
