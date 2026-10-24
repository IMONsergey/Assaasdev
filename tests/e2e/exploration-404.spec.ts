import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('unrecognised workspace subpaths use the same recovery page', async ({ page }) => {
  for (const path of ['/scanner/missing-task', '/billing/missing-invoice', '/account/missing-section']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'A little off the map' })).toBeVisible();
    await page.getByRole('link', { name: 'Back to search', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Search internet infrastructure', exact: true })).toBeVisible();
  }
});

test('unknown addresses retain recovery actions and playable, responsive discovery games', async ({ page }, info) => {
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 760 ? 960 : 844 });
    await page.goto('/a-page-that-does-not-exist');
    await expect(page.getByRole('heading', { name: 'A little off the map' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to search' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const idle = page.getByRole('group', { name: 'Signal map' });
    expect(await idle.locator('button:not(:disabled)').count()).toBe(0);
    await page.getByRole('button', { name: 'Start searching' }).click();
    for (let index = 0; index < 25 && await idle.locator('button:not(:disabled)').count(); index++) await idle.locator('button:not(:disabled)').first().click();
    await expect(page.getByRole('status').filter({ hasText: 'Signal found' })).toBeVisible();
    await page.getByRole('button', { name: 'Find another signal' }).click();
    expect(await idle.locator('button:not(:disabled)').count()).toBe(25);
    const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(a11y.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    await page.screenshot({ path: info.outputPath(`404-signal-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await expect(page).toHaveURL(/\/search$/);
  }
});

test('route game can be solved with the keyboard and undo preserves its path', async ({ page }, info) => {
  await page.goto('/404');
  await page.getByRole('tab', { name: 'Route', exact: true }).click();
  await page.getByRole('button', { name: 'Find a route', exact: true }).click();
  const board = page.getByRole('group', { name: 'Route map. Use arrow keys to move.' });
  const walls = await board.getByRole('img').evaluateAll(nodes => nodes.map(node => { const numbers = node.getAttribute('aria-label')!.match(/\d+/g)!.map(Number); return (numbers[0] - 1) * 5 + numbers[1] - 1; }));
  const queue: number[][] = [[0]], visited = new Set([0]); let solution: number[] = [];
  while (queue.length) {
    const path = queue.shift()!, current = path.at(-1)!;
    if (current === 24) { solution = path; break; }
    for (const next of [current - 5, current + 5, current - 1, current + 1]) if (next >= 0 && next < 25 && Math.abs(Math.floor(current / 5) - Math.floor(next / 5)) + Math.abs(current % 5 - next % 5) === 1 && !walls.includes(next) && !visited.has(next)) { visited.add(next); queue.push([...path, next]); }
  }
  expect(solution.length).toBeGreaterThan(1);
  const key = (from: number, to: number) => to === from + 1 ? 'ArrowRight' : to === from - 1 ? 'ArrowLeft' : to === from + 5 ? 'ArrowDown' : 'ArrowUp';
  await board.focus(); await board.press(key(solution[0], solution[1]));
  await page.getByRole('button', { name: 'Undo move' }).click();
  await expect(board.getByRole('button', { name: 'Row 1, column 1, current position' })).toBeVisible();
  await board.focus();
  for (let index = 1; index < solution.length; index++) await board.press(key(solution[index - 1], solution[index]));
  await expect(page.getByRole('status').filter({ hasText: 'Destination reached' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('404-route-complete.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'New route', exact: true }).click();
  await expect(board.getByRole('button', { name: 'Row 1, column 1, current position' })).toBeVisible();
});

test('memory game observes a sequence, accepts replay and cleans up when switching', async ({ page }, info) => {
  await page.goto('/404');
  await page.getByRole('tab', { name: 'Memory', exact: true }).click();
  await page.getByRole('button', { name: 'Start observing' }).click();
  const status = page.locator('[data-game="memory"] .explore-game-status');
  const nodes: number[] = [];
  for (let index = 0; index < 3; index++) {
    await expect(status).toContainText(`${index + 1} of 3`);
    nodes.push(Number((await status.innerText()).match(/Watch node (\d+)/)![1]));
  }
  await expect(status).toContainText('Your turn');
  for (const node of nodes) await page.getByRole('button', { name: `Node ${node}`, exact: true }).click();
  await expect(status).toContainText('3 nodes remembered');
  await page.screenshot({ path: info.outputPath('404-memory-complete.png'), animations: 'disabled' });
  await page.getByRole('button', { name: 'Add one more node' }).click();
  await expect(status).toContainText('of 4');
  await page.getByRole('tab', { name: 'Signal', exact: true }).click();
  await page.getByRole('tab', { name: 'Memory', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start observing' })).toBeVisible();
  await expect(page.locator('.memory-grid .is-lit')).toHaveCount(0);
});
