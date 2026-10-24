import { expect, test, type Page } from '@playwright/test';
import { seedProfile } from '../../src/demo/fixtures';

type RequestFrame = { type: string; id: string; data: Record<string, unknown> };
async function actionFixture(page: Page, options: { uncertainSave?: boolean; uncertainShare?: boolean } = {}) {
  const requests: RequestFrame[] = [];
  const saved: Array<{ id: string; query: string; created_at: number }> = [];
  let pauseList = false, releaseList: (() => void) | undefined;
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: { ...seedProfile(), api_key: 'private-key-never-in-shared-link' } }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw)) as RequestFrame; requests.push(frame);
    const reply = (data: unknown) => socket.send(JSON.stringify({ id: frame.id, type: frame.type, data, metadata: { subscription_type: 'Business' } }));
    if (frame.type === 'hosts' || frame.type === 'private_hosts') reply([{ ip: '192.0.2.24', org: 'Example network', open_ports: [{ port: 443, protocol: 'https' }] }]);
    else if (frame.type === 'query_list') { if (pauseList) { pauseList = false; releaseList = () => reply(saved); } else reply(saved); }
    else if (frame.type === 'query_create') { saved.push({ id: 'aaaaaaaaaaaaaaaaaaaaaaaa', query: JSON.stringify(frame.data), created_at: 1800000000 }); reply({ success: !options.uncertainSave }); }
    else if (frame.type === 'short_link_create' || frame.type === 'share_link_create') {
      if (options.uncertainShare) { reply({}); return; }
      const query = new URLSearchParams(String(frame.data.query));
      if (frame.type === 'share_link_create') query.set('st', 'limited-scope-token');
      const url = `http://localhost:5173${query.get('dataset') === 'private' ? '/private' : ''}/search?${query}`;
      reply({ short_id: 'query-link', short_url: url, long_url: url, ...(frame.type === 'share_link_create' ? { share_token: 'limited-scope-token' } : {}) });
    } else reply({ unread_count: 0 });
  }));
  return { requests, saved, pauseNextList: () => { pauseList = true; }, releaseList: () => releaseList?.() };
}

