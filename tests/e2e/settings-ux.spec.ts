import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseOption } from './helpers/controls';

test('settings open the profile first and keep appearance below account and workspace categories', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('tab', { name: 'Profile', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Profile', exact: true })).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Settings categories', exact: true }).getByRole('tab')).toHaveText(['Profile', 'Security', 'Sessions', 'Organization', 'Workspace', 'Appearance', 'Legal']);
  await page.getByRole('tab', { name: 'Appearance', exact: true }).click();
  await expect(page).toHaveURL(/section=appearance/);
  await page.reload();
  await expect(page.getByRole('tabpanel', { name: 'Appearance', exact: true })).toBeVisible();
  await page.goto('/settings?section=unknown');
  await expect(page.getByRole('tabpanel', { name: 'Profile', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Workspace', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Manage history', exact: true })).toHaveAttribute('href', '/search/history');
});

test('settings keep an unsaved profile while navigating and contain the sign-out action', async ({ page }) => {
  await page.goto('/settings?section=profile');
  const navigation = page.getByRole('complementary', { name: 'Workspace navigation' });
  await expect(navigation.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Profile', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('alex_review');
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await expect(page).toHaveURL(/section=security/);
  const security = page.getByRole('tabpanel', { name: 'Security', exact: true });
  await expect(security).toBeVisible();
  await expect(security.getByRole('heading', { name: 'Password', exact: true })).toBeVisible();
  const confirmation = security.getByLabel('Confirm new password', { exact: true });
  await security.getByLabel('Current password', { exact: true }).fill('local-current-password');
  await security.getByLabel('New password', { exact: true }).fill('local-new-password');
  await confirmation.fill('local-mismatched-password');
  await security.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(confirmation).toBeFocused();
  await expect(confirmation).toHaveAccessibleDescription('The new passwords do not match.');
  await security.getByLabel('New password', { exact: true }).fill('local-revised-password');
  await expect(confirmation).not.toHaveAttribute('aria-invalid', 'true');
  await security.getByRole('button', { name: 'Update password', exact: true }).click();
  await expect(confirmation).toHaveAccessibleDescription('The new passwords do not match.');
  await confirmation.fill('local-revised-password');
  await expect(confirmation).not.toHaveAttribute('aria-invalid', 'true');
  await page.goBack();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveValue('alex_review');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign out of every session?', exact: true });
  await expect(dialog.getByRole('button', { name: 'Sign out everywhere', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeFocused();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveValue('alex_review');
});

test('legacy account tabs retain an unsaved profile', async ({ page }) => {
  await page.goto('/account');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('retained_profile');
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toHaveValue('retained_profile');
});

test('mobile settings reveal deep-linked sections and close the menu on account navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/settings?section=workspace');
  await expect(page.getByRole('button', { name: 'Choose settings section: Workspace', exact: true })).toBeInViewport();
  await expect(page.getByRole('tabpanel', { name: 'Workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const navigation = page.getByRole('complementary', { name: 'Workspace navigation' });
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await navigation.getByRole('button', { name: 'Account menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Profile & avatar', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?section=profile$/);
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose settings section: Profile', exact: true })).toBeInViewport();
});

test('API usage action transfers keyboard focus to the selected tab', async ({ page }) => {
  await page.goto('/api');
  await page.getByRole('button', { name: 'View usage & limits', exact: true }).click();
  const usage = page.getByRole('tab', { name: 'Usage & limits', exact: true });
  await expect(usage).toHaveAttribute('aria-selected', 'true');
  await expect(usage).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'API key', exact: true })).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'API key', exact: true })).toBeVisible();
});

test('API documentation is public and its examples never send a live request', async ({ page }) => {
  const apiCalls: string[] = [];
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ status: 401, json: { error: 'unauthorized' } }));
  await page.route('https://api.apcosys.net/**', route => { apiCalls.push(route.request().url()); return route.abort(); });
  await page.goto('/api?section=docs#get-host');
  await expect(page.getByRole('tab', { name: 'Documentation', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Get a host', exact: true })).toBeVisible();
  await expect(page.locator('.api-docs-endpoint-path')).toContainText('/api/v1/search/hosts/:ip');
  await page.getByRole('tab', { name: 'Python', exact: true }).click();
  await expect(page.locator('.api-docs-example .code-canvas-source')).toContainText('os.environ["APCOSYS_API_KEY"]');
  await page.getByRole('tab', { name: 'API key', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Manage your API access', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Read documentation', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Getting started', exact: true })).toBeVisible();
  expect(apiCalls).toEqual([]);
});

for (const width of [1440, 390]) test(`API reference finds nested fields and keeps example tabs stable at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/api?section=docs#search-hosts');
  const example = page.locator('.api-docs-example');
  await expect(example).toBeVisible();
  const heights: number[] = [];
  for (const language of ['cURL', 'JavaScript', 'Python']) {
    await example.getByRole('tab', { name: language, exact: true }).click();
    const source = example.locator('.code-canvas-source');
    await expect(source).toBeVisible();
    heights.push((await source.boundingBox())!.height);
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  const search = page.getByRole('searchbox', { name: 'Search API documentation', exact: true });
  await search.fill('tls_info ja4s');
  await expect(page.locator('#api-docs-navigation')).toBeVisible();
  await search.press('Enter');
  await expect(page).toHaveURL(url => url.hash === '#get-host' && url.searchParams.get('view') === 'response' && url.searchParams.get('field') === 'ja4s');
  await expect(page.getByRole('heading', { name: 'Get a host', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Response', exact: true })).toHaveAttribute('aria-selected', 'true');
  const tls = page.locator('.api-docs-details').filter({ hasText: 'ports[].tls_info' });
  await expect(tls).toHaveAttribute('open', '');
  await expect(tls.locator('[data-doc-match="true"]')).toBeFocused();
  await expect(tls.getByRole('rowheader').filter({ hasText: /^ja4s/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

for (const width of [1440, 390, 320]) {
  test(`settings and API sections have complete layouts at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width > 760 ? 960 : 844 });
    await page.goto('/settings');
    for (const name of ['Profile', 'Security', 'Sessions', 'Organization', 'Workspace', 'Appearance', 'Legal']) {
      if (width <= 760) {
        await page.getByRole('button', { name: /^Choose settings section:/ }).click();
        await page.getByRole('dialog', { name: 'Settings categories', exact: true }).getByRole('button', { name, exact: true }).click();
        await expect(page.getByRole('button', { name: `Choose settings section: ${name}`, exact: true })).toBeFocused();
      } else {
        await page.getByRole('tab', { name, exact: true }).click();
        await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
      }
      await expect(page.locator('.settings-panel:not([hidden])')).toBeVisible();
      await expect(page.locator('main')).not.toContainText(/This view could not be displayed|Demo workspace|Sample data/);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (name === 'Organization') {
        const members = page.getByRole('table', { name: 'Organization members' });
        await expect(members).toBeVisible();
        expect(await members.evaluate(table => table.scrollWidth <= table.clientWidth + 1)).toBe(true);
        for (const remove of await members.getByRole('button', { name: /^Remove / }).all()) {
          const bounds = await remove.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        }
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath(`settings-${name.toLowerCase()}-${width}.png`), fullPage: true });
    }
    await page.goto('/api');
    for (const name of ['API key', 'Usage & limits', 'Documentation']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`api-${name === 'API key' ? 'key' : name === 'Documentation' ? 'docs' : 'usage'}-${width}.png`), fullPage: true });
    }
  });
}

