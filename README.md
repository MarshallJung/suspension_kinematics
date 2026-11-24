# Paddock Kinematics

A local, interactive suspension kinematics and vehicle-handling visualizer for track-day learning and setup exploration. Built with **React Native, Expo, and TypeScript**, sharing one deterministic physics engine and state store across Web, iOS, and Android.

Running 100% on-device with zero runtime API calls, the engine combines kinematic suspension geometry (roll-center migration, dynamic camber gain, bump/steer/KPI effects, anti-dive/anti-squat), 3-way low/high-speed transient damper weighting (LS Bump, LS Rebound, HS Bump), coupled small-angle roll and pitch equilibrium (FRSR, TLLTD, transmitted geometric roll reactions, and dynamic roll moment arm `h_roll`), speed-squared aerodynamic downforce, and a non-linear load-sensitive tire friction circle—plus a standalone 3D phase-form arc-sphere spatial linkage solver. Dual synchronized modes let users either explore adjustments in a **Tune setup** sandbox or troubleshoot cornering symptoms in a **Diagnose handling** wizard.

---

## What it does

- **Five Drivetrain Teaching Archetypes (`RR`, `MR`, `FR`, `FF`, `AWD`):** Switch archetypes or independently select front/rear suspension geometry families (`MacPherson`, `Double Wishbone`, `Multilink`).
- **Scenario & Corner-Phase Simulation:** Step across `01 Entry`, `02 Apex`, and `03 Exit`; toggle `Left turn` / `Right turn`; adjust speed, lateral G demand, braking deceleration, trail-brake overlap, throttle acceleration, driver smoothness, and track surface condition (`Smooth Asphalt`, `Bumpy Track`, `Heavy Curbs & Bumps`).
- **Setup Controls (`All changes | Trackside | Shop`):** Tune ARBs, main springs, measured motion ratios, closed-form ride-frequency targets (`solveRideFrequencyTarget`), low/high-speed damper clicks, static camber/toe, caster, Ackermann percentage, tire widths/pressures, nominal roll centers, ride height deltas, anti-dive (`%AD`), anti-squat (`%AS`), brake bias, LSD acceleration/deceleration locks, and aero downforce (`aeroClA`, front aero balance).
- **Non-Destructive A/B Comparison, Diffs & Local Persistence:**
  - Toolbar tracks modified field count (`At pinned baseline` vs `N change(s) vs baseline`), provides **Pin baseline**, **Compare baseline** / **Back to current** A/B toggling (displaying the pinned baseline solid against current edits as the ghost comparison), and **Revert setup** (disabled at baseline).
  - Individual sliders display signed deltas against baseline (`±N vs baseline`) paired with a one-tap **Reset** button; corner phase tabs and the corner inspector surface inline balance, load, grip, and camber deltas.
  - Workspace state (`activeTab`, `themeMode`, `scopeFilter`, `setup`, `driver`, `baselineSetup`) persists automatically across reloads via validated browser `localStorage` (`paddock-kinematics:v1`).
- **Symptom Diagnostic Wizard:** Filters recommendations by `All changes | Trackside | Shop`, computes model-ranked setup changes where a quantitative objective exists (excluding non-improving paths, over-cambered corners `<= -1.6°`, and invalid FWD rear-LSD decel entries), marks unmodeled symptoms explicitly as `CANDIDATE · UNRANKED`, and offers live car **Preview on car** ghost overlays with mechanism equations and tradeoff notes.
- **Responsive Desktop, Mobile & Dual Themes (`Dark` / `Daylight`):**
  - Desktop (`>= 960 px`) renders a side-by-side overview and control workspace; narrow screens (`< 420 px`) automatically switch `ParameterSlider` to a 2-row full-width track layout so units never clip, while interactive controls maintain 44-point minimum touch targets.
  - On mobile scroll, a docked **Mobile Sticky Mini-HUD** appears below the toolbar with tappable corner phase cycling, peak corner grip utilization, live roll angle, active alert badges, and an `↑ Car` jump-to-top action.
  - `Vehicle details` in the profile bar expands a de-duplicated **Platform Summary** card grid and quick Alignment, Tire Sizing, and Ride Frequency presets without duplicating sandbox sliders.

---

## Car views and aerodynamic inputs

The **Vehicle overview** panel renders three synchronized, animated 2D engineering views built with `react-native-svg` (`Dark` `#0C1622` and `Daylight` `#FFFFFF` themes):

