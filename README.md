# Paddock Kinematics

A local, interactive suspension and handling visualizer for track-day explanations and setup exploration. The application uses **React Native, Expo and TypeScript**, with a shared engine and state store for web, iOS and Android.

The current iteration focuses on the web interface: an overhead vehicle view, all four tyre corners, explicit force-demand displays, and setup comparisons. The React Native application structure remains intact for future mobile work. Native builds and on-device behaviour still require separate verification.

## What it does

- Explore rear-engine, mid-engine, front-engine RWD, FWD and AWD teaching archetypes.
- Select Entry, Apex or Exit; change turn direction, lateral G, braking, throttle, trail-brake overlap, surface and input smoothness.
- Adjust springs, measured motion ratios, anti-roll bars, alignment, tyre width/pressure, nominal roll centres, ride height, anti-geometry, differential settings and aero.
- Inspect each corner's normal load, requested tyre forces, capacity utilization, illustrative camber/slip and suspension travel.
- Pin a setup baseline, preview a candidate change, apply it, revert or reset.
- Use symptom guidance with trackside/shop filtering. Quantitatively ranked changes must improve the model's declared objective; symptoms without a simulated objective remain unranked investigation candidates.

## Car view and aerodynamic inputs

The overview uses the supplied custom-painted car artwork, with all four tyres and force plots rendered independently. **Enhanced tyre view** exaggerates steering, toe and projected camber for visibility; switching it off restores the actual displayed heading. These display gains do not alter the engine. The selected-corner inspector retains numerical angle estimates.

**Show engineering overlay** reveals high-contrast CG and anti-roll-bar graphics plus a separate key. Front and rear bar thicknesses track their respective stiffness inputs on one shared visual scale. Thickness is an illustration of stiffness, not a physical bar diameter.

In **Tune setup → Aero & speed**:

1. Choose the reference speed quoted with your aero data.
2. Enter the total downforce in pounds-force at that speed, then set the front aero balance.
3. Set the modeled corner speed. The live summary and all four tyre loads update immediately.

For example, **500 lb at 100 mph** gives **80 lb at 40 mph** and **1,125 lb at 150 mph**. Changing only the reference speed re-expresses the rating without altering the current aero configuration; enter a new rated force to change the configuration. **Set no downforce** supports an aero-free comparison. Factory/profile values are illustrative and do not identify a particular production model's aero package.

This constant-coefficient model uses air density 1.225 kg/m³ and speed-squared scaling. Drag, aero pitching moments, moving centre of pressure and ride-height/stall effects are not solved. Speed and lateral G are independent requests; speed also affects geometric steering. A zero-speed lateral-G request is explicitly flagged as a force-only scenario rather than a realizable stationary corner.

## How to interpret the results

**This is an educational quasi-static model with illustrative geometry, tyre and damper profiles.** Correct equations and regression constraints improve internal consistency; they do not establish vehicle-specific predictive accuracy.

| Output | Current basis |
| --- | --- |
| Static loads, aerodynamic normal load, prescribed force demand | Force and moment equations, with explicitly selected setup and driver inputs |
| Spring/wheel/ride rates and approximate ride frequency | Constant measured motion ratio, series tyre compliance, assumed 88% sprung mass |
| Pitch and roll attitude | Small-angle equivalent-body equilibrium with full tyre normal-load deflection and transmitted geometric roll reactions; geometry profile migration is iterated with roll |
| Roll centres, dynamic camber, tyre stiffness and grip | Generic archetype assumptions; no measured hardpoints or tyre test data |
| Entry/Exit damper effects | Illustrative phase modifiers; no time integration, shaft-velocity curves or measured damping coefficients |
| Slip angles and handling balance | Bounded empirical illustration; not a fitted Pacejka model or a solved yaw/slip equilibrium |
| Recommendation ordering | Improvement in illustrative balance or a driven-wheel demand/capacity proxy; never confidence or probability |

A traction circle compares **requested force with estimated capacity**. A demand outside the circle means the requested condition is beyond that estimate; the app has not solved the resulting sliding motion. An unloaded tyre has zero normal load and zero capacity. Wheel/axle lift and failed small-angle roll equilibrium are reported as outside the model rather than treated as validated driving states.

The five archetypes are generic examples, not manufacturer geometry or approved setups. Preset names do not certify factory alignment limits, tyre fitment, brake balance, aero characteristics or mechanical compatibility for an individual car.

## Run locally

Use Node.js **24.3 or newer in the 24.x line**, or another version satisfying the installed React Native package's `engines` constraint, plus npm.

```bash
npm ci
npm run web -- --localhost --port 8081
```

Stop the development server with Ctrl+C when finished.

