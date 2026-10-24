# APCOSYS — controls, search and commerce audit

Date: 24 October 2026. Base revision: `e4ac2f95afc4f9a0f722c8f17b014fffe88b450e`.

This pass implements the supplied screenshot comments across the existing product. It preserves the HTTP/WebSocket contracts and keeps the public presentation adapter separate from the LIVE application.

## Delivered changes

| User feedback | Implemented behavior | Evidence |
| --- | --- | --- |
| Search dots are too faint; the upper strip is unnecessary | Increased dot opacity and radius, extended the pattern behind the topbar. The topbar has no divider or background at the top of the page; a plain background appears only over scrolled content to preserve legibility. | `after/search-home-desktop.png`, `after/search-home-mobile.png` |
| Native dropdowns look disconnected from the product | Shared custom selects and suggestion menus use a quiet independent panel, selected rows, consistent stroke chevrons and insets, grouping, search where useful, and keyboard operation. All native selectors/datalists in the interface were migrated. | [Controls report](CONTROLS.md), `source/apcoclear-language-menu.jpg` |
| Calendar, spinners, checkboxes and form alignment | Shared UTC calendar with month/year navigation, exact seconds, typed dates, validation, Clear/Today/Apply and focus return. Shared checkbox/radio alignment, product file selectors and no numeric spinners. | `after/controls-tests/`, `after/controls-firefox/`, `after/controls-review/` |
| Nested filter groups are unreadable | Each selected group uses the full drawer width. Breadcrumbs navigate parent/child groups; summary cards show children. All/Any/Exclude preserve the AND/OR/NOT API tree, including custom fields and numeric/boolean values. | `after/search-filter-groups-desktop.png`, `after/search-filter-edit-mobile.png` |
| Toasts feel generic and interrupt the interface | Compact status icon, softer surface, controlled entrance/exit, timer with hover/focus pause, close action and long-text wrapping. | `after/shell-tests/`, [Shell report](shell-journeys.md) |
| Refresh button floats in the saved-query toolbar | Search occupies the left column; Open in and the labelled Refresh action stay together on the right and wrap coherently on narrow screens. | `after/saved-queries-desktop.png` |
| Desktop plan details should open together | One desktop expansion opens all four plans, preserving aligned rows. Mobile plans retain independent expansion. Annual billing remains the default; cadence changes use the rolling price animation. | `after/commerce-plans-open-1440.png`, `after/commerce-plans-390.png` |
| Credit packs need denser presentation and covers | Seven existing packs use three desktop columns, four on wide screens, two at intermediate widths and one on mobile. Lightweight SVG covers and restrained hover effects accompany a separate price and Buy credits action. | `after/commerce-credit-packs-1440.png`, `after/commerce-credit-packs-320.png` |
| Payments need internal details | Clickable history rows lead to order summary, amount/discount, method, status, dates, activity, receipt and appropriate recovery actions. Back preserves history filters and pagination. | `after/commerce-order-detail-1440.png`, `after/commerce-order-detail-390.png` |
| Crypto activity is empty on first entry | Accounts and transactions load when the tab opens. Amounts and network/coin marks are visible; exact source units remain available without overwhelming the summary. | `after/commerce-crypto-activity-1440.png` |
| Support popup and keyboard hint | Reorganized Help & support, compact legal/API links, a visible contact action and a direct scenario entry. Removed the visible shortcut hint. | `after/help-1440.png`, `after/help-390.png` |
| Payment flows are missing | Card, Ethereum ETH/USDT, account wallet, pending continuation, confirmation, receipt, cancellation, expiry, retry, promo code, annual/monthly subscriptions and invoice request are navigable. | [Commerce report](COMMERCE.md), `after/commerce-card-checkout-1440.png`, `after/commerce-crypto-checkout-320.png` |
| Sidebar/account menu feel too abrupt or active | Continuous 360 ms sidebar movement, stable icon positions, quieter collapse control and compact account surface. Reduced-motion settings are honored. | `after/navigation-collapsed-1440.png`, `after/account-menu-390.png` |
| Scenarios should guide actual actions | Preserved all 51 previous scenarios and added 9 payment journeys, for 60 total. The guide advances through actual selections, clicks, dialogs, route changes and results. | `after/scenarios-payments-1440.png`, `after/shell-tests/` |
| Remaining grids and internal screens | Reviewed settings, API, Files, Scanner, Notifications and 404 at desktop/mobile sizes. Fixed Files heading and the redundant toolbar inset; heading, form and filter now share the same left edge. | `after/workspace-review/screens.json`, `after/workspace-review/files-alignment.json` |

