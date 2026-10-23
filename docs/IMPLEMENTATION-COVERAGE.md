# Implementation coverage — 23 October 2026

This repository implements a React client for the supplied APCOSYS website contract. The existing backend remains responsible for identity, permissions, search/index data, scanning, payment processing and entitlements. A separate, labeled demo adapter exercises local workflows without network calls. **Neither passing client tests nor demo success establishes production readiness.**

Contract inventory: [52 WebSocket methods](../src/api/catalog.ts), [public DTOs](../src/api/contracts.ts), [transport and deployment requirements](API-INTEGRATION.md). No private source document is required to run this application or copied into this coverage report.

## WebSocket method coverage

“UI” means a current screen issues or consumes the operation. “Transport/demo” means the contract is represented and callable, but no dedicated UI action currently invokes it. Grouped rows enumerate all 52 dispatched request names exactly once.

| Method(s) | Current implementation | Evidence / remaining integration check |
|---|---|---|
| `hosts` | Public search, result pages, conditions and sorts | Search model and demo tests; real page limits, fields and charges need account traces. No invented total. |
| `analytics` | Facet stream and completion handling | Multipart transport and demo tests. Shared analytics loads explicitly to preserve token uses. |
| `analytics_settings`, `analytics_settings_delete` | Facet configuration and reset | Current profile preferences and subsequent facet load. Live default settings need server verification. |
| `hostinfo` | Host detail; DNS, WHOIS and domain map independently rendered | Four correlated, unordered sections tested; 100/1000-service fixture cases. |
| `cveinfo` | CVE detail panel | Live payload remains authoritative. The demo advisory is explicitly fictional. |
| `autocomplete` | Field/value suggestions in condition editor | Nonempty query, optional field, ten-result boundary; no legacy `fields` request. |
| `buckets`, `bucket_analytics` | Files/Buckets tabs, supported filters, paging, server counts, bucket drilldown | Seven filter-model tests plus local browser review. Both views require explicit requests. Ignored country/excluded-bucket parameters are not offered. |
| `private_hosts`, `private_analytics` | Private search with task scope | Same search pipeline and access gates; results are scoped by `task_ids`. |
| `private_hostinfo` | Private host detail with isolated transport lane | Three anonymous success sections tested. A live trace must confirm parallel dedicated sockets and errors. |
| `private_task_add`, `private_task_update` | Scan create and schedule editing | Host/CIDR/port/cron validation and credit estimate; demo queues a task without inventing a completed scan. Live scanner acceptance remains open. |
| `private_task_remove`, `private_planning_task_remove`, `private_task_results_delete` | Distinct confirmations for history, schedule and indexed results | Demo tests distinguish these effects. Unknown outcomes are reconciled with lists, not automatically repeated. |
| `private_tasks_get`, `private_planning_tasks_get` | Task and schedule lists | Real scanner status values are preserved. There is no invented pause/cancel/status-push API. |
| `get_pricing_info` | Transport/demo; pricing UI uses equivalent `GET /pricing` | Numeric plan fields override promotional descriptions. |
| `networks`, `validate_promo_code` | Billing currency/network and promo selection | Demo network/promo are fixtures. Live network IDs, amounts and promo rules come from the backend. |
| `init_checkout`, `billing_manage` | Card checkout and customer portal actions | Live provider integration is not certified. Demo explicitly reports provider unavailable rather than creating a fake URL. |
| `get_address`, `pay_with_balance` | Crypto invoice or balance purchase flow | No automatic retry after uncertainty. Demo invoices remain pending and do not change money or access. |
| `confirm_payment` | Payment status stream | Pending/completed distinction tested at transport level. Actual settlement and entitlement refresh require sandbox traces. |
| `delete_payment`, `user_billing` | Billing history, balances and history deletion | Demo deletion changes history, never implies refund. Separate monetary/search/scan balances. |
| `get_user_addresses_info`, `get_address_transactions` | Billing Crypto activity: explicit address load/refresh and a transaction detail dialog | Unit and focused browser checks preserve exact amount/total/block strings and separate decimals. A 390 px page/dialog review found no overflow; the scoped accessibility check found no violations. A synthetic received transfer never settles a payment or changes entitlement. Live ownership, provider timestamps and transaction history remain unverified. |
| `cancel_subscription`, `resume_subscription` | Subscription settings | Local demo effect and notification; live recurring-provider behavior needs verification. Cancellation retains access through expiry. |
| `get_notifications`, `mark_notification_read`, `mark_all_notifications_read` | Paginated notification center and read actions | Uses `limit/offset` and `id`, not invented pagination/payload names. Secrets are not rendered from raw notification payloads. |
| `unread_notifications` | Push consumed by the shell; explicit request available through transport/demo | Empty-ID pushes remain separate from request responses. |
| `query_create`, `query_list`, `query_delete` | Saved search create/list/open/delete | Exact nested JSON, 24-hex ID and 20-record cap tested. No saved-query update method is invented. |
| `short_link_create`, `share_link_create` | Search sharing and limited links | Full payload binding, TTL/use-budget tests. Demo links/tokens exist only in the current adapter; real `/s` redirect must be integrated. |
| `regenerate_api_key` | Single API key reveal/copy/rotation | Replaces the previous key; lost outcome reconciled using profile. Correct unread-notification wrapper tested. |
| `org_add`, `org_remove`, `org_leave` | Organization member management by user ID | No email invitation system. Owner-leave, nonexistent user and conflicting team cases represented. |
| `user_sessions`, `terminate_user_session`, `terminate_all_sessions` | Session list and termination | Current session cannot be individually terminated; “all” WS operation preserves current. Same-ID acknowledgement/list follow-up tested. |
| `session_limits` | Transport/demo; session UI already uses `user_sessions.limit` | No separate session-limit request in the current UI. Live login eviction limits need account traces. |
| `totp`, `totp_validate` | Enrollment, local QR generation, code verification, one-time backup presentation | Fifteen-minute pending key and five eight-character codes tested. Login challenge is a different HTTP operation. |

