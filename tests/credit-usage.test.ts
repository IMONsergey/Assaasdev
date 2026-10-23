import { describe, expect, it } from 'vitest';
import { creditUsage } from '../src/app/credit-usage';

describe('credit balance semantics', () => {
  it('keeps unknown balances distinct from zero', () => {
    for (const value of [undefined, null, NaN, Infinity, -1, '500']) expect(creditUsage(value, 500)).toEqual({ available: null, allocation: 500, fraction: null, low: false });
    expect(creditUsage(0, 500)).toEqual({ available: 0, allocation: 500, fraction: 0, low: true });
  });
  it('uses the reported allocation without inventing a plan or adding purchased credits', () => {
    expect(creditUsage(1240500, 1500000).fraction).toBeCloseTo(0.827);
    expect(creditUsage(120, undefined).fraction).toBeNull();
    expect(creditUsage(120, 0).fraction).toBeNull();
  });
  it('preserves balances above the plan allocation without negative usage', () => {
    expect(creditUsage(800, 500)).toEqual({ available: 800, allocation: 500, fraction: 1, low: false });
    expect(creditUsage(2, 20)).toEqual({ available: 2, allocation: 20, fraction: 0.1, low: true });
  });
});
