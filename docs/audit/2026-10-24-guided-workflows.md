# Guided workflows, support and legal — 24 October 2026

## Delivered surfaces

`/scenarios` contains **46 task guides** with text search, category filters, clickable cards and a preview of the steps before starting. The first 38 map to the acceptance families in [the scenario coverage audit](./2026-10-23-scenario-coverage.md). Eight additional guides make support, legal documents, saved queries, notifications, file exports, credit packs, registration and recovery directly discoverable.

| Category | Guides |
| --- | ---: |
| Search & analytics | 11 |
| Host investigation | 8 |
| Files & exports | 5 |
| Private Scanner | 4 |
| Account & security | 7 |
| Billing & credits | 5 |
| Workspace | 6 |

The guide runs inside the actual workspace. Next/Previous move between steps and their available routes; the user performs the described operation through the existing product controls. Host steps use the host actually opened by the user. Search requests, private task scope, service selection and the return location remain attached when changing presentation tabs. If no host has been opened, the guide asks the user to select one instead of fabricating a record.

The guide can be minimized or closed. Only the catalog ID, step index and expanded/finished flags are retained in session storage. Search and host locations are held in memory and reset when a new guide or account principal is selected. Starting or restarting a guide begins with an empty search where appropriate and does not replay an earlier query. Guide completion records progress through instructions; it does not claim that a payment, scan, external authentication or other operation succeeded.

## Support request

Support now opens a Help & support dialog with a Contact support form. The form validates name, email and message, then presents the exact recipient, subject and message before the user opens an email application. Copy message provides an alternative when no mail handler is configured. Closing the dialog preserves the local draft for the current mounted workspace.

The existing API contract has no support-ticket endpoint. The implemented action prepares an email to `info@apcosys.net`; it does not create a ticket or claim delivery. No real email was sent during implementation or tests.

The recipient and draft-based interaction were checked against the existing marketing repository:

- [Public settings](https://github.com/IMONsergey/apcoweb/blob/main/src/config/public-settings.ts)
- [Contact form](https://github.com/IMONsergey/apcoweb/blob/main/src/pages/corporate/ContactForm.tsx)

Distinct footer keys prevent a primary action from briefly turning into dark text on a dark background when switching to a secondary action. Focus moves to the form or updated dialog, and the 320 px footer keeps both actions at the same height.

## Legal documents

Settings has a Legal section at `/settings?section=legal`. It links to six existing official documents rather than generating replacement legal text:

- [Terms & Conditions](https://apcosys.net/legal/terms)
- [Privacy Policy](https://apcosys.net/legal/privacy-policy)
- [API & Data License Agreement](https://apcosys.net/legal/api-data-license-agreement)
- [Data Processing Agreement](https://apcosys.net/legal/data-processing-agreement)
- [Data Collection Policy](https://apcosys.net/legal/data-collection-policy)
- [Cookie Policy](https://apcosys.net/legal/cookie-policy)

Route provenance is documented in the marketing repository’s [legal route list](https://github.com/IMONsergey/apcoweb/blob/main/src/content/legal-routes.ts) and [published-source migration record](https://github.com/IMONsergey/apcoweb/blob/main/docs/archive/LEGAL-PAGES-2026-10-10.md). That record identifies the original APCOSYS application routes and source bundles. The automated frontend suite checks the destinations and safe external-link attributes. It does not certify the contents or availability of the remote publisher’s pages; the web retrieval tool could extract no document body from Terms and could not access the other five pages during the final check.

## API and settings geometry

Account, API and Settings use the shared page maximum and spacing tokens. The API page has a consistent key/context layout; Usage & limits has equal credit cards followed by a full-width limits panel with two columns on desktop and one on narrow screens. The scan allocation now has the same visual treatment as search allocation. Meters use returned values and the existing credit calculation; unavailable allocation does not invent a percentage. Existing key reveal, rotation confirmation and uncertain-outcome checks remain intact.

Settings content uses the available workspace width while individual form controls retain readable dimensions. Legal cards use the same grid, icon and action alignment as the other surfaces.

## Verification

The final targeted run used a static `vite build --mode demo` build, Chromium and an isolated preview on port 4182. Data came from the existing local adapter; these results do not validate live payment, email, identity-provider or scanner integration.

| Check | Result |
| --- | --- |
| TypeScript build check | PASS |
| Guide state, query/scope preservation, catalog mapping and email encoding unit tests | 5/5 PASS |
| New guided-workflow/support browser tests | 7/7 PASS |
| Existing settings/API browser regressions | 8/8 PASS |
| Targeted axe checks: scenarios, legal, API usage, settings/account sections | PASS |
| Layout checks at 1440, 390 and 320 px | PASS |

Browser coverage includes directory filtering, a real search → host → Services transition with unchanged query and back context, minimizing/restoring/dismissing the guide, and persisted fields containing no response or query data. A separate regression opens Filters from a guide while Search remains mounted, cancels it, and reopens the same step while preserving the applied request. Support coverage checks whitespace validation, exact draft encoding, retained edits and absence of a false delivery confirmation.

The 46 cards are a guide catalog, not a claim of 46 independently completed backend acceptance tests. The actual browser tests are in `tests/e2e/journeys-support.spec.ts` and `tests/e2e/settings-ux.spec.ts`; pure checks are in `src/features/journeys/journeys.test.ts`.

## Visually reviewed evidence

- [Scenario directory, desktop](./2026-10-24-journeys/scenarios-desktop.png)
- [Guided search, 320 px](./2026-10-24-journeys/guide-mobile.png)
- [Support form, 320 px](./2026-10-24-journeys/support-mobile.png)
- [Legal section, desktop](./2026-10-24-journeys/legal-desktop.png)
- [API usage, desktop](./2026-10-24-journeys/api-usage-desktop.png)
- [API usage, 320 px](./2026-10-24-journeys/api-usage-mobile.png)
