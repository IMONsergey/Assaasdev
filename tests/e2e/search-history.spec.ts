import { chooseOption } from './helpers/controls';
import { expect, test, type Page } from '@playwright/test';

type Request = { type: string; data: Record<string, unknown> };
type Actor = { id: string };
const historyKey = (id: string) => `apcosys.search-history.v1:${encodeURIComponent(id)}`;

async function setup(page: Page, requests: Request[], actor: Actor = { id: 'history-qa' }) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: actor.id, user_name: 'researcher', user_type: 'USER', credits: 5000, subscription: { type: 'Business', credits: 5000 } }) }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(message => {
    const request = JSON.parse(String(message)) as Request & { id: string }; requests.push(request);
    const send = (data: unknown) => socket.send(JSON.stringify({ type: request.type, id: request.id, data, metadata: { subscription_type: 'Business' } }));
    if (request.type === 'hosts' || request.type === 'private_hosts') send(Array.from({ length: Number(request.data.docs_per_page) || 20 }, (_, index) => ({ ip: `192.0.2.${index + 1}`, org: 'Example Research Network', country_code: 'DE', city_name: 'Berlin', open_ports: [{ port: 443, protocol: 'https' }], uts: 1792756800 })));
    else if (request.type === 'autocomplete') send({ results: request.data.field === 'products' ? ['Caddy 2'] : [], has_more: false });
    else if (request.type === 'query_list') send([]);
    else send({ unread_count: 0 });
  }));
}
const searches = (requests: Request[]) => requests.filter(item => item.type === 'hosts' || item.type === 'private_hosts');
const queryInput = (page: Page) => page.getByRole('combobox', { name: 'Search internet infrastructure' });
const historyRows = (page: Page) => page.locator('.search-history-row');
async function submit(page: Page, query: string) {
  await queryInput(page).fill(query); await page.locator('.search-query-bar').getByRole('button', { name: 'Run search', exact: true }).click();
  await expect(page.locator('.search-result-row').first()).toBeVisible();
}

test('typing is not recorded; restore and reload remain drafts; explicit run makes one request', async ({ page }) => {
  const requests: Request[] = []; await setup(page, requests); await page.goto('/search');
  await queryInput(page).fill('unsubmitted draft');
  await page.getByRole('link', { name: 'Search history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No recent searches', exact: true })).toBeVisible();
  expect(searches(requests)).toHaveLength(0);
  await page.getByRole('link', { name: 'New search', exact: true }).click(); await submit(page, 'example');
  expect(searches(requests)).toHaveLength(1);
  await page.getByRole('link', { name: 'Search history', exact: true }).click();
  await expect(historyRows(page)).toHaveCount(1);
  await historyRows(page).getByRole('link', { name: 'Restore', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('draft')).toBe('1'); expect(new URL(page.url()).searchParams.has('run')).toBe(false);
  await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible();
  await expect(page.locator('.search-result-row')).toHaveCount(0);
  expect(searches(requests)).toHaveLength(1);
  for (const [action, title] of [['share-search', 'Share search'], ['save-query', 'Save query']]) {
    const draftUrl = page.url(), trigger = page.locator(`[data-onboarding="${action}"]`);
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(draftUrl);
    await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(draftUrl);
    await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('draft')).toBe('1'); expect(searches(requests)).toHaveLength(1);
  }
  await page.reload(); await expect(queryInput(page)).toHaveValue('example');
  await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load analytics', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  expect(searches(requests)).toHaveLength(1); expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
  await page.locator('.search-results-list').getByRole('button', { name: 'Run search', exact: true }).click();
  await expect(page.locator('.search-result-row')).toHaveCount(20);
  expect(searches(requests)).toHaveLength(2); expect(new URL(page.url()).searchParams.has('draft')).toBe(false);
  await page.getByRole('link', { name: 'Search history', exact: true }).click();
  await expect(historyRows(page)).toHaveCount(1);
  await historyRows(page).getByRole('button', { name: 'Run search: example', exact: true }).click();
  await expect(page.locator('.search-result-row')).toHaveCount(20);
  await expect.poll(() => searches(requests).length).toBe(3);
  await page.getByRole('link', { name: 'Search history', exact: true }).click(); await page.goBack();
  await expect(page.locator('.search-result-row')).toHaveCount(20); expect(searches(requests)).toHaveLength(3);
});