Open [http://localhost:8081](http://localhost:8081). `--localhost` keeps the development server on the local machine. Run from the repository directory. The app's calculation engine makes no runtime API calls; package installation and Expo development tooling may use the network.

If using an existing pnpm-managed local installation, `pnpm run web --localhost --port 8081` can run the same Expo script. Use one package manager consistently when maintaining dependencies; `package-lock.json` is the checked-in npm lockfile.

### Verification

```bash
npm test
npm run typecheck
```

Regression tests exercise force conservation, pitch/roll equilibrium, zero-load and saturation boundaries, geometry closure and infeasibility, ride-frequency limits, and recommendation direction/scenario consistency. Passing those checks establishes the tested properties, not measured agreement with a real vehicle.

The revised controls use native HTML range inputs on web and a React Native `PanResponder`/accessibility implementation on native. Numeric entry and labelled +/- buttons remain available on both. The car artwork is bundled locally with independent wheel and force overlays. Numeric controls use 44-point targets; native sliders distinguish horizontal adjustments from vertical scrolling, and the root layout uses shared safe-area handling. Phone browser layouts were checked at 320/390-pixel portrait widths and 844 × 390 landscape. Native gesture/device acceptance is still pending.

### Mobile development remains available

```bash
npm run ios
npm run android
# Or start the Expo development server:
npm start
```

These targets retain the shared React Native components and engine. They require the appropriate native development environment or an Expo client compatible with the project's SDK. JavaScript exports for iOS, Android and web compile successfully. This is not a native binary build or device test; native gestures, asset rendering, accessibility and physical-device layouts still require verification before a mobile release.

## Mathematical implementation

See [docs/notebook_equations.md](docs/notebook_equations.md) for equations, sign conventions, implementation assumptions and limits.

The main corrections in the local iteration are:

- Downforce changes tyre normal load and capacity, not inertial lateral demand.
- Per-axle roll stiffness combines springs and ARB before applying tyre roll compliance in series; ground moments include tyre-transmitted geometric reactions.
- Pitch follows front/rear heave deflections; roll follows the stated equilibrium without an unexplained stiffness multiplier.
- Anti-dive/anti-squat affect the applicable longitudinal spring reaction, not total axle load transfer. Tyres still receive the full normal-load change, including loads routed through the links.
- Measured axial spring/wheel motion ratio already includes installation angle: `Kw = Ks × MR²`.
- Combined-slip lateral reserve falls to zero when longitudinal demand reaches the selected friction-circle envelope.
- Frequency inversion reports attained frequency and spring/tyre limits instead of silently claiming an unattained target.
- The standalone wishbone solver reports infeasible/invalid states, verifies upright closure and supports branch continuity. **The live geometry display still uses labelled illustrative profiles.**

### Detailed solver APIs

`solveRideFrequencyTarget(targetHz, setup, axle)` returns requested and achieved frequency, spring rate, attainable bounds, `status`, and `limitReason`. The numeric `solveSpringRateForTargetRideFreqHz` wrapper remains available.

`trySolveDoubleWishboneArcSphere(parameters)` returns `solved`, `invalid` or `infeasible`. A solved result includes a closure residual and can follow `previousThetaUpperRad` during a travel sweep. The compatibility wrapper `solveDoubleWishboneArcSphere` throws for an invalid/infeasible request instead of fabricating a solution.

## Sources and assumption traceability

| Area | Primary reference or derivation | What is established here / what remains assumed |
| --- | --- | --- |
| Vehicle force and yaw equations | [MathWorks Vehicle Body 3DOF](https://www.mathworks.com/help/vdynblks/ref/vehiclebody3dof.html); [Gillespie, official SAE text description](https://saemobilus.sae.org/books/fundamentals-vehicle-dynamics-revised-edition-r-506) | Equilibrium identities are independently tested. This app does not implement the complete referenced dynamic model. |
| Suspension geometry and installation ratios | [Dixon, *Suspension Geometry and Computation*](https://onlinelibrary.wiley.com/doi/book/10.1002/9780470682906), [installation-ratio chapter](https://onlinelibrary.wiley.com/doi/10.1002/9780470682906.ch14) | Geometry scope and source identity are traceable. Live camber/roll-centre profile constants are project assumptions, not claimed book coefficients. |
| Wheel, ride, pitch and roll stiffness | Virtual work, series springs and small-angle moment balance, derived in the notebook | Constant ratios, rigid body and linearized springs/tyres; measured motion-ratio curves, compliance and separate unsprung dynamics are absent. |
| Measured model inputs | [Milliken Research modelling approach](https://millikenresearch.com/programs.html) and [*Race Car Vehicle Dynamics*](https://www.millikenresearch.com/rcvd.html) | Quantitative vehicle predictions require measured vehicle/tyre/kinematic inputs. Such a calibration set is not supplied. |
| Tyre load sensitivity and combined slip | [Pacejka third-edition companion](https://shop.elsevier.com/books/book-companion/9780080970165); [MathWorks Combined Slip Wheel CPI](https://www.mathworks.com/help/vdynblks/ref/combinedslipwheelcpi.html) | The friction-circle model is an explicit simplification. Width exponent, pressure/camber efficiencies and slip curves are not fitted Magic Formula coefficients. |
| Practical tuning mechanisms | [Carroll Smith, *Tune to Win*](https://www.carrollsmith.com/books/tune2win.html) | A practical foundation for discussing mechanisms, not evidence of a universal optimum or a guaranteed remedy. |
| Damper clicks and anti-geometry compliance | Project assumptions in `transientDampers.ts` | No manufacturer-specific click/force curves or universal anti-geometry thresholds are validated. |

Foundational bibliography: Milliken & Milliken, *Race Car Vehicle Dynamics* (1995); Dixon, *Suspension Geometry and Computation* (2009); Gillespie, *Fundamentals of Vehicle Dynamics* (1992); Carroll Smith, *Tune to Win* (1978); Pacejka, *Tire and Vehicle Dynamics*, third edition (2012). Accessible author/publisher material and implementation references were consulted; this is not a page-by-page verification of all five full books.

The repository's original engineering-framework PDF and historical SVG diagrams remain background material. They can contain earlier formulas, coefficients or claims and are not the current executable specification. Use the code, regression tests and current notebook together.

## Project layout

```text
App.tsx                         Shared React Native application layout
src/components/visualizer/      Vehicle overview, setup and scenario controls
src/components/common/          Reusable parameter controls
src/screens/                    Symptom guidance and tuning sandbox
src/store/useTuningStore.ts      Setup, driver, comparison and preview state
src/engine/                     Pure TypeScript calculation and guidance modules
src/engine/__tests__/           Original tests and independent regression constraints
docs/notebook_equations.md      Current equations, assumptions and limits
```
