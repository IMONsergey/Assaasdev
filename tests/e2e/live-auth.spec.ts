import { expect, test } from '@playwright/test';

test('live API failure stays live and never silently creates a guest session', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => { requests.push(new URL(route.request().url()).pathname); return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Staging unavailable"}' }); });
  await page.goto('/search');
  await expect(page.getByText('The workspace could not connect', { exact: true })).toBeVisible();
  await expect(page.locator('.demo-label')).toHaveCount(0);
  expect(requests).not.toContain('/backend/auth/guest');
  expect(requests.filter(p => p === '/backend/whoami').length).toBe(1);
});

test('HTTP 202 requires TOTP before authenticated workspace access', async ({ page }) => {
  let verified = false; const writes: string[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/auth/login')) { writes.push(path); return route.fulfill({ status: 202, contentType: 'application/json', body: '{"message":"TOTP required"}' }); }
    if (path.endsWith('/auth/totp/verify')) { writes.push(path); verified = true; return route.fulfill({ contentType: 'application/json', body: '{"message":"Verified"}' }); }
    if (path.endsWith('/whoami')) return route.fulfill({ status: verified ? 200 : 401, contentType: 'application/json', body: verified ? JSON.stringify({ user_id: 'browser-contract', user_name: 'contract_test', user_type: 'USER', credits: 500, subscription: { type: 'Free', credits: 500 } }) : '{"error":"Unauthorized"}' });
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not mocked"}' });
  });
  await page.goto('/auth/login');
  await page.getByLabel('Email or username').fill('contract_test');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/totp$/);
  expect(verified).toBe(false);
  await page.getByLabel('Authenticator code').fill('123456');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page).toHaveURL(/\/search$/);
  const accountLink = page.getByRole('link', { name: 'Account', exact: true });
  await expect(accountLink).toBeVisible();
  await expect(accountLink).toHaveAttribute('title', 'contract_test');
  expect(writes).toEqual(['/backend/auth/login', '/backend/auth/totp/verify']);
});
