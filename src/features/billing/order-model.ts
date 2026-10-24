import type { BillingPayment } from '../../api';
import type { PresentationOrder } from '../../demo/presentation-payments';

export const formatMoney = (amount: number | undefined, currency = 'USD') => typeof amount === 'number' && Number.isFinite(amount)
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount) : '—';

export function paymentHistoryPath(params: URLSearchParams) {
  const next = new URLSearchParams({ section: 'payments' });
  for (const key of ['history_query', 'history_status', 'history_order', 'history_rows', 'history_page', 'cadence']) {
    const value = params.get(key); if (value) next.set(key, value);
  }
  return `/billing?${next}`;
}

export function orderReturnPath(search: string) {
  const back = new URLSearchParams(search).get('back');
  if (!back || back.length > 8192) return '/billing?section=payments';
  try {
    const url = new URL(back, 'https://apcosys.invalid');
    if (url.origin === 'https://apcosys.invalid' && url.pathname === '/billing') return paymentHistoryPath(url.searchParams);
  } catch { /* Fall back to the account history. */ }
  return '/billing?section=payments';
}

export function orderPath(paymentId: string, back = '/billing?section=payments') {
  return `/billing/payments/${encodeURIComponent(paymentId)}?${new URLSearchParams({ back })}`;
}

export function checkoutPath(paymentId: string, back = '/billing?section=payments') {
  return `/billing/checkout/${encodeURIComponent(paymentId)}?${new URLSearchParams({ back })}`;
}

export function retryPurchasePath(order: PresentationOrder) {
  const params = new URLSearchParams({ method: order.method });
  if (order.request.subscription) params.set('plan', order.request.subscription);
  if (order.request.token_pack_id) params.set('pack', order.request.token_pack_id);
  if (order.request.cadence) params.set('cadence', order.request.cadence);
  if (order.request.promo_code) params.set('promo', order.request.promo_code);
  if (order.network) params.set('network', order.network);
  if (order.coin) params.set('coin', order.coin);
  return `/billing?${params}`;
}

export function statusLabel(status: string | undefined) {
  if (!status) return 'Status unavailable';
  return ({ completed: 'Completed', pending: 'Awaiting payment', failed: 'Not completed', canceled: 'Canceled', cancelled: 'Canceled', expired: 'Expired' } as Record<string, string>)[status] ?? status;
}

export function receiptText(payment: BillingPayment, order?: PresentationOrder) {
  const date = (value: number | undefined) => typeof value === 'number' && Number.isFinite(value) && Number.isFinite(new Date(value * 1000).getTime()) ? new Date(value * 1000).toISOString() : 'Not provided';
  return [
    'APCOSYS — Payment receipt', '', `Payment ID: ${payment.payment_id}`,
    `Status: ${statusLabel(payment.status)}`, `Product: ${order?.product ?? payment.subscription ?? 'Purchase'}`,
    ...(order?.credits ? [`Search credits: ${order.credits.toLocaleString('en-US')}`] : []),
    ...(order?.cadence ? [`Billing period: ${order.cadence === 'annually' ? 'Yearly' : 'Monthly'}`] : []),
    ...(order ? [`Subtotal: ${formatMoney(order.subtotal)}`, `Discount: ${formatMoney(order.discount)}`] : []),
    `Total: ${formatMoney(payment.amount_usd)}`,
    ...(order?.cryptoAmount ? [`Crypto amount: ${order.cryptoAmount} ${order.coin}`, `Network: ${order.network}`, `Order exchange rate: 1 ${order.coin} = ${order.quoteUsd} USD`] : []),
    ...(order ? [`Payment method: ${order.method === 'balance' ? 'Account wallet' : order.method === 'card' ? 'Card' : `${order.coin} · ${order.network}`}`] : []),
    `Created: ${date(payment.created_at)}`, `Completed: ${date(payment.completed_at)}`, '',
  ].join('\n');
}

export function downloadReceipt(payment: BillingPayment, order?: PresentationOrder) {
  const blob = new Blob([receiptText(payment, order)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `apcosys-receipt-${payment.payment_id.replace(/[^a-z0-9_-]/gi, '_').slice(0, 100)}.txt`;
  link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
