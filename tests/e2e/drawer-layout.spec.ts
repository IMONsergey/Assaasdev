import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('left filter drawers keep their actions reachable with dark theme and enlarged text', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('apcosys.view.v1', JSON.stringify({ theme: 'dark', appearanceVersion: 2, density: 'comfortable', fontScale: 125, reducedMotion: true })));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 760 ? 900 : 740 });
    for (const kind of ['search', 'files']) {
      await page.goto(kind === 'search' ? '/search?q=example&run=1' : '/files');
      await expect(page.locator('h1')).toBeVisible();
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: kind === 'search' ? 'Filters' : 'File filters', exact: true });
      await expect(dialog).toBeVisible();
      if (kind === 'search') {
        await dialog.getByRole('button', { name: 'Add group', exact: true }).click();
        await dialog.locator('.search-condition-group').first().getByRole('button', { name: 'Add group', exact: true }).click();
      }
      const box = await dialog.boundingBox();
      const workspace = await page.locator('.workspace-main').boundingBox();
      const header = await page.locator('.app-topbar').boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(workspace!.x);
      expect(box!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.width).toBeLessThanOrEqual(width);
      await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport();
      await expect(dialog.getByRole('button', { name: kind === 'search' ? 'Apply conditions' : 'Apply filters', exact: true })).toBeInViewport();
      await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport();
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width === 390) {
        const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(accessibility.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
      }
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath(`${kind}-drawer-dark-large-${width}.png`), fullPage: false });
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
    }
  }
});
