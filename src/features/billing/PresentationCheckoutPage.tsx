import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import type { BillingData, PaymentConfirmation } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, ConfirmDialog, EmptyState, Icon, PageHeader, Skeleton } from '../../components/ui';
import { OrbCubeLoader } from '../../components/brand';
import { presentationPayments } from '../../demo/presentation-payments';
import { copyText, formatDate, responseData } from '../account/operation';
import { OrderSummary } from './OrderSummary';
import { CoinMark } from './CoinMark';
import { downloadReceipt, formatMoney, orderPath, orderReturnPath, retryPurchasePath, statusLabel } from './order-model';
import './billing.css';
import './commerce.css';

export function PresentationCheckoutPage() {
  const { paymentId = '' } = useParams();
  const location = useLocation();
  const { api, user, session, mode, refreshSession, toast } = useApp();
  const cache = useQueryClient();
  const controller = mode === 'demo' ? presentationPayments(api) : undefined;
  const [, render] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'processing' | 'unknown'>('ready');
  const [message, setMessage] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [qr, setQr] = useState('');
  const stream = useRef<(() => void) | null>(null), generation = useRef(0), busy = useRef(false);
  const activePrincipal = useRef(user?.user_id);
  activePrincipal.current = user?.user_id;
  const order = controller?.get(paymentId);
  const back = orderReturnPath(location.search);
  const detailPath = orderPath(paymentId, back);
  const signedIn = session.status === 'authenticated';

  useEffect(() => {
    busy.current = false; setPhase('ready'); setMessage(''); setCancelOpen(false);
    return () => { ++generation.current; stream.current?.(); };
  }, [paymentId, user?.user_id]);
  useEffect(() => {
    if (order?.status !== 'pending') return;
    const timer = window.setInterval(() => render(value => value + 1), 15000);
    return () => window.clearInterval(timer);
  }, [order?.status]);
  useEffect(() => {
    let current = true; setQr('');
    if (order?.method === 'crypto' && order.reference) void QRCode.toDataURL(`apcosys:order:${order.reference}`, { width: 168, margin: 1, color: { dark: '#142128', light: '#ffffff' } }).then(value => { if (current) setQr(value); }).catch(() => undefined);
    return () => { current = false; };
  }, [order?.method, order?.reference]);

  async function refreshAccount() {
    const data = responseData(await api.request<BillingData>('user_billing', {}, { mutation: false }));
    if (activePrincipal.current !== user?.user_id || data.user_id && data.user_id !== user?.user_id) throw new Error('The account changed. Reopen this order from your payment history.');
    cache.setQueryData(['user-billing', user?.user_id], data);
    await refreshSession();
    return data;
  }

  function confirm() {
    if (!controller || !order || order.status !== 'pending' || busy.current) return;
    try {
      const ready = controller.authorize(paymentId);
      if (ready.status !== 'pending') { render(value => value + 1); return; }
    } catch (error) { toast(error instanceof Error ? error.message : 'This order could not be confirmed.', 'error'); return; }
    busy.current = true;
    setPhase('processing'); setMessage('');
    const request = ++generation.current;
    let terminal = false;
    stream.current?.();
    stream.current = api.stream<PaymentConfirmation>('confirm_payment', { payment_id: paymentId }, {
      mutation: true,
      onFrame(frame) {
        if (request !== generation.current || !frame.data) return;
        if (frame.data.payment_id !== paymentId || typeof frame.data.status !== 'string') {
          stream.current?.(); busy.current = false; setPhase('unknown'); setMessage('The confirmation did not match this order. Check the status before continuing.'); return;
        }
        if (['completed', 'failed', 'canceled', 'cancelled', 'expired'].includes(frame.data.status)) {
          terminal = true; busy.current = false; stream.current?.(); setPhase('ready'); render(value => value + 1);
          void refreshAccount().catch(() => { if (request === generation.current) toast('Payment status is saved. Refresh your account to see the latest access.', 'info'); });
        }
      },
      onError(error) {
        if (request !== generation.current || terminal) return;
        busy.current = false; setPhase('unknown'); setMessage(error.message || 'Confirmation was interrupted. Check this order before starting another purchase.');
      },
      onComplete() {
        if (request !== generation.current || terminal) return;
        busy.current = false; setPhase('unknown'); setMessage('A final confirmation has not arrived. Check the status of this order.');
      },
    });
  }

  function cancel() {
    try { controller?.cancel(paymentId); setCancelOpen(false); render(value => value + 1); void cache.invalidateQueries({ queryKey: ['user-billing', user?.user_id] }); }
    catch (error) { setCancelOpen(false); toast(error instanceof Error ? error.message : 'This order could not be canceled.', 'error'); }
  }

  async function receipt() {
    try {
      const billing = await refreshAccount(), payment = billing.payments?.find(item => item.payment_id === paymentId);
      if (!payment || payment.status !== 'completed') throw new Error('Refresh this order to check the receipt.');
      downloadReceipt(payment, controller?.get(paymentId));
    } catch (error) { toast(error instanceof Error ? error.message : 'The receipt is not available yet.', 'error'); }
  }

  if (session.status === 'loading') return <div className="billing-page stack"><Skeleton rows={6} label="Loading checkout…" /></div>;
  if (!signedIn) return <div className="billing-page stack"><PageHeader title="Checkout" /><EmptyState icon={<Icon name="lock" size={26} />} title="Sign in to view this order" actions={<Link className="button button--primary" to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in</Link>} /></div>;
  if (!controller || !order || order.method === 'balance') return <div className="billing-page stack"><PageHeader title="Checkout" /><EmptyState icon={<Icon name="receipt" size={28} />} title="This checkout is no longer available" description="Open your payment history to find the current order or choose a new purchase." actions={<Link className="button button--primary" to={back}>View payments<Icon name="arrow" size={16} /></Link>} /></div>;
  const completed = order.status === 'completed', ended = !['pending', 'completed'].includes(order.status);
  const checking = phase === 'processing';

  return <div className="billing-page checkout-page stack" data-onboarding="checkout-order" data-order-status={order.status}>
    <div className="order-topline"><Link className="order-back" to={back}><Icon name="chevron-left" size={16} />Payments</Link><span><Icon name="lock" size={14} />Secure checkout</span></div>
    <PageHeader title={completed ? 'Payment complete' : ended ? statusLabel(order.status) : 'Complete your purchase'} description={completed ? 'Your receipt and order details are ready.' : ended ? 'Your order details remain available below.' : 'Review your order and confirm your preferred payment method.'} />
    <div className="checkout-layout">
      <div className="checkout-main">
        <ol className="checkout-progress" aria-label="Checkout progress"><li data-complete="true"><span><Icon name="check" size={13} /></span>Review</li><li aria-current={!completed ? 'step' : undefined} data-complete={completed || undefined}><span>{completed ? <Icon name="check" size={13} /> : '2'}</span>Payment</li><li aria-current={completed ? 'step' : undefined} data-complete={completed || undefined}><span>{completed ? <Icon name="check" size={13} /> : '3'}</span>Receipt</li></ol>
        {completed ? <section className="checkout-success" data-onboarding="checkout-receipt" aria-label="Payment receipt"><div className="checkout-success-symbol" aria-hidden="true"><Icon name="check" size={38} /></div><h2>You're all set</h2><p>{order.kind === 'credits' ? `${order.credits?.toLocaleString('en-US')} search credits have been added to your account.` : `Your ${order.product} subscription is active.`}</p><dl><div><dt>Amount paid</dt><dd>{formatMoney(order.total)}</dd></div><div><dt>Payment reference</dt><dd className="mono">{paymentId}</dd></div><div><dt>Completed</dt><dd>{formatDate(order.completedAt)}</dd></div></dl><div className="checkout-success-actions"><Link data-onboarding="checkout-view-order" className="button button--primary" to={detailPath}>View order details<Icon name="arrow" size={16} /></Link><Button variant="secondary" onClick={() => void receipt()}><Icon name="download" size={16} />Download receipt</Button></div></section>
          : ended ? <section className="checkout-terminal"><span className="checkout-terminal-icon"><Icon name={order.status === 'expired' ? 'clock' : 'close'} size={28} /></span><h2>{order.status === 'expired' ? 'The payment window has ended' : order.status === 'canceled' ? 'This order was canceled' : 'Payment was not completed'}</h2><p>You can return to the same purchase with your choices already selected.</p><Link data-onboarding="checkout-retry" className="button button--primary" to={retryPurchasePath(order)}>Review purchase<Icon name="arrow" size={16} /></Link><Link className="order-text-link" to={detailPath}>View order details</Link></section>
          : checking ? <section className="checkout-processing" data-onboarding="checkout-processing" role="status"><OrbCubeLoader size={76} decorative /><h2>Confirming your payment</h2><p>Keep this order open while we update its status.</p><Link className="order-text-link" to={detailPath}>View order details</Link></section>
          : <section className="checkout-method-panel">
            <div className="order-section-label"><Icon name={order.method === 'card' ? 'card' : 'wallet'} size={20} /><h2>{order.method === 'card' ? 'Pay by card' : 'Cryptocurrency payment'}</h2></div>
            {order.method === 'card' ? <div className="checkout-card-profile"><div className="checkout-card-art" aria-hidden="true"><span className="checkout-card-chip" /><span className="checkout-card-wordmark">VISA</span><span className="checkout-card-digits">•••• &nbsp; •••• &nbsp; •••• &nbsp; 4242</span><span className="checkout-card-brand">apcosys</span></div><div className="checkout-card-info"><strong>Visa ending in 4242</strong><span>Saved payment profile</span><Badge tone="neutral"><Icon name="lock" size={12} />Selected</Badge></div></div>
              : <div className="checkout-crypto"><div className="checkout-crypto-currency"><CoinMark coin={order.coin} /><div><strong>{order.coin}</strong><span>{order.network} network</span></div><strong>{order.cryptoAmount} {order.coin}</strong></div><div className="checkout-reference-panel">{qr && <img src={qr} width="132" height="132" alt="Order reference QR code" />}<div><span className="order-eyebrow">Order reference</span><code>{order.reference}</code><Button size="sm" variant="ghost" onClick={() => void copyText(order.reference!, toast)}><Icon name="copy" size={15} />Copy reference</Button></div></div><p className="order-caption">Review the currency, network and total before confirming this order.</p></div>}
            {phase === 'unknown' && <Alert tone="warning" title="Confirmation needs checking">{message}</Alert>}
            {order.authorized && phase !== 'unknown' && <p className="checkout-resume-note"><Icon name="clock" size={17} />This payment is awaiting its final confirmation.</p>}
            <Button data-onboarding={order.method === 'card' ? 'card-payment-confirm' : 'crypto-payment-confirm'} className="checkout-confirm" onClick={confirm}><Icon name={order.authorized ? 'refresh' : 'lock'} size={17} />{order.authorized ? 'Check payment status' : order.method === 'card' ? `Pay ${formatMoney(order.total)}` : 'Confirm payment'}<Icon name="arrow" size={17} /></Button>
            <div className="checkout-secondary-actions"><Link to={detailPath}>Order details</Link>{!order.authorized && <Button data-onboarding="checkout-cancel" variant="ghost" size="sm" onClick={() => setCancelOpen(true)}>Cancel order</Button>}</div>
          </section>}
      </div>
      <aside className="checkout-sidebar"><OrderSummary order={order} /><div className="checkout-order-meta"><span>Order <code>{paymentId}</code></span><span>{completed ? `Completed ${formatDate(order.completedAt)}` : `Expires ${formatDate(order.expiresAt)}`}</span></div>{!completed && !ended && !order.authorized && <Link className="order-edit-link" to={retryPurchasePath(order)}><Icon name="edit" size={15} />Edit purchase</Link>}</aside>
    </div>
    <ConfirmDialog confirmHook="checkout-cancel-confirm" open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancel} title="Cancel this order?" description="Your current access stays active. You can create another order whenever you're ready." confirmLabel="Cancel order" />
  </div>;
}
