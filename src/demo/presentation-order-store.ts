import type { PurchaseRequest } from '../api';
import type { PresentationOrderStatus, PresentationPaymentMethod } from './presentation-payments';

export interface OrderStorage { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }
export interface StoredPresentationOrder {
  paymentId: string;
  method: PresentationPaymentMethod;
  status: PresentationOrderStatus;
  request: PurchaseRequest & { network?: string; coin?: string };
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  completedAt?: number;
  settlementSequence?: number;
  authorized: boolean;
  removed: boolean;
  cryptoAmount?: string;
  quoteUsd?: string;
}
export interface PresentationOrderSnapshot { version: 1; owner: string; seedEpoch: number; writtenAt: number; orders: StoredPresentationOrder[] }
export const PRESENTATION_ORDER_KEY = 'apcosys.presentation.orders.v1';
const TTL = 86400, MAX_BYTES = 65536, MAX_ORDERS = 100;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const string = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;

export function browserOrderStorage(): OrderStorage | null {
  try { return typeof window === 'undefined' ? null : window.sessionStorage; } catch { return null; }
}

/** Stored data is only a bounded purchase ledger. Never store profiles, credentials, card or wallet details. */
export function readPresentationOrders(storage: OrderStorage | null, owner: string, now: number): PresentationOrderSnapshot | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(PRESENTATION_ORDER_KEY);
    if (!raw) return undefined;
    if (raw.length > MAX_BYTES) throw new Error('oversized');
    const value: unknown = JSON.parse(raw);
    if (!record(value) || value.version !== 1 || value.owner !== owner || !integer(value.seedEpoch) || !integer(value.writtenAt) || value.seedEpoch > now + 300 || value.writtenAt > now + 300 || now - value.seedEpoch > TTL || now - value.writtenAt > TTL || !Array.isArray(value.orders) || value.orders.length > MAX_ORDERS) throw new Error('invalid snapshot');
    const ids = new Set<string>(), settlements = new Set<number>();
    for (const order of value.orders) {
      if (!record(order) || !string(order.paymentId) || !/^(pay-\d{5,12}|pay_001)$/.test(order.paymentId) || ids.has(order.paymentId) || !['card', 'crypto', 'balance'].includes(String(order.method)) || !['pending', 'completed', 'failed', 'canceled', 'expired'].includes(String(order.status)) || typeof order.authorized !== 'boolean' || typeof order.removed !== 'boolean' || !integer(order.createdAt) || !integer(order.updatedAt) || !integer(order.expiresAt) || order.createdAt < value.seedEpoch || order.createdAt > now + 300 || order.updatedAt < order.createdAt || order.updatedAt > now + 300 || order.expiresAt !== order.createdAt + 3600 || !record(order.request)) throw new Error('invalid order');
      if (order.status === 'completed' && (!integer(order.completedAt) || order.completedAt < order.createdAt || order.completedAt > now + 300 || !order.authorized || !integer(order.settlementSequence) || order.settlementSequence < 1 || settlements.has(order.settlementSequence))) throw new Error('invalid completion');
      if (order.status === 'completed') settlements.add(order.settlementSequence as number);
      if (order.status !== 'completed' && (order.completedAt !== undefined || order.settlementSequence !== undefined)) throw new Error('unexpected completion');
      const request = order.request;
      if (Object.keys(request).some(key => !['subscription', 'token_pack_id', 'cadence', 'promo_code', 'network', 'coin'].includes(key)) || Boolean(request.subscription) === Boolean(request.token_pack_id)) throw new Error('invalid purchase');
      if (request.subscription !== undefined && (!string(request.subscription) || !['monthly', 'annually'].includes(String(request.cadence)))) throw new Error('invalid plan');
      if (request.token_pack_id !== undefined && (!string(request.token_pack_id) || request.cadence !== undefined)) throw new Error('invalid pack');
      for (const key of ['promo_code', 'network', 'coin']) if (request[key] !== undefined && !string(request[key])) throw new Error('invalid field');
      if (order.method === 'crypto' && (!string(request.network) || !string(request.coin) || typeof order.cryptoAmount !== 'string' || !/^\d{1,12}\.\d{6,8}$/.test(order.cryptoAmount) || typeof order.quoteUsd !== 'string' || !/^\d{1,8}\.\d{2}$/.test(order.quoteUsd))) throw new Error('missing network or quote');
      if (order.method !== 'crypto' && (request.network !== undefined || request.coin !== undefined)) throw new Error('unexpected network');
      ids.add(order.paymentId);
    }
    if (!ids.has('pay_001')) throw new Error('missing initial ledger');
    return value as unknown as PresentationOrderSnapshot;
  } catch { try { storage.removeItem(PRESENTATION_ORDER_KEY); } catch { /* Storage is optional. */ } return undefined; }
}

export function writePresentationOrders(storage: OrderStorage | null, snapshot: PresentationOrderSnapshot) {
  if (!storage) return;
  try {
    // Do not silently trim a completed ledger: that would change the restored entitlement.
    if (snapshot.orders.length > MAX_ORDERS) { storage.removeItem(PRESENTATION_ORDER_KEY); return; }
    const raw = JSON.stringify(snapshot);
    if (raw.length <= MAX_BYTES) storage.setItem(PRESENTATION_ORDER_KEY, raw);
    else storage.removeItem(PRESENTATION_ORDER_KEY);
  } catch { /* In-memory checkout remains fully usable in private/restricted browsers. */ }
}
