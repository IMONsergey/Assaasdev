import { expect, test, type Page } from '@playwright/test';

type Request = { type: string; data: Record<string, unknown> };
async function setup(page: Page, requests: Request[]) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'marks-qa', user_name: 'marks_qa', user_type: 'USER', credits: 5000, subscription: { type: 'Business', credits: 5000 } }) }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(message => {
    const request = JSON.parse(String(message)) as Request & { id: string }; requests.push(request);
    const send = (data: unknown) => socket.send(JSON.stringify({ type: request.type, id: request.id, data, metadata: { subscription_type: 'Business' } }));
    if (request.type === 'hosts') send([
      { ip: '2001:db8:1234:5678:90ab:cdef:1234:5678', org: 'Cloudflare, Inc.', os: 'Ubuntu Linux 24.04', country_code: 'GB', city_name: 'London', labels_list: ['web', 'vulnerability'], uts: 1792756800, open_ports: Array.from({ length: 1000 }, (_, index) => ({ port: index + 1, protocol: index % 2 ? 'https' : 'ssh' })) },
      { ip: '192.0.2.2', org: 'Unidentified Research Network', open_ports: [{ port: 3306 }], country_code: 'DE' },
    ]);
    else if (request.type === 'autocomplete') send({ results: request.data.field === 'products' ? ['Caddy 2'] : [], has_more: false });
    else if (request.type === 'hostinfo') { socket.send(JSON.stringify({ type: 'hostinfo', id: request.id, data: { ip: request.data.ip, ports: [] } })); send({ complete: true }); }
    else send({ unread_count: 0 });
  }));
}

test('observed identities receive marks without inferring technology from a port', async ({ page }) => {
  const requests: Request[] = []; await setup(page, requests);
  await page.goto('/search?q=infrastructure&run=1');
  const first = page.locator('.search-result-row').first();
  await expect(first.locator('[data-technology="cloudflare"]')).toBeVisible();
  await expect(first.locator('[data-technology="ubuntu"]')).toBeVisible();
  await expect(first.locator('.search-port-chip')).toHaveCount(4);
  await expect(first.locator('.search-port-overflow')).toContainText('+996');
  await expect(page.locator('.search-result-row').nth(1).locator('[data-technology]')).toHaveCount(0);
  await first.locator('.search-port-overflow').click();
  expect(new URL(page.url()).searchParams.get('tab')).toBe('services');
  expect(new URL(page.url()).searchParams.get('panel')).toBe('list');
  expect(new URL(page.url()).searchParams.get('q')).toBe('infrastructure');
  expect(requests.filter(request => request.type === 'hosts')).toHaveLength(1);
});

test('product completion uses a matching local mark and keeps search explicit', async ({ page }) => {
  const requests: Request[] = []; await setup(page, requests);
  await page.goto('/search');
  await page.getByRole('combobox', { name: 'Search internet infrastructure' }).fill('cad');
  const suggestion = page.getByRole('option', { name: 'Caddy 2 Product filter' });
  await expect(suggestion.locator('[data-technology="caddy"]')).toBeVisible();
  await suggestion.click();
  await expect(page.getByRole('dialog', { name: 'Filters', exact: true })).toBeVisible();
  expect(requests.filter(request => request.type === 'hosts' || request.type === 'analytics')).toHaveLength(0);
});

test('long IPv6 results and actions remain reachable on a narrow mobile display', async ({ page }) => {
  const requests: Request[] = []; await setup(page, requests);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addInitScript(() => localStorage.setItem('apcosys.view.v1', JSON.stringify({ theme: 'dark', fontScale: 125, reducedMotion: true, appearanceVersion: 2 })));
  await page.goto('/search?q=infrastructure&run=1');
  await expect(page.locator('.search-result-row').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const locator of [page.getByRole('tab', { name: 'Analytics', exact: true }), page.locator('[data-onboarding="save-query"]'), page.locator('[data-onboarding="share-search"]'), page.locator('[data-onboarding="export-search"]')]) {
    const box = await locator.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load analytics', exact: true })).toBeVisible();
  expect(requests.filter(request => request.type === 'analytics')).toHaveLength(0);
});

test('onboarding restores uncached conditions without spending a search until explicit confirmation', async ({ page }) => {
  const requests: Request[] = []; await setup(page, requests);
  await page.addInitScript(() => history.replaceState({ ...history.state, usr: { onboardingPreviewOnly: true } }, ''));
  await page.goto('/search?q=retained+conditions&run=1');
  await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Search internet infrastructure' })).toHaveValue('retained conditions');
  expect(requests.filter(request => request.type === 'hosts')).toHaveLength(0);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load analytics', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible();
  expect(requests.filter(request => request.type === 'hosts' || request.type === 'analytics')).toHaveLength(0);
  await page.locator('.search-results-list').getByRole('button', { name: 'Run search', exact: true }).click();
  await expect(page.locator('.search-result-row')).toHaveCount(2);
  await expect(page.locator('[data-onboarding="search-results"]')).toHaveAttribute('data-ready', 'true');
  expect(requests.filter(request => request.type === 'hosts')).toHaveLength(1);
  await page.getByRole('combobox', { name: 'Search internet infrastructure' }).fill('changed conditions');
  await expect(page.locator('[data-onboarding="search-results"]')).toHaveAttribute('data-ready', 'false');
  expect(requests.filter(request => request.type === 'hosts')).toHaveLength(1);
});
