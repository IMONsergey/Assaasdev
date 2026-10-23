import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type Profile, type SessionData, type SessionRecord, type TOTPEnrollmentData, type TOTPValidationData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, PageHeader, Spinner, Tabs } from '../../components/ui';
import { copyText, formatDate, formatNumber, OperationNotice, responseData, useOperation } from './operation';
import './account.css';

const accountTabs = [{ id: 'profile', label: 'Profile' }, { id: 'security', label: 'Security' }, { id: 'sessions', label: 'Sessions' }, { id: 'team', label: 'Organization' }];

export function AccountPage() {
  const { session, user } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const tab = accountTabs.find((item) => location.pathname.endsWith('/' + item.id))?.id ?? 'profile';
  if (session.status === 'loading') return <Spinner label="Loading your account…" />;
  if (session.status !== 'authenticated' || !user) return <EmptyState title="Your account, in one place." description="Sign in to manage your profile, security, sessions and organization." actions={<Link className="inline-link" to="/auth/login?returnTo=%2Faccount">Sign in →</Link>} />;
  return <div className="account-page stack">
    <PageHeader eyebrow="ACCOUNT" title="Made for your work." description="Your profile, security and access. Always under your control." />
    <Tabs items={accountTabs} value={tab} onChange={(id) => navigate(id === 'profile' ? '/account' : '/account/' + id)} />
    {tab === 'profile' && <ProfilePanel user={user} />}
    {tab === 'security' && <SecurityPanel user={user} />}
    {tab === 'sessions' && <SessionsPanel />}
    {tab === 'team' && <TeamPanel user={user} />}
  </div>;
}

function ProfilePanel({ user }: { user: Profile }) {
  const { api, refreshSession, preferences, setPreferences } = useApp();
  const update = useOperation();
  const verify = useOperation();
  const [pending, setPending] = useState(false);
  const [until, setUntil] = useState<number | null>(null);
  const [verifyCode, setVerifyCode] = useState('');

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await update.run(() => api.http('/profile/update', { method: 'POST', mutation: true, body: { email: String(form.get('email')).trim(), user_name: String(form.get('user_name')).trim(), password: String(form.get('password')), ...(user.totp_active ? { totp_code: String(form.get('totp_code')).trim() } : {}) } }), 'A verification code has been sent. Verify it to apply your changes.');
    if (result.ok) { setPending(true); setUntil(Date.now() + 15 * 60_000); }
  }
  async function confirmProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await verify.run(() => api.http('/profile/verify', { method: 'POST', mutation: true, body: { code: verifyCode.trim() } }), 'Your profile changes have been verified.');
    if (result.ok) { setPending(false); setVerifyCode(''); update.reset(); await refreshSession().catch(() => undefined); }
  }

  return <div className="account-columns">
    <div className="stack">
      <Card className="account-identity"><div className="account-avatar" aria-hidden="true">{(user.user_name || user.email || 'A').slice(0, 2).toUpperCase()}</div><div><h2>{user.user_name || 'Your account'}</h2><p className="muted">{user.email || 'No email linked'}</p><Badge tone="accent">{user.subscription?.type ?? 'Account'}</Badge></div></Card>
      <Card><h2 className="section-title">Profile details</h2><p className="muted">Changes are applied after email verification. The code expires after 15 minutes.</p><OperationNotice state={update.state} />
        <form key={(user.email ?? '') + (user.user_name ?? '')} className="stack" onSubmit={(event) => void saveProfile(event)}>
          <Field label="Username" name="user_name" defaultValue={user.user_name} required autoComplete="username" />
          <Field label="Email address" type="email" name="email" defaultValue={user.email} required autoComplete="email" />
          <Field label={user.email ? 'Current password' : 'Create a password'} type="password" name="password" required minLength={6} autoComplete={user.email ? 'current-password' : 'new-password'} hint={user.email ? 'Required to authorize this change.' : 'Use at least 6 characters to add an email to this account.'} />
          {user.totp_active && <Field label="Authenticator code" name="totp_code" autoComplete="one-time-code" inputMode="numeric" required minLength={6} maxLength={6} />}
          <div className="form-actions"><Button type="submit" loading={update.busy} disabled={update.blocked}>Request profile change</Button></div>
        </form>
        {(pending || update.state.status === 'unknown') && <form className="account-verification stack" onSubmit={(event) => void confirmProfile(event)}><h3>Verify your changes</h3><p className="muted">{until ? `The verification window ends at approximately ${new Date(until).toLocaleTimeString()}.` : 'If a verification code arrived, you can confirm it here.'}</p><OperationNotice state={verify.state} /><Field label="Email verification code" value={verifyCode} onChange={(event) => setVerifyCode(event.target.value)} autoComplete="one-time-code" required minLength={6} maxLength={6} /><Button type="submit" loading={verify.busy} disabled={verify.blocked}>Verify changes</Button></form>}
      </Card>
    </div>
    <div className="stack">
      <Card><h2 className="section-title">Your access</h2><dl className="account-facts"><div><dt>Current plan</dt><dd>{user.subscription?.type ?? '—'}</dd></div><div><dt>Search credits</dt><dd>{formatNumber(user.credits)}</dd></div><div><dt>Scan credits</dt><dd>{formatNumber(user.scan_credits)}</dd></div><div><dt>User ID</dt><dd className="mono account-break">{user.user_id ?? '—'}</dd></div></dl><Link to="/billing" className="inline-link">View subscription →</Link></Card>
      <Card><h2 className="section-title">Make it yours</h2><div className="stack"><label className="account-select-label">Appearance<select value={preferences.theme} onChange={(event) => setPreferences({ theme: event.target.value as 'light' | 'dark' | 'system' })}><option value="system">Use device setting</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label className="account-select-label">Information density<select value={preferences.density} onChange={(event) => setPreferences({ density: event.target.value as 'comfortable' | 'compact' })}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label></div></Card>
    </div>
  </div>;
}

