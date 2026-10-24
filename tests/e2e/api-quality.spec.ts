import { expect, test, type Page } from '@playwright/test';
import { seedProfile } from '../../src/demo/fixtures';
import type { Profile } from '../../src/api';

async function routeAccount(page: Page, profile: Profile) {
  const writes: string[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => {
    if (route.request().method() !== 'GET') writes.push(route.request().url());
    return route.fulfill({ json: profile });
  });
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw));
    if (frame.type === 'regenerate_api_key') writes.push(frame.type);
    socket.send(JSON.stringify({ id: frame.id, type: frame.type, data: { unread_count: 0 } }));
  }));
  return writes;
}

for (const access of [
  { plan: 'Business', reported: false, key: false, status: 'Unavailable' },
  { plan: 'Custom', reported: true, key: true, status: 'Enabled' },
  { plan: 'Custom', reported: undefined, key: false, status: 'Not confirmed' },
  { plan: 'Plus', reported: undefined, key: true, status: 'Included in plan' },
]) {
  test(`API access respects ${access.plan} with capability ${String(access.reported)}`, async ({ page }) => {
    const profile = seedProfile();
    profile.subscription = { type: access.plan, api_access: access.reported };
    const writes = await routeAccount(page, profile);
    await page.goto('/api');
    await expect(page.locator('.app-shell:not([inert])')).toBeVisible();
    const key = page.locator('.api-key-card').getByLabel('API key', { exact: true });
    if (access.key) {
      await expect(key).toHaveValue(profile.api_key!);
      await expect(page.getByRole('button', { name: 'Rotate key', exact: true })).toBeVisible();
    } else {
      await expect(key).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Rotate key', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Check account', exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Compare plans', exact: true })).toHaveCount(0);
    }
    await page.getByRole('tab', { name: 'Usage & limits', exact: true }).click();
    await expect(page.locator('.api-limits .account-facts > div').filter({ has: page.locator('dt', { hasText: /^API access$/ }) }).locator('dd')).toHaveText(access.status);
    expect(writes).toEqual([]);
  });
}

test('documentation links and browser Back keep the selected API tab reachable', async ({ page }) => {
  await routeAccount(page, seedProfile());
  await page.goto('/api?section=docs#authentication');
  await page.getByRole('link', { name: 'API key', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'API key', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'API key', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/section=docs#authentication$/);
  await expect(page.getByRole('tab', { name: 'Documentation', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Compare API limits', exact: true }).click();
  await page.getByRole('link', { name: 'Usage & limits', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Usage & limits', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'View API rate limits', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Documentation', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Plans & limits', exact: true })).toBeVisible();
  await page.goBack();
  const usage = page.getByRole('tab', { name: 'Usage & limits', exact: true });
  await expect(usage).toBeFocused();
  await usage.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'API key', exact: true })).toBeFocused();
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) test(`a copied schema link preserves the response field across reload and browser Back with ${reducedMotion} motion`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript(() => {
    Object.defineProperty(window, '__docLinks', { value: [] });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { __docLinks: string[] }).__docLinks.push(text); } } });
  });
  const target = '/api?section=docs&view=response&group=ports%5B%5D.tls_info&field=ja4s#get-host';
  await page.goto(target);
  const match = page.locator('.api-docs-article [data-doc-match="true"]');
  async function expectStableFieldFocus() {
    await expect(page.locator('.app-shell:not([inert])')).toBeVisible();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(match).toBeFocused();
    await expect(match).toBeInViewport();
  }
  await expectStableFieldFocus();
  await page.getByRole('button', { name: 'Copy link to this section', exact: true }).click();
  const copied = await page.evaluate(() => (window as unknown as { __docLinks: string[] }).__docLinks[0]);
  expect(new URL(copied).pathname + new URL(copied).search + new URL(copied).hash).toBe(target);
  await page.reload();
  await expectStableFieldFocus();
  await page.getByRole('tab', { name: 'Request', exact: true }).click();
  await expect(page).toHaveURL(/section=docs#get-host$/);
  await page.goBack();
  const response = page.getByRole('tab', { name: 'Response', exact: true });
  await expect(response).toHaveAttribute('aria-selected', 'true');
  await expect(response).toBeFocused();
  await expect(match).toBeVisible();
});
