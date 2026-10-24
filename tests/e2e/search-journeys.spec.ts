import { expect, test, type Page } from '@playwright/test';

async function openAnalytics(page: Page) {
  const tab = page.getByRole('tab', { name: 'Analytics', exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  const load = page.getByRole('button', { name: 'Load analytics', exact: true });
  if (await load.isVisible()) await load.click();
}


// These journeys guard billable search intent and keyboard context, beyond route rendering.
test('editing result type keeps condition drafts uncommitted and Escape restores focus', async ({ page }) => {
  await page.goto('/search?q=nginx&run=1');
  await expect(page.getByRole('heading', { name: '4 hosts returned' })).toBeVisible();
  const before = page.url();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Filters', exact: true });
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Add condition', exact: true }).click();
  await editor.getByLabel('Field', { exact: true }).fill('country_name');
  await editor.getByLabel('Value', { exact: true }).fill('Germany');
  await editor.getByRole('combobox', { name: 'Result type', exact: true }).selectOption('ipv4');
  await expect(editor).toBeVisible();
  expect(page.url()).toBe(before);
  // Move out of the native suggestions popup: its first Escape dismisses
  // suggestions, while this check exercises the dialog's own dismissal.
  await editor.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(editor).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
  await expect(page.getByRole('combobox', { name: 'Result type', exact: true })).toHaveValue('');
  expect(page.url()).toBe(before);
});

test('facet selection combines alternatives once and survives results navigation', async ({ page }) => {
  await page.goto('/search?q=example&run=1');
  await expect(page.getByRole('heading', { name: '12 hosts returned', exact: true })).toBeVisible();
  await openAnalytics(page);
  const analytics = page.getByRole('complementary', { name: 'Result analytics' });
  const germany = analytics.getByRole('button', { name: /^Germany/ });
  const usa = analytics.getByRole('button', { name: /^United States/ });
  await expect(germany).toBeVisible();
  const before = page.url();
  await germany.click();
  await usa.click();
  await expect(germany).toHaveAttribute('aria-pressed', 'true');
  await expect(usa).toHaveAttribute('aria-pressed', 'true');
  expect(page.url()).toBe(before);
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: '6 hosts returned', exact: true })).toBeVisible();
  const request = JSON.parse(new URL(page.url()).searchParams.get('request')!);
  expect(request.simple_search_filters).toEqual([{ operator: 'OR', filters: [{ field: 'country_name', value: 'Germany' }, { field: 'country_name', value: 'United States' }] }]);
  await openAnalytics(page);
  await analytics.getByRole('button', { name: /^Germany/ }).click();
  await page.getByRole('button', { name: 'Cancel changes', exact: true }).click();
  await expect(analytics.getByRole('button', { name: /^Germany/ })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expect(page.getByRole('heading', { name: '12 hosts returned', exact: true })).toBeVisible();
  await openAnalytics(page);
  await expect(germany).toHaveAttribute('aria-pressed', 'false');
});

