# APCOSYS · Application

The APCOSYS research workspace: search internet observations, inspect hosts and services, explore bucket records, manage private scans, and administer an account and subscription.

This repository contains the **working React application**, its website HTTP/WebSocket client, an explicit interactive demo, automated checks, and a container deployment. It implements the existing backend contract supplied on 22 October 2026. Identity, indexed data, scanning, payment processing and entitlements remain services of the client's backend.

**Release status:** client implementation and local browser verification are available. Acceptance against the client's actual HTTPS backend and external providers remains a separate release gate. See [release review](docs/RELEASE-2026-10-23.md), [implementation coverage](docs/IMPLEMENTATION-COVERAGE.md) and [verification evidence](docs/VERIFICATION.md).

**Latest UX release:** a reorganized navigation shell, dedicated workspace tabs, a host overview and service inspector, explicit result analytics, unified Settings, a structured billing workspace, coherent icons, loading states and responsive layouts. See the [24 October interface audit](docs/audit/2026-10-24-interface-architecture.md), [earlier workspace review](docs/audit/2026-10-24-workspaces.md), and [source-to-scenario review](docs/audit/2026-10-23-scenario-coverage.md).

**Public review deployment:** the committed `vercel.json` publishes the explicit demo build at a domain root and supports direct links to application routes. This hosting configuration is for interface acceptance; the live backend deployment uses the separate proxy configuration below. Demo state resets after a page reload.

![APCOSYS search workspace](docs/audit/screenshots/search-desktop.png)

## Run the interactive demo

Use Node 24 and the committed lockfile:

```sh
npm ci
npm run dev:demo
```

Open `http://127.0.0.1:5173`. The customer-facing interface omits demonstration badges and implementation notes. This build still starts with a synthetic Business account and stores its working state in memory. Reloading recreates that state. It makes no backend calls, sends no emails, starts no network scans and performs no real payments.

A short review route:

1. Search for `nginx`; open the first host and inspect its services, HTTP, TLS, DNS and WHOIS. The larger fixture has 1,000 service records with local paging and filtering.
2. Open **Filters**, build nested conditions, apply them, save a query and create a limited shared view.
3. Visit **Buckets & files**, choose **Search files**, inspect a zero-byte file and download an NDJSON export.
4. Open **Private Scanner**, create a task from hosts/CIDR/CSV, review the estimate and edit its schedule. Demo tasks remain queued; no scan runs.
5. Review **Billing**: Overview, Plans, Credit packs, Payments and Crypto activity. Unconfigured payment instructions are not offered as payable destinations. In-memory invoices remain pending; card checkout and the external portal report unavailable providers.
6. Review **Settings** profile, security, sessions and organization; rotate the key in **API access**. Sign out from Profile and use an identifier containing `2fa` to exercise the login challenge. Demo verification/TOTP code: `123456`.
7. Change theme, density, text size and reduced motion under **Settings**. Only these view preferences persist in local storage. Click the credit meter to inspect separate search/scan balances and open credit packs.

For signup use an 18-character password; verification does not silently log the new user in. Login/reset require at least six characters. The demo accepts validly shaped login credentials to exercise the interface; it is not an authentication service. Full fixture behavior is documented in [API integration](docs/API-INTEGRATION.md#11-explicit-demonstration-adapter).

## Product areas

| Area | Implemented behavior |
| --- | --- |
| Search | Public/private datasets, Results/Analytics tabs, explicit analytics loading, nested AND/OR/NOT conditions, UTC date ranges, field suggestions, sorting and page limits. Exact query context is retained. |
| Host details | Overview/Services/DNS/WHOIS tabs; Response/TLS/Products/Data/Web files inside a selected service; bounded service catalogs and data tables, raw observations and distinct missing/partial/error states. |
| Saved queries and sharing | Create/list/open/delete saved JSON; explicit dataset when the saved payload does not identify it; short links and separately limited links with fixed payloads. |
| Buckets and files | Supported host/key/extension/size/product/alphabet/date filters, explicit grouped analytics, drilldown, server counts and file metadata. Unsupported server filters are not presented as working controls. |
| Export | Raw NDJSON/CSV streams, public/private/task scope, documented format/record caps, cancellation, bounded memory fallback and direct file saving when the browser supports it. Real server Range recovery still needs integration acceptance. |
| Private scanner | Tasks and schedules, host/CIDR/port validation, CSV preview, six-field cron, estimate/review, schedule edits and separate task/schedule/result deletion. Uncertain mutations require reconciliation. |
| Authentication | Email/username login, signup verification, recovery, Pending2FA, TOTP/backup challenge and explicit guest entry. Google uses the backend redirect; Telegram needs the client's actual widget configuration. |
| Account and API | Pending profile/email verification, password, local authenticator QR, five one-time backup codes, sessions, Owner/Member organization and single-key rotation. |
| Billing | Server pricing, monthly/annual totals, token packs, promos, card/balance/crypto flows, payment checking, cancel/resume, history and tracked-address transactions. A redirect or received transfer does not imply an entitlement. |
| Workspace | Notifications, light/dark/system themes, comfortable/compact density, 100/112/125% text, reduced motion, keyboard navigation and responsive layouts. Current UI language is English. |
| Index statistics | Explicit loading of the seven global counters and their server timestamp, with zero distinguished from unavailable data. |

![Search results and independent analytics](docs/screenshots/search-results.png)

More actual application screenshots: [desktop and mobile gallery](docs/GALLERY.md). They show synthetic demo data, not production observations.

## Connect the existing backend

```sh
cp .env.example .env.local
```

Set `APCOSYS_DEV_API_TARGET` to the client's verified backend origin. Leave `VITE_API_BASE_URL=/backend` for the included proxy, then run:

```sh
npm run dev
```

Live mode is the default. A failed live request never switches to demo data or creates a guest session automatically. Cookie authentication needs the documented HTTPS and origin configuration; an HTTP demo does not validate a `Secure` session cookie.

The `/backend` prefix keeps SPA pages such as `GET /auth/login` separate from the backend's `POST /auth/login`. The production proxy also handles WebSocket upgrades, OAuth callback routes, short-link redirects and streaming downloads. Runtime connection settings are public configuration and must never contain credentials.

Production packaging:

```sh
npm run build
docker build --pull -t apcosys-app:release .
```

The container requires the actual `APCOSYS_API_UPSTREAM` at startup. It uses Nginx to serve `dist` and proxy the existing API on one public origin. It is independent of a specific hosting or database vendor. Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md) for startup, TLS/cookies, provider callbacks, CSP, proxy behavior and rollback. `vite preview` is only a local build preview.

