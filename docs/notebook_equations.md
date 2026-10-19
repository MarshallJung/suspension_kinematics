# Implemented equations, assumptions and limits

This notebook describes the current TypeScript engine. It distinguishes algebraic constraints from illustrative project coefficients. It does not certify an individual vehicle or claim that every formula/constant was taken from a cited textbook.

## 1. Coordinates and units

For the standalone spatial linkage helper, use a right-handed Cartesian frame: **X forward, Y left, Z up**. Input point coordinates must use one common length unit. The helper orients positive arm rotation to give an initially upward radial tangent when defined. It is not a complete upright/steering/tie-rod model.

The live model uses named FL/FR/RL/RR corners. `lateralG` is the nonnegative cornering-demand magnitude; `turnDirection` determines inside/outside. In a left turn, FR/RR are outside. The planar force-allocation calculation uses right-positive lateral force/yaw signs; these planar signs are separate from the standalone helper's 3D coordinate convention. Positive `netAxG` is acceleration; negative is braking. Positive suspension travel is bump/compression. Positive pitch is nose-up. The screen uses pixel X right and Y down; screen vectors are display mappings, not the 3D frame. No SAE-coordinate-compliance claim is made.

The engine stores N, N/mm, mm, kg, degrees, km/h and G multiples, with explicit conversions to N/m, m, radians and m/s where required. Display conversions include lbf, lb/in and mph. An acceleration named `AxG` or `AyG` is dimensionless; physical acceleration is `g × AG`, with `g = 9.81 m/s²`.

## 2. Mass, driver requests and normal loads

Let `m` be total mass, `W = mg`, `wf` front static weight fraction, `L` wheelbase and `h` the ride-height-adjusted CG height.

```text
Wf = wf W                          Wr = (1 − wf) W
Entry: AxG = −brakingG × overlap/100
Apex:  AxG = 0
Exit:  AxG = throttleG
AyG = requested lateralG
D = ½ ρ (CL A) v²                  ρ = 1.225 kg/m³
Df = aeroFrontFraction × D         Dr = D − Df
ΔFz,long = W × AxG × h/L
Fz,f = Wf + Df − ΔFz,long
Fz,r = Wr + Dr + ΔFz,long
```

Braking at zero overlap has zero longitudinal demand in the corner-entry scenario. Phase labels do not integrate elapsed time or driver controls. Aero balance sets the axle split of downforce. There is no lateral aerodynamic force or drag/powertrain performance model.

Anti-geometry does not change these total axle-load equations at fixed inputs. The simplified elastic fractions are applied only to front braking (`1 − AD/100`) or rear acceleration (`1 − AS/100`); the other axle's applicable fraction is one. The model does not include every front/rear anti-lift or anti-pitch force path.

## 3. Spring, tyre, ride rate and frequency

The stored motion ratio is **actual axial spring travel / vertical wheel travel**, so its installation projection is already included:

```text
Kw = Ks MR²
Kride = Kw Kt / (Kw + Kt)
ms,corner = 0.5 × m × axleWeightFraction × 0.88
fn = √(1000 Kride / ms,corner) / (2π)
```

The retained spring-inclination property is legacy geometry metadata; the engine does not multiply measured MR by a second sine factor. The rate is a local tangent approximation with constant MR and no preload/geometric-rate derivative. The 0.88 sprung fraction is assumed, not measured. The frequency is a low-frequency single-mode approximation, not the eigenvalues of a two-mass quarter-car system.

The vertical tyre-rate illustration is:

```text
P = clamp(pressurePSI, 18, 50)
Kt [N/mm] = 240 × (0.55 + 0.45 P/32) × (0.82 + 0.18 widthMM/255)
```

This pressure/width relationship is a project assumption. It requires tyre-specific load/deflection data for quantitative use.

### Target inversion and limits

```text
Kride,target = (2π ftarget)² ms,corner / 1000
Kw,target = Kride,target Kt / (Kt − Kride,target)
Ks,target = Kw,target / MR²
```

