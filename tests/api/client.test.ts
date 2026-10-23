import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, methodCatalog } from '../../src/api';
import type { ApiClient, ApiFrame, WebSocketLike } from '../../src/api';

class FakeSocket extends EventTarget {
  readyState = 0;
  sent: Array<{ type: string; id: string; data: unknown }> = [];
  closeCount = 0;
  constructor(readonly url: string) { super(); }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
  send(raw: string) {
    if (this.readyState !== 1) throw new Error('Not open');
    this.sent.push(JSON.parse(raw));
  }
  close() { this.closeCount += 1; this.readyState = 3; this.dispatchEvent(new Event('close')); }
  receive(frame: unknown) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(frame) })); }
  raw(raw: string) { this.dispatchEvent(new MessageEvent('message', { data: raw })); }
}

const clients: ApiClient[] = [];
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup(options: Parameters<typeof createApiClient>[0] = {}) {
  const sockets: FakeSocket[] = [];
  const api = createApiClient({
    apiBaseUrl: 'https://api.example.test',
    webSocketFactory: (url) => { const socket = new FakeSocket(url); sockets.push(socket); return socket as unknown as WebSocketLike; },
    ...options,
  });
  clients.push(api);
  return { api, sockets };
}
async function ready(api: ApiClient, sockets: FakeSocket[]) {
  const connecting = api.connect();
  sockets[0].open();
  await connecting;
}
afterEach(() => { clients.splice(0).forEach((api) => api.disconnect()); vi.useRealTimers(); });

