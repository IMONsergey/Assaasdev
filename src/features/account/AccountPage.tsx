import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, type Profile, type SessionData, type SessionRecord, type TOTPEnrollmentData, type TOTPValidationData } from '../../api';
import { useApp } from '../../app/AppProvider';
import { Alert, Badge, Button, Card, ConfirmDialog, EmptyState, Field, PageHeader, Spinner, Skeleton, Tabs, Icon } from '../../components/ui';
import { copyText, formatDate, formatNumber, OperationNotice, responseData, useOperation } from './operation';
import { normalizeOneTimeCode } from '../auth/auth-state';
import { UserAvatar } from '../../components/UserAvatar';
import { AvatarPicker } from './AvatarPicker';
import './account.css';

const accountTabs = [{ id: 'profile', label: 'Profile', icon: 'user' }, { id: 'security', label: 'Security', icon: 'shield' }, { id: 'sessions', label: 'Sessions', icon: 'desktop' }, { id: 'team', label: 'Organization', icon: 'users' }];

export function AccountPage({ section, embedded = false }: { section?: string; embedded?: boolean } = {}) {
  const { session, user } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const accountRoot = useRef<HTMLDivElement>(null);
  const tab = section ?? accountTabs.find((item) => location.pathname.endsWith('/' + item.id))?.id ?? 'profile';
  const [visited, setVisited] = useState(() => new Set([tab]));
  useEffect(() => { setVisited(previous => previous.has(tab) ? previous : new Set([...previous, tab])); }, [tab]);
  useLayoutEffect(() => {
    if (session.status === 'authenticated' && location.state?.preserveTabFocus === true) {
      accountRoot.current?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    }
  }, [location.key, location.state?.preserveTabFocus, session.status, tab]);
  if (session.status === 'loading') return <Skeleton rows={4} label="Loading account" />;
  if (session.status !== 'authenticated' || !user) return <EmptyState title="Account settings" description="Sign in to manage your profile and access." actions={<Link className="inline-link" to={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}>Sign in →</Link>} />;
  return <div ref={accountRoot} className="account-page stack">
    {!embedded && <><PageHeader title="Account settings" actions={<Link className="button button--secondary" to="/settings"><Icon name="settings" size={17} />All settings</Link>} /><Tabs items={accountTabs} value={tab} ariaLabel="Account settings" idPrefix="account" onChange={(id) => navigate(id === 'profile' ? '/account' : '/account/' + id, { state: { preserveTabFocus: true } })} /></>}
    {accountTabs.map(item => <section key={item.id} id={`account-panel-${item.id}`} role={embedded ? undefined : 'tabpanel'} aria-labelledby={embedded ? undefined : `account-tab-${item.id}`} hidden={tab !== item.id}>{(visited.has(item.id) || tab === item.id) && (item.id === 'profile' ? <ProfilePanel user={user} /> : item.id === 'security' ? <SecurityPanel user={user} /> : item.id === 'sessions' ? <SessionsPanel /> : <TeamPanel user={user} />)}</section>)}
  </div>;
}