A finite positive solution requires `Kride,target < Kt`. `solveRideFrequencyTarget` returns attained frequency and the bounds resulting from the allowed **25–320 N/mm** springs. It reports minimum-spring, maximum-spring or tyre-stiffness limitation. It rejects invalid inputs. Feasible targets are solved without silently clipping the target or adding an installation-angle factor.

## 4. Roll stiffness and roll equilibrium

Convert N/mm rates to N/m and Nm/degree ARB rates to Nm/radian. Use metres for tracks, roll-centre/CG heights and lever arms in this section’s moment equations; the implementation explicitly converts its stored mm values. For axle track `t`:

```text
Kφ,spring = ½ (1000 Kw) t²
Kφ,suspension = Kφ,spring + Kφ,ARB
Kφ,tyre = ½ (1000 Kt) t²
Aaxle = Kφ,tyre / (Kφ,suspension + Kφ,tyre)
Kφ,axle = Aaxle Kφ,suspension
Kφ,total = Kφ,front + Kφ,rear
FRSR = Kφ,front / Kφ,total
```

Tyre roll compliance acts **in series with the complete spring-plus-ARB suspension**. Adding an ARB after putting only the springs in series with the tyre would bypass part of that tyre compliance. Reported front/rear spring and ARB roll contributions are apportioned through the same series transmission factor.

The live geometry profile provides front/rear roll-centre heights. The CG lies `(1 − wf)L` behind the front axle, hence:

```text
zaxis,CG = wf zRC,front + (1 − wf) zRC,rear
hroll = hCG,effective − zaxis,CG
Gf = W wf AyG zRC,f              Gr = W (1 − wf) AyG zRC,r
(Kφ,total − W hroll) φ = W AyG hCG,effective − (Af Gf + Ar Gr)
```

Here `Gi` is the direct geometric moment at axle `i`, and `Ai` is that axle's series transmission factor. Geometric load transfer compresses the tyre even though it bypasses the main spring, so the ground-reaction moment and chassis roll require the transmitted geometric terms. In the rigid-tyre limit, `Ai → 1` and the right-hand side reduces to `W AyG hroll`; that familiar limit is not the finite-tyre equation implemented here.

The `W hroll φ` term is the small-angle gravity moment from lateral CG displacement in this equivalent rigid-body approximation. The implementation uses total mass for the equivalent body; it does not separately solve sprung/unsprung roll dynamics. Its roll subsystem uses nominal axle lateral forces `W wf AyG` and `W (1 − wf) AyG`, rather than feeding the differential-induced yaw-allocation correction in section 6 back into roll. There is no unexplained `0.45` stiffness multiplier or minimum 40 mm roll arm.

Because the assumed roll-centre profile changes with heave and roll, the engine iterates the equilibrium. Nonpositive effective stiffness, excessive roll for the small-angle approximation, or nonconvergence is reported as an invalid roll-equilibrium request.

For front elastic roll fraction `q`, let `Melastic = Kφ,total φ`:

```text
Mground,f = q Melastic + Af Gf
Mground,r = (1 − q) Melastic + Ar Gr
ΔFz,lat,f = Mground,f / tf
ΔFz,lat,r = Mground,r / tr
TLLTDf = ΔFz,lat,f / (ΔFz,lat,f + ΔFz,lat,r)
```

In steady Apex, `q = FRSR`. Entry/Exit add a labelled illustrative damper shift, bounded to keep `q` in `[0,1]`. This adds equal/opposite changes to front/rear ground moments and preserves their sum. The geometric roll-centre reaction bypasses the main springs but still acts through tyre compliance; ARB reaction is not treated as main-spring force.

### Corrected roll-axis example

With `wf = 0.38`, front/rear RCs `38/72 mm` and CG `465 mm`:

```text
zaxis = 0.38 × 38 + 0.62 × 72 = 59.08 mm
hroll = 465 − 59.08 = 405.92 mm
```

Keeping the historical example's stated lowered CG `441.2 mm` and RCs `−25/36 mm` gives `zaxis = 12.82 mm`, `hroll = 428.38 mm`: an increase of `22.46 mm` or `5.53%`. These values illustrate interpolation; whether a real lowered car follows those RCs or develops understeer requires actual geometry and tyre evidence.

