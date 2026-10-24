import type { BillingData } from '../../api';

export type WalletExpectation = {
  amount?: number; balance?: number; credits?: number; addedCredits?: number;
  plan?: string; priorPlan?: string; priorExpiry?: number;
};
/** Payment confirmation and an account snapshot are separate facts. */
export function walletSnapshotUpdated(data: BillingData, expected: WalletExpectation | null, paymentId: string): boolean {
  if (!expected || typeof expected.amount !== 'number' || typeof expected.balance !== 'number' || typeof data.balance !== 'number') return false;
  if (!Number.isFinite(data.balance) || data.balance > expected.balance - expected.amount + .005) return false;
  if (expected.addedCredits !== undefined) return typeof expected.credits === 'number' && typeof data.credits === 'number' && data.credits >= expected.credits + expected.addedCredits;
  if (expected.plan) {
    const subscription = data.subscription;
    return subscription?.type === expected.plan && (subscription.last_payment === paymentId || expected.priorPlan !== expected.plan || typeof subscription.expiry_date === 'number' && subscription.expiry_date > (expected.priorExpiry ?? Infinity));
  }
  return false;
}
