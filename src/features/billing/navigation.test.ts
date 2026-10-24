import { describe, expect, it } from 'vitest';
import { billingCadence, billingIntent, billingSection, paymentHistoryState } from './navigation';

const location = (href: string) => new URL(href, 'https://workspace.example');

describe('billing navigation contracts', () => {
  it('defaults to annual comparison without changing explicit monthly purchase intent', () => {
    expect(billingCadence(new URLSearchParams())).toBe('annually');
    expect(billingCadence(new URLSearchParams('cadence=annually'))).toBe('annually');
    expect(billingCadence(new URLSearchParams('plan=Plus&cadence=monthly'))).toBe('monthly');
    expect(billingCadence(new URLSearchParams('cadence=invalid'))).toBe('annually');
  });
  it('keeps legacy entry points and checkout return on the appropriate section', () => {
    expect(billingSection(location('/billing'), true)).toBe('overview');
    expect(billingSection(location('/billing'), false)).toBe('plans');
    expect(billingSection(location('/billing#billing-token-packs'), true)).toBe('credits');
    expect(billingSection(location('/billing?section=plans#billing-current'), true)).toBe('overview');
    expect(billingSection(location('/billing/return?payment_id=p-1'), true)).toBe('payments');
    expect(billingSection(location('/billing?pack=research'), true)).toBe('credits');
    expect(billingSection(location('/billing?plan=Plus&cadence=annually'), true)).toBe('plans');
    expect(billingSection(location('/billing?payment_id=p-1'), true)).toBe('payments');
  });

  it('does not reopen an order when only a section or local history filter changes', () => {
    const params = new URLSearchParams('plan=Plus&cadence=annually');
    const original = billingIntent(params);
    params.set('section', 'payments');
    params.set('history_query', 'invoice');
    params.set('history_page', '8');
    expect(billingIntent(params)).toBe(original);
    params.set('cadence', 'monthly');
    expect(billingIntent(params)).not.toBe(original);
    params.delete('plan');
    expect(billingIntent(params)).toBe('');
  });

  it('restores history independently of order intent and bounds invalid page controls', () => {
    expect(paymentHistoryState(new URLSearchParams('plan=Plus&payment_id=p-1&history_query=payment-4999&history_status=pending&history_order=oldest&history_rows=100&history_page=20'))).toEqual({ query: 'payment-4999', status: 'pending', order: 'oldest', rows: 100, page: 20 });
    for (const value of ['-1', '1.5', 'Infinity', '9007199254740992']) {
      expect(paymentHistoryState(new URLSearchParams({ history_page: value, history_rows: value }))).toMatchObject({ page: 1, rows: 25 });
    }
  });
});
