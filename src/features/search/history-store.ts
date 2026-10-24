import type { SearchRequest } from '../../api';
import { analyticsRequest, encodeSearch, isShared, searchPath, validateSearchRequest, type Dataset } from './model';

export const HISTORY_LIMIT = 100;
export const HISTORY_DAYS = 90;
const MAX_REQUEST_LENGTH = 8_192;
const MAX_STORAGE_LENGTH = 1_000_000;
const DAY = 86_400_000;

export interface SearchHistoryEntry {
  id: string;
  dataset: Dataset;
  request: SearchRequest;
  firstRunAt: number;
  lastRunAt: number;
  scannerBack?: string;
}
export interface SearchHistoryDocument { version: 1; enabled: boolean; entries: SearchHistoryEntry[] }
export interface SearchHistorySnapshot extends SearchHistoryDocument { persistent: boolean }
type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;
const emptyDocument = (): SearchHistoryDocument => ({ version: 1, enabled: true, entries: [] });
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Account IDs are identifiers; session IDs, tokens and credentials never form storage keys. */
export function searchHistoryKey(userId: string) { return `apcosys.search-history.v1:${encodeURIComponent(userId)}`; }

function sensitiveText(value: string): boolean {
  return /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})\b|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=-]{8,}|(?:password|passwd|secret|token|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?(?:token|id))\s*[:=]\s*\S+|https?:\/\/[^\s/@:]+:[^\s/@]+@/i.test(value);
}

function hasSensitiveValues(value: unknown): boolean {
  if (typeof value === 'string') return sensitiveText(value);
  if (Array.isArray(value)) return value.some(hasSensitiveValues);
  if (!record(value)) return false;
  if (typeof value.field === 'string' && /(?:^|[._-])(?:password|passwd|secret|token|authorization|cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|session[_-]?(?:id|token))(?:$|[._-])/i.test(value.field)) return true;
  return Object.values(value).some(hasSensitiveValues);
}

/** Reject, rather than silently redact, a query that could not be restored faithfully. */
export function historyRequest(value: unknown): SearchRequest | null {
  try {
    const encoded = JSON.stringify(value);
    if (!encoded || encoded.length > MAX_REQUEST_LENGTH || hasSensitiveValues(value)) return null;
    const request = validateSearchRequest(value);
    if (isShared(request)) return null;
    const { st: _st, share_token: _share, ...body } = request;
    return { ...body, page: 1 };
  } catch { return null; }
}

/** Preserve only scanner list state; never store an arbitrary return URL. */
export function historyScannerBack(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1_024 || !/^\/scanner(?:\?|$)/.test(value)) return undefined;
  try {
    const source = new URL(value, 'https://history.invalid');
    if (source.pathname !== '/scanner' || source.origin !== 'https://history.invalid') return undefined;
    const params = new URLSearchParams();
    for (const key of ['tab', 'q', 'status', 'page', 'rows']) {
      const text = source.searchParams.get(key);
      if (text && text.length <= 300 && !sensitiveText(text)) params.set(key, text);
    }
    return `/scanner${params.size ? `?${params}` : ''}`;
  } catch { return undefined; }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

/** A page or sort change is still the same logical search. */
export function historyIdentity(entry: Pick<SearchHistoryEntry, 'dataset' | 'request'>): string {
  return `${entry.dataset}:${stable(analyticsRequest(entry.request))}`;
}

function safeEntry(value: unknown, now: number): SearchHistoryEntry | null {
  if (!record(value) || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.id) || !['public', 'private'].includes(String(value.dataset))) return null;
  if (typeof value.lastRunAt !== 'number' || !Number.isFinite(value.lastRunAt) || value.lastRunAt < now - HISTORY_DAYS * DAY || value.lastRunAt > now + 60_000) return null;
  const request = historyRequest(value.request);
  if (!request) return null;
  const firstRunAt = typeof value.firstRunAt === 'number' && Number.isFinite(value.firstRunAt) && value.firstRunAt > 0 && value.firstRunAt <= value.lastRunAt ? value.firstRunAt : value.lastRunAt;
  const dataset = value.dataset as Dataset;
  const scannerBack = dataset === 'private' ? historyScannerBack(value.scannerBack) : undefined;
  return { id: value.id, dataset, request, firstRunAt, lastRunAt: value.lastRunAt, ...(scannerBack ? { scannerBack } : {}) };
}

function uniqueEntries(entries: SearchHistoryEntry[]): SearchHistoryEntry[] {
  const seen = new Set<string>(), ids = new Set<string>();
  return entries.sort((a, b) => b.lastRunAt - a.lastRunAt).filter(entry => {
    const key = historyIdentity(entry);
    if (seen.has(key) || ids.has(entry.id)) return false;
    seen.add(key); ids.add(entry.id); return true;
  }).slice(0, HISTORY_LIMIT);
}

