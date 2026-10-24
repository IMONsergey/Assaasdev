import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Alert, Button, Dialog, Icon } from '../components/ui';
import { errorMessage, formatDate, number } from '../lib/format';
import { useApp } from './AppProvider';
import { compactCredits, creditUsage, type CreditUsage } from './credit-usage';
import './credits.css';

function UsageMeter({ usage, label }: { usage: CreditUsage; label: string }) {
  if (usage.fraction === null || usage.allocation === null || usage.available === null) {
    return <div className="credit-meter credit-meter--unknown" aria-hidden="true" />;
  }
  return <div className={`credit-meter${usage.low ? ' credit-meter--low' : ''}`} role="meter" aria-label={label}
    aria-valuemin={0} aria-valuemax={usage.allocation} aria-valuenow={Math.min(usage.available, usage.allocation)}
    aria-valuetext={`${number(usage.available)} available; ${number(usage.allocation)} included allocation`}>
    <span style={{ width: `${usage.fraction * 100}%` }} />
  </div>;
}

export function CreditBalance() {
  const { user, session, metadata, refreshSession } = useApp();
  const [open, setOpen] = useState(false), [refreshing, setRefreshing] = useState(false), [error, setError] = useState('');
  const dialogId = useId();
  const guest = session.status === 'guest';
  const unrestricted = !guest && metadata?.full_access === true;
  const search = creditUsage(guest ? user?.remaining_daily_searches : user?.credits, guest ? user?.daily_search_limit : user?.subscription?.credits);
  const scan = creditUsage(user?.scan_credits, user?.subscription?.scan_credits);
  const purchased = creditUsage(user?.purchased_credits, undefined).available;
  const available = search.available === null ? 'Balance unavailable' : `${number(search.available)} ${guest ? 'daily searches' : 'search credits'} available`;
  const teamMember = user?.team?.is_team_member === true || !!(user?.user_id && user.team?.team_owner_id && user.team.team_owner_id !== user.user_id);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true); setError('');
    try { await refreshSession(); } catch (cause) { setError(errorMessage(cause)); }
    finally { setRefreshing(false); }
  }

  return <>
    <button type="button" className={`credit-trigger${search.low && !unrestricted ? ' credit-trigger--low' : ''}`}
      aria-label={`View credits and usage. ${available}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? dialogId : undefined}
      title={`${available} · View usage`} onClick={() => setOpen(true)}>
      <span className="credit-trigger-line"><span className="credit-trigger-label">{guest ? 'Searches' : 'Credits'}</span>
        <strong className="credit-value-full">{number(search.available ?? undefined)}</strong>
        <strong className="credit-value-compact">{compactCredits(search.available)}</strong><Icon name="chevron-down" size={12} />
      </span>
      <span className={`credit-trigger-track${search.fraction === null ? ' credit-trigger-track--unknown' : ''}`} aria-hidden="true">
        {search.fraction !== null && <span style={{ width: `${search.fraction * 100}%` }} />}
      </span>
    </button>
    <Dialog open={open} onClose={() => setOpen(false)} title={guest ? 'Your daily searches' : 'Credits & usage'} className="credit-dialog"
      footer={<>{!guest && <Button variant="secondary" loading={refreshing} onClick={() => void refresh()}><Icon name="refresh" size={16} />Refresh balance</Button>}<Link className="button button--primary" to={guest ? '/auth/signup' : '/billing#billing-token-packs'} onClick={() => setOpen(false)}>{guest ? 'Create an account' : 'Plans & credit packs'}<Icon name="arrow" size={16} /></Link></>}>
      <div id={dialogId} className="credit-details stack">
        {error && <Alert tone="error" title="Balance could not be refreshed">{error}</Alert>}
        {teamMember && <p className="credit-context">Your team shares the owner’s credit balance.</p>}
        <div className={`credit-balance-grid${guest ? ' credit-balance-grid--guest' : ''}`}>
        <section className="credit-detail">
          <div className="credit-detail-heading"><h3>{guest ? 'Daily searches' : 'Search credits'}</h3><span className="credit-plan">{guest ? 'Guest' : user?.subscription?.type ?? 'Your plan'}</span></div>
          <p className="credit-detail-value">{number(search.available ?? undefined)}<span>{search.available === null ? 'Balance unavailable' : 'available'}</span></p>
          <UsageMeter usage={unrestricted ? { ...search, low: false } : search} label={guest ? 'Daily searches available' : 'Search credits relative to included allocation'} />
          <p className="credit-allocation">{search.allocation === null ? 'Allocation is currently unavailable.' : `${guest ? 'Daily allowance' : 'Included plan allocation'}: ${number(search.allocation)}`}</p>
          {unrestricted && <p className="credit-context">Unrestricted access is active. This balance is not limiting your current access.</p>}
          {!unrestricted && search.available === 0 && <p className="credit-warning">{guest ? 'Your daily allowance is used. Sign in to continue searching.' : 'No search credits remain. View plans and credit packs to continue.'}</p>}
          {!unrestricted && search.available !== null && search.available > 0 && search.low && <p className="credit-warning">You’re running low on {guest ? 'daily searches' : 'search credits'}.</p>}
        </section>
        {!guest &&
          <section className="credit-detail">
            <div className="credit-detail-heading"><h3>Private scan credits</h3><Icon name="scan" size={18} /></div>
            <p className="credit-detail-value">{number(scan.available ?? undefined)}<span>{scan.available === null ? 'Balance unavailable' : 'available'}</span></p>
            <UsageMeter usage={scan} label="Scan credits relative to included allocation" />
            <p className="credit-allocation">{scan.allocation === null ? 'Allocation is currently unavailable.' : `Included plan allocation: ${number(scan.allocation)}`}</p>
          </section>
        }
        </div>
        {!guest && <>
          <dl className="credit-facts">
            {purchased !== null && <div><dt>Purchased credits</dt><dd>{number(purchased)}</dd></div>}
            {!!user?.subscription?.expiry_date && <div><dt>Current period ends</dt><dd>{formatDate(user.subscription.expiry_date)}</dd></div>}
          </dl>
          <details className="credit-help"><summary>How credits work</summary><p>Searches, analytics and exports use search credits. Private scans use a separate balance.</p><p>The bars compare your balance with your included allocation. Extra credits can take it above that allocation.</p></details>
        </>}
        {guest && <p className="credit-cost-note">Searches and analytics share your daily allowance. Your remaining quota updates when a request completes.</p>}
      </div>
    </Dialog>
  </>;
}