function SecurityPanel({ user }: { user: Profile }) {
  const { api, refreshSession, toast, mode } = useApp();
  const password = useOperation();
  const enrollment = useOperation();
  const validation = useOperation();
  const [details, setDetails] = useState<TOTPEnrollmentData | null>(null);
  const [qr, setQr] = useState('');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [notice, setNotice] = useState('');
  const [checkingFactor, setCheckingFactor] = useState(false);
  const [factorNotice, setFactorNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setQr('');
    if (details?.qr_code_url.startsWith('otpauth://')) {
      void import('qrcode').then((module) => module.toDataURL(details.qr_code_url, { width: 192, margin: 2, color: { dark: '#121314', light: '#ffffff' } })).then((image) => { if (!cancelled) setQr(image); }).catch(() => { if (!cancelled) setFactorNotice('The QR image could not be rendered. Enter the setup key manually in your authenticator.'); });
    }
    return () => { cancelled = true; };
  }, [details]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formNode = event.currentTarget;
    const form = new FormData(formNode);
    if (form.get('new_password') !== form.get('confirm_password')) { setNotice('The new passwords do not match.'); return; }
    setNotice('');
    const result = await password.run(() => api.http('/auth/password-reset', { method: 'POST', mutation: true, body: { old_password: String(form.get('old_password')), new_password: String(form.get('new_password')) } }), 'Your password has been updated.');
    if (result.ok) formNode.reset();
  }

  async function beginEnrollment() {
    const result = await enrollment.run(async () => {
      const data = responseData(await api.request<TOTPEnrollmentData>('totp', {}, { mutation: true }));
      if (!data.secret_key || !data.qr_code_url?.startsWith('otpauth://')) throw new ApiError('unknown', 'The setup response was incomplete. Check your account before starting again.', { outcome: 'unknown' });
      return data;
    }, 'Setup started. Confirm a code within 15 minutes.');
    if (result.ok) { setDetails(result.data); setExpiresAt(Date.now() + 900_000); setCodes(null); }
  }

  async function validateEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await validation.run(async () => {
      const data = responseData(await api.request<TOTPValidationData>('totp_validate', { totp_code: String(form.get('totp_code')).trim() }, { mutation: true }));
      if (data.is_valid !== true) throw new Error('The authenticator code was not accepted.');
      return data;
    }, 'Two-factor authentication is enabled. Save your backup codes securely.');
    if (result.ok) {
      setCodes(result.data.backup_codes ?? []); setDetails(null); setQr(''); setExpiresAt(null);
      // Keep one-time backup codes mounted even if the next account read fails.
      // Refresh the profile only after the user has saved them.
    }
  }

  const factorEnabled = user.totp_active || validation.state.status === 'success';

  async function checkFactor() {
    setCheckingFactor(true);
    try {
      const current = await api.http<Profile>('/whoami');
      await refreshSession();
      if (typeof current.totp_active !== 'boolean') throw new Error('The account response did not confirm the two-factor setting.');
      enrollment.reset(); validation.reset(); setDetails(null); setQr(''); setExpiresAt(null);
      setFactorNotice(current.totp_active ? 'Your account confirms that two-factor authentication is enabled. Backup codes cannot be retrieved again from this page.' : 'Your account confirms that two-factor authentication is not enabled. You can start a new setup.');
    } catch (error) { setFactorNotice(error instanceof Error ? error.message : 'Two-factor status could not be checked.'); }
    finally { setCheckingFactor(false); }
  }

  return <div className="account-columns">
    <Card><h2 className="section-title">Password</h2><p className="muted">Use a unique password that you do not use anywhere else.</p>{notice && <Alert tone="warning">{notice}</Alert>}<OperationNotice state={password.state} />
      <form className="stack" onSubmit={(event) => void changePassword(event)}><Field label="Current password" name="old_password" type="password" autoComplete="current-password" minLength={6} required /><Field label="New password" name="new_password" type="password" autoComplete="new-password" minLength={6} required hint="At least 6 characters. A longer passphrase is recommended." /><Field label="Confirm new password" name="confirm_password" type="password" autoComplete="new-password" minLength={6} required /><div className="form-actions"><Button type="submit" loading={password.busy} disabled={password.blocked}>Update password</Button></div></form>
      {password.state.status === 'unknown' && <p className="muted">The password may have changed. Verify sign-in with the new password before requesting another change.</p>}
    </Card>
    <div className="stack"><Card><div className="cluster account-card-heading"><h2 className="section-title">Two-factor authentication</h2><Badge tone={factorEnabled ? 'success' : 'neutral'}>{factorEnabled ? 'Enabled' : 'Not enabled'}</Badge></div><p className="muted">An authenticator adds a second check when you sign in.</p>{factorNotice && <Alert tone="info">{factorNotice}</Alert>}<OperationNotice state={enrollment.state} onCheck={() => void checkFactor()} /><OperationNotice state={validation.state} onCheck={() => void checkFactor()} />{checkingFactor && <Spinner label="Checking two-factor status…" />}
      {!factorEnabled && !details && !codes && <Button variant="secondary" loading={enrollment.busy} disabled={enrollment.blocked} onClick={() => void beginEnrollment()}>Set up authenticator</Button>}
      {details && <div className="stack account-totp-setup"><p>Scan this code with your authenticator app, or enter the setup key manually.</p>{qr && <img src={qr} width="192" height="192" className="account-qr" alt="Authenticator enrollment QR code" />}<Field label="Setup key" type={showSecret ? 'text' : 'password'} value={details.secret_key} readOnly /><div className="cluster"><Button size="sm" variant="ghost" onClick={() => setShowSecret(!showSecret)}>{showSecret ? 'Hide' : 'Reveal'} key</Button><Button size="sm" variant="ghost" onClick={() => void copyText(details.secret_key, toast)}>Copy key</Button></div><p className="muted">{expiresAt ? `The 15-minute setup window ends at approximately ${new Date(expiresAt).toLocaleTimeString()}.` : ''} Keep this key private.</p><form className="stack" onSubmit={(event) => void validateEnrollment(event)}><Field label="Authenticator code" name="totp_code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} required /><Button type="submit" loading={validation.busy} disabled={validation.blocked}>Enable two-factor authentication</Button></form><Button variant="ghost" disabled={validation.busy || validation.blocked || enrollment.busy} onClick={() => { validation.reset(); setShowSecret(false); void beginEnrollment(); }}>Start a fresh setup</Button></div>}
      {codes && (codes.length === 5 ? <div className="stack account-backup"><h3>Keep these somewhere safe.</h3><p className="muted">Five backup codes. Each can be used once. They are shown here only during this setup.</p><div className="account-backup-grid">{codes.map((code) => <code key={code}>{code}</code>)}</div><Button variant="secondary" onClick={() => void copyText(codes.join('\n'), toast)}>Copy backup codes</Button><Button variant="ghost" onClick={() => { setCodes(null); void refreshSession().catch(() => undefined); }}>I have saved my codes</Button></div> : <Alert tone="warning">Two-factor authentication was enabled, but all five backup codes were not returned. Keep your authenticator accessible and contact support before signing out.</Alert>)}
    </Card><Card><h2 className="section-title">Connected sign-in</h2><p className="muted">Attach an external sign-in method to this account.</p><div className="cluster"><Button variant="secondary" disabled={mode === 'demo'} onClick={() => window.location.assign(api.url('/google/link'))}>Link Google</Button><Button variant="secondary" disabled={mode === 'demo'} onClick={() => window.location.assign(api.url('/telegram/link'))}>Link Telegram</Button></div>{mode === 'demo' && <p className="muted">External sign-in providers are unavailable in the demonstration environment.</p>}{user.telegram_account && <p className="muted">A Telegram account is linked.</p>}</Card></div>
  </div>;
}

