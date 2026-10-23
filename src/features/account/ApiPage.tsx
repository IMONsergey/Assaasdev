import { useState } from 'react';
import { Link } from 'react-router';
import { ApiError, type Profile } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, PageHeader, Spinner } from '../../components/ui';
import { copyText, formatNumber, OperationNotice, responseData, useOperation } from './operation';
import './account.css';

export function ApiPage() {
  const { api, session, user, refreshSession, toast } = useApp();
  const [revealed, setRevealed] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [rotatedKey, setRotatedKey] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const operation = useOperation();
  const key = rotatedKey ?? user?.api_key;
  const canAccess = ['Plus', 'Expert', 'Business'].includes(user?.subscription?.type ?? '');

  async function checkKey() {
    setChecking(true); setCheckError('');
    try {
      const current = await api.http<Profile>('/whoami');
      setRotatedKey(current.api_key ?? null); setRevealed(false);
      await refreshSession(); operation.reset();
      toast('The current API key has been loaded from your account.', 'info');
    } catch (error) { setCheckError(error instanceof Error ? error.message : 'The key could not be checked.'); }
    finally { setChecking(false); }
  }
  async function rotate() {
    const result = await operation.run(async () => {
      const data = responseData(await api.request<{ api_key: string }>('regenerate_api_key', {}, { mutation: true }));
      if (!data.api_key) throw new ApiError('unknown', 'The server did not return the new key. Load the current key before trying again.', { outcome: 'unknown' });
      return data.api_key;
    }, 'The new API key is ready. The previous key no longer works.');
    setConfirm(false);
    if (result.ok) { setRotatedKey(result.data); setRevealed(true); await refreshSession().catch(() => undefined); }
  }

  if (session.status === 'loading') return <Spinner label="Loading API access…" />;
  if (session.status !== 'authenticated') return <EmptyState title="Bring APCOSYS into your workflow." description="Sign in to manage your public API key and credits." actions={<Link className="inline-link" to="/auth/login?returnTo=%2Fapi">Sign in →</Link>} />;
  return <div className="account-page stack"><PageHeader eyebrow="API" title="Research, connected." description="Use your account’s API access in your own tools and workflows." /><div className="account-columns"><div className="stack"><Card><div className="cluster account-card-heading"><h2 className="section-title">Your API key</h2><Badge tone={canAccess ? 'accent' : 'neutral'}>{canAccess ? 'Available' : 'Plus and above'}</Badge></div>
    {canAccess ? <div className="stack"><p className="muted">Keep this key private. It authorizes access on your account and uses your available credits.</p><OperationNotice state={operation.state} onCheck={() => void checkKey()} />{checkError && <Alert tone="error">{checkError}</Alert>}{key ? <><Field label="API key" value={key} type={revealed ? 'text' : 'password'} readOnly autoComplete="off" /><div className="cluster"><Button variant="secondary" onClick={() => setRevealed(!revealed)}>{revealed ? 'Hide key' : 'Reveal key'}</Button><Button variant="secondary" onClick={() => void copyText(key, toast)}>Copy key</Button></div></> : <Alert tone="warning" actions={<Button loading={checking} onClick={() => void checkKey()}>Check account</Button>}>No API key was returned for this account.</Alert>}<div className="account-danger-zone"><div><h3>Rotate API key</h3><p className="muted">The previous key stops working immediately. Update every integration using it.</p></div><Button variant="secondary" onClick={() => setConfirm(true)} disabled={operation.blocked}>Rotate key</Button></div></div> : <Alert tone="info" actions={<Link className="inline-link" to="/billing">Compare plans →</Link>}>API key management is available on Plus, Expert and Business plans.</Alert>}
    </Card><Card><h2 className="section-title">A single, current key</h2><p className="muted">Use the public API documentation supplied with your APCOSYS integration. Your browser session and public API key are separate credentials.</p><p className="muted">If a rotation result is interrupted, load the current key before requesting another rotation.</p></Card></div><Card><h2 className="section-title">Account usage</h2><dl className="account-facts"><div><dt>Plan</dt><dd>{user?.subscription?.type ?? '—'}</dd></div><div><dt>Search credits</dt><dd>{formatNumber(user?.credits)}</dd></div><div><dt>Scan credits</dt><dd>{formatNumber(user?.scan_credits)}</dd></div><div><dt>Purchased credits</dt><dd>{formatNumber(user?.purchased_credits)}</dd></div><div><dt>Search pages</dt><dd>{formatNumber(user?.subscription?.search_pages)}</dd></div></dl><Link className="inline-link" to="/billing">Manage subscription →</Link></Card></div><ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => void rotate()} title="Replace your API key?" description="Your current key will stop working immediately. Any integrations using it will need the new key." confirmLabel="Rotate API key" danger busy={operation.busy} /></div>;
}
