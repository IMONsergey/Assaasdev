import { expect, test, type Route } from '@playwright/test';

test('profile requests and code verification are serialized and an unknown result can be checked', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let profile = { user_id: 'profile-form-test', user_name: 'profile_user', email: 'profile@example.test', user_type: 'USER', credits: 500, scan_credits: 100, subscription: { type: 'Free' } };
  const writes: string[] = [], updates: Route[] = [], verifications: Route[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw));
    socket.send(JSON.stringify({ type: frame.type, id: frame.id, data: {} }));
  }));
  await page.route('**/backend/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/backend/whoami') return route.fulfill({ json: profile });
    if (route.request().method() === 'POST') writes.push(path);
    if (path === '/backend/profile/update') {
      updates.push(route);
      if (updates.length === 1) return route.fulfill({ json: { message: 'Verification code requested' } });
      return;
    }
    if (path === '/backend/profile/verify') { verifications.push(route); return; }
    return route.fulfill({ status: 404, json: { error: 'Outside the local profile fixture' } });
  });
  await page.goto('/settings?section=profile');
  const request = page.getByRole('button', { name: 'Request profile change', exact: true });
  const verify = page.getByRole('button', { name: 'Verify changes', exact: true });
  await page.getByLabel('Username', { exact: true }).fill('updated_profile');
  await page.getByLabel('Email address', { exact: true }).fill('updated-profile@example.test');
  await page.getByLabel('Current password', { exact: true }).fill('local-test-password-123');
  await request.click();
  await expect(verify).toBeVisible();
  await page.getByLabel('Email verification code', { exact: true }).fill('123456');

  await request.click();
  await expect.poll(() => updates.length).toBe(2);
  await expect(verify).toBeDisabled();
  await expect(page.getByLabel('Email verification code', { exact: true })).toBeDisabled();
  await page.locator('[data-onboarding="profile-verification"]').evaluate(form => (form as HTMLFormElement).requestSubmit());
  await updates[1].fulfill({ json: { message: 'Verification code requested again' } });
  await expect(verify).toBeEnabled();
  await page.getByLabel('Email verification code', { exact: true }).fill('123456');
  await verify.click();
  await expect.poll(() => verifications.length).toBe(1);
  await expect(request).toBeDisabled();
  await page.locator('[data-onboarding="profile-form"]').evaluate(form => (form as HTMLFormElement).requestSubmit());
  await verifications[0].fulfill({ status: 503, json: { error: 'The verification outcome was not returned.' } });
  await expect(page.getByText('Result not confirmed', { exact: true })).toBeVisible();
  await expect(request).toBeDisabled();
  await expect(verify).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('profile-verification-recovery-390.png'), fullPage: true });
  await page.getByRole('button', { name: 'Check current state', exact: true }).click();
  await expect(verify).toBeEnabled();
  await expect(request).toBeEnabled();
  await expect(page.getByLabel('Email verification code', { exact: true })).toHaveValue('123456');
  await verify.click();
  await expect.poll(() => verifications.length).toBe(2);
  profile = { ...profile, user_name: 'updated_profile', email: 'updated-profile@example.test' };
  await verifications[1].fulfill({ json: { message: 'Profile verified by the local test fixture' } });
  await expect(page.locator('.profile-identity-copy')).toContainText('updated_profile');
  await expect(verify).toHaveCount(0);
  expect(writes).toEqual(['/backend/profile/update', '/backend/profile/update', '/backend/profile/verify', '/backend/profile/verify']);
});
