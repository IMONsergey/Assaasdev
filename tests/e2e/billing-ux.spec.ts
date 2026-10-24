import { chooseOption } from './helpers/controls';
import { expect, test, type Page } from '@playwright/test';
import { seedPricing, seedProfile } from '../../src/demo/fixtures';

async function billingApi(page: Page, options: { mismatchPayment?: boolean; unavailableCrypto?: boolean } = {}) {
  const profile = seedProfile();
  const frames: Array<{ type: string; data: Record<string, unknown> }> = [];
  const payments = Array.from({ length: 80 }, (_, index) => ({ payment_id: `payment-${String(index).padStart(4, '0')}`, amount_usd: 50, subscription: 'Plus', status: index % 2 ? 'pending' : 'completed', created_at: 1800000000 + index }));
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/pricing') ? seedPricing() : profile }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw)); frames.push(frame);
    const reply = (data: unknown) => socket.send(JSON.stringify({ id: frame.id, type: frame.type, data }));
    if (frame.type === 'user_billing') reply({ payments, subscription: profile.subscription, balance: profile.balance, credits: profile.credits, scan_credits: profile.scan_credits });
    else if (frame.type === 'confirm_payment') reply({ payment_id: options.mismatchPayment ? 'different-payment' : frame.data.payment_id, status: 'pending' });
    else if (frame.type === 'networks') reply(options.unavailableCrypto ? [{ network: 'demo-network', coins: [{ coin: 'DEMO', name: 'Unavailable token' }] }] : []);
    else if (frame.type === 'get_user_addresses_info') reply({ addresses: [{ network: 'demo-network', coin: 'DEMO', address: 'DEMO_ONLY_NOT_A_PAYMENT_ADDRESS', is_active: false }], timestamp: 1800000000 });
    else reply({ unread_count: 0 });
  }));
  return frames;
}

