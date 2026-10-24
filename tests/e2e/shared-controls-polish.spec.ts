import { expect, test } from '@playwright/test';

test('pointer focus is quiet while keyboard focus and modal restoration remain usable', async ({ page }) => {
  await page.goto('/search');
  await expect(page.locator('.credit-trigger')).toBeVisible();
  expect(await page.locator('.nav-shortcut').count()).toBe(0);
  expect(await page.locator('.credit-trigger .icon').count()).toBe(0);
  await page.locator('.credit-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'Credits & usage' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.locator('.credit-trigger')).toBeFocused();
  expect(await page.locator('.credit-trigger').evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
  await page.keyboard.press('Tab');
  expect(await page.locator('html').getAttribute('data-input-modality')).toBe('keyboard');
  const focus = await page.evaluate(() => { const style = getComputedStyle(document.activeElement!); return { outline: style.outlineStyle, shadow: style.boxShadow }; });
  expect(focus.outline !== 'none' || focus.shadow !== 'none').toBe(true);
});

test('tabs use one selection line and filter controls use the shared outlined icon', async ({ page }, info) => {
  await page.goto('/files');
  const active = page.getByRole('tab', { name: 'Files', exact: true });
  await expect(active).toHaveAttribute('aria-selected', 'true');
  const lines = await active.evaluate(element => ({ border: getComputedStyle(element).borderBottomWidth, indicator: getComputedStyle(element, '::after').height, opacity: getComputedStyle(element, '::after').opacity }));
  expect(lines).toEqual({ border: '0px', indicator: '2px', opacity: '1' });
  const filter = page.getByRole('button', { name: 'Filters', exact: true });
  expect(await filter.evaluate(element => getComputedStyle(element).borderTopWidth)).toBe('1px');
  expect(await filter.locator('.icon').evaluate(element => getComputedStyle(element).maskImage)).toContain('adjustments-horizontal.svg');
  await filter.click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(await filter.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
  await page.screenshot({ path: info.outputPath('files-tabs-single-line.png'), animations: 'disabled' });
});
