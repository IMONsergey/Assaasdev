import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('search entry, focus and workspace filters have consistent geometry', async ({ page }, testInfo) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 760 ? 960 : 800 });
    await page.goto('/search');
    const title = page.getByRole('heading', { name: 'Search internet infrastructure', exact: true });
    await expect(title).toBeVisible();
    await expect(page.locator('.dot-cascade__canvas')).toBeVisible();
    await expect(page.getByText('Text query', { exact: true })).toBeVisible();
    await expect(page.getByText('IP / CIDR', { exact: true })).toBeVisible();
    const input = page.getByRole('combobox', { name: 'Search internet infrastructure', exact: true });
    await input.focus();
    expect(await input.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
    expect(await title.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(28);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`search-entry-${width}.png`), fullPage: false, animations: 'disabled' });
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const filters = page.getByRole('dialog', { name: 'Filters', exact: true });
    await expect(filters).toBeVisible();
    const geometry = await filters.evaluate(element => {
      const box = element.getBoundingClientRect(), main = document.querySelector('.workspace-main')!.getBoundingClientRect(), header = document.querySelector('.app-topbar')!.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, right: box.right, bottom: box.bottom, mainX: main.x, headerBottom: header.bottom, clip: getComputedStyle(element, '::backdrop').clipPath };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(geometry.mainX);
    expect(geometry.y).toBeGreaterThanOrEqual(geometry.headerBottom);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.clip).not.toBe('none');
    const close = await filters.getByRole('button', { name: 'Close dialog', exact: true }).boundingBox();
    expect(Math.abs(close!.width - close!.height)).toBeLessThanOrEqual(1);
    await expect(filters.getByRole('button', { name: 'Apply conditions', exact: true })).toBeInViewport();
    const select = filters.getByRole('combobox', { name: 'Result type', exact: true });
    expect(await select.evaluate(element => parseFloat(getComputedStyle(element).paddingRight))).toBeGreaterThanOrEqual(36);
    await page.screenshot({ path: testInfo.outputPath(`search-filters-${width}.png`), fullPage: false, animations: 'disabled' });
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(a11y.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(filters).not.toBeVisible();
  }
});

test('typing suggestions never searches and selected values become explicit filter drafts', async ({ page }, testInfo) => {
  const requests: { type: string; data: Record<string, unknown> }[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'suggestions', user_name: 'researcher', user_type: 'USER', credits: 5000, subscription: { type: 'Business' } }) }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const request = JSON.parse(String(raw)); requests.push(request);
    const data = request.type === 'autocomplete' ? { type: 'values', field: request.data.field, results: request.data.field === 'country_name' ? ['Germany'] : [], has_more: false }
      : request.type === 'hosts' ? [{ ip: '192.0.2.1', country_code: 'DE', org: 'Research network', open_ports: [{ port: 443, protocol: 'https' }] }] : { unread_count: 0 };
    socket.send(JSON.stringify({ id: request.id, type: request.type, data }));
  }));
  await page.goto('/search');
  const input = page.getByRole('combobox', { name: 'Search internet infrastructure', exact: true });
  await input.fill('Ger');
  const option = page.getByRole('option', { name: /Germany/ });
  await expect(option).toBeVisible();
  expect(requests.filter(item => item.type === 'hosts' || item.type === 'analytics')).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('search-suggestions.png'), fullPage: false, animations: 'disabled' });
  await option.click();
  const filters = page.getByRole('dialog', { name: 'Filters', exact: true });
  await expect(filters).toBeVisible();
  await expect(filters.getByRole('combobox', { name: 'Field', exact: true })).toHaveValue('country_name');
  await expect(filters.getByRole('combobox', { name: 'Value', exact: true })).toHaveValue('Germany');
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(0);
  await filters.getByRole('button', { name: 'Apply conditions', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 hosts returned', exact: true })).toBeVisible();
  const searches = requests.filter(item => item.type === 'hosts');
  expect(searches).toHaveLength(1);
  expect(searches[0].data.simple_search_filters).toEqual([{ field: 'country_name', value: 'Germany' }]);
  await input.fill('another');
  await expect(page.getByRole('listbox', { name: 'Search suggestions' })).toBeVisible();
  await input.press('Escape');
  await expect(page.getByRole('listbox', { name: 'Search suggestions' })).not.toBeVisible();
  await expect(input).toBeFocused();
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(1);
});

