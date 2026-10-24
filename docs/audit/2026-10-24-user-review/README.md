# APCOSYS workspace review — 24 October 2026

Baseline: `98bf594d5b2075fc8fa489c44fff42d372b24718` in `IMONsergey/Assaasdev`.

This update implements the 17-item visual review of the SaaS application. The marketing website is a separate project. The published Vercel application remains an explicit demo; these changes do not constitute live backend, payment, email or scanner acceptance.

## Review coverage

| Item | Implementation |
| --- | --- |
| 1 | Stable host service catalog and detail region, with separate desktop scrolling and existing mobile list/detail navigation. |
| 2 | Common control alignment and minimum button heights in settings. |
| 3 | Shared row-action buttons for organization members and existing confirmation flow. |
| 4 | Useful Files/Buckets examples, rich synthetic fixtures, middle ellipsis and full object-key access for names over 1,000 characters. |
| 5 | Global header removed; notifications and credits moved into the sidebar; Scenarios remains available through Support. |
| 6 | Catalog pagination and selected service update together; obsolete off-page selection banner removed. |
| 7 | Compact labeled search actions replace square magnifiers on host facts. |
| 8 | Shared code canvas follows light/dark theme, including host response blocks. |
| 9 | Removed unnecessary sidebar/catalog borders while retaining separators that distinguish table rows, dialog actions and field groups. |
| 10 | Demo Data contains 72-row and 2,048-row examples, with an explicit route to services containing data. |
| 11 | security.txt and robots.txt summaries use returned metadata or parse the actual returned body. No fabricated verification state. |
| 12 | Shared filter actions use Plus. |
| 13 | Save/Share use shared dialogs, preserve search state, and support confirmation, copying and uncertain outcomes. |
| 14 | Shared modal footer alignment, body scrolling and mobile stacking. |
| 15 | Original SVG logo, animated CSS gradient, dot pattern, short session entrance, reduced-motion support and search focus. |
| 16 | Files/Buckets uses a single aligned command row and useful starting examples. |
| 17 | Scenario payment icons use one consistent container. |

## API documentation

Source: <https://apcosys.net/docs/api>, read from the official page on 24 October 2026.

The new `/api?section=docs` reference covers all eight documented public REST endpoints, authentication, filter syntax, schemas, plan limits and errors. It includes search, deep links and cURL/JavaScript/Python examples. These examples do not execute from the page and never embed the current account key. The REST documentation is distinct from the existing website WebSocket contract.

## Verification

- Local TypeScript check: passed.
- Local unit suite: 205 tests across 31 files passed.
- Live-mode production build: passed.
- Demo production build: passed after the visual integration pass.
- All eight examples in each language (JavaScript, Python and cURL) passed syntax validation without sending requests.
- Container CI: SPA routing, cookies, errors, streaming and WebSocket proxy checks passed.
- Automated browser checks and the final release head are recorded in [pull request #1](https://github.com/IMONsergey/Assaasdev/pull/1).

### Interactive browser review

Reviewed the deployed demo at a 1,363 × 936 desktop viewport, using the application controls rather than modifying page state:

- Search entry, results, Save and Share dialogs; the dialog footer actions have matching 44 px heights and baselines, and opening either dialog preserves the results URL.
- Host Response, TLS, Products & CVE, Data and Web files: the catalog and detail region stay at 888 px across all five tabs. Measured results are in `after/host-tab-metrics.json`.
- Parsed security.txt contacts, policy, languages and canonical URL; robots.txt reports the actual user agents, rule counts and sitemap from its displayed source.
- Files and Buckets start states and populated results. A 1,005-character basename keeps its ending visible without horizontal page overflow; the complete 1,018-character object key remains accessible in the details dialog.
- Settings workspace controls and organization row actions. Member removal opens a confirmation with aligned actions; the review cancelled the removal.
- Notifications, Scanner tasks and schedules, Billing overview and payment history, and Scenarios reached through Support.
- API documentation in light and dark themes, field search and deep links, endpoint examples and the expandable TLS schema.
- The login screen uses the original SVG logo over the animated CSS gradient and dots. Guest entry visibly passes through Welcome and ends with focus in the search field.

The first full browser run identified a focus regression after reloading search results. The entrance now focuses the input only on the empty search screen; restored results receive main-content focus. Autocomplete requires input, pointer or arrow-key intent. The same review corrected light code-caption contrast, persistent visual distinction for inline documentation links, and tests that still expected the former Share page and filter icon.

All browser data in these examples is synthetic. No real payment, email delivery, scan submission or team deletion was performed during interactive review.

Twelve mobile CI screenshots were visually inspected, covering Files/Buckets at 320 px, host catalog and details at 360 px, Data at 390 px, API documentation at 320/390 px, account navigation at 320 px and in 667 px landscape, filters and settings. No additional grid or overflow defect was found. Four unmodified images are retained below. They originate from CI run `40094697678`, review commit `99f07213c2a2b25b26c66422d7e6dcf7fb2e521e`.

## Evidence

`before/buckets.jpg` records the previous published Files/Buckets layout using synthetic demo data. `after/` contains actual browser screenshots from the review candidate, plus selected mobile evidence from CI. The desktop preview includes Vercel's small review-toolbar button; it is not part of the APCOSYS interface.

| Area | Evidence |
| --- | --- |
| Headerless workspace | [Search](after/search.jpg) |
| Search dialogs | [Save](after/save-query.jpg), [Share](after/share-search.jpg) |
| Host investigation | [Data](after/host-data.jpg), [security.txt](after/host-security.jpg) |
| Storage search | [Start](after/files-start.jpg), [long filename](after/files-long-name.jpg), [full key](after/file-details.jpg), [Buckets](after/buckets.jpg) |
| API reference | [Light](after/api-docs-light.jpg), [dark](after/api-docs-dark.jpg) |
| Account and operations | [Workspace settings](after/settings-workspace.jpg), [Scanner](after/scanner.jpg), [Notifications](after/notifications.jpg), [Billing](after/billing.jpg) |
| Authentication | [SVG logo, gradient and form](after/auth.jpg) |
| Mobile storage and hosts | [Files 320 px](after/mobile-files-320.png), [catalog 360 px](after/mobile-host-catalog-360.png), [details 360 px](after/mobile-host-details-360.png) |
| Landscape navigation | [Account menu at 667 px](after/mobile-navigation-landscape-667.png) |
