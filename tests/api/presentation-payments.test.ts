import { describe, expect, it, vi } from 'vitest';
import type { ApiClient, ApiFrame, BillingData, Profile } from '../../src/api';
import { createDemoApi } from '../../src/demo';
import { presentationPayments } from '../../src/demo/presentation-payments';
import { PRESENTATION_ORDER_KEY, readPresentationOrders, type OrderStorage } from '../../src/demo/presentation-order-store';
import { orderReturnPath, receiptText, retryPurchasePath } from '../../src/features/billing/order-model';

const instant = Date.UTC(2030, 4, 10, 11, 30);
function storage(): OrderStorage {
  const entries = new Map<string, string>();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: key => { entries.delete(key); } };
}
async function confirm(api: ApiClient, paymentId: string) {
  return new Promise<ApiFrame[]>((resolve, reject) => {
    const frames: ApiFrame[] = [];
    api.stream('confirm_payment', { payment_id: paymentId }, { mutation: true, onFrame: frame => frames.push(frame), onError: reject, onComplete: () => resolve(frames), timeoutMs: 3000 });
  });
}

describe('isolated presentation payment capability', () => {
  it.each(['card', 'crypto'] as const)('requires explicit %s authorization and settles exactly once without a provider call', async method => {
    const network = vi.spyOn(globalThis, 'fetch');
    try {
      const api = createDemoApi({ delayMs: 0, now: () => instant, orderStorage: null }), controller = presentationPayments(api)!;
      const before = await api.http<Profile>('/whoami');
      const request = { token_pack_id: 'token_pack_1', promo_code: 'WELCOME', ...(method === 'crypto' ? { network: 'Ethereum', coin: 'USDT' } : {}) };
      const first = await controller.create(method, request), duplicate = await controller.create(method, request);
      expect(duplicate.paymentId).toBe(first.paymentId);
      expect(first).toMatchObject({ status: 'pending', authorized: false, total: 45, subtotal: 50, discount: 5 });
      expect((await api.request('confirm_payment', { payment_id: first.paymentId })).data).toMatchObject({ status: 'pending' });
      expect(await api.http('/whoami')).toEqual(before);
      expect(controller.get(first.paymentId)?.authorized).toBe(false);
      if (method === 'crypto') expect(first.reference).toMatch(/^APCO-ORDER-PAY-/);
      const storedPayment = (await api.request<BillingData>('user_billing')).data?.payments?.find(item => item.payment_id === first.paymentId);
      expect(storedPayment?.address).toBeUndefined();
      expect(first).not.toHaveProperty('checkout_url');
      controller.authorize(first.paymentId);
      await expect(controller.create('card', { token_pack_id: 'token_pack_2' })).rejects.toThrow('Check your current payment');
      await expect(api.request('pay_with_balance', { token_pack_id: 'token_pack_1' })).rejects.toThrow('Check your current payment');
      await expect(Promise.all([confirm(api, first.paymentId), confirm(api, first.paymentId)])).resolves.toEqual(expect.any(Array));
      await confirm(api, first.paymentId);
      const after = await api.http<Profile>('/whoami');
      expect(after.credits).toBe(before.credits! + 25000);
      expect(after.balance).toBe(before.balance);
      expect(after.subscription).toEqual(before.subscription);
      expect(controller.get(first.paymentId)).toMatchObject({ status: 'completed', completedAt: instant / 1000 });
      expect(network).not.toHaveBeenCalled();
    } finally { network.mockRestore(); }
  });

  it('preserves pending, canceled, completed, deleted orders and entitlements across reload without accumulating the seed', async () => {
    const saved = storage(), options = { delayMs: 0, now: () => instant, orderStorage: saved };
    let api = createDemoApi(options), controller = presentationPayments(api)!;
    const before = await api.http<Profile>('/whoami');
    const card = await controller.create('card', { token_pack_id: 'token_pack_1' });
    api = createDemoApi(options); controller = presentationPayments(api)!;
    expect(controller.get(card.paymentId)).toMatchObject({ status: 'pending', authorized: false, total: 50 });
    controller.authorize(card.paymentId); await confirm(api, card.paymentId);
    const after = await api.http<Profile>('/whoami');
    for (let count = 0; count < 3; count++) {
      api = createDemoApi(options); controller = presentationPayments(api)!;
      expect(controller.get(card.paymentId)).toMatchObject({ status: 'completed' });
      await confirm(api, card.paymentId);
      expect((await api.http<Profile>('/whoami')).credits).toBe(before.credits! + 25000);
      expect((await api.http<Profile>('/whoami')).balance).toBe(after.balance);
    }
    const canceled = await controller.create('crypto', { subscription: 'Plus', cadence: 'annually', network: 'Ethereum', coin: 'USDT', promo_code: 'WELCOME' });
    controller.cancel(canceled.paymentId);
    api = createDemoApi(options); controller = presentationPayments(api)!;
    expect(controller.get(canceled.paymentId)).toMatchObject({ status: 'canceled', authorized: false });
    expect(new URL(retryPurchasePath(controller.get(canceled.paymentId)!), 'https://app.example').searchParams.get('promo')).toBe('WELCOME');
    await api.request('delete_payment', { payment_id: card.paymentId });
    api = createDemoApi(options); controller = presentationPayments(api)!;
    expect(controller.get(card.paymentId)).toBeUndefined();
    expect((await api.http<Profile>('/whoami')).credits).toBe(after.credits);
    expect((await api.request<BillingData>('user_billing')).data?.payments?.some(item => item.payment_id === card.paymentId)).toBe(false);
  });

  it('restores a completed wallet debit and a plan purchase once from the same ledger', async () => {
    const saved = storage(), options = { delayMs: 0, now: () => instant, orderStorage: saved };
    const api = createDemoApi(options), controller = presentationPayments(api)!;
    const wallet = (await api.request<{ payment_id: string }>('pay_with_balance', { token_pack_id: 'token_pack_1' })).data!;
    await confirm(api, wallet.payment_id);
    const plan = await controller.create('card', { subscription: 'Plus', cadence: 'monthly' });
    controller.authorize(plan.paymentId); await confirm(api, plan.paymentId);
    const before = await api.http<Profile>('/whoami');
    const restored = createDemoApi(options);
    expect(await restored.http('/whoami')).toEqual(before);
    await confirm(restored, wallet.payment_id); await confirm(restored, plan.paymentId);
    expect(await restored.http('/whoami')).toEqual(before);
  });

  it('replays plan settlements in confirmation order when orders complete in reverse creation order within one second', async () => {
    const saved = storage(), options = { delayMs: 0, now: () => instant, orderStorage: saved };
    const api = createDemoApi(options), controller = presentationPayments(api)!;
    const first = await controller.create('card', { subscription: 'Plus', cadence: 'monthly' });
    const second = await controller.create('card', { subscription: 'Expert', cadence: 'annually' });
    controller.authorize(second.paymentId); await confirm(api, second.paymentId);
    controller.authorize(first.paymentId); await confirm(api, first.paymentId);
    const expected = await api.http<Profile>('/whoami');
    expect(expected.subscription?.type).toBe('Plus');
    const snapshot = JSON.parse(saved.getItem(PRESENTATION_ORDER_KEY)!);
    const firstRecord = snapshot.orders.find((item: { paymentId: string }) => item.paymentId === first.paymentId);
    const secondRecord = snapshot.orders.find((item: { paymentId: string }) => item.paymentId === second.paymentId);
    expect(firstRecord.completedAt).toBe(secondRecord.completedAt);
    expect(firstRecord.settlementSequence).toBeGreaterThan(secondRecord.settlementSequence);
    for (let reload = 0; reload < 3; reload++) {
      const restored = createDemoApi(options);
      expect(await restored.http('/whoami')).toEqual(expected);
      await confirm(restored, first.paymentId); await confirm(restored, second.paymentId);
      expect(await restored.http('/whoami')).toEqual(expected);
    }
    const restored = createDemoApi(options), resumed = presentationPayments(restored)!;
    const third = await resumed.create('card', { token_pack_id: 'token_pack_1' });
    resumed.authorize(third.paymentId); await confirm(restored, third.paymentId);
    const finalSnapshot = JSON.parse(saved.getItem(PRESENTATION_ORDER_KEY)!);
    expect(finalSnapshot.orders.find((item: { paymentId: string }) => item.paymentId === third.paymentId).settlementSequence).toBeGreaterThan(firstRecord.settlementSequence);
  });

  it.each([0, 1])('respects the precise expiry boundary with %i seconds remaining', async remaining => {
    let current = instant;
    const api = createDemoApi({ delayMs: 0, now: () => current, orderStorage: null }), controller = presentationPayments(api)!;
    const before = await api.http('/whoami');
    const order = await controller.create('card', { token_pack_id: 'token_pack_1' });
    controller.authorize(order.paymentId);
    current = (order.expiresAt - remaining) * 1000;
    const frames = await confirm(api, order.paymentId);
    expect(frames.at(-1)?.data).toMatchObject({ status: remaining ? 'completed' : 'expired', timestamp: current / 1000 });
    if (!remaining) expect(await api.http('/whoami')).toEqual(before);
    else expect(controller.get(order.paymentId)?.completedAt).toBe(current / 1000);
  });

  it('does not grant access when confirmation is aborted before its terminal delivery', async () => {
    const api = createDemoApi({ delayMs: 1, now: () => instant, orderStorage: null }), controller = presentationPayments(api)!;
    const before = await api.http('/whoami'), order = await controller.create('card', { token_pack_id: 'token_pack_1' });
    controller.authorize(order.paymentId);
    await new Promise<void>((resolve, reject) => {
      const stop = api.stream('confirm_payment', { payment_id: order.paymentId }, { mutation: true, onFrame: frame => { expect(frame.data).toMatchObject({ status: 'pending' }); stop(); resolve(); }, onError: reject });
    });
    expect(await api.http('/whoami')).toEqual(before);
    expect(controller.get(order.paymentId)).toMatchObject({ status: 'pending', authorized: true });
    expect(() => controller.cancel(order.paymentId)).toThrow('Confirmation has started');
    await confirm(api, order.paymentId);
    expect(controller.get(order.paymentId)?.status).toBe('completed');
  });

  it('rejects invalid product/network and unsigned authorization while keeping live checkout contracts unchanged', async () => {
    const api = createDemoApi({ delayMs: 0, orderStorage: null }), controller = presentationPayments(api)!;
    await expect(controller.create('card', { token_pack_id: 'unknown' })).rejects.toThrow('Unknown');
    await expect(controller.create('crypto', { token_pack_id: 'token_pack_1', network: 'Ethereum', coin: 'BTC' })).rejects.toThrow('available network');
    await expect(api.request('init_checkout', { token_pack_id: 'token_pack_1' })).rejects.toThrow('Payment service unavailable');
    const order = await controller.create('card', { token_pack_id: 'token_pack_1' });
    await api.http('/auth/logout');
    expect(controller.get(order.paymentId)).toBeUndefined();
    expect(() => controller.authorize(order.paymentId)).toThrow('Unauthorized');
    await expect(controller.create('card', { token_pack_id: 'token_pack_1' })).rejects.toThrow('Unauthorized');
    expect(presentationPayments({} as ApiClient)).toBeUndefined();
  });

  it('locks an exact ETH quote independently from the dollar total and restores it unchanged', async () => {
    const saved = storage(), options = { delayMs: 0, now: () => instant, orderStorage: saved };
    const api = createDemoApi(options), controller = presentationPayments(api)!;
    const order = await controller.create('crypto', { token_pack_id: 'token_pack_1', promo_code: 'WELCOME', network: 'Ethereum', coin: 'ETH' });
    expect(order).toMatchObject({ total: 45, cryptoAmount: '0.01800000', quoteUsd: '2500.00' });
    expect(presentationPayments(createDemoApi(options))!.get(order.paymentId)).toEqual(order);
    controller.authorize(order.paymentId); await confirm(api, order.paymentId);
    const payment = (await api.request<BillingData>('user_billing')).data!.payments!.find(item => item.payment_id === order.paymentId)!;
    expect(payment.amount).toBe(0.018);
    expect(receiptText(payment, controller.get(order.paymentId))).toContain('Crypto amount: 0.01800000 ETH');
    expect(receiptText(payment, controller.get(order.paymentId))).toContain('Total: $45');
  });

  it('scopes orders and read-only crypto references to the account that owns them', async () => {
    const api = createDemoApi({ delayMs: 0, orderStorage: null }), controller = presentationPayments(api)!;
    const order = await controller.create('card', { token_pack_id: 'token_pack_1' });
    const references = controller.addresses();
    expect(references.addresses[0].address).toMatch(/^APCO-ACCOUNT-/);
    const raw = controller.transactions(references.addresses[0].address);
    expect(typeof raw.transactions[0].amount).toBe('string');
    await api.http('/auth/logout');
    await api.http('/auth/signup', { method: 'POST', body: { email: 'buyer@example.org', user_name: 'buyer', password: 'separate-account-password' } });
    await api.http('/auth/verify', { method: 'POST', body: { email: 'buyer@example.org', code: '123456' } });
    await api.http('/auth/login', { method: 'POST', body: { identifier: 'buyer', password: 'separate-account-password' } });
    expect(controller.get(order.paymentId)).toBeUndefined();
    expect(controller.addresses().addresses).toEqual([]);
    await expect(api.request('confirm_payment', { payment_id: order.paymentId })).rejects.toThrow('another account');
    await expect(api.request('delete_payment', { payment_id: order.paymentId })).rejects.toThrow('another account');
    expect((await api.request<BillingData>('user_billing')).data?.payments?.some(item => item.payment_id === order.paymentId)).toBe(false);
  });
});