test('private scope, nested filters and scanner context survive history; pagination is one logical query', async ({ page }) => {
  const requests: Request[] = []; await setup(page, requests);
  const body = { full_text_search: '例え.テスト', task_ids: ['task-a', 'task-b'], simple_search_filters: [{ operator: 'NOT', filters: [{ field: 'port', value: '22' }] }], range_filter: [{ field: 'uts', start: 0, end: 1792756800 }], page: 1, docs_per_page: 20 };
  const params = new URLSearchParams({ request: JSON.stringify(body), draft: '1', scanner_back: '/scanner?tab=history&q=research&page=2' });
  await page.goto(`/private/search?${params}`);
  await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible(); expect(searches(requests)).toHaveLength(0);
  await page.locator('.search-results-list').getByRole('button', { name: 'Run search', exact: true }).click(); await expect(page.locator('.search-result-row')).toHaveCount(20);
  expect(searches(requests)[0]).toMatchObject({ type: 'private_hosts', data: body });
  const timestamp = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).entries[0].lastRunAt, historyKey('history-qa'));
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.search-result-count')).toContainText('Page 2');
  await expect.poll(() => searches(requests).length).toBe(2);
  await page.getByRole('link', { name: 'Search history', exact: true }).click(); await expect(historyRows(page)).toHaveCount(1);
  await expect(historyRows(page)).toContainText('Private scans'); await expect(historyRows(page)).toContainText('2 scan tasks');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).entries[0].lastRunAt, historyKey('history-qa'))).toBe(timestamp);
  await historyRows(page).getByRole('link', { name: 'Restore', exact: true }).click();
  const restored = new URL(page.url()); expect(restored.pathname).toBe('/private/search');
  expect(JSON.parse(restored.searchParams.get('request')!)).toEqual(body);
  expect(restored.searchParams.get('scanner_back')).toBe('/scanner?tab=history&q=research&page=2');
  await page.reload(); await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible(); expect(searches(requests)).toHaveLength(2);
  await expect(page.getByRole('link', { name: 'Back to scanner', exact: true })).toHaveAttribute('href', '/scanner?tab=history&q=research&page=2');
});

