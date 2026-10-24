import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('navigation collapse is stable, remembered and keeps scenarios below Settings', async ({ page }, info) => {
  await page.goto('/search');
  const sidebar = page.getByRole('complementary', { name: 'Workspace navigation' });
  const collapse = sidebar.getByRole('button', { name: 'Collapse navigation', exact: true });
  const expandedToggle = await collapse.boundingBox();
  const expandedSearch = await sidebar.getByRole('link', { name: 'Search', exact: true }).boundingBox();
  await collapse.click();
  const expand = sidebar.getByRole('button', { name: 'Expand navigation', exact: true });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(72);
  const collapsedToggle = await expand.boundingBox();
  const collapsedSearch = await sidebar.getByRole('link', { name: 'Search', exact: true }).boundingBox();
  expect(collapsedToggle!.y).toBe(expandedToggle!.y);
  expect(collapsedToggle!.width).toBe(collapsedToggle!.height);
  expect(collapsedSearch!.y).toBe(expandedSearch!.y);
  await page.screenshot({ path: info.outputPath('sidebar-collapsed.png') });
  await sidebar.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.reload();
  await expect(expand).toBeVisible();
  expect(await page.locator('.workspace-context').count()).toBe(0);
  await expand.click();
  await expect(collapse).toBeVisible();
  const links = await sidebar.locator('.sidebar-bottom > a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
  expect(links.indexOf('/scenarios')).toBe(links.indexOf('/settings') + 1);
  await expect(sidebar.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Scenarios' })).toHaveCount(0);
});

test('account menu supports keyboard, dismissal and real profile navigation', async ({ page }, info) => {
  await page.goto('/search');
  const trigger = page.getByRole('button', { name: 'Account menu', exact: true });
  await expect(trigger.locator('img')).toBeVisible();
  await trigger.focus();
  await trigger.press('ArrowDown');
  const profile = page.getByRole('menuitem', { name: 'Profile & avatar', exact: true });
  await expect(profile).toBeFocused();
  const surface = page.locator('.account-popover');
  await expect(surface).toContainText('Current plan');
  await expect(surface).toContainText('Business');
  expect(await surface.locator('img').getAttribute('src')).toBe(await trigger.locator('img').getAttribute('src'));
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Appearance', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Manage plan', exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath('account-menu-desktop.png') });
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(surface).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await profile.click();
  await expect(page).toHaveURL(/\/settings\?section=profile$/);
  await expect(page.getByRole('button', { name: 'Change avatar', exact: true })).toBeVisible();
  await expect(surface).not.toBeVisible();
});

test('mobile and landscape account navigation stays reachable and releases the page', async ({ page }, info) => {
  for (const viewport of [{ width: 320, height: 800 }, { width: 390, height: 844 }, { width: 667, height: 375 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/search');
    const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
    await menu.click();
    const account = page.getByRole('button', { name: 'Account menu', exact: true });
    await account.focus();
    await expect(account).toBeInViewport();
    await account.click();
    const surface = page.locator('.account-popover');
    await expect(surface).toBeVisible();
    const box = (await surface.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({ path: info.outputPath(`account-menu-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await expect(surface).not.toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await expect(account).toBeFocused();
    await account.click();
    await page.getByRole('menuitem', { name: 'Profile & avatar', exact: true }).click();
    await expect(page).toHaveURL(/section=profile$/);
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
    expect(await page.evaluate(() => [document.body.style.overflow, document.documentElement.style.overflow])).toEqual(['', '']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('branded double buttons have touching segments at all product sizes', async ({ page }, info) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/search');
    await expect(page.getByRole('button', { name: 'Run search', exact: true })).toBeVisible();
    for (const route of ['/search', '/billing?section=plans', '/billing?section=credits']) {
      if (route !== '/search') await page.goto(route);
      await expect(page.locator('.double-button:visible').first()).toBeVisible();
      for (const button of await page.locator('.double-button:visible').all()) {
        const geometry = await button.evaluate(node => {
          const label = node.querySelector('.double-button__label')!.getBoundingClientRect();
          const icon = node.querySelector('.double-button__icon')!.getBoundingClientRect();
          return { labelVisible: label.width > 0, gap: icon.left - label.right, labelHeight: label.height, iconHeight: icon.height, iconWidth: icon.width, focusStops: node.querySelectorAll('button,a,input,[tabindex]').length };
        });
        if (geometry.labelVisible) {
          expect(Math.abs(geometry.gap)).toBeLessThan(.05);
          expect(Math.abs(geometry.labelHeight - geometry.iconHeight)).toBeLessThan(.05);
        }
        expect(Math.abs(geometry.iconHeight - geometry.iconWidth)).toBeLessThan(.05);
        expect(geometry.focusStops).toBe(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`credits-touching-buttons-${width}.png`) });
  }
});
