import { chooseOption } from './helpers/controls';
import { expect, test, type Page } from '@playwright/test';

type RecordedRequest = { type: string; data: Record<string, unknown> };
async function setupSearch(page: Page, requests: RecordedRequest[], deferAnalytics?: (reply: () => void) => void) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user_id: 'search-ux', user_name: 'search_ux', user_type: 'USER', credits: 5000, subscription: { type: 'Business', credits: 5000 } }) }));
  await page.routeWebSocket('**/backend/ws', socket => {
    socket.onMessage(message => {
      const request = JSON.parse(String(message)) as RecordedRequest & { id: string };
      requests.push(request);
      const send = (data: unknown) => socket.send(JSON.stringify({ type: request.type, id: request.id, data, metadata: { subscription_type: 'Business' } }));
      if (request.type === 'hosts') send(Array.from({ length: Number(request.data.docs_per_page) || 20 }, (_, index) => ({ ip: `192.0.2.${index + 1}`, org: 'Network A', country_code: 'DE', open_ports: [{ port: 443, protocol: 'https' }], uts: 1709251199 })));
      else if (request.type === 'analytics') {
        const reply = () => {
          send({ facet_name: 'country_name', facet_values: [{ key: 'Germany', doc_count: 120 }, { key: 'France', doc_count: 0 }] });
          send({ complete: true });
        };
        if (deferAnalytics) deferAnalytics(reply); else reply();
      } else if (request.type === 'autocomplete') send({ results: [], has_more: false });
      else send({ unread_count: 0 });
    });
  });
}