describe('presentation ledger validation and order navigation', () => {
  it('drops oversized, stale, wrong-owner and invalid snapshots', async () => {
    const saved = storage(), api = createDemoApi({ now: () => instant, delayMs: 0, orderStorage: saved });
    await presentationPayments(api)!.create('card', { token_pack_id: 'token_pack_1' });
    const good = saved.getItem(PRESENTATION_ORDER_KEY)!;
    const owner = (await api.http<Profile>('/whoami')).user_id!;
    for (const mutate of [
      (value: Record<string, unknown>) => ({ ...value, owner: 'another-account' }),
      (value: Record<string, unknown>) => ({ ...value, seedEpoch: instant / 1000 - 86401 }),
      (value: Record<string, unknown>) => ({ ...value, orders: [{ paymentId: 'pay-00001' }] }),
      (value: Record<string, unknown>) => ({ ...value, orders: [...value.orders as unknown[], ...(value.orders as unknown[])] }),
    ]) {
      saved.setItem(PRESENTATION_ORDER_KEY, JSON.stringify(mutate(JSON.parse(good))));
      expect(readPresentationOrders(saved, owner, instant / 1000)).toBeUndefined();
      expect(saved.getItem(PRESENTATION_ORDER_KEY)).toBeNull();
    }
    saved.setItem(PRESENTATION_ORDER_KEY, 'x'.repeat(65537));
    expect(readPresentationOrders(saved, owner, instant / 1000)).toBeUndefined();
    saved.setItem(PRESENTATION_ORDER_KEY, good);
    const decoded = JSON.parse(good);
    expect(JSON.stringify(decoded)).not.toMatch(/api_key|password|session_id|cvv|card_number/);
  });

  it('keeps history filters in a same-origin billing return, and receipts contain only known order facts', async () => {
    expect(orderReturnPath('?back=https%3A%2F%2Fevil.example%2Fbilling')).toBe('/billing?section=payments');
    expect(orderReturnPath('?back=' + encodeURIComponent('/billing?section=plans&history_query=pay&history_status=completed&method=card'))).toBe('/billing?section=payments&history_query=pay&history_status=completed');
    const api = createDemoApi({ now: () => instant, delayMs: 0, orderStorage: null }), controller = presentationPayments(api)!;
    const order = await controller.create('card', { token_pack_id: 'token_pack_1', promo_code: 'WELCOME' });
    controller.authorize(order.paymentId); await confirm(api, order.paymentId);
    const payment = (await api.request<BillingData>('user_billing')).data!.payments!.find(item => item.payment_id === order.paymentId)!;
    const receipt = receiptText(payment, controller.get(order.paymentId));
    expect(receipt).toContain('Total: $45');
    expect(receipt).toContain('Discount: $5');
    expect(receipt).toContain('25,000');
    expect(receipt).toContain('Status: Completed');
    expect(receipt).not.toMatch(/VAT|tax ID|bank account|4242/);
  });
});
