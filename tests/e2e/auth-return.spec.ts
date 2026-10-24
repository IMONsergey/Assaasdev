import { expect, test, type Page } from '@playwright/test';

type AuthMode = 'anonymous' | 'pending-2fa' | 'authenticated' | 'guest';

/** Exercise the real HTTP/session adapter without depending on an external account. */
async function mockAuth(page: Page, initial: AuthMode = 'anonymous', loginStatus: 200 | 202 = 200, initialWhoami?: Promise<void>) {
  let mode = initial;
  const writes: { path: string; body: unknown }[] = [];
  const profile = { user_id: 'auth-return-contract', user_name: 'return_test', user_type: 'USER', email: 'return@example.test', credits: 500, subscription: { type: 'Free', credits: 500 } };
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.routeWebSocket('**/backend/ws', socket => {
    socket.onMessage(raw => {
      const frame = JSON.parse(String(raw)) as { type: string; id: string };
      if (frame.type === 'user_sessions') socket.send(JSON.stringify({ type: frame.type, id: frame.id, data: { sessions: [], total: 0, limit: 5 } }));
      else socket.send(JSON.stringify({ type: frame.type, id: frame.id, error: 'This read is outside the auth contract fixture.' }));
    });
  });
  await page.route('**/backend/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const reply = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'POST') writes.push({ path, body: request.postDataJSON() });
    if (path === '/backend/whoami') {
      if (initialWhoami) { const pendingRead = initialWhoami; initialWhoami = undefined; await pendingRead; }
      if (mode === 'authenticated') return reply(200, profile);
      if (mode === 'guest') return reply(200, { user_type: 'GUEST', daily_search_limit: 20, remaining_daily_searches: 20, subscription: { type: 'Guest' } });
      return reply(401, { error: mode === 'pending-2fa' ? 'Session requires 2FA verification' : 'Unauthorized' });
    }
    if (path === '/backend/auth/login') {
      mode = loginStatus === 202 ? 'pending-2fa' : 'authenticated';
      return reply(loginStatus, { message: loginStatus === 202 ? 'TOTP required' : 'Signed in' });
    }
    if (path === '/backend/auth/totp/verify') {
      if (request.postDataJSON().code !== '012345') return reply(400, { error: 'The code must retain its leading zero.' });
      mode = 'authenticated';
      return reply(200, { message: 'Verified' });
    }
    if (path === '/backend/auth/guest') { mode = 'guest'; return reply(200, { message: 'Guest session created' }); }
    return reply(404, { error: 'Not mocked' });
  });
  return { writes };
}