## 5. Pitch and suspension travel

Let `sf` and `sr` be the applicable longitudinal spring fractions from section 2:

```text
Ef = Df − ΔFz,long sf             Er = Dr + ΔFz,long sr
ΔFnormal,f = Df − ΔFz,long        ΔFnormal,r = Dr + ΔFz,long
bodyCompressionF [mm] = Ef/(2 Kw,f) + ΔFnormal,f/(2 Kt,f)
bodyCompressionR [mm] = Er/(2 Kw,r) + ΔFnormal,r/(2 Kt,r)
θpitch [rad] = (bodyCompressionR − bodyCompressionF) / Lmm
```

The springs see the elastic fraction `Ei`, while the tyres see the **full normal-load change**, including any load routed through anti-geometry links. Only when the spring and tyre receive the same load can these two deflections be replaced by a single series ride-rate expression.

This solves axle heave before calculating pitch. With no anti-geometry, four equal per-wheel ride rates `k` and a symmetric wheelbase, moment balance gives `Kpitch = 4 k(L/2)² = kL²`, rather than `kL²/4`. Asymmetric rates and aero are handled through the respective axle deflections.

Main-suspension travel excludes tyre compression:

```text
heaveTravel,i [mm] = Ei / (2 Kw,i)
rollTravel,i [mm] = (φ − Mground,i/Kφ,tyre,i) × trackMM,i/2
outsideTravel,i = heaveTravel,i + rollTravel,i
insideTravel,i  = heaveTravel,i − rollTravel,i
```

The relative suspension-roll angle is chassis roll minus tyre roll. Thus geometric reaction affects tyre deflection and relative suspension angle, without being mislabelled as main-spring force. Dynamic camber uses this suspension travel plus the explicitly assumed geometry gains.

## 6. Tyre force demand, capacity and unloading

Without lateral aero, total requested lateral force obeys:

```text
Σ Fy,demand = m g AyG
Σ Fx,demand = m g AxG
```

Downforce is not added to inertial demand. Longitudinal demand follows selected brake/drive splits and a labelled illustrative differential-lock allocation. With `s = −1` for a left turn and `+1` for a right turn, the magnitude allocation is:

```text
Mz,Fx = tf/2 (Fx,FL − Fx,FR) + tr/2 (Fx,RL − Fx,RR)
Fy,demand,f = wf m g AyG − Mz,Fx/(s L)
Fy,demand,r = m g AyG − Fy,demand,f
```

This satisfies the selected planar yaw moment balance. Forces are treated in vehicle axes; a complete steered-tyre coordinate transformation and solved lateral/yaw state are not included. Tyre demands remain requests rather than forces guaranteed achievable by the available tyres.

The project tyre illustration combines a load-sensitivity power law, a tyre-width nominal-load assumption, pressure/camber efficiency factors and a surface/compliance factor. The width exponent, nominal reference, efficiency curves and slip polynomials have no supplied experimental fit. A wider section is not a universal law for proportionally larger contact-patch area or tyre load rating. This is **not a fitted Pacejka Magic Formula model**.

With the selected isotropic friction-circle estimate:

```text
Fmax = μeffective Fz
Fy,reserve = √max(0, Fmax² − Fx,demand²)
u = √(Fx,demand² + Fy,demand²) / Fmax
```

There is no minimum 20% lateral reserve when longitudinal demand already exceeds capacity. Utilization can exceed 100%; saturation is reported. At `Fz = 0`, capacity is zero and utilization is displayed as unloaded/undefined, not usable grip. Slip curves are bounded illustrations; saturation does not produce a solved steady sliding angle.

At ordinary four-contact states, per-axle normal load is split as `Fz,axle/2 ± ΔFz,lat`. If this requests a negative contact load, the display sets the unloaded corner to zero and marks the request outside the four-contact model. Axle-lift display loads are renormalized to preserve the total normal load. These display limits are not a solved three-contact/rollover response and cannot establish that the requested acceleration is achievable.

