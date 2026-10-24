import { expect, test, type Page } from '@playwright/test';
import { seedPricing } from '../../src/demo/fixtures';

async function mockBillingEntry(page: Page, options: { signedIn?: boolean; allowCheckout?: boolean } = {}) {
  let signedIn = options.signedIn ?? false;
  const writes: { path: string; body: unknown }[] = [];
  const frames: { type: string; data: unknown }[] = [];
  const profile = { user_id: 'billing-return-contract', user_name: 'billing_test', user_type: 'USER', credits: 500, scan_credits: 0, balance: 0, subscription: { type: 'Free', credits: 500 } };
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.routeWebSocket('**/backend/ws', socket => {
    socket.onMessage(raw => {
      const frame = JSON.parse(String(raw)) as { type: string; id: string; data: unknown };
      frames.push({ type: frame.type, data: frame.data });
      if (frame.type === 'user_billing') socket.send(JSON.stringify({ type: frame.type, id: frame.id, data: { payments: [], subscription: profile.subscription, credits: 500, scan_credits: 0, balance: 0 } }));
      else if (frame.type === 'init_checkout' && options.allowCheckout) socket.send(JSON.stringify({ type: frame.type, id: frame.id, data: { status: 'success', transaction_id: 'mock-research-pack-checkout', product_type: 'tokens', checkout_url: 'https://payments.example.test/mock-research-pack-checkout' } }));
      else socket.send(JSON.stringify({ type: frame.type, id: frame.id, error: 'No purchase or other billing mutation is allowed by this fixture.' }));
    });
  });
  await page.route('**/backend/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const reply = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (!['GET', 'HEAD'].includes(request.method())) writes.push({ path, body: request.postDataJSON() });
    if (path === '/backend/pricing') return reply(200, seedPricing());
    if (path === '/backend/whoami') return reply(signedIn ? 200 : 401, signedIn ? profile : { error: 'Unauthorized' });
    if (path === '/backend/auth/login') { signedIn = true; return reply(200, { message: 'Signed in' }); }
    return reply(404, { error: 'Not mocked' });
  });
  return { writes, frames };
}

