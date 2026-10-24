import { expect, test, type Page } from '@playwright/test';
import { seedPricing, seedProfile } from '../../src/demo/fixtures';

async function walletApi(page: Page) {
  const profile = seedProfile();
  const frames: Array<{ type: string; data: Record<string, unknown> }> = [];
  let paymentStatus = 'pending';
  let replyConfirmation: ((status: string, id?: string) => void) | undefined;
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/pricing') ? seedPricing() : profile }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw)); frames.push(frame);
    const reply = (data: unknown) => socket.send(JSON.stringify({ id: frame.id, type: frame.type, data }));
    if (frame.type === 'user_billing') reply({ payments: frames.some(item => item.type === 'pay_with_balance') ? [{ payment_id: 'wallet-order-1', amount_usd: 50, status: paymentStatus, subscription: 'Starter Pack', created_at: 1800000000 }] : [], subscription: profile.subscription, balance: profile.balance, credits: profile.credits, scan_credits: profile.scan_credits });
    else if (frame.type === 'pay_with_balance') reply({ payment_id: 'wallet-order-1', amount_usd: 50, final_amount_usd: 50 });
    else if (frame.type === 'confirm_payment') {
      replyConfirmation = (status, id = 'wallet-order-1') => {
        if (id === 'wallet-order-1') {
          paymentStatus = status;
          if (status === 'completed') { profile.balance = 70; profile.credits = 1_265_500; profile.purchased_credits = 25000; }
        }
        reply({ payment_id: id, status, message: status === 'failed' ? 'The wallet payment could not be completed.' : undefined });
      };
      reply({ payment_id: 'wallet-order-1', status: 'pending' });
    } else reply({ unread_count: 0 });
  }));
  return { frames, confirm: (status: string, id?: string) => { if (!replyConfirmation) throw new Error('Payment confirmation has not started'); replyConfirmation(status, id); } };
}

test('wallet purchase requires explicit consent and displays a receipt only after matching confirmation', async ({ page }) => {
  const api = await walletApi(page);
  await page.goto('/billing?pack=token_pack_1&method=balance');
  const review = page.getByRole('dialog', { name: 'Add 25,000 credits', exact: true });
  await expect(review.getByLabel('Payment method')).toHaveValue('balance');
  await expect(review.getByRole('region', { name: 'Account wallet' })).toContainText('$120');
  await expect(review.locator('.wallet-review-after')).toContainText('$70');
  expect(api.frames.filter(frame => ['pay_with_balance', 'confirm_payment'].includes(frame.type))).toEqual([]);
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(api.frames.filter(frame => ['pay_with_balance', 'confirm_payment'].includes(frame.type))).toEqual([]);
  await page.locator('.billing-token').filter({ has: page.getByRole('heading', { name: 'Starter Pack', exact: true }) }).getByRole('button', { name: 'Buy credits' }).click();
  await review.getByLabel('Payment method').selectOption('balance');
  await review.getByRole('button', { name: 'Pay with balance' }).click();
  await expect(review.locator('[data-onboarding="wallet-checkout"]')).toHaveAttribute('data-payment-state', 'pending');
  await expect(review.locator('[data-onboarding="wallet-receipt"]')).toHaveCount(0);
  await expect.poll(() => api.frames.filter(frame => frame.type === 'confirm_payment').length).toBe(1);
  expect(api.frames.filter(frame => frame.type === 'pay_with_balance').map(frame => frame.data)).toEqual([{ token_pack_id: 'token_pack_1' }]);
  expect(api.frames.find(frame => frame.type === 'confirm_payment')?.data).toEqual({ payment_id: 'wallet-order-1' });
  api.confirm('completed');
  await expect(review.getByRole('heading', { name: 'Payment complete', exact: true })).toBeVisible();
  const receipt = review.locator('[data-onboarding="wallet-receipt"]');
  await expect(receipt).toContainText('$50'); await expect(receipt).toContainText('$70'); await expect(receipt).toContainText('1,265,500');
  await review.locator('[data-onboarding="wallet-done"]').click();
  await expect(page).toHaveURL(url => url.searchParams.get('section') === 'payments' && !url.searchParams.has('pack'));
  await expect(page.locator('.billing-history-table')).toContainText('completed');
  expect(api.frames.filter(frame => ['init_checkout', 'get_address', 'billing_manage'].includes(frame.type))).toEqual([]);
});

test('insufficient wallet balance cannot submit a purchase and another method remains available', async ({ page }) => {
  const api = await walletApi(page);
  await page.goto('/billing?plan=Plus&cadence=annually&method=balance');
  const review = page.getByRole('dialog', { name: 'Plus · annually', exact: true });
  await expect(review).toContainText('You need $360 more');
  await expect(review.getByRole('button', { name: 'Pay with balance' })).toBeDisabled();
  await review.getByRole('button', { name: 'Choose another payment method' }).click();
  await expect(review.getByLabel('Payment method')).toHaveValue('card');
  await expect(review.getByRole('button', { name: 'Create secure checkout' })).toBeEnabled();
  expect(api.frames.filter(frame => ['pay_with_balance', 'confirm_payment', 'init_checkout', 'get_address'].includes(frame.type))).toEqual([]);
});

