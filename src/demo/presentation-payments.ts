import type { AddressTransactionsData, ApiClient, NetworkData, PurchaseRequest, UserAddressesData } from '../api';

/** Local-only product-review capabilities. No provider URLs, card data, or payable addresses. */
export type PresentationPaymentMethod = 'card' | 'crypto' | 'balance';
export type PresentationOrderStatus = 'pending' | 'completed' | 'failed' | 'canceled' | 'expired';
export interface PresentationOrder {
  paymentId: string;
  method: PresentationPaymentMethod;
  status: PresentationOrderStatus;
  product: string;
  kind: 'plan' | 'credits';
  credits?: number;
  cadence?: 'monthly' | 'annually';
  subtotal: number;
  discount: number;
  total: number;
  currency: 'USD';
  promoCode?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  completedAt?: number;
  authorized: boolean;
  network?: string;
  coin?: string;
  reference?: string;
  cryptoAmount?: string;
  quoteUsd?: string;
  request: PurchaseRequest;
}
export interface PresentationPayments {
  networks: readonly NetworkData[];
  create(method: 'card' | 'crypto', request: PurchaseRequest & { network?: string; coin?: string }): Promise<PresentationOrder>;
  get(paymentId: string): PresentationOrder | undefined;
  authorize(paymentId: string): PresentationOrder;
  cancel(paymentId: string): PresentationOrder;
  addresses(): UserAddressesData;
  transactions(reference: string): AddressTransactionsData;
}

export const PRESENTATION_NETWORKS: readonly NetworkData[] = [
  { network: 'Ethereum', coins: [{ coin: 'USDT', name: 'Tether', price: 1 }, { coin: 'ETH', name: 'Ethereum', price: 2500 }] },
];

/** Deterministic presentation quote, not a market feed. Keep token quantities as exact decimal strings. */
export function presentationCryptoQuote(usd: number, coin: string) {
  const decimals = coin === 'ETH' ? 8 : 6;
  const centsPerCoin = coin === 'ETH' ? 250000 : 100;
  const units = BigInt(Math.round(usd * 100)) * (10n ** BigInt(decimals)) / BigInt(centsPerCoin);
  const digits = units.toString().padStart(decimals + 1, '0');
  return { cryptoAmount: `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`, quoteUsd: (centsPerCoin / 100).toFixed(2) };
}

const capabilities = new WeakMap<ApiClient, PresentationPayments>();
export function registerPresentationPayments(api: ApiClient, value: PresentationPayments) { capabilities.set(api, value); }
export function presentationPayments(api: ApiClient): PresentationPayments | undefined { return capabilities.get(api); }
