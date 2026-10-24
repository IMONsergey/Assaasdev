import { expect, test, type Page } from '@playwright/test';
import { chooseOption } from './helpers/controls';

const audit = 'docs/audit/2026-10-24-controls-commerce/after';
async function withinViewport(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  for (const selector of ['.checkout-main', '.order-summary', '.order-record-section']) {
    for (const element of await page.locator(selector).all()) await expect.poll(() => element.evaluate(node => node.scrollWidth <= node.clientWidth + 2)).toBe(true);
  }
}

for (const width of [1440, 390, 320]) {
  test(`card and crypto checkout retain orders and receipts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const calls: string[] = [], errors: string[] = [];
    page.on('request', request => { if (/\/backend|paddle|stripe|walletconnect|infura|alchemy/i.test(request.url())) calls.push(request.url()); });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/billing?pack=token_pack_1&method=card');
    const review = page.getByRole('dialog', { name: 'Add 25,000 credits', exact: true });
    await expect(review.getByLabel('Payment method', { exact: true })).toHaveAttribute('data-control-value', 'card');
    await review.getByLabel('Promo code (optional)').fill('WELCOME');
    await review.getByRole('button', { name: 'Check code', exact: true }).click();
    await expect(review.locator('[data-onboarding="purchase-promo-applied"]')).toContainText('$45');
    await page.screenshot({ path: `${audit}/commerce-card-review-${width}.png` });
    await review.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page).toHaveURL(/\/billing\/checkout\/pay-/);
    const cardUrl = page.url();
    await expect(page.locator('[data-onboarding="checkout-order"]')).toHaveAttribute('data-order-status', 'pending');
    await expect(page.locator('.checkout-card-profile')).toContainText('Visa ending in 4242');
    await expect(page.locator('.checkout-page input')).toHaveCount(0);
    await withinViewport(page);
    await page.screenshot({ path: `${audit}/commerce-card-checkout-${width}.png`, fullPage: true });
    await page.reload();
    await expect(page.locator('.checkout-card-profile')).toBeVisible();
    await expect(page.locator('[data-onboarding="checkout-order"]')).toHaveAttribute('data-order-status', 'pending');
    await page.getByRole('button', { name: 'Pay $45', exact: true }).click();
    await expect(page.locator('[data-onboarding="checkout-receipt"]')).toBeVisible();
    await expect(page.locator('[data-onboarding="checkout-order"]')).toHaveAttribute('data-order-status', 'completed');
    await page.screenshot({ path: `${audit}/commerce-card-receipt-${width}.png`, fullPage: true });
    const creditTrigger = page.getByRole('button', { name: /^View credits and usage\./ });
    await expect(creditTrigger).toHaveAccessibleName(/1,265,500/);
    const afterCredits = await creditTrigger.getAttribute('aria-label');
    await page.reload();
    await expect(page.locator('[data-onboarding="checkout-receipt"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay $45', exact: true })).toHaveCount(0);
    await expect(creditTrigger).toHaveAttribute('aria-label', afterCredits!);
    await page.getByRole('link', { name: 'View order details', exact: true }).click();
    await expect(page.locator('[data-onboarding="order-status"]')).toHaveAttribute('data-status', 'completed');
    await expect(page.locator('[data-onboarding="order-summary"]')).toContainText('$45');
    await expect(page.locator('[data-onboarding="order-summary"]')).toContainText('WELCOME');
    await withinViewport(page);
    await page.screenshot({ path: `${audit}/commerce-order-detail-${width}.png`, fullPage: true });
    const receipt = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download receipt', exact: true }).click();
    expect((await receipt).suggestedFilename()).toMatch(/^apcosys-receipt-pay-.*\.txt$/);

    await page.goto('/billing?pack=token_pack_2&method=crypto&network=Ethereum&coin=USDT');
    const cryptoReview = page.getByRole('dialog', { name: 'Add 85,000 credits', exact: true });
    await expect(cryptoReview.getByLabel('Payment method')).toHaveAttribute('data-control-value', 'crypto');
    if (width !== 390) await chooseOption(cryptoReview.getByLabel('Coin', { exact: true }), 'ETH');
    await cryptoReview.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.locator('.checkout-reference-panel code')).toContainText('APCO-ORDER-PAY-');
    await expect(page.getByRole('img', { name: 'Order reference QR code' })).toBeVisible();
    await expect(page.locator('.checkout-crypto-currency')).toContainText(width !== 390 ? '0.06000000 ETH' : '150.000000 USDT');
    await expect(page.locator('.checkout-crypto')).not.toContainText(/send .*address|0x[0-9a-f]{40}|connect wallet/i);
    await withinViewport(page);
    await page.screenshot({ path: `${audit}/commerce-crypto-checkout-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Confirm payment', exact: true }).click();
    await expect(page.locator('[data-onboarding="checkout-receipt"]')).toContainText('85,000 search credits');
    await page.goto(cardUrl);
    await expect(page.locator('[data-onboarding="checkout-order"]')).toHaveAttribute('data-order-status', 'completed');
    await expect(page.locator('.checkout-success')).toContainText('25,000');
    expect(calls).toEqual([]); expect(errors).toEqual([]);
  });
}

