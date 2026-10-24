import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSearchHistoryStore, historyHref, historyRequest, historyScannerBack, HISTORY_LIMIT, parseSearchHistory, searchHistoryKey } from './history-store';
import { decodeSearch } from './model';

function storage() {
  const data = new Map<string, string>();
  return { data, getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
afterEach(() => vi.useRealTimers());

describe('local search history', () => {
  it('keeps a logical query once while preserving conditions and current presentation', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
    const local = storage(), store = createSearchHistoryStore('account-a', local);
    const request = { full_text_search: 'nginx', simple_search_filters: [{ operator: 'OR' as const, filters: [{ field: 'country_code', value: 'DE' }, { field: 'country_code', value: 'GB' }] }], range_filter: [{ field: 'uts', start: 0, end: 123 }], page: 1, docs_per_page: 20 };
    store.remember(request, 'public');
    const first = store.getSnapshot().entries[0];
    vi.advanceTimersByTime(60_000);
    store.remember({ ...request, page: 3, docs_per_page: 50, sort_field: 'ip', sort_direction: 'asc' }, 'public', undefined, false);
    expect(store.getSnapshot().entries).toHaveLength(1);
    const entry = store.getSnapshot().entries[0];
    expect(entry.id).toBe(first.id); expect(entry.lastRunAt).toBe(first.lastRunAt);
    expect(entry.request).toEqual({ ...request, page: 1, docs_per_page: 50, sort_field: 'ip', sort_direction: 'asc' });
    store.remember(request, 'public');
    expect(store.getSnapshot().entries[0].lastRunAt).toBeGreaterThan(first.lastRunAt);
  });

  it('isolates accounts, pauses future recording and restores deletions without losing new entries', () => {
    const local = storage(), a = createSearchHistoryStore('a', local), b = createSearchHistoryStore('b', local);
    a.remember({ full_text_search: 'nginx' }, 'public'); b.remember({ full_text_search: 'caddy' }, 'private');
    expect(a.getSnapshot().entries[0].request.full_text_search).toBe('nginx');
    expect(b.getSnapshot().entries[0].request.full_text_search).toBe('caddy');
    const removed = a.clear(); a.remember({ full_text_search: 'redis' }, 'public'); a.restore(removed);
    expect(a.getSnapshot().entries.map(entry => entry.request.full_text_search).sort()).toEqual(['nginx', 'redis']);
    a.setEnabled(false); a.remember({ full_text_search: 'ignored' }, 'public');
    expect(a.getSnapshot().entries).toHaveLength(2);
    const reopened = createSearchHistoryStore('a', local);
    expect(reopened.getSnapshot().enabled).toBe(false);
    reopened.remove([reopened.getSnapshot().entries[0].id]);
    expect(reopened.getSnapshot().entries).toHaveLength(1);
    expect(b.getSnapshot().entries).toHaveLength(1);
  });

  it('round trips a private query as a refresh-safe draft without a shared token or arbitrary return URL', () => {
    const local = storage(), store = createSearchHistoryStore('a', local);
    store.remember({ task_ids: ['scan-one', 'scan-two'], full_text_search: '例え.テスト', simple_search_filters: [{ operator: 'NOT', filters: [{ field: 'port', value: '22' }] }], page: 4, docs_per_page: 25 }, 'private', '/scanner?tab=history&q=research&page=2&rows=25&evil=https://other.test&session_id=do-not-store');
    const entry = store.getSnapshot().entries[0], url = new URL(historyHref(entry), 'https://app.invalid');
    expect(url.pathname).toBe('/private/search'); expect(url.searchParams.get('draft')).toBe('1'); expect(url.searchParams.has('run')).toBe(false);
    expect(decodeSearch(url.searchParams).request).toEqual({ ...entry.request, page: 1 });
    expect(url.searchParams.get('scanner_back')).toBe('/scanner?tab=history&q=research&page=2&rows=25');
    expect(new URL(historyHref(entry, false), 'https://app.invalid').searchParams.get('run')).toBe('1');
    expect(historyScannerBack('https://other.test/scanner')).toBeUndefined();
    expect(historyScannerBack('/scanner/other')).toBeUndefined();
  });

  it('never persists tokens or credential-shaped input, and rejects unsupported or oversized requests', () => {
    for (const request of [
      { st: 'limited-access-token', full_text_search: 'nginx' },
      { share_token: 'secret', full_text_search: 'nginx' },
      { full_text_search: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz' },
      { full_text_search: 'password=super-secret' },
      { full_text_search: 'https://name:secret@example.test' },
      { simple_search_filters: [{ field: 'api_key', value: 'value' }] },
      { full_text_search: 'x'.repeat(9_000) },
      { account_password: 'secret' },
    ]) expect(historyRequest(request)).toBeNull();
    expect(historyRequest({ full_text_search: 'password' })).not.toBeNull();
    const local = storage(), store = createSearchHistoryStore('a', local);
    store.remember({ full_text_search: 'safe', st: 'do-not-store' }, 'public');
    expect(local.data.get(searchHistoryKey('a'))).not.toContain('do-not-store');
    expect(store.getSnapshot().entries).toHaveLength(0);
  });

  it('bounds retention, ignores corrupt records and rewrites sanitized storage', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
    const local = storage(), store = createSearchHistoryStore('a', local);
    for (let i = 0; i < HISTORY_LIMIT + 4; i++) { vi.advanceTimersByTime(1_000); store.remember({ full_text_search: `query-${i}` }, 'public'); }
    expect(store.getSnapshot().entries).toHaveLength(HISTORY_LIMIT);
    expect(store.getSnapshot().entries[0].request.full_text_search).toBe(`query-${HISTORY_LIMIT + 3}`);
    const valid = store.getSnapshot().entries[0];
    local.data.set(searchHistoryKey('b'), JSON.stringify({ version: 1, enabled: true, entries: [valid, { ...valid, id: 'old', lastRunAt: Date.now() - 91 * 86_400_000 }, { ...valid, id: 'secret', request: { st: 'SECRET' } }, { ...valid, id: 'future', lastRunAt: Date.now() + 10 * 86_400_000 }] }));
    const restored = createSearchHistoryStore('b', local);
    expect(restored.getSnapshot().entries).toHaveLength(1);
    expect(local.data.get(searchHistoryKey('b'))).not.toContain('SECRET');
    for (const raw of ['invalid', 'null', '{"version":2,"enabled":true,"entries":[]}', 'x'.repeat(1_000_001)]) expect(parseSearchHistory(raw).entries).toEqual([]);
  });

  it('merges another tab’s latest data and keeps working when storage is blocked', () => {
    const local = storage(), first = createSearchHistoryStore('a', local), second = createSearchHistoryStore('a', local);
    first.remember({ full_text_search: 'first tab' }, 'public'); second.remember({ full_text_search: 'second tab' }, 'public');
    expect(second.getSnapshot().entries).toHaveLength(2);
    const blocked = createSearchHistoryStore('a', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    blocked.remember({ full_text_search: 'one' }, 'public'); blocked.remember({ full_text_search: 'two' }, 'public');
    expect(blocked.getSnapshot().persistent).toBe(false); expect(blocked.getSnapshot().entries).toHaveLength(2);
  });

  it('reconciles another tab when subscriptions resume and keeps unchanged snapshots stable', () => {
    const local = storage(), first = createSearchHistoryStore('a', local), second = createSearchHistoryStore('a', local);
    first.remember({ full_text_search: 'removed in another tab' }, 'public');
    const listener = vi.fn(), cached = first.getSnapshot();
    const leave = first.subscribe(listener);
    expect(first.getSnapshot()).toBe(cached); expect(listener).not.toHaveBeenCalled();
    leave();
    second.clear(); second.setEnabled(false);
    expect(first.getSnapshot().entries).toHaveLength(1);
    const storageBeforeReturn = local.data.get(searchHistoryKey('a'));
    const leaveAgain = first.subscribe(listener);
    expect(first.getSnapshot().entries).toEqual([]); expect(first.getSnapshot().enabled).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(local.data.get(searchHistoryKey('a'))).toBe(storageBeforeReturn);
    const reconciled = first.getSnapshot();
    leaveAgain();
    const leaveUnchanged = first.subscribe(listener);
    expect(first.getSnapshot()).toBe(reconciled); expect(listener).toHaveBeenCalledTimes(1);
    first.remember({ full_text_search: 'still paused' }, 'public');
    expect(first.getSnapshot().entries).toEqual([]);
    leaveUnchanged();
  });

  it('keeps temporary history when returning after browser storage becomes unavailable', () => {
    const local = storage(); let blocked = false;
    const store = createSearchHistoryStore('a', { getItem: key => { if (blocked) throw new Error('blocked'); return local.getItem(key); }, setItem: local.setItem });
    store.remember({ full_text_search: 'this visit' }, 'public');
    blocked = true;
    const listener = vi.fn(), leave = store.subscribe(listener);
    expect(store.getSnapshot().persistent).toBe(false);
    expect(store.getSnapshot().entries[0].request.full_text_search).toBe('this visit');
    expect(listener).toHaveBeenCalledTimes(1);
    leave();
  });
});
