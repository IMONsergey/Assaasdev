import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { seedProfile } from '../../src/demo/fixtures';
import type { Profile } from '../../src/api';

async function mockAccount(page: Page, initial: Profile, fullAccess = false) {
  let profile = initial;
  let whoamiReads = 0;
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/whoami', route => { whoamiReads++; return route.fulfill({ json: profile }); });
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const frame = JSON.parse(String(raw));
    socket.send(JSON.stringify({ type: frame.type, id: frame.id, data: { notifications: [], total: 0, unread_count: 0 }, metadata: { full_access: fullAccess, credits: profile.credits, timestamp: 1 } }));
  }));
  return { setProfile: (next: Profile) => { profile = next; }, reads: () => whoamiReads };
}

const creditButton = (page: Page) => page.getByRole('button', { name: /^View credits and usage\./ });
const creditDialog = (page: Page) => page.getByRole('dialog', { name: 'Credits & usage', exact: true });
const noOverflow = async (page: Page) => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

test('credit balance and its dialog stay operable from 280px to 1920px with larger text', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('apcosys.view.v1', JSON.stringify({ appearanceVersion: 2, theme: 'light', density: 'comfortable', fontScale: 125, reducedMotion: true })));
  await page.goto('/search');
  for (const width of [280, 320, 390, 540, 768, 1024, 1440, 1920]) await test.step(`${width}px`, async () => {
    await page.setViewportSize({ width, height: 900 });
    const trigger = creditButton(page);
    await expect(trigger).toBeInViewport();
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(trigger.locator('.credit-trigger-track')).toBeVisible();
    await noOverflow(page);
    await trigger.click();
    const dialog = creditDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('meter', { name: 'Search credits relative to included allocation', exact: true })).toHaveAttribute('aria-valuenow', '1240500');
    await expect(dialog.getByRole('meter', { name: 'Scan credits relative to included allocation', exact: true })).toHaveAttribute('aria-valuenow', '327680');
    await expect(dialog.getByRole('link', { name: 'Plans & credit packs' })).toBeInViewport();
    await expect.poll(() => dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    if ([320, 768, 1440].includes(width)) await page.screenshot({ path: info.outputPath(`credits-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => [document.body.style.overflow, document.documentElement.style.overflow])).toEqual(['', '']);
    await noOverflow(page);
  });
});

test('available, extra, unknown and zero credits remain distinct and refresh only on request', async ({ page }) => {
  const profile = { ...seedProfile(), credits: 750, purchased_credits: 400, subscription: { type: 'Free', credits: 500 } } as Profile;
  const mock = await mockAccount(page, profile);
  await page.goto('/settings');
  await creditButton(page).click();
  const dialog = creditDialog(page), meter = dialog.getByRole('meter', { name: 'Search credits relative to included allocation', exact: true });
  await expect(meter).toHaveAttribute('aria-valuenow', '500');
  await expect(meter).toHaveAttribute('aria-valuemax', '500');
  await expect(meter).toHaveAttribute('aria-valuetext', '750 available; 500 included allocation');
  await expect(dialog.getByText('Purchased credits', { exact: true }).locator('..')).toContainText('400');
  expect(mock.reads()).toBe(1);
  mock.setProfile({ ...profile, credits: undefined });
  await dialog.getByRole('button', { name: 'Refresh balance' }).click();
  await expect(creditButton(page)).toHaveAccessibleName('View credits and usage. Balance unavailable');
  await expect(meter).toHaveCount(0);
  await expect(dialog).not.toContainText('No search credits remain.');
  mock.setProfile({ ...profile, credits: 0 });
  await dialog.getByRole('button', { name: 'Refresh balance' }).click();
  await expect(dialog).toContainText('No search credits remain.');
  await expect(meter).toHaveAttribute('aria-valuenow', '0');
  expect(mock.reads()).toBe(3);
});

test('unrestricted access at zero credits is not presented as a purchase requirement', async ({ page }) => {
  await mockAccount(page, { ...seedProfile(), credits: 0 }, true);
  await page.goto('/notifications');
  await expect(page.getByText('0 unread', { exact: true })).toBeVisible();
  await creditButton(page).click();
  const dialog = creditDialog(page);
  await expect(dialog).toContainText('Unrestricted access is active.');
  await expect(dialog).not.toContainText('No search credits remain.');
  await expect(creditButton(page)).not.toHaveClass(/credit-trigger--low/);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
});

test('mobile navigation stays isolated, reaches account actions in landscape and unlocks after a dialog', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await page.goto('/search');
  const menu = page.getByRole('button', { name: 'Open navigation' });
  const sidebar = page.locator('#workspace-navigation');
  await expect(sidebar).toHaveAttribute('inert', '');
  await menu.focus();
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => !!document.activeElement?.closest('#workspace-navigation'))).toBe(false);
  await menu.click();
  await expect(page.locator('main')).toHaveAttribute('inert', '');
  await expect(page.locator('.app-topbar')).toHaveAttribute('inert', '');
  const signout = sidebar.getByRole('button', { name: 'Sign out', exact: true });
  await signout.focus();
  await expect(signout).toBeInViewport();
  await page.keyboard.press('Tab');
  await expect(sidebar.getByRole('link', { name: 'APCOSYS home', exact: true })).toBeFocused();
  await signout.click();
  const dialog = page.getByRole('dialog', { name: 'Sign out of every session?', exact: true });
  await expect(dialog).toBeVisible();
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(menu).toBeFocused();
  expect(await page.evaluate(() => [document.body.style.overflow, document.documentElement.style.overflow])).toEqual(['', '']);
});

test('search keyboard shortcuts keep text input intact and focus the search field from another screen', async ({ page }) => {
  await page.goto('/files');
  await expect(page.locator('h1')).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(page).toHaveURL(/\/search$/);
  const query = page.getByRole('textbox', { name: 'Search internet infrastructure', exact: true });
  await expect(query).toBeFocused();
  await query.fill('example.com');
  await page.keyboard.type('/path');
  await expect(query).toHaveValue('example.com/path');
  await page.getByRole('heading', { name: 'Search internet infrastructure', exact: true }).click();
  await page.keyboard.press('/');
  await expect(query).toBeFocused();
  await expect(query).toHaveValue('example.com/path');
});

for (const width of [820, 1024, 1280]) {
  test(`working pages fit an intermediate ${width}px viewport with large text and dark theme`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => localStorage.setItem('apcosys.view.v1', JSON.stringify({ appearanceVersion: 2, theme: 'dark', density: 'compact', fontScale: 125, reducedMotion: true })));
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/billing', '/account/team', '/scanner/new', '/files', '/settings']) await test.step(route, async () => {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('main')).not.toContainText('This view could not be displayed');
      await noOverflow(page);
      if (route === '/billing') {
        await expect(page.locator('.billing-plan')).toHaveCount(4);
        const bounds = await page.locator('.billing-plan').first().boundingBox();
        expect(bounds!.width).toBeGreaterThan(240);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: info.outputPath(`billing-dark-large-${width}.png`) });
      }
    });
    expect(errors).toEqual([]);
  });
}
