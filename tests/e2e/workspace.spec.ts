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
      try {
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      } catch (error) {
        const layout = await page.evaluate(() => ({
          route: location.pathname, viewport: innerWidth, document: document.documentElement.scrollWidth,
          outside: [...document.body.querySelectorAll('*')].map(node => {
            const box = node.getBoundingClientRect(), css = getComputedStyle(node);
            return { tag: node.tagName, className: node.className, text: node.textContent?.trim().slice(0, 60), left: box.left, right: box.right, width: box.width, position: css.position, overflowX: css.overflowX, containingBlock: (node as HTMLElement).offsetParent?.className };
          }).filter(node => node.width > 0 && node.right > innerWidth + 1),
        }));
        await test.info().attach('layout-overflow.json', { body: JSON.stringify(layout, null, 2), contentType: 'application/json' });
        console.error('LAYOUT_OVERFLOW', JSON.stringify(layout));
        throw error;
      }
      if (route === '/search?q=example&run=1') {
        // Flags below the fold intentionally load on approach. Exercise that
        // scroll path before checking every rendered image, then restore the view.
        for (const flag of await page.locator('.search-result-row .country-flag').all()) {
          await flag.scrollIntoViewIfNeeded();
          await expect.poll(() => flag.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        }
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      }
      await expect.poll(() => page.locator('img:visible').evaluateAll(images => images.every(node => (node as HTMLImageElement).complete && (node as HTMLImageElement).naturalWidth > 0))).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: test.info().outputPath(`route-${route.slice(1).replace(/[^a-z0-9_-]+/gi, '-')}-${width}.png`), fullPage: false });
      if (route === '/scanner' && width < 720) {
        const action = page.getByRole('button', { name: 'Delete', exact: true }).first();
        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();
        expect(await page.locator('.scanner-tasks-table-wrap').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
        await expect(page.getByRole('button', { name: 'Edit', exact: true }).first()).toBeInViewport();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      }
    });
    expect(exceptions).toEqual([]);
  });
}

test('search opens with a centered single-line title and keeps the query after cancelling filters', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/search');
  const heading = page.getByRole('heading', { name: 'Search internet infrastructure', exact: true });
  const query = page.getByRole('combobox', { name: 'Search internet infrastructure', exact: true });
  const form = page.locator('form').filter({ has: query });
  await expect(heading).toBeVisible();
  await expect(query).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  const main = await page.getByRole('main').boundingBox();
  const search = await form.boundingBox();
  const title = await heading.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const lines = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0);
    const bounds = range.getBoundingClientRect();
    return { lines: new Set(lines.map(rect => Math.round(rect.top))).size, center: bounds.x + bounds.width / 2, top: bounds.top };
  });
  expect(main).not.toBeNull();
  expect(search).not.toBeNull();
  const mainCenter = main!.x + main!.width / 2;
  expect(title.lines).toBe(1);
  expect(Math.abs(title.center - mainCenter)).toBeLessThan(main!.width * 0.03);
  expect(Math.abs(search!.x + search!.width / 2 - mainCenter)).toBeLessThan(main!.width * 0.03);
  expect(search!.width).toBeGreaterThan(main!.width * 0.45);
  expect(search!.width).toBeLessThan(main!.width * 0.8);
  expect(title.top).toBeGreaterThan(960 * 0.25);
  expect(search!.y + search!.height).toBeLessThan(960 * 0.75);
  await page.screenshot({ path: test.info().outputPath('search-reference-1440.png'), fullPage: false });

  await query.fill('nginx');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const conditions = page.getByRole('region', { name: 'Conditions', exact: true });
  await expect(conditions).toBeVisible();
  await conditions.getByRole('button', { name: 'Add condition', exact: true }).click();
  await conditions.getByLabel('Field', { exact: true }).fill('country_code');
  await conditions.getByLabel('Value', { exact: true }).fill('zz');
  await page.getByRole('dialog', { name: 'Filters', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(conditions).toHaveCount(0);
  await expect(query).toHaveValue('nginx');
  await page.getByRole('button', { name: 'Run search', exact: true }).click();
  await expect(page.getByRole('heading', { name: '4 hosts returned', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('q')).toBe('nginx');
  expect(page.url()).not.toContain('country_code');
});

test('desktop navigation collapses, keeps Settings accessible and expands again', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/search');
  const navigation = page.getByRole('complementary', { name: 'Workspace navigation' });
  const main = page.getByRole('main');
  const collapse = navigation.getByRole('button', { name: 'Collapse navigation', exact: true });
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  const expandedMain = await main.boundingBox();
  expect(expandedMain).not.toBeNull();
  await collapse.click();
  const expand = navigation.getByRole('button', { name: 'Expand navigation', exact: true });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => (await main.boundingBox())?.width ?? 0).toBeGreaterThan(expandedMain!.width);

  await navigation.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Appearance', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Light theme', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(navigation.getByRole('button', { name: /^(Light|Dark|System) theme$/ })).toHaveCount(0);
  await expand.click();
  await expect(collapse).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test('view preferences survive reload and leave no account data in local storage', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'no-preference' });
  await page.addInitScript(() => {
    if (!localStorage.getItem('apcosys.view.v1')) localStorage.setItem('apcosys.view.v1', JSON.stringify({ theme: 'system', density: 'comfortable', language: 'en', fontScale: 100, reducedMotion: false }));
  });
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: 'Light theme', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await page.getByLabel('Interface density').selectOption('compact');
  await page.getByLabel('Text size').selectOption('125');
  await page.getByRole('switch', { name: 'Reduce interface motion', exact: true }).check();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Dark theme', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await expect(page.getByLabel('Text size')).toHaveValue('125');
  await expect(page.getByRole('switch', { name: 'Reduce interface motion', exact: true })).toBeChecked();
  const storage = await page.evaluate(() => ({ keys: Object.keys(localStorage), values: Object.values(localStorage).join('') }));
  expect(storage.keys).toContain('apcosys.view.v1');
  expect(storage.keys.every(key => key === 'apcosys.view.v1' || /^apcosys\.avatar\.v1:[a-f0-9]{16}$/.test(key))).toBe(true);
  expect(storage.values).not.toMatch(/alex|api_key|session_id|backup|password|full_text_search/i);
  await page.screenshot({ path: test.info().outputPath('settings-dark-large-text-1440.png'), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('settings-dark-large-text-390.png'), fullPage: false });
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
  await page.goto('/files'); await page.getByRole('button', { name: 'Search files' }).click();
  await expect(page.getByRole('heading', { name: /file records/ })).toBeVisible();
  await page.getByRole('button', { name: 'Download records' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Start export' }).click();
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
    await page.getByRole('button', { name: 'Search files' }).click();
    await page.getByRole('button', { name: 'Download records' }).click();
    await page.getByRole('button', { name: 'Start export' }).click();
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
