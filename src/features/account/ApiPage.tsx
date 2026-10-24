import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError, type Profile } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, PageHeader, Skeleton, Tabs, TabPanel, Icon } from '../../components/ui';
import { copyText, formatNumber, OperationNotice, responseData, useOperation } from './operation';
import { creditUsage } from '../../app/credit-usage';
import './account.css';

export function ApiPage() {
  const { api, session, user, refreshSession, toast } = useApp();
  const [revealed, setRevealed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const operation = useOperation();
  const [params, setParams] = useSearchParams();
  const section = params.get('section') === 'usage' ? 'usage' : 'key';
  const focusSection = useRef(false);
  useLayoutEffect(() => {
    if (!focusSection.current) return;
    focusSection.current = false;
    document.getElementById(`api-tab-${section}`)?.focus({ preventScroll: true });
  }, [section]);
  function selectSection(next: string, moveFocus = false) {
    focusSection.current = moveFocus;
    setParams(next === 'key' ? {} : { section: next }, { state: { preserveTabFocus: true } });
  }
  const usage = creditUsage(user?.credits, user?.subscription?.credits);
  const key = rotatedKey ?? user?.api_key;
  const canAccess = ['Plus', 'Expert', 'Business'].includes(user?.subscription?.type ?? '');

  async function checkKey() {
    setChecking(true); setCheckError('');
    try {
      const current = await api.http<Profile>('/whoami');
      setRotatedKey(current.api_key ?? null); setRevealed(false);
      await refreshSession(); operation.reset();
      toast('API key refreshed.', 'info');
    } catch (error) { setCheckError(error instanceof Error ? error.message : 'The key could not be checked.'); }
    finally { setChecking(false); }
  }
  async function rotate() {
    const result = await operation.run(async () => {
      const data = responseData(await api.request<{ api_key: string }>('regenerate_api_key', {}, { mutation: true }));
      if (typeof data.api_key !== 'string' || !data.api_key.trim()) throw new ApiError('unknown', 'The server did not return the new key. Load the current key before trying again.', { outcome: 'unknown' });
      return data.api_key;
    }, 'The new API key is ready. The previous key no longer works.');
    setConfirm(false);
    if (result.ok) { setRotatedKey(result.data); setRevealed(true); await refreshSession().catch(() => undefined); }
  }

  if (session.status === 'loading') return <Skeleton rows={3} label="Loading API access" />;
  if (session.status !== 'authenticated') return <EmptyState icon={<Icon name="code" size={28} />} title="API access" description="Sign in to manage your API key and account limits." actions={<Link className="button" to="/auth/login?returnTo=%2Fapi">Sign in</Link>} />;
  return <div className="api-page stack">
    <PageHeader title="API access" actions={<Badge tone={canAccess ? 'success' : 'neutral'}>{canAccess ? 'API enabled' : 'Plus and above'}</Badge>} />
    <Tabs idPrefix="api" ariaLabel="API sections" items={[{ id: 'key', label: 'API key', icon: 'key' }, { id: 'usage', label: 'Usage & limits', icon: 'chart' }]} value={section} onChange={selectSection} />
    <TabPanel idPrefix="api" value="key" hidden={section !== 'key'}>
      <div className="api-key-workspace">
        <Card className="api-key-card"><div className="api-card-heading"><span className="api-key-symbol"><Icon name="key" size={24} /></span><div><h2>Account API key</h2><p>One key for your integrations.</p></div></div>
          {canAccess ? <div className="stack"><OperationNotice state={operation.state} onCheck={() => void checkKey()} />{checkError && <Alert tone="error">{checkError}</Alert>}
            {key ? <><Field label="API key" value={key} type={revealed ? 'text' : 'password'} readOnly autoComplete="off" /><div className="cluster"><Button variant="secondary" onClick={() => setRevealed(!revealed)}><Icon name={revealed ? 'eye-off' : 'eye'} size={17} />{revealed ? 'Hide key' : 'Reveal key'}</Button><Button variant="secondary" onClick={() => void copyText(key, toast)}><Icon name="copy" size={17} />Copy key</Button></div></> : <EmptyState title="Key unavailable" description="Refresh your account to load the current key." actions={<Button loading={checking} onClick={() => void checkKey()}>Check account</Button>} />}
            <p className="api-key-note"><Icon name="lock" size={16} />Keep this key private. Requests use your account’s credits.</p>
            <div className="account-danger-zone"><div><h3>Rotate API key</h3><p className="muted">The previous key stops working immediately.</p></div><Button variant="secondary" onClick={() => setConfirm(true)} disabled={operation.blocked}><Icon name="refresh" size={16} />Rotate key</Button></div>
          </div> : <EmptyState icon={<Icon name="lock" size={26} />} title="Upgrade for API access" description="Available on Plus, Expert and Business plans." actions={<Link className="button" to="/billing?section=plans">Compare plans</Link>} />}
        </Card>
        <aside className="api-context"><h3>Your access</h3><dl className="account-facts"><div><dt>Plan</dt><dd>{user?.subscription?.type ?? '—'}</dd></div><div><dt>Search credits</dt><dd>{formatNumber(user?.credits)}</dd></div><div><dt>Search pages</dt><dd>{formatNumber(user?.subscription?.search_pages)}</dd></div></dl><Button variant="ghost" size="sm" onClick={() => selectSection('usage', true)}>View usage & limits<Icon name="arrow" size={16} /></Button></aside>
      </div>
    </TabPanel>
    <TabPanel idPrefix="api" value="usage" hidden={section !== 'usage'}>
      <div className="api-usage-grid">
        <Card><div className="api-usage-label"><Icon name="search" size={20} /><h2>Search credits</h2></div><div className="api-usage-value">{formatNumber(user?.credits)}<span>available</span></div>{usage.fraction !== null && <div className="api-usage-meter" role="meter" aria-label="Available search credits" aria-valuemin={0} aria-valuemax={usage.allocation ?? undefined} aria-valuenow={Math.min(usage.available ?? 0, usage.allocation ?? 0)}><span style={{ width: `${usage.fraction * 100}%` }} /></div>}<p className="muted">{formatNumber(user?.subscription?.credits)} included in your plan</p></Card>
        <Card><div className="api-usage-label"><Icon name="scan" size={20} /><h2>Scan credits</h2></div><div className="api-usage-value">{formatNumber(user?.scan_credits)}<span>available</span></div><p className="muted">For private scans</p></Card>
      </div>
      <Card className="api-limits"><h2>Account limits</h2><dl className="account-facts"><div><dt>Subscription</dt><dd>{user?.subscription?.type ?? '—'}</dd></div><div><dt>Search pages per query</dt><dd>{formatNumber(user?.subscription?.search_pages)}</dd></div><div><dt>Purchased credits</dt><dd>{formatNumber(user?.purchased_credits)}</dd></div><div><dt>API access</dt><dd>{canAccess ? 'Enabled' : 'Unavailable'}</dd></div></dl><Link className="button button--secondary" to="/billing">Manage billing<Icon name="arrow-up-right" size={16} /></Link></Card>
    </TabPanel>
    <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void rotate()} title="Replace your API key?" description="Your current key will stop working immediately. Update each integration with the new key." confirmLabel="Rotate API key" danger busy={operation.busy} />
  </div>;
}