test('an out-of-plan page preserves the query and offers an actionable recovery', async ({ page }) => {
  await page.goto('/search?q=nginx&run=1&page=301');
  await expect(page.getByText('This page is outside your plan', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Search internet infrastructure', exact: true })).toHaveValue('nginx');
  await expect(page.getByRole('heading', { name: /hosts returned/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to first page', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4 hosts returned', exact: true })).toBeVisible();
  expect(JSON.parse(new URL(page.url()).searchParams.get('request')!).page).toBe(1);
});

test('a mobile deep service link reveals its page and supports returning to the service list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/hosts/198.51.100.24?port=10999');
  await page.getByRole('button', { name: 'Back to service list', exact: true }).click();
  const list = page.getByRole('complementary', { name: 'Service list', exact: true });
  await expect(list.getByRole('button', { pressed: true })).toContainText('10999');
  await expect(page.getByRole('navigation', { name: 'Received service pages' })).toContainText('40 / 40');
  await expect(list.locator('.host-service-row')).toHaveCount(25);
  await list.locator('.host-service-row').first().click();
  const details = page.getByRole('region', { name: 'Selected service details', exact: true });
  await expect(details).toBeFocused();
  await expect(details.getByRole('heading', { level: 2 }).first()).toContainText('10975');
  await details.getByRole('button', { name: 'Back to service list', exact: true }).click();
  await expect(list).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('result and 1000-service layouts fit intermediate widths with large text', async ({ page }, testInfo) => {
  await page.goto('/settings?section=appearance');
  await page.getByLabel('Text size').selectOption('125');
  for (const width of [1024, 820, 540, 320]) {
    await page.setViewportSize({ width, height: 780 });
    for (const path of ['/search?run=1', '/hosts/198.51.100.24']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      if (path.startsWith('/hosts')) {
        await page.getByRole('tab', { name: /^Services/ }).click();
        await expect(page.locator('.host-service-row')).toHaveCount(25);
      }
      else await expect(page.getByRole('heading', { name: '12 hosts returned', exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (!path.startsWith('/hosts')) {
        const sort = await page.getByRole('combobox', { name: 'Sort', exact: true }).boundingBox();
        expect(sort!.width).toBeGreaterThan(110);
      }
      if (width === 820 || width === 320) await page.screenshot({ path: testInfo.outputPath(`${path.startsWith('/hosts') ? 'host' : 'results'}-large-text-${width}.png`), fullPage: false });
    }
  }
});

async function mockSearchApi(page: Page, requests: Array<{ type: string; data: Record<string, unknown> }>, options: { holdHosts?: boolean; facetCount?: number; malformedHosts?: boolean } = {}) {
  const held: Array<() => void> = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'search-contract', user_name: 'search_contract', user_type: 'USER', credits: 5000, subscription: { type: 'Business', credits: 5000 } }) }));
  await page.routeWebSocket('**/backend/ws', socket => {
    socket.onMessage(message => {
      const request = JSON.parse(String(message)) as { type: string; id: string; data: Record<string, unknown> };
      requests.push(request);
      const send = (type: string, data: unknown) => socket.send(JSON.stringify({ type, id: request.id, data, metadata: { subscription_type: 'Business' } }));
      if (request.type === 'hosts') {
        const count = Number(request.data.docs_per_page) || 20;
        const hosts: unknown[] = Array.from({ length: count }, (_, index) => ({ ip: `192.0.2.${index + 1}`, org: 'Contract fixture', open_ports: [{ port: 443, protocol: 'https' }] }));
        if (options.malformedHosts) { hosts[0] = null; hosts[1] = { ip: '192.0.2.2', org: { invalid: true }, labels_list: [null, 'verified'], open_ports: [null, { port: 443 }, { port: '80' }] }; }
        if (options.holdHosts) held.push(() => send('hosts', hosts)); else send('hosts', hosts);
      } else if (request.type === 'analytics') {
        send('analytics', options.facetCount ? { facet_name: 'org', facet_values: Array.from({ length: options.facetCount }, (_, index) => ({ key: `Organization ${String(index).padStart(4, '0')}`, doc_count: index + 1 })) } : { facet_name: 'country_name', facet_values: [{ key: 'Germany', doc_count: 100 }] });
        send('analytics', { complete: true });
      } else if (request.type === 'hostinfo') {
        send('hostinfo', { ip: '192.0.2.10', ports: [{ port: 443, protocol: 'https', detected_products: [{ product: 'Large fixture', exposed_data: { field_headers: ['record'], field_value: Array.from({ length: 10000 }, (_, index) => [`record-${String(index).padStart(5, '0')}`]) } }] }] });
        send('dnsinfo', null); send('whois', null); send('domain_ip_map', []);
      } else send(request.type, { unread_count: 0 });
    });
  });
  return { releaseHosts: () => { for (const send of held.splice(0)) send(); } };
}

