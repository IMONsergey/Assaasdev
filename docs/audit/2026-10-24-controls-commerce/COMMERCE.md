# Billing and checkout audit — 24 October 2026

Scope: `src/features/billing/*`, the isolated presentation payment adapter, its persistence and focused regression tests. This report records the commerce work before the root agent's final immutable integration gate. No commit or publication was performed by the commerce agent.

## Completed changes

- Desktop Plan details expand and collapse together; mobile plans expand independently. Feature rows, actions and prices align. Unknown optional features and the duplicate API access row are omitted. Price reels, restrained hover effects and disclosure transitions respect reduced motion.
- All seven credit packs and their prices remain intact. The layout uses three desktop columns, four on wide containers, two at intermediate sizes and one on mobile. Deterministic SVG signal covers provide visual identity without raster assets or animation loops.
- Payment history opens a separate order page from both the row and a link. Returning preserves history search, status, sorting, row count and pagination.
- `/billing/payments/:paymentId` shows the order item, amount, discount, method, status, dates, activity and receipt. It supports resume, retry, loading, errors and missing records.
- `/billing/checkout/:paymentId` completes local card and cryptocurrency flows through review, explicit confirmation, processing, receipt and order details. Cancel, expiry and retry preserve the product, cadence, promo, network and coin.
- Crypto activity loads read-only information when its tab opens. Account references, totals, dates and transaction details are populated. Exact raw units remain accessible through a disclosure; live amount and block-number strings retain their precision.
- Annual Business invoice requests open an editable support draft. The local Payment methods & invoices dialog provides a saved payment profile and links to receipts, crypto activity and invoice requests.
- Stable onboarding hooks connect the flows to the scenario guide. App routes were integrated by the root agent; scenario catalogue and walkthrough changes belong to the shell/journeys agent.

## Presentation and LIVE boundaries

The `presentationPayments(api)` capability is registered only by `createDemoApi`. It does not construct a network request, invoke a payment provider, connect a wallet or collect card credentials. The card profile displays only a masked card ending in 4242. The cryptocurrency QR encodes an `apcosys:order:APCO-ORDER-…` reference, not a payable wallet address. No visual demo labels were added.

Presentation cryptocurrency choices are Ethereum / ETH and Ethereum / USDT, matching the methods reported in the client's public FAQ. ETH uses a deterministic fixture quote of 2500.00 USD and USDT uses 1.00 USD; these are not market feeds. `cryptoAmount` and `quoteUsd` are decimal strings, stored and validated with the order. Checkout, history, summary and receipt distinguish the token quantity from the USD total. Unsupported sample choices USDC and Polygon were removed.

LIVE `init_checkout`, `billing_manage`, `networks`, `get_address` and confirmation contracts remain separate. Existing secure external-URL validation and unknown-outcome/wallet recovery behaviour are preserved. Local direct legacy API placeholders remain non-payable; the presentation UI uses its explicit capability instead of fabricating provider redirects or live API responses.

Receipts download as text containing the known payment and order facts. No tax invoice, company tax ID, bank details or legal receipt metadata is invented. Business requests remain reviewable drafts and do not send messages automatically.

## Reload, ownership and settlement ordering

The same browser tab can restore its local seed-account purchase ledger from `sessionStorage`. The bounded snapshot has a 24-hour TTL, a 64 KB size limit, a 100-order limit, an owner and schema validation. It stores purchase context, quotes, status and timestamps, not profiles, authentication credentials, card data or wallet credentials. Invalid or unavailable storage falls back to the in-memory adapter. Other presentation workspace state retains its existing in-memory behaviour.

Restoration starts from the initial account and replays completed purchases once, including completed purchases whose history records were removed. Repeated confirmation and Reload do not accumulate credits, wallet debits or subscription grants. Pending/unknown confirmations block another purchase, including switching from card/crypto to account balance. Cancellation, exact expiry boundaries, aborted streams, account changes and late responses have dedicated guards.

