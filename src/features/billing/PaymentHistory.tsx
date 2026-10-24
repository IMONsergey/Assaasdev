import { useMemo, useState } from 'react';
import type { BillingPayment } from '../../api';
import { Badge, Button, EmptyState, Field, Pagination, SelectField } from '../../components/ui';
import { formatDate } from '../account/operation';

type Props = {
  payments: BillingPayment[];
  onCheck: (id: string) => void;
  onRemove: (payment: BillingPayment) => void;
  checkDisabled: boolean;
  removeDisabled: boolean;
  formatAmount: (amount: number | undefined) => string;
};

export function PaymentHistory({ payments, onCheck, onRemove, checkDisabled, removeDisabled, formatAmount }: Props) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState('');
  const [order, setOrder] = useState('newest'), [rows, setRows] = useState(25), [page, setPage] = useState(1);
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
  function clear() { setQuery(''); setStatus(''); setPage(1); }

  return <div className="billing-history" role="region" aria-label="Payment history records">
    <div className="billing-history-controls">
      <Field label="Search payment history" placeholder="Payment ID, plan, coin or amount" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
      <SelectField label="Payment status filter" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value === '__missing__' ? 'Status not provided' : value}</option>)}</SelectField>
      <SelectField label="Payment order" value={order} onChange={event => { setOrder(event.target.value); setPage(1); }}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></SelectField>
      <SelectField label="Payments per page" value={rows} onChange={event => { setRows(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map(count => <option key={count} value={count}>{count}</option>)}</SelectField>
    </div>
    <div className="billing-history-summary"><p className="muted">{matches.length.toLocaleString()} matching · {payments.length.toLocaleString()} loaded</p>{(query || status) && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}</div>
    {shown.length ? <div className="table-wrap"><table className="data-table billing-history-table"><caption className="sr-only">Payments reported by the account</caption><thead><tr><th>Payment</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>{shown.map(item => <tr key={item.payment_id}>
      <td><strong>{item.subscription ?? 'Payment'}</strong><div className="mono muted">{item.payment_id}</div></td>
      <td data-label="Amount">{formatAmount(item.amount_usd)}{item.coin && <div className="muted">{item.amount ?? 'Amount not provided'} {item.coin}</div>}</td>
      <td data-label="Status"><Badge tone={item.status === 'completed' ? 'success' : 'neutral'}>{item.status || 'Not provided'}</Badge></td>
      <td data-label="Date">{formatDate(item.created_at)}</td>
      <td className="billing-history-actions"><div className="cluster"><Button size="sm" variant="ghost" disabled={checkDisabled} onClick={() => onCheck(item.payment_id)}>Check</Button><Button size="sm" variant="ghost" disabled={removeDisabled} onClick={() => onRemove(item)}>Remove record</Button></div></td>
    </tr>)}</tbody></table></div> : <EmptyState title="No payments match" description="Try another payment ID, plan or status." actions={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />}
    <Pagination page={currentPage} pageSize={rows} count={shown.length} total={matches.length} onPageChange={setPage} />
  </div>;
}
