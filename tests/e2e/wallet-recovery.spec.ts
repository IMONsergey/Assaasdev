import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../../src/api';
import { seedPricing, seedProfile } from '../../src/demo/fixtures';
import { pendingWalletKey } from '../../src/features/billing/pending-wallet';

type RecordedRequest = { type: string; data: Record<string, unknown>; owner: string };
type Order = { id: string; owner: string; status: string; reflected: boolean };
const accountA = 'wallet-recovery-a', accountB = 'wallet-recovery-b';

/** The server fixture survives SPA navigation and page reload independently of the UI. */
async function walletServer(page: Page, { holdInvoice = false } = {}) {
  const actor = { id: accountA };
  const profiles = new Map<string, Profile>([
    [accountA, { ...seedProfile(), user_id: accountA, user_name: 'Account A' }],
    [accountB, { ...seedProfile(), user_id: accountB, user_name: 'Account B', balance: 300, credits: 9000 }],
  ]);
  const requests: RecordedRequest[] = [], orders: Order[] = [];
  const delayedInvoices: Array<() => void> = [];
  let latestConfirmation: { id: string; owner: string; send: (value: unknown) => void } | undefined;
  const reflect = (order: Order) => {
    if (order.reflected) return;
    const profile = profiles.get(order.owner)!;
    profile.balance = profile.balance! - 50;
    profile.credits = profile.credits! + 25000;
    profile.purchased_credits = (profile.purchased_credits ?? 0) + 25000;
    order.reflected = true;
  };
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/pricing') ? seedPricing() : profiles.get(actor.id) }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw)), owner = actor.id;
    requests.push({ type: frame.type, data: frame.data, owner });
    const send = (data: unknown) => socket.send(JSON.stringify({ id: frame.id, type: frame.type, data }));
    if (frame.type === 'user_billing') {
      const profile = profiles.get(owner)!;
      send({ user_id: owner, payments: orders.filter(order => order.owner === owner).map(order => ({ payment_id: order.id, amount_usd: 50, status: order.status, subscription: 'Starter Pack', created_at: 1800000000 })), balance: profile.balance, credits: profile.credits, scan_credits: profile.scan_credits, subscription: profile.subscription });
    } else if (frame.type === 'pay_with_balance') {
      const order = { id: `wallet-${owner}-${orders.length + 1}`, owner, status: 'pending', reflected: false };
      orders.push(order);
      const invoice = () => send({ payment_id: order.id, amount_usd: 50, final_amount_usd: 50 });
      if (holdInvoice) delayedInvoices.push(invoice); else invoice();
    } else if (frame.type === 'confirm_payment') {
      const order = orders.find(order => order.id === frame.data.payment_id && order.owner === owner);
      if (!order) { socket.send(JSON.stringify({ id: frame.id, type: frame.type, error: 'Payment not found for this account.' })); return; }
      latestConfirmation = { id: order.id, owner, send };
      send({ payment_id: order.id, status: order.status });
    } else send({ unread_count: 0 });
  }));
  return {
    actor, requests, orders,
    releaseInvoice() { const release = delayedInvoices.shift(); if (!release) throw new Error('No invoice response is waiting'); release(); },
    reflectLatest() { reflect(orders.at(-1)!); },
    confirm(status: string, { returnedId, updateAccount = false }: { returnedId?: string; updateAccount?: boolean } = {}) {
      if (!latestConfirmation) throw new Error('No confirmation request is active');
      const { id, owner, send } = latestConfirmation;
      if (!returnedId || returnedId === id) {
        const order = orders.find(order => order.id === id && order.owner === owner)!;
        order.status = status;
        if (status === 'completed' && updateAccount) reflect(order);
      }
      send({ payment_id: returnedId ?? id, status });
    },
  };
}

const nav = (page: Page) => page.getByRole('complementary', { name: 'Workspace navigation' });
const review = (page: Page) => page.getByRole('dialog', { name: 'Add 25,000 credits', exact: true });
const starterBuy = (page: Page) => page.locator('.billing-token').filter({ has: page.getByRole('heading', { name: 'Starter Pack', exact: true }) }).getByRole('button', { name: 'Buy credits', exact: true });
const statusPanel = (page: Page) => page.getByRole('region', { name: 'Payment status', exact: true });
const payments = (requests: RecordedRequest[]) => requests.filter(request => request.type === 'pay_with_balance');
const confirmations = (requests: RecordedRequest[]) => requests.filter(request => request.type === 'confirm_payment');
const storedPending = (page: Page, principal = accountA) => page.evaluate(key => { const value = sessionStorage.getItem(key); return value === null ? null : JSON.parse(value); }, pendingWalletKey(principal));

async function startWallet(page: Page) {
  await page.goto('/billing?pack=token_pack_1&method=balance');
  await review(page).getByRole('button', { name: 'Pay with balance', exact: true }).click();
}

