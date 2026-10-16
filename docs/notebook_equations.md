# Canonical Mathematical & Kinematic Specification

This document synthesizes the deterministic equations and rules from **`Comprehensive Engineering Framework for Race Car Suspension Kinematics, Dynamics, and Computational Modeling.pdf`** (Milliken & Milliken *RCVD*, Dixon, Gillespie, Carroll Smith, and Pacejka) together with the transient damper, drivetrain/differential, aerodynamic, and driver-input extensions required for a complete trackside tuning model.

---

## 1. Coordinate Systems & Spatial Kinematics (SAE J670 / Inverted Z)

- **Chassis Reference Frame ($C_{xyz}$):**
  - $+X$: Horizontally forward along longitudinal centerline
  - $+Y$: Laterally to the right side of the vehicle
  - $+Z$: Vertically upward (computational kinematic solver convention)
- **Upright Local Frame ($U_{xyz}$):**
  - Governed by spatial orientation angles: **Camber ($\gamma$)**, **Caster ($\nu$)**, **Kingpin Inclination / SAI ($\theta_{\text{KPI}}$)**, and **Toe ($\delta_T$)** + **Steer Angle ($\delta$)**.
- **Homogeneous Transformation ($SE(3)$) & Parametric Arc-Sphere Solver:**
  - Outboard ball joints follow circular arcs around inboard pivot axes $\hat{\mathbf{a}} = \frac{\mathbf{p}_{in2} - \mathbf{p}_{in1}}{\|\mathbf{p}_{in2} - \mathbf{p}_{in1}\|}$:
    $$\mathbf{p}(\theta) = \mathbf{c} + R(\mathbf{u}\cos\theta + \mathbf{v}\sin\theta)$$
  - Upright kingpin length constraint $\|\mathbf{p}_{ubj}(\theta_u) - \mathbf{p}_{lbj}(\theta_l)\|^2 - L_{kp}^2 = 0$ expands to:
    $$A\cos\theta_u + B\sin\theta_u + C = 0$$
  - Solved analytically via the **Weierstrass substitution** $t = \tan(\theta_u / 2)$:
    $$(C - A)t^2 + 2Bt + (C + A) = 0 \implies t = \frac{-B \pm \sqrt{B^2 - (C^2 - A^2)}}{C - A}, \quad \theta_u = 2\arctan(t)$$

---

## 2. Fundamental Kinematic Parameters & Steering Geometry

### 2.1 Dynamic Camber ($\gamma_{\text{dyn}}$)
The instantaneous camber angle of a wheel relative to the road surface combines static camber ($\gamma_0$), bump camber gain ($d\gamma/dz$), chassis roll camber coefficient ($d\gamma/d\phi$), and steering-induced camber from caster ($\nu$) and KPI ($\theta_{\text{KPI}}$):

$$\gamma_{\text{dyn,out}} = \gamma_0 + \left(\frac{d\gamma}{dz}\right)\Delta z_{\text{bump}} + \left(\frac{d\gamma}{d\phi}\right)\phi - \nu\sin|\delta_o| + \theta_{\text{KPI}}(1 - \cos|\delta_o|)$$

- **Suspension Archetype Characteristics:**
  - **Double Wishbone:** Shorter, inward-inclined upper control arm yields strong negative camber gain in bump ($d\gamma/dz < 0$, compensating for body roll $\phi$).
  - **MacPherson Strut:** Limited camber recovery in bump; sensitive to ride-height over-lowering (when the lower control arm passes horizontal, roll center drops rapidly underground and camber recovery degrades).
  - **Multi-Link (5-Link):** Tunable virtual instant centers providing controlled camber recovery and toe compliance control (e.g., Porsche Weissach / 5-link rear).

### 2.2 Front View Swing Arm ($L_{\text{FVSA}}$) & Roll Center Height ($z_{\text{rc}}$)
- Extending the upper and lower control arm projections in front view defines the Instant Center (IC) at horizontal distance $L_{\text{FVSA}}$ from the contact patch.
- The line from the tire contact patch center through the IC intersects the vehicle centerline at the **Kinematic Roll Center Height ($z_{\text{rc},f}, z_{\text{rc},r}$)**:
  $$z_{\text{rc}} = z_{\text{IC}} \cdot \frac{t / 2}{L_{\text{FVSA}}}$$
- **Roll Moment Arm ($h_{\text{roll}}$):**
  $$z_{\text{rc,CG}} = \frac{b \cdot z_{\text{rc},f} + a \cdot z_{\text{rc},r}}{L}, \quad h_{\text{roll}} = h_{\text{CG}} - z_{\text{rc,CG}}$$
