import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { BillingPayment } from '../../api';
import { Badge, Button, EmptyState, Field, Icon, Pagination, SelectField } from '../../components/ui';
import { formatDate } from '../account/operation';
import { paymentHistoryState } from './navigation';
import { unavailablePaymentValue } from './payment-display';
import { orderPath, paymentHistoryPath } from './order-model';

type Props = {
  payments: BillingPayment[];
  onCheck: (id: string) => void;
  onRemove: (payment: BillingPayment) => void;
  checkDisabled: boolean;
  removeDisabled: boolean;
  formatAmount: (amount: number | undefined) => string;
  cryptoAmount?: (paymentId: string) => string | undefined;
};

export function PaymentHistory({ payments, onCheck, onRemove, checkDisabled, removeDisabled, formatAmount, cryptoAmount }: Props) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = paymentHistoryPath(params);
  const { query, status, order, rows, page } = paymentHistoryState(params);
  function update(values: Record<string, string>, replace = false) {
    // BrowserRouter updates history before its transition renders new params.
    // Compose consecutive controls from that current URL, including Back/Forward.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(`history_${key}`, value); else next.delete(`history_${key}`);
    }
    if (!('page' in values)) next.delete('history_page');
    setParams(next, { replace, state: { preserveTabFocus: true } });
  }
  const statuses = useMemo(() => [...new Set(payments.map(payment => payment.status || '__missing__'))].sort(), [payments]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return payments.filter(payment => (!status || (payment.status || '__missing__') === status)
      && (!needle || [payment.payment_id, payment.subscription, payment.status, payment.coin, payment.network, payment.amount_usd, payment.amount]
        .filter(value => value !== undefined).join(' ').toLowerCase().includes(needle)))
      .sort((left, right) => {
        const a = left.created_at, b = right.created_at;
        if (a === undefined && b === undefined) return 0;
        if (a === undefined) return 1;
        if (b === undefined) return -1;
        return order === 'oldest' ? a - b : b - a;
      });
  }, [payments, query, status, order]);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(matches.length / rows)));
  const shown = matches.slice((currentPage - 1) * rows, currentPage * rows);
  function clear() { update({ query: '', status: '' }); }

  return <div className="billing-history" role="region" aria-label="Payment history records">
    <div className="billing-history-controls">
      <Field label="Search payment history" icon={<Icon name="search" size={17} />} placeholder="Payment ID, plan or amount" value={query} onChange={event => update({ query: event.target.value }, true)} />
      <SelectField label="Payment status filter" value={status} onChange={event => update({ status: event.target.value })}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value === '__missing__' ? 'Status not provided' : value}</option>)}{status && !statuses.includes(status) && <option value={status}>{status}</option>}</SelectField>
      <SelectField label="Payment order" value={order} onChange={event => update({ order: event.target.value })}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></SelectField>
      <SelectField label="Payments per page" value={rows} onChange={event => update({ rows: event.target.value })}>{[10, 25, 50, 100].map(count => <option key={count} value={count}>{count}</option>)}</SelectField>
    </div>
    <div className="billing-history-summary"><p className="muted">{matches.length.toLocaleString()} matching · {payments.length.toLocaleString()} loaded</p>{(query || status) && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}</div>
    {shown.length ? <div className="table-wrap"><table className="data-table billing-history-table"><caption className="sr-only">Payments reported by the account</caption><thead><tr><th>Payment</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>{shown.map(item => <tr key={item.payment_id} onClick={event => { if (!(event.target as HTMLElement).closest('a,button,input,select')) navigate(orderPath(item.payment_id, returnTo)); }}>
      <td><Link className="billing-payment-link" to={orderPath(item.payment_id, returnTo)} aria-label={`View payment ${item.payment_id}`}><Icon name="receipt" size={20} /><span><strong>{item.subscription ?? 'Payment'}</strong><span className="mono muted" style={{ display: 'block' }}>{item.payment_id}</span></span></Link></td>
      <td data-label="Amount">{formatAmount(item.amount_usd)}{item.coin && !unavailablePaymentValue(item.coin) && <div className="muted">{cryptoAmount?.(item.payment_id) ?? item.amount ?? 'Amount not provided'} {item.coin}</div>}</td>
      <td data-label="Status"><Badge tone={item.status === 'completed' ? 'success' : 'neutral'}>{item.status || 'Not provided'}</Badge></td>
      <td data-label="Date">{formatDate(item.created_at)}</td>
      <td className="billing-history-actions"><div className="cluster"><Link className="button button--ghost button--sm order-details-link" to={orderPath(item.payment_id, returnTo)}>Details<Icon name="chevron-right" size={14} /></Link><Button size="sm" variant="ghost" disabled={checkDisabled} onClick={() => onCheck(item.payment_id)}><Icon name="refresh" size={15} />Check</Button><Button size="sm" variant="ghost" disabled={removeDisabled} onClick={() => onRemove(item)} aria-label="Remove record" title={`Remove payment ${item.payment_id}`}><Icon name="trash" size={15} /></Button></div></td>
    </tr>)}</tbody></table></div> : <EmptyState title="No payments match" description="Try another payment ID, plan or status." actions={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />}
    <Pagination page={currentPage} pageSize={rows} count={shown.length} total={matches.length} onPageChange={page => update({ page: String(page) })} />
  </div>;
}
