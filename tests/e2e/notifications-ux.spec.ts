import { expect, test } from '@playwright/test';

test('notification content opens its destination without marking it read and fits enlarged text', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('apcosys.view.v1', JSON.stringify({ appearanceVersion: 2, theme: 'light', density: 'comfortable', fontScale: 125, reducedMotion: true })));
  await page.goto('/notifications');
  await expect(page.getByText('2 unread', { exact: true })).toBeVisible();
  const team = page.getByRole('link', { name: 'View team: Team member added', exact: true });
  await team.locator('p').click();
  await expect(page).toHaveURL(/\/settings\?section=team$/);
  await page.goBack();
  await expect(page.getByText('2 unread', { exact: true })).toBeVisible();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 960 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const mark = page.getByRole('button', { name: 'Mark as read', exact: true }).first();
    expect((await mark.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`notifications-enlarged-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Mark as read', exact: true }).first().click();
  await expect(page.getByText('1 unread', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(team).toBeVisible();
});
