import { chooseOption } from './helpers/controls';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('an avatar is assigned once, preview is reversible, and saved selection updates the workspace', async ({ page }, testInfo) => {
  await page.goto('/settings?section=profile');
  const identity = page.locator('.profile-avatar-button img');
  await expect(identity).toHaveAttribute('src', /\/avatars\/avatar-\d{2}\.svg$/);
  const initial = await identity.getAttribute('src');
  await page.getByRole('button', { name: 'Choose avatar', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose your avatar', exact: true });
  await expect(picker.getByRole('radio')).toHaveCount(20);
  await expect(picker.getByLabel('Upload photo', { exact: true })).toBeFocused();
  const target = initial?.endsWith('avatar-20.svg') ? 'Avatar 19: Star' : 'Avatar 20: Joy';
  await picker.getByRole('radio', { name: target, exact: true }).check();
  await expect(identity).toHaveAttribute('src', initial!);
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose avatar', exact: true })).toBeFocused();
  await expect(identity).toHaveAttribute('src', initial!);
  await page.getByRole('button', { name: 'Change avatar', exact: true }).click();
  await picker.getByRole('radio', { name: target, exact: true }).check();
  await page.screenshot({ path: testInfo.outputPath('avatar-picker-desktop.png') });
  await picker.getByRole('button', { name: 'Use avatar', exact: true }).click();
  const selected = target.startsWith('Avatar 20') ? 'avatar-20.svg' : 'avatar-19.svg';
  await expect(identity).toHaveAttribute('src', new RegExp(selected + '$'));
  await expect(page.locator('.sidebar-account-row .user-avatar img')).toHaveAttribute('src', new RegExp(selected + '$'));
  await page.reload();
  await expect(identity).toHaveAttribute('src', new RegExp(selected + '$'));
  const preferences = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('apcosys.avatar.v1:')));
  expect(preferences).toHaveLength(1);
  expect(preferences[0][0]).toMatch(/^apcosys\.avatar\.v1:[a-f0-9]{16}$/);
  expect(preferences[0][1]).toMatch(/^avatar-\d{2}$/);
});

test('the mobile avatar picker supports keyboard selection, accessible contrast and a visible footer', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/settings?section=profile');
  await page.getByRole('button', { name: 'Choose avatar', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose your avatar', exact: true });
  await expect(picker.getByLabel('Upload photo', { exact: true })).toBeFocused();
  await picker.locator('input:checked').focus();
  const before = await picker.locator('input:checked').getAttribute('value');
  await page.keyboard.press('ArrowRight');
  await expect(picker.locator('input:checked')).not.toHaveAttribute('value', before!);
  await expect(picker.locator('input:checked')).toBeFocused();
  await expect(picker.getByRole('button', { name: 'Use avatar', exact: true })).toBeInViewport();
  expect((await picker.getByRole('button', { name: 'Use avatar', exact: true }).boundingBox())!.height).toBeLessThanOrEqual(48);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(result.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('avatar-picker-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(picker).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose avatar', exact: true })).toBeFocused();
});

test('mobile settings and avatar controls stay reachable with dark theme and larger text', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/settings?section=appearance');
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await chooseOption(page.getByLabel('Text size', { exact: true }), '125');
  for (const name of ['Profile', 'Security', 'Sessions', 'Organization', 'Workspace', 'Legal']) {
    await page.getByRole('button', { name: /^Choose settings section:/ }).click();
    const categories = page.getByRole('dialog', { name: 'Settings categories', exact: true });
    await expect(categories.getByRole('button', { name, exact: true })).toBeVisible();
    await categories.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('tabpanel', { name, exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`settings-${name.toLowerCase()}-320-dark-large.png`), fullPage: true });
  }
  await page.getByRole('button', { name: /^Choose settings section:/ }).click();
  await page.screenshot({ path: testInfo.outputPath('settings-categories-320-dark-large.png') });
  await page.getByRole('dialog', { name: 'Settings categories', exact: true }).getByRole('button', { name: 'Profile', exact: true }).click();
  await page.getByRole('button', { name: 'Choose avatar', exact: true }).click();
  const picker = page.getByRole('dialog', { name: 'Choose your avatar', exact: true });
  await expect(picker.getByRole('button', { name: 'Use avatar', exact: true })).toBeInViewport();
  expect((await picker.getByRole('button', { name: 'Use avatar', exact: true }).boundingBox())!.height).toBeLessThanOrEqual(48);
  await picker.getByRole('radio', { name: 'Avatar 20: Joy', exact: true }).check();
  await expect(picker.getByRole('radio', { name: 'Avatar 20: Joy', exact: true })).toBeInViewport();
  await page.screenshot({ path: testInfo.outputPath('avatar-picker-320-dark-large.png') });
  await picker.getByRole('button', { name: 'Use avatar', exact: true }).click();
  await expect(page.locator('.profile-avatar-button img')).toHaveAttribute('src', /avatar-20\.svg$/);
});
