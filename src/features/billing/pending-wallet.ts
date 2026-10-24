import { useSyncExternalStore } from 'react';

export type PendingWallet = string | true | null;
const memory = new Map<string, PendingWallet>();
const fallback = new Set<string>();
const listeners = new Set<() => void>();
export function pendingWalletKey(principal: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(principal)) hash = BigInt.asUintN(64, (hash ^ BigInt(byte)) * 0x100000001b3n);
  return `apcosys.pending-wallet.v1:${hash.toString(16).padStart(16, '0')}`;
}
function valid(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\s\u0000-\u001f]/u.test(value); }
function slot(principal: string, persist: boolean) { return `${persist ? 'live' : 'local'}:${pendingWalletKey(principal)}`; }
export function pendingWallet(principal: string, persist: boolean): PendingWallet {
  if (!principal) return null;
  const key = slot(principal, persist);
  if (persist && !fallback.has(key)) {
    try { const raw = sessionStorage.getItem(pendingWalletKey(principal)); const value: unknown = raw ? JSON.parse(raw) : null; const result = value === true || valid(value) ? value : null; memory.set(key, result); return result; } catch { /* The active visit still retains the order. */ }
  }
  return memory.get(key) ?? null;
}
export function rememberWallet(principal: string, id: PendingWallet, persist: boolean) {
  if (!principal || id !== null && id !== true && !valid(id)) return;
  const key = slot(principal, persist); memory.set(key, id);
  if (persist) {
    try { if (id) sessionStorage.setItem(pendingWalletKey(principal), JSON.stringify(id)); else sessionStorage.removeItem(pendingWalletKey(principal)); fallback.delete(key); }
    catch { fallback.add(key); }
  }
  // Only an attempt marker or opaque order ID is retained, never account data or receipts.
  if (memory.size > 32) { const oldest = memory.keys().next().value!; memory.delete(oldest); fallback.delete(oldest); }
  for (const notify of listeners) notify();
}
export function resolveWallet(principal: string, id: string, persist: boolean, recoveringUnidentified = false) {
  const current = pendingWallet(principal, persist);
  if (current === id || current === true && recoveringUnidentified) rememberWallet(principal, null, persist);
}
function subscribe(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback); }; }
export function usePendingWallet(principal: string, persist: boolean) {
  return useSyncExternalStore(subscribe, () => pendingWallet(principal, persist), () => null);
}