export function ProfilePanel({ user }: { user: Profile }) {
  const { api, refreshSession } = useApp();
  const update = useOperation();
  const verify = useOperation();
  const [pending, setPending] = useState(false);
  const [until, setUntil] = useState<number | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [requested, setRequested] = useState<{ email: string; user_name: string } | null>(null);
  const [profileNotice, setProfileNotice] = useState('');
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [profileConfirmed, setProfileConfirmed] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = { email: String(form.get('email')).trim(), user_name: String(form.get('user_name')).trim() };
    if (!next.user_name) { setProfileNotice('Enter a username. Spaces alone cannot identify an account.'); event.currentTarget.querySelector<HTMLInputElement>('[name="user_name"]')?.focus(); return; }
    setRequested(next); setProfileNotice(''); setProfileConfirmed(false);
    const result = await update.run(() => api.http('/profile/update', { method: 'POST', mutation: true, body: { ...next, password: String(form.get('password')), ...(user.totp_active ? { totp_code: normalizeOneTimeCode(String(form.get('totp_code'))) } : {}) } }), 'A verification code has been sent. Verify it to apply your changes.');
    if (result.ok) { setPending(true); setVerifyCode(''); verify.reset(); setUntil(Date.now() + 15 * 60_000); }
  }
  async function confirmProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await verify.run(() => api.http('/profile/verify', { method: 'POST', mutation: true, body: { code: verifyCode.trim() } }), 'Your profile changes have been verified.');
    if (result.ok) { setProfileConfirmed(true); setPending(false); setVerifyCode(''); setRequested(null); setUntil(null); update.reset(); await refreshSession().catch(() => undefined); }
  }

  async function checkProfile() {
    setCheckingProfile(true); setProfileNotice('');
    try {
      const current = await api.http<Profile>('/whoami');
      await refreshSession();
      if (requested && current.email === requested.email && current.user_name === requested.user_name) {
        setPending(false); setVerifyCode(''); setRequested(null); setUntil(null); update.reset(); verify.reset();
        setProfileConfirmed(true);
        setProfileNotice('Profile changes confirmed.');
      } else {
        setProfileNotice('The requested profile changes are not confirmed yet. Your current verified profile remains active. If a code arrived and is still valid, you can enter it below.');
        // A status read never repeats the mutation. A subsequent code submit is explicit.
        if (verify.state.status === 'unknown') verify.reset();
      }
    } catch (error) { setProfileNotice(error instanceof Error ? error.message : 'Your profile could not be checked. No change was sent again.'); }
    finally { setCheckingProfile(false); }
  }

  return <div className="profile-workspace" data-onboarding-state={profileConfirmed ? 'success' : update.state.status === 'unknown' || verify.state.status === 'unknown' ? 'unknown' : update.busy || verify.busy ? 'pending' : pending ? 'verification' : 'idle'}>
    <div className="profile-identity">
      <button type="button" className="profile-avatar-button" aria-label="Change avatar" onClick={() => setAvatarOpen(true)} disabled={!user.user_id}><UserAvatar principal={user.user_id} size={72} /><span aria-hidden="true"><Icon name="edit" size={14} /></span></button>
      <div className="profile-identity-copy"><h2>{user.user_name || 'Your account'}</h2><p>{user.email || 'No email linked'}</p></div>
      <Button variant="secondary" data-onboarding="avatar-picker" className="profile-avatar-action" onClick={() => setAvatarOpen(true)} disabled={!user.user_id}>Choose avatar</Button>
    </div>
    <div className="profile-details-grid">
      <Card className="profile-details-card"><h2 className="section-title">Personal information</h2><p className="muted">Verify changes with the code sent to your email.</p><OperationNotice state={update.state} onCheck={() => void checkProfile()} />{profileNotice && <Alert tone="info">{profileNotice}</Alert>}{checkingProfile && <Spinner label="Checking your current profile" />}
        <form key={(user.email ?? '') + (user.user_name ?? '')} className="stack" data-onboarding="profile-form" onSubmit={(event) => void saveProfile(event)}>
          <Field label="Username" name="user_name" defaultValue={user.user_name} required autoComplete="username" disabled={update.busy || verify.busy || checkingProfile} />
          <Field label="Email address" type="email" name="email" defaultValue={user.email} required autoComplete="email" disabled={update.busy || verify.busy || checkingProfile} />
          <Field label={user.email ? 'Current password' : 'Create a password'} type="password" name="password" required minLength={6} autoComplete={user.email ? 'current-password' : 'new-password'} disabled={update.busy || verify.busy || checkingProfile} hint={user.email ? 'Required to authorize this change.' : 'Use at least 6 characters to add an email to this account.'} />
          {user.totp_active && <Field label="Authenticator code" name="totp_code" autoComplete="one-time-code" inputMode="numeric" required minLength={6} maxLength={64} pattern="[0-9]{6}" onChange={event => { event.currentTarget.value = normalizeOneTimeCode(event.currentTarget.value); }} hint="Enter all 6 digits. Paste spacing is removed." />}
          <div className="form-actions"><Button type="submit" loading={update.busy} disabled={update.blocked || verify.busy || checkingProfile}>Request profile change</Button></div>
        </form>
        {(pending || update.state.status === 'unknown') && <form className="account-verification stack" data-onboarding="profile-verification" onSubmit={(event) => void confirmProfile(event)}><h3>Verify your changes</h3>{requested && <p className="muted account-break">Requested profile: {requested.user_name} · {requested.email}</p>}<p className="muted">{until ? `The verification window ends at approximately ${new Date(until).toLocaleTimeString()}.` : 'If a verification code arrived, you can confirm it here.'}</p><OperationNotice state={verify.state} onCheck={() => void checkProfile()} /><Field label="Email verification code" value={verifyCode} onChange={(event) => setVerifyCode(normalizeOneTimeCode(event.target.value))} autoComplete="one-time-code" inputMode="numeric" required minLength={6} maxLength={64} pattern="[0-9]{6}" disabled={verify.busy || checkingProfile} hint="Enter all 6 digits. You can paste a code with spaces." /><Button type="submit" loading={verify.busy} disabled={verify.blocked || checkingProfile}>Verify changes</Button></form>}
      </Card>
      <aside className="profile-account-summary" aria-label="Account overview">
        <div className="profile-plan-heading"><span className="profile-plan-icon"><Icon name="card" size={20} /></span><div><span className="profile-plan-label">Current plan</span><strong>{user.subscription?.type ?? 'Not available'}</strong></div></div>
        <dl className="profile-credit-grid"><div><dt><Icon name="search" size={14} />Search credits</dt><dd>{formatNumber(user.credits)}</dd></div><div><dt><Icon name="scan" size={14} />Scan credits</dt><dd>{formatNumber(user.scan_credits)}</dd></div></dl>
        <Link to="/billing" className="button button--secondary profile-subscription-link">Manage subscription<Icon name="arrow-up-right" size={16} /></Link>
        <div className="profile-account-reference"><span>User ID</span><code>{user.user_id ?? '—'}</code></div>
      </aside>
    </div>
    {avatarOpen && user.user_id && <AvatarPicker key={user.user_id} principal={user.user_id} onClose={() => setAvatarOpen(false)} />}
  </div>;
}