export function parseSearchHistory(raw: string | null, now = Date.now()): SearchHistoryDocument {
  if (!raw || raw.length > MAX_STORAGE_LENGTH) return emptyDocument();
  try {
    const data: unknown = JSON.parse(raw);
    if (!record(data) || data.version !== 1 || typeof data.enabled !== 'boolean' || !Array.isArray(data.entries)) return emptyDocument();
    return { version: 1, enabled: data.enabled, entries: uniqueEntries(data.entries.slice(0, HISTORY_LIMIT * 2).flatMap(value => { const entry = safeEntry(value, now); return entry ? [entry] : []; })) };
  } catch { return emptyDocument(); }
}

export function historyHref(entry: SearchHistoryEntry, draft = true): string {
  const params = new URLSearchParams(encodeSearch({ ...entry.request, page: 1 }));
  if (draft) { params.delete('run'); params.set('draft', '1'); }
  const back = entry.dataset === 'private' ? historyScannerBack(entry.scannerBack) : undefined;
  if (back && back !== '/scanner') params.set('scanner_back', back);
  return `${searchPath(entry.dataset)}?${params}`;
}

/** Local history has no API side effects. Mutations merge with the latest tab snapshot. */
export function createSearchHistoryStore(userId: string, storage?: HistoryStorage) {
  const key = searchHistoryKey(userId);
  let persistent = Boolean(storage);
  let data = emptyDocument();
  const listeners = new Set<() => void>();
  const read = () => {
    if (!persistent) return data;
    try { return parseSearchHistory(storage!.getItem(key)); } catch { persistent = false; return data; }
  };
  data = read();
  let snapshot: SearchHistorySnapshot = { ...data, persistent };
  function publish(next: SearchHistoryDocument, save = true) {
    data = next;
    if (persistent && save) {
      try { storage!.setItem(key, JSON.stringify(data)); } catch { persistent = false; }
    }
    snapshot = { ...data, persistent };
    listeners.forEach(listener => listener());
  }
  // Reading a legacy, expired or malformed document also removes unsafe entries on disk.
  publish(data);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    publish(read(), false);
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
        // Storage events can arrive while this screen has no subscribers. Keep the
        // snapshot stable when unchanged, but reconcile before a returning view reads it.
        const latest = read();
        if (snapshot.persistent !== persistent || JSON.stringify(latest) !== JSON.stringify(data)) publish(latest, false);
      }
      return () => { listeners.delete(listener); if (!listeners.size && typeof window !== 'undefined') window.removeEventListener('storage', onStorage); };
    },
    remember(request: SearchRequest, dataset: Dataset, scannerBack?: string, touch = true) {
      const current = read();
      const safe = historyRequest(request);
      if (!current.enabled || !safe) return;
      const identity = historyIdentity({ request: safe, dataset });
      const previous = current.entries.find(entry => historyIdentity(entry) === identity);
      const now = Date.now();
      const back = dataset === 'private' ? historyScannerBack(scannerBack) : undefined;
      const entry: SearchHistoryEntry = { id: previous?.id || crypto.randomUUID(), dataset, request: safe, firstRunAt: previous?.firstRunAt || now, lastRunAt: !touch && previous ? previous.lastRunAt : now, ...(back ? { scannerBack: back } : {}) };
      publish({ ...current, entries: uniqueEntries([entry, ...current.entries.filter(item => item.id !== previous?.id)]) });
    },
    setEnabled(enabled: boolean) { publish({ ...read(), enabled }); },
    remove(ids: string[]) {
      const current = read(), selected = new Set(ids);
      const removed = current.entries.filter(entry => selected.has(entry.id));
      publish({ ...current, entries: current.entries.filter(entry => !selected.has(entry.id)) });
      return removed;
    },
    clear() { const current = read(); publish({ ...current, entries: [] }); return current.entries; },
    restore(entries: SearchHistoryEntry[]) {
      const current = read(), now = Date.now();
      const safe = entries.flatMap(value => { const entry = safeEntry(value, now); return entry ? [entry] : []; });
      publish({ ...current, entries: uniqueEntries([...current.entries, ...safe]) });
    },
  };
}

const stores = new Map<string, ReturnType<typeof createSearchHistoryStore>>();
export function searchHistoryStore(userId: string) {
  let store = stores.get(userId);
  if (!store) {
    let storage: Storage | undefined;
    try { storage = window.localStorage; } catch { /* History still works for this page session. */ }
    store = createSearchHistoryStore(userId, storage); stores.set(userId, store);
  }
  return store;
}

export function rememberSubmittedSearch(userId: string | undefined, request: SearchRequest, dataset: Dataset, scannerBack?: string, touch = true) {
  try { if (userId && userId.length <= 256) searchHistoryStore(userId).remember(request, dataset, scannerBack, touch); } catch { /* Local history must never interrupt a search. */ }
}
