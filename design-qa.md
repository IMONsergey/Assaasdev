# APCOSYS search and settings — visual QA

Date: 2026-10-23

**final result: passed**

## Visual source and rendered evidence

- Source of truth: the user's uploaded `Снимок экрана — 2026-10-23 в 16.39.50.png`, opened directly from `/workspace/scratch/b444c4d35617/upload/Снимок экрана — 2026-10-23 в 16.39.50.png`.
- Source pixels: 1950 × 1268, including a surrounding design canvas. The application frame is approximately x76, y57, 1782 × 1171 pixels. Its inferred CSS frame is 1440 × 946.3; comparisons use a 1440 / 1782 density factor and exclude the surrounding canvas.
- Implementation: `/search` in the explicit demo build, authenticated sample account, light theme, default text size, comfortable density, empty query, filters closed, expanded navigation.
- Desktop evidence: [final search, 1440 × 960](docs/screenshots/visual-polish/search-reference-1440.png), captured by Playwright Firefox at deviceScaleFactor 1 after local fonts loaded.
- Initial comparison: [search before typography correction](docs/screenshots/visual-polish/search-initial-1440.png).
- Mobile evidence: [390 × 844](docs/screenshots/visual-polish/search-390.png) and [320 × 844](docs/screenshots/visual-polish/search-320.png).
- Settings evidence: [desktop light](docs/screenshots/visual-polish/settings-1440.png), [mobile light](docs/screenshots/visual-polish/settings-390.png), [desktop dark with 125% text](docs/screenshots/visual-polish/settings-dark-large-text-1440.png), [mobile dark with 125% text](docs/screenshots/visual-polish/settings-dark-large-text-390.png).
- Chrome manual review: local application at `http://terminal.local:4173/search` and Settings; checked light/dark themes, Appearance/Workspace navigation, and collapsed navigation. The original brand symbol remains visible in the collapsed light sidebar through a color-inheriting SVG mask.

The source and rendered screenshots were opened together for the full-view comparison. Focused inspection measured the actual visible heading/subtitle bounds, their gap, and the search field. The 13.7-pixel viewport-height difference contributes approximately 6.9 pixels to the expected vertical position; it is not counted as design drift.

## Findings and correction history

### Iteration 1 — blocked by two P2 differences

1. **P2 — compressed title.** The first rendered title had approximately 545 × 32 pixels of visible lettering, compared with 589 × 34 in the normalized reference. Instrument Sans with −.045em tracking made the title too narrow. Changed only the landing title to Inter, 44px, weight 500, line-height 1.12, tracking −.015em.
2. **P2 — loose title-to-field rhythm.** The initial visible title/subtitle gap was approximately 31px versus 23.4px in the reference, and the field started at y515 instead of the expected y506–507. Reduced the title's bottom margin from 14px to 7px, raised the centered desktop block by 4px, and matched the subtitle to Instrument Sans 20px with −.035em tracking.

### Iteration 2 — passed

| Surface | Normalized source | Final browser capture |
| --- | ---: | ---: |
| Visible heading width | 589.1px | 597px |
| Visible heading height | 33.9px | 33px |
| Visible subtitle width | 286.9px | 284px |
| Title-to-subtitle visible gap | 23.4px | 22px |
| Field top at a 960px viewport | approximately 506–507px | 507px |
| Search field | approximately 684 × 56px | 684 × 56px |

Both P2 issues are resolved. Remaining typography differences are approximately 1–1.3%, consistent with rasterization and inferred source scaling. No actionable P0/P1/P2 difference remains in the target search composition.

An integration check also found insufficient contrast in accent text on pale surfaces. The foreground token was darkened to `#03758a` while the main accent remains `#008ca5`. The resulting foreground contrast is at least 4.72:1 on the relevant light surfaces. All seven existing accessibility checks passed after this correction.

## Required fidelity surfaces

- **Typography:** local Inter and Instrument Sans fonts load; the desktop headline stays on one line at 1440px; the mobile headline wraps intentionally. Default and 125% text sizes were checked. Sidebar width follows the text scale on desktop.
- **Layout and rhythm:** 240px default sidebar, 48px navigation rows, neutral selected item, quiet top toolbar, 684 × 56px centered search field, no landing artwork or footer. The main area's height tracks the actual header height, including wrapped toolbar states. Routes passed overflow checks at 1440, 390 and 320px.
- **Colors and tokens:** off-white light canvas, neutral navigation, restrained teal action color, readable dark icons and text. Dark and light themes share component geometry. Color-contrast failures found in the first pass were fixed.
- **Images and icons:** original Figma logo and navigation assets are preserved. Standard gear/help/bookmark/collapse icons use Tabler SVGs with the included MIT license. Monochrome assets inherit the current foreground through masks, avoiding invisible dark-mode icons. No artwork was substituted for the minimal source composition.
- **Copy and content:** the exact source headline, subtitle, placeholder, Add Filter, All Types and Settings labels are present. Existing functional navigation is retained rather than inventing unsupported history/collection behavior.

## Intentional product differences

- The demo account's actual sample credit balance and Business plan are shown. They are not overwritten with the screenshot's illustrative balance or Upgrade Plan state.
- Plans & billing and Saved queries lead to implemented screens. The source's Search history and Collections are not backed by a supplied product contract.
- The small Demo marker explicitly identifies sample data. Notifications remain reachable from the header; Support opens working help content.
- The uploaded reference describes desktop only. Mobile navigation, responsive wrapping, dark appearance, Settings organization and reduced-motion behavior were assessed as additional product states.

## Interaction and regression validation

- Search query entry, execution and result rendering; draft filter cancellation preserves the query and discards unapplied conditions.
- Desktop collapse → Settings → expand retains collapse state across routes without adding a storage key.
- Mobile focus trap, Escape close, focus return and route navigation.
- Appearance controls, tab keyboard navigation, preference persistence and one-time migration of the legacy System default to Light. Explicit Light/Dark choices and newly selected System persist.
- Appearance settings remain solely in Settings; Account links there instead of duplicating the controls. Index statistics remain an explicit-load action under Workspace.
- Reduced-motion settings apply to elements and pseudo-elements, and OS reduced-motion preferences are respected.
- TypeScript and 81 unit tests passed. Production and explicit demo builds passed. The 21 existing/extended E2E cases passed across the initial run and targeted correction reruns; the publication CI reruns the complete suite on the final commit.
- Browser route tests recorded no application page exceptions. Chrome console inspection showed extension metadata errors, with no application-source error identified in the inspected output.

## Implementation checklist

- [x] Restore the supplied search composition and typography.
- [x] Consolidate appearance/account/workspace controls under Settings.
- [x] Use a real settings gear and readable theme-aware icons.
- [x] Add restrained focus, hover, press, navigation and dialog transitions.
- [x] Preserve search, authentication and live API behavior.
- [x] Check light/dark, enlarged text, desktop/mobile and keyboard access.
- [x] Resolve all P0/P1/P2 findings in the compared states.

## Follow-up polish

P3 only: a pixel-perfect font rasterization match would require the original design frame's exact export density and font settings. Current rendered dimensions are within the accepted 1–2% range.

The public deployment remains an explicitly labeled demo. This visual review does not certify an unavailable production backend, real scans or payment processing.
