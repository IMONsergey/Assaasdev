import { useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ApiError, type Profile } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, PageHeader, Skeleton, Tabs, TabPanel, Icon } from '../../components/ui';
import { copyText, formatNumber, OperationNotice, responseData, useOperation } from './operation';
import { creditUsage } from '../../app/credit-usage';
import { ApiDocumentation } from './ApiDocumentation';
import './account.css';

function UsageMetric({ title, icon, available, allocation }: { title: string; icon: string; available: number | undefined; allocation: number | undefined }) {
  const usage = creditUsage(available, allocation);
  return <Card className="api-usage-card"><div className="api-usage-label"><span><Icon name={icon} size={20} /></span><h2>{title}</h2></div><div className="api-usage-value">{formatNumber(available)}<span>available</span></div><div className="api-usage-chart">{usage.fraction !== null ? <div className="api-usage-meter" role="meter" aria-label={`Available ${title.toLowerCase()}`} aria-valuemin={0} aria-valuemax={usage.allocation ?? undefined} aria-valuenow={Math.min(usage.available ?? 0,usage.allocation ?? 0)} aria-valuetext={`${formatNumber(available)} available; ${formatNumber(allocation)} included in plan`}><span style={{width:`${usage.fraction*100}%`}} /></div> : <div className="api-usage-no-meter" aria-hidden="true" />}<p className="muted">{allocation === undefined ? 'Plan allocation not provided' : `${formatNumber(allocation)} included in your plan`}</p></div></Card>;
}

