# APCOSYS website API: client architecture and integration contract

This client implements the existing website backend contract. It does not replace the backend with a new REST API, invent successful mutations, or turn a Figma transition into server evidence. The real client is framework independent. The separately labelled in-memory demo adapter belongs to `src/demo`.

## Sources and authority

The source of truth is the pair of user-supplied documents dated **22 October 2026**, preserved without edits in the APCOSYS handoff repository:

- [English original](https://github.com/IMONsergey/apcosaas/blob/2970396891c2dad38fa0459e668aabee3ed6cd21/docs/api/2026-10-22/web-api.md), SHA-256 `c26e659b8a058e98cfea723705138d03b142a7322077b71f116a6b27163223a4`.
- [Russian original](https://github.com/IMONsergey/apcosaas/blob/2970396891c2dad38fa0459e668aabee3ed6cd21/docs/api/2026-10-22/web-api.ru.md), SHA-256 `e0058c49226e3f3cba3fda851816c98f159be9d66242b819a32a3320a2d80c8a`.
- [Design implementation boundaries and acceptance](https://github.com/IMONsergey/apcosaas/blob/design/saas-handoff-2026-10-23/docs/release/2026-10-23/developer-handoff.md).

Sections named below refer to those originals. Runtime behavior still needs verification against the actual deployed version. The English per-method description explicitly states that private host details omit `id`; the Russian generic response table is less precise. This client handles the stricter explicit case without assuming that arbitrary concurrent anonymous responses can be correlated.

## 1. Public interface

Import the real transport and DTOs from `src/api/index.ts`:

```ts
const api = createApiClient({ apiBaseUrl: 'https://configured-api-origin.example' });

const login = await api.httpResponse<{ message: string }>('/auth/login', {
  method: 'POST', body: { identifier, password },
});
if (login.status === 202) {
  // Enter Pending2FA; do not open protected routes or WebSocket yet.
}

const frame = await api.request<HostCard[]>('hosts', appliedSearch, { signal });
const stop = api.stream<FacetData | CompleteData>('analytics', appliedSearch, {
  signal, onFrame, onError, onComplete,
});

const response = await api.raw('/download/bulk/stream', {
  method: 'POST', body: exportRequest, signal, mutation: false,
});
// Consume response.body incrementally. It is not a JSON envelope.
```

| API | Meaning |
|---|---|
| `url(path)` | Resolves a website route using the configured origin/proxy prefix. Use for browser OAuth navigation. Rejects other origins and non-HTTP schemes. |
| `httpResponse<T>(path, options)` | Credentialed HTTP; returns `{data,status,headers}`. Preserves login's HTTP 202. |
| `http<T>(path, options)` | Same operation, returns only `data`. Use when HTTP status is not part of the state transition. |
| `raw(path, options)` | Credentialed HTTP with normal error handling, returning a successful `Response` with unread streamed body. |
| `request<T>(type, data, options)` | Returns the first matching response frame, by unique request `id`. Default accepted type is the request type. |
| `stream<T>(type, data, options)` | Returns a **synchronous unsubscribe function**. Delivers multipart responses through callbacks; opens the connection internally. |
| `subscribe(listener)` | Receives every valid frame, including errors, metadata, pushes and follow-up lists. It is not a second promise resolver. |
| `connect`, `disconnect` | Explicit connection lifecycle. No login, guest fallback or automatic reconnection/replay is performed. |
| `getConnectionStatus`, `subscribeConnection` | `idle`, `connecting`, `open`, `closed`, `error`. Describes the main multiplexed socket. |

`HttpOptions.body` is JSON encoded. A supplied body defaults the method to POST; otherwise the default is GET. All HTTP requests use `credentials: 'include'`. Browser-managed cookies authenticate WebSockets. Neither session cookies nor bearer tokens are stored in local storage by this module.

Local default budgets are 10 seconds for connection establishment, 30 seconds for a single operation, and 60 seconds for a multipart operation. These are client budgets, not backend promises. `timeoutMs: 0` disables the operation budget. For `raw`, the budget ends at successful response headers; the supplied `AbortSignal` continues to abort body consumption. JSON requests retain the budget while reading the body. A stream can be unsubscribed without closing unrelated requests on the main socket.

## 2. Errors and operation outcomes

HTTP errors contain `{error: string}` plus an HTTP status. WebSocket errors contain a human-readable `error` string, with **no numeric error code or HTTP status**. `(402 Payment Required)` inside an error string is text, not a separately transmitted status. Some originals differ in leading whitespace: preserve the original message, normalize only for classification.

`ApiError.kind` is a client classification: `auth`, `rate`, `timeout`, `unknown`, `transport`, or `server`. Optional details are `status`, `method`, `requestId`, `retryAfterSeconds`, `frame`, `cause`, and `outcome`:

- `not-sent`: rejected locally or interrupted before transmission.
- `rejected`: an explicit server rejection was received.
- `unknown`: an operation may have reached the server but its final outcome is unconfirmed. This also covers lost billable-read responses; the server might have charged them.

A sent mutation interrupted by timeout, abort or disconnect uses `kind: 'unknown'`. An explicit mutation error beginning with `Failed` retains `kind: 'server'` and conservatively marks `outcome: 'unknown'`: for example, enabling TOTP may succeed before backup-code persistence fails. UI code must inspect `outcome` as well as `kind` before offering repetition.

No HTTP or WebSocket operation is automatically retried. Set **TanStack Query `retry: false` for billable reads**, not only mutations. The backend's same-payload billing grace window has no documented duration and is not an idempotency guarantee.

`metadata.auth_required` and HTTP 401 indicate that the auth controller should resolve the session state. A plan rejection is not automatically a sign-in failure. Rate limits do not imply a fixed one-minute countdown. Registration 429 has `retry_after_seconds`; otherwise use an actual `Retry-After` when present, or an unspecified wait.

Sources: EN “General”, “Errors”, “Metadata”, HTTP signup and TOTP sections.

## 3. WebSocket protocol and response lifecycle

The endpoint is **`GET /ws`**, with a valid `session_id` cookie. An absent, expired or Pending2FA session rejects the HTTP upgrade with 401. Browser WebSocket events do not expose the HTTP upgrade body; the session controller must inspect `GET /whoami` if it needs that distinction.

Requests are UTF-8 JSON text:

```json
{"type":"hosts","id":"client-generated-unique-id","data":{"page":1,"docs_per_page":20}}
```

One main socket multiplexes independent requests. The client does not rely on response order. Binary frames are outside the contract. `data: null`, `false`, `0`, an empty array and an empty object are valid data values and are not treated as a missing response.

| Operation | Response policy |
|---|---|
| Ordinary request | First matching `type`/`id` resolves `request`. |
| `analytics`, `private_analytics` | One frame per facet; final `{complete:true}`. |
| `hostinfo` | Four unordered frames with the same `id`: `hostinfo`, `dnsinfo`, `whois`, `domain_ip_map`. Every section can independently be empty/null. |
| `private_hostinfo` | Three success frames **without `id` or metadata**: `private_hostinfo`, `dnsinfo`, `whois`; no domain map. Each invocation gets a dedicated socket, closed after all three sections or cancellation. |
| `private_task_add`, `private_task_remove` | Acknowledgement plus `private_tasks_get`, with the same `id`. |
| `private_planning_task_remove` | Acknowledgement plus `private_planning_tasks_get`. |
| `terminate_user_session`, `terminate_all_sessions` | Acknowledgement plus `user_sessions`, with the same `id`. |
| `confirm_payment` | Multiple updates. `completed` is documented. No complete status enum/final marker is specified; unknown statuses remain visible. |

For multipart methods use `stream`. A single `request` does not aggregate the subsequent frames. Follow-up frames remain visible through `subscribe` even after the acknowledgement promise settles. A multipart timeout does not erase previously received sections in UI state.

`unread_notifications` and `high_load_status` are unsolicited pushes with an empty `id`. They are sent to accounts, not guests. Task follow-ups have a request `id`; they are not generic push events. On close, server work associated with that socket is cancelled. There is no documented per-request cancel operation; aborting a request on the shared socket only stops the local consumer.

The isolated private-detail strategy is a client safety measure, not confirmation of deployed connection limits or backend ordering. Verify it with two simultaneous private details before runtime acceptance.

## 4. Session and authentication state

The backend cookie is `session_id`, `HttpOnly`, `Secure`, `SameSite=None`, `Path=/`, with 100-day persistence. It must be delivered to the configured HTTP and WebSocket origin. Keep app auth state separate from socket connection state:

`unknown → anonymous / guest / pending2fa / authenticated`; transport failure remains a separate condition and must not silently replace an existing account cookie with a guest cookie.

| HTTP route | Body / response and state |
|---|---|
| `POST /auth/signup` | `{email,user_name,password}`; unknown fields rejected; signup password minimum **18**. 200 sends email code, 409 duplicate email/name, 429 includes actual retry seconds. Exact username length/format/blocklist are not supplied. |
| `POST /auth/verify` | `{email,code}`; six-character code. 200 creates a Free account and may migrate the guest profile. The document does not promise an authenticated cookie here; continue through login/session verification. |
| `POST /auth/login` | `{identifier,password}`; identifier is email **or username**, password minimum **6**. 200 authenticated; **202 Pending2FA** with cookie. Unknown fields rejected. |
| `POST /auth/totp/verify` | Exactly one of `{code}` or `{backup_code}`, using the pending cookie. On 200 authentication completes. A used backup code is removed. |
| `POST /auth/password-recovery/request` | `{identifier}`. Missing account still receives the generic 200 response. Do not reveal account existence. An account without email can return 400. |
| `POST /auth/password-recovery/confirm` | `{identifier,reset_code,new_password}`; new password minimum six. Invalid/expired token is 401. |
| `POST /auth/guest` | Empty body. Creates/refreshes guest, 200 `{success:true}`. Guest profile TTL is 180 days, independent of cookie persistence. |
| `GET /whoami` | Account profile, or guest profile when enabled. **`WHOAMI_GUEST_ENABLED=0` means a guest cannot use this response shape.** Avoid a guest-recreation loop on this 401. |
| `GET /auth/logout` | Deletes **all account sessions**, expires cookie. This is not “sign out only here.” |
| `POST /auth/password-reset` | Authenticated `{old_password,new_password}`, both minimum six. |
| `POST /profile/update` | `{email,user_name,password,totp_code}`. Pending change lasts 15 minutes; current email remains until verification. For an account with no email, password is a new password; otherwise it is the current password, with TOTP when active. |
| `POST /profile/verify` | `{code}`, applies the pending profile change. |

For Google, navigate the browser to `api.url('/auth/google')`. The server redirects to Google and handles its callback. TOTP users return to `/login?2FA=true`. Telegram begins with JSON `{state}` from `/auth/telegram`, then the configured Telegram widget; its callback still lands at the frontend root for Pending2FA. The document explicitly says Telegram callback does not consume that state value. Do not implement cryptographic callback handling in the frontend or fabricate a bot identity. Account linking uses `/google/link` and `/telegram/link`, with their callbacks, rather than login callbacks.

Authenticated session tools are `user_sessions`, `session_limits`, `terminate_user_session {session_id}` and `terminate_all_sessions {}`. Limits are Free/Plus/Expert/Business **1/3/5/10**. Ordinary login evicts the oldest session at the cap; the OAuth callbacks delete previous sessions. `terminate_all_sessions` keeps the current socket session. `GET /auth/logout` deletes every session.

TOTP enrollment is WebSocket `totp {}` then `totp_validate {totp_code}`. The temporary secret lives 15 minutes; confirmation issues five one-time eight-character backup codes. There is no documented endpoint to recover those same codes or disable TOTP. After a lost confirmation response, refresh `whoami.totp_active`; do not silently restart enrollment or invent recoverable codes.

Source: EN “Session and identity”, “Account, team, sessions, 2FA”, “Website HTTP”; RU `WHOAMI_GUEST_ENABLED` and OAuth details.

## 5. Search, facets, saved queries and sharing

`SearchRequest` keeps the backend's field names, including capitalized **`cve_ID`**. It contains `ip`, `host`, `task_ids`, `simple_search_filters`, `full_text_search`, `security_body`, `robots_body`, `exposed_data`, `sort_field`, `sort_direction`, `page`, `docs_per_page`, size bounds and `range_filter`.

A filter leaf is `{field,value}` with string value. A group is `{operator:'AND'|'OR'|'NOT',filters:[...]}`. Ranges are `{field,start,end}` with numeric or string boundaries. Do not invent a server DSL parser for arbitrary text: free text maps to `full_text_search`, and the structured editor maps to the filter tree. Keep draft and applied state separate. Applying a new search resets page; cancellation restores the applied snapshot.

Use query keys containing principal, dataset, task scope and the full serialized applied request. Ignore late response generations instead of allowing them to overwrite a newer request. Keep search rows, facets and each detail section in independent loading/partial/error states.

| Method | Input / output |
|---|---|
| `hosts`, `private_hosts` | Search object → `HostCard[]`. There is **no total count or has_more**. A full page can justify offering a next-page attempt, not an invented total. |
| `analytics`, `private_analytics` | Search object → facets followed by complete. Public cost `ceil(loaded facets/4)`; private default one credit. |
| `autocomplete` | `{query,field?}`. Query cannot be empty; `*` requests first ten. Omitted field requests field names. At most ten results, `has_more` is true when exactly ten. `context` is ignored for dispatch. |
| `analytics_settings` | `{facets:[{key,enabled,priority}]}`; unknown/empty keys dropped. Works for guests. |
| `analytics_settings_delete` | Clears saved preferences. Current account list is `whoami.analytics_facets`. |
| `hostinfo`, `private_hostinfo` | `ip` plus applicable search/task context; multipart as above. Render raw HTML/banner/body values as text rather than executable markup. |
| `cveinfo` | `{cve_ID}` → CVE document; empty `cve_id` means no cached record. |
| `query_create` | Stores the **entire data JSON object**, not only the visible text field. Plus+, max20 records. |
| `query_list` | Array of `{id,query,created_at,updated_at}`. `query` is the original JSON **string**. Parse and validate when restoring; preserve the complete context. |
| `query_delete` | `{id}` from the selected saved record; 24 hex characters. The request envelope `id` is unrelated. |
| `short_link_create` | `{query}` frontend query string, max8192. A full URL is reduced to the portion after `?`. Returns short URL. |
| `share_link_create` | `{data:searchBody,query,ttl_seconds?,max_opens?}`. Defaults seven days/ten uses. Returns short/long URLs and `share_token`. |

Plan page caps are **2/25/150/300**, page size maximum **50** on every plan. Guest allowance is **20 billable WebSocket calls per IP and session per UTC day**, not twenty whole search journeys. A separate analytics/detail call can consume another allowance. Metadata credits appear only after a charge; absence does not mean zero. Apply timestamped balances carefully so a late older frame does not overwrite a newer balance.

Facets `type`, `org`, `country_name` count hosts. Other facets count records. `unique_hosts` does not exist. Do not sum facet buckets to manufacture total hosts. Do not label local filtering/pagination of `hostinfo.ports` as server-side matched-service search.

A shared request uses the **creator's identity**. After removing `st`/`share_token`, its body must hash to the originally stored body. Changing page, filters, task IDs or adding a host `ip` can invalidate it. Every token-backed request spends a use. Prefer explicit facet loading for a share viewer and explain its cost; do not invisibly spend several of ten uses on initial rendering. No public-share entitlement beyond the six documented host/analytics/detail methods is implied. The WebSocket upgrade still requires a valid cookie; confirm guest/share bootstrap on the deployed backend.

Every decoded frame carries client-only `context.principal`: `account` for an active request using the viewer’s cookie (including an explicit guest), `shared` for an active token request, `push` for recognized unsolicited pushes, or `unknown` for unmatched/late frames. This field is derived locally from the outgoing request; any wire-supplied `context` is overwritten. **The global account balance, plan and restrictions must update only from `account` frames.** Shared metadata describes the creator and can be used inside that request’s result view. Unknown late replies cannot establish the current balance. Private detail uses its isolated request context even though its wire frames omit IDs.

Sources: EN “Search”, “Credits and plan access”, “Saved queries, short links, share links”; RU exact-body hash rule.

## 6. Scanner and private datasets

Private operations require Business or a server-configured full-access role. `FULL_ACCESS_ROLES` is backend configuration; do not hardcode an administrator name to bypass client gates. The server remains authoritative.

| Method | Payload and behavior |
|---|---|
| `private_task_add` | `{host_list?,cidr_list?,port_list?,schedule?}`. Returns `{task_id,message}` and then task list. |
| `private_task_update` | `data.id` required, with edited task fields; forwarded to scanner as task_id. |
| `private_task_remove` | `{id}`; removes task and returns refreshed tasks. Do not claim a distinct “stop scan” operation. |
| `private_planning_task_remove` | `{id}`; removes plan and refreshes planned tasks. |
| `private_tasks_get` | Array including status/progress, target lists, result_count and has_results. |
| `private_planning_tasks_get` | Array including id, schedule, target lists and server workers. |
| `private_task_results_delete` | `{task_ids:[...]}`; deletes stored results. Distinct from deleting a task or schedule. |
| `private_hosts`, `private_analytics`, `private_hostinfo` | Normal search request plus `task_ids`; preserve that scope across results, detail and export. |

Empty ports become **22,21,80,443,3306,5601,8080,8443,9200,27017**. Create ignores `workers` and uses **500**. Do not expose workers as a functioning control.

Estimated scan credits are `(host count + CIDR address count) × port count`; IPv4 excludes network and broadcast addresses. Do not assume host/CIDR overlap is deduplicated. Use safe arithmetic for large ranges and show the estimate before submit; the server balance/error is authoritative. CIDR validation and port validation should occur before a billable create. Actual IPv6, /31 and /32 edge behavior needs a backend trace rather than invented rules.

Schedules have **six cron fields including seconds**: `sec min hour day month *`. Empty create schedule means a one-shot roughly ten seconds ahead. The timezone, complete accepted cron grammar and duplicate/update semantics are not fully specified. A day-of-month step is not an exact elapsed every-N-days interval. Preserve the chosen raw schedule and avoid promising local-time behavior without environment configuration.

A lost task creation response is UNKNOWN. Refresh task/planning lists, compare known context and let the user resolve ambiguity; do not create another paid scan automatically. Task status is a string; preserve unfamiliar values. `task_count=0` must not produce an invalid percent. There is no documented scanner-status push subscription or cancellation endpoint.

Source: EN “Private scanning” and task structures.

## 7. Billing and entitlements

Keep these values separate: subscription entitlement, money balance, search credits, scan credits, purchased credits, checkout session, payment status. Team members spend their owner's search credits. Numeric API fields override contradictory descriptive copy: the Plus example says50 pages in its description but `search_pages` is25.

| Method | Parameters / result |
|---|---|
| `get_pricing_info {}` or `GET /pricing` | `{subscriptions,tokens,timestamp}`. Pricing plans use `monthly_price`, `annually_price`; the latter is the full annual charge. |
| `validate_promo_code` | `{promo_code,subscription?,cadence?,token_pack_id?}` → valid, original/final USD values and discount details. Do not subtract the discount again. |
| `init_checkout` | Exactly one of `subscription` or `token_pack_id`; plan cadence is `monthly`/`annually`. Optional currency, promo, apply_discount, return_url, cancel_url. Returns checkout_url, transaction_id, status, product_type. |
| `billing_manage {}` | Returns `portal_url`; invoices/payment methods are managed in the provider portal. |
| `networks {}` | Supported network/coin list; use its identifiers. |
| `get_address` | Purchase parameters plus network/coin → crypto invoice, payment_id, amount/address/expires_at. Valid60 minutes. |
| `pay_with_balance` | Purchase parameters, no network/coin. Changes the internal money balance; do not retry an uncertain outcome. |
| `confirm_payment` | `{payment_id}` multipart status observation. `completed` is documented. |
| `user_billing {}` | Authoritative payments, subscription, money/search/scan balances. Refresh `whoami` for access after payment. |
| `get_user_addresses_info {}` | Tracked address summaries. |
| `get_address_transactions` | `{address}` → raw string amounts, decimals, tx hashes and status. Preserve raw precision. |
| `delete_payment` | `{payment_id}` → moved_to_deleted. **Not a refund.** |
| `cancel_subscription`, `resume_subscription` | No fields; benefits remain until expiry after cancel. No invented proration/refund behavior. |

Provider return, checkout `status:'success'`, a `payment_received` push and wallet transfer observation do **not** establish a paid entitlement. Use separate states: checkout created, checking, pending, unknown, payment completed, entitlement pending, access refreshed. An uncertain payment must not offer an automatic second payment.

Account subscription `duration` is nanoseconds; most timestamps are Unix **seconds**. The pricing plan's duration example is a string such as `30d`. Do not pass all three formats through the same date parser.

The catalog deliberately excludes historical non-dispatched methods: `fields`, `networkHistory`, `networks_history_aggregation`, `buy_credits`, `credits_status`, `get_token_pack_prices`, `get_subscription_pricing`, `get_token_pricing`. They return Unknown request type on the documented backend.

Source: EN “Billing” and billing structures; RU non-dispatched method list.

## 8. Files and downloads

Buckets use `buckets`/`bucket_analytics`, Plus+, with page/size, host/container, key/stop words, extensions, alphabets, product_names, size bounds and inclusive created/updated Unix-second ranges. Sort field is cts/uts/size_mb. Country include/exclude and excluded_buckets are accepted but **ignored** by the handler; do not claim those filters function.

Business export routes:

- `/download/bulk/stream` and `/download/private/bulk/stream`: search object plus format, download_mode and max_documents. `partial` supports JSON/NDJSON or CSV up to1,000,000; `full` supports JSON/NDJSON only, up to10,000. `format:'json'` means NDJSON, not a JSON array. Default requested limit10,000.
- `/download/buckets/stream`: bucket filter plus format json/csv and mode files(default)/hosts. File cap1,000,000; host cap10,000.

Use `raw` and stream bytes. Preserve exact request context in a retry/resume descriptor. The document describes `Range` resumption at 1MiB checkpoints for the same body, but exact status/headers/checkpoint negotiation still needs integration testing. Do not advertise resume as verified before that trace exists.

A returned response, a completed stream, a browser handoff and a file successfully written are separate outcomes. Read errors after headers must retain partial/failed status. Do not buffer an unbounded million-record export into memory or mark success on receiving its URL. The app does not invent a persistent export-job service.

Source: EN “Buckets” and “Website HTTP” download routes.

## 9. Integration dependencies and remaining uncertainties

The frontend implementation can be built against this contract now. Real-environment acceptance additionally needs:

1. **Actual backend HTTP/WebSocket origins and deployed version.** The documents contain illustrative hostnames, not production configuration.
2. **Cookie/CORS/WS Origin setup**, HTTPS in deployment, allowed frontend origins, and OAuth frontend/callback configuration. Guest whoami flag must be known.
3. **Test identities/plans/team roles**, with safe scanner targets and payment sandbox configuration. No real charges or scans are implied by frontend tests.
4. **Private detail trace** confirming missing IDs and simultaneous dedicated connections, including partial errors and disconnects.
5. **Payment status progression and entitlement refresh**; a complete status enum/final stream marker is not supplied. Provider callbacks belong to the backend.
6. **Scanner schedule timezone/grammar and idempotency.** No client idempotency key, mutation transaction ID, server cancel request or retry guarantee is documented.
7. **Export stream headers/range behavior and supported browser save paths.** A complete server stream is not evidence of successful disk persistence.
8. **Guest/share bootstrap and use accounting**, exact shared-payload encoding, and treatment of attempts to open host details or paginate shared data.
9. **Unavailable operations** must remain explicit: email resend, TOTP disable/recovery of old backup codes, email invitations, API-key scopes/multiple keys, arbitrary monitoring and new workspaces have no documented operations here.

## 10. Verification boundary

`tests/api/client.test.ts` uses fake WebSockets and fetch responses. It verifies out-of-order correlation, anonymous private-detail isolation, multipart completion, same-id follow-ups, pending payment, HTTP202, exact error text, metadata, cancellation, streamed bytes and no retry of uncertain mutations. These are executable client tests; they do not certify a deployed backend.

Historical handoff counts (548 Figma states and 3868 research specifications) remain historical **NOT_RUN** until individually executed. They are not the count of current transport tests or application acceptance. Real integration status should be recorded separately by route, principal, environment and observed response.

## 11. Explicit demonstration adapter

`src/demo/index.ts` exports `createDemoApi(): ApiClient`. This is a separate, in-memory adapter: it never invokes fetch or WebSocket, never becomes a live fallback, and resets when the page/application is recreated. It starts as Business account **alex_research**, `alex@example.com`. All host addresses use documentation networks or example domains. Public fixtures do not claim vulnerability associations; CVE dialogs and large association sets are exercised with isolated browser-test responses. The 12 hosts include 100-service and 1000-service detail cases; buckets contain eight files including an observed zero-size file.

| Demonstration | Observable result |
|---|---|
| Search / host details / analytics | Nested conditions, ranges and supported fields; public four-part detail, private three-part detail without IDs; complete facet streams. Unknown fixture fields fail explicitly. |
| Saved queries / links | Exact JSON preserved; selected-record deletion and 20-query cap. Link URLs carry a full local search query. Limited tokens enforce exact payload, expiry and use count **within the current adapter only**; links are not persistent across page recreation. |
| Scanner | Three seeded tasks and one schedule. Create deducts local scan credits, creates a queued record with zero results, and never runs a real scan. Task removal, schedule removal and result deletion change different state. |
| Login / signup | Valid nonempty identifiers and six-character login passwords are accepted for review; this is not credential verification. Identifiers containing `2fa`, or an enabled demo TOTP, return HTTP202. Signup requires18 characters; email verification creates Free without login. |
| Codes / profile | Use `123456` for verification, recovery, TOTP enrollment and login. Pending profile changes retain the current email and expire after15 minutes. Enrollment issues five eight-character codes `DEMO0001`–`DEMO0005`, each single-use in the adapter. |
| Error fixtures | Signup `taken@example.com` gives409; `rate@example.com` gives429 without an invented retry deadline. Team IDs containing `missing` or `other-team` demonstrate those rejection states. |
| Sessions / team / API | End other sessions preserves current. Logout removes all. Team membership changes by user ID. Rotation replaces the one demo key and emits the documented unread-notification wrapper. |
| Billing | Four plans and two token packs; WELCOME gives a local10% promo. Crypto network `demo-network`, coin `DEMO`, and the invalid-for-payment address are fixtures. Invoices remain pending; no real or simulated financial completion changes money or entitlement. Card checkout and customer portal fail explicitly because no provider is connected. Cancel/resume updates local subscription settings only. |
| Crypto activity | One inactive, invalid-for-payment tracked address and one synthetic `received` transaction. Raw token units and block numbers exceed safe integer precision and remain strings; decimals are separate. No transaction is settled or credited. |
| Export | Raw bounded fixture NDJSON/CSV with the same request validation; full CSV is rejected. Live Range/checkpoint negotiation is explicitly unavailable in demo. |

The guest quota is20 billable calls per UTC day and does not reset when a guest session is refreshed. A new adapter resets the whole demo. OAuth/Telegram redirects are disabled in the demo UI. Password forms exercise validation and transitions; the adapter deliberately does not provide real password authentication or send email.

`tests/api/demo.test.ts` adds 20 executable stateful tests. Together with 26 real-transport unit tests, **46 API/demo tests passed** on 23 October 2026. Seven additional file-filter model tests passed. These results verify client logic and local fixtures only; the deployment dependencies in section 9 still apply to live acceptance.
