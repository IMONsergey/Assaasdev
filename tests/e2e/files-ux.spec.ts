import { expect, test, type Page } from '@playwright/test';
import { seedProfile } from '../../src/demo/fixtures';

async function controlledFiles(page: Page) {
  const requests: Array<{ type: string; data: Record<string, unknown> }> = [];
  const exports: Array<Record<string, unknown>> = [];
  const fileReplies: Array<() => void> = [], bucketReplies: Array<() => void> = [];
  let holdFiles = false, holdBuckets = false;
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: seedProfile() }));
  await page.route('**/backend/download/buckets/stream', route => {
    exports.push(route.request().postDataJSON());
    return route.fulfill({ contentType: 'application/x-ndjson', body: '{"host":"files.example.test"}\n' });
  });
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw)); requests.push(frame);
    const send = (data: unknown) => socket.send(JSON.stringify({ id: frame.id, type: frame.type, data, metadata: { subscription_type: 'Business' } }));
    if (frame.type === 'buckets') {
      const reply = () => send({ result_count: 1, result: frame.data.key_words?.includes('invalid-metadata') ? [{ key: 42, extension: {} }] : [{ host: 'files.example.test', key: 'docs/report.csv', extension: 'csv', size_mb: 0 }] });
      if (holdFiles) fileReplies.push(reply); else reply();
    } else if (frame.type === 'bucket_analytics') {
      const reply = () => send({ result_count: 1, result: [{ host: 'files.example.test', file_count: 1 }] });
      if (holdBuckets) bucketReplies.push(reply); else reply();
    } else send({ unread_count: 0 });
  }));
  return {
    requests, exports,
    holdFiles: (value: boolean) => { holdFiles = value; },
    holdBuckets: (value: boolean) => { holdBuckets = value; },
    releaseFiles: () => fileReplies.splice(0).forEach(reply => reply()),
    releaseBuckets: () => bucketReplies.splice(0).forEach(reply => reply()),
  };
}

