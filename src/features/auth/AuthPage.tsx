import { useEffect, useReducer, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../../api';
import { useApp } from '../../app/AppProvider';
import { asset } from '../../config';
import { Alert, Button, Field, Icon, Spinner } from '../../components/ui';
import { DotCascade } from '../../components/brand';
import { authReducer, authStepForPath, initialAuthState, normalizeOneTimeCode, safeReturnPath, type AuthStep } from './auth-state';
import './auth.css';

const copy: Record<AuthStep, { title: string; description: string; action: string }> = {
  login: { title: 'Welcome back', description: 'Sign in to continue your research.', action: 'Log in' },
  register: { title: 'Create account', description: 'Create your APCOSYS account. Your Free plan starts after email verification.', action: 'Create account' },
  verify: { title: 'Verify email', description: 'Enter the verification code sent to your email.', action: 'Verify email' },
  recover: { title: 'Reset password', description: 'Enter your email or username to request a password reset code.', action: 'Send reset code' },
  reset: { title: 'Choose a new password', description: 'Use the code from your email and choose a new password.', action: 'Reset password' },
  'two-factor': { title: 'Two-factor authentication', description: 'Enter a code from your authenticator app to securely finish signing in.', action: 'Verify and sign in' },
};

const routes: Record<AuthStep, string> = {
  login: '/auth/login', register: '/auth/signup', verify: '/auth/verify',
  recover: '/auth/recovery', reset: '/auth/recovery/confirm', 'two-factor': '/auth/totp',
};

export function AuthPage() {
  const { api, session, refreshSession, setPending2fa, startGuest, mode } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(authReducer, initialAuthState(authStepForPath(location.pathname, location.search)));
  const [showPassword, setShowPassword] = useState(false);
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmationError, setConfirmationError] = useState('');
  const [guestBusy, setGuestBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cooldown, setCooldown] = useState<{ step: AuthStep; until: number } | null>(null);
  const sequence = useRef(0);
  const active = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const navigationState = location.state as { returnTo?: string; email?: string; identifier?: string } | null;
  const params = new URLSearchParams(location.search);
  const returnTo = safeReturnPath(params.get('returnTo') ?? params.get('next') ?? navigationState?.returnTo);

  useEffect(() => {
    active.current?.abort();
    inFlight.current = false;
    setNotice('');
    setConfirmationError('');
    setCode('');
    dispatch({ type: 'navigate', step: authStepForPath(location.pathname, location.search), email: navigationState?.email, identifier: navigationState?.identifier });
  }, [location.pathname, location.search, navigationState?.email, navigationState?.identifier]);

  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(null), Math.max(0, cooldown.until - Date.now()));
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (session.status === 'authenticated' && (state.phase === 'authenticated' || state.step === 'login' || location.pathname === '/auth/callback')) {
      navigate(returnTo, { replace: true });
    } else if (session.status === 'pending-2fa' && state.step !== 'two-factor') {
      navigate(routes['two-factor'], { replace: true, state: { returnTo } });
    }
  }, [session.status, state.phase, state.step, location.pathname, navigate, returnTo]);

  function go(step: AuthStep, extra: { email?: string; identifier?: string } = {}) {
    navigate(routes[step], { state: { returnTo, ...extra } });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || guestBusy || checking || state.phase === 'unknown' || cooldown?.step === state.step && cooldown.until > Date.now()) return;
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? '');
    const password = value('password');
    if (['login', 'recover', 'reset'].includes(state.step) && !value('identifier').trim()) {
      setNotice('Enter your email or username. Spaces alone cannot identify an account.');
      event.currentTarget.querySelector<HTMLInputElement>('[name="identifier"]')?.focus();
      return;
    }
    if (state.step === 'register' && !value('user_name').trim()) {
      setNotice('Enter a username. Spaces alone cannot identify an account.');
      event.currentTarget.querySelector<HTMLInputElement>('[name="user_name"]')?.focus();
      return;
    }
    if ((state.step === 'register' || state.step === 'reset') && password !== value('confirmation')) {
      setNotice('');
      setConfirmationError('The passwords do not match.');
      const confirmation = event.currentTarget.querySelector<HTMLInputElement>('[name="confirmation"]');
      confirmation?.focus();
      confirmation?.scrollIntoView({ block: 'center' });
      return;
    }
    const requestId = ++sequence.current;
    const controller = new AbortController();
    active.current = controller;
    inFlight.current = true;
    setNotice('');
    setConfirmationError('');
    dispatch({ type: 'submit', requestId });
    const post = { method: 'POST', signal: controller.signal, mutation: true };
    try {
      switch (state.step) {
        case 'login': {
          const result = await api.httpResponse('/auth/login', { ...post, body: { identifier: value('identifier').trim(), password } });
          if (result.status !== 200 && result.status !== 202) throw new ApiError('unknown', 'The server returned an unexpected sign-in response. Check your session before trying again.', { outcome: 'unknown' });
          if (controller.signal.aborted) return;
          dispatch({ type: 'login-result', requestId, status: result.status });
          if (result.status === 202) {
            setPending2fa();
            go('two-factor');
          } else await refreshSession();
          break;
        }
        case 'register': {
          const email = value('email').trim();
          await api.http('/auth/signup', { ...post, body: { email, user_name: value('user_name').trim(), password } });
          if (controller.signal.aborted) return;
          dispatch({ type: 'registered', requestId, email });
          go('verify', { email });
          break;
        }
        case 'verify':
          await api.http('/auth/verify', { ...post, body: { email: value('email').trim(), code: value('code').trim() } });
          if (!controller.signal.aborted) dispatch({ type: 'verified', requestId });
          break;
        case 'recover': {
          const identifier = value('identifier').trim();
          await api.http('/auth/password-recovery/request', { ...post, body: { identifier } });
          if (controller.signal.aborted) return;
          dispatch({ type: 'recovery-sent', requestId, identifier });
          go('reset', { identifier });
          break;
        }
        case 'reset':
          await api.http('/auth/password-recovery/confirm', { ...post, body: { identifier: value('identifier').trim(), reset_code: value('code').trim(), new_password: password } });
          if (!controller.signal.aborted) dispatch({ type: 'reset-complete', requestId });
          break;
        case 'two-factor':
          await api.http('/auth/totp/verify', { ...post, body: backup ? { backup_code: value('code').trim() } : { code: value('code').trim() } });
          if (controller.signal.aborted) return;
          dispatch({ type: 'challenge-complete', requestId });
          await refreshSession();
          break;
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const uncertain = error instanceof ApiError && error.outcome === 'unknown';
      if (error instanceof ApiError && error.retryAfterSeconds && Number.isFinite(error.retryAfterSeconds)) setCooldown({ step: state.step, until: Date.now() + error.retryAfterSeconds * 1000 });
      dispatch({ type: 'failed', requestId, outcome: uncertain ? 'unknown' : 'failed', message: uncertain ? 'The connection ended before the result was confirmed. Check your session or inbox before submitting again.' : error instanceof Error ? error.message : 'The request could not be completed.' });
    } finally {
      if (active.current === controller) inFlight.current = false;
    }
  }

  async function checkSession() {
    if (inFlight.current || checking || guestBusy) return;
    setChecking(true);
    try {
      await api.http('/whoami');
      await refreshSession();
      navigate(returnTo, { replace: true });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        if (error.message.includes('2FA')) { setPending2fa(); go('two-factor'); }
        else {
          dispatch({ type: 'navigate', step: state.step });
          setNotice('There is no active signed-in session. Check your inbox if a code was requested, then continue when ready.');
        }
      } else setNotice(error instanceof Error ? error.message : 'Your session could not be checked.');
    } finally { setChecking(false); }
  }

  async function continueAsGuest() {
    if (inFlight.current || guestBusy || checking || state.phase === 'unknown' || state.phase === 'authenticated') return;
    inFlight.current = true;
    setGuestBusy(true);
    try { await startGuest(); navigate(returnTo); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Guest access could not be started.'); }
    finally { inFlight.current = false; setGuestBusy(false); }
  }

  const busy = state.phase === 'submitting';
  const controlsBusy = busy || guestBusy || checking;
  const entryBlocked = controlsBusy || state.phase === 'unknown' || state.phase === 'authenticated';
  const hasPassword = ['login', 'register', 'reset'].includes(state.step);
  const complete = state.phase === 'complete';
  const coolingDown = cooldown?.step === state.step && cooldown.until > Date.now();

  return <main className="auth-page">
    <section className="auth-story" aria-label="APCOSYS">
      <DotCascade overlay interactive={false} color="#ffffff" startOpacity={0.24} endOpacity={0.08} spacing={24} dotRadius={1} />
      <img className="auth-brand-logo" src={asset('figma/home/imgApcosysLogo.svg')} width="320" height="64" alt="APCOSYS" />
    </section>
    <section className="auth-form-region" aria-labelledby="auth-title">
      <div className="auth-topline"><Link to="/search" className="auth-mobile-brand" aria-label="APCOSYS home"><img src={asset('figma/home/imgApcosysLogo.svg')} width="150" height="29" alt="APCOSYS" /></Link><Link to="/search" className="auth-back inline-link"><Icon name="chevron-left" size={16} />Back to search</Link><div className="auth-top-actions">{state.step === 'login' && <Button variant="ghost" size="sm" loading={guestBusy} disabled={entryBlocked} onClick={() => void continueAsGuest()}>Explore as a guest<Icon name="arrow" size={16} /></Button>}</div></div>
      <div className="auth-form-wrap">
        {state.step === 'two-factor' && <span className="auth-step-label">ACCOUNT SECURITY</span>}
        <h1 id="auth-title">{copy[state.step].title}</h1><p className="auth-description">{copy[state.step].description}</p>
        {notice && <Alert tone="warning">{notice}</Alert>}
        {state.message && <Alert tone={state.phase === 'error' ? 'error' : state.phase === 'unknown' ? 'warning' : complete ? 'success' : 'info'} title={state.phase === 'unknown' ? 'Outcome not confirmed' : undefined}>{state.message}</Alert>}
        {coolingDown && <p className="auth-provider-note">Try again after {new Date(cooldown.until).toLocaleTimeString()}. This form will not retry automatically.</p>}
        {state.phase === 'unknown' && <Button variant="secondary" loading={checking} onClick={() => void checkSession()}>Check current session</Button>}
        {state.phase === 'authenticated' ? <div className="stack"><Spinner label="Loading your account…" />{(session.status === 'anonymous' || session.status === 'guest') && <Alert tone="warning" actions={<Button loading={checking} onClick={() => void checkSession()}>Check current session</Button>}>The sign-in response arrived, but an authenticated session has not been verified. Check your session before continuing.</Alert>}{session.status === 'error' && <Alert tone="error" actions={<Button onClick={() => void refreshSession()}>Check session again</Button>}>{session.error || 'The account could not be loaded.'}</Alert>}</div> : complete ? <Button fullWidth onClick={() => go('login')}>Continue to sign in</Button> : <form key={state.step} className="auth-form" onSubmit={(event) => void submit(event)}>
          {(state.step === 'login' || state.step === 'recover' || state.step === 'reset') && <Field label="Email or username" name="identifier" autoComplete="username" required defaultValue={state.identifier} autoFocus disabled={controlsBusy} />}
          {(state.step === 'register' || state.step === 'verify') && <Field label="Email address" name="email" type="email" autoComplete="email" required defaultValue={state.email} autoFocus disabled={controlsBusy} />}
          {state.step === 'register' && <Field label="Username" name="user_name" autoComplete="username" required disabled={controlsBusy} hint="Choose the name you will use to sign in." />}
          {hasPassword && <div className="auth-password"><Field label={state.step === 'reset' ? 'New password' : 'Password'} name="password" onChange={() => setConfirmationError('')} type={showPassword ? 'text' : 'password'} autoComplete={state.step === 'login' ? 'current-password' : 'new-password'} minLength={state.step === 'register' ? 18 : 6} required disabled={controlsBusy} hint={state.step === 'register' ? 'Use at least 18 characters.' : state.step === 'reset' ? 'Use at least 6 characters.' : undefined} /><button className="auth-password-toggle" type="button" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'Hide password' : 'Show password'}</button></div>}
          {(state.step === 'register' || state.step === 'reset') && <Field label="Confirm password" name="confirmation" error={confirmationError || undefined} onChange={() => setConfirmationError('')} type={showPassword ? 'text' : 'password'} autoComplete="new-password" required disabled={controlsBusy} />}
          {(state.step === 'verify' || state.step === 'reset' || state.step === 'two-factor') && <Field label={state.step === 'two-factor' ? backup ? 'Backup code' : 'Authenticator code' : state.step === 'reset' ? 'Reset code' : 'Verification code'} name="code" value={code} onChange={event => setCode(state.step === 'reset' ? event.target.value : normalizeOneTimeCode(event.target.value))} autoComplete="one-time-code" inputMode={backup || state.step === 'reset' ? 'text' : 'numeric'} minLength={state.step === 'reset' ? undefined : backup ? 8 : 6} maxLength={state.step === 'reset' ? undefined : 64} pattern={state.step === 'reset' ? undefined : backup ? '.{8}' : '[0-9]{6}'} autoFocus={state.step === 'two-factor'} required disabled={controlsBusy} hint={backup ? 'Each 8-character backup code can be used once.' : state.step === 'reset' ? 'Paste the complete reset code from your email.' : 'Enter all 6 digits. You can paste a code with spaces.'} />}
          {state.step === 'login' && <Link className="auth-forgot inline-link" to={routes.recover} state={{ returnTo }}>Forgot password?</Link>}
          <Button fullWidth type="submit" loading={busy} disabled={entryBlocked || coolingDown}>{copy[state.step].action}</Button>
          {state.step === 'two-factor' && <Button type="button" variant="ghost" onClick={() => { setBackup(!backup); setCode(''); }} disabled={controlsBusy}>{backup ? 'Use an authenticator code' : 'Use a backup code'}</Button>}
        </form>}
        {state.step === 'login' && state.phase !== 'authenticated' && <>{mode !== 'demo' && <div className="auth-social"><Button fullWidth variant="secondary" onClick={() => window.location.assign(api.url('/auth/google'))} disabled={entryBlocked}><img src={asset('figma/login/imgApcosysGoogle.svg')} width="20" height="20" alt="" aria-hidden="true" />Continue with Google</Button></div>}<p className="auth-switch">New to APCOSYS? <Link to={routes.register} state={{ returnTo }}>Create an account</Link></p></>}

        {state.step !== 'login' && !complete && <p className="auth-switch">Already have an account? <Link to={routes.login} state={{ returnTo }}>Sign in</Link></p>}
      </div>

    </section>
  </main>;
}
