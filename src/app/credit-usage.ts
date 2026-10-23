export interface CreditUsage {
  available: number | null;
  allocation: number | null;
  fraction: number | null;
  low: boolean;
}

const creditValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Allocation is a reference, not a spending history. Purchased credits are never added twice. */
export function creditUsage(available: unknown, allocation: unknown): CreditUsage {
  const balance = creditValue(available), included = creditValue(allocation);
  const fraction = balance !== null && included !== null && included > 0
    ? Math.min(1, balance / included) : null;
  return { available: balance, allocation: included, fraction, low: balance === 0 || (fraction !== null && fraction <= 0.1) };
}

export function compactCredits(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