export function SecurityPanel({ user }: { user: Profile }) {
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
    if (form.get('new_password') !== form.get('confirm_password')) {
      setNotice('The new passwords do not match.');
      formNode.querySelector<HTMLInputElement>('[name="confirm_password"]')?.focus();
      return;
    }
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
      const data = responseData(await api.request<TOTPValidationData>('totp_validate', { totp_code: normalizeOneTimeCode(String(form.get('totp_code'))) }, { mutation: true }));
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
    <Card><h2 className="section-title">Password</h2><OperationNotice state={password.state} />
      <form className="stack" onSubmit={(event) => void changePassword(event)}><Field label="Current password" name="old_password" type="password" autoComplete="current-password" minLength={6} required disabled={password.busy} /><Field label="New password" name="new_password" type="password" autoComplete="new-password" minLength={6} required disabled={password.busy} hint="At least 6 characters. A longer passphrase is recommended." /><Field label="Confirm new password" error={notice || undefined} name="confirm_password" type="password" autoComplete="new-password" minLength={6} required disabled={password.busy} /><div className="form-actions"><Button type="submit" loading={password.busy} disabled={password.blocked}>Update password</Button></div></form>
      {password.state.status === 'unknown' && <p className="muted">The password may have changed. Verify sign-in with the new password before requesting another change.</p>}
    </Card>
    <div className="stack"><Card><div className="cluster account-card-heading"><h2 className="section-title">Two-factor authentication</h2><Badge tone={factorEnabled ? 'success' : 'neutral'}>{factorEnabled ? 'Enabled' : 'Not enabled'}</Badge></div><p className="muted">An authenticator adds a second check when you sign in.</p>{factorNotice && <Alert tone="info">{factorNotice}</Alert>}<OperationNotice state={enrollment.state} onCheck={() => void checkFactor()} /><OperationNotice state={validation.state} onCheck={() => void checkFactor()} />{checkingFactor && <Spinner label="Checking two-factor status…" />}
      {!factorEnabled && !details && !codes && <Button variant="secondary" loading={enrollment.busy} disabled={enrollment.blocked} onClick={() => void beginEnrollment()}>Set up authenticator</Button>}
      {details && <div className="stack account-totp-setup"><p>Scan this code with your authenticator app, or enter the setup key manually.</p>{qr && <img src={qr} width="192" height="192" className="account-qr" alt="Authenticator enrollment QR code" />}<Field label="Setup key" type={showSecret ? 'text' : 'password'} value={details.secret_key} readOnly /><div className="cluster"><Button size="sm" variant="ghost" onClick={() => setShowSecret(!showSecret)}>{showSecret ? 'Hide' : 'Reveal'} key</Button><Button size="sm" variant="ghost" onClick={() => void copyText(details.secret_key, toast)}>Copy key</Button></div><p className="muted">{expiresAt ? `The 15-minute setup window ends at approximately ${new Date(expiresAt).toLocaleTimeString()}.` : ''} Keep this key private.</p><form className="stack" onSubmit={(event) => void validateEnrollment(event)}><Field label="Authenticator code" name="totp_code" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={64} pattern="[0-9]{6}" onChange={event => { event.currentTarget.value = normalizeOneTimeCode(event.currentTarget.value); }} required disabled={validation.busy || checkingFactor} hint="Enter all 6 digits. You can paste a code with spaces." /><Button type="submit" loading={validation.busy} disabled={validation.blocked}>Enable two-factor authentication</Button></form><Button variant="ghost" disabled={validation.busy || validation.blocked || enrollment.busy} onClick={() => { validation.reset(); setShowSecret(false); void beginEnrollment(); }}>Start a fresh setup</Button></div>}
      {codes && (codes.length === 5 ? <div className="stack account-backup"><h3>Backup codes</h3><p className="muted">Five backup codes. Each can be used once. They are shown here only during this setup.</p><div className="account-backup-grid">{codes.map((code) => <code key={code}>{code}</code>)}</div><Button variant="secondary" onClick={() => void copyText(codes.join('\n'), toast)}>Copy backup codes</Button><Button variant="ghost" onClick={() => { setCodes(null); void refreshSession().catch(() => undefined); }}>I have saved my codes</Button></div> : <Alert tone="warning">Two-factor authentication was enabled, but all five backup codes were not returned. Keep your authenticator accessible and contact support before signing out.</Alert>)}
    </Card>{mode !== 'demo' && <Card><h2 className="section-title">Connected sign-in</h2><p className="muted">Attach an external sign-in method to this account.</p><div className="cluster"><Button variant="secondary" onClick={() => window.location.assign(api.url('/google/link'))}><Icon name="link" size={16} />Link Google</Button><Button variant="secondary" onClick={() => window.location.assign(api.url('/telegram/link'))}><Icon name="link" size={16} />Link Telegram</Button></div>{user.telegram_account && <p className="muted">A Telegram account is linked.</p>}</Card>}</div>
  </div>;
}