Independent review found a concrete replay bug: if plan orders A then B were created but completed B then A within one UTC second, sorting only by `completedAt` replayed creation order and restored the wrong final plan. Each first successful card, crypto or wallet settlement now receives a unique monotonic `settlementSequence`. The snapshot requires a positive, unique sequence for every completed order; restoration sorts by that sequence and resumes the counter after Reload. A regression creates Plus then Expert, confirms Expert then Plus in one second, verifies three Reloads and repeated confirms preserve Plus, and verifies the next settlement receives a greater sequence.

## Verification performed

### Latest type check

```sh
npm run typecheck
```

Passed after the settlement-sequence fix.

### Latest focused unit/API run

```sh
npx vitest run tests/api/presentation-payments.test.ts tests/api/demo-clock.test.ts tests/api/demo.test.ts tests/wallet-recovery.test.ts src/features/billing/navigation.test.ts
```

**5 files, 50 tests passed.** Includes 13 new presentation-payment tests plus the existing demo, clock, wallet-recovery and navigation coverage. Checks include explicit authorization, duplicate settlement, no provider fetches, interrupted confirmation, owner isolation, reload, removed records, expiry, stored schema/TTL/size, exact ETH quotes, receipt facts and settlement ordering.

### Focused browser suite

The commerce agent built a separate demo output and served it on port 4268:

```sh
npx vite build --mode demo --outDir /tmp/apcosys-commerce-build
npx vite preview --outDir /tmp/apcosys-commerce-build --host 127.0.0.1 --port 4268 --strictPort
npx playwright test --config=/tmp/apcosys-commerce.config.ts commerce-checkout.spec.ts billing-ux.spec.ts billing-return.spec.ts billing-activity.spec.ts wallet-payment.spec.ts wallet-recovery.spec.ts
```

**30 tests passed.** The temporary config used Chrome at `/tmp/apcosys-chrome-stable/opt/google/chrome/chrome`, two workers, no retries, `en-US`, UTC, reduced motion and no video. Tests cover the new local flows and existing mocked LIVE return/unknown-outcome/wallet paths. Checkout, receipts and layouts are checked at 1440, 390 and 320 px.

After visual corrections, the output was rebuilt and the affected suite repeated:

```sh
npx vite build --mode demo --outDir /tmp/apcosys-commerce-build --emptyOutDir > /tmp/apcosys-commerce-build.log
npx playwright test --config=/tmp/apcosys-commerce.config.ts commerce-checkout.spec.ts billing-activity.spec.ts
```

**7 tests passed.** This repeats the six commerce tests plus the live crypto-precision test. These browser runs preceded the final API settlement-sequence fix; the 50-test unit/API run above includes that fix. The root agent's final immutable gate is the integration check for the final combined source.

The reload assertion in `commerce-checkout.spec.ts` was subsequently strengthened to check the actual CreditBalance trigger's accessible label (`1,265,500` after the first credit purchase), replacing a selector that could match no elements. The final root browser gate should use this strengthened assertion.

### Visual inspection

Twenty-five commerce screenshots were saved under `after/commerce-*.png`. The commerce agent personally inspected desktop and mobile plans, packs, review, card checkout, crypto checkout, receipt, order details and crypto activity across 1440, 390 and 320 px. The inspection caught and corrected an intrinsic-width SVG cover and the mobile three-line Continue button. Screenshots include:

- `after/commerce-plans-open-1440.png`
- `after/commerce-plans-390.png`
- `after/commerce-credit-packs-1440.png`
- `after/commerce-credit-packs-320.png`
- `after/commerce-card-review-320.png`
- `after/commerce-card-checkout-390.png`
- `after/commerce-card-receipt-1440.png`
- `after/commerce-crypto-checkout-320.png`
- `after/commerce-order-detail-320.png`
- `after/commerce-crypto-activity-320.png`

Final integration follow-ups owned by root: the checkout session-loading skeleton, the 16 px mobile pack-price bottom margin, and the combined immutable build/browser gate. This report does not claim those final root checks have already completed.