describe('HTTP contract', () => {
  it('preserves HTTP 202 and uses credentialed JSON without making a guest request', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: '2FA code required' }), { status: 202 }));
    const { api } = setup({ fetch: fetcher });
    const result = await api.httpResponse('/auth/login', { method: 'POST', body: { identifier: 'ada', password: 'secret' } });
    expect(result.status).toBe(202);
    expect(result.data).toEqual({ message: '2FA code required' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.example.test/auth/login');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body)).toEqual({ identifier: 'ada', password: 'secret' });
    expect(init.headers.get('Content-Type')).toBe('application/json');
  });

  it('supports a reverse-proxy base prefix and rejects credential forwarding to another origin', () => {
    const { api } = setup({ apiBaseUrl: 'https://app.example.test/backend/' });
    expect(api.url('/auth/google')).toBe('https://app.example.test/backend/auth/google');
    expect(() => api.url('https://other.example.test/whoami')).toThrow(ApiError);
    expect(() => api.url('//other.example.test/whoami')).toThrow(ApiError);
  });

  it('retains server error text and a real registration retry budget', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Registration from this IP is temporarily limited. Try again later', retry_after_seconds: 73 }), { status: 429 }));
    const { api } = setup({ fetch: fetcher });
    await expect(api.http('/auth/signup', { method: 'POST', body: {} })).rejects.toMatchObject({ kind: 'rate', status: 429, retryAfterSeconds: 73, outcome: 'rejected' });
  });

  it('classifies an expired session without silently creating or refreshing a guest', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'Session requires 2FA verification' }), { status: 401 }));
    const { api } = setup({ fetch: fetcher });
    await expect(api.http('/whoami')).rejects.toMatchObject({ kind: 'auth', status: 401 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not retry an uncertain HTTP mutation', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Network disconnected'));
    const { api } = setup({ fetch: fetcher });
    await expect(api.http('/profile/update', { method: 'POST', body: { email: 'ada@example.com' } })).rejects.toMatchObject({ kind: 'unknown', outcome: 'unknown' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('never sends a request with an already-aborted signal', async () => {
    const fetcher = vi.fn();
    const { api } = setup({ fetch: fetcher });
    const controller = new AbortController(); controller.abort();
    await expect(api.http('/whoami', { signal: controller.signal })).rejects.toMatchObject({ outcome: 'not-sent' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('returns raw NDJSON bytes without parsing or prematurely consuming the full body', async () => {
    let produced = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (produced >= 20) { controller.close(); return; }
        controller.enqueue(new TextEncoder().encode(`{"row":${produced++}}\n`));
      },
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(source, { headers: { 'Content-Type': 'application/x-ndjson', 'Content-Disposition': 'attachment; filename=hosts.ndjson' } }));
    const { api } = setup({ fetch: fetcher });
    const response = await api.raw('/download/bulk/stream', { method: 'POST', body: { download_mode: 'partial', format: 'json' }, mutation: false });
    expect(produced).toBeLessThan(20);
    expect(response.bodyUsed).toBe(false);
    expect(response.headers.get('Content-Disposition')).toContain('hosts.ndjson');
    expect((await response.text()).trim().split('\n')).toHaveLength(20);
  });

  it('forwards cancellation after raw headers arrive', async () => {
    const source = new ReadableStream<Uint8Array>({ pull() { /* Deliberately pending body. */ } });
    const fetcher = vi.fn().mockResolvedValue(new Response(source));
    const { api } = setup({ fetch: fetcher });
    const controller = new AbortController();
    const response = await api.raw('/download/bulk/stream', { method: 'POST', body: {}, signal: controller.signal, mutation: false });
    const reading = response.body!.getReader().read().catch((error: unknown) => error);
    controller.abort();
    expect(await reading).toMatchObject({ kind: 'transport' });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe('WebSocket correlation and lifecycle', () => {
  it('labels shared creator metadata independently of out-of-order account responses and ignores wire context', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const frames: ApiFrame[] = []; let displayedBalance = 500;
    api.subscribe(frame => { frames.push(frame); if (frame.context?.principal === 'account' && frame.metadata?.credits !== undefined) displayedBalance = frame.metadata.credits; });
    const own = api.request('hosts', { full_text_search: 'own' });
    const shared = api.request('hosts', { full_text_search: 'shared', st: 'TOKEN' }); await flush();
    const [accountRequest, sharedRequest] = sockets[0].sent;
    sockets[0].receive({ type: 'hosts', id: sharedRequest.id, data: [], metadata: { credits: 9999 }, context: { principal: 'account' } });
    expect((await shared).context?.principal).toBe('shared'); expect(displayedBalance).toBe(500);
    sockets[0].receive({ type: 'hosts', id: accountRequest.id, data: [], metadata: { credits: 499 }, context: { principal: 'shared' } });
    expect((await own).context?.principal).toBe('account'); expect(displayedBalance).toBe(499);
    sockets[0].receive({ type: 'hosts', id: accountRequest.id, data: [], metadata: { credits: 123456 }, context: { principal: 'account' } });
    expect(frames.at(-1)?.context?.principal).toBe('unknown'); expect(displayedBalance).toBe(499);
    sockets[0].receive({ type: 'unread_notifications', id: '', data: { unread_count: 1 }, metadata: { credits: 1 }, context: { principal: 'account' } });
    expect(frames.at(-1)?.context?.principal).toBe('push'); expect(displayedBalance).toBe(499);
  });

  it('retains the shared alias across multipart analytics and classifies missing unknown IDs conservatively', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const received: ApiFrame[] = [], observed: ApiFrame[] = []; api.subscribe(frame => observed.push(frame));
    api.stream('analytics', { share_token: 'TOKEN' }, { onFrame: frame => received.push(frame) }); await flush();
    const id = sockets[0].sent[0].id;
    sockets[0].receive({ type: 'analytics', id, data: { facet_name: 'type', facet_values: [] }, metadata: { credits: 75 } });
    sockets[0].receive({ type: 'analytics', id, data: { complete: true }, metadata: { credits: 75 } });
    expect(received).toHaveLength(2); expect(received.every(frame => frame.context?.principal === 'shared')).toBe(true);
    sockets[0].receive({ type: 'hosts', data: [], metadata: { credits: 900 }, context: { principal: 'account' } });
    expect(observed.at(-1)?.context?.principal).toBe('unknown');
  });

  it('derives private detail provenance from its isolated request instead of uncorrelated wire data', async () => {
    const { api, sockets } = setup(); const received: ApiFrame[] = [];
    api.stream('private_hostinfo', { ip: '192.0.2.10' }, { onFrame: frame => received.push(frame) });
    sockets[0].open(); await flush();
    for (const type of ['dnsinfo', 'private_hostinfo', 'whois']) sockets[0].receive({ type, data: {}, context: { principal: 'shared' } });
    expect(received).toHaveLength(3); expect(received.every(frame => frame.context?.principal === 'account')).toBe(true);
  });

  it('correlates out-of-order requests and uses a single main connection', async () => {
    const { api, sockets } = setup();
    const first = api.request('hosts', { page: 1 });
    const second = api.request('hosts', { page: 2 });
    expect(sockets).toHaveLength(1);
    sockets[0].open(); await flush();
    const [one, two] = sockets[0].sent;
    expect(one.id).not.toBe(two.id);
    sockets[0].receive({ type: 'hosts', id: two.id, data: [{ ip: '203.0.113.2' }] });
    sockets[0].receive({ type: 'hosts', id: one.id, data: [{ ip: '203.0.113.1' }] });
    expect((await first).data).toEqual([{ ip: '203.0.113.1' }]);
    expect((await second).data).toEqual([{ ip: '203.0.113.2' }]);
  });

  it('resolves false, zero and null data instead of treating them as missing', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    for (const value of [false, 0, null, []]) {
      const request = api.request('hosts'); await flush();
      sockets[0].receive({ type: 'hosts', id: sockets[0].sent.at(-1)!.id, data: value });
      expect((await request).data).toEqual(value);
    }
  });

  it('delivers anonymous pushes and preserves metadata on ordinary frames', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const listener = vi.fn(); const unsubscribe = api.subscribe(listener);
    sockets[0].receive({ type: 'high_load_status', id: '', data: { enabled: true } });
    const request = api.request('hosts'); await flush();
    const metadata = { credits: 0, auth_required: false, timestamp: 10 };
    sockets[0].receive({ type: 'hosts', id: sockets[0].sent[0].id, data: [], metadata });
    expect((await request).metadata).toEqual(metadata);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe(); sockets[0].receive({ type: 'high_load_status', data: { enabled: false } });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps an analytics stream open until the complete frame', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const onFrame = vi.fn(); const onComplete = vi.fn();
    api.stream('analytics', { full_text_search: 'nginx' }, { onFrame, onComplete }); await flush();
    const id = sockets[0].sent[0].id;
    sockets[0].receive({ type: 'analytics', id, data: { facet_name: 'port', facet_values: [] } });
    expect(onComplete).not.toHaveBeenCalled();
    sockets[0].receive({ type: 'analytics', id, data: { complete: true } });
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it('accepts all four unordered public host sections including nulls', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const types: string[] = []; const complete = vi.fn();
    api.stream('hostinfo', { ip: '203.0.113.1' }, { onFrame: (frame) => types.push(frame.type), onComplete: complete }); await flush();
    const id = sockets[0].sent[0].id;
    for (const type of ['whois', 'domain_ip_map', 'hostinfo']) sockets[0].receive({ type, id, data: null });
    expect(complete).not.toHaveBeenCalled();
    sockets[0].receive({ type: 'dnsinfo', id, data: null });
    expect(types).toHaveLength(4); expect(complete).toHaveBeenCalledOnce();
  });

  it('isolates concurrent private detail without ids and never confuses their DNS frames', async () => {
    const { api, sockets } = setup();
    const first: ApiFrame[] = []; const second: ApiFrame[] = [];
    const done = vi.fn();
    api.stream('private_hostinfo', { ip: '203.0.113.1' }, { onFrame: (frame) => first.push(frame), onComplete: done });
    api.stream('private_hostinfo', { ip: '203.0.113.2' }, { onFrame: (frame) => second.push(frame), onComplete: done });
    expect(sockets).toHaveLength(2);
    sockets.forEach((socket) => socket.open()); await flush();
    sockets[1].receive({ type: 'dnsinfo', data: { records: { A: ['203.0.113.2'] } } });
    sockets[0].receive({ type: 'dnsinfo', data: { records: { A: ['203.0.113.1'] } } });
    for (const socket of sockets) {
      socket.receive({ type: 'whois', data: null });
      socket.receive({ type: 'private_hostinfo', data: {} });
    }
    expect((first[0].data as { records: { A: string[] } }).records.A).toEqual(['203.0.113.1']);
    expect((second[0].data as { records: { A: string[] } }).records.A).toEqual(['203.0.113.2']);
    expect(done).toHaveBeenCalledTimes(2);
    expect(sockets.every((socket) => socket.closeCount === 1)).toBe(true);
  });

  it('does not complete a mutation stream before its same-id follow-up list', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const frame = vi.fn(); const complete = vi.fn();
    api.stream('terminate_all_sessions', {}, { onFrame: frame, onComplete: complete }); await flush();
    const id = sockets[0].sent[0].id;
    sockets[0].receive({ type: 'terminate_all_sessions', id, data: { success: true } });
    expect(complete).not.toHaveBeenCalled();
    sockets[0].receive({ type: 'user_sessions', id, data: { sessions: [], total: 0, limit: 3 } });
    expect(frame).toHaveBeenCalledTimes(2); expect(complete).toHaveBeenCalledOnce();
  });

  it('keeps payment pending and completes only on documented completed status', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const complete = vi.fn();
    api.stream('confirm_payment', { payment_id: 'pay-1' }, { onFrame: vi.fn(), onComplete: complete }); await flush();
    const id = sockets[0].sent[0].id;
    sockets[0].receive({ type: 'confirm_payment', id, data: { payment_id: 'pay-1', status: 'pending' } });
    expect(complete).not.toHaveBeenCalled();
    sockets[0].receive({ type: 'confirm_payment', id, data: { payment_id: 'pay-1', status: 'completed' } });
    expect(complete).toHaveBeenCalledOnce();
  });

  it('reports an uncertain sent mutation after close and never resends it', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const request = api.request('private_task_add', { host_list: ['203.0.113.1'] }).catch((error: unknown) => error);
    await flush(); sockets[0].close();
    expect(await request).toMatchObject({ kind: 'unknown', outcome: 'unknown', method: 'private_task_add' });
    expect(sockets).toHaveLength(1); expect(sockets[0].sent).toHaveLength(1);
  });

  it('times out reads and mutations differently without clearing another request', async () => {
    vi.useFakeTimers();
    const { api, sockets } = setup(); await ready(api, sockets);
    const read = api.request('hosts', {}, { timeoutMs: 10 }).catch((error: unknown) => error);
    const mutation = api.request('regenerate_api_key', {}, { timeoutMs: 10 }).catch((error: unknown) => error);
    const survivor = api.request('hosts', {}, { timeoutMs: 100 });
    await flush(); await vi.advanceTimersByTimeAsync(10);
    expect(await read).toMatchObject({ kind: 'timeout', outcome: 'unknown' });
    expect(await mutation).toMatchObject({ kind: 'unknown', outcome: 'unknown' });
    sockets[0].receive({ type: 'hosts', id: sockets[0].sent[2].id, data: [] });
    expect((await survivor).data).toEqual([]);
  });

  it('aborts only the selected request and leaves the main socket usable', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const controller = new AbortController();
    const first = api.request('hosts', {}, { signal: controller.signal }).catch((error: unknown) => error);
    const second = api.request('hosts'); await flush();
    controller.abort();
    expect(await first).toMatchObject({ kind: 'transport' });
    sockets[0].receive({ type: 'hosts', id: sockets[0].sent[1].id, data: [] });
    expect((await second).data).toEqual([]);
    expect(sockets[0].closeCount).toBe(0);
  });

  it('classifies plan errors from text, preserves raw error, and handles auth metadata', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const first = api.request('hosts').catch((error: unknown) => error); await flush();
    const error = " (402 Payment Required) field 'cve_id' is not available with your current subscription";
    sockets[0].receive({ type: 'hosts', id: sockets[0].sent[0].id, error });
    expect(await first).toMatchObject({ kind: 'server', message: error });
    const second = api.request('hosts').catch((error: unknown) => error); await flush();
    sockets[0].receive({ type: 'hosts', id: sockets[0].sent[1].id, error: 'Guest daily search limit reached. Please sign in.', metadata: { auth_required: true } });
    expect(await second).toMatchObject({ kind: 'auth' });
  });

  it('retains uncertainty when 2FA backup-code persistence fails after enrollment', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const request = api.request('totp_validate', { totp_code: '123456' }).catch((error: unknown) => error); await flush();
    sockets[0].receive({ type: 'totp_validate', id: sockets[0].sent[0].id, error: 'Failed to save backup codes' });
    expect(await request).toMatchObject({ kind: 'server', outcome: 'unknown' });
  });

  it('rejects undispatched legacy methods locally and keeps the method catalog exact', async () => {
    const { api, sockets } = setup();
    await expect(api.request('buy_credits')).rejects.toMatchObject({ outcome: 'not-sent' });
    expect(sockets).toHaveLength(0);
    expect(Object.keys(methodCatalog)).toHaveLength(52);
    expect(methodCatalog.get_notifications.payloadKeys).toEqual(['limit', 'offset']);
    expect(methodCatalog.mark_notification_read.payloadKeys).toEqual(['id']);
  });

  it('rejects malformed protocol frames instead of treating them as a successful response', async () => {
    const { api, sockets } = setup(); await ready(api, sockets);
    const request = api.request('hosts').catch((error: unknown) => error); await flush();
    sockets[0].raw('{broken');
    expect(await request).toMatchObject({ kind: 'transport' });
    expect(api.getConnectionStatus()).toBe('error');
  });
});