1. **Top-Down (`X-Y`):**
   - Switches cleanly across three bundled chassis styles (**`Wireframe | Livery | Vector`**), defaulting to the transparent dual-theme **Mustang GT3 CAD Wireframe** calibrated to all four wheel arches (`FL`, `FR`, `RL`, `RR`), alongside the **GT3 Livery** bitmap and **Vector chassis** SVG silhouette.
   - **Shared force scale** (on by default) scales all four traction circles uniformly so weight transfer and speed-squared aero downforce visibly enlarge/shrink corner grip capacity; toggling it off normalizes each corner independently.
   - **Enhanced tyre view** applies smooth nonlinear `tanh` steering (`3.2×`, capped at `±40°`) and toe (`12×`) exaggeration, subtle anchored camber lean, and 3-zone contact-patch thermal load strips driven by dynamic camber error and hot tire pressure error.
   - **Engineering overlay** draws chassis-integrated control arms, rate-dependent ARB thicknesses, `TLLTD` axle transfer split pills, CG crosshair + diagonal load-transfer vector, and nose/tail `TURN` / `PUSH` / `TAIL ROTATION` handling cues.
2. **Roll & RC (`Y-Z`):**
   - Switchable **Front axle** and **Rear axle** cross-sections backed by dual-theme Mustang GT3 CAD wireframes (with rear lower static tire silhouettes masked cleanly so live cambered tires pivot on `GROUND (z = 0 mm)`).
   - Displays `2.5×` visual body roll around the active Roll Center (`RC`), baseline ghost wireframe comparison, axle ARB, live geometry linkages (`MacPherson`, `Double Wishbone`, `Multilink`), CG height, roll moment arm (`h_roll`), kinematic jacking force vector, per-wheel camber/load bars, and a red subterranean `UNDERGROUND` warning zone when lowering drops dynamic RC below ground.
3. **Pitch & Aero (`X-Z`, nose-LEFT):**
   - Oriented nose-left (`← FRONT · REAR →`) with circular wheel-arch decoupling so the sprung Mustang GT3 wireframe pitches (`5×` visual pitch clarity) and shifts vertically over stationary grounded CAD wireframe wheels without double-wheel ghosting.
   - Displays baseline ghost silhouette, Front/Rear suspension heave travel gauges (`+mm` / `-mm` and axle `lb`), active SVIC `%AD` (front anti-dive) and `%AS` (rear anti-squat) force lines, CG + longitudinal weight-transfer vector (`ΔFz,long`), and speed-scaled Front/Rear aero downforce vectors + Center of Pressure (`Aero CoP`).

### Decorative artwork scope

