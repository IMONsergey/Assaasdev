import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ApiError, type BillingCadence, type BillingData, type BillingPayment, type CheckoutData, type CryptoInvoice, type NetworkData, type PaymentConfirmation, type PricingData, type PricingPlan, type PromoData, type PurchaseRequest, type TokenPack } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, PageHeader, SelectField, Spinner, Tabs } from '../../components/ui';
import { copyText, formatDate, formatNumber, OperationNotice, responseData, useOperation } from '../account/operation';
import { CryptoActivity } from './CryptoActivity';
import './billing.css';

type Selection = { kind: 'plan'; value: PricingPlan } | { kind: 'tokens'; value: TokenPack };
type PaymentMethod = 'card' | 'balance' | 'crypto';
type PaymentState = 'idle' | 'checking' | 'completed' | 'error' | 'unknown';
const money = (amount: number | undefined) => typeof amount !== 'number' || !Number.isFinite(amount) ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);

function externalPaymentUrl(value: string) {
  try { const url = new URL(value); if (url.protocol === 'https:' && !url.username && !url.password) return url.href; }
  catch { /* Reject malformed server-provided redirects. */ }
  throw new ApiError('unknown', 'A valid secure payment link was not returned. Check your billing before requesting another link.', { outcome: 'unknown' });
}

