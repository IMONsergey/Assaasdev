import { expect, test, type Page } from '@playwright/test';

async function searchHistoryFixture(page: Page) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'history-contract', user_name: 'history_contract', user_type: 'USER', credits: 5000, subscription: { type: 'Business', credits: 5000 } }) }));
  await page.routeWebSocket('**/backend/ws', socket => {
    socket.onMessage(message => {
      const request = JSON.parse(String(message)) as { type: string; id: string; data: Record<string, unknown> };
      const send = (type: string, data: unknown) => socket.send(JSON.stringify({ type, id: request.id, data, metadata: { subscription_type: 'Business' } }));
      if (request.type === 'hosts') {
        const count = Number(request.data.docs_per_page) || 20;
        const start = ((Number(request.data.page) || 1) - 1) * count;
        send('hosts', Array.from({ length: count }, (_, index) => ({ ip: `192.0.2.${start + index + 1}`, org: 'History contract fixture', open_ports: [{ port: 443, protocol: 'https' }] })));
      } else if (request.type === 'analytics') {
        send('analytics', { facet_name: 'country_name', facet_values: [{ key: 'Germany', doc_count: 100 }] });
        send('analytics', { complete: true });
      } else if (request.type === 'hostinfo') {
        send('hostinfo', { ip: request.data.ip, ports: [{ port: 443, protocol: 'https', banner: 'History contract fixture' }] });
        send('dnsinfo', null); send('whois', null); send('domain_ip_map', []);
      } else send(request.type, { unread_count: 0 });
    });
  });
}

for (const returnMethod of ['browser Back', 'Back to results'] as const) {
  test(`${returnMethod} restores the result query, page and reading position`, async ({ page }) => {
    await searchHistoryFixture(page);
    await page.setViewportSize({ width: 1440, height: 720 });
    const request = { full_text_search: 'example', page: 2, docs_per_page: 20, sort_field: 'uts', sort_direction: 'desc', simple_search_filters: [{ field: 'country_name', value: 'Germany' }] };
    await page.goto(`/search?${new URLSearchParams({ request: JSON.stringify(request), run: '1' })}`);
    await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
    const originalSearch = new URL(page.url()).search;
    const result = page.getByRole('link', { name: '192.0.2.33', exact: true });
    await result.scrollIntoViewIfNeeded();
    const resultPosition = await page.evaluate(() => window.scrollY);
    expect(resultPosition).toBeGreaterThan(300);
    await result.click();
    await expect(page.getByRole('heading', { name: '192.0.2.33', exact: true })).toBeVisible();
    if (returnMethod === 'browser Back') await page.goBack();
    else await page.getByRole('link', { name: /^Back to results/ }).click();
    await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
    expect(new URL(page.url()).search).toBe(originalSearch);
    await expect(page.getByRole('textbox', { name: 'Search internet infrastructure', exact: true })).toHaveValue('example');
    await expect(page.getByRole('navigation', { name: 'Pagination', exact: true })).toContainText('Page 2');
    await expect.poll(() => page.evaluate(position => Math.abs(window.scrollY - position), resultPosition)).toBeLessThan(3);
    await expect(result).toBeInViewport();
  });
}

test('host tab and service changes preserve the desktop reading position', async ({ page }) => {
  await page.goto('/hosts/198.51.100.24');
  const services = page.getByRole('complementary', { name: 'Service list', exact: true });
  await expect(services.locator('.host-service-row')).toHaveCount(25);
  await page.evaluate(() => window.scrollTo({ top: 180, behavior: 'instant' }));
  const tabPosition = await page.evaluate(() => window.scrollY);
  expect(tabPosition).toBeGreaterThan(100);
  await page.getByRole('tab', { name: 'HTTP', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'http', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(position => Math.abs(window.scrollY - position), tabPosition)).toBeLessThan(3);
  expect(new URL(page.url()).searchParams.get('tab')).toBe('http');
  const service = services.locator('.host-service-row').nth(2);
  await service.scrollIntoViewIfNeeded();
  const servicePosition = await page.evaluate(() => window.scrollY);
  expect(servicePosition).toBeGreaterThan(100);
  await service.click();
  await expect(service).toHaveAttribute('aria-pressed', 'true');
  expect(new URL(page.url()).searchParams.get('port')).toBe('22');
  await expect.poll(() => page.evaluate(position => Math.abs(window.scrollY - position), servicePosition)).toBeLessThan(3);
});
