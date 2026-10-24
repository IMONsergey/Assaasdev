# APCOSYS brand components

Adapted from the user-owned [Apco-components-lib](https://github.com/IMONsergey/Apco-components-lib/tree/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665), preserving its original dot interaction, sphere/cube morph, odometer and split-button construction.

- `DotCascade`: original dependency-free Canvas 2D dot renderer; theme colors, app motion preference and SaaS layout integration are adapted here. Only the pointer's affected region is repainted; animation sleeps after settling.
- `OrbCubeLoader`: original Fibonacci point distribution, projection, fitting and sphere/cube cycle. Adds app motion preference and an optional decorative mode for status wrappers. Mount only while a real operation is pending.
- `AnimatedPrice`: original compositor-driven digit reels. The exact accessible amount updates immediately; USD formatting retains cents and unavailable values. Fast successive changes interrupt the current animation.
- `DoubleButton`: original two adjoining shapes, adapted to 44 px SaaS controls. It remains one semantic button/link and one keyboard stop.

All motion respects `prefers-reduced-motion` and the app's `data-reduced-motion` setting. Canvas rendering pauses offscreen and in background tabs. No external animation package is required.