Eight historical request names are deliberately rejected locally because the supplied website dispatcher does not implement them: `fields`, `networkHistory`, `networks_history_aggregation`, `buy_credits`, `credits_status`, `get_token_pack_prices`, `get_subscription_pricing`, `get_token_pricing`.

## Website HTTP coverage

| Route(s) | Client/UI behavior | Live prerequisite |
|---|---|---|
| `POST /auth/signup`, `POST /auth/verify` | 18-character signup minimum; verification creates an account without assuming login | Real email delivery, duplicate/rate-limit behavior and guest migration. |
| `POST /auth/login`, `POST /auth/totp/verify` | Email or username, minimum six login characters; preserves HTTP202 Pending2FA; authenticator or one-time backup | Secure cookie, challenge expiry, real authenticator/backup verification. |
| `POST /auth/password-recovery/request`, `POST /auth/password-recovery/confirm` | Recovery request/code/new-password flow | Email delivery and backend abuse controls. No invented resend endpoint. |
| `POST /auth/guest` | Explicit guest entry only | Guest cookie creation and configured guest-whoami behavior. No silent fallback from a failed account session. |
| `GET /auth/google`, `/auth/google/callback` | Google redirect entry; callback and cookie creation belong to backend | Registered provider and callback/frontend URLs. Disabled in demo. |
| `GET /auth/telegram`, `/auth/telegram/callback` | No configured Telegram login widget/entry in this client | Widget/bot configuration must be supplied; callback validation belongs to backend. |
| `GET /auth/logout`, `GET /whoami` | Resolve session and clear all account sessions on logout | Credentialed CORS/Origin/cookie setup, expiry and revoked-session testing. |
| `POST /auth/password-reset` | Current/new password form | Actual credential update on server. Demo only exercises validation/transitions. |
| `POST /profile/update`, `POST /profile/verify` | Pending profile/email verification; old email remains current until verified | Real email code delivery; fifteen-minute expiry and active-TOTP requirements. |
| `GET /google/link`, `/google/link/callback`, `/telegram/link`, `/telegram/link/callback` | Connected sign-in actions; callback/backend owns account linking | Real providers and callbacks. Demo redirects are disabled. |
| `GET /pricing` | Four-plan and token-pack comparison from response | Live pricing/configuration; annual price is the annual charge. |
| `GET /api/statistics` | Collapsible index statistics on the search home, with explicit Load/Refresh, seven counters and a UTC timestamp | Focused Firefox review at 1440/390 px and a local HTTP fixture verified zero/missing values, loading, retained results after HTTP 503 and manual recovery without automatic requests/retries. Live index counts/freshness remain unverified. |
| `GET /s?sid=…` | Backend short-link redirect; search can restore the resulting full query | Frontend/reverse-proxy must route short-link resolution to the backend. |
| `POST /download/bulk/stream`, `POST /download/private/bulk/stream` | Raw partial/full NDJSON or supported CSV download | Business/full-access, response headers, streaming failure, real Range/checkpoint behavior. |
| `POST /download/buckets/stream` | Raw file or bucket-host export | Same streaming validation; file/host caps remain distinct. |

## Verified client properties and acceptance boundary

- **Transport:** 26 unit tests cover HTTP202, credentialed requests, abort/timeout, unread byte streams, out-of-order correlation, partial results, private anonymous lanes, same-ID follow-ups, no mutation retry and shared-metadata provenance. Wire-supplied provenance cannot impersonate the viewer’s account; late frames are unknown.
- **Demo:** 20 stateful tests cover real in-memory changes, guest quota, signup without auto-login, pending email/TOTP expiry, backup consumption, saved JSON, scanner effects, sessions, organization, key notifications, limited-link rules, pending payment and string-preserving crypto activity. The adapter never calls fetch or WebSocket.
- **Files:** seven model tests cover all supported fields, full URL round-trip, inclusive UTC seconds, zero versus absent size, invalid bounds, ignored-field rejection and safe opt-in external URLs. UI requests are explicit, old responses retain their original filter labels, cancellation preserves the draft, and the cache retains at most six result snapshots per active principal.
- **Other UI test sources:** auth reducer; search/host models; scanner model and CSV parser; export validation and stream transfer. Browser suites cover route rendering, accessibility checks, preferences, navigation, notification read state, actual sample-file download and intercepted HTTP auth behavior. Consult the release test report for the final aggregate run; test presence is not a PASS claim.
- **Files browser review:** 14 focused checks passed in Firefox, with no page errors: explicit request behavior, eight file results, three bucket groups, bucket drilldown, zero-size filtering, range validation, inclusive UTC dates, no results, exact 20 px icons and no horizontal overflow at 1440 px desktop or 390 px mobile. Four clean Files/Buckets screenshots were reviewed against the supplied Figma structure. Additional dimensions/themes/zoom must be assessed from actual browser evidence; no blanket visual acceptance is inferred from a responsive stylesheet.

Production acceptance still requires configured HTTP/WS endpoints, HTTPS/cookies/CORS/WS Origin, test identities for each plan/team role, email and external sign-in, payment sandbox events followed by authoritative entitlement refresh, safe scanner targets/cron behavior, and streamed export recovery. Backend availability, paid actions and scanning were not exercised against a customer environment here.

Historical 3868 research specifications and 548 design states are **NOT_RUN as runtime tests**. The earlier Figma delivery and its prototype frame counts describe design evidence, not implemented-route or runtime-test totals.