export function ApiPage() {
  const { api, session, user, refreshSession, toast } = useApp();
  const [revealed, setRevealed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const checkingKey = useRef(false);
  const [checkError, setCheckError] = useState('');
  const operation = useOperation();
  const [params, setParams] = useSearchParams();
  const section = params.get('section') === 'docs' ? 'docs' : params.get('section') === 'usage' ? 'usage' : 'key';
  const focusSection = useRef(false);
  const previousSection = useRef(section);
  useLayoutEffect(() => {
    const changed = previousSection.current !== section;
    previousSection.current = section;
    if (!focusSection.current && !changed) return;
    focusSection.current = false;
    document.getElementById(`api-tab-${section}`)?.focus({ preventScroll: true });
  }, [section]);
  function selectSection(next: string, moveFocus = false) {
    focusSection.current = moveFocus;
    setParams(next === 'key' ? {} : { section: next }, { state: { preserveTabFocus: true } });
  }
  const key = rotatedKey ?? user?.api_key;
  const plan = user?.subscription?.type;
  const reportedAccess = typeof user?.subscription?.api_access === 'boolean' ? user.subscription.api_access : undefined;
  const includedInPlan = ['Plus', 'Expert', 'Business'].includes(plan ?? '');
  const canAccess = reportedAccess ?? includedInPlan;
  const accessKnown = reportedAccess !== undefined || includedInPlan || plan === 'Free';
  const accessLabel = reportedAccess === true ? 'Enabled' : reportedAccess === false ? 'Unavailable' : includedInPlan ? 'Included in plan' : plan === 'Free' ? 'Unavailable' : 'Not confirmed';

  async function checkKey() {
    if (checkingKey.current || operation.busy) return;
    checkingKey.current = true;
    setChecking(true); setCheckError('');
    try {
      const current = await api.http<Profile>('/whoami');
      setRotatedKey(current.api_key ?? null); setRevealed(false);
      await refreshSession(); operation.reset();
      toast(current.api_key && current.subscription?.api_access !== false ? 'API key refreshed.' : 'Account access refreshed.', 'info');
    } catch (error) { setCheckError(error instanceof Error ? error.message : 'The key could not be checked.'); }
    finally { checkingKey.current = false; setChecking(false); }
  }
  async function rotate() {
    if (checkingKey.current) return;
    const result = await operation.run(async () => {
      const data = responseData(await api.request<{ api_key: string }>('regenerate_api_key', {}, { mutation: true }));
      if (typeof data.api_key !== 'string' || !data.api_key.trim()) throw new ApiError('unknown', 'The server did not return the new key. Load the current key before trying again.', { outcome: 'unknown' });
      return data.api_key;
    }, 'The new API key is ready. The previous key no longer works.');
    setConfirm(false);
    if (result.ok) { setRotatedKey(result.data); setRevealed(true); await refreshSession().catch(() => undefined); }
  }

  const accessPrompt = session.status === 'loading' ? <Skeleton rows={3} label="Loading API access" /> : session.status !== 'authenticated' ? <EmptyState icon={<Icon name="code" size={28} />} title="Manage your API access" description="Sign in to manage your key and account limits. Documentation is available without an account." actions={<><Link className="button" to={`/auth/login?returnTo=${encodeURIComponent(`/api?section=${section}`)}`}>Sign in</Link><Button variant="secondary" onClick={() => selectSection('docs', true)}>Read documentation</Button></>} /> : null;
  return <div className="api-page stack">
    <PageHeader title="API access" actions={<Badge tone={canAccess ? 'success' : 'neutral'}>{session.status === 'loading' ? 'Checking access' : session.status !== 'authenticated' ? 'Plus and above' : reportedAccess === true ? 'API enabled' : includedInPlan && reportedAccess === undefined ? 'Included in plan' : accessKnown ? 'API unavailable' : 'Access not confirmed'}</Badge>} />
    <Tabs idPrefix="api" ariaLabel="API sections" items={[{ id: 'key', label: 'API key', icon: 'key' }, { id: 'usage', label: 'Usage & limits', icon: 'chart' }, { id: 'docs', label: 'Documentation', icon: 'file' }]} value={section} onChange={selectSection} />
    <TabPanel idPrefix="api" value="key" hidden={section !== 'key'}>
      {accessPrompt ?? <>
      <div className="api-key-workspace">
        <Card className="api-key-card"><div className="api-card-heading"><span className="api-key-symbol"><Icon name="key" size={24} /></span><div><h2>Account API key</h2><p>One key for your integrations.</p></div></div>
          {canAccess ? <div className="stack"><OperationNotice state={operation.state} onCheck={() => void checkKey()} />{checkError && <Alert tone="error">{checkError}</Alert>}
            {key ? <><Field label="API key" value={key} type={revealed ? 'text' : 'password'} readOnly autoComplete="off" /><div className="cluster"><Button variant="secondary" onClick={() => setRevealed(!revealed)}><Icon name={revealed ? 'eye-off' : 'eye'} size={17} />{revealed ? 'Hide key' : 'Reveal key'}</Button><Button variant="secondary" onClick={() => void copyText(key, toast)}><Icon name="copy" size={17} />Copy key</Button></div></> : <EmptyState title="Key unavailable" description="Refresh your account to load the current key." actions={<Button loading={checking} onClick={() => void checkKey()}>Check account</Button>} />}
            <p className="api-key-note"><Icon name="lock" size={16} />Keep this key private. Requests use your account’s credits.</p>
            <div className="account-danger-zone"><div><h3>Rotate API key</h3><p className="muted">The previous key stops working immediately.</p></div><Button variant="secondary" onClick={() => setConfirm(true)} disabled={operation.blocked || checking}><Icon name="refresh" size={16} />Rotate key</Button></div>
          </div> : <><EmptyState icon={<Icon name="lock" size={26} />} title={!accessKnown ? 'API access is not confirmed' : includedInPlan ? 'API access is unavailable' : 'Upgrade for API access'} description={!accessKnown || includedInPlan ? 'Refresh your account to check your current access.' : 'Available on Plus, Expert and Business plans.'} actions={!accessKnown || includedInPlan ? <Button loading={checking} onClick={() => void checkKey()}>Check account</Button> : <Link className="button" to="/billing?section=plans">Compare plans</Link>} />{checkError && <Alert tone="error">{checkError}</Alert>}</>}
        </Card>
        <aside className="api-context"><h3>Your access</h3><dl className="account-facts"><div><dt>Plan</dt><dd>{user?.subscription?.type ?? '—'}</dd></div><div><dt>Search credits</dt><dd>{formatNumber(user?.credits)}</dd></div><div><dt>Search pages</dt><dd>{formatNumber(user?.subscription?.search_pages)}</dd></div></dl><Button variant="ghost" size="sm" onClick={() => selectSection('usage', true)}>View usage & limits<Icon name="arrow" size={16} /></Button></aside>
      </div>
      </>}
    </TabPanel>
    <TabPanel idPrefix="api" value="usage" hidden={section !== 'usage'}>
      {accessPrompt ?? <>
      <div className="api-usage-grid">
        <UsageMetric title="Search credits" icon="search" available={user?.credits} allocation={user?.subscription?.credits} />
        <UsageMetric title="Scan credits" icon="scan" available={user?.scan_credits} allocation={user?.subscription?.scan_credits} />
      </div>
      <Card className="api-limits"><div className="api-limits-heading"><div><h2>Account limits</h2><p>Balances are shared with your account. <Link className="inline-link" to="/api?section=docs#limits" state={{ preserveTabFocus: true }}>View API rate limits</Link>.</p></div><Link className="button button--secondary" to="/billing">Manage billing<Icon name="arrow-up-right" size={16} /></Link></div><dl className="account-facts"><div><dt><Icon name="card" size={17} />Subscription</dt><dd>{user?.subscription?.type ?? '—'}</dd></div><div><dt><Icon name="list" size={17} />Search pages per query</dt><dd>{formatNumber(user?.subscription?.search_pages)}</dd></div><div><dt><Icon name="plus" size={17} />Purchased credits</dt><dd>{formatNumber(user?.purchased_credits)}</dd></div><div><dt><Icon name="code" size={17} />API access</dt><dd><Badge tone={canAccess ? 'success' : 'neutral'}>{accessLabel}</Badge></dd></div></dl></Card>
      </>}
    </TabPanel>
    <TabPanel idPrefix="api" value="docs" hidden={section !== 'docs'}>{section === 'docs' && <ApiDocumentation />}</TabPanel>
    <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void rotate()} title="Replace your API key?" description="Your current key will stop working immediately. Update each integration with the new key." confirmLabel="Rotate API key" danger busy={operation.busy} />
  </div>;
}