test('mismatched confirmation blocks duplicate payment until billing is reconciled', async ({ page }) => {
  const api = await walletApi(page);
  await page.goto('/billing?pack=token_pack_1&method=balance');
  const review = page.getByRole('dialog', { name: 'Add 25,000 credits', exact: true });
  await review.getByRole('button', { name: 'Pay with balance' }).click();
  await expect.poll(() => api.frames.filter(frame => frame.type === 'confirm_payment').length).toBe(1);
  api.confirm('completed', 'wrong-order');
  await expect(review.locator('[data-onboarding="wallet-checkout"]')).toHaveAttribute('data-payment-state', 'unknown');
  await expect(review.locator('[data-onboarding="wallet-receipt"]')).toHaveCount(0);
  await expect(review.getByRole('button', { name: 'Pay with balance' })).toHaveCount(0);
  await review.getByRole('button', { name: 'Refresh billing', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Check payment', exact: true })).toBeVisible();
  await review.getByRole('button', { name: 'Check payment', exact: true }).click();
  await expect.poll(() => api.frames.filter(frame => frame.type === 'confirm_payment').length).toBe(2);
  api.confirm('completed');
  await expect(review.locator('[data-onboarding="wallet-receipt"]')).toContainText('$70');
  expect(api.frames.filter(frame => frame.type === 'pay_with_balance')).toHaveLength(1);
});

test('a confirmed failure retains the wallet balance and returns to an editable review', async ({ page }) => {
  const api = await walletApi(page);
  await page.goto('/billing?pack=token_pack_1&method=balance');
  const review = page.getByRole('dialog', { name: 'Add 25,000 credits', exact: true });
  await review.getByRole('button', { name: 'Pay with balance' }).click();
  await expect.poll(() => api.frames.filter(frame => frame.type === 'confirm_payment').length).toBe(1);
  api.confirm('failed');
  await expect(review.locator('[data-onboarding="wallet-checkout"]')).toHaveAttribute('data-payment-state', 'failed');
  await expect(review.locator('[data-onboarding="wallet-receipt"]')).toHaveCount(0);
  await review.getByRole('button', { name: 'Back to purchase' }).click();
  await expect(review.locator('.wallet-balance')).toHaveText('$120');
  await expect(review.getByRole('button', { name: 'Pay with balance' })).toBeEnabled();
  expect(api.frames.filter(frame => frame.type === 'pay_with_balance')).toHaveLength(1);
});

test('a timed out confirmation stays unresolved and never authorizes a second wallet charge', async ({ page }) => {
  await page.clock.install();
  const api = await walletApi(page);
  await page.goto('/billing?pack=token_pack_1&method=balance');
  const review = page.getByRole('dialog', { name: 'Add 25,000 credits', exact: true });
  await review.getByRole('button', { name: 'Pay with balance' }).click();
  await expect.poll(() => api.frames.filter(frame => frame.type === 'confirm_payment').length).toBe(1);
  await page.clock.fastForward(61_000);
  await expect(review.locator('[data-onboarding="wallet-checkout"]')).toHaveAttribute('data-payment-state', 'unknown');
  await expect(review.locator('[data-onboarding="wallet-receipt"]')).toHaveCount(0);
  await expect(review.getByRole('button', { name: 'Pay with balance' })).toHaveCount(0);
  await review.getByRole('button', { name: 'Refresh billing', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Check payment', exact: true })).toBeVisible();
  expect(api.frames.filter(frame => frame.type === 'pay_with_balance')).toHaveLength(1);
});

test('annual Business invoice requests open a reviewable support draft and preserve edits', async ({ page }) => {
  const api = await walletApi(page);
  await page.goto('/billing?section=plans');
  await page.getByRole('button', { name: 'Request invoice', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Contact support', exact: true });
  await expect(form.getByLabel('Topic', { exact: true })).toHaveValue('Billing & payments');
  await expect(form.getByLabel('Message', { exact: true })).toContainText('annual Business plan ($8,640 per year)');
  await form.getByLabel('Message', { exact: true }).fill('Please send an annual Business invoice to Example Research.');
  await form.getByLabel('Name', { exact: true }).fill('Alex Research');
  await expect(form.getByLabel('Message', { exact: true })).toHaveValue('Please send an annual Business invoice to Example Research.');
  await form.getByRole('button', { name: 'Prepare email' }).click();
  const preview = page.getByRole('dialog', { name: 'Review your message' });
  await expect(preview).toContainText('Example Research');
  await expect(preview.getByRole('link', { name: 'Open email app' })).toHaveAttribute('href', /^mailto:info@apcosys.net\?/);
  expect(api.frames.filter(frame => ['pay_with_balance', 'init_checkout', 'get_address'].includes(frame.type))).toEqual([]);
});

for (const width of [1440, 390, 320]) {
  test(`wallet purchase completes in the presentation adapter at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/billing?pack=token_pack_1&method=balance');
    const review = page.getByRole('dialog', { name: 'Add 25,000 credits', exact: true });
    await expect(review.locator('.wallet-balance')).toHaveText('$120');
    await expect(review).not.toContainText(/demo|simulation/i);
    await page.screenshot({ path: testInfo.outputPath(`wallet-review-${width}.png`) });
    const rect = await review.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
    await review.getByRole('button', { name: 'Pay with balance' }).click();
    await expect(review.locator('[data-onboarding="wallet-checkout"]')).toHaveAttribute('data-payment-state', 'pending');
    await expect(review.locator('[data-onboarding="wallet-checkout"]')).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath(`wallet-pending-${width}.png`) });
    await expect(review.locator('[data-onboarding="wallet-receipt"]')).toContainText('1,265,500');
    await expect(review.locator('[data-onboarding="wallet-receipt"]')).toContainText('$70');
    await expect(review.locator('.wallet-success-ring')).toHaveCSS('stroke-dashoffset', '0px');
    await page.screenshot({ path: testInfo.outputPath(`wallet-receipt-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await review.getByRole('button', { name: 'View payments', exact: true }).click();
    const history = page.locator('.billing-history-table');
    await expect(history).toContainText('Starter Pack'); await expect(history).toContainText('completed');
  });
}