test('result data areas navigate and saved queries use searchable readable cards', async ({ page }, testInfo) => {
  await page.goto('/search?q=example&run=1');
  await expect(page.locator('.search-result-row').first()).toBeVisible();
  await expect.poll(() => page.locator('.search-result-row .country-flag').first().evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('search-results.png'), fullPage: false, animations: 'disabled' });
  await page.locator('.search-result-row').first().locator('.search-result-location').click();
  await expect(page).toHaveURL(/\/hosts\//);
  await page.goto('/search/saved');
  await expect(page.locator('.search-saved-query')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Save current query', exact: true })).toHaveCount(0);
  const filter = page.getByRole('searchbox', { name: 'Find a saved query' });
  await filter.fill('nginx');
  await expect(page.locator('.search-saved-query')).toHaveCount(1);
  await page.getByText('Query details', { exact: true }).click();
  await expect(page.locator('.search-saved-query .code-canvas')).toBeVisible();
  await expect(page.locator('.search-saved-query .code-canvas .code-token')).not.toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('saved-query-code.png'), fullPage: false, animations: 'disabled' });
  await filter.fill('nothing matches this');
  await expect(page.getByRole('heading', { name: 'No saved queries match', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.locator('.search-saved-query')).toHaveCount(3);
});

test('registration guidance stays available through auth forms at desktop and mobile widths', async ({ page }, testInfo) => {
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/scenarios?scenario=register-account');
    await page.getByRole('dialog').getByRole('button', { name: 'Start scenario', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/signup$/);
    const guide = page.getByRole('complementary', { name: 'Scenario guide' });
    await expect(guide).toContainText('Enter your account details');
    await expect(page.getByRole('heading', { name: 'Create account', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if(await guide.getByRole('button', {name:'Expand scenario guide'}).isVisible()) await guide.getByRole('button', {name:'Expand scenario guide'}).click();
    await expect(guide.getByRole('button', { name: 'Show me', exact: true })).toBeVisible();
    await expect(guide).not.toContainText('Verify your email');
    await guide.getByRole('button', { name: 'Skip this step', exact: true }).click();
    await expect(guide).toContainText('Verify your email');
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('apcosys.scenario-guide.v1')!).progress[0])).toBe('skipped');
    await expect(page).toHaveURL(/\/auth\/signup$/);
    await page.screenshot({ path: testInfo.outputPath(`auth-guide-${width}.png`), fullPage: true, animations: 'disabled' });
    await guide.getByRole('button', { name: 'Close scenario guide' }).click();
    await expect(guide).toHaveCount(0);
  }
});

test('a notification remains readable and dismissible above an open dialog', async ({ page }, testInfo) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => undefined } }); });
  await page.goto('/search');
  await page.getByRole('button', { name: 'Support', exact: true }).click();
  await page.getByRole('button', { name: 'Contact support', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Please help review the filtered results.');
  await page.getByRole('button', { name: 'Prepare email', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Review your message', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy message', exact: true }).click();
  const notification = page.locator('.toast');
  await expect(notification).toContainText('Copied');
  await notification.hover();
  await page.screenshot({ path: testInfo.outputPath('notification-over-dialog.png'), fullPage: false, animations: 'disabled' });
  await notification.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(notification).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await page.clock.install();
  await dialog.getByRole('button', { name: 'Copy message', exact: true }).click();
  await notification.hover();
  await page.clock.runFor(7000);
  await expect(notification).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await expect(page.locator('body > .toast-region .toast')).toBeVisible();
  await page.clock.runFor(6500);
  await expect(notification).toHaveCount(0);
});

test('a direct filter link survives delayed session hydration without running a search', async ({ page }) => {
  let releaseProfile!: () => void;
  const profileReady = new Promise<void>(resolve => { releaseProfile = resolve; });
  const requests: string[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', async route => {
    await profileReady;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'delayed-profile', user_name: 'researcher', user_type: 'USER', credits: 5000, subscription: { type: 'Business' } }) });
  });
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const request = JSON.parse(String(raw)); requests.push(request.type);
    socket.send(JSON.stringify({ id: request.id, type: request.type, data: { unread_count: 0 } }));
  }));
  await page.goto('/search?conditions=1');
  const filters = page.getByRole('dialog', { name: 'Filters', exact: true });
  await expect(filters).toBeVisible();
  expect(new URL(page.url()).searchParams.get('conditions')).toBe('1');
  releaseProfile();
  await expect.poll(() => new URL(page.url()).searchParams.get('conditions')).toBeNull();
  await expect(filters).toBeVisible();
  await filters.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(filters).not.toBeVisible();
  expect(requests.filter(type => type === 'hosts' || type === 'analytics')).toEqual([]);
});
