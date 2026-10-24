import { expect, test, type Page } from '@playwright/test';

async function hostWorkspaceFixture(page: Page, requests: string[]) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'host-workspace-contract', user_name: 'host_workspace', user_type: 'USER', credits: 5000, subscription: { type: 'Business', credits: 5000 } }) }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(message => {
    const request = JSON.parse(String(message));
    requests.push(request.type);
    const send = (type: string, data: unknown) => socket.send(JSON.stringify({ type, id: request.id, data, metadata: { subscription_type: 'Business' } }));
    if (request.type === 'hostinfo') {
      send('hostinfo', { ip: '192.0.2.44', ports: Array.from({ length: 1000 }, (_, index) => ({
        port: index === 0 ? 443 : 10000 + index, protocol: index % 2 === 0 ? 'https' : 'ssh', transport: 'tcp',
        title: `Observation ${index}`, body: index === 999 ? 'needle-deep-body' : 'Received response',
        tls_info: index % 10 === 0 ? { server_name: `service-${index}.example.test` } : undefined,
        detected_products: index === 0 ? [{ product: 'Audit records', exposed_data: { field_headers: ['Record', 'Sequence', 'Group'], field_value: Array.from({ length: 10000 }, (_, row) => [`entry-${String(row).padStart(5, '0')}`, String(row), row % 2 ? 'odd' : 'even']) } }] : [],
      })) });
      send('dnsinfo', null); send('whois', null); send('domain_ip_map', []);
    } else send(request.type, { unread_count: 0 });
  }));
}

test('classifying and returning to a thousand-service list retains local context without another host request', async ({ page }) => {
  const requests: string[] = [];
  await hostWorkspaceFixture(page, requests);
  await page.goto('/hosts/192.0.2.44');
  const list = page.getByRole('complementary', { name: 'Service list', exact: true });
  await expect(list.locator('.host-service-row')).toHaveCount(25);
  await list.locator('summary').filter({ hasText: 'Classify services' }).click();
  await list.getByRole('combobox', { name: 'Protocol', exact: true }).selectOption('https');
  await list.getByRole('combobox', { name: 'Contains', exact: true }).selectOption('tls');
  await list.getByRole('textbox', { name: 'Port or range', exact: true }).fill('10800-10999');
  await expect(list.locator('.host-service-row')).toHaveCount(20);
  await expect(list.locator('.host-service-window')).toContainText('20 matching');
  await list.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await list.getByRole('textbox', { name: 'Find a service', exact: true }).fill('needle-deep-body');
  await expect(list.locator('.host-service-row')).toHaveCount(1);
  await list.locator('.host-service-row').click();
  await expect(page.getByRole('region', { name: 'Selected service details', exact: true }).getByRole('heading', { level: 2 }).first()).toContainText('10999');
  const exactLocation = page.url();
  await page.getByRole('complementary', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(exactLocation);
  await expect(list.getByRole('textbox', { name: 'Find a service', exact: true })).toHaveValue('needle-deep-body');
  await expect(list.getByRole('button', { pressed: true })).toContainText('10999');
  expect(requests.filter(type => type === 'hostinfo')).toHaveLength(1);
});

test('all ten thousand received rows are searchable and numerically sortable with bounded rendering and retained table settings', async ({ page }) => {
  const requests: string[] = [];
  await hostWorkspaceFixture(page, requests);
  await page.goto('/hosts/192.0.2.44?tab=exposed');
  const table = page.getByRole('region', { name: 'Audit records exposed data', exact: true });
  const search = page.getByRole('textbox', { name: 'Search Audit records exposed data', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await search.fill('entry-09999');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('entry-09999');
  await search.fill('');
  await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Sort descending', exact: true }).click();
  await expect(table.locator('tbody tr').first()).toContainText('entry-09999');
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await page.locator('.host-column-picker > summary').click();
  await page.getByRole('checkbox', { name: 'Group', exact: true }).uncheck();
  await expect(table.locator('thead th')).toHaveCount(2);
  await search.fill('odd');
  await expect(page.locator('.host-data-toolbar [role="status"]')).toContainText('5,000 matching');
  await expect(table.locator('tbody tr').first()).toContainText('entry-09999');
  await page.getByRole('tab', { name: /^Services/ }).click();
  await page.getByRole('tab', { name: 'Exposed data', exact: true }).click();
  await expect(search).toHaveValue('odd');
  await expect(table.locator('thead th')).toHaveCount(2);
  const pagination = page.getByRole('navigation', { name: 'Pagination', exact: true });
  await pagination.getByRole('spinbutton', { name: 'Go to page', exact: true }).fill('100');
  await pagination.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(table.locator('tbody tr').first()).toContainText('entry-00099');
  await expect(table.locator('tbody tr')).toHaveCount(50);
  expect(requests.filter(type => type === 'hostinfo')).toHaveLength(1);
});

test('service page jump and a deep selection remain reachable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto('/hosts/198.51.100.24?port=10999');
  const list = page.getByRole('complementary', { name: 'Service list', exact: true });
  const pages = page.getByRole('navigation', { name: 'Received service pages', exact: true });
  await expect(pages).toContainText('40 / 40');
  await expect(list.getByRole('button', { pressed: true })).toBeVisible();
  await pages.getByRole('spinbutton', { name: 'Go to page', exact: true }).fill('20');
  await pages.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(pages).toContainText('20 / 40');
  await expect(list.locator('.host-service-row')).toHaveCount(25);
  await page.getByRole('button', { name: 'Show selected service', exact: true }).click();
  await expect(pages).toContainText('40 / 40');
  await expect(list.getByRole('button', { pressed: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
