# Shell, support and guided journeys — 24 October 2026

## Implemented

- Removed the topbar background and bottom divider while retaining the sticky actions and workspace geometry.
- Reworked desktop sidebar collapse into a continuous 360 ms width transition. Navigation icons keep their horizontal position; labels clip and fade instead of switching `display` abruptly. The collapse control is smaller and quieter. Reduced motion disables the transition.
- Reduced account popup width and avatar size, softened its shadow and removed the prominent plan background. Keyboard navigation, Escape, focus return and mobile navigation behavior are retained.
- Rebuilt the Help overview around a compact scenario entry and grouped API/legal links. Removed the visible keyboard-shortcut row. The existing support form still prepares an editable email draft; no sending or delivery is implied.
- Refined toast spacing, icon hierarchy, dismissal and entrance/exit motion. The visible lifetime indicator pauses on hover/focus. Long unbroken text wraps; error text is preserved. Reduced motion hides the moving indicator.
- Preserved the original 51 journeys and added nine, for **60 scenarios**. A payment collection makes Wallet, Card and Cryptocurrency entry points directly visible.

| New scenario | Observed path |
| --- | --- |
| Pay by card | Review → explicit checkout → explicit confirmation → receipt → order |
| Pay with cryptocurrency | Coin/network selection → checkout → confirmation → receipt → order |
| Inspect an order and receipt | Payment history → summary → timeline → receipt download |
| Continue an unfinished payment | Existing pending order → same checkout → confirmation → receipt |
| Cancel a checkout before payment | Review → checkout → cancellation dialog → explicit cancellation |
| Retry an expired or cancelled order | Ended order → restored purchase → new order → confirmation → receipt |
| Request a Business invoice | Annual plans → invoice request form → company details → reviewed email draft |
| Apply a purchase promotion | Code validation → accepted discount → checkout total |
| Manage subscription renewal | Current status → cancellation confirmation → resume confirmation → active renewal |

Annual/monthly comparison remains in the existing “Choose a plan and billing period” journey. The existing Wallet journey is retained. Guides never invoke payment, renewal, cancellation or email-sending controls automatically.

## Integration defects fixed

1. **A click followed by navigation could stall its guide.** `useNavigate` changed the navigation callback identity, restarting the observation effect before its target appeared. The current step now retains only its transient observed click/visibility flags across effect restarts. Starting a new guide resets them; no customer data is added to persistent guide storage.
2. **A form dropdown could be blocked by the guide on mobile.** The custom control popup lives in the dialog while the guide uses a native manual popover. While `[data-control-popup]` is open, the guide and spotlight become hidden and ignore pointer input. The reserved guide row keeps the form still. Guidance returns after selection or dismissal.
3. **Custom select changes needed live guide observation.** Result sorting and service classification now observe the shared combobox’s bubbling `change` event instead of a native `select`.

## Focused verification

The application was exercised on the local isolated presentation build at `127.0.0.1:5175`; no external payment provider or message delivery was invoked.

- `npm run typecheck`: passed after the observation fix.
- `vitest src/features/journeys/journeys.test.ts`: **10 passed**. Includes the complete catalog/target mapping and explicit payment/renewal action contracts.
- `native-shell.spec.ts`, `journeys-support.spec.ts`, `shell-polish.spec.ts`: **13 passed** in one focused run.
- `payment-journeys.spec.ts`: all **10 test cases** reached their intended outcomes. The initial retry failure led to the observation fix; its targeted rerun passed. After the supported crypto options changed to Ethereum/ETH/USDT, the mobile Coin selector exposed the layer defect. Both crypto viewport tests and both invoice viewport tests then passed together (**4/4**) after the layer fix.
- The final combined immutable-build gate is performed by the integrating agent; the results above are the child agent’s focused evidence.

Browser checks included 1440, 390 and 320 px, account navigation at 667 × 375, keyboard menu interaction and dismissal, targeted Axe checks, reduced motion, toast dismissal and receipt downloading. The collapse test sampled actual animation frames: intermediate sidebar widths were observed, icon X positions stayed within 1 px, and the final width was 72 px. On the 320 px guided invoice form, the guide stayed above the form footer and its submit controls remained available.

## Read-only visual review of the remaining workspace

Personally inspected 30 full-page screenshots: each route below at **1440 × 960** and **390 × 844**.

| Group | Screens |
| --- | --- |
| Settings | Profile, Security, Sessions, Organization, Workspace, Appearance, Legal |
| API | API key, Usage & limits |
| Files | Buckets & files, initial query |
| Scanner | Tasks, New task, Scheduled tasks |
| Other | Notifications, 404 game entry |

All 30 captures had no document-level horizontal overflow, no page JavaScript errors and no visible native select/date controls. No additional overlapping or clipped controls were observed in these captured states. This was a visual review of the displayed states; it does not claim every destructive account action or every server failure was executed.

The review found one concrete layout inconsistency on Files: an unframed query form had an extra left inset, and its title reversed the sidebar wording. The integrating agent corrected both. A fresh capture confirms that heading, Filters and query input share **x = 272 px** on desktop and **x = 16 px** on mobile. See `after/workspace-review/files-alignment.json`.

## Evidence

- Current scenario directory: `after/scenarios-payments-1440.png`, `after/scenarios-payments-390.png`, `after/scenarios-payments-320.png`.
- Help: `after/help-1440.png`, `after/help-390.png`, `after/help-320.png`.
- Account popup: `after/account-menu-1440.png`, `after/account-menu-390.png`, `after/account-menu-320.png`.
- Collapsed navigation: `after/navigation-collapsed-1440.png`.
- Passing workflow screenshots: `after/shell-tests/`.
- All 30 workspace review screenshots and route metrics: `after/workspace-review/`, including `screens.json`.

Superseded failure screenshots, error contexts and traces were moved out of `after/` to `/tmp/apcosys-shell-obsolete-artifacts`. App source was frozen after the targeted dropdown integration fix. No commit or publication was performed by this agent.
