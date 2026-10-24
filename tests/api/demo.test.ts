import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, type ApiClient, type ApiFrame, type HostCard, type Profile, type SavedQuery, type SessionData, type PrivateTask, type PlanningTask, type NotificationsData, type TOTPValidationData, type BillingData, type CryptoInvoice, type UserAddressesData, type AddressTransactionsData } from '../../src/api';
import { createDemoApi } from '../../src/demo';
import { DEMO_TIMESTAMP } from '../../src/demo/fixtures';

const post = (body: unknown) => ({ method: 'POST', body });
async function collect(api: ApiClient, type: string, data: unknown = {}): Promise<ApiFrame[]> {
  return new Promise((resolve, reject) => {
    const frames: ApiFrame[] = [];
    api.stream(type, data, { onFrame: frame => frames.push(frame), onError: reject, onComplete: () => resolve(frames), timeoutMs: 2000 });
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('in-memory demo implements meaningful client behavior', () => {
  it('starts in Business, uses only documentation hosts and never invokes a network primitive', async () => {
    const fetch = vi.fn(() => { throw new Error('network forbidden'); });
    const websocket = vi.fn(function () { throw new Error('network forbidden'); });
    vi.stubGlobal('fetch', fetch); vi.stubGlobal('WebSocket', websocket);
    const api = createDemoApi(), profile = await api.http<Profile>('/whoami');
    expect(profile.user_name).toBe('alex_research'); expect(profile.subscription?.type).toBe('Business');
    const results = await api.request<HostCard[]>('hosts', { docs_per_page: 50 });
    expect(results.data).toHaveLength(12);
    expect(results.data!.every(host => /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|2001:db8::|.*\.example\.(com|org)$)/.test(host.ip))).toBe(true);
    expect(results.metadata?.credits).toBe(1_240_499);
    const stats = await api.http<{ success: boolean; data: Record<string, number> }>('/api/statistics');
    expect(stats.success).toBe(true); expect(stats.data.ipv4 + stats.data.ipv6 + stats.data.domains).toBe(12);
    expect(typeof stats.data.protocols).toBe('number');
    expect(fetch).not.toHaveBeenCalled(); expect(websocket).not.toHaveBeenCalled(); api.disconnect();
  });

  it('keeps adapters and returned objects isolated while evaluating nested filter conditions', async () => {
    const api = createDemoApi(), another = createDemoApi();
    const profile = await api.http<Profile>('/whoami'); profile.credits = 0;
    const frame = await api.request<HostCard[]>('hosts', { simple_search_filters: [{ operator: 'AND', filters: [{ field: 'port', value: '443' }, { operator: 'NOT', filters: [{ field: 'type', value: 'ipv4' }] }] }] });
    expect(frame.data).toHaveLength(4);
    expect((await api.http<Profile>('/whoami')).credits).toBe(1_240_499);
    expect((await another.http<Profile>('/whoami')).credits).toBe(1_240_500);
    await expect(api.request('hosts', { simple_search_filters: [{ field: 'unimplemented_demo_field', value: 'x' }] })).rejects.toThrow('is unavailable');
  });

  it('emits complete facet streams with host counts separate from service record counts', async () => {
    const api = createDemoApi({ delayMs: 0 });
    const frames = await collect(api, 'analytics', { full_text_search: 'nginx' });
    expect(frames.at(-1)?.data).toEqual({ complete: true });
    const data = frames.slice(0, -1).map(frame => frame.data as { facet_name: string; facet_values: { key: string; doc_count: number }[] });
    expect(data).toHaveLength(5);
    expect(data.find(facet => facet.facet_name === 'type')?.facet_values.reduce((n, value) => n + value.doc_count, 0)).toBe(4);
    expect(data.find(facet => facet.facet_name === 'protocol')?.facet_values.reduce((n, value) => n + value.doc_count, 0)).toBeGreaterThan(4);
    expect(frames.every(frame => frame.metadata?.credits === 1_240_498)).toBe(true);
    const unfiltered = await collect(api, 'analytics'); expect(unfiltered).toHaveLength(2);
  });

  it('delivers 100/1000 service detail fixtures and preserves private uncorrelated sections', async () => {
    const api = createDemoApi({ delayMs: 0 });
    const publicFrames = await collect(api, 'hostinfo', { ip: '198.51.100.24' });
    expect(publicFrames.map(frame => frame.type)).toEqual(['dnsinfo', 'hostinfo', 'whois', 'domain_ip_map']);
    expect(new Set(publicFrames.map(frame => frame.id)).size).toBe(1); expect(publicFrames.every(frame => !frame.metadata)).toBe(true);
    expect((publicFrames[1].data as { ports: unknown[] }).ports).toHaveLength(1000);
    const privateFrames = await collect(api, 'private_hostinfo', { ip: '192.0.2.10', task_ids: ['scan_001'] });
    expect(privateFrames).toHaveLength(3); expect(privateFrames.every(frame => frame.id === undefined && frame.metadata === undefined)).toBe(true);
    expect((privateFrames.find(frame => frame.type === 'private_hostinfo')?.data as { ports: unknown[] }).ports).toHaveLength(100);
  });

  it('saves exact nested JSON, deletes only a chosen saved query and enforces the cap', async () => {
    const api = createDemoApi(), initial = (await api.request<SavedQuery[]>('query_list')).data!;
    const query = { task_ids: ['scan_002'], range_filter: [{ field: 'uts', start: '100' }], page: 1, simple_search_filters: [{ operator: 'NOT', filters: [{ field: 'port', value: '22' }] }] };
    await api.request('query_create', query);
    const saved = (await api.request<SavedQuery[]>('query_list')).data!; expect(JSON.parse(saved[0].query)).toEqual(query);
    await api.request('query_delete', { id: saved[0].id });
    expect((await api.request<SavedQuery[]>('query_list')).data).toEqual(initial);
    await expect(api.request('query_delete', { id: saved[0].id })).rejects.toThrow('saved query not found');
    for (let i = 0; i < 17; i++) await api.request('query_create', { full_text_search: `query-${i}` });
    await expect(api.request('query_create', {})).rejects.toThrow('max 20');
  });

  it('holds Pending2FA outside the authenticated surface until the correct code arrives', async () => {
    const api = createDemoApi(); await api.http('/auth/logout');
    const login = await api.httpResponse('/auth/login', post({ identifier: 'review-2fa', password: 'demo-password' }));
    expect(login.status).toBe(202);
    await expect(api.http('/whoami')).rejects.toMatchObject({ kind: 'auth', status: 401 });
    await expect(api.connect()).rejects.toThrow('2FA');
    await expect(api.http('/auth/totp/verify', post({ code: '000000' }))).rejects.toThrow('Invalid 2FA code');
    await api.http('/auth/totp/verify', post({ code: '123456' }));
    expect((await api.http<Profile>('/whoami')).user_name).toBe('alex_research');
  });

  it('requires 18 characters at signup and creates a Free account without auto-login', async () => {
    const api = createDemoApi(); await api.http('/auth/logout');
    await expect(api.http('/auth/signup', post({ email: 'new@example.com', user_name: 'new_user', password: 'too-short' }))).rejects.toMatchObject({ status: 400 });
    await api.http('/auth/signup', post({ email: 'new@example.com', user_name: 'new_user', password: 'a-valid-demo-password' }));
    await api.http('/auth/verify', post({ email: 'new@example.com', code: '123456' }));
    await expect(api.http('/whoami')).rejects.toMatchObject({ status: 401 });
    await api.http('/auth/login', post({ identifier: 'new_user', password: 'sixsix' }));
    expect((await api.http<Profile>('/whoami')).subscription?.type).toBe('Free');
    await expect(api.request('private_tasks_get')).rejects.toThrow('Business');
    await api.http('/auth/logout'); await api.http('/auth/login', post({ identifier: 'alex_research', password: 'sixsix' }));
    expect((await api.http<Profile>('/whoami')).subscription?.type).toBe('Business');
  });

  it('enforces guest quota without an automatic guest fallback or reset on session refresh', async () => {
    let time = DEMO_TIMESTAMP * 1000; const api = createDemoApi({ now: () => time });
    await api.http('/auth/logout'); await expect(api.request('hosts', {})).rejects.toMatchObject({ kind: 'auth' });
    await api.http('/auth/guest', post({}));
    for (let i = 0; i < 20; i++) await api.request('hosts', {});
    await expect(api.request('hosts', {})).rejects.toThrow('daily search limit');
    await api.http('/auth/guest', post({})); await expect(api.request('hosts', {})).rejects.toThrow('daily search limit');
    expect((await api.http<Profile>('/whoami')).remaining_daily_searches).toBe(0);
    time += 86400000;
    const frame = await api.request('hosts', {}); expect(frame.metadata?.guest_access?.remaining_daily_searches).toBe(19);
    expect(frame.metadata?.credits).toBeUndefined();
  });

  it('keeps the current email until a code is verified and expires pending changes after 15 minutes', async () => {
    let time = DEMO_TIMESTAMP * 1000; const api = createDemoApi({ now: () => time });
    const change = { email: 'changed@example.com', user_name: 'alex_changed', password: 'sixsix' };
    await api.http('/profile/update', post(change)); expect((await api.http<Profile>('/whoami')).email).toBe('alex@example.com');
    await expect(api.http('/profile/verify', post({ code: '000000' }))).rejects.toThrow('Invalid or expired');
    time += 901000; await expect(api.http('/profile/verify', post({ code: '123456' }))).rejects.toThrow('Invalid or expired');
    await api.http('/profile/update', post(change)); await api.http('/profile/verify', post({ code: '123456' }));
    expect((await api.http<Profile>('/whoami')).email).toBe('changed@example.com');
  });

  it('expires TOTP enrollment and makes its five backup codes single-use', async () => {
    let time = DEMO_TIMESTAMP * 1000; const api = createDemoApi({ now: () => time });
    await api.request('totp', {}); time += 901000;
    await expect(api.request('totp_validate', { totp_code: '123456' })).rejects.toThrow('expired');
    await api.request('totp', {}); const enabled = await api.request<TOTPValidationData>('totp_validate', { totp_code: '123456' });
    expect(enabled.data?.backup_codes).toHaveLength(5); expect(enabled.data?.backup_codes?.every(code => code.length === 8)).toBe(true);
    await expect(api.request('totp_validate', { totp_code: '123456' })).rejects.toThrow('expired');
    await api.http('/auth/logout'); const login = await api.httpResponse('/auth/login', post({ identifier: 'alex_research', password: 'sixsix' })); expect(login.status).toBe(202);
    await api.http('/auth/totp/verify', post({ backup_code: 'DEMO0001' }));
    await api.http('/auth/logout'); await api.http('/auth/login', post({ identifier: 'alex_research', password: 'sixsix' }));
    await expect(api.http('/auth/totp/verify', post({ backup_code: 'DEMO0001' }))).rejects.toThrow('Invalid backup code');
  });

  it('keeps the current session when terminating others and deletes all sessions at logout', async () => {
    const api = createDemoApi(); const observed: ApiFrame[] = []; api.subscribe(frame => observed.push(frame));
    await expect(api.request('terminate_user_session', { session_id: 'session_current' })).rejects.toThrow('current session');
    const response = await api.request('terminate_all_sessions', {});
    const followup = observed.find(frame => frame.type === 'user_sessions' && frame.id === response.id);
    expect((followup?.data as SessionData).sessions).toHaveLength(1); expect((followup?.data as SessionData).sessions[0].is_current).toBe(true);
    await api.http('/auth/logout'); await expect(api.http('/whoami')).rejects.toMatchObject({ status: 401 });
    expect(api.getConnectionStatus()).toBe('closed');
  });

  it('creates a queued scan with exact credits, distinguishes results from task records, and does not invent scan output', async () => {
    const api = createDemoApi();
    const created = await api.request<{ task_id: string }>('private_task_add', { host_list: ['192.0.2.10'], cidr_list: ['203.0.113.0/28'], port_list: [80, 443], workers: 1 });
    const tasks = (await api.request<PrivateTask[]>('private_tasks_get')).data!;
    const task = tasks.find(task => task.id === created.data?.task_id)!;
    expect(task.task_count).toBe(30); expect(task.done_task_count).toBe(0); expect(task.has_results).toBe(false); expect(task.status).toBe('queued');
    expect((await api.http<Profile>('/whoami')).scan_credits).toBe(327650);
    expect((await api.request<HostCard[]>('private_hosts', { task_ids: [task.id] })).data).toEqual([]);
    await api.request('private_task_results_delete', { task_ids: ['scan_001'] });
    expect((await api.request<HostCard[]>('private_hosts', { task_ids: ['scan_001'] })).data).toEqual([]);
    expect((await api.request<HostCard[]>('hosts', {})).data).toHaveLength(12);
    expect((await api.request<PrivateTask[]>('private_tasks_get')).data?.find(task => task.id === 'scan_001')?.has_results).toBe(false);
    await api.request('private_task_remove', { id: task.id }); expect((await api.request<PrivateTask[]>('private_tasks_get')).data?.some(item => item.id === task.id)).toBe(false);
  });

  it('updates and removes a planning record without deleting a separate historical task', async () => {
    const api = createDemoApi(); await api.request('private_task_update', { id: 'schedule_001', schedule: '0 30 4 * * *' });
    expect((await api.request<PlanningTask[]>('private_planning_tasks_get')).data?.[0].schedule).toBe('0 30 4 * * *');
    await api.request('private_planning_task_remove', { id: 'schedule_001' });
    expect((await api.request<PlanningTask[]>('private_planning_tasks_get')).data).toEqual([]);
    expect((await api.request<PrivateTask[]>('private_tasks_get')).data).toHaveLength(3);
  });

  it('modifies the team by user ID and rejects owner leave and conflicting memberships', async () => {
    const api = createDemoApi(); await api.request('org_add', { user_id: 'demo-new-member' });
    expect((await api.http<Profile>('/whoami')).team?.team_members?.some(member => member.user_id === 'demo-new-member')).toBe(true);
    await api.request('org_remove', { user_id: 'demo-new-member' });
    expect((await api.http<Profile>('/whoami')).team?.team_members).toHaveLength(2);
    await expect(api.request('org_add', { user_id: 'missing-user' })).rejects.toThrow('User not found');
    await expect(api.request('org_add', { user_id: 'other-team-user' })).rejects.toThrow('another team');
    await expect(api.request('org_leave', {})).rejects.toThrow('owner cannot leave');
  });

  it('rotates a single key and pushes the documented unread notification wrapper', async () => {
    const api = createDemoApi(), pushes: ApiFrame[] = []; api.subscribe(frame => pushes.push(frame));
    const previous = (await api.http<Profile>('/whoami')).api_key;
    const result = await api.request<{ api_key: string }>('regenerate_api_key', {});
    expect(result.data?.api_key).not.toBe(previous); expect((await api.http<Profile>('/whoami')).api_key).toBe(result.data?.api_key);
    const unread = pushes.filter(frame => frame.type === 'unread_notifications').at(-1)?.data as NotificationsData;
    expect(unread.notifications[0].notification_type).toBe('balance_increased'); expect(unread.notifications[0].payload?.event).toBe('api_key_regenerated');
    await api.request('mark_all_notifications_read', {}); expect((await api.request<NotificationsData>('get_notifications', {})).data?.unread_count).toBe(0);
  });

  it('does not settle a wallet order when its confirmation stream is canceled before completion', async () => {
    const api = createDemoApi({ delayMs: 0 }), before = await api.http<Profile>('/whoami');
    const invoice = await api.request<CryptoInvoice>('pay_with_balance', { subscription: 'Plus', cadence: 'monthly' });
    const received = new Promise<ApiFrame>(resolve => { const stop = api.stream('confirm_payment', { payment_id: invoice.data?.payment_id }, { onFrame(frame) { stop(); resolve(frame); }, onError: error => { throw error; }, timeoutMs: 5000 }); });
    expect((await received).data).toMatchObject({ status: 'pending' });
    const after = await api.http<Profile>('/whoami'); expect(after.balance).toBe(before.balance); expect(after.subscription).toEqual(before.subscription);
    await api.request('delete_payment', { payment_id: invoice.data?.payment_id });
    expect((await api.request<BillingData>('user_billing', {})).data?.payments?.some(payment => payment.payment_id === invoice.data?.payment_id)).toBe(false);
    await expect(api.request('init_checkout', { subscription: 'Plus', cadence: 'monthly' })).rejects.toThrow('Payment service unavailable');
    await expect(api.request('billing_manage')).rejects.toThrow('Payment service unavailable');
  });

  it('settles a wallet credit purchase once, keeps money and credits separate, and has no payable address', async () => {
    const api = createDemoApi({ delayMs: 0 }), before = await api.http<Profile>('/whoami');
    const invoice = (await api.request<CryptoInvoice>('pay_with_balance', { token_pack_id: 'token_pack_1' })).data!;
    expect(invoice).toMatchObject({ amount_usd: 50, final_amount_usd: 50 });
    expect(invoice.address).toBeUndefined(); expect(invoice.network).toBeUndefined(); expect(invoice.coin).toBeUndefined();
    expect((await api.http<Profile>('/whoami')).balance).toBe(before.balance);
    const streams = await Promise.all([collect(api, 'confirm_payment', { payment_id: invoice.payment_id }), collect(api, 'confirm_payment', { payment_id: invoice.payment_id })]);
    for (const stream of streams) expect(stream.map(frame => (frame.data as { status: string }).status)).toEqual(['pending', 'completed']);
    const after = await api.http<Profile>('/whoami');
    expect(after.balance).toBe(70); expect(after.credits).toBe(before.credits! + 25000); expect(after.purchased_credits).toBe(25000);
    expect(after.subscription).toEqual(before.subscription); expect(after.scan_credits).toBe(before.scan_credits);
    const replay = await collect(api, 'confirm_payment', { payment_id: invoice.payment_id });
    expect(replay.map(frame => (frame.data as { status: string }).status)).toEqual(['completed']);
    expect(await api.http<Profile>('/whoami')).toEqual(after);
    const payment = (await api.request<BillingData>('user_billing', {})).data!.payments!.find(item => item.payment_id === invoice.payment_id);
    expect(payment).toMatchObject({ status: 'completed', amount_usd: 50, subscription: 'Starter Pack' });
    expect(payment?.completed_at).toBeTypeOf('number');
    await api.request('delete_payment', { payment_id: invoice.payment_id });
    expect((await api.http<Profile>('/whoami')).balance).toBe(70);
  });

  it('rejects insufficient funds and prevents pending wallet orders from overspending a balance', async () => {
    const api = createDemoApi({ delayMs: 0, now: () => DEMO_TIMESTAMP * 1000 });
    const before = (await api.request<BillingData>('user_billing', {})).data!;
    await expect(api.request('pay_with_balance', { subscription: 'Plus', cadence: 'annually' })).rejects.toThrow('Insufficient balance');
    expect((await api.request<BillingData>('user_billing', {})).data).toEqual(before);
    const first = (await api.request<CryptoInvoice>('pay_with_balance', { token_pack_id: 'token_pack_1' })).data!;
    await api.request('pay_with_balance', { token_pack_id: 'token_pack_1' });
    await expect(api.request('pay_with_balance', { token_pack_id: 'token_pack_1' })).rejects.toThrow('reserved for a pending payment');
    expect((await api.http<Profile>('/whoami')).balance).toBe(120);
    await api.request('delete_payment', { payment_id: first.payment_id });
    await expect(api.request('pay_with_balance', { token_pack_id: 'token_pack_1' })).resolves.toHaveProperty('data.payment_id');
  });

  it('applies a validated promo exactly once and grants the purchased plan only at confirmation', async () => {
    const api = createDemoApi({ delayMs: 0, now: () => DEMO_TIMESTAMP * 1000 });
    const invoice = (await api.request<CryptoInvoice>('pay_with_balance', { subscription: 'Plus', cadence: 'monthly', promo_code: 'WELCOME' })).data!;
    expect(invoice).toMatchObject({ original_amount_usd: 50, final_amount_usd: 45 });
    expect((await api.http<Profile>('/whoami')).subscription?.type).toBe('Business');
    await collect(api, 'confirm_payment', { payment_id: invoice.payment_id });
    const profile = await api.http<Profile>('/whoami');
    expect(profile.balance).toBe(75); expect(profile.credits).toBe(25000); expect(profile.scan_credits).toBe(0);
    expect(profile.subscription).toMatchObject({ type: 'Plus', price: 45, start_date: DEMO_TIMESTAMP, expiry_date: DEMO_TIMESTAMP + 30 * 86400, canceled: false, last_payment: invoice.payment_id });
  });

  it('expires a pending wallet order without deducting money or granting access', async () => {
    let current = DEMO_TIMESTAMP * 1000;
    const api = createDemoApi({ delayMs: 0, now: () => current }), before = await api.http<Profile>('/whoami');
    const invoice = (await api.request<CryptoInvoice>('pay_with_balance', { token_pack_id: 'token_pack_1' })).data!;
    current += 3601 * 1000;
    const frames = await collect(api, 'confirm_payment', { payment_id: invoice.payment_id });
    expect(frames.at(-1)?.data).toMatchObject({ status: 'expired' });
    expect(await api.http<Profile>('/whoami')).toEqual(before);
    expect((await api.request<BillingData>('user_billing', {})).data?.payments?.find(item => item.payment_id === invoice.payment_id)?.status).toBe('expired');
  });

  it('preserves huge crypto unit strings in read-only fixtures without settling payments', async () => {
    const api = createDemoApi(), before = await api.http<Profile>('/whoami');
    const summary = await api.request<UserAddressesData>('get_user_addresses_info', {});
    expect(summary.context?.principal).toBe('account');
    expect(summary.data?.addresses).toHaveLength(1);
    const address = summary.data!.addresses[0];
    expect(address.address).toBe('DEMO_ONLY_NOT_A_PAYMENT_ADDRESS');
    expect(before.addresses?.[0].address).toBe(address.address);
    expect(address.total_received).toBe('900719925474099312345678901');
    expect(address.total_received_readable).toBe('900719925.474099312345678901');
    expect(address.is_active).toBe(false);
    const history = await api.request<AddressTransactionsData>('get_address_transactions', { address: address.address });
    expect(history.context?.principal).toBe('account');
    expect(history.data).toMatchObject({ address: address.address, count: 1 });
    const transaction = history.data!.transactions[0];
    expect(transaction).toMatchObject({ amount: address.total_received, decimals: 18, block_number: '9007199254740993', status: 'received' });
    expect(transaction.processed_at).toBeUndefined();
    expect(BigInt(transaction.amount).toString()).toBe(transaction.amount);
    expect((await api.request<AddressTransactionsData>('get_address_transactions', { address: 'UNKNOWN_DEMO_ADDRESS' })).data?.count).toBe(0);
    const after = await api.http<Profile>('/whoami');
    expect(after.balance).toBe(before.balance); expect(after.subscription).toEqual(before.subscription);
    expect((await api.request<BillingData>('user_billing', {})).data?.payments?.every(payment => payment.status === 'pending')).toBe(true);
  });

  it('binds shared access to the exact payload, consumes uses and expires tokens', async () => {
    let time = DEMO_TIMESTAMP * 1000; const api = createDemoApi({ now: () => time });
    const query = { page: 1, docs_per_page: 20, full_text_search: 'nginx' };
    const result = await api.request<{ share_token: string }>('share_link_create', { data: query, query: 'q=nginx&page=1', ttl_seconds: 60, max_opens: 2 });
    const st = result.data!.share_token;
    await expect(api.request('hosts', { ...query, page: 2, st })).rejects.toThrow('does not match');
    expect((await api.request('hosts', { ...query, st })).context?.principal).toBe('shared');
    expect((await api.request('analytics', { ...query, st })).context?.principal).toBe('shared');
    await expect(api.request('hosts', { ...query, st })).rejects.toThrow('expired share link');
    const another = await api.request<{ share_token: string }>('share_link_create', { data: query, query: 'q=nginx', ttl_seconds: 1 }); time += 2000;
    await expect(api.request('hosts', { ...query, st: another.data!.share_token })).rejects.toThrow('expired share link');
  });

  it('streams NDJSON and CSV, preserves empty files, and rejects unsupported checkpoint simulation', async () => {
    const api = createDemoApi();
    const response = await api.raw('/download/bulk/stream', post({ download_mode: 'partial', max_documents: 3 }));
    expect(response.bodyUsed).toBe(false); expect(response.headers.get('content-type')).toBe('application/x-ndjson');
    const rows = (await response.text()).trim().split('\n').map(row => JSON.parse(row)); expect(rows).toHaveLength(3); expect(rows[0].ip).toBe('192.0.2.10');
    const files = await api.raw('/download/buckets/stream', post({ download_mode: 'files', format: 'csv' })); expect(await files.text()).toContain('empty.log');
    await expect(api.raw('/download/bulk/stream', post({ download_mode: 'full', format: 'csv' }))).rejects.toThrow('csv is not supported');
    await expect(api.raw('/download/bulk/stream', { ...post({ download_mode: 'partial' }), headers: { Range: 'bytes=1048576-' } })).rejects.toMatchObject({ status: 501 });
  });

  it('cancels streams before dispatch, rejects unsupported methods, and does not produce fabricated success', async () => {
    const api = createDemoApi({ delayMs: 0 }), received = vi.fn();
    const stop = api.stream('query_create', { full_text_search: 'never-saved' }, { onFrame: received }); stop();
    await Promise.resolve(); await Promise.resolve();
    expect(received).not.toHaveBeenCalled(); expect((await api.request<SavedQuery[]>('query_list')).data).toHaveLength(3);
    await expect(api.request('buy_credits', {})).rejects.toBeInstanceOf(ApiError);
    await expect(api.http('/unknown', post({}))).rejects.toMatchObject({ status: 501, outcome: 'not-sent' });
    const abort = new AbortController(); abort.abort(); await expect(api.request('hosts', {}, { signal: abort.signal })).rejects.toMatchObject({ outcome: 'not-sent' });
  });
});