export function SessionsPanel() {
  const { api, user } = useApp();
  const queryClient = useQueryClient();
  const operation = useOperation();
  const [target, setTarget] = useState<SessionRecord | 'others' | null>(null);
  const sessions = useQuery({ queryKey: ['account-sessions', user?.user_id], queryFn: async ({ signal }) => {
    const data = responseData(await api.request<SessionData>('user_sessions', {}, { signal, mutation: false }));
    if (!Array.isArray(data.sessions) || data.sessions.some(item => !item || typeof item.session_id !== 'string')) throw new Error('The session list was incomplete. Refresh to request it again.');
    return data;
  } });
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
      {sessions.isPending ? <Skeleton rows={3} label="Loading sessions" /> : sessions.isError ? <Alert tone="error" actions={<Button onClick={() => void sessions.refetch()}>Try again</Button>}>{sessions.error.message}</Alert> : sessions.data.sessions.length === 0 ? <EmptyState title="No sessions returned" description="Refresh to check the latest session state." actions={<Button onClick={() => void sessions.refetch()}>Refresh</Button>} /> : <div className="account-session-list">{sessions.data.sessions.map((item) => <article key={item.session_id} className="account-session"><div className="account-session-symbol" aria-hidden="true"><Icon name={/mobile|phone|tablet/i.test(item.device_info ?? '') ? 'mobile' : 'desktop'} size={21} /></div><div className="account-session-body"><div className="cluster"><h3>{item.device_info || item.browser || 'Device'}</h3>{item.is_current && <Badge tone="accent">This session</Badge>}</div><p className="muted">{[item.browser, item.os, item.location].filter(Boolean).join(' · ') || 'Device details unavailable'}</p><p className="mono muted">{item.ip_address ?? 'IP unavailable'}</p><p className="muted">Last active {formatDate(item.last_activity)}</p></div>{!item.is_current && <Button variant="ghost" size="sm" disabled={operation.blocked} onClick={() => setTarget(item)}>End session</Button>}</article>)}</div>}
    </Card><ConfirmDialog open={target !== null} onClose={() => setTarget(null)} onConfirm={() => void terminate()} title={target === 'others' ? 'End all other sessions?' : 'End this session?'} description={target === 'others' ? 'Other devices will need to sign in again. This session will stay active.' : 'The selected device will need to sign in again.'} confirmLabel="End session" danger busy={operation.busy} /></div>;
}