- **Tradeoff (Jacking Forces):** Raising $z_{\text{rc}}$ closer to $h_{\text{CG}}$ reduces the roll moment arm $h_{\text{roll}}$ and body roll $\phi$, but steep control arm angles generate vertical **jacking forces** ($F_{z,\text{jack}} = F_y \cdot \frac{z_{\text{rc}}}{t/2}$) that lift the sprung mass during cornering.

### 2.3 Steering Geometry & Ackermann
- **Pure Geometric Ackermann:**
  $$\cot\delta_o - \cot\delta_i = \frac{w}{L}$$
- High-grip track tires exhibit non-linear slip-angle load sensitivity, where the heavily loaded outer tire requires a larger slip angle $\alpha_{\text{peak}}$ than the lightly loaded inner tire, often favoring reduced/parallel Ackermann in high-speed corners.

---

## 3. Longitudinal Anti-Geometries: Anti-Dive & Anti-Squat

- **Front Anti-Dive Percentage ($\%AD$):**
  $$\%AD = \left(\frac{Z_{\text{SVIC},f}}{X_{\text{SVIC},f}}\right) \cdot \left(\frac{L}{h_{\text{CG}}}\right) \cdot \text{BFD} \times 100$$
  where $\text{BFD}$ is the front brake force distribution fraction.
- **Rear Anti-Squat Percentage ($\%AS$):**
  $$\%AS = \left(\frac{Z_{\text{SVIC},r}}{X_{\text{SVIC},r}}\right) \cdot \left(\frac{L}{h_{\text{CG}}}\right) \cdot (1 - \text{DriveSplit}) \times 100$$
  where $\text{DriveSplit}$ is the front torque split ($0.0$ for `RR`/`FR`/`MR`, $1.0$ for `FF`, $0.30\text{--}0.50$ for `AWD`).
- **Fundamental Governing Rule:**
  - Anti-geometry **does NOT alter total steady-state longitudinal weight transfer** $\Delta W_{\text{long}}$.
  - It partitions longitudinal force reaction between **rigid links** (instantaneous, zero phase lag, reduces dynamic pitch angle $\theta$) and **coil springs** (delayed by suspension displacement).
  - **Optimal Track Window ($20\%\text{--}40\%$):** Maintains aerodynamic platform stability without binding the suspension or causing wheel hop over braking/traction bumps ($>45\%$ increases vertical harshness and contact patch load variation on bumpy surfaces).

---

## 4. Elastic Rates, Roll Stiffness & Load Transfer Distribution

### 4.1 Motion Ratio ($MR$), Wheel Rate ($K_w$), and Ride Rate ($K_{\text{ride}}$)
$$MR = \frac{\Delta x_{\text{damper}}}{\Delta x_{\text{wheel}}}, \quad K_w = K_s \cdot MR^2 \cdot \sin^2(\theta_{\text{spring}})$$
Including tire vertical stiffness $K_t(P_{\text{tire}})$ in series with wheel rate:
$$K_{\text{ride}} = \frac{K_w \cdot K_t}{K_w + K_t}$$

### 4.2 Anti-Roll Bar (ARB) & Total Axle Roll Stiffness ($K_{\phi}$)
For a tubular steel anti-roll bar ($G = 79.3\text{ GPa}$):
$$K_{\text{ARB}} = \frac{G \cdot \pi (D_o^4 - D_i^4)}{32 \cdot L_{\text{tube}}}, \quad K_{\phi,\text{ARB}} = \left(\frac{K_{\text{ARB}}}{a_{\text{arm}}^2}\right) \cdot MR_{\text{ARB}}^2 \cdot t^2$$
Single-axle and total vehicle roll stiffness:
$$K_{\phi,f} = \frac{1}{2} K_{\text{ride},f} t_f^2 + K_{\phi,\text{ARB},f}, \quad K_{\phi,r} = \frac{1}{2} K_{\text{ride},r} t_r^2 + K_{\phi,\text{ARB},r}, \quad K_{\phi,\text{total}} = K_{\phi,f} + K_{\phi,r}$$

### 4.3 Front Roll Stiffness Ratio ($FRSR$) & Lateral Load Transfer Distribution ($LLTD$)
$$FRSR = \frac{K_{\phi,f}}{K_{\phi,f} + K_{\phi,r}}$$
Combining elastic roll stiffness distribution and geometric roll center load transfer:
$$\Delta F_{z,\text{lat},f} = \frac{m \cdot a_y}{t_f} \left( FRSR \cdot h_{\text{roll}} + \frac{b}{L} z_{\text{rc},f} \right), \quad \Delta F_{z,\text{lat},r} = \frac{m \cdot a_y}{t_r} \left( (1 - FRSR) \cdot h_{\text{roll}} + \frac{a}{L} z_{\text{rc},r} \right)$$
$$TLLTD_f = \frac{\Delta F_{z,\text{lat},f}}{\Delta F_{z,\text{lat},f} + \Delta F_{z,\text{lat},r}}$$

