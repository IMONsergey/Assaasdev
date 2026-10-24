export const BILLING_SECTIONS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'plans', label: 'Plans', icon: 'card' },
  { id: 'credits', label: 'Credit packs', icon: 'plus' },
  { id: 'payments', label: 'Payments', icon: 'clock' },
  { id: 'crypto', label: 'Crypto activity', icon: 'database' },
] as const;

export type BillingSection = typeof BILLING_SECTIONS[number]['id'];

/** Yearly is the comparison default; explicit monthly links remain authoritative. */
export function billingCadence(params: URLSearchParams): 'annually' | 'monthly' {
  return params.get('cadence') === 'monthly' ? 'monthly' : 'annually';
}

export function billingSection(location: { pathname: string; search: string; hash: string }, signedIn: boolean): BillingSection {
  const params = new URLSearchParams(location.search);
  if (location.hash === '#billing-token-packs') return 'credits';
  if (location.hash === '#billing-current') return 'overview';
  const selected = BILLING_SECTIONS.find(item => item.id === params.get('section'));
  if (selected) return selected.id;
  if (location.pathname.endsWith('/return')) return 'payments';
  if (params.get('pack')) return 'credits';
  if (params.get('plan')) return 'plans';
  if (params.get('payment_id')) return 'payments';
  return signedIn ? 'overview' : 'plans';
}

/** Presentation changes do not consume or recreate an order intent. */
export function billingIntent(params: URLSearchParams) {
  const plan = params.get('plan'), pack = params.get('pack');
  return plan || pack ? JSON.stringify([plan, pack, params.get('cadence')]) : '';
}

export function paymentHistoryState(params: URLSearchParams) {
  const requestedRows = Number(params.get('history_rows'));
  const requestedPage = Number(params.get('history_page'));
  return {
    query: params.get('history_query') || '',
    status: params.get('history_status') || '',
    order: params.get('history_order') === 'oldest' ? 'oldest' : 'newest',
    rows: [10, 25, 50, 100].includes(requestedRows) ? requestedRows : 25,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  };
}
