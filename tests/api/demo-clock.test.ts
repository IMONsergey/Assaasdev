import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AddressTransactionsData, ApiClient, ApiFrame, BillingData, CryptoInvoice,
  HostCard, NotificationsData, PricingData, PrivateTask, Profile, SavedQuery,
  SessionData, UserAddressesData,
} from '../../src/api';
import { createDemoApi } from '../../src/demo';
import { DEMO_PAYMENT_ADDRESS, DEMO_TIMESTAMP } from '../../src/demo/fixtures';

const DAY = 86_400;
async function confirm(api: ApiClient, paymentId: string): Promise<ApiFrame[]> {
  return new Promise((resolve, reject) => {
    const frames: ApiFrame[] = [];
    api.stream('confirm_payment', { payment_id: paymentId }, {
      onFrame: frame => frames.push(frame), onError: reject,
      onComplete: () => resolve(frames), timeoutMs: 2000,
    });
  });
}
afterEach(() => vi.restoreAllMocks());

describe('presentation account time', () => {
  it('anchors account/workspace dates to the browser clock without refreshing historical observations', async () => {
    const epoch = Date.UTC(2031, 0, 15, 10, 30) / 1000;
    let current = epoch * 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => current);
    const api = createDemoApi({ delayMs: 0 });
    const profile = await api.http<Profile>('/whoami');
    expect(profile).toMatchObject({ issued_at: epoch, authenticated_at: epoch, expires_at: epoch + 100 * DAY });
    expect(profile.subscription).toMatchObject({ start_date: epoch - 4 * DAY, expiry_date: epoch + 26 * DAY, duration: 2_592_000_000_000_000 });
    expect(profile.team?.team_members?.[0].added_at).toBe(epoch - 2 * DAY);
    const billing = (await api.request<BillingData>('user_billing')).data!;
    expect(billing.subscription).toMatchObject({ active: true, days_remaining: 26 });
    expect(billing.payments?.[0]).toMatchObject({ created_at: epoch, updated_at: epoch, expires_at: epoch + 3600 });
    expect((await api.http<PricingData>('/pricing')).timestamp).toBe(epoch);
    expect((await api.request<SessionData>('user_sessions')).data?.sessions[0]).toMatchObject({ last_activity: epoch, created_at: epoch - 7200 });
    expect((await api.request<SavedQuery[]>('query_list')).data?.[0]).toMatchObject({ created_at: epoch - 7200, updated_at: epoch - 7200 });
    expect((await api.request<NotificationsData>('get_notifications')).data?.notifications[0].created_at).toBe(epoch - 600);
    const tasks = (await api.request<PrivateTask[]>('private_tasks_get')).data!;
    expect(tasks.find(task => task.id === 'scan_001')).toMatchObject({ created_at: epoch - 10800, start_time: epoch - 10790, end_time: epoch - 10200 });
    expect(tasks.find(task => task.id === 'scan_002')).toMatchObject({ created_at: epoch - 900, start_time: epoch - 890, end_time: 0 });
    const hosts = (await api.request<HostCard[]>('hosts', { docs_per_page: 50 })).data!;
    expect(hosts.find(host => host.ip === '192.0.2.10')?.uts).toBe(DEMO_TIMESTAMP);
    const files = (await api.request<{ result: { uts: number }[] }>('buckets')).data!;
    expect(Math.max(...files.result.map(file => file.uts))).toBe(DEMO_TIMESTAMP);
    const stats = await api.http<{ data: { last_updated_timestamp: number } }>('/api/statistics');
    expect(stats.data.last_updated_timestamp).toBe(DEMO_TIMESTAMP);

    current += DAY * 1000;
    const addresses = (await api.request<UserAddressesData>('get_user_addresses_info')).data!;
    expect(addresses.addresses[0]).toMatchObject({ last_checked_at: epoch, last_tx_timestamp: epoch - 3600 });
    const transfers = (await api.request<AddressTransactionsData>('get_address_transactions', { address: DEMO_PAYMENT_ADDRESS })).data!;
    expect(transfers.transactions[0]).toMatchObject({ timestamp: epoch - 3600, created_at: epoch - 3590 });
    await api.http('/auth/logout');
    await api.http('/auth/login', { method: 'POST', body: { identifier: 'alex_research', password: 'sixsix' } });
    expect((await api.request<SessionData>('user_sessions')).data?.sessions[0]).toMatchObject({ last_activity: epoch + DAY, created_at: epoch + DAY, authenticated_at: epoch + DAY });
    expect((await api.http<Profile>('/whoami')).authenticated_at).toBe(epoch + DAY);
  });

  it('uses one issuance instant for wallet and crypto records and their responses across clock ticks', async () => {
    let current = Date.UTC(2026, 9, 24, 12);
    const api = createDemoApi({ delayMs: 0, now: () => { const value = current; current += 1000; return value; } });
    for (const [method, data] of [
      ['pay_with_balance', { token_pack_id: 'token_pack_1' }],
      ['get_address', { subscription: 'Plus', cadence: 'monthly', network: 'demo-network', coin: 'DEMO' }],
    ] as const) {
      const invoice = (await api.request<CryptoInvoice>(method, data)).data!;
      const payment = (await api.request<BillingData>('user_billing')).data?.payments?.find(item => item.payment_id === invoice.payment_id);
      expect(payment).toMatchObject({ created_at: invoice.timestamp, updated_at: invoice.timestamp, expires_at: invoice.expires_at });
      expect(invoice.expires_at).toBe(invoice.timestamp! + 3600);
    }
  });

  it.each([
    { secondsBeforeExpiry: 0, status: 'expired' },
    { secondsBeforeExpiry: 1, status: 'completed' },
  ] as const)('keeps the exact wallet expiry boundary ($secondsBeforeExpiry seconds remaining → $status)', async ({ secondsBeforeExpiry, status }) => {
    let current = Date.UTC(2026, 9, 24, 12);
    const api = createDemoApi({ delayMs: 0, now: () => current });
    const before = await api.http<Profile>('/whoami');
    const invoice = (await api.request<CryptoInvoice>('pay_with_balance', { subscription: 'Plus', cadence: 'monthly' })).data!;
    const settledAt = invoice.expires_at! - secondsBeforeExpiry;
    current = settledAt * 1000;
    const frames = await confirm(api, invoice.payment_id);
    expect(frames.at(-1)?.data).toMatchObject({ status, timestamp: settledAt });
    const payment = (await api.request<BillingData>('user_billing')).data!.payments!.find(item => item.payment_id === invoice.payment_id)!;
    expect(payment).toMatchObject({ status, created_at: invoice.timestamp, expires_at: invoice.expires_at, updated_at: settledAt });
    const after = await api.http<Profile>('/whoami');
    if (status === 'expired') {
      expect(after).toEqual(before);
      expect(payment.completed_at).toBeUndefined();
    } else {
      expect(after.balance).toBe(70);
      expect(after.subscription).toMatchObject({ type: 'Plus', start_date: settledAt, expiry_date: settledAt + 30 * DAY });
      expect(payment.completed_at).toBe(settledAt);
    }
    current += DAY * 1000;
    await confirm(api, invoice.payment_id);
    expect(await api.http<Profile>('/whoami')).toEqual(after);
    expect((await api.request<BillingData>('user_billing')).data?.payments?.find(item => item.payment_id === invoice.payment_id)).toEqual(payment);
  });
});