The Mustang GT3 wireframes and top-down livery in [assets/](file:///Users/marshalljung/Documents/suspension_kinematics/assets/README.md) are illustrative visual layers shared across all teaching profiles. They do not select vehicle-specific dimensions, linkage hardpoints, or measured aero data. All wheel telemetry, linkages, roll centers, and traction circles are computed independently in TypeScript and rendered via React Native SVG.

### Aero & speed workflow

In **Tune setup → Aero & speed**:

1. Set **Downforce reference speed** (the speed quoted with your aero rating).
2. Enter **Rated total downforce** in pounds-force at that speed, then set **Front aero balance (%)**.
3. Adjust **Modeled corner speed** (`mph`); live axle downforce and corner normal loads update immediately via speed-squared scaling (`ρ = 1.225 kg/m³`).

For example, **500 lb at 100 mph** yields **80 lb at 40 mph** and **1,125 lb at 150 mph**. Changing only the reference speed re-expresses the displayed rating while keeping physical `aeroClA` constant; **Set no downforce** sets `aeroClA = 0`. A zero-speed cornering request with nonzero `lateralG` triggers a force-only model warning and is excluded from ranked solver recommendations.

---

## How to interpret the results

**This is an educational quasi-static model with illustrative geometry, tire, and damper profiles.** Regression tests and closed-form checks verify internal mathematical consistency; they do not establish OEM calibration or predictive accuracy for a specific car.

| Output | Current basis |
| --- | --- |
| Static loads, aero normal load, prescribed force demand | Force and moment equations from explicitly selected setup and driver inputs |
| Spring / wheel / ride rates and ride frequency | Constant measured motion ratio (`Kw = Ks × MR²`), series tire compliance, assumed 88% sprung mass fraction |
| Pitch and roll attitude | Small-angle equivalent-body equilibrium with full tire normal-load deflection and transmitted geometric roll reactions (`Ai Gi`); iterated RC profile |
| Roll centers, dynamic camber, tire stiffness and grip | Generic archetype profiles; no measured suspension hardpoints or Pacejka tire coefficients |
| Entry / Exit damper effects | Illustrative phase load-transfer shift (`[-0.12, +0.12]`) and bumpy-surface compliance modifier (`[0.78, 1.0]`); no time integration or shaft-velocity dyno curves |
| Slip angles and handling balance | Bounded empirical illustration; not a fitted Pacejka model or solved steady yaw/slip equilibrium |
| Recommendation ordering | Signed improvement proxy in illustrative balance or driven-wheel demand/capacity reserve (`candidate_only` when unmodeled or saturated/lifted); never probability or confidence |

A traction circle compares **requested resultant force** against **estimated friction capacity** (`μ_eff Fz`). Demand outside the ring indicates saturation rather than a solved sliding trajectory. An unloaded corner (`Fz = 0`) displays `"Unloaded"` with zero capacity and zero `Fx`. Wheel lift and failed small-angle roll equilibrium (`|φ| > 0.25 rad` or nonpositive roll stiffness) raise explicit warnings rather than being treated as valid driving states.

---

## Run locally

Requires Node.js matching `react-native`'s `engines` constraint (`^20.19.4 || ^22.13.0 || ^24.3.0 || >= 25.0.0`, tested locally with Node `v23.7.0`) and `npm` (`package-lock.json` is checked in).

```bash
npm ci
npm run web -- --localhost --port 8081
```

Open [http://localhost:8081](http://localhost:8081) (`--localhost` keeps the dev server bound locally). Stop the server with `Ctrl+C`.

### Verification

```bash
npm run typecheck
npm test
npx expo export --platform web --output-dir /tmp/paddock-web-check
```

- **TypeScript (`tsc --noEmit`):** zero compiler errors.
- **Automated Test Suite (`vitest run` — 7 test files, 67 tests):**
  - Engine physics, aero scaling, pitch/roll equilibrium, force conservation, tire concavity & `0g` symmetry, spatial 3D arc-sphere linkage closure & infeasibility, ride-frequency bounds, and diagnostic solver ranking guards (`src/engine/__tests__/`, 56 tests).
  - Visualizer display geometry, shared force scaling, contact-patch zone symmetry, nose-left pitch sign conventions, and wireframe arch alignment (`src/components/visualizer/__tests__/visualMath.test.ts`, 8 tests).
  - Setup diff counting, signed delta formatting, A/B baseline toggling, and `localStorage` persistence round-trip/validation (`src/store/__tests__/useTuningStore.test.ts`, 3 tests).
- **Web Browser Verification:** Inspected live at desktop (`1280×900`) and mobile (`375×812`) viewports across `Top-Down`, `Roll & RC` (`Front` / `Rear` / `-34 mm` subterranean RC), and `Pitch & Aero` (`Entry` / `Exit`) in both `Dark` and `Daylight` modes with zero console or network errors.

### Mobile targets

```bash
npm run ios
npm run android
# Or start Expo CLI interactively:
npm start
```

Shared React Native components, SVG views, and local PNG assets support iOS and Android via Metro bundling (`<Marker>`-free polygon arrowheads and static `require()` assets). Web bundling and layout checks do not replace native simulator or physical-device QA.

---

## Mathematical implementation

See [docs/notebook_equations.md](docs/notebook_equations.md) for the full equations, sign conventions, assumptions, and operating boundaries. Highlights of the current engine:

- **Aerodynamic Normal Load Isolation:** Downforce (`½ ρ CL A v²`, `ρ = 1.225 kg/m³`) scales axle normal load and tire capacity without altering inertial mass or lateral force demand.
- **Coupled Roll Equilibrium & Transmitted Geometry Reactions:** Per-axle roll stiffness combines springs and tubular/solid ARB stiffness (`Kφ,suspension = Kφ,spring + Kφ,ARB`) in parallel before applying tire roll compliance (`Kφ,tyre`) in series; ground moments include transmitted geometric roll-center reactions (`Ai Gi`) and asymmetric outside/inside jacking (`Fy,out - Fy,in`); invalid/divergent roll equilibrium saturates safely at `±0.25 rad` and flags `roll_equilibrium`.
- **Single-Counted Camber & Separated Tire Compliance:** Dynamic camber combines `1:1` rigid-body chassis roll relative to ground, FVSA bump camber gain from suspension articulation, caster/KPI steer geometry, and realistic cornering targets (`-1.5°` outside / `-0.5°` inside, tapering smoothly to `0°` at `0g`). Tire vertical deflection separates cleanly from suspension-arm `Δz_susp` RC migration, and `0°` Ackermann singularities and signed toe conventions are continuous.
- **Pitch, Anti-Dive & Anti-Squat:** Axle heave separates spring elastic fractions (`Ei`) from full tire normal-load deflection (`ΔFnormal,i`); IRS anti-squat incorporates loaded wheel radius (`330 mm`) relative to the ground-referenced solid-axle case.
- **Strictly Monotonic Concave Tire Curve & Symmetry:** Blended power/hyperbolic load-sensitivity curve stays monotonically increasing and globally concave across extreme loads; straight-line (`0g`) cornering is strictly symmetric left/right; LSD deceleration lock acts only on driven axles and unloaded corners carry zero `Fx`.
- **Solver & Recommendation Guards:** `solveRideFrequencyTarget(targetHz, setup, axle)` returns requested/achieved frequencies, spring bounds (`25–320 N/mm`), `status`, and `limitReason`. `trySolveDoubleWishboneArcSphere(parameters)` checks unit-invariant closure residuals, left/right side orientation, and continuous branch tracking (`previousThetaUpperRad`).

---

## Sources and assumption traceability

| Area | Primary reference or derivation | What is established here / what remains assumed |
| --- | --- | --- |
| Vehicle force and yaw equations | [MathWorks Vehicle Body 3DOF](https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html); [Gillespie, official SAE text description](https://saemobilus.sae.org/books/fundamentals-vehicle-dynamics-revised-edition-r-506) | Equilibrium identities are independently tested. This app does not implement the complete referenced dynamic model. |
| Suspension geometry and installation ratios | [Dixon, *Suspension Geometry and Computation*](https://onlinelibrary.wiley.com/doi/book/10.1002/9780470682906), [installation-ratio chapter](https://onlinelibrary.wiley.com/doi/10.1002/9780470682906.ch14) | Geometry scope and source identity are traceable. Live camber/roll-center profile constants are project assumptions, not claimed book coefficients. |
| Wheel, ride, pitch and roll stiffness | Virtual work, series springs and small-angle moment balance | Constant ratios, rigid body and linearized springs/tires; measured motion-ratio curves, compliance and unsprung mass dynamics are absent. |
| Measured model inputs | [Milliken Research modelling approach](https://millikenresearch.com/programs.html) and [*Race Car Vehicle Dynamics*](https://www.millikenresearch.com/rcvd.html) | Quantitative vehicle predictions require measured vehicle/tire/kinematic inputs. No OEM calibration dataset is supplied. |
| Tire load sensitivity and combined slip | [Pacejka third-edition companion](https://shop.elsevier.com/books/book-companion/9780080970165); [MathWorks Combined Slip Wheel CPI](https://www.mathworks.com/help/vdynblks/ref/combinedslipwheelcpi.html) | The friction-circle model is an explicit simplification; section width, pressure/camber curves and slip gains are illustrative, not fitted Magic Formula coefficients. |
| Practical tuning mechanisms | [Carroll Smith, *Tune to Win*](https://www.carrollsmith.com/books/tune2win.html) | Practical foundation for discussing directional balance mechanisms, not evidence of universal optima. |
| Damper clicks and anti-geometry compliance | Project assumptions in `transientDampers.ts` and `kinematics.ts` | No manufacturer-specific click/force dyno curves or universal anti-geometry thresholds are claimed. |

Foundational bibliography: Milliken & Milliken, *Race Car Vehicle Dynamics* (1995); Dixon, *Suspension Geometry and Computation* (2009); Gillespie, *Fundamentals of Vehicle Dynamics* (1992); Carroll Smith, *Tune to Win* (1978); Pacejka, *Tire and Vehicle Dynamics*, third edition (2012).

The repository's legacy PDF and earlier diagram assets remain historical background material and may contain superseded formulas; use the TypeScript engine, regression test suite, and [docs/notebook_equations.md](docs/notebook_equations.md) as the current specification.

---

## Project layout

```text
App.tsx                              Shared responsive shell, toolbar A/B toggle & mobile mini-HUD
assets/                              Bundled GT3 livery + 10 dual-theme Mustang GT3 CAD wireframes
src/components/common/               Responsive ParameterSlider & platform RangeControl (.tsx / .web.tsx)
src/components/visualizer/           Top-Down, Roll & RC, Pitch & Aero SVGs, TyreGlyph, animations & bars
src/components/visualizer/__tests__/ Visualizer geometry, force-scale, pitch-sign & alignment tests
src/screens/                         SandboxTuningScreen & SymptomWizardScreen
src/store/                           Zustand tuning store (useTuningStore.ts) & persistence.ts
src/store/__tests__/                 Baseline diff, A/B compare & localStorage persistence tests
src/theme/                           Dark & Daylight color palettes (colors.ts)
src/utils/                           Setup diff counter & signed delta formatters (setupDiff.ts)
src/engine/                          Pure TypeScript kinematics, load transfer, tire, aero, dampers & solver
src/engine/__tests__/                Core engine and physics/solver regression suites
docs/notebook_equations.md           Current equations, sign conventions, assumptions & limits
```