test('cancellation and expiry retain complete purchase choices; pending recovery never charges on entry', async ({ page }) => {
  await page.clock.install({ time: new Date('2030-05-10T11:30:00Z') });
  await page.goto('/billing?plan=Plus&cadence=annually&method=crypto&promo=WELCOME&network=Ethereum&coin=ETH');
  let review = page.getByRole('dialog', { name: 'Plus · annually', exact: true });
  await expect(review.getByLabel('Network', { exact: true })).toHaveAttribute('data-control-value', 'Ethereum');
  await expect(review.getByLabel('Promo code (optional)')).toHaveValue('WELCOME');
  await review.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await page.getByRole('dialog', { name: 'Cancel this order?', exact: true }).getByRole('button', { name: 'Cancel order', exact: true }).click();
  await expect(page.locator('[data-onboarding="checkout-order"]')).toHaveAttribute('data-order-status', 'canceled');
  await page.reload();
  await expect(page.locator('[data-onboarding="checkout-order"]')).toHaveAttribute('data-order-status', 'canceled');
  await page.getByRole('link', { name: 'Review purchase', exact: true }).click();
  review = page.getByRole('dialog', { name: 'Plus · annually', exact: true });
  await expect(review.getByLabel('Billing period', { exact: true })).toHaveAttribute('data-control-value', 'annually');
  await expect(review.getByLabel('Payment method')).toHaveAttribute('data-control-value', 'crypto');
  await expect(review.getByLabel('Network', { exact: true })).toHaveAttribute('data-control-value', 'Ethereum');
  await expect(review.getByLabel('Coin', { exact: true })).toHaveAttribute('data-control-value', 'ETH');
  await expect(review.getByLabel('Promo code (optional)')).toHaveValue('WELCOME');
  await review.getByRole('button', { name: 'Continue', exact: true }).click();
  const pending = page.url();
  await page.getByRole('link', { name: 'Order details', exact: true }).click();
  await expect(page.locator('[data-onboarding="order-status"]')).toHaveAttribute('data-status', 'pending');
  await page.getByRole('link', { name: 'Continue payment', exact: true }).click();
  await expect(page).toHaveURL(pending);
  await expect(page.getByRole('button', { name: 'Confirm payment', exact: true })).toBeVisible();
  await page.clock.fastForward(3_600_001);
  await expect(page.locator('[data-onboarding="checkout-order"]')).toHaveAttribute('data-order-status', 'expired');
  await expect(page.getByRole('button', { name: 'Confirm payment', exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${audit}/commerce-expired-order-1440.png`, fullPage: true });
  await page.getByRole('link', { name: 'Review purchase', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Promo code (optional)')).toHaveValue('WELCOME');
});

test('plans expand together on desktop, independently on mobile; packs and crypto remain aligned', async ({ page }) => {
  await page.goto('/billing?section=plans');
  await expect(page.locator('.billing-plan')).toHaveCount(4);
  await page.locator('.billing-plan-capabilities summary').first().click();
  await expect(page.locator('.billing-plan-capabilities[open]')).toHaveCount(4);
  const positions = await page.locator('.billing-plan-capabilities summary').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().y));
  expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `${audit}/commerce-plans-open-1440.png`, fullPage: true });
  await page.getByRole('tab', { name: 'Monthly', exact: true }).click();
  await expect(page.locator('.billing-plan').filter({ has: page.getByRole('heading', { name: 'Plus', exact: true }) }).locator('.billing-price strong')).toHaveText('$50');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('.billing-plan-capabilities[open]')).toHaveCount(width === 390 ? 0 : 1);
    if (width === 390) await page.locator('.billing-plan-capabilities summary').first().click();
    await expect(page.locator('.billing-plan-capabilities[open]')).toHaveCount(1);
    await withinViewport(page);
    await page.screenshot({ path: `${audit}/commerce-plans-${width}.png`, fullPage: true });
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
    await expect(page.locator('.billing-token')).toHaveCount(7);
    await expect(page.locator('.credit-pack-cover svg')).toHaveCount(7);
    if (width === 1440) expect(await page.locator('.billing-token-packs').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(3);
    await withinViewport(page);
    await page.screenshot({ path: `${audit}/commerce-credit-packs-${width}.png`, fullPage: true });
    await page.getByRole('tab', { name: 'Crypto activity', exact: true }).click();
    await expect(page.locator('.crypto-address')).toHaveCount(2);
    await expect(page.getByRole('button', { name: 'Load tracked addresses', exact: true })).toHaveCount(0);
    await withinViewport(page);
    await page.screenshot({ path: `${audit}/commerce-crypto-activity-${width}.png`, fullPage: true });
  }
});

test('order history return restores filters and unknown orders have a usable recovery', async ({ page }) => {
  await page.goto('/billing?section=payments&history_query=pay_001&history_status=pending&history_rows=10&history_order=oldest');
  await page.getByRole('link', { name: 'View payment pay_001', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Payment details', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Payments', exact: true }).click();
  await expect(page.getByLabel('Search payment history', { exact: true })).toHaveValue('pay_001');
  await expect(page.getByLabel('Payment status filter', { exact: true })).toHaveAttribute('data-control-value', 'pending');
  await chooseOption(page.getByLabel('Payment status filter', { exact: true }), '');
  await expect(page).toHaveURL(url => !url.searchParams.has('history_status') && url.searchParams.get('history_query') === 'pay_001');
  await page.goto('/billing/payments/unknown-payment?back=https%3A%2F%2Fevil.example');
  await expect(page.getByRole('heading', { name: 'Payment not found', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to payments', exact: true })).toHaveAttribute('href', '/billing?section=payments');
});