test('Save and Share stay over results and preserve the exact applied private query', async ({ page }) => {
  const fixture = await actionFixture(page);
  const request = { full_text_search: 'nginx', page: 2, docs_per_page: 10, task_ids: ['owned-task'], simple_search_filters: [{ operator: 'OR', filters: [{ field: 'port', value: '80' }, { field: 'port', value: '443' }] }] };
  await page.goto(`/private/search?request=${encodeURIComponent(JSON.stringify(request))}&run=1&scanner_back=${encodeURIComponent('/scanner?section=tasks')}`);
  await expect(page.getByRole('heading', { name: '1 host returned', exact: true })).toBeVisible();
  const resultUrl = page.url();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const save = page.getByRole('dialog', { name: 'Save query', exact: true });
  await expect(save).toContainText('Private scans');
  await save.getByRole('button', { name: 'Save current query', exact: true }).click();
  await expect(save.getByRole('status')).toContainText('Query saved');
  expect(fixture.saved).toHaveLength(1);
  expect(JSON.parse(fixture.saved[0].query)).toEqual(request);
  expect(page.url()).toBe(resultUrl);
  await save.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(save).toContainText('already in Saved queries');
  await expect(save.getByRole('button', { name: 'Save current query', exact: true })).toHaveCount(0);
  await save.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const share = page.getByRole('dialog', { name: 'Share search', exact: true });
  await share.getByRole('button', { name: 'Create search link', exact: true }).click();
  const normal = await share.getByLabel('Search link ready', { exact: true }).inputValue();
  expect(JSON.parse(new URL(normal).searchParams.get('request')!)).toEqual(request);
  expect(new URL(normal).pathname).toBe('/private/search');
  expect(normal).not.toContain('private-key-never');
  await share.getByRole('tab', { name: 'Limited access', exact: true }).click();
  await share.getByLabel('Expires after · days', { exact: true }).fill('3');
  await share.getByLabel('Maximum API uses', { exact: true }).fill('5');
  await share.getByRole('button', { name: 'Create limited link', exact: true }).click();
  await expect(share.getByLabel('Limited link ready', { exact: true })).toBeVisible();
  const limited = await share.getByLabel('Limited link ready', { exact: true }).inputValue();
  expect(fixture.requests.find(frame => frame.type === 'share_link_create')?.data).toMatchObject({ data: request, ttl_seconds: 259200, max_opens: 5 });
  expect(page.url()).toBe(resultUrl);
  expect(fixture.requests.filter(frame => frame.type === 'private_hosts')).toHaveLength(1);
  await share.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await expect(share.getByRole('tab', { name: 'Limited access', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(share.getByLabel('Expires after · days', { exact: true })).toHaveValue('3');
  await expect(share.getByLabel('Maximum API uses', { exact: true })).toHaveValue('5');
  await expect(share.getByLabel('Limited link ready', { exact: true })).toHaveValue(limited);
  await expect(share.getByRole('button', { name: 'Create limited link', exact: true })).toHaveCount(0);
  await share.getByRole('tab', { name: 'Search link', exact: true }).click();
  await expect(share.getByLabel('Search link ready', { exact: true })).toHaveValue(normal);
  expect(fixture.requests.filter(frame => frame.type === 'short_link_create')).toHaveLength(1);
  expect(fixture.requests.filter(frame => frame.type === 'share_link_create')).toHaveLength(1);
});

for (const resolution of ['refresh', 'reopen'] as const) test(`an uncertain save is reconciled on ${resolution} before another mutation can be sent`, async ({ page }) => {
  const fixture = await actionFixture(page, { uncertainSave: true });
  await page.goto('/search?q=nginx&run=1');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const save = page.getByRole('dialog', { name: 'Save query', exact: true });
  await save.getByRole('button', { name: 'Save current query', exact: true }).click();
  await expect(save).toContainText('Save not confirmed');
  await expect(save.getByRole('button', { name: 'Save current query', exact: true })).toBeDisabled();
  if (resolution === 'refresh') await save.getByRole('button', { name: 'Check current list', exact: true }).click();
  else {
    await save.getByRole('button', { name: 'Cancel', exact: true }).click();
    fixture.pauseNextList();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => fixture.requests.filter(frame => frame.type === 'query_list').length).toBe(2);
    await expect(save.getByRole('button', { name: 'Save current query', exact: true })).toBeDisabled();
    fixture.releaseList();
  }
  await expect(save).toContainText('already in Saved queries');
  expect(fixture.requests.filter(frame => frame.type === 'query_create')).toHaveLength(1);
});

test('uncertain share outcomes and chosen limits survive closing and reopening', async ({ page }) => {
  const fixture = await actionFixture(page, { uncertainShare: true });
  await page.goto('/search?q=nginx&run=1');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const share = page.getByRole('dialog', { name: 'Share search', exact: true });
  for (const kind of ['normal', 'limited'] as const) {
    if (kind === 'limited') {
      await share.getByRole('tab', { name: 'Limited access', exact: true }).click();
      await share.getByLabel('Expires after · days', { exact: true }).fill('3');
      await share.getByLabel('Maximum API uses', { exact: true }).fill('5');
    }
    const create = share.getByRole('button', { name: kind === 'normal' ? 'Create search link' : 'Create limited link', exact: true });
    await create.click();
    await expect(share).toContainText('Link creation is not confirmed');
    await share.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(share).toContainText('Link creation is not confirmed');
    await expect(create).toBeDisabled();
  }
  await expect(share.getByLabel('Expires after · days', { exact: true })).toHaveValue('3');
  await expect(share.getByLabel('Maximum API uses', { exact: true })).toHaveValue('5');
  expect(fixture.requests.filter(frame => frame.type === 'short_link_create')).toHaveLength(1);
  expect(fixture.requests.filter(frame => frame.type === 'share_link_create')).toHaveLength(1);
});

test('file examples submit explicit filters and thousand-character names keep a bounded layout', async ({ page }) => {
  const requests: RequestFrame[] = [];
  const longName = 'reports_' + 'very-long-filename-'.repeat(70) + 'final-preview.png';
  const key = 'assets/' + longName;
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: seedProfile() }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw)) as RequestFrame; requests.push(frame);
    const data = frame.type === 'buckets' ? { result_count: 1, result: [{ key, host: 'storage.example.test', container: 'public', extension: 'png', size_mb: 0, protocol: 'https' }] } : { unread_count: 0 };
    socket.send(JSON.stringify({ id: frame.id, type: frame.type, data, metadata: { subscription_type: 'Business' } }));
  }));
  await page.goto('/files');
  await expect(page.getByRole('heading', { name: 'Search indexed files', exact: true })).toBeVisible();
  expect(requests.filter(frame => frame.type === 'buckets')).toHaveLength(0);
  await page.getByRole('button', { name: /Images & assets/ }).click();
  await expect(page.getByRole('heading', { name: '1 file record', exact: true })).toBeVisible();
  expect(requests.find(frame => frame.type === 'buckets')?.data.key_words).toEqual(['assets']);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 820 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const suffix = page.locator('.files-record-name .files-middle-label-end');
    await expect(suffix).toBeInViewport();
    await expect(suffix).toContainText('final-preview.png');
  }
  await page.locator('.files-record-name').click();
  const details = page.getByRole('dialog');
  await expect(details.locator('.files-object-key')).toHaveText(key);
  await expect(details.getByRole('button', { name: 'Copy object key', exact: true })).toBeVisible();
  expect(await details.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect(requests.filter(frame => frame.type === 'buckets')).toHaveLength(1);
});
