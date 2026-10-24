import { expect, test, type Page } from '@playwright/test';

type RequestLog = { type: string; data?: { task_ids?: string[] } }[];

async function hostUxFixture(page: Page, requests: RequestLog) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'host-ux-contract', user_name: 'host_researcher', user_type: 'USER', credits: 5000, subscription: { type: 'Business', credits: 5000 } }) }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(message => {
    const request = JSON.parse(String(message));
    requests.push(request);
    const send = (type: string, data: unknown) => socket.send(JSON.stringify({ type, id: request.id, data, metadata: { subscription_type: 'Business' } }));
    if (request.type === 'hostinfo' || request.type === 'private_hostinfo') {
      send(request.type, {
        ip: '192.0.2.44', asn: 64496, as_cidr: '192.0.2.0/24', org: 'Research network', os: 'Linux', country_name: 'Netherlands', city_name: 'Amsterdam', continent_name: 'Europe', cts: 1792000000, uts: 1792700000,
        ports: Array.from({ length: 1000 }, (_, index) => ({
          port: index === 0 ? 443 : 10000 + index, protocol: index % 2 === 0 ? 'https' : 'ssh', transport: 'tcp', uts: 1792700000 + index,
          title: `Observation ${index}`, banner: 'HTTP/1.1 200 OK\nServer: research-server\nContent-Type: text/html', body: index === 999 ? 'needle-deep-body' : '<main>Received HTTP content</main>', status_code: 200, status: 'open', link: `https://service-${index}.example.test`,
          headers: { 'content-type': ['text/html'], server: ['research-server'] },
          tls_info: index % 10 === 0 ? { server_name: `service-${index}.example.test`, subject: { common_name: '*.example.test' }, issuer: 'Research CA', valid_from: '2026-09-01', valid_to: '2026-12-01' } : undefined,
          cert_domains: ['example.test', '*.example.test'],
          security_txt: { is_security_txt: false, body: '', url: 'https://example.test/.well-known/security.txt', contacts: [] }, robots_txt: { status_code: 0, body: 'User-agent: *\nDisallow: /private/' },
          detected_products: index === 0 ? Array.from({ length: 120 }, (_, product) => ({
            product: product === 0 ? 'Core server' : `Service product ${product}`, version: '2.0', vendor: 'Research vendor', labels: ['web'],
            cve_list: product === 0 ? Array.from({ length: 240 }, (_, cve) => ({ cve_id: `CVE-2026-${10000 + cve}`, base_score: cve === 0 ? 0 : 7.5 })) : [],
            exposed_data: product === 0 ? { field_headers: ['Record', 'Sequence', 'Group'], field_value: Array.from({ length: 10000 }, (_, row) => [`entry-${String(row).padStart(5, '0')}`, String(row), row % 2 ? 'odd' : 'even']) } : undefined,
          })) : undefined,
        })),
      });
      send('dnsinfo', { updated_at: 1792700000, records: { A: ['192.0.2.44'], MX: ['mail.example.test'], TXT: ['v=spf1 -all'] } });
      send('whois', { organization: 'Research network', network: '192.0.2.0/24', country: 'NL', created: '2026-01-01', contacts: ['network@example.test'] });
      if (request.type === 'hostinfo') send('domain_ip_map', [null, ...Array.from({ length: 120 }, (_, index) => ({ d: `domain-${String(index).padStart(3, '0')}.example.test`, ip: ['192.0.2.44'] }))]);
    } else if (request.type === 'cveinfo') send('cveinfo', { cve_id: request.data.cve_ID, description: 'Received CVE document', cvssMetricV31: { score: 0 } });
    else send(request.type, { unread_count: 0 });
  }));
}

async function capture(page: Page, path: string, fullPage = false) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ animations: 'disabled', path, fullPage });
}

function hostRequests(requests: RequestLog) { return requests.filter(request => request.type === 'hostinfo' || request.type === 'private_hostinfo'); }