test('pending wallet survives SPA and live reload; a mismatched completion cannot enable another charge', async ({ page }, info) => {
  const api = await walletServer(page);
  await startWallet(page);
  await expect(review(page).locator('[data-payment-state]')).toHaveAttribute('data-payment-state', 'pending');
  const id = api.orders[0].id;
  expect(await storedPending(page)).toBe(id);
  await review(page).getByRole('button', { name: 'View in payments', exact: true }).click();
  await expect(page).toHaveURL(url => url.searchParams.get('payment_id') === id);
  await expect(page.locator('.billing-history-table tr').filter({ hasText: id }).getByRole('button', { name: 'Remove record', exact: true })).toBeDisabled();
  await nav(page).getByRole('link', { name: 'Search', exact: true }).click();
  await nav(page).getByRole('link', { name: 'Billing', exact: true }).click();
  await expect(page.locator('.billing-pending-wallet')).toBeVisible();
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await expect(starterBuy(page)).toBeDisabled();
  expect(payments(api.requests)).toHaveLength(1); expect(confirmations(api.requests)).toHaveLength(1);
  await page.reload();
  await expect(page.locator('.billing-pending-wallet')).toBeVisible();
  await expect(starterBuy(page)).toBeDisabled();
  expect(payments(api.requests)).toHaveLength(1); expect(confirmations(api.requests)).toHaveLength(1);
  await page.locator('.billing-pending-wallet').getByRole('button', { name: /^Review payment/ }).click();
  await expect(statusPanel(page).getByLabel('Payment ID', { exact: true })).toHaveValue(id);
  await statusPanel(page).getByRole('button', { name: 'Check status', exact: true }).click();
  await expect.poll(() => confirmations(api.requests).length).toBe(2);
  api.confirm('completed', { returnedId: 'some-other-payment' });
  await expect(statusPanel(page)).toHaveAttribute('data-payment-status', 'unknown');
  expect(await storedPending(page)).toBe(id);
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await expect(starterBuy(page)).toBeDisabled();
  await page.locator('.page-heading').getByRole('button', { name: 'Refresh billing', exact: true }).click();
  await expect(page.locator('.billing-pending-wallet')).toBeVisible();
  await expect(starterBuy(page)).toBeDisabled();
  await page.getByRole('tab', { name: 'Payments', exact: true }).click();
  await statusPanel(page).getByRole('button', { name: 'Check status', exact: true }).click();
  await expect.poll(() => confirmations(api.requests).length).toBe(3);
  api.confirm('completed', { updateAccount: true });
  await expect(statusPanel(page)).toHaveAttribute('data-payment-status', 'completed');
  await expect(page.locator('.billing-pending-wallet')).toHaveCount(0);
  expect(await storedPending(page)).toBeNull();
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await expect(starterBuy(page)).toBeEnabled();
  expect(payments(api.requests)).toHaveLength(1);
  expect(confirmations(api.requests).every(request => request.data.payment_id === id)).toBe(true);
  await page.screenshot({ path: info.outputPath('wallet-recovered-without-second-charge.png'), animations: 'disabled' });
});

test('an unknown wallet request without an invoice ID remains blocked after SPA and reload', async ({ page }, info) => {
  await page.clock.install();
  const api = await walletServer(page, { holdInvoice: true });
  await startWallet(page);
  await expect.poll(() => payments(api.requests).length).toBe(1);
  await page.clock.fastForward(31_000);
  await expect(review(page).getByText('Result not confirmed', { exact: true })).toBeVisible();
  await expect(review(page).getByRole('button', { name: 'Pay with balance', exact: true })).toBeDisabled();
  await review(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await nav(page).getByRole('link', { name: 'Search', exact: true }).click();
  await nav(page).getByRole('link', { name: 'Billing', exact: true }).click();
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await expect(starterBuy(page)).toBeDisabled();
  await page.reload();
  await expect(page.locator('.billing-pending-wallet')).toBeVisible();
  await expect(starterBuy(page)).toBeDisabled();
  expect(payments(api.requests)).toHaveLength(1); expect(confirmations(api.requests)).toHaveLength(0);
  expect(await storedPending(page)).not.toBeNull();
  await page.locator('.billing-pending-wallet').getByRole('button', { name: /^Review payment/ }).click();
  await expect(statusPanel(page).getByLabel('Payment ID', { exact: true })).toHaveValue('');
  await expect(statusPanel(page).getByRole('button', { name: 'Check status', exact: true })).toBeDisabled();
  const id = api.orders[0].id;
  await page.locator('.billing-history-table tr').filter({ hasText: id }).getByRole('button', { name: 'Check', exact: true }).click();
  await expect.poll(() => confirmations(api.requests).length).toBe(1);
  expect(confirmations(api.requests)[0].data.payment_id).toBe(id);
  api.confirm('completed', { updateAccount: true });
  await expect(page.locator('.billing-pending-wallet')).toHaveCount(0);
  expect(await storedPending(page)).toBeNull();
  expect(payments(api.requests)).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('wallet-unknown-request-recovered.png'), animations: 'disabled' });
});

