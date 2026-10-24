# Search and host visual pass · 2026-10-24

## Accepted evidence

These screenshots were captured from the current local APCOSYS app in Chromium after the search presentation changes and individually inspected before saving here. The app uses its existing in-memory review adapter.

| Screenshot | Route | Viewport | What was checked |
| --- | --- | --- | --- |
| search-results-desktop.png | /search?q=nginx&run=1 | 1440 × 960 | Column rhythm, provider/OS/protocol/label glyphs, four-port preview, original query retained by result links |
| search-results-mobile.png | /search?q=nginx&run=1 | 390 × 960 | Full-width service row, compact location/time footer, visible Results/Analytics/actions, 44px mobile port controls |
| host-service-mobile.png | /hosts/192.0.2.10?tab=services | 390 × 960 | Product marks, service text hierarchy, clear row chevron, bounded catalog and mobile list |

A separate 320px pass and 320px dark/125% text regression included long IPv6 addresses and 1000 returned service references; no horizontal document overflow was observed. The before pass is retained in the task's local QA output.

## Findings and changes

1. Mobile result rows previously squeezed service chips beside country and a full timestamp. Services now occupy their own full-width row, followed by a short location/observation footer. Four preview ports and an explicit +N link lead directly into the full service catalog.
2. Only three products had recognizable marks. Thirty-four additional local SVG marks now cover products, cloud providers and operating systems; autocomplete, analytics, host overview and service catalog use the same resolver. Semantic protocol/label glyphs supplement text. Unknown identities keep a neutral glyph and port numbers never imply a detected brand.
3. The small Results/Analytics toolbar clipped the Analytics label at 320px. Narrow layouts retain the full text labels and omit their decorative icons, leaving room for action controls.
4. Repeated hostname text inside each service row is replaced with returned product/version when available; the original service context remains in its title and detail panel. Redundant secondary analytics/overview captions were removed.
5. Guided navigation to an uncached search keeps its URL/query intact without issuing a hosts request. A Run this search state waits for the user's action; switching tabs preserves that state. The result readiness hook is false for pending, failed, preview-only or unapplied draft states.

## Asset provenance

- Existing NGINX, Apache and PostgreSQL artwork remains from the official sources in [technology README](../../../../public/assets/technologies/README.md).
- 34 additional SVGs are unmodified vector files from [Simple Icons 16.35.0](https://github.com/simple-icons/simple-icons/tree/ed9a5192b24ad2f169bf1009931da0df27d5a49a), commit `ed9a5192b24ad2f169bf1009931da0df27d5a49a`. SVG total is 56,182 bytes (about56KB).
- Exact upstream brand sources, colors and icon-specific licensing metadata are recorded in [sources.json](../../../../public/assets/technologies/marks/sources.json). The collection license and disclaimer are included alongside the SVGs.
- No remote logo service is used by the browser. Only displayed local marks are requested; there is no added runtime package.

## Verification

- TypeScript passed.
- 22 focused unit checks passed (search/host domain and mark registry); two new registry tests verify context-specific matching and real local assets.
- 33 of34 existing search/host/client-polish end-to-end checks passed. The remaining old registration-guide test expected the former Next step button; its update belongs to the onboarding work. This is recorded rather than presented as a search failure or a complete full-suite result.
- Four new search-marks end-to-end checks passed: observed brands only; direct full-service link; branded autocomplete without implicit search; 320px/large-text layout and explicit one-request onboarding preview activation.
- Three widths × search/results, analytics and service catalog were captured and inspected; nine visual states. Final desktop/mobile source screenshots were refreshed after integration of the shell and avatars.

This pass does not certify real payment, email or customer backend delivery. It verifies frontend rendering and controlled data/navigation behavior.