test('completed file and bucket views survive tab changes while an in-flight request continues and export matches its source', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: undefined }));
  const fixture = await controlledFiles(page);
  await page.goto('/files');
  await page.getByLabel('Filename or keywords', { exact: true }).fill('report');
  await page.getByRole('button', { name: 'Search files', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 file record', exact: true })).toBeVisible();
  fixture.holdBuckets(true);
  await page.getByRole('tab', { name: 'Buckets', exact: true }).click();
  await page.getByRole('button', { name: 'Search buckets', exact: true }).click();
  await expect.poll(() => fixture.requests.filter(frame => frame.type === 'bucket_analytics').length).toBe(1);
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 file record', exact: true })).toBeVisible();
  fixture.releaseBuckets();
  await page.getByRole('tab', { name: 'Buckets', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 bucket record', exact: true })).toBeVisible();
  for (const [tab, mode] of [['Buckets', 'hosts'], ['Files', 'files']] as const) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.getByRole('button', { name: 'Download records', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Export bucket data', exact: true });
    await expect(dialog.getByLabel('Record detail', { exact: true })).toHaveAttribute('data-control-value', mode);
    const downloaded = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Start export', exact: true }).click();
    await downloaded;
    await expect(dialog.getByText('Export complete', { exact: true })).toBeVisible();
    expect(fixture.exports.at(-1)).toMatchObject({ download_mode: mode, key_words: ['report'] });
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  }
  await page.getByRole('tab', { name: 'Buckets', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 bucket record', exact: true })).toBeVisible();
  expect(fixture.requests.filter(frame => frame.type === 'buckets')).toHaveLength(1);
  expect(fixture.requests.filter(frame => frame.type === 'bucket_analytics')).toHaveLength(1);
});

test('stopping one file view leaves the other usable and malformed metadata remains a recoverable error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const fixture = await controlledFiles(page);
  fixture.holdFiles(true);
  await page.goto('/files');
  await page.getByLabel('Filename or keywords', { exact: true }).fill('report');
  await page.getByRole('button', { name: 'Search files', exact: true }).click();
  await expect.poll(() => fixture.requests.filter(frame => frame.type === 'buckets').length).toBe(1);
  await page.getByRole('button', { name: 'Stop waiting', exact: true }).click();
  await expect(page.getByText('Search stopped', { exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Buckets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Search matching buckets', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search buckets', exact: true })).toBeEnabled();
  expect(fixture.requests.filter(frame => frame.type === 'bucket_analytics')).toHaveLength(0);
  fixture.releaseFiles();
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await expect(page.getByText('Search stopped', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1 file record', exact: true })).toHaveCount(0);
  expect(fixture.requests.filter(frame => frame.type === 'buckets')).toHaveLength(1);
  fixture.holdFiles(false);
  await page.getByRole('button', { name: 'Run again', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 file record', exact: true })).toBeVisible();
  expect(fixture.requests.filter(frame => frame.type === 'buckets')).toHaveLength(2);
  await page.getByLabel('Filename or keywords', { exact: true }).fill('invalid-metadata');
  await page.getByRole('button', { name: 'Search files', exact: true }).click();
  await expect(page.getByText('Search results could not be confirmed', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Filename or keywords', { exact: true })).toHaveValue('invalid-metadata');
  await expect(page.getByRole('button', { name: 'Run again', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Buckets & files', exact: true })).toBeVisible();
  expect(fixture.requests.filter(frame => frame.type === 'buckets')).toHaveLength(3);
  expect(errors).toEqual([]);
});

test('sign-in restores prepared file filters without sending a search until explicitly requested', async ({ page }) => {
  let authenticated = false;
  const requests: string[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/backend/auth/login') { authenticated = true; return route.fulfill({ json: { message: 'Signed in' } }); }
    return path === '/backend/whoami' && !authenticated ? route.fulfill({ status: 401, json: { error: 'Unauthorized' } }) : route.fulfill({ json: seedProfile() });
  });
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw)); requests.push(frame.type);
    socket.send(JSON.stringify({ id: frame.id, type: frame.type, data: { unread_count: 0 }, metadata: { subscription_type: 'Business' } }));
  }));
  await page.goto('/files');
  await expect(page.getByRole('link', { name: /Continue to sign in/ })).toBeVisible();
  await page.getByLabel('Filename or keywords', { exact: true }).fill('reports, 2026');
  await page.getByRole('tab', { name: 'Buckets', exact: true }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const filters = page.getByRole('dialog', { name: 'File filters', exact: true });
  await filters.getByLabel('Hostname', { exact: true }).fill('storage.example.test/public');
  await filters.getByLabel('Extensions', { exact: true }).fill('csv, json');
  await filters.getByLabel('Size from · MB', { exact: true }).fill('0');
  await filters.getByRole('link', { name: 'Continue to sign in', exact: true }).click();
  await page.getByLabel('Email or username').fill('file_context');
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page).toHaveURL(url => url.pathname === '/files' && url.searchParams.get('view') === 'hosts');
  await expect(page.getByLabel('Keywords in bucket files', { exact: true })).toHaveValue('reports, 2026');
  await expect(page.getByText('Filters restored · Search to load results', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Search buckets', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(filters.getByLabel('Hostname', { exact: true })).toHaveValue('storage.example.test/public');
  await expect(filters.getByLabel('Extensions', { exact: true })).toHaveValue('csv, json');
  await expect(filters.getByLabel('Size from · MB', { exact: true })).toHaveValue('0');
  expect(requests.filter(type => type === 'buckets' || type === 'bucket_analytics')).toEqual([]);
});

test('primary file search and grouped filters submit explicitly and changing views stays free', async ({ page }, testInfo) => {
  const frames: Array<{ type: string; data: Record<string, unknown> }> = [];
  const profile = seedProfile();
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: profile }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw)); frames.push(frame);
    const reply = (data: unknown) => socket.send(JSON.stringify({ id: frame.id, type: frame.type, data, metadata: { subscription_type: 'Business' } }));
    if (frame.type === 'buckets') reply({ result: [{ host: 'files.example.test', key: 'docs/report.csv', extension: 'csv', size_mb: 0, uts: 1800000000 }], result_count: 1 });
    else if (frame.type === 'bucket_analytics') reply({ result: [{ host: 'files.example.test', file_count: 1 }], result_count: 1 });
    else reply({ unread_count: 0 });
  }));
  await page.goto('/files');
  const input = page.getByLabel('Filename or keywords', { exact: true });
  await input.fill('report');
  expect(frames.filter(frame => frame.type === 'buckets')).toEqual([]);
  // Submit and switch views in one turn while rendered URL parameters are still old.
  await input.evaluate(node => {
    if (!(node instanceof HTMLInputElement) || !node.form) throw new Error('File search form is missing');
    const buckets = document.getElementById('files-tab-hosts');
    if (!(buckets instanceof HTMLButtonElement)) throw new Error('Buckets tab is missing');
    node.form.requestSubmit();
    buckets.click();
  });
  await expect(page).toHaveURL(url => {
    const filter = JSON.parse(url.searchParams.get('filter') || '{}');
    return url.searchParams.get('view') === 'hosts' && filter.key_words?.join(',') === 'report';
  });
  await expect(page.getByLabel('Keywords in bucket files', { exact: true })).toHaveValue('report');
  await expect.poll(() => frames.filter(frame => frame.type === 'buckets').length).toBe(1);
  expect(frames.filter(frame => frame.type === 'buckets')[0].data).toMatchObject({ key_words: ['report'] });
  expect(frames.filter(frame => frame.type === 'bucket_analytics')).toHaveLength(0);
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 file record', exact: true })).toBeVisible();
  expect(frames.filter(frame => frame.type === 'buckets')).toHaveLength(1);
  await expect(page.locator('.files-table')).toContainText('0 MB');
  await page.locator('.files-table tbody tr').first().getByText('0 MB', { exact: true }).click();
  const metadata = page.getByRole('dialog', { name: 'report.csv', exact: true });
  await expect(metadata).toContainText('docs/report.csv');
  await metadata.getByText('Source metadata', { exact: true }).click();
  await expect(metadata.locator('.code-token--number')).toContainText(['0', '1800000000']);
  expect(frames.filter(frame => frame.type === 'buckets')).toHaveLength(1);
  await metadata.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.locator('.files-page').screenshot({ path: testInfo.outputPath('files-results-1440.png') });
  const filters = page.getByRole('button', { name: 'Filters', exact: true });
  await filters.click();
  const drawer = page.getByRole('dialog', { name: 'File filters', exact: true });
  await expect(drawer.getByLabel('Hostname', { exact: true })).toBeFocused();
  await expect(drawer.getByLabel('Keywords', { exact: true })).toHaveValue('report');
  await drawer.getByText('Advanced metadata', { exact: true }).click();
  await drawer.getByLabel('Stopwords', { exact: true }).fill('backup');
  await drawer.getByLabel('Size from · MB', { exact: true }).fill('0');
  await drawer.getByLabel('Size to · MB', { exact: true }).fill('10');
  expect(frames.filter(frame => frame.type === 'buckets')).toHaveLength(1);
  await drawer.locator('.dialog-body').evaluate(node => { node.scrollTop = 0; });
  await drawer.screenshot({ path: testInfo.outputPath('files-filter-1440.png') });
  await page.setViewportSize({ width: 320, height: 720 });
  await drawer.locator('.dialog-body').evaluate(node => { node.scrollTop = 0; });
  await drawer.screenshot({ path: testInfo.outputPath('files-filter-320.png') });
  await drawer.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(filters).toBeFocused();
  await page.locator('.files-page').screenshot({ path: testInfo.outputPath('files-results-320.png') });
  await expect.poll(() => frames.filter(frame => frame.type === 'buckets').length).toBe(2);
  expect(frames.filter(frame => frame.type === 'buckets')[1].data).toMatchObject({ key_words: ['report'], stop_words: ['backup'], min_size_mb: 0, max_size_mb: 10 });
  await page.getByRole('tab', { name: 'Buckets', exact: true }).click();
  expect(frames.filter(frame => frame.type === 'bucket_analytics')).toEqual([]);
  await expect(page.getByLabel('Keywords in bucket files', { exact: true })).toHaveValue('report');
  await page.getByRole('button', { name: 'Search buckets', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 bucket record', exact: true })).toBeVisible();
  expect(frames.filter(frame => frame.type === 'bucket_analytics')).toHaveLength(1);
  await page.setViewportSize({ width: 320, height: 720 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.getByRole('button', { name: 'Search this bucket', exact: true })).toBeVisible();
  await page.locator('.files-page').screenshot({ path: testInfo.outputPath('buckets-results-320.png') });
});