test('annual plans are the default and switching keeps exact prices and explicit purchase intent', async ({ page }, testInfo) => {
  const frames = await billingApi(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/billing?section=plans');
  const annual = page.getByRole('tab', { name: 'Annually', exact: true });
  const monthly = page.getByRole('tab', { name: 'Monthly', exact: true });
  const plus = page.locator('.billing-plan').filter({ has: page.getByRole('heading', { name: 'Plus', exact: true }) });
  await expect(annual).toHaveAttribute('aria-selected', 'true');
  await expect(plus.locator('.billing-price strong')).toHaveText('$40');
  await expect(plus.locator('.billing-period')).toHaveText('$480 billed yearly');
  await page.locator('.billing-page').screenshot({ path: testInfo.outputPath('billing-annual-default.png') });

  // Cadence and Choose are independent controls; a fast choice must use the new period.
  await monthly.evaluate(element => {
    (element as HTMLButtonElement).click();
    const choose = [...document.querySelectorAll<HTMLButtonElement>('.billing-plan button')].find(button => button.textContent?.trim() === 'Choose Plus');
    if (!choose) throw new Error('Plus selection must be available.');
    choose.click();
  });
  const immediateReview = page.getByRole('dialog', { name: 'Plus · monthly', exact: true });
  await expect(immediateReview.getByLabel('Billing period', { exact: true })).toHaveAttribute('data-control-value', 'monthly');
  await expect(immediateReview.locator('.billing-purchase-summary strong')).toHaveText('$50');
  await immediateReview.getByRole('button', { name: 'Cancel', exact: true }).click();
  await annual.click();

  await monthly.click();
  await expect(monthly).toHaveAttribute('aria-selected', 'true');
  await expect(plus.locator('.billing-price strong')).toHaveText('$50');
  await expect(plus.locator('.billing-period')).toHaveText('$50 billed monthly');
  await expect(page).toHaveURL(url => url.searchParams.get('cadence') === 'monthly');
  await plus.getByRole('button', { name: 'Choose Plus', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Plus · monthly', exact: true });
  await expect(review.getByLabel('Billing period', { exact: true })).toHaveAttribute('data-control-value', 'monthly');
  await expect(review.locator('.billing-purchase-summary strong')).toHaveText('$50');
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.reload();
  await expect(monthly).toHaveAttribute('aria-selected', 'true');
  await expect(plus.locator('.billing-price strong')).toHaveText('$50');
  expect(frames.filter(frame => ['init_checkout', 'pay_with_balance', 'get_address', 'confirm_payment'].includes(frame.type))).toEqual([]);

  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  const pack = page.locator('.billing-token').filter({ has: page.getByRole('heading', { name: 'Research Pack', exact: true }) });
  await expect(pack.locator('.billing-token-price strong')).toHaveText('$150');
  await expect(pack.getByRole('button', { name: 'Buy credits', exact: true })).toBeVisible();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('.billing-page').screenshot({ path: testInfo.outputPath(`billing-credit-packs-${width}.png`) });
  }
});

test('plan loading displays the branded canvas only while pricing is pending', async ({ page }, testInfo) => {
  await billingApi(page);
  let releasePricing!: () => void;
  const pricingReady = new Promise<void>(resolve => { releasePricing = resolve; });
  await page.route('**/backend/pricing', async route => {
    await pricingReady;
    await route.fulfill({ json: seedPricing() });
  });
  try {
    await page.goto('/billing?section=plans');
    const pending = page.getByRole('status', { name: 'Loading plans…', exact: true });
    await expect(pending).toBeVisible();
    const canvas = pending.locator('.orb-cube-loader__canvas');
    await expect(canvas).toBeVisible();
    await expect.poll(() => canvas.evaluate(element => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
      return pixels ? pixels.some((value, index) => index % 4 === 3 && value > 0) : false;
    })).toBe(true);
    await pending.screenshot({ path: testInfo.outputPath('billing-pending-orb.png') });
  } finally { releasePricing(); }
  await expect(page.locator('.billing-plan')).toHaveCount(4);
  await expect(page.getByRole('status', { name: 'Loading plans…', exact: true })).toHaveCount(0);
});

test('billing sections preserve local payment filters and history without extra billing requests', async ({ page }, testInfo) => {
  const frames = await billingApi(page);
  const initial = '/billing?section=payments&history_rows=10&history_page=3&history_status=completed';
  await page.goto(initial);
  const history = page.getByRole('region', { name: 'Payment history records', exact: true });
  await expect(history.locator('tbody tr')).toHaveCount(10);
  const first = await history.locator('tbody tr').first().textContent();
  const reads = frames.filter(frame => frame.type === 'user_billing').length;
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(history).not.toBeVisible();
  await expect(page.locator('.billing-current')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(initial);
  await expect(history.locator('tbody tr').first()).toHaveText(first!);
  await expect(history.getByLabel('Payment status filter', { exact: true })).toHaveAttribute('data-control-value', 'completed');
  await expect(history.getByRole('navigation', { name: 'Pagination' })).toContainText('Page 3');
  await page.getByRole('tab', { name: 'Plans', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compare plans', exact: true })).toBeVisible();
  await expect(history).not.toBeVisible();
  await page.getByRole('tab', { name: 'Annually', exact: true }).click();
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search credit packs', exact: true })).toBeVisible();
  expect(frames.filter(frame => frame.type === 'user_billing')).toHaveLength(reads);
  expect(frames.filter(frame => ['init_checkout', 'confirm_payment', 'pay_with_balance', 'get_address'].includes(frame.type))).toEqual([]);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    for (const label of ['Overview', 'Plans', 'Credit packs', 'Payments', 'Crypto activity']) {
      await page.getByRole('tab', { name: label, exact: true }).click();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.locator('.billing-page').screenshot({ path: testInfo.outputPath(`billing-${label.toLowerCase().replaceAll(' ', '-')}-${width}.png`) });
    }
  }
});

test('rapid payment filters compose the current URL across section changes and browser history', async ({ page }) => {
  const frames = await billingApi(page);
  const initial = '/billing?section=payments&history_query=payment-0001&history_rows=10&history_page=3&history_order=oldest';
  await page.goto(initial);
  const history = page.getByRole('region', { name: 'Payment history records', exact: true });
  const query = history.getByLabel('Search payment history', { exact: true });
  const status = history.getByLabel('Payment status filter', { exact: true });
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(history.locator('tbody tr')).toContainText('payment-0001');
  const reads = frames.filter(frame => frame.type === 'user_billing').length;

  // Both ordinary control events run before the router transition can render.
  await status.click();
  await page.getByRole('option', { name: 'completed', exact: true }).evaluate(element => {
    const clear = [...document.querySelectorAll<HTMLButtonElement>('.billing-history button')]
      .find(button => button.textContent?.trim() === 'Clear filters');
    if (!clear) throw new Error('The current payment query must expose Clear filters.');
    clear.click();
    (element as HTMLButtonElement).click();
  });
  await expect(page).toHaveURL(url => url.searchParams.get('section') === 'payments'
    && !url.searchParams.has('history_query') && !url.searchParams.has('history_page')
    && url.searchParams.get('history_status') === 'completed'
    && url.searchParams.get('history_rows') === '10' && url.searchParams.get('history_order') === 'oldest');
  await expect(query).toHaveValue('');
  await expect(status).toHaveAttribute('data-control-value', 'completed');
  await expect(history).toContainText('40 matching');
  await expect(history.locator('tbody tr')).toHaveCount(10);

  await page.goBack();
  await expect(query).toHaveValue('');
  await expect(status).toHaveAttribute('data-control-value', '');
  await expect(history).toContainText('80 matching');
  await page.goBack();
  await expect(page).toHaveURL(initial);
  await expect(query).toHaveValue('payment-0001');
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await page.goForward();
  await expect(history).toContainText('80 matching');
  await page.goForward();
  await expect(status).toHaveAttribute('data-control-value', 'completed');
  await expect(history).toContainText('40 matching');

  // Parent section navigation must preserve a child's not-yet-rendered filter.
  await status.click();
  await page.getByRole('option', { name: 'pending', exact: true }).evaluate(element => {
    const overview = document.querySelector<HTMLButtonElement>('#billing-tab-overview');
    if (!overview) throw new Error('The Overview tab must be available.');
    (element as HTMLButtonElement).click();
    overview.click();
  });
  await expect(page).toHaveURL(url => url.searchParams.get('section') === 'overview'
    && url.searchParams.get('history_status') === 'pending' && !url.searchParams.has('history_query'));
  await expect(history).not.toBeVisible();
  await page.getByRole('tab', { name: 'Payments', exact: true }).click();
  await expect(status).toHaveAttribute('data-control-value', 'pending');
  await expect(query).toHaveValue('');
  await expect(history).toContainText('40 matching');
  expect(frames.filter(frame => frame.type === 'user_billing')).toHaveLength(reads);
  expect(frames.filter(frame => ['init_checkout', 'confirm_payment', 'delete_payment', 'pay_with_balance', 'get_address'].includes(frame.type))).toEqual([]);
});

test('payment return is explicit and an unknown check remains blocked through section navigation', async ({ page }) => {
  const frames = await billingApi(page, { mismatchPayment: true });
  await page.goto('/billing/return?payment_id=payment-0001');
  await expect(page.getByRole('tab', { name: 'Payments', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Payment ID', { exact: true })).toHaveValue('payment-0001');
  expect(frames.filter(frame => frame.type === 'confirm_payment')).toEqual([]);
  await page.getByRole('button', { name: 'Check status', exact: true }).click();
  await expect(page.getByText('Payment status needs checking', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check status', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.billing-pending-strip')).toContainText('Payment status needs checking');
  await page.getByRole('tab', { name: 'Payments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check status', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Payment ID', { exact: true })).toHaveValue('payment-0001');
  expect(frames.filter(frame => frame.type === 'confirm_payment')).toHaveLength(1);
  expect(frames.filter(frame => ['init_checkout', 'pay_with_balance', 'get_address'].includes(frame.type))).toEqual([]);
});

test('unavailable payment networks cannot produce payable instructions or new invoices', async ({ page }) => {
  const frames = await billingApi(page, { unavailableCrypto: true });
  await page.goto('/billing?pack=token_pack_2');
  const review = page.getByRole('dialog', { name: 'Add 85,000 credits', exact: true });
  await expect(review).toBeVisible();
  await chooseOption(review.getByLabel('Payment method', { exact: true }), 'crypto');
  await expect(review.getByRole('heading', { name: 'Payment service unavailable', exact: true })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Create crypto invoice', exact: true })).toBeDisabled();
  await expect(review.getByLabel('Network', { exact: true })).toHaveCount(0);
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('tab', { name: 'Crypto activity', exact: true }).click();
  await expect(review).not.toBeVisible();
  await expect(page.locator('.crypto-activity').getByRole('heading', { name: 'Payment service unavailable', exact: true })).toBeVisible();
  await expect(page.locator('.crypto-address')).toHaveCount(0);
  await expect(page.getByText('DEMO_ONLY_NOT_A_PAYMENT_ADDRESS', { exact: true })).toHaveCount(0);
  expect(frames.filter(frame => ['get_address', 'pay_with_balance', 'init_checkout', 'confirm_payment'].includes(frame.type))).toEqual([]);
});
