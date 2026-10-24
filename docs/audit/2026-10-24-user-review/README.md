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
- Demo production build: passed before the final integration pass; deployment builds verify the final commit.
- All eight examples in each language (JavaScript, Python and cURL) passed syntax validation without sending requests.
- Browser verification and CI results are recorded below when complete.

## Evidence

`before/buckets.jpg` records the previous published Files/Buckets layout using synthetic demo data. Screenshots of the verified update are added under `after/`.
