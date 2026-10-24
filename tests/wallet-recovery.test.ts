import { afterEach, describe, expect, it, vi } from 'vitest';
import { walletSnapshotUpdated } from '../src/features/billing/wallet-sync';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

describe('pending wallet recovery', () => {
  it('restores live attempt markers and IDs across module reload, but keeps presentation mode in memory', async () => {
    const local = storage(); vi.stubGlobal('sessionStorage', local);
    let store = await import('../src/features/billing/pending-wallet');
    store.rememberWallet('live-account', true, true);
    store.rememberWallet('other-account', 'wallet-order-2', true);
    store.rememberWallet('presentation-account', 'wallet-order-3', false);
    expect([...local.values.values()].sort()).toEqual(['"wallet-order-2"', 'true']);
    vi.resetModules(); store = await import('../src/features/billing/pending-wallet');
    expect(store.pendingWallet('live-account', true)).toBe(true);
    expect(store.pendingWallet('other-account', true)).toBe('wallet-order-2');
    expect(store.pendingWallet('presentation-account', false)).toBeNull();
    expect(store.pendingWallet('live-account', false)).toBeNull();
  });

  it('resolves only the matching account and order; an unidentified attempt requires explicit recovery', async () => {
    vi.stubGlobal('sessionStorage', storage());
    const store = await import('../src/features/billing/pending-wallet');
    store.rememberWallet('account-a', 'wallet-a', true);
    store.rememberWallet('account-b', 'wallet-b', true);
    store.resolveWallet('account-b', 'wallet-a', true);
    expect(store.pendingWallet('account-a', true)).toBe('wallet-a');
    expect(store.pendingWallet('account-b', true)).toBe('wallet-b');
    store.resolveWallet('account-a', 'wallet-a', true);
    expect(store.pendingWallet('account-a', true)).toBeNull();
    store.rememberWallet('account-a', true, true);
    store.resolveWallet('account-a', 'known-order', true);
    expect(store.pendingWallet('account-a', true)).toBe(true);
    store.resolveWallet('account-a', 'known-order', true, true);
    expect(store.pendingWallet('account-a', true)).toBeNull();
    expect(store.pendingWallet('account-b', true)).toBe('wallet-b');
  });

  it('retains a pending guard for this visit when storage writes fail', async () => {
    vi.stubGlobal('sessionStorage', { getItem: () => null, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    const store = await import('../src/features/billing/pending-wallet');
    store.rememberWallet('temporary-account', 'wallet-pending', true);
    expect(store.pendingWallet('temporary-account', true)).toBe('wallet-pending');
    store.resolveWallet('temporary-account', 'foreign-order', true);
    expect(store.pendingWallet('temporary-account', true)).toBe('wallet-pending');
    store.resolveWallet('temporary-account', 'wallet-pending', true);
    expect(store.pendingWallet('temporary-account', true)).toBeNull();
  });
});

describe('wallet account synchronization', () => {
  it('requires both the wallet debit and purchased credits before declaring a credit pack applied', () => {
    const expected = { balance: 120, amount: 50, credits: 1000, addedCredits: 25000 };
    expect(walletSnapshotUpdated({ balance: 120, credits: 1000 }, expected, 'wallet-order')).toBe(false);
    expect(walletSnapshotUpdated({ balance: 70, credits: 1000 }, expected, 'wallet-order')).toBe(false);
    expect(walletSnapshotUpdated({ balance: 120, credits: 26000 }, expected, 'wallet-order')).toBe(false);
    expect(walletSnapshotUpdated({ balance: 70, credits: 26000 }, expected, 'wallet-order')).toBe(true);
    expect(walletSnapshotUpdated({ balance: 70, credits: 26000 }, null, 'wallet-order')).toBe(false);
  });

  it('requires evidence of the requested plan or renewal in addition to the wallet debit', () => {
    const renewal = { balance: 120, amount: 50, plan: 'Plus', priorPlan: 'Plus', priorExpiry: 1800000000 };
    expect(walletSnapshotUpdated({ balance: 70, subscription: { type: 'Plus', last_payment: 'old-order', expiry_date: 1800000000 } }, renewal, 'wallet-order')).toBe(false);
    expect(walletSnapshotUpdated({ balance: 70, subscription: { type: 'Plus', last_payment: 'wallet-order', expiry_date: 1800000000 } }, renewal, 'wallet-order')).toBe(true);
    expect(walletSnapshotUpdated({ balance: 70, subscription: { type: 'Plus', expiry_date: 1800001000 } }, renewal, 'wallet-order')).toBe(true);
    expect(walletSnapshotUpdated({ balance: 120, subscription: { type: 'Plus', last_payment: 'wallet-order' } }, renewal, 'wallet-order')).toBe(false);
    expect(walletSnapshotUpdated({ balance: 70, subscription: { type: 'Free', last_payment: 'wallet-order' } }, renewal, 'wallet-order')).toBe(false);
  });
});
