# Billing screenshots and component attribution

The three PNGs in this directory show the final combined static build served at `http://127.0.0.1:4184`, reviewed on 24 October 2026. They use the application's local review data and actual rendered interface.

| File | View | Capture conditions |
| --- | --- | --- |
| `billing-annual-desktop.png` | Annual plan comparison, including monthly equivalent and annual billed totals | 1440 × 960 viewport, light theme, 100% text |
| `billing-packs-desktop.png` | Credit quantities, separate prices, and purchase actions | 1440 × 960 viewport, light theme, 100% text |
| `billing-mobile.png` | Annual plans and cadence control at a narrow width | 390 × 960 viewport, light theme, 100% text |

All captures include the full page. Reduced motion is enabled for deterministic screenshots. The live motion behavior was reviewed separately in light and dark themes, with both system and application reduced-motion settings.

## Source attribution

The original visual components were supplied in the user's [Apco-components-lib repository](https://github.com/IMONsergey/Apco-components-lib/tree/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665), pinned to commit `4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665`:

- [AnimatedPrice.tsx](https://github.com/IMONsergey/Apco-components-lib/blob/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665/src/components/ui/AnimatedPrice.tsx): digit-reel animation adapted for exact accessible monetary values, interrupted transitions, and reduced motion.
- [DoubleButton.tsx](https://github.com/IMONsergey/Apco-components-lib/blob/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665/src/components/ui/DoubleButton.tsx): adjoining label and arrow shapes adapted to a single semantic SaaS button or link.
- [BillingSwitch.tsx](https://github.com/IMONsergey/Apco-components-lib/blob/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665/src/components/ui/BillingSwitch.tsx): cadence-switch reference; the application uses its shared accessible segmented tabs.
- [DotCascade.tsx](https://github.com/IMONsergey/Apco-components-lib/blob/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665/src/visuals/dots/DotCascade.tsx), [dot-cascade-themed.js](https://github.com/IMONsergey/Apco-components-lib/blob/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665/src/visuals/dots/dot-cascade-themed.js), and [dot-cascade.css](https://github.com/IMONsergey/Apco-components-lib/blob/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665/src/visuals/dots/dot-cascade.css): the interactive Search background.
- [OrbCubeLoader.tsx](https://github.com/IMONsergey/Apco-components-lib/blob/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665/src/visuals/uploads/orb-cube/OrbCubeLoader.tsx) and [OrbCubeLoader.css](https://github.com/IMONsergey/Apco-components-lib/blob/4f3769b4be2ab7eeecb8f8dc4b5b2aa84360e665/src/visuals/uploads/orb-cube/OrbCubeLoader.css): the point-cloud sphere/cube loading visual, mounted while an operation is pending.

The adapted implementations and integration notes live in `src/components/brand/`. Screenshot assets are retained once each; this note references them without embedding duplicate copies.

## Final capture verification

Captured after the primary-button contrast correction, SVG flag integration, support focus fix, and favicon update. Static module entry: `/assets/index-BKshILTY.js`. The primary Billing button has measured text/background contrast 5.36:1. No page errors or horizontal overflow were observed during these captures.