## Technical choices

- **React 19 + TypeScript + Vite:** compatible with the existing client's frontend ecosystem and suitable for this authenticated workspace. No account/database migration is introduced.
- **React Router:** deep links and route layouts, including private search and authentication states.
- **TanStack Query:** bounded in-memory server state. Automatic retries and refetch on focus/reconnect are disabled because searches, facets and limited links can consume credits or uses.
- **Dedicated website transport:** credentialed HTTP, request-correlated WebSocket frames, multipart completion, isolated anonymous private-host replies and explicit unknown outcomes. It uses the website `/ws` contract, not an invented `/v1` API.
- **Native CSS tokens and local assets:** the original APCOSYS logo and artwork, official Tabler icons, local font packages, semantic themes and responsive density. No temporary Figma asset URLs are needed at runtime.
- **Vitest, Playwright and axe:** domain/transport tests plus real browser interaction, layout and accessibility checks.

Dependencies are pinned in `package.json` and `package-lock.json`; `.nvmrc` selects Node 24. No telemetry service, new identity provider or replacement database is implicitly provisioned.

## Check the application

```sh
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
```

The browser suite starts an explicit demo server and also intercepts selected live HTTP responses to check the auth boundary. Browser downloads and direct file writer failure are exercised. These checks do not use real accounts, payment providers or scanning targets.

Local Firefox can be selected with `APCOSYS_BROWSER=firefox`; install the matching Playwright browser first. `APCOSYS_FIREFOX_EXECUTABLE` is available for a separately managed, compatible Firefox executable. CI uses the Ubuntu runner’s installed Google Chrome through Playwright’s Chromium engine and separately builds/tests the Nginx container against a local protocol fixture. Set `APCOSYS_CHROMIUM_CHANNEL=chrome` to use an installed Chrome locally; that path retains screenshots/traces and does not require a downloaded video encoder.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/app` | Session controller, route layout, preferences, global notices and cache lifetime. |
| `src/api` | Website HTTP/WS contracts, 52-method catalog, errors and transport. |
| `src/demo` | Explicit in-memory fixture adapter; never a fallback for live mode. |
| `src/features` | Search, host, files/export, scanner, identity, billing and workspace screens. |
| `src/components`, `src/styles.css` | Shared accessible controls and semantic design tokens. |
| `public/assets/figma` | Original locally stored exports and asset checksums. |
| `tests` | Transport, demo, domain, export and browser checks. |
| `deploy`, `Dockerfile` | Runtime proxy, configuration and isolated container smoke fixture. |
| `docs` | Coverage, integration, deployment, verification and release handoff. |

## Design and source authority

The original [canonical Figma application](https://www.figma.com/design/lLMSuy0RrCiPhg873xpVUY/Apcosys?node-id=899-3620), the supplied [legacy SaaS design](https://www.figma.com/design/6RaLENxGqlpA6u3jGtKczc/Untitled?node-id=0-1), and the 22 October website API inform this implementation. The latest interface audit records the current structure and reference decisions. Earlier Red/R1 review models and generated research combinations remain historical material, not proof of implemented or tested behavior. Original research is retained in the existing handoff repository; it is not duplicated here.

Start with [RELEASE-2026-10-23.md](docs/RELEASE-2026-10-23.md) for the Russian handoff, the audit findings and the concrete remaining checks before customer production acceptance.