test('overview reports scoped observations, caps domain preview and opens a filtered service catalog', async ({ page }, testInfo) => {
  const requests: RequestLog = [];
  await hostUxFixture(page, requests);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/hosts/192.0.2.44');
  await expect(page.getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.host-metric').filter({ has: page.locator('span', { hasText: /^Services$/ }) })).toContainText('1,000');
  await expect(page.locator('.host-metric').filter({ has: page.locator('span', { hasText: /^Product records$/ }) })).toContainText('120');
  await expect(page.locator('.host-metric').filter({ has: page.locator('span', { hasText: /^CVE IDs$/ }) })).toContainText('240');
  await expect(page.locator('.host-domain-names > span')).toHaveCount(2);
  await expect(page.getByRole('button', { name: '+118 domains', exact: true })).toBeVisible();
  const protocols = page.getByRole('region', { name: 'Protocol distribution', exact: true });
  await expect(protocols.getByRole('button', { name: 'HTTPS 500', exact: true })).toBeVisible();
  await expect(protocols.locator('.host-protocol-track > span').first()).toHaveAttribute('style', 'width: 50%;');
  await expect(page.locator('.host-technology-list > button')).toHaveCount(5);
  await capture(page, testInfo.outputPath('host-overview-desktop.png'), true);
  await protocols.getByRole('button', { name: 'HTTPS 500', exact: true }).click();
  const list = page.getByRole('complementary', { name: 'Service list', exact: true });
  await expect(list.getByRole('combobox', { name: 'Protocol', exact: true })).toHaveAttribute('data-control-value', 'https');
  await expect(list.locator('.host-service-window')).toContainText('500 matching');
  await expect(list.locator('.host-service-row')).toHaveCount(25);
  expect(hostRequests(requests)).toHaveLength(1);
});

test('service workspace preserves legacy HTTP access and bounds products, CVEs and raw data across every detail tab', async ({ page }, testInfo) => {
  const requests: RequestLog = [];
  await hostUxFixture(page, requests);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/hosts/192.0.2.44?tab=http&port=443');
  const detail = page.getByRole('region', { name: 'Selected service details', exact: true });
  await expect(page.getByRole('tab', { name: 'HTTP body', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(detail.locator('.host-banner')).toContainText('<main>Received HTTP content</main>');
  await capture(page, testInfo.outputPath('host-response-desktop.png'), true);
  await page.getByRole('tab', { name: 'Headers', exact: true }).click();
  await expect(detail).toContainText('content-type');
  await page.getByRole('tab', { name: 'TLS', exact: true }).click();
  await expect(detail).toContainText('Research CA');
  await capture(page, testInfo.outputPath('host-tls-desktop.png'), true);
  await page.getByRole('tab', { name: /^Products & CVE/ }).click();
  const products = page.getByRole('region', { name: 'Detected products', exact: true });
  await expect(products.locator('.host-product')).toHaveCount(6);
  const cves = page.getByRole('region', { name: 'CVE associations for Core server', exact: true });
  await expect(cves.locator('.host-cve-chips > button')).toHaveCount(12);
  await expect(cves.locator('.host-cve-chips .badge').first()).toHaveText('0.0');
  await capture(page, testInfo.outputPath('host-products-desktop.png'), false);
  const productPages = products.locator(':scope > .pagination');
  await productPages.getByRole('spinbutton', { name: 'Go to page', exact: true }).fill('20');
  await productPages.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(products.getByRole('heading', { name: /^Service product 119/ })).toBeVisible();
  await products.getByRole('textbox', { name: 'Find a product or CVE', exact: true }).fill('CVE-2026-10239');
  await expect(products.locator('.host-product')).toHaveCount(1);
  await cves.getByRole('textbox', { name: 'Search CVEs for Core server (1)', exact: true }).fill('CVE-2026-10239');
  await expect(cves.locator('.host-cve-chips > button')).toHaveCount(1);
  await cves.getByRole('button', { name: /^CVE-2026-10239/ }).click();
  await expect(page.getByRole('dialog', { name: 'CVE-2026-10239', exact: true })).toContainText('Received CVE document');
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  const table = page.getByRole('region', { name: 'Core server exposed data', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await capture(page, testInfo.outputPath('host-data-desktop.png'), false);
  await page.getByRole('textbox', { name: 'Search Core server exposed data', exact: true }).fill('entry-09999');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('entry-09999');
  await page.getByRole('tab', { name: 'Web files', exact: true }).click();
  await page.getByRole('tab', { name: 'robots.txt', exact: true }).click();
  await expect(detail.locator('.host-banner')).toContainText('Disallow: /private/');
  await expect(detail.locator('.host-facts dd')).toHaveText('0');
  await capture(page, testInfo.outputPath('host-web-files-desktop.png'), true);
  await page.getByRole('tab', { name: 'DNS & domains', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'DNS records', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'domains records', exact: true }).locator('tbody tr')).toHaveCount(50);
  await capture(page, testInfo.outputPath('host-dns-desktop.png'), false);
  await page.getByRole('tab', { name: 'WHOIS', exact: true }).click();
  await expect(page.locator('#host-workspace-panel-whois')).toContainText('Research network');
  await capture(page, testInfo.outputPath('host-whois-desktop.png'), true);
  await page.getByRole('tab', { name: /^Services/ }).click();
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search Core server exposed data', exact: true })).toHaveValue('entry-09999');
  expect(hostRequests(requests)).toHaveLength(1);
  expect(requests.filter(request => request.type === 'cveinfo')).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('mobile deep selection opens details and restores the exact filtered catalog without stacking both views', async ({ page }, testInfo) => {
  const requests: RequestLog = [];
  await hostUxFixture(page, requests);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto('/hosts/192.0.2.44?port=10999');
  const list = page.getByRole('complementary', { name: 'Service list', exact: true });
  const detail = page.getByRole('region', { name: 'Selected service details', exact: true });
  await expect(detail.getByRole('heading', { level: 2 }).first()).toContainText('10999');
  await expect(list).toBeHidden();
  await capture(page, testInfo.outputPath('host-service-mobile.png'), false);
  await page.getByRole('button', { name: 'Back to service list', exact: true }).click();
  await expect(detail).toBeHidden();
  await expect(list).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Received service pages', exact: true })).toContainText('40 / 40');
  await expect(list.getByRole('button', { pressed: true })).toContainText('10999');
  await capture(page, testInfo.outputPath('host-catalog-mobile.png'), false);
  await list.getByRole('textbox', { name: 'Find a service', exact: true }).fill('needle-deep-body');
  await expect(list.locator('.host-service-row')).toHaveCount(1);
  await list.locator('.host-service-row').click();
  await expect(list).toBeHidden();
  await expect(detail).toBeFocused();
  await page.getByRole('button', { name: 'Back to service list', exact: true }).click();
  await expect(list).toBeFocused();
  await expect(list.getByRole('textbox', { name: 'Find a service', exact: true })).toHaveValue('needle-deep-body');
  await expect(list.getByRole('button', { pressed: true })).toContainText('10999');
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await capture(page, testInfo.outputPath('host-overview-mobile.png'), true);
  expect(hostRequests(requests)).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('private legacy web-file links keep task scope and display false, zero and empty response distinctly', async ({ page }, testInfo) => {
  const requests: RequestLog = [];
  await hostUxFixture(page, requests);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/private/hosts/192.0.2.44?tab=robots&port=443&task_ids=1042');
  await expect(page.getByText('Private data', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Web files', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'robots.txt', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#host-web-file-panel-robots .host-facts dd')).toHaveText('0');
  await page.getByRole('tab', { name: 'security.txt', exact: true }).click();
  await expect(page.locator('#host-web-file-panel-security .host-facts > div').first()).toContainText('No');
  await expect(page.locator('#host-web-file-panel-security .host-banner')).toHaveText('Empty response');
  await capture(page, testInfo.outputPath('host-web-file-mobile.png'), false);
  await page.getByRole('tab', { name: 'Data', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Core server exposed data', exact: true }).locator('tbody tr')).toHaveCount(50);
  await capture(page, testInfo.outputPath('host-data-mobile.png'), false);
  expect(hostRequests(requests)).toHaveLength(1);
  expect(hostRequests(requests)[0]).toMatchObject({ type: 'private_hostinfo', data: { task_ids: ['1042'] } });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('adjacent services cross catalog pages while keeping the filtered scope and selected detail view', async ({ page }, testInfo) => {
  const requests: RequestLog = [];
  await hostUxFixture(page, requests);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/hosts/192.0.2.44?tab=services&port=10048&service_protocol=https&view=tls');
  const detail = page.getByRole('region', { name: 'Selected service details', exact: true });
  const navigation = page.getByRole('navigation', { name: 'Navigate matching services', exact: true });
  await expect(navigation).toContainText('Service 25 of 500 matching');
  await navigation.getByRole('button', { name: 'Next matching service', exact: true }).click();
  await expect(detail.getByRole('heading', { level: 2 }).first()).toContainText('10050');
  await expect(page.getByRole('navigation', { name: 'Received service pages', exact: true })).toContainText('2 / 20');
  await expect(page.getByRole('tab', { name: 'TLS', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('combobox', { name: 'Protocol', exact: true })).toHaveAttribute('data-control-value', 'https');
  await navigation.getByRole('button', { name: 'Previous matching service', exact: true }).click();
  await expect(detail.getByRole('heading', { level: 2 }).first()).toContainText('10048');
  await expect(page.getByRole('navigation', { name: 'Received service pages', exact: true })).toContainText('1 / 20');
  expect(hostRequests(requests)).toHaveLength(1);
  await capture(page, testInfo.outputPath('host-catalog-navigation-desktop.png'));
});

test('data rows open an inspector and complete records use a bounded highlighted source canvas', async ({ page }, testInfo) => {
  const requests: RequestLog = [];
  await hostUxFixture(page, requests);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/hosts/192.0.2.44?tab=services&port=443&view=exposed');
  const table = page.getByRole('region', { name: 'Core server exposed data', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(50);
  await table.locator('tbody tr').first().locator('td').first().click();
  const dialog = page.getByRole('dialog', { name: 'Record 1', exact: true });
  await expect(dialog).toContainText('entry-00000');
  await expect(dialog.locator('.code-token--string').first()).toBeVisible();
  await capture(page, testInfo.outputPath('host-row-inspector-desktop.png'));
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.locator('.host-disclosure > summary').filter({ hasText: 'Complete host record' }).click();
  const source = page.locator('.host-disclosure .code-canvas');
  await expect(source.locator('.code-token--key').first()).toBeVisible();
  expect((await source.locator('pre').textContent())!.length).toBeLessThan(30000);
  await expect(source.getByRole('button', { name: 'Next code page', exact: true })).toBeEnabled();
  const first = await source.locator('pre').textContent();
  await source.getByRole('button', { name: 'Next code page', exact: true }).click();
  await expect(source.locator('pre')).not.toHaveText(first!);
  const jump = source.getByRole('spinbutton', { name: 'Go to Complete host record page', exact: true });
  await jump.fill('10');
  await source.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(source.getByRole('navigation', { name: 'Complete host record pages', exact: true })).toContainText('10 /');
  await expect(jump).toHaveValue('10');
  await page.setViewportSize({ width: 320, height: 900 });
  await source.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: testInfo.outputPath('host-source-mobile.png') });
  expect(hostRequests(requests)).toHaveLength(1);
});
