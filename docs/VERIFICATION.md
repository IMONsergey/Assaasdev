# Verification — 23 October 2026

The complete local run for initial commit `507eb481` passed **TypeScript, 81 unit tests, the production build and all 19 committed browser tests**. The browser tests use Firefox with the explicit demo adapter or an intercepted local HTTP fixture. These results verify client behavior; they do not certify the customer's deployed backend.

The machine-readable record is [verification.json](evidence/verification.json). Its source fingerprint identifies the initial application/config/test files checked before publication. The committed [GitHub Actions workflow](../.github/workflows/ci.yml) runs the installed Google Chrome through Playwright’s Chromium engine and a separate container fixture; consult [Actions](https://github.com/IMONsergey/Assaasdev/actions) for remote execution results.

## Final repeatable checks

| Check | Observed result | Scope |
| --- | --- | --- |
| `npm run typecheck` | PASS | Whole TypeScript application and test configuration. |
| `npm test` | **81/81 PASS, 9 test files** | HTTP/WS transport, stateful demo, auth state, search/host/files models, scanner/CSV and export stream rules. |
| `npm run build` | PASS | Vite production build, 217 modules; live mode remains the default. |
| `npm run test:e2e` using Firefox | **19/19 PASS, zero retries** | Final committed browser suite, 39.3 seconds in the local run. |
| Dependency alignment | PASS | Package/lock direct versions and Playwright test/runtime/core agree. |
| Deployment syntax/template | PASS | Shell/Node syntax and both HTTP/HTTPS CSP substitutions; Nginx variables preserved. |
| Local Docker execution | NOT_RUN | No Docker daemon in the authoring workspace. Remote container checks are a separate CI job. |
| Customer staging/production | NOT_RUN | Actual origin, test accounts and external provider setup were not supplied. |

The production build emitted approximately 605 kB of primary JavaScript (179 kB gzip) and 98 kB CSS (18 kB gzip), plus a small QR-related chunk and local fonts. These are build artifact sizes, not a measured customer-network performance score.

### Committed browser coverage

- Seventeen workspace routes at **1440, 390 and 320 px**: visible content, no document horizontal overflow, loaded images and no uncaught page errors.
- Theme/density/text size survive reload; only `apcosys.view.v1` is stored in local storage. A 390 px / 125% text preference check is included.
- Mobile navigation focus containment, Escape, focus return and route selection.
- Axe checks for search, files, scanner, billing, account security, notifications and preferences; the crypto dialog is also checked. No violations were reported by these selected scans. This is not a blanket WCAG certification of every state.
- Real sample NDJSON download through the browser fallback; direct-save byte writes; a failed disk commit never reports completion or offers unsafe resumption.
- Notification read acknowledgement without rendering secret payload fields.
- Live-mode HTTP failure stays live and never silently creates a guest; HTTP 202 reaches the TOTP challenge before authenticated access.
- Tracked crypto address → transaction detail, exact large amount/block strings, 390 px layout, and no account/entitlement change from a received transfer.

Local command:

```sh
npm run check
APCOSYS_BROWSER=firefox \
APCOSYS_FIREFOX_EXECUTABLE=/path/to/compatible/firefox \
npm run test:e2e
```

CI uses `APCOSYS_CHROMIUM_CHANNEL=chrome` and logs the runner’s installed Chrome version. Screenshots and Playwright traces remain enabled; video recording is disabled for this channel to avoid an unnecessary encoder installation. The [reviewed runner image](https://github.com/actions/runner-images/blob/ubuntu24/20261012.334/images/ubuntu/Ubuntu2404-Readme.md) includes Google Chrome 155. The first CI run used Playwright’s downloaded Chromium 153.

## Additional scoped interaction and visual evidence

These focused passes helped find and fix defects while building the application. Their assertions overlap with the committed suite and must not be added together as a count of unique acceptance scenarios.

| Evidence | Observation |
| --- | --- |
| [Core browser report](evidence/core-browser.json) | 12 functional flows, 16 viewport checks and 18 captures; zero runtime errors. Saved-query dataset choice, nested editor, limited share, 1,000 services, scanner create/update/remove and private empty results. Eleven captures manually reviewed. |
| [Files browser report](evidence/files-browser.json) | 14 checks: explicit requests, eight files, three groups, scoped drilldown, zero-byte record, invalid-bound preservation, UTC serialization and desktop/mobile layout. |
| [Identity initial report](evidence/identity-initial.json) | Nine functional cases passed. The initial immediate billing resize failed and remains recorded. Authentication, profile, TOTP, API key, sessions/team and payment-pending flows had no page exceptions or external requests. |
| [Billing corrective recheck](evidence/billing-recheck.json) | Six checks passed: light/dark contrast, settled 1440/390/320 dimensions and mobile checkout width; zero page errors. This supersedes the initial resize observation. |
| [Index statistics report](evidence/statistics-browser.json) | Explicit loading, no request on expansion, zero/missing counters, retained snapshot after HTTP 503, manual recovery and 1440/390 layout. |
| [Crypto report](evidence/crypto-browser.json) | One focused committed browser test passed, including exact string values and dialog accessibility. |
| [Screenshot manifest](evidence/screenshots.json) | Nine unedited selected browser captures with SHA-256 checksums and source capture names. See the [gallery](GALLERY.md). |

Earlier browser failures were addressed before the final suite: a test's sign-in button selector, contrast on the Business-plan action, an invalid accessible label on a status dot and a transient billing resize observation. Export finalization was additionally hardened against disk commit failure. Successful repeat runs do not erase those earlier observations.

## First GitHub CI run and Chromium correction

[Run 39952030517](https://github.com/IMONsergey/Assaasdev/actions/runs/39952030517), on initial commit `507eb481`, passed dependency installation, TypeScript, all 81 unit tests and the production build. Its **container job passed**, including SPA routes, runtime configuration, Pending2FA HTTP202, cookie flags, preserved Origin, API errors, OAuth redirect, unbuffered streaming, explicit WebSocket CSP and a real proxy upgrade against the isolated fixture.

Chromium passed 17 of 19 browser tests. Both failures were the same reproducible layout problem: `/scanner` document overflow at 390 and 320 px. The earlier Firefox pass did not establish Chromium compatibility.

The corrective change makes the scanner table's scroll wrapper a positioned containing block. This keeps its absolute, visually hidden column labels inside the local scrolling region. It does not hide page overflow or remove table actions. The route regression additionally scrolls to the rightmost Delete action and verifies both its visibility and the unchanged document width. Failure diagnostics now attach the concrete overflow bounds for future investigation. The [local containing-block control](evidence/scanner-layout-correction.json) records the off-screen label coordinates, its parent before/after, and accessible table scrolling at both mobile widths.

The next run on `d05c5cc` passed the container again but stalled in `playwright install --with-deps chromium` before browser tests. The workflow now uses the browser already present on the official runner image; all 19 browser tests remain in place.

The current [Actions page](https://github.com/IMONsergey/Assaasdev/actions) records the corrective run independently of the initial failure. Live backend acceptance remains separate even when both CI jobs pass.

## What remains an integration gate

The client cannot establish server guarantees through fixtures. Still required on the actual staging deployment:

1. HTTPS cookies, expiry, logout/revocation, Guest/Free/Plus/Expert/Business and Owner/Member policies.
2. Email delivery, Google/Telegram configuration and callback paths, real TOTP and one-time backup consumption.
3. Website WebSocket Origin checks, quota/credit accounting, private anonymous multipart details and disconnect behavior.
4. Payment sandbox settlement followed by authoritative entitlement refresh; callback success must be distinguished from checkout creation and received transfers.
5. Real scanning of approved test targets, cron timezone, CIDR boundary semantics, costs and uncertain-operation reconciliation.
6. Large real downloads, headers, caps and Range/checkpoint recovery on the same query; native browser file-system behavior on target platforms.
7. Container deployment and staging browser acceptance on the client's intended host, including CSP and WebSocket connectivity.

The local browser suite does not cover every combination of theme, density, zoom, browser and account role. Historical **548 Figma states** and **3,868 research specifications** remain **NOT_RUN as runtime tests**. The release review lists the concrete inputs and acceptance criteria: [RELEASE-2026-10-23.md](RELEASE-2026-10-23.md).