test('pagination, sorting and row count reuse analytics instead of spending another analytics request', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  await mockSearchApi(page, requests);
  await page.goto('/search?q=example&run=1');
  await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
  await openAnalytics(page);
  await expect(page.getByRole('complementary', { name: 'Result analytics' }).getByRole('button', { name: /^Germany/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  const pages = page.getByRole('navigation', { name: 'Pagination', exact: true });
  await pages.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(pages).toContainText('Page 2');
  await expect(page.getByRole('combobox', { name: 'Sort', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('ip:asc');
  await expect(pages).toContainText('Page 1');
  await expect(page.getByRole('combobox', { name: 'Rows', exact: true })).toBeEnabled();
  await page.getByRole('combobox', { name: 'Rows', exact: true }).selectOption('10');
  await expect(page.getByRole('heading', { name: '10 hosts returned', exact: true })).toBeVisible();
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(4);
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(1);
  await openAnalytics(page);
  await page.getByRole('button', { name: 'Reload analytics', exact: true }).click();
  await expect.poll(() => requests.filter(item => item.type === 'analytics').length).toBe(2);
});

test('large exposed-data responses render bounded pages without dropping records or making another host request', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  await mockSearchApi(page, requests);
  await page.goto('/hosts/192.0.2.10?tab=exposed');
  const table = page.getByRole('region', { name: 'Large fixture exposed data', exact: true });
  await expect(table).toBeVisible();
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(table).toContainText('record-00000');
  await expect(table).not.toContainText('record-00050');
  const pages = page.getByRole('navigation', { name: 'Pagination', exact: true });
  await expect(pages).toContainText('10,000 results');
  await pages.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await expect(table).toContainText('record-00050');
  await expect(table).not.toContainText('record-00000');
  expect(requests.filter(item => item.type === 'hostinfo')).toHaveLength(1);
});


test('mobile analytics waits for an explicit load and then reuses its result', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  await mockSearchApi(page, requests);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/search?q=example&run=1');
  await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load analytics', exact: true })).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
  await page.getByRole('button', { name: 'Load analytics', exact: true }).click();
  const analytics = page.getByRole('complementary', { name: 'Result analytics' });
  await expect(analytics.getByRole('button', { name: /^Germany/ })).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(1);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expect(analytics).not.toBeVisible();
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await expect(analytics.getByRole('button', { name: /^Germany/ })).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(1);
});

test('filters open from the left without moving the home search and keep actions visible', async ({ page }) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/search');
    const search = page.locator('.search-entry');
    const before = await search.boundingBox();
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'Filters', exact: true });
    await expect(editor).toBeVisible();
    const during = await search.boundingBox();
    expect(Math.abs(before!.x - during!.x)).toBeLessThan(1);
    expect(Math.abs(before!.y - during!.y)).toBeLessThan(1);
    expect(Math.abs(before!.width - during!.width)).toBeLessThan(1);
    const box = (await editor.boundingBox())!, main = (await page.locator('.workspace-main').boundingBox())!, header = (await page.locator('.app-topbar').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(main.x);
    expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await editor.getByRole('button', { name: 'Add group', exact: true }).click();
    await editor.locator('.search-condition-group').first().getByRole('button', { name: 'Add group', exact: true }).click();
    await expect(editor.getByRole('button', { name: 'Apply conditions', exact: true })).toBeInViewport();
    await expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
    expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(editor).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
  }
});