## 7. Illustrative geometry and damper profiles

Live camber and roll-centre calculations use the generic profiles in `archetypes.ts`. Their camber gains, roll-loss factors, migration rates and lowering thresholds are **assumptions**. They are not inferred from the suspension-type name, and the standalone spatial solver is not wired into live telemetry. Measured hardpoints or validated travel/steer tables are required for a vehicle-specific geometry model.

`transientDampers.ts` maps generic 1–20 settings to a firmness/damping-ratio illustration and phase-based load-distribution/compliance modifiers. More clicks means firmer **within this model**; actual damper adjustment conventions and force/velocity curves vary. There is no time integration, wheel-hop calculation, yaw-response transient, measured shaft velocity, damper temperature or manufacturer calibration.

No universal 25–35% anti-geometry optimum or binding threshold is established. Any remaining numeric threshold inside a generic compliance modifier is a project assumption with no claim of general physical applicability.

## 8. Spatial helper and recommendation interpretation

The wishbone helper intersects the upper ball-joint circle with the sphere centred on the current lower ball joint whose radius is the rigid upright length. Its scalar constraint is:

```text
A cos(θupper) + B sin(θupper) + C = 0
```

The phase solution `R cos(θupper − atan2(B,A)) = −C`, with `R = hypot(A,B)`, covers the ordinary intersection, tangency, the former half-angle linear case, and the solution at `θ = π`. Feasibility, degenerate axes and finite inputs are checked. The closest periodic solution to the supplied preceding angle follows the assembly branch. A solved result must satisfy the upright-length residual tolerance. Underdetermined intersections are identified; infeasible states do not return fabricated geometry.

Recommendation ranking uses the same visible setup, phase, surface and driver scenario as Preview/Apply. No-op patches are excluded. Understeer/oversteer guidance ranks a signed improvement toward neutral in the illustrative balance score; a patch that worsens the symptom or overshoots the opposite limit is excluded. Exit-traction guidance uses a declared worst-driven-wheel demand/capacity proxy. Turn-in response, transient braking stability and bump-contact-force variation are not simulated objectives; related guidance remains unranked investigation candidates. Internal ordering scores are never probabilities.

## 9. Traceability and validation boundary

The [README source table](../README.md#sources-and-assumption-traceability) links official author/publisher material, Milliken's measured-input modelling approach and official vehicle/tyre implementation references. Those sources establish useful principles and source identity, not experimental validation of this project's constants. The original PDF and historical diagrams can contain superseded claims and are not an authority for the revised engine.

Regression tests verify the encoded algebraic constraints, boundary behaviour, signed recommendation benefit and scenario consistency. Real-vehicle calibration still requires tyre force/deflection data, suspension travel/steer geometry, actual corner weights, mass properties, ARB rates and damper force/velocity measurements, with operating ranges recorded. Native iOS/Android execution remains separate from web verification.


## 10. User downforce ratings and display-only projection

`src/engine/aero.ts` converts a force rating and a positive reference speed into the single physical aero parameter:

```text
ClA = Dref / (0.5 ρ vref²)
D(v) = 0.5 ρ ClA v² = Dref (v/vref)²
ρ = 1.225 kg/m³; v and vref in m/s; D in N
```

The interface accepts pounds-force and mph, converts internally, and preserves `aeroClA` when merely changing the displayed reference speed. The front/rear split allocates this normal force to the axles before the existing transfer calculation. Neither mass nor prescribed inertial force demand changes. Tests cover inverse conversion, reference invariance, speed-squared ratios, zero aero, axle/wheel conservation and unchanged lateral inertia. A zero-speed lateral-G request receives an explicit model-range warning and is excluded from quantitative recommendation ranking.

The artwork, steering gain (5×), toe gain (12×), ±42° display cap, projected camber sidewall and rate-dependent ARB strokes are diagram conventions. They are never inputs to load, geometry, tyre-force or recommendation calculations. The enhanced drawing evaluates zero-toe geometric steering separately so a near-straight telemetry clamp cannot distort the exaggerated toe offset. Numerical telemetry remains the original model output.