- **Fundamental Balance Rule:**
  - **Understeer Bias ($TLLTD_f > W_f / W$):** Front axle carries a disproportionately high share of lateral load transfer, overloading the outer front tire via tire load sensitivity, increasing front slip angle $\alpha_f > \alpha_r$.
  - **Oversteer Bias ($TLLTD_f < W_f / W$):** Lateral load transfer shifts rearward, overloading the outer rear tire, increasing rear slip angle $\alpha_r > \alpha_f$.

### 4.4 Longitudinal & Diagonal Load Transfer
$$\Delta F_{z,\text{long}} = \frac{m \cdot a_x \cdot h_{\text{CG}}}{L}, \quad \Delta W_{\text{diag}} = \sqrt{\Delta W_{\text{long}}^2 + \Delta W_{\text{lat}}^2}$$

---

## 5. Tire Contact Patch, Load Sensitivity & Combined Slip (Pacejka / Friction Ellipse)

1. **Tire Load Sensitivity ($\mu(F_z)$):**
   $$\mu(F_z) = \mu_0 \cdot \left(\frac{F_z}{F_{z,\text{nom}}}\right)^{-k_{\text{sens}}}$$
   Because $k_{\text{sens}} > 0$, doubling vertical load $F_z$ yields less than double the lateral force $F_y$. Thus, higher axle load transfer $\Delta F_{z,\text{lat}}$ always reduces total axle cornering capacity:
   $$F_{y,\text{axle}}(F_{z,L}, F_{z,R}) = \mu(F_{z,L}) F_{z,L} + \mu(F_{z,R}) F_{z,R}$$
2. **Camber Thrust ($C_\gamma$) & Tire Pressure Efficiency ($\eta_P$):**
   - Effective grip scales with how close dynamic camber $\gamma_{\text{dyn}}$ is to the tire's optimal negative camber window ($\gamma_{\text{opt}} \approx -2.5^\circ\text{ to }-3.2^\circ$) and how close hot tire pressure $P_{\text{tire}}$ is to $P_{\text{opt}}$.
3. **Combined Longitudinal + Lateral Friction Ellipse:**
   $$F_{y,\text{avail},i} = F_{y,\max,i} \cdot \sqrt{\max\left(0, 1 - \left(\frac{F_{x,i}}{F_{x,\max,i}}\right)^2\right)}$$

---

## 6. Transient Damper Mechanics, Differential & Corner Phase Decomposition

To accurately model **Corner Entry (Braking & Turn-In)**, **Mid-Corner (Apex)**, and **Corner Exit (Throttle Application)**:

1. **Sprung Mass Natural Frequency ($f_n$) & Critical Damping ($C_{\text{crit}}$):**
   $$f_{n,\text{axle}} = \frac{1}{2\pi}\sqrt{\frac{K_{\text{ride,axle}}}{m_{s,\text{corner}}}}, \quad C_{\text{crit}} = 2\sqrt{K_w \cdot m_{s,\text{corner}}}, \quad \zeta = \frac{C_{\text{wheel}}}{C_{\text{crit}}}$$
2. **Transient Load Transfer Modifier (Low-Speed Bump & Rebound):**
   - During **Corner Entry** (brake application / trail-braking + turn-in roll rate $\dot{\phi} > 0, \dot{\theta} < 0$), **Front Low-Speed Bump** ($\zeta_{\text{LS,bump},f}$) and **Rear Low-Speed Rebound** ($\zeta_{\text{LS,reb},r}$) govern how rapidly vertical load shifts onto the front axle and off the inside rear tire.
   - During **Corner Exit** (throttle application + unwinding steer $\dot{\theta} > 0$), **Rear Low-Speed Bump** ($\zeta_{\text{LS,bump},r}$) and **Front Low-Speed Rebound** ($\zeta_{\text{LS,reb},f}$) govern rearward squat rate and transient traction vs. exit understeer.
   - **High-Speed Damping** ($\zeta_{\text{HS,bump}}, \zeta_{\text{HS,reb}}$) governs wheel compliance over curbs and surface bumps; excessive high-speed damping ($\zeta_{\text{HS}} > 0.55$) causes contact patch skipping/chatter.
3. **Differential & Drivetrain Locking Effects:**
   - Under braking/deceleration (Entry), high LSD deceleration lock or preload creates a stabilizing yaw-damping moment on the driven axle (increasing entry understeer stability, reducing trail-brake oversteer on `RR`/`MR`).
   - Under corner exit throttle, LSD acceleration lock balances inside/outside driven wheel traction up to saturation, after which excess power on `RR`/`MR`/`FR` saturates the rear friction circles into power oversteer, or on `FF` saturates the front friction circles into power understeer.
