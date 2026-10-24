import type { BillingPayment } from '../../api';
import type { PresentationOrder } from '../../demo/presentation-payments';
import { AnimatedPrice } from '../../components/brand';
import { Icon } from '../../components/ui';
import { formatNumber } from '../account/operation';
import { formatMoney } from './order-model';

export function OrderSummary({ payment, order }: { payment?: BillingPayment; order?: PresentationOrder }) {
  const total = order?.total ?? payment?.amount_usd;
  return <section className="order-summary" data-onboarding="order-summary" aria-label="Order summary">
    <div className="order-section-label"><Icon name="receipt" size={18} /><h2>Order summary</h2></div>
    <div className="order-product"><span className="order-product-icon"><Icon name={order?.kind === 'credits' ? 'search' : 'card'} size={24} /></span><div><h3>{order?.product ?? payment?.subscription ?? 'Purchase'}</h3><p>{order?.kind === 'credits' ? `${formatNumber(order.credits)} search credits` : order?.cadence === 'annually' ? 'Annual subscription' : order?.cadence === 'monthly' ? 'Monthly subscription' : 'Account purchase'}</p></div><span className="order-quantity">× 1</span></div>
    <dl className="order-totals">
      {order && <><div><dt>Subtotal</dt><dd>{formatMoney(order.subtotal)}</dd></div>{order.discount > 0 && <div className="order-discount"><dt>Discount{order.promoCode ? <code>{order.promoCode}</code> : null}</dt><dd>−{formatMoney(order.discount)}</dd></div>}</>}
      <div className="order-total"><dt>Total <span>USD</span></dt><dd><AnimatedPrice amount={total} /></dd></div>
      {order?.cryptoAmount && <div className="order-token-total"><dt>Pay in {order.coin}</dt><dd>{order.cryptoAmount} {order.coin}</dd></div>}
    </dl>
    {order?.quoteUsd && <p className="order-caption order-exchange-rate">Order exchange rate · 1 {order.coin} = {order.quoteUsd} USD</p>}
    {order?.kind === 'credits' && <p className="order-caption"><Icon name="check" size={14} />{order.status === 'completed' ? 'Added to your available search credits.' : 'Added to your current plan after confirmation.'}</p>}
  </section>;
}
