import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { BillingData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, EmptyState, Icon, PageHeader, Skeleton } from '../../components/ui';
import { presentationPayments } from '../../demo/presentation-payments';
import { copyText, formatDate, responseData } from '../account/operation';
import { OrderSummary } from './OrderSummary';
import { checkoutPath, downloadReceipt, orderReturnPath, retryPurchasePath, statusLabel } from './order-model';
import { unavailablePaymentValue } from './payment-display';
import './billing.css';
import './commerce.css';

export function PaymentDetailsPage() {
  const { paymentId = '' } = useParams();
  const location = useLocation();
  const { api, user, session, mode, toast } = useApp();
  const controller = mode === 'demo' ? presentationPayments(api) : undefined;
  const [, render] = useState(0);
  const signedIn = session.status === 'authenticated';
  const order = controller?.get(paymentId);
  const back = orderReturnPath(location.search);
  const billing = useQuery({ queryKey: ['user-billing', user?.user_id], enabled: signedIn, queryFn: async ({ signal }) => responseData(await api.request<BillingData>('user_billing', {}, { signal, mutation: false })) });
  const payment = Array.isArray(billing.data?.payments) ? billing.data.payments.find(item => item?.payment_id === paymentId) : undefined;
  const status = order?.status ?? payment?.status;
  const completed = status === 'completed';
  const pending = status === 'pending';
  const isCheckout = order && ['card', 'crypto'].includes(order.method);
  const canRetry = order && ['expired', 'failed', 'canceled', 'cancelled'].includes(status ?? '');
  const checkPath = `${back}&${new URLSearchParams({ payment_id: paymentId })}`;
  const method = order?.method === 'balance' ? 'Account wallet' : order?.method === 'card' ? 'Visa ending in 4242' : order?.method === 'crypto' ? `${order.coin} · ${order.network}` : payment?.coin && !unavailablePaymentValue(payment.coin) ? `${payment.coin}${payment.network && !unavailablePaymentValue(payment.network) ? ` · ${payment.network}` : ''}` : undefined;

  useEffect(() => {
    if (!order || !pending) return;
    const timer = window.setInterval(() => render(value => value + 1), 15000);
    return () => window.clearInterval(timer);
  }, [order?.paymentId, pending]);

  if (session.status === 'loading') return <div className="billing-page stack"><Skeleton rows={6} label="Loading order…" /></div>;
  if (!signedIn) return <div className="billing-page stack"><PageHeader title="Payment details" /><EmptyState icon={<Icon name="lock" size={28} />} title="Sign in to view this payment" actions={<Link className="button button--primary" to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link>} /></div>;
  if (billing.isPending) return <div className="billing-page stack"><Skeleton rows={7} label="Loading payment details…" /></div>;
  if (billing.isError) return <div className="billing-page stack"><PageHeader title="Payment details" /><Alert tone="error" title="This payment could not be loaded" actions={<Button onClick={() => void billing.refetch()}>Try again</Button>}>{billing.error.message}</Alert><Link className="order-back" to={back}><Icon name="chevron-left" size={16} />Back to payments</Link></div>;
  if (!payment) return <div className="billing-page stack"><PageHeader title="Payment details" /><EmptyState icon={<Icon name="receipt" size={30} />} title="Payment not found" description="This record may have been removed or may belong to another account." actions={<Link className="button button--primary" to={back}>Back to payments<Icon name="arrow" size={16} /></Link>} /></div>;
  const created = order?.createdAt ?? payment.created_at, updated = order?.updatedAt ?? payment.updated_at, settled = order?.completedAt ?? payment.completed_at, expires = order?.expiresAt ?? payment.expires_at;

  return <div className="billing-page order-page stack" data-onboarding="payment-detail">
    <div className="order-topline"><Link className="order-back" to={back}><Icon name="chevron-left" size={16} />Payments</Link><Button variant="ghost" size="sm" loading={billing.isFetching} onClick={() => { render(value => value + 1); void billing.refetch(); }}><Icon name="refresh" size={15} />Refresh</Button></div>
    <PageHeader title="Payment details" actions={<span data-onboarding="order-status" data-status={status}><Badge tone={completed ? 'success' : pending ? 'warning' : 'neutral'}>{statusLabel(status)}</Badge></span>} />
    <div className="order-reference-line"><span>Order</span><code>{paymentId}</code><Button variant="ghost" size="sm" aria-label="Copy payment ID" onClick={() => void copyText(paymentId, toast)}><Icon name="copy" size={15} /></Button></div>
    <div className="checkout-layout order-details-layout">
      <div className="order-detail-main">
        <OrderSummary payment={payment} order={order} />
        <section className="order-record-section" aria-labelledby="order-payment-heading">
          <div className="order-section-label"><Icon name={order?.method === 'balance' || order?.method === 'crypto' ? 'wallet' : 'card'} size={19} /><h2 id="order-payment-heading">Payment information</h2></div>
          <dl className="order-record-grid">
            <div><dt>Payment method</dt><dd>{method ?? 'Not provided'}</dd></div>
            <div><dt>Status</dt><dd>{statusLabel(status)}</dd></div>
            <div><dt>Created</dt><dd>{formatDate(created)}</dd></div>
            <div><dt>{completed ? 'Completed' : 'Payment window ends'}</dt><dd>{formatDate(completed ? settled : expires)}</dd></div>
            {order?.reference && <div className="order-record-wide"><dt>Order reference</dt><dd><code>{order.reference}</code></dd></div>}
            {!order && payment.address && !unavailablePaymentValue(payment.address) && <div className="order-record-wide"><dt>Destination from invoice</dt><dd><code>{payment.address}</code></dd></div>}
            {!order && payment.amount && payment.coin && !unavailablePaymentValue(payment.coin) && <div><dt>Amount in {payment.coin}</dt><dd>{payment.amount} {payment.coin}</dd></div>}
          </dl>
        </section>
      </div>
      <aside className="order-detail-aside">
        <section className="order-record-section" data-onboarding="order-timeline" aria-label="Order activity">
          <div className="order-section-label"><Icon name="clock" size={19} /><h2>Order activity</h2></div>
          <ol className="order-timeline">
            <li data-complete="true"><span className="order-timeline-symbol"><Icon name="check" size={13} /></span><div><strong>Order created</strong><span>{formatDate(created)}</span></div></li>
            {order?.authorized && <li data-complete={completed || undefined}><span className="order-timeline-symbol"><Icon name={completed ? 'check' : 'clock'} size={13} /></span><div><strong>Confirmation requested</strong><span>{completed ? 'Payment reviewed and confirmed' : 'Waiting for the final status'}</span></div></li>}
            <li data-complete={completed || undefined} data-current="true"><span className="order-timeline-symbol"><Icon name={completed ? 'check' : pending ? 'clock' : 'close'} size={13} /></span><div><strong>{statusLabel(status)}</strong><span>{completed ? formatDate(settled) : pending ? `Expires ${formatDate(expires)}` : formatDate(updated)}</span></div></li>
          </ol>
          {pending && isCheckout && <Link data-onboarding="order-resume-payment" className="button button--primary order-main-action" to={checkoutPath(paymentId, back)}>{order.authorized ? 'Check payment status' : 'Continue payment'}<Icon name="arrow" size={16} /></Link>}
          {pending && !isCheckout && <Link className="button button--secondary order-main-action" to={checkPath}>Check payment status<Icon name="arrow" size={16} /></Link>}
          {canRetry && <Link data-onboarding="order-retry-payment" className="button button--primary order-main-action" to={retryPurchasePath(order)}>Review purchase<Icon name="arrow" size={16} /></Link>}
        </section>
        <section className="order-record-section order-receipt" data-onboarding="order-receipt" aria-label="Payment receipt"><span className="order-receipt-symbol"><Icon name="receipt" size={24} /></span><h2>Receipt</h2><p>{completed ? 'A copy of this payment, its amount and order reference.' : 'Your receipt will be available when the payment is completed.'}</p>{completed && <Button variant="secondary" onClick={() => downloadReceipt(payment, order)}><Icon name="download" size={16} />Download receipt</Button>}</section>
      </aside>
    </div>
  </div>;
}