test('settings sections and API key page remain accessible', async ({ page }) => {
  for (const route of ['/settings', '/settings?section=security', '/settings?section=sessions', '/settings?section=team', '/settings?section=workspace', '/settings?section=appearance', '/settings?section=legal', '/api', '/api?section=docs']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  }
});

test('settings controls fit the available tablet column with the largest text size', async ({ page }, testInfo) => {
  await page.goto('/settings?section=appearance');
  const themes = page.getByRole('group', { name: 'Color theme', exact: true });
  await expect(themes).toBeVisible();
  await expect(themes.getByRole('button')).toHaveCount(3);
  const picker = page.locator('.settings-section-picker');
  for (const width of [1440, 1363]) {
    await page.setViewportSize({ width, height: 960 });
    await expect(picker).toBeHidden();
    await expect(page.getByRole('tablist', { name: 'Settings categories', exact: true })).toBeVisible();
    const desktop = await themes.getByRole('button').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
    expect(Math.max(...desktop) - Math.min(...desktop)).toBeLessThanOrEqual(1);
  }
  await chooseOption(page.getByRole('combobox', { name: 'Text size', exact: true }), '125');
  for (const width of [768, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await page.goto('/settings?section=appearance');
    await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveAttribute('data-control-value', '125');
    await expect(picker).toBeVisible();
    await expect(page.locator('.settings-navigation')).toBeHidden();
    expect(await page.locator('.settings-content').evaluate(node => Math.abs(node.getBoundingClientRect().width - node.closest('.settings-workspace')!.getBoundingClientRect().width))).toBeLessThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(await themes.getByRole('button').evaluateAll(nodes => nodes.every(node => {
      const bounds = node.getBoundingClientRect();
      const heading = node.querySelector('.theme-option-heading')!;
      const text = document.createRange();
      text.selectNodeContents(heading);
      return node.scrollWidth <= node.clientWidth + 1 && [...text.getClientRects()].every(rect => rect.left >= bounds.left && rect.right <= bounds.right + 1);
    }))).toBe(true);
    expect(await page.locator('.settings-row').evaluateAll(nodes => nodes.every(node => {
      const bounds = node.getBoundingClientRect(), copy = node.querySelector('.settings-row-copy')!.getBoundingClientRect(), control = node.querySelector('.settings-row-control')!.getBoundingClientRect();
      const overlap = Math.max(0, Math.min(copy.right, control.right) - Math.max(copy.left, control.left)) * Math.max(0, Math.min(copy.bottom, control.bottom) - Math.max(copy.top, control.top));
      return overlap <= 1 && control.left >= bounds.left - 1 && control.right <= bounds.right + 1;
    }))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`settings-appearance-large-text-${width}.png`), fullPage: true });

    await picker.press('Enter');
    await page.getByRole('dialog', { name: 'Settings categories', exact: true }).getByRole('button', { name: 'Profile', exact: true }).click();
    await expect(picker).toBeFocused();
    await expect(picker).toHaveAccessibleName('Choose settings section: Profile');
    await expect(page.getByRole('button', { name: 'Choose avatar', exact: true })).toBeVisible();
    expect(await page.locator('.profile-identity').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`settings-profile-large-text-${width}.png`), fullPage: true });

    await picker.press('Enter');
    await page.getByRole('dialog', { name: 'Settings categories', exact: true }).getByRole('button', { name: 'Workspace', exact: true }).click();
    await expect(picker).toBeFocused();
    await expect(picker).toHaveAccessibleName('Choose settings section: Workspace');
    await expect(page.getByRole('button', { name: 'Check connection', exact: true })).toBeVisible();
    expect(await page.locator('.settings-row').evaluateAll(nodes => nodes.every(node => node.scrollWidth <= node.clientWidth + 1))).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`settings-workspace-large-text-${width}.png`), fullPage: true });
  }
  await picker.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Settings categories', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 960 });
  await expect(picker).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Settings categories', exact: true })).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Workspace', exact: true })).toBeFocused();
});