test('a slow search does not lock filter cancellation or applying a changed query', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  const control = await mockSearchApi(page, requests, { holdHosts: true });
  await page.goto('/search?q=example&run=1');
  await expect.poll(() => requests.filter(item => item.type === 'hosts').length).toBe(1);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Filters', exact: true });
  await editor.getByRole('textbox', { name: 'Search text', exact: true }).fill('discard this');
  await expect(editor.getByRole('button', { name: 'Apply conditions', exact: true })).toBeEnabled();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Search internet infrastructure', exact: true })).toHaveValue('example');
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(1);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await editor.getByRole('textbox', { name: 'Search text', exact: true }).fill('refined');
  await editor.getByRole('button', { name: 'Apply conditions', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await expect.poll(() => requests.filter(item => item.type === 'hosts').length).toBe(2);
  expect(requests.filter(item => item.type === 'hosts')[1].data.full_text_search).toBe('refined');
  control.releaseHosts();
  await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
});

test('changing result type waits for explicit apply and preserves complex type rules', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  await mockSearchApi(page, requests);
  await page.goto('/search?q=example&run=1');
  await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
  const before = page.url();
  await page.getByRole('combobox', { name: 'Result type', exact: true }).selectOption('ipv4');
  expect(page.url()).toBe(before);
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(1);
  const sort = page.getByRole('combobox', { name: 'Sort', exact: true });
  const rows = page.getByRole('combobox', { name: 'Rows', exact: true });
  const next = page.getByRole('navigation', { name: 'Pagination', exact: true }).getByRole('button', { name: 'Next', exact: true });
  await expect(sort).toBeDisabled();
  await expect(rows).toBeDisabled();
  await expect(next).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel changes', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Result type', exact: true })).toHaveValue('');
  await expect(sort).toBeEnabled();
  await expect(rows).toBeEnabled();
  await expect(next).toBeEnabled();
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(1);
  await page.getByRole('combobox', { name: 'Result type', exact: true }).selectOption('ipv4');
  await expect(sort).toBeDisabled();
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect.poll(() => requests.filter(item => item.type === 'hosts').length).toBe(2);
  expect(requests.filter(item => item.type === 'hosts')[1].data.simple_search_filters).toEqual([{ field: 'type', value: 'ipv4' }]);
  await expect(sort).toBeEnabled();
  await expect(rows).toBeEnabled();
  await expect(next).toBeEnabled();
  const complex = { full_text_search: 'complex', simple_search_filters: [{ operator: 'OR', filters: [{ field: 'type', value: 'ipv6' }, { field: 'country_name', value: 'France' }] }, { operator: 'NOT', filters: [{ field: 'type', value: 'domain' }] }] };
  await page.goto(`/search?request=${encodeURIComponent(JSON.stringify(complex))}&run=1`);
  await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Result type', exact: true })).toHaveValue('custom');
  await expect(page.getByRole('combobox', { name: 'Result type', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Filters', exact: true });
  await expect(editor.getByRole('combobox', { name: 'Result type', exact: true })).toBeDisabled();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(JSON.parse(new URL(page.url()).searchParams.get('request')!)).toEqual(complex);
});

test('5000 facet values stay bounded and preserve selections across search and pages', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  await mockSearchApi(page, requests, { facetCount: 5000 });
  await page.goto('/search?q=example&run=1');
  const analytics = page.getByRole('complementary', { name: 'Result analytics' });
  await openAnalytics(page);
  const facet = analytics.getByRole('region', { name: 'Organization', exact: true });
  await expect(facet.locator('.search-facet-item')).toHaveCount(5);
  await facet.getByRole('button', { name: 'Browse all 5,000 values', exact: true }).click();
  await expect(facet.locator('.search-facet-item')).toHaveCount(50);
  await facet.getByRole('button', { name: /^Organization 0000 / }).click();
  await facet.getByRole('button', { name: 'Next organization values', exact: true }).click();
  await expect(facet.locator('.search-facet-item')).toHaveCount(50);
  await facet.getByRole('button', { name: /^Organization 0050 / }).click();
  await facet.getByRole('searchbox', { name: 'Search organization values', exact: true }).fill('4999');
  await expect(facet.locator('.search-facet-item')).toHaveCount(1);
  await facet.getByRole('button', { name: /^Organization 4999 / }).click();
  await facet.getByRole('searchbox', { name: 'Search organization values', exact: true }).clear();
  await facet.getByRole('button', { name: 'Selected (3)', exact: true }).click();
  await expect(facet.locator('.search-facet-item')).toHaveCount(3);
  await expect(facet.locator('.search-facet-item button[aria-pressed="true"]')).toHaveCount(3);
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(1);
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(1);
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect.poll(() => requests.filter(item => item.type === 'hosts').length).toBe(2);
  const applied = requests.filter(item => item.type === 'hosts')[1].data.simple_search_filters;
  expect(applied).toEqual([{ operator: 'OR', filters: ['0000', '0050', '4999'].map(value => ({ field: 'org', value: `Organization ${value}` })) }]);
});

test('malformed host rows do not crash results or prematurely end pagination', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockSearchApi(page, requests, { malformedHosts: true });
  await page.goto('/search?q=example&run=1');
  await expect(page.getByRole('heading', { name: '19 hosts returned', exact: true })).toBeVisible();
  await expect(page.getByText('Some returned data is incomplete', { exact: true })).toBeVisible();
  const row = page.locator('.search-result-row').filter({ has: page.getByRole('link', { name: '192.0.2.2', exact: true }) });
  await expect(row.getByRole('link', { name: '443', exact: true })).toBeVisible();
  const pages = page.getByRole('navigation', { name: 'Pagination', exact: true });
  await expect(pages.getByRole('button', { name: 'Next', exact: true })).toBeEnabled();
  await pages.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(pages).toContainText('Page 2');
  expect(errors).toEqual([]);
});

test('invalid long filter drafts focus a visible error without changing the applied search', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  await mockSearchApi(page, requests);
  const request = { full_text_search: 'example', simple_search_filters: [{ operator: 'AND', filters: Array.from({ length: 16 }, () => ({ field: 'country_name', value: 'Germany' })) }] };
  await page.goto(`/search?request=${encodeURIComponent(JSON.stringify(request))}&run=1`);
  await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
  const before = page.url();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Filters', exact: true });
  await editor.getByLabel('Value', { exact: true }).first().clear();
  await editor.getByRole('button', { name: 'Apply conditions', exact: true }).click();
  const error = editor.getByRole('region', { name: 'Condition errors', exact: true });
  await expect(error).toBeFocused();
  await expect(error).toContainText('Enter a value for country_name.');
  await expect(error).toBeInViewport();
  const bounds = await error.boundingBox();
  const body = await editor.locator('.dialog-body').boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(body!.y);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(body!.y + body!.height + 1);
  await expect(editor).toBeVisible();
  expect(page.url()).toBe(before);
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(1);
});
