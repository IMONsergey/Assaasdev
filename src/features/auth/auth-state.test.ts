import { describe, expect, it } from 'vitest';
import { authReducer, authStepForPath, initialAuthState, normalizeOneTimeCode, safeReturnPath } from './auth-state';

describe('authentication transitions', () => {
  it('keeps a 202 login out of authenticated state until the challenge succeeds', () => {
    const login = authReducer(initialAuthState(), { type: 'submit', requestId: 1 });
    const challenge = authReducer(login, { type: 'login-result', requestId: 1, status: 202 });
    expect(challenge.step).toBe('two-factor');
    expect(challenge.phase).toBe('idle');
    const pending = authReducer(challenge, { type: 'submit', requestId: 2 });
    expect(authReducer(pending, { type: 'challenge-complete', requestId: 2 }).phase).toBe('authenticated');
  });

  it('ignores a late login response after navigation to recovery', () => {
    const pending = authReducer(initialAuthState(), { type: 'submit', requestId: 1 });
    const recovery = authReducer(pending, { type: 'navigate', step: 'recover' });
    expect(authReducer(recovery, { type: 'login-result', requestId: 1, status: 200 })).toEqual(recovery);
  });

  it('does not treat account verification or password reset as an authenticated session', () => {
    const verifying = authReducer(initialAuthState('verify'), { type: 'submit', requestId: 3 });
    const resetting = authReducer(initialAuthState('reset'), { type: 'submit', requestId: 4 });
    expect(authReducer(verifying, { type: 'verified', requestId: 3 }).phase).toBe('complete');
    expect(authReducer(resetting, { type: 'reset-complete', requestId: 4 }).phase).toBe('complete');
  });

  it('rejects duplicate submit and preserves an uncertain outcome', () => {
    const pending = authReducer(initialAuthState(), { type: 'submit', requestId: 5 });
    expect(authReducer(pending, { type: 'submit', requestId: 6 })).toEqual(pending);
    const unknown = authReducer(pending, { type: 'failed', requestId: 5, message: 'Connection lost.', outcome: 'unknown' });
    expect(unknown.phase).toBe('unknown');
    expect(unknown.phase).not.toBe('authenticated');
    expect(authReducer(unknown, { type: 'submit', requestId: 6 })).toEqual(unknown);
  });

  it('does not confuse a challenge response with a login response', () => {
    const pending = authReducer(initialAuthState('two-factor'), { type: 'submit', requestId: 7 });
    expect(authReducer(pending, { type: 'login-result', requestId: 7, status: 200 })).toEqual(pending);
  });
});

describe('authentication routing', () => {
  it('recognizes the documented OAuth pending-2FA redirect', () => {
    expect(authStepForPath('/login', '?2FA=true')).toBe('two-factor');
  });

  it('preserves local return context and rejects external or repeated-auth targets', () => {
    expect(safeReturnPath('/search?full_text_search=example.com&page=2')).toBe('/search?full_text_search=example.com&page=2');
    for (const target of ['https://outside.example', '//outside.example', '/\\outside.example', '/login', '/register?next=/billing']) {
      expect(safeReturnPath(target)).toBe('/search');
    }
  });
});

describe('one-time code entry', () => {
  it('accepts paste spacing without losing leading zeroes', () => {
    expect(normalizeOneTimeCode(' 012 345\n')).toBe('012345');
    expect(normalizeOneTimeCode('012\u00a0345')).toBe('012345');
  });

  it('preserves the code alphabet and leaves invalid content available for validation', () => {
    expect(normalizeOneTimeCode('abCD 1234')).toBe('abCD1234');
    expect(normalizeOneTimeCode('123-456')).toBe('123-456');
    expect(normalizeOneTimeCode('01234567')).toBe('01234567');
  });
});
