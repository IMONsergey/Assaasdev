import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = ['/search', '/search?q=example&run=1', '/hosts/192.0.2.10', '/search/saved', '/search/share', '/files', '/scanner', '/scanner/new', '/private/search', '/api', '/billing', '/account', '/account/security', '/account/sessions', '/account/team', '/notifications', '/settings'];
for (const width of [1440, 390, 320]) {
  test(`workspace routes render without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 760 ? 960 : 844 });
    const exceptions: string[] = []; page.on('pageerror', error => exceptions.push(error.message));
    for (const route of routes) await test.step(route, async () => {
      await page.goto(route);
      await expect(page.locator('main')).toBeVisible();
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('body')).not.toContainText('This view could not be displayed');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await expect.poll(() => page.locator('img:visible').evaluateAll(images => images.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
    });
    expect(exceptions).toEqual([]);
  });
}

test('view preferences survive reload and leave no account data in local storage', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /Dark A quieter/ }).click();
  await page.getByLabel('Interface density').selectOption('compact');
  await page.getByLabel('Text size').selectOption('125');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.getByLabel('Text size')).toHaveValue('125');
  const storage = await page.evaluate(() => ({ keys: Object.keys(localStorage), values: Object.values(localStorage).join('') }));
  expect(storage.keys).toEqual(['apcosys.view.v1']);
  expect(storage.values).not.toMatch(/alex|api_key|session_id|backup|password|full_text_search/i);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('mobile navigation traps focus, closes on Escape and opens the selected view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/search');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true }).last()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Private Scanner' }).click();
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.getByRole('button', { name: 'Open navigation' })).toHaveAttribute('aria-expanded', 'false');
});

for (const route of ['/search', '/files', '/scanner', '/billing', '/account/security', '/notifications', '/settings']) {
  test(`accessibility of ${route}`, async ({ page }) => {
    await page.goto(route); await expect(page.locator('h1')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
  });
}

test('files export downloads an actual NDJSON stream', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); });
  await page.goto('/files'); await page.getByRole('button', { name: 'Explore sample files' }).click();
  await expect(page.getByRole('heading', { name: /file records/ })).toBeVisible();
  await page.getByRole('button', { name: 'Download records' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export sample data' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/apcosys-files-.*\.ndjson$/);
  await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
});

test('notifications can be marked read without exposing secret payload fields', async ({ page }) => {
  await page.goto('/notifications');
  await expect(page.getByText('2 unread', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark all as read' }).click();
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('api_key');
});

for (const failCommit of [false, true]) {
  test(`direct file export ${failCommit ? 'reports a failed disk commit and blocks resumption' : 'writes real NDJSON bytes and confirms after close'}`, async ({ page }) => {
    await page.addInitScript(({ failCommit }) => {
      const state = { bytes: [] as number[], closeCalls: 0 };
      Object.assign(window, { __downloadTest: state });
      Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: async () => ({
        createWritable: async () => ({
          seek: async () => undefined, truncate: async () => undefined,
          write: async (bytes: Uint8Array) => { state.bytes.push(...bytes); },
          close: async () => { state.closeCalls++; if (failCommit) throw new DOMException('Disk full', 'QuotaExceededError'); },
        }),
      }) });
    }, { failCommit });
    await page.goto('/files');
    await page.getByRole('button', { name: 'Explore sample files' }).click();
    await page.getByRole('button', { name: 'Download records' }).click();
    await page.getByRole('button', { name: 'Export sample data' }).click();
    if (failCommit) {
      await expect(page.getByText('Export is incomplete', { exact: true })).toBeVisible();
      await expect(page.getByRole('dialog')).toContainText('Its contents are unverified');
      await expect(page.getByText('Export complete', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Resume from checkpoint' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Start over' })).toBeVisible();
    } else await expect(page.getByText('Export complete', { exact: true })).toBeVisible();
    const data = await page.evaluate(() => (window as unknown as { __downloadTest: { bytes: number[]; closeCalls: number } }).__downloadTest);
    expect(data.closeCalls).toBe(1);
    const lines = new TextDecoder().decode(new Uint8Array(data.bytes)).trim().split('\n');
    expect(lines.length).toBe(8);
    for (const line of lines) expect(JSON.parse(line)).toHaveProperty('key');
  });
}