## Reference comparison

The APCOCLEAR2 header dropdown was inspected in the browser and captured in `source/apcoclear-language-menu.jpg`. Its separate panel, subtle border, active row and internal spacing informed the shared controls.

The public [apcosys.net](https://apcosys.net/) pricing, FAQ, search facets, result layout and footer were inspected. `source/apcosys-public-plans.jpg` records the public plan/packs reference. Free, Plus, Expert and Business retain the observed annual/monthly prices; all seven search-credit packs remain. The public FAQ supports cards, Ethereum/USDT and annual Business invoice/bank-transfer requests. Unsupported extra networks/currencies were removed from the presentation checkout.

The client's authenticated account and real payment-provider screens were not accessed. Their behavior is constrained by the existing application API contracts and the checked fixtures, not inferred from a logged-in client session. LIVE crypto responses retain their original decimal strings and raw precision.

## Behavior and data checks

- The filter editor preserves arbitrary API fields and nested AND/OR/NOT semantics; the new full-width navigation does not flatten the submitted expression.
- A calendar draft cannot leak an invalid complete date into submission. Cancel discards uncommitted local input. Epoch zero and UTC seconds remain valid.
- Custom popups stay in the nearest native dialog's top layer, fit the viewport and dismiss before the enclosing dialog on Escape. A guided journey temporarily yields its overlay while a control popup is open.
- Route-changing journey steps retain the observed action until their destination condition is satisfied. This fixes guides becoming stuck after a valid payment transition.
- Presentation orders survive Reload in the same tab. Replay is idempotent and uses persisted settlement order, including multiple operations completed in the same second. Repeated confirmation does not add credits twice.
- Unresolved payment confirmation prevents a second purchase until the first order is checked. Owner isolation, expiry, cancellation, removed records and malformed/expired storage are covered.
- New checkout and order routes have loading, signed-out, missing-order, error, pending and terminal states.

## Validation

Final release verification is recorded in `verification.json`, with named browser cases in `browser-results.json` and source/build fingerprints alongside them. Screenshots are captured from actual rendered states; they are not mockups.

| Release check | Result |
| --- | --- |
| Unit/API tests | 192 passed across 28 files |
| TypeScript + LIVE build | Passed |
| Immutable presentation build | Passed |
| Complete Chromium browser suite | 234 passed, zero failed/skipped/flaky |
| Final affected Chromium suites | 18 passed |
| Final affected Firefox suites | 18 passed |

The complete Chromium run preceded one final CSS selector restoring keyboard focus in Firefox after opening a select with the pointer. The unchanged input-modality assertions and all 18 affected controls/search/shell cases passed in both browsers on the rebuilt final source. The final gate did not weaken assertions or skip failing cases. Live and presentation builds were rebuilt after this selector change.

The focused workstream reports contain their exact pre-release test runs. Those runs are separate from the final release gate and should not be added together as a count of unique tests.

## Integration boundary

The public presentation can be explored without visible demo labels. Card and cryptocurrency confirmations are local presentation state transitions; they do not charge money or contact a payment processor. The saved card profile is a fixture and no PAN/CVV form is collected. The QR encodes an order reference, not a payable wallet address. The ETH quote belongs only to the presentation fixture and is displayed as the order's exchange rate.

Receipt export contains known order facts as a text file, without fabricated company/tax details. The Business invoice action opens an editable support request; it does not send mail automatically. LIVE checkout redirects, payment status checks, wallet recovery and API contracts remain in place for integration with the client's backend.

No new runtime dependency, external payment service or cloud database was added in this pass.
