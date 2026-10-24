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
  await expect(history.getByLabel('Payment status filter', { exact: true })).toHaveValue('completed');
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
  await status.evaluate(element => {
    const select = element as HTMLSelectElement;
    const clear = [...select.closest('.billing-history')!.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === 'Clear filters');
    if (!clear) throw new Error('The current payment query must expose Clear filters.');
    clear.click();
    select.value = 'completed';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page).toHaveURL(url => url.searchParams.get('section') === 'payments'
    && !url.searchParams.has('history_query') && !url.searchParams.has('history_page')
    && url.searchParams.get('history_status') === 'completed'
    && url.searchParams.get('history_rows') === '10' && url.searchParams.get('history_order') === 'oldest');
  await expect(query).toHaveValue('');
  await expect(status).toHaveValue('completed');
  await expect(history).toContainText('40 matching');
  await expect(history.locator('tbody tr')).toHaveCount(10);

  await page.goBack();
  await expect(query).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(history).toContainText('80 matching');
  await page.goBack();
  await expect(page).toHaveURL(initial);
  await expect(query).toHaveValue('payment-0001');
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await page.goForward();
  await expect(history).toContainText('80 matching');
  await page.goForward();
  await expect(status).toHaveValue('completed');
  await expect(history).toContainText('40 matching');

  // Parent section navigation must preserve a child's not-yet-rendered filter.
  await status.evaluate(element => {
    const select = element as HTMLSelectElement;
    const overview = document.querySelector<HTMLButtonElement>('#billing-tab-overview');
    if (!overview) throw new Error('The Overview tab must be available.');
    select.value = 'pending';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    overview.click();
  });
  await expect(page).toHaveURL(url => url.searchParams.get('section') === 'overview'
    && url.searchParams.get('history_status') === 'pending' && !url.searchParams.has('history_query'));
  await expect(history).not.toBeVisible();
  await page.getByRole('tab', { name: 'Payments', exact: true }).click();
  await expect(status).toHaveValue('pending');
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
  const review = page.getByRole('dialog', { name: 'Add 100,000 credits', exact: true });
  await expect(review).toBeVisible();
  await review.getByLabel('Payment method', { exact: true }).selectOption('crypto');
  await expect(review.getByRole('heading', { name: 'Payment service unavailable', exact: true })).toBeVisible();
  await expect(review.getByRole('button', { name: 'Create crypto invoice', exact: true })).toBeDisabled();
  await expect(review.getByLabel('Network', { exact: true })).toHaveCount(0);
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('tab', { name: 'Crypto activity', exact: true }).click();
  await expect(review).not.toBeVisible();
  await page.getByRole('button', { name: 'Load tracked addresses', exact: true }).click();
  await expect(page.locator('.crypto-activity').getByRole('heading', { name: 'Payment service unavailable', exact: true })).toBeVisible();
  await expect(page.locator('.crypto-address')).toHaveCount(0);
  await expect(page.getByText('DEMO_ONLY_NOT_A_PAYMENT_ADDRESS', { exact: true })).toHaveCount(0);
  expect(frames.filter(frame => ['get_address', 'pay_with_balance', 'init_checkout', 'confirm_payment'].includes(frame.type))).toEqual([]);
});
