import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page) {
  const requests: { type: string; data: Record<string, unknown> }[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'field-search', user_name: 'researcher', user_type: 'USER', credits: 5000, subscription: { type: 'Business' } }) }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const request = JSON.parse(String(raw)); requests.push(request);
    const send = (type: string, data: unknown) => socket.send(JSON.stringify({ type, id: request.id, data, metadata: { subscription_type: 'Business' } }));
    if (/^(?:private_)?hostinfo$/.test(request.type)) {
      send(request.type, { ip: '192.0.2.44', ports: [{ port: 443, protocol: 'https', transport: 'tcp', status_code: 200, title: 'Research "console"', banner: 'HTTP/1.1 200 OK', headers: { Server: ['Research server'], 'Content-Type': ['application/json; charset=utf-8'] }, banner_sha256: 'a'.repeat(64), body_sha256: 'b'.repeat(64), favicon_md5: 'c'.repeat(32) }] });
      send('dnsinfo', null); send('whois', null); if (request.type === 'hostinfo') send('domain_ip_map', []);
    } else if (/^(?:private_)?hosts$/.test(request.type)) send(request.type, [{ ip: '192.0.2.44', open_ports: [{ port: 443, protocol: 'https' }] }]);
    else send(request.type, { unread_count: 0 });
  }));
  return requests;
}

test('host fields open exact drafts, retain response navigation and run only explicitly', async ({ page }, info) => {
  const requests = await fixture(page);
  await page.goto('/hosts/192.0.2.44?tab=services&port=443&protocol=https&panel=details');
  await expect(page.getByRole('link', { name: 'Search title: Research "console"', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Search title: Research "console"', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible();
  const request = JSON.parse(new URL(page.url()).searchParams.get('request')!);
  expect(request.simple_search_filters).toEqual([{ field: 'title', value: JSON.stringify('Research "console"') }]);
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible();
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(0);
  await page.getByRole('button', { name: 'Run search', exact: true }).last().click();
  await expect(page.locator('.search-result-row')).toHaveCount(1);
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(1);
  await page.goto('/hosts/192.0.2.44?tab=services&port=443&protocol=https&panel=details&response=headers');
  const headerLink = page.getByRole('link', { name: 'Search headers.Server: Research server', exact: true });
  await expect(headerLink).toBeVisible();
  const source = page.url();
  await page.screenshot({ path: info.outputPath('host-field-search-headers.png'), fullPage: false, animations: 'disabled' });
  await headerLink.click();
  expect(JSON.parse(new URL(page.url()).searchParams.get('request')!).simple_search_filters).toEqual([{ field: 'headers.Server', value: 'Research server' }]);
  await page.goBack(); await expect(page).toHaveURL(source);
  await expect(page.getByRole('tab', { name: 'Headers', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByText('Response fingerprints', { exact: true }).click();
  await expect(page.getByRole('link', { name: `Search banner_sha256: ${'a'.repeat(64)}`, exact: true })).toBeVisible();
});

test('private pivots retain task scope without requesting data before confirmation', async ({ page }) => {
  const requests = await fixture(page);
  const request = encodeURIComponent(JSON.stringify({ task_ids: ['task-one', 'task-two'], full_text_search: 'old filter', page: 9 }));
  await page.goto(`/private/hosts/192.0.2.44?tab=services&port=443&panel=details&request=${request}&scanner_back=${encodeURIComponent('/scanner?section=history')}`);
  await page.getByRole('link', { name: 'Search protocol: https', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Run this search', exact: true })).toBeVisible();
  const url = new URL(page.url()), draft = JSON.parse(url.searchParams.get('request')!);
  expect(url.pathname).toBe('/private/search');
  expect(draft.task_ids).toEqual(['task-one', 'task-two']);
  expect(draft.full_text_search).toBeUndefined();
  expect(draft.page).toBe(1);
  expect(url.searchParams.get('scanner_back')).toBe('/scanner?section=history');
  expect(requests.filter(item => item.type === 'private_hosts')).toHaveLength(0);
  await page.getByRole('button', { name: 'Run search', exact: true }).last().click();
  await expect(page.locator('.search-result-row')).toHaveCount(1);
  expect(requests.filter(item => item.type === 'private_hosts')).toHaveLength(1);
  expect(requests.find(item => item.type === 'private_hosts')!.data.task_ids).toEqual(['task-one', 'task-two']);
});
