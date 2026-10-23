export type AuthStep = 'login' | 'register' | 'verify' | 'recover' | 'reset' | 'two-factor';
export type AuthPhase = 'idle' | 'submitting' | 'error' | 'unknown' | 'authenticated' | 'complete';

export interface AuthState {
  step: AuthStep;
  phase: AuthPhase;
  requestId: number | null;
  identifier: string;
  email: string;
  message: string;
}

export type AuthEvent =
  | { type: 'navigate'; step: AuthStep; identifier?: string; email?: string }
  | { type: 'submit'; requestId: number }
  | { type: 'login-result'; requestId: number; status: 200 | 202 }
  | { type: 'registered'; requestId: number; email: string }
  | { type: 'recovery-sent'; requestId: number; identifier: string }
  | { type: 'verified'; requestId: number }
  | { type: 'reset-complete'; requestId: number }
  | { type: 'challenge-complete'; requestId: number }
  | { type: 'failed'; requestId: number; message: string; outcome?: 'unknown' | 'failed' };

export function initialAuthState(step: AuthStep = 'login'): AuthState {
  return { step, phase: 'idle', requestId: null, identifier: '', email: '', message: '' };
}

/** A response may only complete the request still active in the visible flow. */
export function authReducer(state: AuthState, event: AuthEvent): AuthState {
  if (event.type === 'navigate') {
    return { ...initialAuthState(event.step), identifier: event.identifier ?? state.identifier, email: event.email ?? state.email };
  }
  if (event.type === 'submit') {
    if (state.phase === 'submitting' || state.phase === 'unknown') return state;
    return { ...state, phase: 'submitting', requestId: event.requestId, message: '' };
  }
  if (state.phase !== 'submitting' || event.requestId !== state.requestId) return state;
  const settled = { ...state, requestId: null };
  switch (event.type) {
    case 'login-result':
      if (state.step !== 'login') return state;
      return event.status === 202
        ? { ...settled, step: 'two-factor', phase: 'idle', message: 'Enter a code from your authenticator to finish signing in.' }
        : { ...settled, phase: 'authenticated' };
    case 'registered':
      if (state.step !== 'register') return state;
      return { ...settled, step: 'verify', email: event.email, phase: 'idle', message: 'Check your email for the six-digit verification code.' };
    case 'recovery-sent':
      if (state.step !== 'recover') return state;
      return { ...settled, step: 'reset', identifier: event.identifier, phase: 'idle', message: 'If an account exists for this identifier, a reset code has been sent.' };
    case 'verified':
      if (state.step !== 'verify') return state;
      return { ...settled, phase: 'complete', message: 'Your email is verified. Sign in to continue.' };
    case 'reset-complete':
      if (state.step !== 'reset') return state;
      return { ...settled, phase: 'complete', message: 'Your password has been reset. Sign in with your new password.' };
    case 'challenge-complete':
      if (state.step !== 'two-factor') return state;
      return { ...settled, phase: 'authenticated' };
    case 'failed':
      return { ...settled, phase: event.outcome === 'unknown' ? 'unknown' : 'error', message: event.message };
  }
}

export function authStepForPath(pathname: string, search = ''): AuthStep {
  if (new URLSearchParams(search).get('2FA') === 'true' || /\/(?:two-factor|totp)\/?$/.test(pathname)) return 'two-factor';
  if (/\/recovery\/confirm\/?$/.test(pathname)) return 'reset';
  if (/\/(?:register|signup)\/?$/.test(pathname)) return 'register';
  if (/\/verify\/?$/.test(pathname)) return 'verify';
  if (/\/(?:recover|recovery|forgot-password)\/?$/.test(pathname)) return 'recover';
  if (/\/(?:reset|reset-password)\/?$/.test(pathname)) return 'reset';
  return 'login';
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/search';
  try {
    const base = 'https://app.invalid';
    const parsed = new URL(value, base);
    if (parsed.origin !== base || /^\/(?:auth|login|register|signup|verify|recover|reset|two-factor)(?:\/|$)/.test(parsed.pathname)) return '/search';
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return '/search';
  }
}
