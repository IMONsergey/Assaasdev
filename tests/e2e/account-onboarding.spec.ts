import { expect, test, type Page } from '@playwright/test';

/** Local HTTP fixtures only: no account, email or credential is sent to an external service. */
async function authFixture(page: Page, twoFactor = false) {
  let mode: 'anonymous' | 'guest' | 'pending' | 'authenticated' = 'anonymous';
  const writes: string[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw));
    const data = frame.type === 'user_sessions' ? { sessions: [], total: 0, limit: 5 } : {};
    socket.send(JSON.stringify({ type: frame.type, id: frame.id, data }));
  }));
  await page.route('**/backend/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const reply = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (request.method() === 'POST') writes.push(path);
    if (path === '/backend/whoami') {
      if (mode === 'authenticated') return reply(200, { user_id: 'guide-account', user_name: 'guide_user', user_type: 'USER', email: 'guide@example.test', credits: 500, scan_credits: 100, subscription: { type: 'Free', credits: 500 } });
      if (mode === 'guest') return reply(200, { user_type: 'GUEST', remaining_daily_searches: 20, daily_search_limit: 20, subscription: { type: 'Guest' } });
      return reply(401, { error: mode === 'pending' ? 'Session requires 2FA verification' : 'Unauthorized' });
    }
    if (path === '/backend/auth/login') { mode = twoFactor ? 'pending' : 'authenticated'; return reply(twoFactor ? 202 : 200, { message: twoFactor ? 'Two-factor verification required' : 'Signed in' }); }
    if (path === '/backend/auth/totp/verify') { mode = 'authenticated'; return reply(200, { message: 'Verified' }); }
    if (path === '/backend/auth/guest') { mode = 'guest'; return reply(200, { message: 'Guest session created' }); }
    if (['/backend/auth/signup','/backend/auth/verify','/backend/auth/password-recovery/request','/backend/auth/password-recovery/confirm'].includes(path)) return reply(200, { message: 'Accepted by the local test fixture' });
    return reply(404, { error: 'Outside this local auth fixture' });
  });
  return writes;
}
function guideOf(page: Page) { return page.getByRole('complementary', { name: 'Scenario guide', exact: true }); }
async function start(page: Page, id: string) {
  await page.goto(`/scenarios?scenario=${id}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Start scenario', exact: true }).click();
  await expect(guideOf(page)).toBeVisible();
}
async function signIn(page: Page) {
  await page.getByLabel('Email or username', { exact: true }).fill('guide_user');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password-123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
}
async function expectEditableFieldClear(page: Page, label: string) {
  const field = page.getByLabel(label, { exact: true });
  await expect(field).toBeFocused();
  await expect.poll(async () => {
    const input = await field.evaluate(node => {
      const box = (node.closest('.field') || node).getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    }), coach = await guideOf(page).boundingBox();
    if (!input || !coach) return Infinity;
    return Math.max(0, Math.min(input.x + input.width, coach.x + coach.width) - Math.max(input.x, coach.x)) * Math.max(0, Math.min(input.y + input.height, coach.y + coach.height) - Math.max(input.y, coach.y));
  }).toBeLessThanOrEqual(1);
  // A visible rectangle must also remain the actual pointer target, not merely sit behind an overlay.
  expect(await field.evaluate(input => {
    const box = input.getBoundingClientRect();
    const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return hit === input || input.contains(hit);
  })).toBe(true);
}

test('a guest exit does not complete the sign-in walkthrough', async ({ page }) => {
  const writes = await authFixture(page);
  await start(page, 'account-access');
  await expect(guideOf(page)).toContainText('Step 1 of 3');
  await page.getByRole('button', { name: 'Explore as a guest', exact: true }).click();
  await expect(page).toHaveURL(/\/search$/);
  // A route change alone is not evidence of authentication.
  await expect(page.getByRole('link', { name: 'Guest session', exact: true })).toBeVisible();
  // The guide intentionally debounces transitions by 180 ms; verify absence after that window.
  await page.waitForTimeout(400);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem('apcosys.scenario-guide.v1')!).index)).toBe(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('apcosys.scenario-guide.v1')!).progress.filter(Boolean))).toEqual([]);
  expect(writes).toEqual(['/backend/auth/guest']);
});

test('mobile onboarding waits for TOTP before moving to the verified profile', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes = await authFixture(page, true);
  await start(page, 'account-access');
  await signIn(page);
  await expect(page).toHaveURL(/\/auth\/totp(?:\?|$)/);
  await expect(guideOf(page)).toContainText('Step 2 of 3');
  await expect(page.getByLabel('Authenticator code', { exact: true })).toBeVisible();
  await page.getByLabel('Authenticator code', { exact: true }).fill('012345');
  await expectEditableFieldClear(page, 'Authenticator code');
  await page.screenshot({ path: testInfo.outputPath('onboarding-auth-totp-mobile.png') });
  await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?section=profile$/);
  await expect(guideOf(page)).toContainText('Step 3 of 3');
  await expect(page.locator('.profile-identity-copy')).toContainText('guide_user');
  expect(writes).toEqual(['/backend/auth/login','/backend/auth/totp/verify']);
});

test('registration onboarding retains email verification and completes actual sign-in at 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const writes = await authFixture(page);
  await start(page, 'register-account');
  await page.getByLabel('Email address', { exact: true }).fill('guide@example.test');
  await page.getByLabel('Username', { exact: true }).fill('guide_user');
  await page.getByLabel('Password', { exact: true }).fill('local-test-password-123');
  await page.getByLabel('Confirm password', { exact: true }).fill('local-test-password-123');
  await expectEditableFieldClear(page, 'Confirm password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/verify$/);
  await expect(guideOf(page)).toContainText('Step 2 of 4');
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue('guide@example.test');
  await page.getByLabel('Verification code', { exact: true }).fill('012345');
  await page.getByRole('button', { name: 'Verify email', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continue to sign in', exact: true })).toBeVisible();
  await expect.poll(async () => {
    const heading = await page.getByRole('heading', { name: 'Verify email', exact: true }).boundingBox(), coach = await guideOf(page).boundingBox();
    if (!heading || !coach) return Infinity;
    return Math.max(0, Math.min(heading.y + heading.height, coach.y + coach.height) - Math.max(heading.y, coach.y));
  }).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('onboarding-signup-verified-mobile.png') });
  await page.getByRole('button', { name: 'Continue to sign in', exact: true }).click();
  await expect(guideOf(page)).toContainText('Step 3 of 4');
  await signIn(page);
  await expect(page).toHaveURL(/\/settings\?section=profile$/);
  await expect(guideOf(page)).toContainText('Step 4 of 4');
  expect(writes).toEqual(['/backend/auth/signup','/backend/auth/verify','/backend/auth/login']);
});

test('recovery onboarding preserves the identifier and transitions only after reset confirmation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const writes = await authFixture(page);
  await start(page, 'recover-password');
  await page.getByLabel('Email or username', { exact: true }).fill('guide_user');
  await page.getByRole('button', { name: 'Send reset code', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/recovery\/confirm$/);
  await expect(guideOf(page)).toContainText('Step 2 of 4');
  await expect(page.getByLabel('Email or username', { exact: true })).toHaveValue('guide_user');
  await page.getByLabel('New password', { exact: true }).fill('new-local-password-123');
  await page.getByLabel('Confirm password', { exact: true }).fill('new-local-password-123');
  await page.getByLabel('Reset code', { exact: true }).fill('reset-fixture-code');
  await expectEditableFieldClear(page, 'Reset code');
  await page.screenshot({ path: testInfo.outputPath('onboarding-recovery-mobile.png') });
  await page.getByRole('button', { name: 'Reset password', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/login$/);
  await expect(guideOf(page)).toContainText('Step 3 of 4');
  await signIn(page);
  await expect(page).toHaveURL(/\/settings\?section=sessions$/);
  await expect(guideOf(page)).toContainText('Step 4 of 4');
  expect(writes).toEqual(['/backend/auth/password-recovery/request','/backend/auth/password-recovery/confirm','/backend/auth/login']);
});