function SessionsPanel() {
  const { api, user } = useApp();
  const queryClient = useQueryClient();
  const operation = useOperation();
  const [target, setTarget] = useState<SessionRecord | 'others' | null>(null);
  const sessions = useQuery({ queryKey: ['account-sessions', user?.user_id], queryFn: async ({ signal }) => responseData(await api.request<SessionData>('user_sessions', {}, { signal, mutation: false })) });
  async function reconcile() { const result = await sessions.refetch(); if (result.isSuccess) operation.reset(); }
  async function terminate() {
    if (!target) return;
    const currentTarget = target;
    const result = await operation.run(async () => {
      const data = responseData(await api.request<{ success: boolean }>(currentTarget === 'others' ? 'terminate_all_sessions' : 'terminate_user_session', currentTarget === 'others' ? {} : { session_id: currentTarget.session_id }, { mutation: true }));
      if (data.success !== true) throw new ApiError('unknown', 'The server did not confirm session termination.', { outcome: 'unknown' });
      return data;
    }, currentTarget === 'others' ? 'Other sessions have been ended.' : 'The selected session has been ended.');
    setTarget(null);
    if (result.ok) await queryClient.invalidateQueries({ queryKey: ['account-sessions'] });
  }
  return <div className="stack"><Card><div className="account-card-heading cluster"><div><h2 className="section-title">Active sessions</h2><p className="muted">{sessions.data ? `${sessions.data.total} of ${sessions.data.limit} sessions in use` : 'Review where your account is signed in.'}</p></div><Button variant="secondary" onClick={() => setTarget('others')} disabled={operation.blocked || !sessions.data?.sessions.some((item) => !item.is_current)}>End other sessions</Button></div><OperationNotice state={operation.state} onCheck={() => void reconcile()} />
      {sessions.isPending ? <Spinner label="Loading sessions…" /> : sessions.isError ? <Alert tone="error" actions={<Button onClick={() => void sessions.refetch()}>Try again</Button>}>{sessions.error.message}</Alert> : sessions.data.sessions.length === 0 ? <EmptyState title="No sessions returned" description="Refresh to check the latest session state." actions={<Button onClick={() => void sessions.refetch()}>Refresh</Button>} /> : <div className="account-session-list">{sessions.data.sessions.map((item) => <article key={item.session_id} className="account-session"><div className="account-session-symbol" aria-hidden="true">▣</div><div className="account-session-body"><div className="cluster"><h3>{item.device_info || item.browser || 'Device'}</h3>{item.is_current && <Badge tone="accent">This session</Badge>}</div><p className="muted">{[item.browser, item.os, item.location].filter(Boolean).join(' · ') || 'Device details unavailable'}</p><p className="mono muted">{item.ip_address ?? 'IP unavailable'}</p><p className="muted">Last active {formatDate(item.last_activity)}</p></div><Button variant="ghost" size="sm" disabled={item.is_current || operation.blocked} onClick={() => setTarget(item)}>{item.is_current ? 'Current' : 'End session'}</Button></article>)}</div>}
    </Card><Alert tone="info">Ending other sessions keeps this one active. Signing out of APCOSYS ends every session, including this one.</Alert><ConfirmDialog open={target !== null} onClose={() => setTarget(null)} onConfirm={() => void terminate()} title={target === 'others' ? 'End all other sessions?' : 'End this session?'} description={target === 'others' ? 'Other devices will need to sign in again. This session will stay active.' : 'The selected device will need to sign in again.'} confirmLabel="End session" danger busy={operation.busy} /></div>;
}

