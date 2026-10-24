import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ApiError, type BillingCadence, type BillingData, type BillingPayment, type CheckoutData, type CryptoInvoice, type NetworkData, type PaymentConfirmation, type PricingData, type PricingPlan, type PromoData, type PurchaseRequest, type TokenPack } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Card, Checkbox, ConfirmDialog, Dialog, EmptyState, Field, Icon, PageHeader, SelectField, Skeleton, Spinner, TabPanel, Tabs } from '../../components/ui';
import { AnimatedPrice, DoubleButton } from '../../components/brand';
import { copyText, formatDate, formatNumber, OperationNotice, responseData, useOperation } from '../account/operation';
import { CryptoActivity } from './CryptoActivity';
import { PaymentHistory } from './PaymentHistory';
import { BILLING_SECTIONS, billingCadence, billingIntent, billingSection, type BillingSection } from './navigation';
import { unavailablePaymentValue } from './payment-display';
import { WalletPayment, WalletReview, type WalletPaymentState } from './WalletPayment';
import { rememberWallet, resolveWallet, usePendingWallet } from './pending-wallet';
import { walletSnapshotUpdated, type WalletExpectation } from './wallet-sync';
import { SupportDialog } from '../support/SupportDialog';
import { presentationPayments } from '../../demo/presentation-payments';
import { checkoutPath, orderPath, paymentHistoryPath } from './order-model';
import { CreditPackCover } from './CreditPackCover';
import './billing.css';
import './commerce.css';

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
  const { api, session, user, refreshSession, toast, mode } = useApp();
  const location = useLocation(), navigate = useNavigate();
  const presentation = mode === 'demo' ? presentationPayments(api) : undefined;
  const signedIn = session.status === 'authenticated';
  const walletPrincipal = signedIn ? user?.user_id ?? '' : '';
  const persistWallet = mode !== 'demo';
  const pendingWalletRecord = usePendingWallet(walletPrincipal, persistWallet);
  const pendingWalletId = typeof pendingWalletRecord === 'string' ? pendingWalletRecord : null;
  const section = billingSection(location, signedIn);
  const pricing = useQuery({ queryKey: ['pricing'], queryFn: ({ signal }) => api.http<PricingData>('/pricing', { signal, mutation: false }) });
  const billing = useQuery({ queryKey: ['user-billing', user?.user_id], enabled: signedIn, queryFn: async ({ signal }) => responseData(await api.request<BillingData>('user_billing', {}, { signal, mutation: false })) });
  const [cadence, setCadence] = useState<BillingCadence>(() => billingCadence(new URLSearchParams(location.search)));
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
  const [paymentMethodsOpen, setPaymentMethodsOpen] = useState(false);
  const [allPlansOpen, setAllPlansOpen] = useState(false);
  const [openPlans, setOpenPlans] = useState<Set<string>>(() => new Set());
  const [desktopPlans, setDesktopPlans] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const [subscriptionAction, setSubscriptionAction] = useState<'cancel' | 'resume' | null>(null);
  const [paymentId, setPaymentId] = useState(new URLSearchParams(location.search).get('payment_id') ?? '');
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(() => Boolean(new URLSearchParams(location.search).get('payment_id')));
  const [paymentStatus, setPaymentStatus] = useState<PaymentState>('idle');
  const [paymentMessage, setPaymentMessage] = useState('');
  const [confirmation, setConfirmation] = useState<PaymentConfirmation | null>(null);
  const [accountSync, setAccountSync] = useState<'idle' | 'loading' | 'ready' | 'pending' | 'error'>('idle');
  const walletExpectation = useRef<WalletExpectation | null>(null);
  const [invoiceRequestOpen, setInvoiceRequestOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BillingPayment | null>(null);
  const purchase = useOperation();
  const portal = useOperation();
  const subscription = useOperation();
  const promoCheck = useOperation();
  const deletion = useOperation();
  const paymentStream = useRef<(() => void) | null>(null);
  const paymentGeneration = useRef(0);
  const mounted = useRef(true);
  const accountSyncGeneration = useRef(0);
  const activeWalletPrincipal = useRef(walletPrincipal);
  activeWalletPrincipal.current = walletPrincipal;
  const handledIntent = useRef('');
  const currentPromoRequest = useRef('');
  const networks = useQuery({ queryKey: ['billing-networks'], enabled: !presentation && signedIn && selection !== null && method === 'crypto', queryFn: async ({ signal }) => responseData(await api.request<NetworkData[]>('networks', {}, { signal, mutation: false })) });
  const availableNetworks = (presentation?.networks ?? networks.data)?.filter(item => !unavailablePaymentValue(item.network)).map(item => ({ ...item, coins: item.coins.filter(coin => !unavailablePaymentValue(coin.coin)) })).filter(item => item.coins.length > 0) ?? [];

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++paymentGeneration.current; ++accountSyncGeneration.current; paymentStream.current?.(); }; }, []);
  useEffect(() => {
    const first = availableNetworks[0];
    if (first && !availableNetworks.some(item => item.network === network)) { setNetwork(first.network); setCoin(first.coins[0]?.coin ?? ''); }
    else { const current = availableNetworks.find(item => item.network === network); if (current && !current.coins.some(item => item.coin === coin)) setCoin(current.coins[0]?.coin ?? ''); }
  }, [networks.data, presentation, network, coin]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)'), update = () => setDesktopPlans(media.matches);
    media.addEventListener('change', update); return () => media.removeEventListener('change', update);
  }, []);

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
  const reviewPrice = promoResult?.valid && typeof promoResult.final_amount_usd === 'number' ? promoResult.final_amount_usd : selectedPrice;
  const walletInsufficient = method === 'balance' && (typeof balance !== 'number' || !Number.isFinite(balance) || typeof reviewPrice !== 'number' || balance < reviewPrice);
  const paymentFailed = ['failed', 'canceled', 'cancelled', 'expired'].includes(confirmation?.status ?? '');
  const unresolvedPayment = Boolean(pendingWalletRecord) || paymentStatus === 'checking' || paymentStatus === 'unknown' || invoice !== null && method === 'balance' && (paymentStatus === 'idle' || paymentStatus === 'error' && !paymentFailed);
  const walletActive = method === 'balance' && (purchase.busy || invoice !== null);
  const walletState: WalletPaymentState = purchase.busy ? 'processing' : paymentStatus === 'completed' ? 'completed' : paymentStatus === 'unknown' || paymentStatus === 'error' && !paymentFailed ? 'unknown' : paymentStatus === 'error' ? 'failed' : 'pending';
  const selectedCoins = availableNetworks.find(item => item.network === network)?.coins ?? [];
  currentPromoRequest.current = `${selection?.kind}|${selectedName}|${cadence}|${promo.trim()}`;

  useEffect(() => {
    if (pendingWalletId && !selection) { setPaymentId(pendingWalletId); setPaymentPanelOpen(true); }
  }, [pendingWalletId, selection]);

  useEffect(() => {
    if (!signedIn || !pricing.data) return;
    const params = new URLSearchParams(location.search), plan = params.get('plan'), pack = params.get('pack');
    const intent = billingIntent(params);
    if (!plan && !pack) { handledIntent.current = ''; return; }
    if (handledIntent.current === intent || purchase.blocked || unresolvedPayment) return;
    handledIntent.current = intent;
    const selectedPlan = plan ? pricing.data.subscriptions.find(item => item.type === plan) : undefined;
    const selectedPack = pack ? pricing.data.tokens?.find(item => item.id === pack) : undefined;
    if (!selectedPlan && !selectedPack) { toast('That selection is no longer available. Choose from the current plans and credit packs.', 'info'); return; }
    const requestedMethod = params.get('method');
    openReview(selectedPlan ? { kind: 'plan', value: selectedPlan } : { kind: 'tokens', value: selectedPack! }, billingCadence(params), ['balance', 'card', 'crypto'].includes(requestedMethod ?? '') ? requestedMethod as PaymentMethod : undefined);
    setPromo(params.get('promo') ?? '');
    if (params.get('network')) setNetwork(params.get('network')!);
    if (params.get('coin')) setCoin(params.get('coin')!);
  }, [signedIn, pricing.data, location.key, location.search, purchase.blocked, unresolvedPayment, toast]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!selection) setCadence(billingCadence(params));
    const id = params.get('payment_id');
    if (id && paymentStatus === 'idle') { setPaymentId(id); setPaymentPanelOpen(true); }
  }, [location.search, selection, paymentStatus]);

  function changeSection(next: BillingSection) {
    // A history filter can already be in the URL while its render is pending.
    const params = new URLSearchParams(window.location.search);
    params.set('section', next);
    navigate({ search: `?${params}`, hash: '' }, { state: { preserveTabFocus: true } });
  }

  function changeCadence(value: BillingCadence) {
    setCadence(value); setPromoResult(null); promoCheck.reset();
    const params = new URLSearchParams(window.location.search);
    params.set('cadence', value);
    navigate({ search: `?${params}` }, { replace: true, state: { preserveTabFocus: true } });
  }

  function togglePlan(type: string) {
    if (desktopPlans) setAllPlansOpen(value => !value);
    else setOpenPlans(previous => { const next = new Set(previous); if (next.has(type)) next.delete(type); else next.add(type); return next; });
  }

  function purchaseBody(): PurchaseRequest {
    if (!selection) throw new Error('Select a plan or credit pack first.');
    return { ...(selection.kind === 'plan' ? { subscription: selection.value.type, cadence } : { token_pack_id: selection.value.id }), ...(promo.trim() ? { promo_code: promo.trim() } : {}) };
  }

  function openReview(item: Selection, period = cadence, requestedMethod?: PaymentMethod) {
    purchase.reset(); promoCheck.reset();
    setSelection(item); setCadence(period); setPromo(''); setPromoResult(null);
    setCheckout(null); setInvoice(null); setMethod(requestedMethod ?? (mode === 'demo' ? 'balance' : 'card')); setCurrency('');
    setAutomaticDiscount(false); setNetwork(''); setCoin('');
    setAccountSync('idle'); setConfirmation(null); setPaymentStatus('idle'); setPaymentMessage('');
    walletExpectation.current = null;
    ++accountSyncGeneration.current;
  }

  function choose(item: Selection) {
    // The cadence navigation can be in history before React has rendered its new state.
    const chosenCadence = billingCadence(new URLSearchParams(window.location.search));
    if (!signedIn) {
      const params = new URLSearchParams({ cadence: chosenCadence, ...(item.kind === 'plan' ? { plan: item.value.type } : { pack: item.value.id }) });
      navigate(`/auth/login?returnTo=${encodeURIComponent(`/billing?${params}`)}`);
      return;
    }
    if (purchase.blocked || unresolvedPayment) { toast('Review your latest billing before starting another purchase.', 'info'); return; }
    openReview(item, chosenCadence);
  }

  function finishCheckout() {
    setSelection(null);
    const params = new URLSearchParams(window.location.search);
    for (const key of ['plan', 'pack', 'method', 'promo', 'network', 'coin']) params.delete(key);
    params.set('section', 'payments');
    if (invoice?.payment_id) params.set('payment_id', invoice.payment_id);
    navigate({ search: `?${params}`, hash: '' });
  }

  function closeReview() {
    if (purchase.busy) return;
    if (walletActive && invoice) finishCheckout(); else setSelection(null);
  }

  function openPendingWallet() {
    setSelection(null); setPaymentId(pendingWalletId ?? ''); setPaymentPanelOpen(true);
    const params = new URLSearchParams(window.location.search);
    for (const key of ['plan', 'pack', 'method', 'payment_id']) params.delete(key);
    params.set('section', 'payments');
    if (pendingWalletId) params.set('payment_id', pendingWalletId);
    navigate({ search: `?${params}`, hash: '' });
  }

  async function syncAccount(confirmedId = paymentId) {
    const generation = ++accountSyncGeneration.current;
    const expected = walletExpectation.current;
    setAccountSync('loading');
    try {
      const result = await billing.refetch();
      if (!result.isSuccess) throw result.error;
      await refreshSession();
      if (mounted.current && generation === accountSyncGeneration.current) setAccountSync(walletSnapshotUpdated(result.data, expected, confirmedId) ? 'ready' : 'pending');
    } catch { if (mounted.current && generation === accountSyncGeneration.current) setAccountSync('error'); }
  }

  async function reconcileBilling() {
    try {
      const result = await billing.refetch();
      if (result.isSuccess) {
        await refreshSession();
        purchase.reset(); portal.reset(); subscription.reset(); deletion.reset();
        if (paymentStatus === 'unknown' || paymentStatus === 'error' || pendingWalletId) {
          const checkedId = pendingWalletId || paymentId;
          const checkedPayment = result.data.payments?.find(item => item.payment_id === checkedId);
          if (checkedPayment?.status === 'completed') { resolveWallet(walletPrincipal, checkedId, persistWallet); setPaymentStatus('completed'); setAccountSync(walletSnapshotUpdated(result.data, walletExpectation.current, checkedId) ? 'ready' : 'pending'); setPaymentMessage('Your billing history confirms that this payment completed.'); }
          else if (checkedPayment && ['failed', 'canceled', 'cancelled', 'expired'].includes(checkedPayment.status ?? '')) { resolveWallet(walletPrincipal, checkedId, persistWallet); setPaymentStatus('error'); setConfirmation({ payment_id: checkedPayment.payment_id, status: checkedPayment.status! }); setPaymentMessage(`Payment ${checkedPayment.status}. You can check the status again or start a new purchase.`); }
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
    if (!signedIn || !selection || unresolvedPayment || walletInsufficient) return;
    const request = purchaseBody();
    if (method === 'balance') walletExpectation.current = { amount: reviewPrice, balance, credits: searchCredits, ...(selection.kind === 'tokens' ? { addedCredits: selection.value.tokens } : { plan: selection.value.type, priorPlan: currentPlan, priorExpiry: currentSubscription?.expiry_date }) };
    const result = await purchase.run(async () => {
      if (method === 'balance') rememberWallet(walletPrincipal, true, persistWallet);
      try {
      if (presentation && method !== 'balance') {
        return { kind: 'presentation' as const, data: await presentation.create(method, { ...request, ...(method === 'crypto' ? { network, coin } : {}) }) };
      }
      if (method === 'card') {
        const returnUrl = new URL(`${import.meta.env.BASE_URL}billing/return`, window.location.origin).href;
        const data = responseData(await api.request<CheckoutData>('init_checkout', { ...request, ...(currency.trim() ? { currency: currency.trim().toUpperCase() } : {}), apply_discount: automaticDiscount, return_url: returnUrl, cancel_url: returnUrl }, { mutation: true }));
        if (data.status !== 'success' || !data.transaction_id) throw new ApiError('unknown', 'The checkout was not fully confirmed. Check your billing before starting again.', { outcome: 'unknown' });
        return { kind: 'checkout' as const, data: { ...data, checkout_url: externalPaymentUrl(data.checkout_url) } };
      }
      if (method === 'crypto' && !selectedCoins.some(item => item.coin === coin)) throw new Error('Choose an available payment network and coin.');
      const data = responseData(await api.request<CryptoInvoice>(method === 'crypto' ? 'get_address' : 'pay_with_balance', { ...request, ...(method === 'crypto' ? { network, coin } : {}) }, { mutation: true }));
      if (!data.payment_id) throw new ApiError('unknown', 'A payment ID was not returned. Review your billing before trying again.', { outcome: 'unknown' });
      return { kind: 'invoice' as const, data };
      } catch (error) {
        if (method === 'balance' && !(error instanceof ApiError && error.outcome === 'unknown')) rememberWallet(walletPrincipal, null, persistWallet);
        throw error;
      }
    }, presentation || method === 'balance' ? '' : method === 'card' ? 'Your secure checkout link is ready. Payment is not confirmed yet.' : 'A payment has been created. Check its status to confirm completion.');
    if (result.ok) {
      if (method === 'balance' && result.data.kind === 'invoice') {
        if (walletExpectation.current) walletExpectation.current.amount = result.data.data.final_amount_usd ?? result.data.data.amount_usd ?? reviewPrice;
        rememberWallet(walletPrincipal, result.data.data.payment_id, persistWallet);
      }
      if (!mounted.current || activeWalletPrincipal.current !== walletPrincipal) return;
      if (result.data.kind === 'presentation') {
        setSelection(null);
        await billing.refetch();
        if (mounted.current && activeWalletPrincipal.current === walletPrincipal) navigate(checkoutPath(result.data.data.paymentId, paymentHistoryPath(new URLSearchParams(window.location.search))));
        return;
      }
      if (result.data.kind === 'checkout') setCheckout(result.data.data);
      else {
        setInvoice(result.data.data); setPaymentId(result.data.data.payment_id);
        if (method === 'balance') {
          checkPayment(result.data.data.payment_id, true);
        }
      }
      await billing.refetch();
    }
  }

  async function openPortal() {
    if (presentation) { setPaymentMethodsOpen(true); return; }
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

  function checkPayment(id = paymentId, inline = false) {
    if (!signedIn || !id.trim() || paymentStatus === 'checking' || paymentStatus === 'unknown') return;
    setPaymentPanelOpen(true);
    if (!inline && section !== 'payments') changeSection('payments');
    const generation = ++paymentGeneration.current;
    const recoveringUnidentified = pendingWalletRecord === true;
    paymentStream.current?.();
    setPaymentId(id.trim()); setConfirmation(null); setPaymentStatus('checking'); setPaymentMessage('Waiting for the payment service. Your subscription updates after confirmation.');
    let receivedTerminal = false;
    paymentStream.current = api.stream<PaymentConfirmation>('confirm_payment', { payment_id: id.trim() }, {
      mutation: true,
      onFrame(frame) {
        if (generation !== paymentGeneration.current || !frame.data) return;
        if (frame.data.payment_id !== id.trim() || typeof frame.data.status !== 'string' || !frame.data.status) { setPaymentStatus('unknown'); setPaymentMessage('The returned payment status did not match this request. Review your billing history before checking again.'); paymentStream.current?.(); return; }
        setConfirmation(frame.data);
        setPaymentMessage(frame.data.message ?? `Payment status: ${frame.data.status}`);
        if (frame.data.status === 'completed') {
          receivedTerminal = true;
          resolveWallet(walletPrincipal, id.trim(), persistWallet, recoveringUnidentified);
          purchase.reset();
          setPaymentStatus('completed');
          paymentStream.current?.();
          void syncAccount(id.trim());
        } else if (['failed', 'canceled', 'cancelled', 'expired'].includes(frame.data.status)) {
          receivedTerminal = true;
          resolveWallet(walletPrincipal, id.trim(), persistWallet, recoveringUnidentified);
          purchase.reset();
          setPaymentStatus('error');
          paymentStream.current?.();
          void billing.refetch();
        }
      },
      onError(error) {
        if (generation !== paymentGeneration.current || receivedTerminal) return;
        setPaymentStatus(error.outcome === 'unknown' ? 'unknown' : 'error');
        setPaymentMessage(error.outcome === 'unknown' ? 'Payment confirmation was interrupted. Review your latest billing before initiating another payment.' : error.message);
      },
      onComplete() {
        if (generation !== paymentGeneration.current || receivedTerminal) return;
        setPaymentStatus('unknown'); setPaymentMessage('The confirmation ended before a final status was returned. Refresh billing to check this payment.');
      },
    });
  }

  async function removePayment() {
    if (!deleteTarget || unresolvedPayment) return;
    const result = await deletion.run(async () => {
      const data = responseData(await api.request<{ status: string }>('delete_payment', { payment_id: deleteTarget.payment_id }, { mutation: true }));
      if (data.status !== 'moved_to_deleted') throw new ApiError('unknown', 'The payment record change was not confirmed.', { outcome: 'unknown' });
      return data;
    }, 'The payment record was moved to deleted. This does not refund the payment.');
    setDeleteTarget(null);
    if (result.ok) await billing.refetch();
  }

  const accountRequired = <EmptyState icon={<Icon name="lock" size={24} />} title="Sign in to manage billing" actions={<Link className="button button--primary" to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`}>Sign in</Link>} />;

  return <div className="billing-page stack">
    <PageHeader title="Billing" actions={signedIn ? <Button size="sm" variant="secondary" onClick={() => void reconcileBilling()} loading={billing.isFetching}><Icon name="refresh" size={16} />Refresh billing</Button> : <Link className="button button--secondary" to="/auth/login?returnTo=%2Fbilling">Sign in</Link>} />
    {pendingWalletRecord && !selection && <div className="billing-pending-wallet" role="status"><Icon name="clock" size={20} /><div><strong>A wallet payment is awaiting confirmation</strong><span>{pendingWalletId ? 'Check its status before starting another purchase.' : 'The payment reference has not arrived. Review your recent payments.'}</span></div><Button variant="secondary" onClick={openPendingWallet}>Review payment<Icon name="arrow" size={16} /></Button></div>}
    <Tabs idPrefix="billing" ariaLabel="Billing sections" items={[...BILLING_SECTIONS]} value={section} onChange={value => changeSection(value as BillingSection)} />

    {!selection && <OperationNotice state={purchase.state} onCheck={() => void reconcileBilling()} />}
    {section !== 'overview' && <><OperationNotice state={subscription.state.status === 'unknown' ? subscription.state : { status: 'idle', message: '' }} onCheck={() => void reconcileBilling()} /><OperationNotice state={portal.state.status === 'unknown' ? portal.state : { status: 'idle', message: '' }} onCheck={() => void reconcileBilling()} /></>}
    {section !== 'payments' && deletion.state.status === 'unknown' && <OperationNotice state={deletion.state} onCheck={() => void reconcileBilling()} />}
    {section !== 'payments' && (paymentStatus === 'checking' || paymentStatus === 'unknown') && <div className="billing-pending-strip" role="status"><Icon name="clock" size={18} /><span>{paymentStatus === 'unknown' ? 'Payment status needs checking' : 'Checking payment status'}</span><Button size="sm" variant="ghost" onClick={() => changeSection('payments')}>View payment<Icon name="arrow" size={16} /></Button></div>}

    <TabPanel idPrefix="billing" value="overview" hidden={section !== 'overview'} className="billing-panel stack">
      {!signedIn ? accountRequired : <>
        <div className="billing-metrics"><Metric icon="card" label="Account balance" value={money(balance)} detail="USD" /><Metric icon="search" label="Search credits" value={formatNumber(searchCredits)} detail="Available credits" /><Metric icon="scan" label="Scan credits" value={formatNumber(scanCredits)} detail="Available credits" /></div>
        <Card className="billing-current">
          <div id="billing-current" className="billing-section-heading"><div className="billing-current-identity"><h2 className="section-title">Current plan</h2><strong className="billing-current-plan">{currentPlan ?? 'Unavailable'}</strong></div>{currentSubscription?.canceled && <Badge tone="warning">Renewal canceled</Badge>}</div>
          <OperationNotice state={subscription.state} onCheck={() => void reconcileBilling()} /><OperationNotice state={portal.state} onCheck={() => void reconcileBilling()} />
          {billing.isError && <Alert tone="error" title="Billing could not be refreshed" actions={<Button onClick={() => void billing.refetch()}>Try again</Button>}>{billing.error.message}</Alert>}
          <div className="billing-subscription-body"><dl><div><dt>Current period ends</dt><dd>{formatDate(currentSubscription?.expiry_date)}</dd></div><div><dt>Renewal</dt><dd data-onboarding="subscription-renewal-status" data-state={currentSubscription?.canceled === true ? 'canceled' : currentSubscription?.canceled === false ? 'active' : 'unknown'}>{currentSubscription?.canceled === true ? 'Ends after this period' : currentSubscription?.canceled === false ? 'Enabled' : currentPlan === 'Free' ? 'Free plan' : 'Not provided'}</dd></div></dl>
            <div className="cluster"><Button variant="secondary" onClick={() => changeSection('plans')}>Change plan<Icon name="arrow" size={16} /></Button><Button variant="secondary" onClick={() => changeSection('credits')}><Icon name="plus" size={16} />Add credits</Button></div>
          </div>
          <div className="billing-subscription-actions"><Button variant="secondary" loading={portal.busy} disabled={portal.blocked} onClick={() => void openPortal()}><Icon name={presentation ? 'card' : 'external'} size={16} />Payment methods & invoices</Button>{pricing.data?.subscriptions.find(plan => plan.type === currentPlan && plan.monthly_price > 0) && <Button variant="ghost" disabled={purchase.blocked || unresolvedPayment} onClick={() => { const plan = pricing.data?.subscriptions.find(item => item.type === currentPlan); if (plan) choose({ kind: 'plan', value: plan }); }}>Change billing period</Button>}{currentPlan && !['Free', 'Guest'].includes(currentPlan) && <Button data-onboarding={currentSubscription?.canceled ? 'subscription-resume-renewal' : 'subscription-cancel-renewal'} variant="ghost" disabled={subscription.blocked} onClick={() => setSubscriptionAction(currentSubscription?.canceled ? 'resume' : 'cancel')}>{currentSubscription?.canceled ? 'Resume renewal' : 'Cancel renewal'}</Button>}</div>
          {portalUrl && <div className="billing-ready-link"><Icon name="check" size={18} /><span>Customer portal ready</span><a href={portalUrl} target="_blank" rel="noopener noreferrer" className="button button--secondary">Open customer portal<Icon name="external" size={16} /></a></div>}
        </Card>
      </>}
    </TabPanel>

    <TabPanel idPrefix="billing" value="plans" hidden={section !== 'plans'} className="billing-panel stack">
      <div className="billing-section-heading billing-plans-heading"><div><h2 className="section-title">Compare plans</h2><p>Choose the access and capacity your work needs.</p></div><div className="billing-cadence" data-onboarding="billing-cadence"><Tabs variant="segmented" ariaLabel="Billing cadence" items={[{ id: 'annually', label: 'Annually' }, { id: 'monthly', label: 'Monthly' }]} value={cadence} onChange={value => changeCadence(value as BillingCadence)} /><span className="muted">USD · {cadence === 'annually' ? 'Paid yearly' : 'Paid monthly'}</span></div></div>
      {pricing.isPending ? <Skeleton rows={5} label="Loading plans…" /> : pricing.isError ? <Alert tone="error" title="Plans unavailable" actions={<Button onClick={() => void pricing.refetch()}>Try again</Button>}>{pricing.error.message}</Alert> : !pricing.data.subscriptions?.length ? <EmptyState title="No plans available" actions={<Button onClick={() => void pricing.refetch()}>Refresh plans</Button>} /> : <div className="billing-plans">{pricing.data.subscriptions.map(plan => {
        const amount = cadence === 'monthly' ? plan.monthly_price : plan.annually_price / 12;
        const savings = plan.monthly_price > 0 ? Math.round((1 - plan.annually_price / (plan.monthly_price * 12)) * 100) : 0;
        const current = plan.type === currentPlan;
        return <Card key={plan.type} className={`billing-plan${current ? ' billing-plan--current' : ''}`}>
          <div className="billing-plan-name"><h3>{plan.name ?? plan.type}</h3>{current ? <Badge tone="accent">Current plan</Badge> : cadence === 'annually' && savings > 0 ? <Badge>Save {savings}%</Badge> : null}</div>
          <p className="billing-plan-description">{plan.description || [plan.private_scanning && 'Private Scanner', plan.advanced_search && 'Advanced Search', plan.buckets && 'Buckets'].filter(Boolean).join(' · ') || 'Search access'}</p>
          <div className="billing-price"><strong><AnimatedPrice amount={amount} /></strong><span>/ month</span></div>
          <p className="billing-period">{plan.monthly_price === 0 && plan.annually_price === 0 ? 'No subscription payment' : cadence === 'annually' ? `${money(plan.annually_price)} billed yearly` : `${money(plan.monthly_price)} billed monthly`}</p>
          {plan.monthly_price === 0 ? <Link to={signedIn ? '/search' : '/auth/signup'} className="button button--secondary">{signedIn ? 'Open search' : 'Create account'}</Link> : <DoubleButton fullWidth variant={current ? 'secondary' : 'primary'} onClick={() => current && signedIn ? changeSection('overview') : choose({ kind: 'plan', value: plan })} disabled={purchase.blocked || unresolvedPayment}>{current ? 'View current plan' : `Choose ${plan.name ?? plan.type}`}</DoubleButton>}
          <dl className="billing-plan-features"><div><dt><Icon name="search" size={15} />Search credits</dt><dd>{formatNumber(plan.credits)}</dd></div><div><dt><Icon name="user" size={15} />Users</dt><dd>{formatNumber(plan.users)}</dd></div><div><dt><Icon name="list" size={15} />Search pages</dt><dd>{formatNumber(plan.search_pages)}</dd></div><div><dt><Icon name="code" size={15} />{plan.api_rate_limit === undefined ? 'API access' : 'API requests / sec'}</dt><dd>{plan.api_access === true ? plan.api_rate_limit === undefined ? 'Included' : formatNumber(plan.api_rate_limit) : plan.api_access === false ? 'Not included' : '—'}</dd></div><div><dt><Icon name="scan" size={15} />Scan credits</dt><dd>{(plan.scan_credits ?? 0) > 0 ? formatNumber(plan.scan_credits) : plan.scan_credits === 0 ? 'Not included' : '—'}</dd></div></dl>
          <PlanCapabilities plan={plan} open={desktopPlans ? allPlansOpen : openPlans.has(plan.type)} onToggle={() => togglePlan(plan.type)} />
        </Card>;
      })}</div>}
      {cadence === 'annually' && pricing.data?.subscriptions.some(plan => plan.type === 'Business') && <div className="billing-invoice-request"><div><Icon name="receipt" size={22} /><div><strong>Annual Business by invoice</strong><p>Request an invoice and arrange a bank transfer with our team.</p></div></div><Button data-onboarding="invoice-request" variant="secondary" onClick={() => setInvoiceRequestOpen(true)}>Request invoice<Icon name="arrow" size={16} /></Button></div>}
    </TabPanel>

    <TabPanel idPrefix="billing" value="credits" hidden={section !== 'credits'} className="billing-panel stack">
      <div className="billing-section-heading"><div><h2 id="billing-token-packs" className="section-title">Search credit packs</h2><p>Add credits to your current plan.</p></div>{signedIn && <Badge tone="accent">{formatNumber(searchCredits)} available</Badge>}</div>
      {pricing.isPending ? <Skeleton rows={3} label="Loading credit packs…" /> : pricing.isError ? <Alert tone="error" title="Credit packs unavailable" actions={<Button onClick={() => void pricing.refetch()}>Try again</Button>}>{pricing.error.message}</Alert> : pricing.data.tokens?.length ? <div className="billing-token-packs">{pricing.data.tokens.map((pack, index) => <article key={pack.id} className="billing-token">
        <CreditPackCover level={index} />
        <div className="billing-token-heading"><h3>{pack.name || pack.id}</h3>{typeof pack.discount_percent === 'number' && pack.discount_percent > 0 && <Badge tone="accent">Save {pack.discount_percent}%</Badge>}</div>
        <div className="billing-token-amount"><strong>{formatNumber(pack.tokens)}</strong><span>search credits</span></div>
        {pack.description && !/^additional search credits[.!]?$/i.test(pack.description.trim()) && <p className="billing-token-description">{pack.description}</p>}
        <div className="billing-token-price"><strong><AnimatedPrice amount={pack.price_usd} /></strong><span>one-time payment</span></div>
        <DoubleButton fullWidth variant="secondary" onClick={() => choose({ kind: 'tokens', value: pack })} disabled={purchase.blocked || unresolvedPayment}>Buy credits</DoubleButton>
      </article>)}</div> : <EmptyState title="No credit packs available" actions={<Button variant="secondary" onClick={() => void pricing.refetch()}>Refresh packs</Button>} />}
    </TabPanel>

    <TabPanel idPrefix="billing" value="payments" hidden={section !== 'payments'} className="billing-panel stack">
      {!signedIn ? accountRequired : <>
        <div className="billing-section-heading"><div><h2 className="section-title">Payment history</h2>{location.pathname.endsWith('/return') && <p>Check the payment status before starting another payment.</p>}</div><Button data-onboarding="check-payment" variant="secondary" aria-expanded={paymentPanelOpen || paymentStatus !== 'idle'} aria-controls="billing-payment-check" onClick={() => setPaymentPanelOpen(true)}><Icon name="search" size={16} />Check payment</Button></div>
        <section id="billing-payment-check" data-onboarding="payment-status" data-payment-status={paymentStatus} className="billing-payment-check" hidden={!paymentPanelOpen && paymentStatus === 'idle'} aria-label="Payment status">
          <form className="billing-status-form" onSubmit={event => { event.preventDefault(); checkPayment(); }}><Field label="Payment ID" value={paymentId} onChange={event => setPaymentId(event.target.value)} placeholder="Payment ID from your invoice" /><Button type="submit" variant="secondary" loading={paymentStatus === 'checking'} disabled={!paymentId.trim() || paymentStatus === 'unknown'}>Check status</Button></form>
          {paymentStatus !== 'idle' && <Alert tone={paymentStatus === 'completed' ? 'success' : paymentStatus === 'error' ? 'error' : paymentStatus === 'unknown' ? 'warning' : 'info'} title={paymentStatus === 'completed' ? 'Payment completed' : paymentStatus === 'unknown' ? 'Payment status needs checking' : 'Payment status'} actions={paymentStatus === 'unknown' ? <Button onClick={() => void reconcileBilling()}>Refresh billing</Button> : undefined}>{paymentMessage}{confirmation?.status && <div className="billing-payment-status"><Badge tone={confirmation.status === 'completed' ? 'success' : 'neutral'}>{confirmation.status}</Badge></div>}{paymentStatus === 'completed' && <p>Current plan: {user?.subscription?.type ?? 'Unavailable'}</p>}</Alert>}
        </section>
        <OperationNotice state={deletion.state} onCheck={() => void reconcileBilling()} />
        {billing.isPending ? <Skeleton rows={6} label="Loading payment history…" /> : billing.isError ? <Alert tone="error" title="Payment history unavailable" actions={<Button onClick={() => void billing.refetch()}>Retry payment history</Button>}>{billing.error.message}</Alert>
          : billing.data?.payments === undefined ? <EmptyState icon={<Icon name="clock" size={24} />} title="Payment history was not provided" actions={<Button variant="secondary" onClick={() => void billing.refetch()}>Refresh history</Button>} />
          : !Array.isArray(billing.data.payments) || billing.data.payments.some(payment => !payment || typeof payment.payment_id !== 'string') ? <Alert tone="error" title="Payment history could not be read" actions={<Button variant="secondary" onClick={() => void billing.refetch()}>Refresh history</Button>}>Refresh to check the latest records.</Alert>
          : !billing.data.payments.length ? <EmptyState icon={<Icon name="card" size={24} />} title="No payments to show" description="Card invoices are available in Payment methods & invoices." />
          : <PaymentHistory payments={billing.data.payments} onCheck={checkPayment} onRemove={setDeleteTarget} checkDisabled={paymentStatus === 'checking' || paymentStatus === 'unknown'} removeDisabled={deletion.blocked || unresolvedPayment} formatAmount={money} cryptoAmount={presentation ? id => presentation.get(id)?.cryptoAmount : undefined} />}
      </>}
    </TabPanel>

    <TabPanel idPrefix="billing" value="crypto" hidden={section !== 'crypto'} className="billing-panel">
      {signedIn ? <CryptoActivity active={section === 'crypto'} /> : accountRequired}
    </TabPanel>

    <Dialog open={selection !== null} onClose={closeReview} title={selection?.kind === 'tokens' ? `Add ${formatNumber(selection.value.tokens)} credits` : `${selectedName ?? 'Plan'} · ${cadence}`} size="md" className="billing-checkout-dialog" footer={walletActive ? <>
      {walletState === 'completed' ? <>{invoice?.payment_id && <Link className="button button--secondary" to={orderPath(invoice.payment_id)}>Order details</Link>}<Button data-onboarding="wallet-done" onClick={finishCheckout}>View payments<Icon name="arrow" size={16} /></Button></> : <>
        <Button variant="secondary" disabled={purchase.busy} onClick={finishCheckout}>View in payments</Button>
        {walletState === 'unknown' ? <Button loading={billing.isFetching} onClick={() => void reconcileBilling()}><Icon name="refresh" size={16} />Refresh billing</Button> : walletState === 'failed' ? <Button onClick={() => { setInvoice(null); setPaymentStatus('idle'); setConfirmation(null); purchase.reset(); }}>Back to purchase</Button> : paymentStatus === 'idle' && invoice ? <Button onClick={() => checkPayment(invoice.payment_id, true)}>Check payment</Button> : null}
      </>}
    </> : !checkout && !invoice ? <>
      <Button variant="secondary" disabled={purchase.busy} onClick={closeReview}>Cancel</Button>
      {signedIn ? <Button data-onboarding={method === 'balance' ? 'wallet-pay' : 'checkout-continue'} loading={purchase.busy} disabled={purchase.blocked || unresolvedPayment || walletInsufficient || method === 'crypto' && (!selectedCoins.some(item => item.coin === coin) || !presentation && networks.isError)} onClick={() => void beginPurchase()}>{method === 'balance' ? 'Pay with balance' : presentation ? 'Continue' : method === 'card' ? 'Create secure checkout' : 'Create crypto invoice'}{method !== 'balance' && <Icon name="arrow" size={16} />}</Button> : <Link className="button button--primary" to="/auth/login?returnTo=%2Fbilling">Sign in</Link>}
    </> : <Button variant="secondary" onClick={closeReview}>Close</Button>}>
      {walletActive ? <WalletPayment state={walletState} paymentId={invoice?.payment_id} product={selectedName ?? 'Purchase'} total={invoice?.final_amount_usd ?? invoice?.amount_usd ?? reviewPrice} balance={balance} credits={searchCredits} sync={accountSync} message={paymentMessage} onCopy={() => void copyText(invoice?.payment_id ?? '', toast)} onRefresh={() => void syncAccount()} /> : <div className="stack checkout-review" data-onboarding="checkout-review">
        <div className="billing-purchase-summary" data-onboarding="purchase-review"><span><Icon name={selection?.kind === 'tokens' ? 'search' : 'card'} size={21} /><span>{selectedName}<small>{selection?.kind === 'tokens' ? 'One-time credit purchase' : cadence === 'annually' ? 'Billed yearly' : 'Billed monthly'}</small></span></span><strong><AnimatedPrice amount={reviewPrice} /></strong></div>
        <OperationNotice state={purchase.state} onCheck={() => void reconcileBilling()} />
        {!checkout && !invoice && <>
          {selection?.kind === 'plan' && <SelectField label="Billing period" value={cadence} disabled={purchase.busy} onChange={event => { setCadence(event.target.value as BillingCadence); setPromoResult(null); promoCheck.reset(); }}><option value="monthly">Monthly</option><option value="annually">Annually</option></SelectField>}
          <SelectField label="Payment method" data-onboarding="purchase-method" value={method} onChange={event => setMethod(event.target.value as PaymentMethod)} disabled={purchase.busy}><option value="card">Card / payment provider</option><option value="balance">Account wallet · {money(balance)}</option><option value="crypto">Cryptocurrency</option></SelectField>
          {method === 'balance' && <WalletReview balance={balance} total={reviewPrice} onOtherMethod={() => setMethod('card')} />}
          {method === 'crypto' && <>
            {!presentation && networks.isPending ? <Spinner label="Loading payment networks…" /> : !presentation && networks.isError ? <Alert tone="error" actions={<Button onClick={() => void networks.refetch()}>Try again</Button>}>{networks.error.message}</Alert> : availableNetworks.length ? <div className="form-grid"><SelectField label="Network" value={network} disabled={purchase.busy} onChange={event => { setNetwork(event.target.value); setCoin(availableNetworks.find(item => item.network === event.target.value)?.coins[0]?.coin ?? ''); }}>{availableNetworks.map(item => <option key={item.network} value={item.network}>{item.network}</option>)}</SelectField><SelectField label="Coin" value={coin} disabled={purchase.busy} onChange={event => setCoin(event.target.value)}>{selectedCoins.map(item => <option key={item.coin} value={item.coin}>{item.coin}{item.name ? ` · ${item.name}` : ''}</option>)}</SelectField></div> : <EmptyState icon={<Icon name="card" size={24} />} title="Payment service unavailable" description="Cryptocurrency payments are currently unavailable." />}
            {!presentation && availableNetworks.length > 0 && <Alert tone="warning">Only send the selected coin on the specified network. The invoice provides the amount, destination and expiry.</Alert>}
          </>}
          <div className="billing-promo"><Field label="Promo code (optional)" data-onboarding="purchase-promo-input" value={promo} onChange={event => { setPromo(event.target.value); setPromoResult(null); promoCheck.reset(); }} disabled={purchase.busy} /><Button data-onboarding="purchase-promo-check" variant="secondary" loading={promoCheck.busy} disabled={!promo.trim() || purchase.busy} onClick={() => void validatePromo()}>Check code</Button></div>
          <OperationNotice state={promoCheck.state} />
          {promoResult && <p className="billing-promo-result" role="status" data-onboarding={promoResult.valid ? 'purchase-promo-applied' : undefined}><Icon name={promoResult.valid ? 'check' : 'info'} size={18} />{promoResult.valid ? `${promoResult.description || 'Promo applied'}${promoResult.final_amount_usd !== undefined ? ` · ${money(promoResult.final_amount_usd)}` : ''}` : promoResult.message || 'This promo code could not be applied.'}</p>}
          {method === 'card' && !presentation && <><Field label="Currency code (optional)" value={currency} maxLength={8} onChange={event => setCurrency(event.target.value.toUpperCase())} placeholder="Provider default" hint="Leave blank to use the provider’s default currency." disabled={purchase.busy} /><Checkbox label="Apply an eligible automatic discount" checked={automaticDiscount} onChange={event => setAutomaticDiscount(event.target.checked)} disabled={purchase.busy} /></>}
          <p className="checkout-review-note"><Icon name="lock" size={14} />{method === 'balance' ? 'The total is deducted from your wallet after confirmation.' : 'Access updates after payment is confirmed.'}</p>
        </>}
        {checkout && <div className="billing-checkout-ready"><Icon name="check" size={24} /><h3>Checkout ready</h3><p>Continue with the payment provider to complete your purchase.</p><a className="button button--primary" href={checkout.checkout_url} target="_blank" rel="noopener noreferrer">Open secure checkout ↗</a></div>}
        {invoice && (unavailablePaymentValue(invoice.address) || unavailablePaymentValue(invoice.coin) || unavailablePaymentValue(invoice.network) ? <EmptyState icon={<Icon name="card" size={24} />} title="Payment service unavailable" description="No payment instructions are available." /> : <div className="stack"><h3>Payment details</h3><dl className="billing-invoice"><div><dt>Payment ID</dt><dd className="mono">{invoice.payment_id}</dd></div>{invoice.network && <div><dt>Network</dt><dd>{invoice.network}</dd></div>}{invoice.coin && <div><dt>Amount</dt><dd>{invoice.amount} {invoice.coin}</dd></div>}{invoice.address && <div><dt>Destination</dt><dd className="mono billing-break">{invoice.address}</dd></div>}<div><dt>Total in USD</dt><dd>{money(invoice.final_amount_usd ?? invoice.amount_usd)}</dd></div>{invoice.expires_at !== undefined && <div><dt>Expires</dt><dd>{formatDate(invoice.expires_at)}</dd></div>}</dl>{invoice.message && <Alert tone="info">{invoice.message}</Alert>}<div className="cluster">{invoice.address && <Button variant="secondary" onClick={() => void copyText(invoice.address!, toast)}><Icon name="copy" size={16} />Copy address</Button>}<Button onClick={() => { setSelection(null); checkPayment(invoice.payment_id); }}>Check payment status</Button></div></div>)}
      </div>}
    </Dialog>
    <Dialog open={paymentMethodsOpen} onClose={() => setPaymentMethodsOpen(false)} title="Payment methods & invoices" size="md"><div className="stack"><div className="billing-portal-profile"><Icon name="card" size={28} /><div><strong>Visa ending in 4242</strong><span>Saved payment profile</span></div></div><div className="billing-portal-links"><Link to="/billing?section=payments" onClick={() => setPaymentMethodsOpen(false)}><Icon name="receipt" size={18} />Payments and receipts<Icon name="arrow" size={16} /></Link><Link to="/billing?section=crypto" onClick={() => setPaymentMethodsOpen(false)}><Icon name="wallet" size={18} />Cryptocurrency activity<Icon name="arrow" size={16} /></Link><button type="button" onClick={() => { setPaymentMethodsOpen(false); setInvoiceRequestOpen(true); }}><Icon name="document" size={18} />Request a Business invoice<Icon name="arrow" size={16} /></button></div></div></Dialog>
    <SupportDialog open={invoiceRequestOpen} onClose={() => setInvoiceRequestOpen(false)} initialTopic="Billing & payments" initialMessage={`I would like to request an invoice for the annual Business plan${pricing.data?.subscriptions.find(plan => plan.type === 'Business') ? ` (${money(pricing.data.subscriptions.find(plan => plan.type === 'Business')!.annually_price)} per year)` : ''} and arrange payment by bank transfer.\n\nCompany name:\nBilling address:\nTax or registration ID (if applicable):`} />
    <ConfirmDialog confirmHook="subscription-confirm" open={subscriptionAction !== null} onClose={() => setSubscriptionAction(null)} onConfirm={() => void updateSubscription()} title={subscriptionAction === 'cancel' ? 'Cancel subscription renewal?' : 'Resume subscription renewal?'} description={subscriptionAction === 'cancel' ? 'Benefits remain active until the current period ends. This action does not request a refund.' : 'The server will confirm whether renewal can be resumed for this subscription.'} confirmLabel={subscriptionAction === 'cancel' ? 'Cancel renewal' : 'Resume renewal'} danger={subscriptionAction === 'cancel'} busy={subscription.busy} />
    <ConfirmDialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} onConfirm={() => void removePayment()} title="Remove this payment record?" description="The record will move to deleted. This does not refund a payment or cancel a subscription." confirmLabel="Remove record" danger busy={deletion.busy} />
  </div>;
}

function Metric({ icon, label, value, detail }: { icon: string; label: string; value: string; detail: string }) {
  return <Card className="billing-metric"><span className="billing-metric-label"><Icon name={icon} size={18} />{label}</span><strong>{value}</strong><p>{detail}</p></Card>;
}

function PlanCapabilities({ plan, open, onToggle }: { plan: PricingPlan; open: boolean; onToggle: () => void }) {
  const features = [
    ['Advanced search', plan.advanced_search], ['CVE data', plan.cve],
    ['Buckets & files', plan.buckets], ['Leak data', plan.leak_data], ['Bulk data', plan.bulk_data],
    ['Private Scanner', plan.private_scanning],
  ] as const;
  return <details className="billing-plan-capabilities" open={open}><summary onClick={event => { event.preventDefault(); onToggle(); }} aria-expanded={open}>Plan details<Icon name="chevron-down" size={15} /></summary><dl>
    {features.filter(([, value]) => value !== undefined).map(([label, value]) => <div key={label}><dt>{label}</dt><dd><Icon name={value === true ? 'check' : 'close'} size={15} /><span>{value === true ? 'Included' : 'Not included'}</span></dd></div>)}
    {plan.search_filters && <div><dt>Search filters</dt><dd>{plan.search_filters}</dd></div>}
    {plan.support && <div><dt>Support</dt><dd className="billing-support-kind">{plan.support}</dd></div>}
  </dl></details>;
}
