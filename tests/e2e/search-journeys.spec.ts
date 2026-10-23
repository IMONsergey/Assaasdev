import { expect, test, type Page } from '@playwright/test';

// These journeys guard billable search intent and keyboard context, beyond route rendering.
test('editing result type keeps condition drafts uncommitted and Escape restores focus', async ({ page }) => {
  await page.goto('/search?q=nginx&run=1');
  await expect(page.getByRole('heading', { name: '4 hosts returned' })).toBeVisible();
  const before = page.url();
  await page.getByRole('button', { name: 'Add Filter', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Conditions', exact: true });
  await expect(editor.getByRole('heading', { name: 'Conditions', exact: true })).toBeFocused();
  await editor.getByRole('button', { name: 'Add condition', exact: true }).click();
  await editor.getByLabel('Field', { exact: true }).fill('country_name');
  await editor.getByLabel('Value', { exact: true }).fill('Germany');
  await page.getByLabel('Result type').selectOption('ipv4');
  await expect(editor).toBeVisible();
  expect(page.url()).toBe(before);
  await editor.getByLabel('Value', { exact: true }).first().focus();
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Filter', exact: true })).toBeFocused();
  await expect(page.getByLabel('Result type')).toHaveValue('');
  expect(page.url()).toBe(before);
});

test('facet selection combines alternatives once and survives results navigation', async ({ page }) => {
  await page.goto('/search?q=example&run=1');
  await expect(page.getByRole('heading', { name: '12 hosts returned', exact: true })).toBeVisible();
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
  await analytics.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: '6 hosts returned', exact: true })).toBeVisible();
  const request = JSON.parse(new URL(page.url()).searchParams.get('request')!);
  expect(request.simple_search_filters).toEqual([{ operator: 'OR', filters: [{ field: 'country_name', value: 'Germany' }, { field: 'country_name', value: 'United States' }] }]);
  await analytics.getByRole('button', { name: /^Germany/ }).click();
  await analytics.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(analytics.getByRole('button', { name: /^Germany/ })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page.getByRole('heading', { name: '12 hosts returned', exact: true })).toBeVisible();
  await expect(germany).toHaveAttribute('aria-pressed', 'false');
});

test('an out-of-plan page preserves the query and offers an actionable recovery', async ({ page }) => {
  await page.goto('/search?q=nginx&run=1&page=301');
  await expect(page.getByText('This page is outside your plan', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Search internet infrastructure', exact: true })).toHaveValue('nginx');
  await expect(page.getByRole('heading', { name: /hosts returned/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Return to first page', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4 hosts returned', exact: true })).toBeVisible();
  expect(JSON.parse(new URL(page.url()).searchParams.get('request')!).page).toBe(1);
});

test('a mobile deep service link reveals its page and supports returning to the service list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/hosts/198.51.100.24?port=10999');
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
  await page.goto('/settings');
  await page.getByLabel('Text size').selectOption('125');
  for (const width of [1024, 820, 540, 320]) {
    await page.setViewportSize({ width, height: 780 });
    for (const path of ['/search?run=1', '/hosts/198.51.100.24']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      if (path.startsWith('/hosts')) await expect(page.locator('.host-service-row')).toHaveCount(25);
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

async function mockSearchApi(page: Page, requests: Array<{ type: string; data: Record<string, unknown> }>) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'search-contract', user_name: 'search_contract', user_type: 'USER', credits: 5000, subscription: { type: 'Business', credits: 5000 } }) }));
  await page.routeWebSocket('**/backend/ws', socket => {
    socket.onMessage(message => {
      const request = JSON.parse(String(message)) as { type: string; id: string; data: Record<string, unknown> };
      requests.push(request);
      const send = (type: string, data: unknown) => socket.send(JSON.stringify({ type, id: request.id, data, metadata: { subscription_type: 'Business' } }));
      if (request.type === 'hosts') {
        const count = Number(request.data.docs_per_page) || 20;
        send('hosts', Array.from({ length: count }, (_, index) => ({ ip: `192.0.2.${index + 1}`, org: 'Contract fixture', open_ports: [{ port: 443, protocol: 'https' }] })));
      } else if (request.type === 'analytics') {
        send('analytics', { facet_name: 'country_name', facet_values: [{ key: 'Germany', doc_count: 100 }] });
        send('analytics', { complete: true });
      } else if (request.type === 'hostinfo') {
        send('hostinfo', { ip: '192.0.2.10', ports: [{ port: 443, protocol: 'https', detected_products: [{ product: 'Large fixture', exposed_data: { field_headers: ['record'], field_value: Array.from({ length: 10000 }, (_, index) => [`record-${String(index).padStart(5, '0')}`]) } }] }] });
        send('dnsinfo', null); send('whois', null); send('domain_ip_map', []);
      } else send(request.type, { unread_count: 0 });
    });
  });
}

test('pagination, sorting and row count reuse analytics instead of spending another analytics request', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  await mockSearchApi(page, requests);
  await page.goto('/search?q=example&run=1');
  await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Result analytics' }).getByRole('button', { name: /^Germany/ })).toBeVisible();
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


test('hidden mobile analytics waits for an explicit open and then reuses its result', async ({ page }) => {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  await mockSearchApi(page, requests);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/search?q=example&run=1');
  await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
  const toggle = page.getByRole('button', { name: 'Analytics', exact: true });
  await toggle.click();
  await expect(page.getByRole('complementary', { name: 'Result analytics' }).getByRole('button', { name: /^Germany/ })).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(1);
  await toggle.click();
  await expect(page.getByRole('complementary', { name: 'Result analytics' })).not.toBeVisible();
  await toggle.click();
  await expect(page.getByRole('complementary', { name: 'Result analytics' }).getByRole('button', { name: /^Germany/ })).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(1);
});