test('confirmed payment stays distinct from stale account data until an explicit refresh sees the change', async ({ page }, info) => {
  const api = await walletServer(page);
  await startWallet(page);
  await expect(review(page).locator('[data-payment-state]')).toHaveAttribute('data-payment-state', 'pending');
  api.confirm('completed');
  await expect(review(page).getByText('Payment confirmed. Your balance and access are still updating.', { exact: true })).toBeVisible();
  await expect(review(page).locator('.wallet-receipt-balances')).toHaveCount(0);
  await expect(review(page).locator('.wallet-steps li').last()).not.toHaveAttribute('data-complete', 'true');
  await expect(review(page).getByText(/Your account (?:is up to date|reflects this payment)/)).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('wallet-confirmed-account-pending.png'), animations: 'disabled' });
  api.reflectLatest();
  await review(page).getByRole('button', { name: 'Refresh account', exact: true }).click();
  await expect(review(page).getByText('Your account reflects this payment. You’re ready to continue.', { exact: true })).toBeVisible();
  await expect(review(page).locator('.wallet-receipt-balances')).toContainText('$70');
  await expect(review(page).locator('.wallet-receipt-balances')).toContainText('1,265,500');
  await expect(review(page).locator('.wallet-steps li').last()).toHaveAttribute('data-complete', 'true');
  expect(payments(api.requests)).toHaveLength(1); expect(confirmations(api.requests)).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('wallet-account-reflects-confirmed-payment.png'), animations: 'disabled' });
});

test('changing accounts cannot expose or resolve the other account’s pending wallet guard', async ({ page }, info) => {
  const api = await walletServer(page);
  await startWallet(page);
  await expect(review(page).locator('[data-payment-state]')).toHaveAttribute('data-payment-state', 'pending');
  const id = api.orders[0].id;
  await review(page).getByRole('button', { name: 'View in payments', exact: true }).click();
  api.actor.id = accountB;
  await page.locator('.page-heading').getByRole('button', { name: 'Refresh billing', exact: true }).click();
  await expect(page.locator('.billing-history-table')).toHaveCount(0);
  await expect(page.locator('.billing-pending-wallet')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'No payments to show', exact: true })).toBeVisible();
  expect(await storedPending(page, accountA)).toBe(id);
  expect(await storedPending(page, accountB)).toBeNull();
  expect(confirmations(api.requests).filter(request => request.owner === accountB)).toHaveLength(0);
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await expect(starterBuy(page)).toBeEnabled();
  await page.getByRole('tab', { name: 'Payments', exact: true }).click();
  await page.getByRole('button', { name: 'Check payment', exact: true }).click();
  await statusPanel(page).getByLabel('Payment ID', { exact: true }).fill(id);
  await statusPanel(page).getByRole('button', { name: 'Check status', exact: true }).click();
  await expect(statusPanel(page)).toContainText('Payment not found for this account.');
  expect(await storedPending(page, accountA)).toBe(id);
  expect(await storedPending(page, accountB)).toBeNull();
  api.actor.id = accountA;
  await page.locator('.page-heading').getByRole('button', { name: 'Refresh billing', exact: true }).click();
  await expect(page.locator('.billing-pending-wallet')).toBeVisible();
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await expect(starterBuy(page)).toBeDisabled();
  expect(payments(api.requests)).toHaveLength(1);
  expect(payments(api.requests).every(request => request.owner === accountA)).toBe(true);
  await page.screenshot({ path: info.outputPath('wallet-account-scope-restored.png'), animations: 'disabled' });
});

test('a late invoice after leaving Billing retains the guard without starting hidden confirmation', async ({ page }) => {
  const api = await walletServer(page, { holdInvoice: true });
  await page.goto('/search');
  await nav(page).getByRole('link', { name: 'Billing', exact: true }).click();
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await starterBuy(page).click();
  await review(page).getByLabel('Payment method', { exact: true }).selectOption('balance');
  await review(page).getByRole('button', { name: 'Pay with balance', exact: true }).click();
  await expect.poll(() => payments(api.requests).length).toBe(1);
  await page.goBack(); await page.goBack();
  await expect(page).toHaveURL('/search');
  api.releaseInvoice();
  await expect.poll(() => storedPending(page)).toBe(api.orders[0].id);
  // Let the already queued response callbacks run; no further user payment action occurs.
  await page.waitForTimeout(150);
  expect(confirmations(api.requests)).toHaveLength(0);
  await nav(page).getByRole('link', { name: 'Billing', exact: true }).click();
  await expect(page.locator('.billing-pending-wallet')).toBeVisible();
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await expect(starterBuy(page)).toBeDisabled();
  expect(payments(api.requests)).toHaveLength(1);
});