function TeamPanel({ user }: { user: Profile }) {
  const { api, refreshSession } = useApp();
  const operation = useOperation();
  const [memberId, setMemberId] = useState('');
  const [target, setTarget] = useState<{ id: string; name: string } | 'leave' | null>(null);
  const isMember = user.team?.is_team_member === true;
  const isBusiness = user.subscription?.type === 'Business';
  const canManage = isBusiness && !isMember && (!user.team?.team_owner_id || user.team.team_owner_id === user.user_id);
  const members = user.team?.team_members ?? [];
  async function reconcile() { try { await api.http('/whoami'); await refreshSession(); operation.reset(); } catch { /* Keep uncertain state until a real read succeeds. */ } }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await operation.run(async () => responseData(await api.request<{ message: string }>('org_add', { user_id: memberId.trim() }, { mutation: true })), 'The member has been added.');
    if (result.ok) { setMemberId(''); await refreshSession().catch(() => undefined); }
  }
  async function remove() {
    if (!target) return;
    const leaving = target === 'leave';
    const result = await operation.run(async () => responseData(await api.request<{ message: string }>(leaving ? 'org_leave' : 'org_remove', leaving ? {} : { user_id: target.id }, { mutation: true })), leaving ? 'You have left the organization.' : 'The member has been removed.');
    setTarget(null);
    if (result.ok) await refreshSession().catch(() => undefined);
  }
  return <div className="stack"><Card><div className="account-card-heading cluster"><div><h2 className="section-title">Organization</h2><p className="muted">Share the account owner’s plan and credit balance with existing APCOSYS users.</p></div><Badge tone="accent">{isMember ? 'Member' : canManage ? 'Owner access' : 'Organization access'}</Badge></div><OperationNotice state={operation.state} onCheck={() => void reconcile()} />
      {user.team?.team_owner_name && <p>Owner: <strong>{user.team.team_owner_name}</strong>{user.team.team_owner_email ? ` · ${user.team.team_owner_email}` : ''}</p>}
      {canManage ? <><form className="account-member-form" onSubmit={(event) => void add(event)}><Field label="Member user ID" value={memberId} onChange={(event) => setMemberId(event.target.value)} required hint="Enter an existing APCOSYS user ID. This does not send an email invitation." /><Button type="submit" loading={operation.busy} disabled={operation.blocked || !memberId.trim()}>Add member</Button></form>{members.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Member</th><th>Added</th><th><span className="muted">Action</span></th></tr></thead><tbody>{members.map((member) => <tr key={member.user_id}><td><strong>{member.user_name || member.user_id}</strong><div className="muted">{member.email || 'No email'}</div></td><td>{formatDate(member.added_at)}</td><td><Button variant="ghost" size="sm" disabled={operation.blocked} onClick={() => setTarget({ id: member.user_id, name: member.user_name || member.user_id })}>Remove</Button></td></tr>)}</tbody></table></div> : <EmptyState title="Your team starts here." description="Add an existing user by their APCOSYS user ID." />}</> : isMember ? <><p className="muted">The owner manages membership. You can leave the organization at any time.</p><Button variant="secondary" disabled={operation.blocked} onClick={() => setTarget('leave')}>Leave organization</Button></> : <Alert tone="info" actions={<Link className="inline-link" to="/billing">View plans →</Link>}>Organization membership is managed by a Business account owner.</Alert>}
    </Card><ConfirmDialog open={target !== null} onClose={() => setTarget(null)} onConfirm={() => void remove()} title={target === 'leave' ? 'Leave this organization?' : 'Remove this member?'} description={target === 'leave' ? 'You will stop using the owner’s shared plan and credits.' : `Remove ${target && typeof target !== 'string' ? target.name : 'this member'} from the shared plan?`} confirmLabel={target === 'leave' ? 'Leave organization' : 'Remove member'} danger busy={operation.busy} /></div>;
}