async function signIn(page: Page) {
  await page.getByLabel('Email or username').fill('billing_test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

function expectedLogin() {
  return [{ path: '/backend/auth/login', body: { identifier: 'billing_test', password: 'test-password' } }];
}

test('annual Plus selection survives login and opens review without starting a purchase', async ({ page }) => {
  const { writes, frames } = await mockBillingEntry(page);
  await page.goto('/billing');
  await page.getByRole('tab', { name: 'Annually', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Plus', exact: true }).click();
  await expect(page).toHaveURL(url => {
    const intent = new URL(url.searchParams.get('returnTo') ?? '/', url.origin);
    return url.pathname === '/auth/login' && intent.pathname === '/billing' && intent.searchParams.get('plan') === 'Plus' && intent.searchParams.get('cadence') === 'annually';
  });
  expect(writes).toEqual([]);
  expect(frames).toEqual([]);
  await signIn(page);
  await expect(page).toHaveURL(url => url.pathname === '/billing' && url.searchParams.get('plan') === 'Plus' && url.searchParams.get('cadence') === 'annually');
  const review = page.getByRole('dialog', { name: 'Plus · annually', exact: true });
  await expect(review).toBeVisible();
  await expect(review.getByLabel('Billing period', { exact: true })).toHaveValue('annually');
  await expect(review.locator('.billing-purchase-summary')).toContainText('Plus');
  await expect(review.locator('.billing-purchase-summary strong')).toHaveText('$480');
  await expect(review.getByLabel('Payment method', { exact: true })).toHaveValue('card');
  await expect(review.getByRole('button', { name: 'Create secure checkout', exact: true })).toBeEnabled();
  await expect.poll(() => frames.some(frame => frame.type === 'user_billing')).toBe(true);
  await expect(page.locator('.page-description')).toContainText('Current plan: Free');
  expect(writes).toEqual(expectedLogin());
  expect(frames.filter(frame => frame.type !== 'user_billing')).toEqual([]);
});

test('credit pack selection survives login as the same one-off review without starting a purchase', async ({ page }) => {
  const { writes, frames } = await mockBillingEntry(page);
  await page.goto('/billing');
  await page.getByRole('tab', { name: 'Annually', exact: true }).click();
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  const pack = page.locator('.billing-token').filter({ has: page.getByText('Research Pack', { exact: true }) });
  await pack.getByRole('button', { name: 'Buy credits', exact: true }).click();
  await expect(page).toHaveURL(url => {
    const intent = new URL(url.searchParams.get('returnTo') ?? '/', url.origin);
    return url.pathname === '/auth/login' && intent.pathname === '/billing' && intent.searchParams.get('pack') === 'token_pack_2';
  });
  expect(writes).toEqual([]);
  expect(frames).toEqual([]);
  await signIn(page);
  await expect(page).toHaveURL(url => url.pathname === '/billing' && url.searchParams.get('pack') === 'token_pack_2');
  const review = page.getByRole('dialog', { name: 'Add 100,000 credits', exact: true });
  await expect(review).toBeVisible();
  await expect(review.locator('.billing-purchase-summary')).toContainText('Research Pack');
  await expect(review.locator('.billing-purchase-summary strong')).toHaveText('$180');
  await expect(review.getByLabel('Billing period', { exact: true })).toHaveCount(0);
  await expect(review.getByLabel('Payment method', { exact: true })).toHaveValue('card');
  await expect(review.getByRole('button', { name: 'Create secure checkout', exact: true })).toBeEnabled();
  await expect.poll(() => frames.some(frame => frame.type === 'user_billing')).toBe(true);
  await expect(page.locator('.page-description')).toContainText('Current plan: Free');
  expect(writes).toEqual(expectedLogin());
  expect(frames.filter(frame => frame.type !== 'user_billing')).toEqual([]);
});

test('browser Back restores the plan review without reusing a different order checkout', async ({ page }) => {
  const { writes, frames } = await mockBillingEntry(page, { signedIn: true, allowCheckout: true });
  const initial = '/billing?plan=Plus&cadence=annually';
  await page.goto(initial);
  const planReview = page.getByRole('dialog', { name: 'Plus · annually', exact: true });
  await expect(planReview).toBeVisible();
  await planReview.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(planReview).not.toBeVisible();

  // Use real SPA controls so BillingPage stays mounted across both history entries.
  await page.getByRole('button', { name: /View credits and usage/ }).click();
  await page.getByRole('link', { name: 'Plans & credit packs', exact: true }).click();
  await expect(page).toHaveURL('/billing#billing-token-packs');
  const pack = page.locator('.billing-token').filter({ has: page.getByText('Research Pack', { exact: true }) });
  await pack.getByRole('button', { name: 'Buy credits', exact: true }).click();
  const packReview = page.getByRole('dialog', { name: 'Add 100,000 credits', exact: true });
  await expect(packReview).toBeVisible();
  await packReview.getByLabel('Promo code (optional)', { exact: true }).fill('HISTORY-CODE');
  await packReview.getByLabel('Currency code (optional)', { exact: true }).fill('EUR');
  await packReview.getByLabel('Apply an eligible automatic discount', { exact: true }).check();
  await packReview.getByRole('button', { name: 'Create secure checkout', exact: true }).click();
  const oldCheckout = packReview.getByRole('link', { name: 'Open secure checkout ↗', exact: true });
  await expect(oldCheckout).toHaveAttribute('href', 'https://payments.example.test/mock-research-pack-checkout');
  const operations = frames.filter(frame => frame.type !== 'user_billing');
  expect(operations).toHaveLength(1);
  expect(operations[0]).toMatchObject({ type: 'init_checkout', data: { token_pack_id: 'token_pack_2', promo_code: 'HISTORY-CODE', currency: 'EUR', apply_discount: true } });
  await packReview.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(packReview).not.toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(initial);
  await expect(planReview).toBeVisible();
  await expect(planReview.getByLabel('Billing period', { exact: true })).toHaveValue('annually');
  await expect(planReview.locator('.billing-purchase-summary')).toContainText('Plus');
  await expect(planReview.locator('.billing-purchase-summary strong')).toHaveText('$480');
  await expect(planReview.getByRole('link', { name: 'Open secure checkout ↗', exact: true })).toHaveCount(0);
  await expect(planReview.getByLabel('Promo code (optional)', { exact: true })).toHaveValue('');
  await expect(planReview.getByLabel('Currency code (optional)', { exact: true })).toHaveValue('');
  await expect(planReview.getByLabel('Apply an eligible automatic discount', { exact: true })).not.toBeChecked();
  await expect(planReview.getByLabel('Payment method', { exact: true })).toHaveValue('card');
  await expect(planReview.getByRole('button', { name: 'Create secure checkout', exact: true })).toBeEnabled();
  await expect(page.locator('.page-description')).toContainText('Current plan: Free');
  expect(writes).toEqual([]);
  expect(frames.filter(frame => frame.type !== 'user_billing')).toEqual(operations);
});
