import { expect, test, type Page } from '@playwright/test';

const historyKey = 'apcosys.search-history.v1:history-sync';

async function account(page: Page, requests: string[]) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: { user_id: 'history-sync', user_name: 'researcher', user_type: 'USER', credits: 5000, subscription: { type: 'Business' } } }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const request = JSON.parse(String(raw)); requests.push(request.type);
    socket.send(JSON.stringify({ id: request.id, type: request.type, data: { unread_count: 0 } }));
  }));
}

test('history reflects another tab’s clear and pause when returning without a search request', async ({ page }, info) => {
  const requests: string[] = [];
  await account(page, requests);
  await page.addInitScript(key => {
    const now = Date.now();
    localStorage.setItem(key, JSON.stringify({ version: 1, enabled: true, entries: [{ id: 'recent', dataset: 'public', request: { full_text_search: 'nginx', page: 1 }, firstRunAt: now, lastRunAt: now }] }));
  }, historyKey);
  await page.goto('/search/history');
  await expect(page.locator('.search-history-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'New search', exact: true }).click();
  const other = await page.context().newPage();
  await account(other, requests); await other.goto('/search/history');
  await expect(other.locator('.search-history-row')).toHaveCount(1);
  await other.getByRole('switch', { name: 'Save history', exact: true }).uncheck();
  await other.getByRole('button', { name: 'Clear history', exact: true }).click();
  await other.getByRole('dialog', { name: 'Clear search history?', exact: true }).getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(other.locator('.search-history-row')).toHaveCount(0);
  await page.getByRole('link', { name: 'Search history', exact: true }).click();
  await expect(page.locator('.search-history-row')).toHaveCount(0);
  await expect(page.getByRole('switch', { name: 'Save history', exact: true })).not.toBeChecked();
  await expect(page.getByRole('heading', { name: 'History is paused', exact: true })).toBeVisible();
  expect(requests.filter(type => ['hosts', 'private_hosts', 'analytics', 'private_analytics'].includes(type))).toEqual([]);
  await page.screenshot({ path: info.outputPath('history-cross-tab-reconciled.png'), animations: 'disabled' });
  await other.close();
});
