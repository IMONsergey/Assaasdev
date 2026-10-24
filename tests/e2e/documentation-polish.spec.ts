import { expect, test } from '@playwright/test';

for (const width of [320, 1440]) {
  test(`documentation search keeps focus and its destination remains readable at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/api?section=docs');
    await expect(page.locator('.app-shell:not([inert])')).toBeVisible();
    const search = page.getByRole('searchbox', { name: 'Search API documentation', exact: true });
    await search.fill('tls');
    await page.getByRole('button', { name: 'Clear documentation search', exact: true }).click();
    await expect(search).toHaveValue('');
    await expect(search).toBeFocused();

    await search.fill('tls_info ja4s');
    await search.press('Enter');
    await expect(page).toHaveURL(url => url.hash === '#get-host' && url.searchParams.get('view') === 'response' && url.searchParams.get('field') === 'ja4s');
    const article = page.locator('.api-docs-article');
    const field = article.locator('[data-doc-match="true"]');
    await expect(page.getByRole('tab', { name: 'Response', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(field).toBeFocused();
    await expect(field).toBeInViewport();
    await expect(field.getByRole('rowheader')).toContainText('ja4s');
    if (width <= 760) {
      const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
      await expect.poll(async () => {
        const target = await field.boundingBox(), trigger = await menu.boundingBox();
        return !!target && !!trigger && target.y >= trigger.y + trigger.height + 8;
      }).toBe(true);
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: info.outputPath(`documentation-section-${width}.png`) });
  });
}

test('wide documentation tables can be read with the keyboard on a narrow screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/api?section=docs#filters');
  await expect(page.locator('.app-shell:not([inert])')).toBeVisible();
  const syntax = page.getByRole('region', { name: 'API value syntax', exact: true });
  await expect(syntax).toBeVisible();
  await syntax.scrollIntoViewIfNeeded();
  await syntax.focus();
  await expect(syntax).toBeFocused();
  expect(await syntax.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await syntax.press('ArrowRight');
  await expect.poll(() => syntax.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath('documentation-table-keyboard-320.png') });
});