test('delete and clear support undo, filters work and local changes survive reload', async ({ page }) => {
  const requests: Request[] = []; await setup(page, requests);
  await page.addInitScript(key => {
    if (localStorage.getItem(key)) return;
    const now = Date.now();
    localStorage.setItem(key, JSON.stringify({ version: 1, enabled: true, entries: [
      { id: 'today', dataset: 'public', request: { full_text_search: 'nginx', page: 1 }, firstRunAt: now, lastRunAt: now },
      { id: 'yesterday', dataset: 'private', request: { full_text_search: 'private audit', task_ids: ['task-a'], page: 1 }, firstRunAt: now - 86_400_000, lastRunAt: now - 86_400_000 },
      { id: 'older', dataset: 'public', request: { full_text_search: 'caddy', page: 1 }, firstRunAt: now - 40 * 86_400_000, lastRunAt: now - 40 * 86_400_000 },
    ] }));
  }, historyKey('history-qa'));
  await page.goto('/search/history'); await expect(historyRows(page)).toHaveCount(3);
  await page.getByLabel('Find a search', { exact: true }).fill('nginx'); await expect(historyRows(page)).toHaveCount(1);
  await page.getByLabel('Find a search', { exact: true }).fill(''); await chooseOption(page.getByLabel('Scope', { exact: true }), 'private'); await expect(historyRows(page)).toHaveCount(1); await expect(historyRows(page)).toContainText('private audit');
  await chooseOption(page.getByLabel('Scope', { exact: true }), 'all'); await chooseOption(page.getByLabel('Period', { exact: true }), '7'); await expect(historyRows(page)).toHaveCount(2);
  await chooseOption(page.getByLabel('Period', { exact: true }), '90');
  await page.getByRole('button', { name: 'Delete search: nginx', exact: true }).click(); await expect(historyRows(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(historyRows(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page.getByRole('dialog', { name: 'Clear search history?', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(historyRows(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await page.getByRole('dialog', { name: 'Clear search history?', exact: true }).getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(historyRows(page)).toHaveCount(0); await page.getByRole('button', { name: 'Undo', exact: true }).click(); await expect(historyRows(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Delete search: caddy', exact: true }).click(); await page.reload(); await expect(historyRows(page)).toHaveCount(2);
  await page.getByRole('button', { name: 'Delete search: nginx', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeFocused();
  await page.keyboard.press('Enter'); await expect(page.getByRole('link', { name: 'nginx', exact: true })).toBeFocused();
  await expect(historyRows(page)).toHaveCount(2);
  expect(searches(requests)).toHaveLength(0);
});

test('history is isolated per account and pausing survives navigation and reload', async ({ page }) => {
  const requests: Request[] = [], actor = { id: 'account-a' }; await setup(page, requests, actor);
  await page.goto('/search'); await submit(page, 'account a search');
  await page.getByRole('link', { name: 'Search history', exact: true }).click(); await expect(historyRows(page)).toHaveCount(1);
  actor.id = 'account-b'; await page.reload(); await expect(historyRows(page)).toHaveCount(0);
  await page.getByRole('link', { name: 'New search', exact: true }).click(); await submit(page, 'account b search');
  await page.getByRole('link', { name: 'Search history', exact: true }).click(); await expect(historyRows(page)).toHaveCount(1); await expect(historyRows(page)).toContainText('account b search');
  actor.id = 'account-a'; await page.reload(); await expect(historyRows(page)).toHaveCount(1); await expect(historyRows(page)).toContainText('account a search');
  await page.getByRole('switch', { name: 'Save history', exact: true }).uncheck();
  await page.getByRole('link', { name: 'New search', exact: true }).click(); await submit(page, 'not saved');
  await page.getByRole('link', { name: 'Search history', exact: true }).click(); await page.reload();
  await expect(page.getByRole('switch', { name: 'Save history', exact: true })).not.toBeChecked(); await expect(historyRows(page)).toHaveCount(1); await expect(historyRows(page)).toContainText('account a search');
});

test('limited shares and credential-shaped searches are not written to history', async ({ page }) => {
  const requests: Request[] = []; await setup(page, requests);
  await page.goto('/search?q=shared-search&run=1&st=do-not-persist-this-token'); await expect(page.locator('.search-result-row').first()).toBeVisible();
  await page.goto('/search'); await submit(page, 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz');
  await page.getByRole('link', { name: 'Search history', exact: true }).click(); await expect(historyRows(page)).toHaveCount(0);
  const stored = await page.evaluate(key => localStorage.getItem(key), historyKey('history-qa'));
  expect(stored).not.toContain('do-not-persist-this-token'); expect(stored).not.toContain('abcdefghijklmnopqrstuvwxyz');
});

for (const width of [1440, 768, 390, 320]) test(`search suggestions and history layout at ${width}px`, async ({ page }, testInfo) => {
  const requests: Request[] = []; await setup(page, requests);
  await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/search');
  // The entrance keeps the workspace inert until its home input receives focus.
  await expect(queryInput(page)).toBeFocused();
  await queryInput(page).fill('cad');
  await expect(queryInput(page)).toHaveValue('cad');
  await expect(page.getByRole('option', { name: 'Caddy 2 Product filter', exact: true })).toBeVisible();
  await expect(page.locator('.search-suggestions kbd')).toHaveCount(0);
  await expect(page.getByText('Choose a suggestion or continue typing', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => {
    const panel = document.querySelector('.search-suggestions')!.getBoundingClientRect();
    return [...document.querySelectorAll<HTMLElement>('.search-query-kinds .icon')].every(icon => {
      const box = icon.getBoundingClientRect(), x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (x < panel.left || x > panel.right || y < panel.top || y > panel.bottom) return true;
      return Boolean(document.elementFromPoint(x, y)?.closest('.search-suggestions'));
    });
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`search-suggestions-${width}.png`), animations: 'disabled' });
  await queryInput(page).press('Escape'); await submit(page, 'nginx');
  await queryInput(page).fill('country_name: Germany'); await page.locator('.search-query-bar').getByRole('button', { name: 'Run search', exact: true }).click();
  await expect(page.locator('.search-result-row').first()).toBeVisible();
  await page.getByRole('link', { name: 'Search history', exact: true }).click(); await expect(historyRows(page)).toHaveCount(2);
  await expect.poll(() => page.locator('.search-history-toolbar').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const action of [historyRows(page).first().getByRole('link', { name: 'Restore', exact: true }), historyRows(page).first().getByRole('button', { name: /^Run search:/ })]) {
    const bounds = await action.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: testInfo.outputPath(`search-history-${width}.png`), animations: 'disabled' });
  await historyRows(page).first().locator('summary').click(); await expect(historyRows(page).first().locator('.code-canvas')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`search-history-conditions-${width}.png`), animations: 'disabled' });
});