export function TeamPanel({ user }: { user: Profile }) {
  const { api, refreshSession, metadata } = useApp();
  const operation = useOperation();
  const [memberId, setMemberId] = useState('');
  const [memberError, setMemberError] = useState('');
  const [target, setTarget] = useState<{ id: string; name: string } | 'leave' | null>(null);
  const isMember = user.team?.is_team_member === true;
  const isBusiness = user.subscription?.type === 'Business';
  const canManage = (isBusiness || metadata?.full_access === true) && !isMember && (!user.team?.team_owner_id || user.team.team_owner_id === user.user_id);
  const members = user.team?.team_members ?? [];
  async function reconcile() { try { await api.http('/whoami'); await refreshSession(); operation.reset(); } catch { /* Keep uncertain state until a real read succeeds. */ } }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = memberId.trim();
    if (!id) { setMemberError('Enter an existing APCOSYS user ID.'); return; }
    if (id === user.user_id) { setMemberError('You already own this organization. Enter another user’s ID.'); return; }
    if (members.some(member => member.user_id === id)) { setMemberError('This user is already listed in your organization.'); return; }
    setMemberError('');
    const result = await operation.run(async () => responseData(await api.request<{ message: string }>('org_add', { user_id: id }, { mutation: true })), 'The member has been added.');
    if (result.ok) { setMemberId(''); await refreshSession().catch(() => undefined); }
  }
  async function remove() {
    if (!target) return;
    const leaving = target === 'leave';
    const result = await operation.run(async () => responseData(await api.request<{ message: string }>(leaving ? 'org_leave' : 'org_remove', leaving ? {} : { user_id: target.id }, { mutation: true })), leaving ? 'You have left the organization.' : 'The member has been removed.');
    setTarget(null);
    if (result.ok) await refreshSession().catch(() => undefined);
  }
  return <div className="stack"><Card><div className="account-card-heading cluster"><div><h2 className="section-title">Team access</h2><p className="muted">Share your plan and credit balance with existing APCOSYS users.</p></div><Badge tone="accent">{isMember ? 'Member' : canManage ? 'Owner access' : 'Organization access'}</Badge></div><OperationNotice state={operation.state} onCheck={() => void reconcile()} />
      {user.team?.team_owner_name && <p className="account-break">Owner: <strong>{user.team.team_owner_name}</strong>{user.team.team_owner_email ? ` · ${user.team.team_owner_email}` : ''}</p>}
      {canManage ? <><form className="account-member-form" onSubmit={(event) => void add(event)}><Field label="Member user ID" value={memberId} onChange={(event) => { setMemberId(event.target.value); setMemberError(''); }} error={memberError} disabled={operation.busy} required hint="Enter an existing APCOSYS user ID. This does not send an email invitation." /><Button type="submit" loading={operation.busy} disabled={operation.blocked || !memberId.trim()}>Add member</Button></form>{members.length ? <div className="table-wrap account-team-table-wrap"><table className="data-table account-team-table" aria-label="Organization members"><thead><tr><th>Member</th><th>Added</th><th><span className="muted">Action</span></th></tr></thead><tbody>{members.map((member) => <tr key={member.user_id}><td><strong>{member.user_name || member.user_id}</strong><div className="muted">{member.email || 'No email'}</div></td><td data-label="Added">{formatDate(member.added_at)}</td><td><Button variant="ghost" size="sm" disabled={operation.blocked} className="row-action row-action--danger" aria-label={`Remove ${member.user_name || member.user_id}`} onClick={() => setTarget({ id: member.user_id, name: member.user_name || member.user_id })}><Icon name="trash" size={16} />Remove</Button></td></tr>)}</tbody></table></div> : <EmptyState title="No members yet" description="Add an existing user by their APCOSYS user ID." />}</> : isMember ? <><p className="muted">The owner manages membership. You can leave the organization at any time.</p><Button variant="secondary" disabled={operation.blocked} onClick={() => setTarget('leave')}>Leave organization</Button></> : <Alert tone="info" actions={<Link className="inline-link" to="/billing">View plans →</Link>}>Organization membership is managed by a Business account owner.</Alert>}
    </Card><ConfirmDialog open={target !== null} onClose={() => setTarget(null)} onConfirm={() => void remove()} title={target === 'leave' ? 'Leave this organization?' : 'Remove this member?'} description={target === 'leave' ? 'You will stop using the owner’s shared plan and credits.' : `Remove ${target && typeof target !== 'string' ? target.name : 'this member'} from the shared plan?`} confirmLabel={target === 'leave' ? 'Leave organization' : 'Remove member'} danger busy={operation.busy} /></div>;
}
