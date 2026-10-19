# Vehicle artwork

## Current user-supplied car

`custom-paint-top-down.png` is a pixel-preserving PNG conversion of the user-supplied `custom_paint_topDown.webp`. The decoded 400 × 1000 RGBA pixels and transparency are identical. PNG provides one consistent bundled image format for web, iOS and Android; the original WebP was not modified.

The body is decorative artwork, shared across the teaching profiles. Its livery does not select manufacturer geometry, vehicle dimensions or measured aero data. Four independent projected tyre diagrams and force plots are rendered with React Native SVG.

Enhanced tyre view applies display gains of 5× geometric steering and 12× per-wheel toe, capped at ±42°. Camber is emphasized by sidewall projection (3.5 diagram units per degree, capped at ±15); these are visual gains only. Turning enhanced view off shows the model's actual front heading and rear toe without the camber projection. Telemetry is unchanged by the switch.