test('local search views preserve drafts and analytics requires an explicit request', async ({ page }) => {
  const requests: RecordedRequest[] = [];
  const analyticsReplies: (() => void)[] = [];
  await setupSearch(page, requests, reply => analyticsReplies.push(reply));
  await page.goto('/search?q=network&run=1');
  await expect(page.getByRole('heading', { name: '20 hosts returned' })).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Load analytics', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('view')).toBe('analytics');
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
  await page.getByRole('button', { name: 'Load analytics', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => requests.filter(item => item.type === 'analytics').length).toBe(1);
  analyticsReplies.shift()!();
  await expect(page.getByRole('button', { name: 'Reload analytics', exact: true })).toBeFocused();
  const analytics = page.getByRole('complementary', { name: 'Result analytics' });
  const germany = analytics.getByRole('button', { name: /^Germany/ });
  await expect(germany).toContainText('120');
  await expect(analytics.getByRole('button', { name: /^France/ })).toContainText('0');
  await germany.click();
  await expect(page.getByRole('button', { name: 'Apply changes', exact: true })).toHaveCount(1);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Sort', exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await expect(germany).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Cancel changes', exact: true }).click();
  await expect(germany).toHaveAttribute('aria-pressed', 'false');
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(1);
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(1);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await page.getByRole('navigation', { name: 'Pagination', exact: true }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Pagination', exact: true })).toContainText('Page 2');
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await expect(germany).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(1);
  await page.getByRole('button', { name: 'Reload analytics', exact: true }).click();
  await expect.poll(() => requests.filter(item => item.type === 'analytics').length).toBe(2);
  analyticsReplies.shift()!();
  await expect(page.getByRole('button', { name: 'Reload analytics', exact: true })).toBeEnabled();

  // A later explicit load must not take focus back after the user leaves Analytics.
  await page.getByRole('combobox', { name: 'Search internet infrastructure', exact: true }).fill('different network');
  await page.getByRole('button', { name: 'Run search', exact: true }).click();
  await expect.poll(() => requests.filter(item => item.type === 'hosts').length).toBe(3);
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await page.getByRole('button', { name: 'Load analytics', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => requests.filter(item => item.type === 'analytics').length).toBe(3);
  const resultsTab = page.getByRole('tab', { name: 'Results', exact: true });
  await resultsTab.click();
  analyticsReplies.shift()!();
  await expect(page.getByRole('button', { name: 'Reload analytics', exact: true, includeHidden: true })).toBeEnabled();
  await expect(resultsTab).toBeFocused();
  await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
  await expect(germany).toBeVisible();
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(3);
});

test('switching to Analytics immediately after changing rows keeps the submitted search', async ({ page }) => {
  const requests: RecordedRequest[] = [];
  await setupSearch(page, requests);
  await page.goto('/search?q=network&run=1');
  await expect(page.getByRole('heading', { name: '20 hosts returned', exact: true })).toBeVisible();
  // Dispatch both controls in one turn, before the router's transition can render.
  await page.getByRole('combobox', { name: 'Rows', exact: true }).click();
  await page.getByRole('option', { name: '25', exact: true }).evaluate(option => {
    const analytics = document.getElementById('search-view-tab-analytics');
    if (!(analytics instanceof HTMLButtonElement)) throw new Error('Analytics tab is missing');
    (option as HTMLElement).click();
    analytics.click();
  });
  await expect(page).toHaveURL(url => {
    const request = JSON.parse(url.searchParams.get('request') || '{}');
    return url.searchParams.get('view') === 'analytics' && request.docs_per_page === 25 && request.full_text_search === 'network';
  });
  await expect(page.getByRole('button', { name: 'Load analytics', exact: true })).toBeVisible();
  await expect.poll(() => requests.filter(item => item.type === 'hosts').length).toBe(2);
  expect(requests.filter(item => item.type === 'hosts').at(-1)?.data).toMatchObject({ full_text_search: 'network', docs_per_page: 25 });
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
  await page.getByRole('tab', { name: 'Results', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Rows', exact: true })).toHaveAttribute('data-control-value', '25');
  await expect(page.getByRole('heading', { name: '25 hosts returned', exact: true })).toBeVisible();
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(2);
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
});

test('observation dates apply UTC seconds without rewriting complex rules', async ({ page }) => {
  const requests: RecordedRequest[] = [];
  await setupSearch(page, requests);
  const nested = { operator: 'NOT', filters: [{ field: 'type', value: 'ipv6' }] };
  const request = { full_text_search: 'network', simple_search_filters: [nested], range_filter: [{ field: 'uts', start: 0, end: 1709251199 }] };
  await page.goto('/search?request=' + encodeURIComponent(JSON.stringify(request)) + '&run=1');
  await expect(page.getByRole('heading', { name: '20 hosts returned' })).toBeVisible();
  await page.getByRole('button', { name: /^Filters/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Filters', exact: true });
  await expect(dialog.getByRole('combobox', { name: 'Result type', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('From · UTC', { exact: true })).toHaveValue(/^1970-01-01[ T]00:00(?::00)?$/);
  await dialog.getByLabel('To · UTC', { exact: true }).fill('2024-03-01T00:00');
  expect(requests.filter(item => item.type === 'hosts')).toHaveLength(1);
  await dialog.getByRole('button', { name: 'Apply conditions', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => requests.filter(item => item.type === 'hosts').length).toBe(2);
  const applied = requests.filter(item => item.type === 'hosts').at(-1)!.data;
  expect(applied.simple_search_filters).toEqual([nested]);
  expect(applied.range_filter).toEqual([{ field: 'uts', start: 0, end: 1709251200 }]);
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
});

test('full-width filter groups preserve boolean logic, custom fields and UTC ranges through breadcrumb navigation', async ({ page }, info) => {
  const requests: RecordedRequest[] = [];
  await setupSearch(page, requests);
  const request = {
    full_text_search: 'network',
    simple_search_filters: [
      { field: 'country_name', value: 'Germany' },
      { operator: 'OR', filters: [
        { field: 'port', value: '443' },
        { operator: 'NOT', filters: [{ field: 'labels', value: 'development' }, { field: 'custom.observation_count', value: '0' }] },
      ] },
    ],
    range_filter: [{ field: 'uts', start: 0, end: 1709251199 }],
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/search?request=' + encodeURIComponent(JSON.stringify(request)) + '&run=1');
  await expect(page.getByRole('heading', { name: '20 hosts returned' })).toBeVisible();
  await page.getByRole('button', { name: /^Filters/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Filters', exact: true });
  await dialog.getByRole('button', { name: 'Edit any condition, 2 conditions', exact: true }).click();
  await expect(dialog.locator('.condition-view')).toHaveAttribute('data-condition-depth', '1');
  await expect(dialog.getByRole('radio', { name: 'Any', exact: true })).toHaveAttribute('aria-checked', 'true');
  await dialog.getByLabel('Value', { exact: true }).fill('8443');
  await dialog.getByRole('button', { name: 'Edit excluded conditions, 2 conditions', exact: true }).click();
  await expect(dialog.locator('.condition-view')).toHaveAttribute('data-condition-depth', '2');
  await expect(dialog.getByRole('radio', { name: 'Exclude', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(dialog.getByLabel('Field', { exact: true }).nth(1)).toHaveValue('custom.observation_count');
  await dialog.getByLabel('Value', { exact: true }).nth(1).fill('5');
  await dialog.getByRole('navigation', { name: 'Condition groups' }).getByRole('button', { name: 'All conditions', exact: true }).click();
  await expect(dialog.locator('.condition-view')).toHaveAttribute('data-condition-depth', '0');
  await expect(dialog.getByRole('button', { name: 'Edit any condition, 2 conditions' })).toContainText('Port: 8443');
  await page.screenshot({ path: info.outputPath('filter-group-summary-mobile.png'), animations: 'disabled' });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await dialog.getByRole('button', { name: 'Apply conditions', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => requests.filter(item => item.type === 'hosts').length).toBe(2);
  expect(requests.filter(item => item.type === 'hosts').at(-1)?.data).toMatchObject({
    ...request,
    simple_search_filters: [request.simple_search_filters[0], { operator: 'OR', filters: [
      { field: 'port', value: '8443' },
      { operator: 'NOT', filters: [{ field: 'labels', value: 'development' }, { field: 'custom.observation_count', value: '5' }] },
    ] }],
  });
  expect(requests.filter(item => item.type === 'analytics')).toHaveLength(0);
});

test('search workspaces remain readable on desktop and mobile', async ({ page }, testInfo) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 760 ? 1000 : 844 });
    await page.goto('/search?q=example&run=1');
    await expect(page.locator('.search-result-row').first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: testInfo.outputPath(`search-results-${width}.png`), fullPage: false });
    await page.getByRole('tab', { name: 'Analytics', exact: true }).click();
    await page.getByRole('button', { name: 'Load analytics', exact: true }).click();
    await expect(page.locator('.search-facet').first()).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`search-analytics-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Filters', exact: true });
    await chooseOption(dialog.getByRole('combobox', { name: 'Add a field', exact: true }), 'country_name');
    await dialog.getByLabel('Value', { exact: true }).fill('Germany');
    await dialog.getByRole('button', { name: 'Add group', exact: true }).click();
    const group = dialog.locator('.condition-builder');
    await group.getByLabel('Field', { exact: true }).fill('port');
    await group.getByLabel('Value', { exact: true }).fill('443');
    await group.getByRole('button', { name: 'Add condition', exact: true }).click();
    await group.getByLabel('Field', { exact: true }).nth(1).fill('protocol');
    await group.getByLabel('Value', { exact: true }).nth(1).fill('https');
    await dialog.getByText('Dates & ranges', { exact: true }).click();
    await dialog.getByRole('button', { name: 'Add range', exact: true }).click();
    await dialog.getByLabel('From · UTC', { exact: true }).fill('2025-01-01T00:00');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
    await page.screenshot({ path: testInfo.outputPath(`search-filter-advanced-${width}.png`), fullPage: false });
    await expect(dialog.getByRole('button', { name: 'Apply conditions', exact: true })).toBeInViewport();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('link', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Saved queries', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save current query', exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`search-saved-${width}.png`), fullPage: true });
    await page.getByRole('link', { name: 'Back to results', exact: true }).click();
    await page.getByRole('link', { name: 'Share', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Share search', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`search-share-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
