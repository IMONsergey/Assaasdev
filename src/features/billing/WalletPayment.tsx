import { Button, Icon } from '../../components/ui';
import { AnimatedPrice, OrbCubeLoader } from '../../components/brand';
import { formatNumber } from '../account/operation';
import './wallet-payment.css';

const money = (amount: number | undefined) => typeof amount === 'number' && Number.isFinite(amount)
  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount) : '—';

export type WalletPaymentState = 'processing' | 'pending' | 'completed' | 'failed' | 'unknown';

export function WalletReview({ balance, total, onOtherMethod }: { balance?: number; total?: number; onOtherMethod: () => void }) {
  const known = typeof balance === 'number' && Number.isFinite(balance) && typeof total === 'number' && Number.isFinite(total);
  const enough = known && balance >= total;
  return <section className="wallet-review" aria-label="Account wallet">
    <div className="wallet-review-heading"><span className="wallet-icon"><Icon name="wallet" size={22} /></span><div><strong>Account wallet</strong><span>Your available USD balance</span></div><strong className="wallet-balance">{money(balance)}</strong></div>
    <div className="wallet-review-after"><span>Balance after payment</span><strong>{enough ? money(Math.round((balance - total) * 100) / 100) : '—'}</strong></div>
    {!known ? <p className="wallet-balance-notice" role="status"><Icon name="info" size={17} />Refresh billing to check your balance.</p> : !enough && <div className="wallet-balance-notice" role="status"><Icon name="info" size={17} /><p>You need {money(total - balance)} more for this purchase.<Button variant="ghost" size="sm" onClick={onOtherMethod}>Choose another payment method<Icon name="arrow" size={15} /></Button></p></div>}
  </section>;
}

type WalletPaymentProps = {
  state: WalletPaymentState;
  paymentId?: string;
  product: string;
  total?: number;
  balance?: number;
  credits?: number;
  sync: 'idle' | 'loading' | 'ready' | 'pending' | 'error';
  message?: string;
  onCopy: () => void;
  onRefresh: () => void;
};

export function WalletPayment({ state, paymentId, product, total, balance, credits, sync, message, onCopy, onRefresh }: WalletPaymentProps) {
  const completed = state === 'completed';
  const active = state === 'processing' || state === 'pending';
  const title = completed ? 'Payment complete' : state === 'failed' ? 'Payment wasn’t completed' : state === 'unknown' ? 'Let’s check your payment' : state === 'pending' ? 'Confirming your payment' : 'Preparing your payment';
  const description = completed
    ? sync === 'ready' ? 'Your account reflects this payment. You’re ready to continue.' : sync === 'pending' ? 'Payment confirmed. Your balance and access are still updating.' : 'Your payment is confirmed. Updating your account…'
    : state === 'failed' ? message || 'Review the payment status before trying again.'
    : state === 'unknown' ? 'We lost the confirmation. Refresh your billing to check this payment before paying again.'
    : 'This usually takes a moment. You can follow the status in Payments.';
  return <div className={`wallet-payment wallet-payment--${state}`} data-onboarding="wallet-checkout" data-payment-state={state}>
    <ol className="wallet-steps" aria-label="Payment progress">
      {[['Review', true], ['Payment', completed], ['Ready', completed && sync === 'ready']].map(([label, done], index) => <li key={String(label)} data-complete={done || undefined} aria-current={(active && index === 1) || (completed && index === 2) ? 'step' : undefined}><span>{done ? <Icon name="check" size={13} /> : index + 1}</span>{label}</li>)}
    </ol>
    <div className="wallet-payment-status" role="status" aria-live="polite">
      <div className="wallet-status-art" aria-hidden="true">{completed ? <svg viewBox="0 0 80 80"><circle className="wallet-success-ring" cx="40" cy="40" r="32" /><path className="wallet-success-check" d="m25 40 10 10 21-22" /></svg> : active ? <OrbCubeLoader size={68} decorative /> : <span className="wallet-status-notice"><Icon name={state === 'failed' ? 'close' : 'refresh'} size={28} /></span>}</div>
      <h3>{title}</h3><p>{sync === 'error' && completed ? 'Payment confirmed. Refresh your account to see the latest balance and access.' : description}</p>
    </div>
    <section className="wallet-receipt" data-onboarding={completed ? 'wallet-receipt' : undefined} aria-label={completed ? 'Payment receipt' : 'Payment details'}>
      <div className="wallet-receipt-product"><span className="wallet-icon"><Icon name={completed ? 'receipt' : 'wallet'} size={20} /></span><div><span>{completed ? 'Paid from account wallet' : 'Account wallet'}</span><strong>{product}</strong></div><strong className="wallet-receipt-price"><AnimatedPrice amount={total} /></strong></div>
      {paymentId && <div className="wallet-receipt-id"><span>Payment ID</span><button type="button" onClick={onCopy} aria-label="Copy payment ID"><code>{paymentId}</code><Icon name="copy" size={15} /></button></div>}
      {completed && sync === 'ready' && <dl className="wallet-receipt-balances"><div><dt>Wallet balance</dt><dd>{money(balance)}</dd></div>{credits !== undefined && <div><dt>Search credits</dt><dd>{formatNumber(credits)}</dd></div>}</dl>}
    </section>
    {completed && (sync === 'error' || sync === 'pending') && <Button variant="secondary" onClick={onRefresh}><Icon name="refresh" size={16} />Refresh account</Button>}
    {completed && sync === 'loading' && <p className="wallet-sync" role="status">Updating balance and access…</p>}
  </div>;
}
