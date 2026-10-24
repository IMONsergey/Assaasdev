import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('settings keep an unsaved profile while navigating and contain the sign-out action', async ({ page }) => {
  await page.goto('/settings?section=profile');
  const navigation = page.getByRole('complementary', { name: 'Workspace navigation' });
  await expect(navigation.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Profile', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('textbox', { name: 'Username', exact: true }).fill('alex_review');
  await page.getByRole('tab', { name: 'Security', exact: true }).click();
  await expect(page).toHaveURL(/section=security/);
  await expect(page.getByRole('heading', { name: 'Password', exact: true })).toBeVisible();
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
  const categories = page.getByRole('tablist', { name: 'Settings categories' });
  await expect(categories).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(page.getByRole('tab', { name: 'Workspace', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  const navigation = page.getByRole('complementary', { name: 'Workspace navigation' });
  await expect(navigation.locator('[aria-current="page"]')).toHaveCount(1);
  await navigation.getByRole('link', { name: 'Account settings', exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?section=profile$/);
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  await expect(page.getByRole('textbox', { name: 'Username', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Profile', exact: true })).toBeInViewport();
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

for (const width of [1440, 390, 320]) {
  test(`settings and API sections have complete layouts at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width > 760 ? 960 : 844 });
    await page.goto('/settings');
    for (const name of ['Appearance', 'Profile', 'Security', 'Sessions', 'Organization', 'Workspace']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('.settings-panel:not([hidden])')).toBeVisible();
      await expect(page.locator('main')).not.toContainText(/This view could not be displayed|Demo workspace|Sample data/);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (name === 'Organization') {
        const members = page.getByRole('table', { name: 'Organization members' });
        await expect(members).toBeVisible();
        expect(await members.evaluate(table => table.scrollWidth <= table.clientWidth + 1)).toBe(true);
        for (const remove of await members.getByRole('button', { name: 'Remove', exact: true }).all()) {
          const bounds = await remove.boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        }
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath(`settings-${name.toLowerCase()}-${width}.png`), fullPage: true });
    }
    await page.goto('/api');
    for (const name of ['API key', 'Usage & limits']) {
      await page.getByRole('tab', { name, exact: true }).click();
      await expect(page.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`api-${name === 'API key' ? 'key' : 'usage'}-${width}.png`), fullPage: true });
    }
  });
}

test('settings sections and API key page remain accessible', async ({ page }) => {
  for (const route of ['/settings?section=profile', '/settings?section=security', '/settings?section=sessions', '/settings?section=team', '/api']) {
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.skeleton')).toHaveCount(0);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  }
});
