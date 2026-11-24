# Vehicle artwork

## Current user-supplied car

`custom-paint-top-down.png` is a pixel-preserving PNG conversion of the user-supplied `custom_paint_topDown.webp`. The decoded 400 × 1000 RGBA pixels and transparency are identical. PNG provides one consistent bundled image format for web, iOS and Android; the original WebP was not modified.

### Mustang GT3 CAD wireframes (Top-Down, Roll & RC, and Pitch & Aero)

Ten dual-theme RGBA wireframe PNGs processed with transparent backgrounds from the user-supplied Ford Mustang GT3 CAD renders for `ChassisTopDownCanvas` (overhead view), `RollElevationSvg` (front & rear axle views), and `PitchAeroSvg` (nose-left side view):

- `gt3-wireframe-top-down-dark.png` / `gt3-wireframe-top-down-light.png` (overhead view aligned to `TOP_DOWN_POSITIONS` fender arches)
- `gt3-wireframe-front-dark.png` / `gt3-wireframe-front-light.png`
- `gt3-wireframe-rear-dark.png` / `gt3-wireframe-rear-light.png` (exposed lower tire silhouettes masked cleanly below the fenders so live cambered SVG tires pivot freely)
- `gt3-wireframe-side-dark.png` / `gt3-wireframe-side-light.png` (wheel arches masked cleanly around the axle centers so the sprung chassis pitches around stationary grounded wheels)
- `gt3-wireframe-wheel-dark.png` / `gt3-wireframe-wheel-light.png`

The body is decorative artwork, shared across the teaching profiles. Its livery and wireframe outlines do not select manufacturer geometry, vehicle dimensions or measured aero data. Four independent projected tyre diagrams, linkages, roll centers and force plots are rendered with React Native SVG.

Enhanced tyre view applies display gains of 5× geometric steering and 12× per-wheel toe, capped at ±42°. Camber is emphasized by sidewall projection (3.5 diagram units per degree, capped at ±15); these are visual gains only. Turning enhanced view off shows the model's actual front heading and rear toe without the camber projection. Telemetry is unchanged by the switch.