export function BillingPage() {
  const { api, session, user, refreshSession, toast } = useApp();
  const location = useLocation(), navigate = useNavigate();
  const signedIn = session.status === 'authenticated';
  const pricing = useQuery({ queryKey: ['pricing'], queryFn: ({ signal }) => api.http<PricingData>('/pricing', { signal, mutation: false }) });
  const billing = useQuery({ queryKey: ['user-billing', user?.user_id], enabled: signedIn, queryFn: async ({ signal }) => responseData(await api.request<BillingData>('user_billing', {}, { signal, mutation: false })) });
  const [cadence, setCadence] = useState<BillingCadence>(() => new URLSearchParams(location.search).get('cadence') === 'annually' ? 'annually' : 'monthly');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [method, setMethod] = useState<PaymentMethod>('card');
  const [promo, setPromo] = useState('');
  const [promoResult, setPromoResult] = useState<(PromoData & { message?: string }) | null>(null);
  const [automaticDiscount, setAutomaticDiscount] = useState(false);
  const [currency, setCurrency] = useState('');
  const [network, setNetwork] = useState('');
  const [coin, setCoin] = useState('');
  const [checkout, setCheckout] = useState<CheckoutData | null>(null);
  const [invoice, setInvoice] = useState<CryptoInvoice | null>(null);
  const [portalUrl, setPortalUrl] = useState('');
  const [subscriptionAction, setSubscriptionAction] = useState<'cancel' | 'resume' | null>(null);
  const [paymentId, setPaymentId] = useState(new URLSearchParams(location.search).get('payment_id') ?? '');
  const [paymentStatus, setPaymentStatus] = useState<PaymentState>('idle');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [confirmation, setConfirmation] = useState<PaymentConfirmation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BillingPayment | null>(null);
  const purchase = useOperation();
  const portal = useOperation();
  const subscription = useOperation();
  const promoCheck = useOperation();
  const deletion = useOperation();
  const paymentStream = useRef<(() => void) | null>(null);
  const paymentGeneration = useRef(0);
  const handledIntent = useRef('');
  const currentPromoRequest = useRef('');
  const networks = useQuery({ queryKey: ['billing-networks'], enabled: signedIn && selection !== null && method === 'crypto', queryFn: async ({ signal }) => responseData(await api.request<NetworkData[]>('networks', {}, { signal, mutation: false })) });

  useEffect(() => () => { ++paymentGeneration.current; paymentStream.current?.(); }, []);
  useEffect(() => {
    const first = networks.data?.[0];
    if (first && !networks.data?.some((item) => item.network === network)) { setNetwork(first.network); setCoin(first.coins[0]?.coin ?? ''); }
  }, [networks.data, network]);

  // Billing can omit renewal fields that /whoami supplies. Preserve those facts.
  const currentSubscription = user?.subscription || billing.data?.subscription
    ? { ...user?.subscription, ...billing.data?.subscription }
    : undefined;
  const currentPlan = currentSubscription?.type;
  const balance = billing.data?.balance ?? user?.balance;
  const searchCredits = billing.data?.credits ?? user?.credits;
  const scanCredits = billing.data?.scan_credits ?? user?.scan_credits;
  const selectedName = selection?.kind === 'plan' ? selection.value.name ?? selection.value.type : selection?.value.name ?? selection?.value.id;
  const selectedPrice = selection?.kind === 'plan' ? cadence === 'monthly' ? selection.value.monthly_price : selection.value.annually_price : selection?.value.price_usd;
  const selectedCoins = networks.data?.find((item) => item.network === network)?.coins ?? [];
  currentPromoRequest.current = `${selection?.kind}|${selectedName}|${cadence}|${promo.trim()}`;

  useEffect(() => {
    if (!signedIn || !pricing.data) return;
    const params = new URLSearchParams(location.search), plan = params.get('plan'), pack = params.get('pack');
    const intent = `${location.key}|${plan ?? ''}|${pack ?? ''}|${params.get('cadence') ?? ''}`;
    if (!plan && !pack) { handledIntent.current = ''; return; }
    if (handledIntent.current === intent || purchase.blocked) return;
    handledIntent.current = intent;
    const selectedPlan = plan ? pricing.data.subscriptions.find(item => item.type === plan) : undefined;
    const selectedPack = pack ? pricing.data.tokens?.find(item => item.id === pack) : undefined;
    if (!selectedPlan && !selectedPack) { toast('That selection is no longer available. Choose from the current plans and credit packs.', 'info'); return; }
    openReview(selectedPlan ? { kind: 'plan', value: selectedPlan } : { kind: 'tokens', value: selectedPack! }, params.get('cadence') === 'annually' ? 'annually' : 'monthly');
  }, [signedIn, pricing.data, location.key, location.search, purchase.blocked, toast]);

  useEffect(() => {
    if (!location.hash || !pricing.data || selection) return;
    const frame = requestAnimationFrame(() => {
      const id = location.hash === '#billing-token-packs' ? 'billing-token-packs' : location.hash === '#billing-current' ? 'billing-current' : '';
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash, pricing.data, selection]);

  function purchaseBody(): PurchaseRequest {
    if (!selection) throw new Error('Select a plan or credit pack first.');
    return { ...(selection.kind === 'plan' ? { subscription: selection.value.type, cadence } : { token_pack_id: selection.value.id }), ...(promo.trim() ? { promo_code: promo.trim() } : {}) };
  }

  function openReview(item: Selection, period = cadence) {
    purchase.reset(); promoCheck.reset();
    setSelection(item); setCadence(period); setPromo(''); setPromoResult(null);
    setCheckout(null); setInvoice(null); setMethod('card'); setCurrency('');
    setAutomaticDiscount(false); setNetwork(''); setCoin('');
  }

  function choose(item: Selection) {
    if (!signedIn) {
      const params = new URLSearchParams({ cadence, ...(item.kind === 'plan' ? { plan: item.value.type } : { pack: item.value.id }) });
      navigate(`/auth/login?returnTo=${encodeURIComponent(`/billing?${params}`)}`);
      return;
    }
    if (purchase.blocked) { toast('Review your latest billing before starting another purchase.', 'info'); return; }
    openReview(item);
  }

  async function reconcileBilling() {
    try {
      const result = await billing.refetch();
      if (result.isSuccess) {
        await refreshSession();
        purchase.reset(); portal.reset(); subscription.reset(); deletion.reset();
        if (paymentStatus === 'unknown') {
          const checkedPayment = result.data.payments?.find(item => item.payment_id === paymentId);
          if (checkedPayment?.status === 'completed') { setPaymentStatus('completed'); setPaymentMessage('Your billing history confirms that this payment completed.'); }
          else setPaymentStatus('idle');
        }
        toast('Latest billing loaded. Review payment and subscription status before taking another action.', 'info');
      } else {
        toast(result.error?.message || 'Billing status could not be verified. Refresh again before taking another action.', 'error');
      }
    } catch (error) {
      // Keep unresolved operations blocked when the account read cannot complete.
      toast(error instanceof Error ? error.message : 'Account status could not be verified. Refresh again before taking another action.', 'error');
    }
  }

  async function validatePromo() {
    if (!promo.trim()) return;
    const requested = currentPromoRequest.current;
    const result = await promoCheck.run(async () => responseData(await api.request<PromoData & { message?: string }>('validate_promo_code', purchaseBody(), { mutation: false })), 'Promo code checked.');
    if (result.ok && requested === currentPromoRequest.current) setPromoResult(result.data);
  }

  async function beginPurchase() {
    if (!signedIn || !selection) return;
    const request = purchaseBody();
    const result = await purchase.run(async () => {
      if (method === 'card') {
        const returnUrl = new URL(`${import.meta.env.BASE_URL}billing/return`, window.location.origin).href;
        const data = responseData(await api.request<CheckoutData>('init_checkout', { ...request, ...(currency.trim() ? { currency: currency.trim().toUpperCase() } : {}), apply_discount: automaticDiscount, return_url: returnUrl, cancel_url: returnUrl }, { mutation: true }));
        if (data.status !== 'success' || !data.transaction_id) throw new ApiError('unknown', 'The checkout was not fully confirmed. Check your billing before starting again.', { outcome: 'unknown' });
        return { kind: 'checkout' as const, data: { ...data, checkout_url: externalPaymentUrl(data.checkout_url) } };
      }
      if (method === 'crypto' && (!network || !coin)) throw new Error('Choose a network and coin.');
      const data = responseData(await api.request<CryptoInvoice>(method === 'crypto' ? 'get_address' : 'pay_with_balance', { ...request, ...(method === 'crypto' ? { network, coin } : {}) }, { mutation: true }));
      if (!data.payment_id) throw new ApiError('unknown', 'A payment ID was not returned. Review your billing before trying again.', { outcome: 'unknown' });
      return { kind: 'invoice' as const, data };
    }, method === 'card' ? 'Your secure checkout link is ready. Payment is not confirmed yet.' : 'A payment has been created. Check its status to confirm completion.');
    if (result.ok) {
      if (result.data.kind === 'checkout') setCheckout(result.data.data);
      else { setInvoice(result.data.data); setPaymentId(result.data.data.payment_id); }
      await billing.refetch();
    }
  }

  async function openPortal() {
    const result = await portal.run(async () => externalPaymentUrl(responseData(await api.request<{ portal_url: string }>('billing_manage', {}, { mutation: true })).portal_url), 'Your customer portal link is ready.');
    if (result.ok) setPortalUrl(result.data);
  }

  async function updateSubscription() {
    if (!subscriptionAction) return;
    const action = subscriptionAction;
    const result = await subscription.run(async () => {
      const data = responseData(await api.request<{ status: string; message?: string }>(action === 'cancel' ? 'cancel_subscription' : 'resume_subscription', {}, { mutation: true }));
      if (data.status !== (action === 'cancel' ? 'canceled' : 'resumed')) throw new ApiError('unknown', 'The subscription change was not confirmed. Review its current status.', { outcome: 'unknown' });
      return data;
    }, action === 'cancel' ? 'Renewal canceled. Existing benefits remain until the current period ends.' : 'Subscription renewal resumed.');
    setSubscriptionAction(null);
    if (result.ok) { await billing.refetch(); await refreshSession().catch(() => undefined); }
  }

  function checkPayment(id = paymentId) {
    if (!signedIn || !id.trim() || paymentStatus === 'checking' || paymentStatus === 'unknown') return;
    const generation = ++paymentGeneration.current;
    paymentStream.current?.();
    setPaymentId(id.trim()); setConfirmation(null); setPaymentStatus('checking'); setPaymentMessage('Waiting for the payment service. Your subscription updates after confirmation.');
    paymentStream.current = api.stream<PaymentConfirmation>('confirm_payment', { payment_id: id.trim() }, {
      mutation: true,
      onFrame(frame) {
        if (generation !== paymentGeneration.current || !frame.data) return;
        if (frame.data.payment_id !== id.trim() || typeof frame.data.status !== 'string' || !frame.data.status) { setPaymentStatus('unknown'); setPaymentMessage('The returned payment status did not match this request. Review your billing history before checking again.'); paymentStream.current?.(); return; }
        setConfirmation(frame.data);
        setPaymentMessage(frame.data.message ?? `Payment status: ${frame.data.status}`);
        if (frame.data.status === 'completed') {
          setPaymentStatus('completed');
          void billing.refetch(); void refreshSession().catch(() => undefined);
        }
      },
      onError(error) {
        if (generation !== paymentGeneration.current) return;
        setPaymentStatus(error.outcome === 'unknown' ? 'unknown' : 'error');
        setPaymentMessage(error.outcome === 'unknown' ? 'Payment confirmation was interrupted. Review your latest billing before initiating another payment.' : error.message);
      },
    });
  }

  async function removePayment() {
    if (!deleteTarget) return;
    const result = await deletion.run(async () => {
      const data = responseData(await api.request<{ status: string }>('delete_payment', { payment_id: deleteTarget.payment_id }, { mutation: true }));
      if (data.status !== 'moved_to_deleted') throw new ApiError('unknown', 'The payment record change was not confirmed.', { outcome: 'unknown' });
      return data;
    }, 'The payment record was moved to deleted. This does not refund the payment.');
    setDeleteTarget(null);
    if (result.ok) await billing.refetch();
  }

  return <div className="billing-page stack">
    <PageHeader title={<>The right access.<br />For the work ahead.</>} description={signedIn ? `Current plan: ${currentPlan ?? 'loading'}. Compare billing options.` : 'Compare plans and find the right level of access.'} actions={<div className="billing-header-actions"><div className="billing-cadence"><Tabs items={[{ id: 'monthly', label: 'Monthly' }, { id: 'annually', label: 'Annually' }]} value={cadence} onChange={(value) => { setCadence(value as BillingCadence); setPromoResult(null); promoCheck.reset(); }} /><span className="muted">Prices in USD · Annual billing is paid yearly</span></div>{signedIn ? <Button size="sm" variant="ghost" onClick={() => void reconcileBilling()} loading={billing.isFetching}>Refresh billing</Button> : <Link className="inline-link" to="/auth/login?returnTo=%2Fbilling">Sign in →</Link>}</div>} />
    {location.pathname.endsWith('/return') && <Alert tone="info" title="Welcome back">Returning from a payment provider does not confirm payment. Your latest subscription and payment status appear below.</Alert>}

    <OperationNotice state={purchase.state} onCheck={() => void reconcileBilling()} />

    {pricing.isPending ? <Spinner label="Loading current plans…" /> : pricing.isError ? <Alert tone="error" title="Plans could not be loaded" actions={<Button onClick={() => void pricing.refetch()}>Try again</Button>}>{pricing.error.message}</Alert> : !pricing.data.subscriptions?.length ? <EmptyState title="No plans returned" description="Refresh to request the latest pricing." actions={<Button onClick={() => void pricing.refetch()}>Refresh plans</Button>} /> : <div className="billing-plans">{pricing.data.subscriptions.map((plan) => {
      const amount = cadence === 'monthly' ? plan.monthly_price : plan.annually_price / 12;
      const savings = plan.monthly_price > 0 ? Math.round((1 - plan.annually_price / (plan.monthly_price * 12)) * 100) : 0;
      const current = plan.type === currentPlan;
      return <Card key={plan.type} className={`billing-plan${current ? ' billing-plan--current' : ''}${plan.type === 'Business' ? ' billing-plan--business' : ''}`}><div className="billing-plan-name"><h2>{plan.name ?? plan.type}</h2>{current ? <Badge tone="accent">Current plan</Badge> : cadence === 'annually' && savings > 0 ? <Badge tone="neutral">Save {savings}%</Badge> : null}</div><p className="billing-plan-description">{plan.description || [plan.private_scanning && 'Private Scanner', plan.advanced_search && 'Advanced Search', plan.buckets && 'Buckets'].filter(Boolean).join(' · ') || 'Core search access'}</p><div className="billing-price"><strong>{money(amount)}</strong><span>per month</span></div><p className="billing-period">{cadence === 'annually' ? `${money(plan.annually_price)} billed annually` : `${money(plan.monthly_price)} billed monthly`}</p>{plan.monthly_price === 0 ? <Link to={signedIn ? '/search' : '/auth/signup'} className="button button--secondary">{signedIn ? 'Explore search' : 'Create free account'}</Link> : <Button fullWidth variant={current ? 'secondary' : 'primary'} onClick={() => current && signedIn ? document.getElementById('billing-current')?.scrollIntoView({ block: 'start' }) : choose({ kind: 'plan', value: plan })} disabled={purchase.blocked}>{current ? 'View current plan' : `Choose ${plan.name ?? plan.type}`}</Button>}<dl className="billing-plan-features"><div><dt>Search credits</dt><dd>{formatNumber(plan.credits)}</dd></div><div><dt>Users</dt><dd>{formatNumber(plan.users)}</dd></div><div><dt>Search pages</dt><dd>{formatNumber(plan.search_pages)}</dd></div><div><dt>API requests / sec</dt><dd>{plan.api_access ? formatNumber(plan.api_rate_limit) : '—'}</dd></div>{(plan.scan_credits ?? 0) > 0 && <div><dt>Scan credits</dt><dd>{formatNumber(plan.scan_credits)}</dd></div>}</dl></Card>;
    })}</div>}

    {pricing.data?.tokens && pricing.data.tokens.length > 0 && <div className="billing-token-link"><p>Need more queries on your current plan?</p><a className="button button--secondary" href="#billing-token-packs">View token packs <span aria-hidden="true">→</span></a></div>}
    {pricing.data?.tokens && pricing.data.tokens.length > 0 && <Card><div className="billing-section-heading"><div><h2 id="billing-token-packs" className="section-title" tabIndex={-1}>A little more room to explore.</h2><p className="muted">Add search credits without changing your plan.</p></div><Badge tone="neutral">Credit packs</Badge></div><div className="billing-token-packs">{pricing.data.tokens.map((pack) => <article key={pack.id} className="billing-token"><span className="muted">{pack.name || pack.id}</span><strong>{formatNumber(pack.tokens)}</strong><span className="muted">search credits</span><Button variant="secondary" onClick={() => choose({ kind: 'tokens', value: pack })} disabled={purchase.blocked}>{money(pack.price_usd)}</Button></article>)}</div>{!signedIn && <p><Link className="inline-link" to="/auth/login?returnTo=%2Fbilling">Sign in to purchase credits →</Link></p>}</Card>}

    {signedIn && <div className="billing-metrics"><Metric label="Money balance" value={money(balance)} detail="USD account balance" /><Metric label="Search credits" value={formatNumber(searchCredits)} detail="Public search and data access" /><Metric label="Scan credits" value={formatNumber(scanCredits)} detail="Private scanning allowance" /></div>}

    {signedIn && <><Card className="billing-current"><div id="billing-current" className="billing-section-heading"><div><h2 className="section-title">Current subscription</h2><p className="muted">Manage renewal and keep your payment details up to date.</p></div><Badge tone={currentSubscription?.canceled ? 'warning' : 'accent'}>{currentSubscription?.canceled ? 'Renewal canceled' : currentPlan ?? 'Account'}</Badge></div><OperationNotice state={subscription.state} onCheck={() => void reconcileBilling()} /><OperationNotice state={portal.state} onCheck={() => void reconcileBilling()} />{billing.isError && <Alert tone="error" actions={<Button onClick={() => void billing.refetch()}>Try again</Button>}>{billing.error.message}</Alert>}<div className="billing-subscription-body"><dl><div><dt>Current period ends</dt><dd>{formatDate(currentSubscription?.expiry_date)}</dd></div><div><dt>Renewal</dt><dd>{currentSubscription?.canceled === true ? 'Canceled at period end' : currentSubscription?.canceled === false ? 'Enabled' : currentPlan === 'Free' ? 'Free plan' : 'Check provider details'}</dd></div></dl><div className="cluster">{pricing.data?.subscriptions.find(plan => plan.type === currentPlan && plan.monthly_price > 0) && <Button variant="secondary" disabled={purchase.blocked} onClick={() => { const plan = pricing.data?.subscriptions.find(item => item.type === currentPlan); if (plan) choose({ kind: 'plan', value: plan }); }}>Change billing period</Button>}<Button variant="secondary" loading={portal.busy} disabled={portal.blocked} onClick={() => void openPortal()}>Payment methods & invoices</Button>{currentPlan && !['Free', 'Guest'].includes(currentPlan) && <Button variant="ghost" disabled={subscription.blocked} onClick={() => setSubscriptionAction(currentSubscription?.canceled ? 'resume' : 'cancel')}>{currentSubscription?.canceled ? 'Resume renewal' : 'Cancel renewal'}</Button>}</div></div>{portalUrl && <Alert tone="info" actions={<a href={portalUrl} target="_blank" rel="noopener noreferrer" className="inline-link">Open customer portal ↗</a>}>Your secure portal is ready. It opens in a new tab.</Alert>}</Card>
      <Card><div className="billing-section-heading"><div><h2 className="section-title">Payment status</h2><p className="muted">Check a payment by its payment ID. A checkout transaction ID is a different identifier.</p></div></div><div className="billing-status-form"><Field label="Payment ID" value={paymentId} onChange={(event) => setPaymentId(event.target.value)} placeholder="Payment ID from your invoice" /><Button variant="secondary" loading={paymentStatus === 'checking'} disabled={!paymentId.trim() || paymentStatus === 'unknown'} onClick={() => checkPayment()}>Check status</Button></div>{paymentStatus !== 'idle' && <Alert tone={paymentStatus === 'completed' ? 'success' : paymentStatus === 'error' ? 'error' : paymentStatus === 'unknown' ? 'warning' : 'info'} title={paymentStatus === 'completed' ? 'Payment confirmed by the server' : paymentStatus === 'unknown' ? 'Confirmation interrupted' : 'Payment update'} actions={paymentStatus === 'unknown' ? <Button onClick={() => void reconcileBilling()}>Review latest billing</Button> : undefined}>{paymentMessage}{confirmation?.status && <div className="billing-payment-status"><Badge tone={confirmation.status === 'completed' ? 'success' : 'neutral'}>{confirmation.status}</Badge></div>}{paymentStatus === 'completed' && <p>Current access: {user?.subscription?.type ?? 'refreshing'}. Refresh your account if the expected access has not appeared.</p>}</Alert>}</Card>
      <Card><div className="billing-section-heading"><div><h2 className="section-title">Payment history</h2><p className="muted">Transactions reported by your APCOSYS account.</p></div></div><OperationNotice state={deletion.state} onCheck={() => void reconcileBilling()} />{billing.isPending ? <Spinner label="Loading payment history…" /> : billing.isError ? <Alert tone="error" actions={<Button onClick={() => void billing.refetch()}>Retry payment history</Button>}>Payment history could not be checked. {billing.error.message}</Alert> : !billing.data?.payments?.length ? <EmptyState title="No payments to show" description="New account payments will appear here. Card invoices are available in the customer portal." /> : <div className="table-wrap"><table className="data-table"><thead><tr><th>Payment</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>{billing.data.payments.map((item) => <tr key={item.payment_id}><td><strong>{item.subscription ?? 'Payment'}</strong><div className="mono muted">{item.payment_id}</div></td><td>{money(item.amount_usd)}{item.coin && <div className="muted">{item.amount} {item.coin}</div>}</td><td><Badge tone={item.status === 'completed' ? 'success' : 'neutral'}>{item.status ?? 'Not available'}</Badge></td><td>{formatDate(item.created_at)}</td><td><div className="cluster"><Button size="sm" variant="ghost" disabled={paymentStatus === 'checking' || paymentStatus === 'unknown'} onClick={() => checkPayment(item.payment_id)}>Check</Button><Button size="sm" variant="ghost" disabled={deletion.blocked} onClick={() => setDeleteTarget(item)}>Remove record</Button></div></td></tr>)}</tbody></table></div>}</Card></>}

    {signedIn && <CryptoActivity />}

    <Dialog open={selection !== null} onClose={() => { if (!purchase.busy) setSelection(null); }} title={selection?.kind === 'tokens' ? `Add ${formatNumber(selection.value.tokens)} credits` : `${selectedName ?? 'Plan'} · ${cadence}`} size="md" footer={!checkout && !invoice ? <><Button variant="secondary" disabled={purchase.busy} onClick={() => setSelection(null)}>Cancel</Button>{signedIn ? <Button loading={purchase.busy} disabled={purchase.blocked || method === 'crypto' && (!network || !coin || networks.isError)} onClick={() => void beginPurchase()}>{method === 'card' ? 'Create secure checkout' : method === 'balance' ? 'Pay with balance' : 'Create crypto invoice'}</Button> : <Link className="button button--primary" to="/auth/login?returnTo=%2Fbilling">Sign in</Link>}</> : <Button variant="secondary" onClick={() => setSelection(null)}>Close</Button>}>
      <div className="stack"><div className="billing-purchase-summary"><span>{selectedName}</span><strong>{money(selectedPrice)}</strong></div><OperationNotice state={purchase.state} onCheck={() => void reconcileBilling()} />{!checkout && !invoice && <>{selection?.kind === 'plan' && <SelectField label="Billing period" value={cadence} disabled={purchase.busy} onChange={(event) => { setCadence(event.target.value as BillingCadence); setPromoResult(null); promoCheck.reset(); }}><option value="monthly">Monthly</option><option value="annually">Annually</option></SelectField>}<SelectField label="Payment method" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)} disabled={purchase.busy}><option value="card">Card / payment provider</option><option value="balance">Account balance · {money(balance)}</option><option value="crypto">Cryptocurrency</option></SelectField>{method === 'crypto' && <>{networks.isPending ? <Spinner label="Loading payment networks…" /> : networks.isError ? <Alert tone="error" actions={<Button onClick={() => void networks.refetch()}>Try again</Button>}>{networks.error.message}</Alert> : <div className="form-grid"><SelectField label="Network" value={network} disabled={purchase.busy} onChange={(event) => { setNetwork(event.target.value); setCoin(networks.data?.find((item) => item.network === event.target.value)?.coins[0]?.coin ?? ''); }}>{networks.data?.map((item) => <option key={item.network} value={item.network}>{item.network}</option>)}</SelectField><SelectField label="Coin" value={coin} disabled={purchase.busy} onChange={(event) => setCoin(event.target.value)}>{selectedCoins.map((item) => <option key={item.coin} value={item.coin}>{item.coin}{item.name ? ` · ${item.name}` : ''}</option>)}</SelectField></div>}<Alert tone="warning">Only send the selected coin on the specified network. The created invoice provides the exact amount, destination and expiry.</Alert></>}{method === 'balance' && <Alert tone="info">Your account balance is {money(balance)} USD. Search and scan credits are not a money balance.</Alert>}<div className="billing-promo"><Field label="Promo code (optional)" value={promo} onChange={(event) => { setPromo(event.target.value); setPromoResult(null); promoCheck.reset(); }} disabled={purchase.busy} /><Button variant="secondary" loading={promoCheck.busy} disabled={!promo.trim() || purchase.busy} onClick={() => void validatePromo()}>Check code</Button></div><OperationNotice state={promoCheck.state} />{promoResult && <Alert tone={promoResult.valid ? 'success' : 'warning'}>{promoResult.valid ? `${promoResult.description || 'Promo applied'}${promoResult.final_amount_usd !== undefined ? ` · ${money(promoResult.final_amount_usd)}` : ''}` : promoResult.message || 'This promo code could not be applied.'}</Alert>}{method === 'card' && <><Field label="Currency code (optional)" value={currency} maxLength={8} onChange={(event) => setCurrency(event.target.value.toUpperCase())} placeholder="Provider default" hint="For example USD. The provider validates availability and confirms the final total." disabled={purchase.busy} /><Checkbox label="Apply an eligible automatic discount" checked={automaticDiscount} onChange={(event) => setAutomaticDiscount(event.target.checked)} disabled={purchase.busy} /></>}<p className="muted">The payment service confirms the final total. Access changes after confirmed payment.</p></>}{checkout && <Alert tone="success" title="Continue with the payment provider" actions={<a className="button button--primary" href={checkout.checkout_url} target="_blank" rel="noopener noreferrer">Open secure checkout ↗</a>}>Your checkout is ready. No payment has been confirmed by this page.</Alert>}{invoice && <div className="stack"><h3>Payment details</h3><dl className="billing-invoice"><div><dt>Payment ID</dt><dd className="mono">{invoice.payment_id}</dd></div>{invoice.network && <div><dt>Network</dt><dd>{invoice.network}</dd></div>}{invoice.coin && <div><dt>Amount</dt><dd>{invoice.amount} {invoice.coin}</dd></div>}{invoice.address && <div><dt>Destination</dt><dd className="mono billing-break">{invoice.address}</dd></div>}<div><dt>Total in USD</dt><dd>{money(invoice.final_amount_usd ?? invoice.amount_usd)}</dd></div>{invoice.expires_at !== undefined && <div><dt>Expires</dt><dd>{formatDate(invoice.expires_at)}</dd></div>}</dl>{invoice.message && <Alert tone="info">{invoice.message}</Alert>}<div className="cluster">{invoice.address && <Button variant="secondary" onClick={() => void copyText(invoice.address!, toast)}>Copy address</Button>}<Button onClick={() => { setSelection(null); checkPayment(invoice.payment_id); }}>Check payment status</Button></div></div>}</div>
    </Dialog>
    <ConfirmDialog open={subscriptionAction !== null} onClose={() => setSubscriptionAction(null)} onConfirm={() => void updateSubscription()} title={subscriptionAction === 'cancel' ? 'Cancel subscription renewal?' : 'Resume subscription renewal?'} description={subscriptionAction === 'cancel' ? 'Benefits remain active until the current period ends. This action does not request a refund.' : 'The server will confirm whether renewal can be resumed for this subscription.'} confirmLabel={subscriptionAction === 'cancel' ? 'Cancel renewal' : 'Resume renewal'} danger={subscriptionAction === 'cancel'} busy={subscription.busy} />
    <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} onConfirm={() => void removePayment()} title="Remove this payment record?" description="The record will move to deleted. This does not refund a payment or cancel a subscription." confirmLabel="Remove record" danger busy={deletion.busy} />
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="billing-metric"><span>{label}</span><strong>{value}</strong><p>{detail}</p></Card>;
}
