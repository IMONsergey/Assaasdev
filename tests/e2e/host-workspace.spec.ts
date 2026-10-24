import { chooseOption } from './helpers/controls';
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
  await page.getByRole('tab', { name: /^Services/ }).click();
  const list = page.getByRole('complementary', { name: 'Service list', exact: true });
  await expect(list.locator('.host-service-row')).toHaveCount(25);
  await list.locator('summary').filter({ hasText: 'Classify services' }).click();
  await chooseOption(list.getByRole('combobox', { name: 'Protocol', exact: true }), 'https');
  await chooseOption(list.getByRole('combobox', { name: 'Contains', exact: true }), 'tls');
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

test('rapid service filters and nested tabs compose the current URL without losing search context', async ({ page }, testInfo) => {
  const requests: string[] = [];
  await hostWorkspaceFixture(page, requests);
  await page.goto('/hosts/192.0.2.44?tab=http&q=retained&run=1&back=%2Fsearch%3Fq%3Dretained%26run%3D1');
  const list = page.getByRole('complementary', { name: 'Service list', exact: true });
  await expect(list.locator('.host-service-row')).toHaveCount(25);
  await list.locator('summary').filter({ hasText: 'Classify services' }).click();

  await chooseOption(list.getByRole('combobox', { name: 'Protocol', exact: true }), 'https');
  await list.getByRole('combobox', { name: 'Contains', exact: true }).click();
  // The menu selection and port edit run before an intermediate router render.
  await page.getByRole('option', { name: /^TLS certificate ·/ }).evaluate(option => {
    const port = document.querySelector<HTMLInputElement>('.host-service-filters input');
    const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!port || !setInputValue) throw new Error('Service filters must be available.');
    (option as HTMLElement).click();
    setInputValue.call(port, '10800-10999'); port.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page).toHaveURL(url => url.searchParams.get('service_protocol') === 'https'
    && url.searchParams.get('service_content') === 'tls' && url.searchParams.get('service_port') === '10800-10999'
    && url.searchParams.get('service_page') === '1' && url.searchParams.get('q') === 'retained'
    && url.searchParams.get('back') === '/search?q=retained&run=1');
  await expect(list.getByRole('combobox', { name: 'Contains', exact: true })).toHaveAttribute('data-control-value', 'tls');
  await expect(list.locator('.host-service-row')).toHaveCount(20);
  await expect(list.locator('.host-service-window')).toContainText('20 matching');

  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('host-filters-desktop.png') });

  // A parent tab must retain a service subtab selected in the same task.
  await page.getByRole('tab', { name: 'TLS', exact: true }).evaluate(element => {
    const dns = document.querySelector<HTMLButtonElement>('#host-workspace-tab-dns');
    if (!dns) throw new Error('The DNS workspace tab must be available.');
    (element as HTMLButtonElement).click(); dns.click();
  });
  await expect(page).toHaveURL(url => url.searchParams.get('tab') === 'dns'
    && url.searchParams.get('view') === 'tls' && url.searchParams.get('response') === 'body'
    && url.searchParams.get('service_content') === 'tls' && url.searchParams.get('service_port') === '10800-10999');
  await page.getByRole('tab', { name: /^Services/ }).click();
  await expect(page.getByRole('tab', { name: 'TLS', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(list.locator('.host-service-row')).toHaveCount(20);
  const restoredLocation = page.url();
  await page.getByRole('complementary', { name: 'Workspace navigation', exact: true }).getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(restoredLocation);
  await expect(list.getByRole('combobox', { name: 'Protocol', exact: true })).toHaveAttribute('data-control-value', 'https');
  await expect(list.getByRole('combobox', { name: 'Contains', exact: true })).toHaveAttribute('data-control-value', 'tls');
  await expect(list.getByRole('textbox', { name: 'Port or range', exact: true })).toHaveValue('10800-10999');
  await expect(list.locator('.host-service-row')).toHaveCount(20);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.getByRole('button', { name: 'Back to service list', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(list.getByRole('combobox', { name: 'Contains', exact: true })).toHaveAttribute('data-control-value', 'tls');
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('host-filters-mobile.png') });
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
  await chooseOption(page.getByRole('combobox', { name: 'Sort by', exact: true }), '1');
  await page.getByRole('button', { name: 'Sort descending', exact: true }).click();
  await expect(table.locator('tbody tr').first()).toContainText('entry-09999');
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await page.locator('.host-column-picker > summary').click();
  await page.getByRole('checkbox', { name: 'Group', exact: true }).uncheck();
  await expect(table.locator('thead th')).toHaveCount(2);
  await search.fill('odd');
  await expect(page.locator('.host-data-toolbar [role="status"]')).toContainText('5,000 matching');
  await expect(table.locator('tbody tr').first()).toContainText('entry-09999');
  await page.getByRole('tab', { name: 'Response', exact: true }).click();
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
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
  await page.getByRole('button', { name: 'Back to service list', exact: true }).click();
  const list = page.getByRole('complementary', { name: 'Service list', exact: true });
  const pages = page.getByRole('navigation', { name: 'Received service pages', exact: true });
  await expect(pages).toContainText('40 / 40');
  await expect(list.getByRole('button', { pressed: true })).toBeVisible();
  await pages.getByRole('spinbutton', { name: 'Go to page', exact: true }).fill('20');
  await pages.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(pages).toContainText('20 / 40');
  await expect(list.locator('.host-service-row')).toHaveCount(25);
  await pages.getByRole('spinbutton', { name: 'Go to page', exact: true }).fill('40');
  await pages.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(pages).toContainText('40 / 40');
  await expect(list.getByRole('button', { pressed: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