async function signIn(page: Page) {
  await page.getByLabel('Email or username').fill('return_test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}

async function enterSpacedCode(page: Page) {
  const code = page.getByLabel('Authenticator code');
  await expect(code).toBeFocused();
  // A single text insertion follows the paste/autofill input path and respects maxlength.
  await page.keyboard.insertText('012 345');
  await expect(code).toHaveValue('012345');
  await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
}

test('HTTP 202 preserves the return context and a spaced TOTP keeps its leading zero', async ({ page }) => {
  const { writes } = await mockAuth(page, 'anonymous', 202);
  const destination = '/account/security?from=sign-in#two-factor';
  await page.goto(`/auth/login?returnTo=${encodeURIComponent(destination)}`);
  await signIn(page);
  await expect(page).toHaveURL(/\/auth\/totp(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Two-factor authentication', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toHaveCount(0);
  expect(writes.map(item => item.path)).toEqual(['/backend/auth/login']);
  await enterSpacedCode(page);
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole('tab', { name: 'Security', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(writes).toEqual([
    { path: '/backend/auth/login', body: { identifier: 'return_test', password: 'test-password' } },
    { path: '/backend/auth/totp/verify', body: { code: '012345' } },
  ]);
});

test('an existing pending 2FA session preserves a deep link across the challenge reload', async ({ page }) => {
  const { writes } = await mockAuth(page, 'pending-2fa');
  const destination = '/account/security?from=deep-link#two-factor';
  await page.goto(destination);
  await expect(page).toHaveURL(url => url.pathname === '/auth/totp' && url.searchParams.get('returnTo') === destination);
  await expect(page.getByRole('heading', { name: 'Two-factor authentication', exact: true })).toBeVisible();
  await page.reload();
  await enterSpacedCode(page);
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole('heading', { name: 'Two-factor authentication', exact: true })).toBeVisible();
  expect(writes).toEqual([{ path: '/backend/auth/totp/verify', body: { code: '012345' } }]);
});

for (const entry of [{ path: '/auth/login', parameter: 'next' }, { path: '/login', parameter: 'returnTo' }]) {
  test(`pending 2FA preserves ${entry.path} ${entry.parameter} return context`, async ({ page }) => {
    const { writes } = await mockAuth(page, 'pending-2fa');
    const destination = '/account/security?from=alias#two-factor';
    await page.goto(`${entry.path}?${entry.parameter}=${encodeURIComponent(destination)}`);
    await expect(page).toHaveURL(url => url.pathname === '/auth/totp' && url.searchParams.get('returnTo') === destination);
    await enterSpacedCode(page);
    await expect(page).toHaveURL(destination);
    await expect(page.getByRole('tab', { name: 'Security', exact: true })).toHaveAttribute('aria-selected', 'true');
    expect(writes).toEqual([{ path: '/backend/auth/totp/verify', body: { code: '012345' } }]);
  });
}

test('pending 2FA discovered after auth navigation preserves history-state return context', async ({ page }) => {
  let releaseWhoami!: () => void;
  const firstRead = new Promise<void>(resolve => { releaseWhoami = resolve; });
  const { writes } = await mockAuth(page, 'pending-2fa', 200, firstRead);
  const destination = '/account/security?from=auth-navigation#two-factor';
  await page.goto(`/auth/login?returnTo=${encodeURIComponent(destination)}`);
  // This real link moves returnTo from the query into React Router navigation state.
  await page.getByRole('link', { name: 'Forgot password?', exact: true }).click();
  await expect(page).toHaveURL('/auth/recovery');
  releaseWhoami();
  await expect(page).toHaveURL(url => url.pathname === '/auth/totp' && url.searchParams.get('returnTo') === destination);
  await enterSpacedCode(page);
  await expect(page).toHaveURL(destination);
  expect(writes).toEqual([{ path: '/backend/auth/totp/verify', body: { code: '012345' } }]);
});

test('account sign-in returns to the requested subsection and query', async ({ page }) => {
  const { writes } = await mockAuth(page);
  const destination = '/account/sessions?view=all';
  await page.goto(destination);
  const signInLink = page.getByRole('link', { name: 'Sign in →', exact: true });
  await expect(signInLink).toHaveAttribute('href', `/auth/login?returnTo=${encodeURIComponent(destination)}`);
  await signInLink.click();
  await signIn(page);
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole('tab', { name: 'Sessions', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Active sessions', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No sessions returned', exact: true })).toBeVisible();
  expect(writes.map(item => item.path)).toEqual(['/backend/auth/login']);
});

test('explicit guest access returns to the original local view without signing in', async ({ page }) => {
  const { writes } = await mockAuth(page);
  const destination = '/settings?section=appearance#settings-panel-appearance';
  await page.goto(`/auth/login?returnTo=${encodeURIComponent(destination)}`);
  await page.getByRole('button', { name: 'Explore as a guest', exact: true }).click();
  await expect(page).toHaveURL(destination);
  await expect(page.getByRole('link', { name: 'Guest session', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Appearance', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Light theme', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View credits and usage. 20 daily searches available', exact: true })).toBeVisible();
  expect(writes).toEqual([{ path: '/backend/auth/guest', body: {} }]);
});

test('account tabs retain keyboard focus through arrows, Home and End', async ({ page }) => {
  const { writes } = await mockAuth(page, 'authenticated');
  await page.goto('/account');
  await page.getByRole('tab', { name: 'Profile', exact: true }).focus();
  const steps = [
    { key: 'ArrowRight', label: 'Security', path: '/account/security' },
    { key: 'ArrowRight', label: 'Sessions', path: '/account/sessions' },
    { key: 'End', label: 'Organization', path: '/account/team' },
    { key: 'Home', label: 'Profile', path: '/account' },
    { key: 'ArrowLeft', label: 'Organization', path: '/account/team' },
    { key: 'ArrowRight', label: 'Profile', path: '/account' },
  ];
  for (const step of steps) await test.step(`${step.key} → ${step.label}`, async () => {
    // Use the keyboard directly: locator.press would refocus a tab and hide regressions.
    await page.keyboard.press(step.key);
    await expect(page).toHaveURL(step.path);
    const selected = page.getByRole('tab', { name: step.label, exact: true });
    await expect(selected).toHaveAttribute('aria-selected', 'true');
    await expect(selected).toBeFocused();
  });
  expect(writes).toEqual([]);
});
