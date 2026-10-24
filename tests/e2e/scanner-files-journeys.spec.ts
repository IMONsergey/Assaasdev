import { expect, test, type Page } from '@playwright/test';

async function readCreditLabel(page: Page, expected?: string) {
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  const opened = await menu.isVisible();
  if (opened) await menu.click();
  const credit = page.getByRole('button', { name: /^View credits and usage\./ });
  await expect(credit).toBeVisible();
  if (expected) await expect(credit).toHaveAccessibleName(expected);
  const label = (await credit.getAttribute('aria-label'))!;
  if (opened) {
    await page.getByRole('complementary', { name: 'Workspace navigation' }).getByRole('button', { name: 'Close navigation', exact: true }).click();
    await expect(page.locator('main')).not.toHaveAttribute('inert', '');
  }
  return label;
}

test('scan import keeps a headerless first target, deduplicates and reviews a 1,000-port task', async ({ page }) => {
  await page.goto('/scanner/new');
  const form = page.locator('.scanner-page form');
  await page.getByRole('button', { name: 'Review task', exact: true }).click();
  await expect(form.getByLabel('Hosts and IP addresses', { exact: true })).toBeFocused();
  await expect(form.getByLabel('Hosts and IP addresses', { exact: true })).toHaveAttribute('aria-invalid', 'true');

  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  const importer = page.getByRole('dialog', { name: 'Import scan targets', exact: true });
  const input = importer.getByLabel('CSV file', { exact: true }), fileName = `targets-${'review'.repeat(30)}.csv`;
  await input.setInputFiles({ name: fileName, mimeType: 'text/csv', buffer: Buffer.from('"192.0.2.10') });
  await expect(importer).toContainText('A quoted CSV field is not closed. Check the file and try again.');
  await expect(input).toHaveValue('');
  await input.setInputFiles({ name: fileName, mimeType: 'text/csv', buffer: Buffer.from('192.0.2.10\n192.0.2.11\n192.0.2.10\n192.0.2.0/30') });
  await expect(importer.locator('.scanner-import-file-name')).toContainText(fileName);
  await expect(input).toHaveValue('');
  await expect(importer.getByLabel('The first row contains column names')).not.toBeChecked();
  await expect(importer.getByText('2 hosts', { exact: true })).toBeVisible();
  await expect(importer.getByText('1 duplicates removed', { exact: true })).toBeVisible();
  await importer.getByRole('button', { name: 'Use these targets', exact: true }).click();
  await expect(form.getByLabel('Hosts and IP addresses', { exact: true })).toHaveValue('192.0.2.10\n192.0.2.11');
  await expect(form.getByLabel('CIDR blocks', { exact: true })).toHaveValue('192.0.2.0/30');
  await page.getByRole('button', { name: 'Import CSV', exact: true }).click();
  await expect(importer.getByLabel('CSV file', { exact: true })).toHaveValue('');
  await expect(importer.getByRole('button', { name: 'Use these targets', exact: true })).toBeDisabled();
  await importer.getByRole('button', { name: 'Cancel', exact: true }).click();

  await form.getByLabel('Port list', { exact: true }).fill('1-1000');
  await page.getByRole('radio', { name: /Custom schedule/ }).check();
  await form.getByLabel('Cron expression', { exact: true }).fill('0 0 3 * * *');
  await page.getByRole('button', { name: 'Review task', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review scan task', exact: true });
  await expect(review.locator('.scanner-estimated-total dd')).toHaveText('4,000');
  await expect(review).toContainText('0 0 3 * * *');
  await review.getByRole('button', { name: 'Create scan task', exact: true }).click();
  await expect(page).toHaveURL(/\/scanner\?created=/);
  await expect(page.locator('.scanner-recent-task .scanner-progress')).toContainText('queued');
  await expect(page.locator('.scanner-recent-task .scanner-progress')).toBeVisible();
  await expect(page.locator('.scanner-recent-task .scanner-target-primary')).toContainText('+2');
  await page.getByRole('tab', { name: /Scheduled/ }).click();
  await expect(page.locator('.scanner-task-table--planned')).toContainText('192.0.2.10');
});

test('scanner task cards keep details and actions reachable on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/scanner');
  const table = page.locator('.scanner-tasks-table-wrap');
  await expect(page.getByRole('button', { name: 'Delete', exact: true }).first()).toBeVisible();
  expect(await table.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const first = page.locator('.scanner-task-table tbody tr').first();
  await first.locator('.scanner-target-button').click();
  const taskId = (await first.getByRole('checkbox').getAttribute('aria-label'))!.replace('Select task ', '');
  const details = page.getByRole('dialog', { name: 'Task details', exact: true });
  await expect(details.getByText('Created', { exact: true })).toBeVisible();
  await expect(details.getByText('Started', { exact: true })).toBeVisible();
  await expect(details.locator('.scanner-progress')).toBeVisible();
  await details.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const focusTrail: unknown[] = [];
  async function recordFocus(step: string) {
    focusTrail.push(await page.evaluate(step => {
      const focused = document.activeElement as HTMLElement | null;
      const edit = [...document.querySelectorAll<HTMLButtonElement>('.scanner-task-table tbody tr:first-child button')].find(button => button.textContent?.trim() === 'Edit');
      return { step, focused: { tag: focused?.tagName, text: focused?.textContent?.trim().slice(0, 80), label: focused?.getAttribute('aria-label'), dialog: focused?.closest('dialog')?.open, connected: focused?.isConnected, inert: !!focused?.closest('[inert]') }, edit: { connected: edit?.isConnected, inert: !!edit?.closest('[inert]') } };
    }, step));
  }
  await recordFocus('before Edit');
  await first.getByRole('button', { name: 'Edit', exact: true }).click();
  const editor = page.getByRole('dialog', { name: `Edit task ${taskId}`, exact: true });
  await recordFocus('after Edit');
  await editor.getByLabel('Port list', { exact: true }).fill('22,443');
  await editor.getByRole('radio', { name: /Custom schedule/ }).check();
  await editor.getByRole('button', { name: 'Review changes', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Review task changes', exact: true });
  await expect(review).toContainText('22, 443');
  await recordFocus('after Review');
  await review.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editor.getByLabel('Port list', { exact: true })).toHaveValue('22,443');
  await recordFocus('after review Cancel');
  expect(await editor.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await expect(editor.getByRole('radio', { name: /Custom schedule/ })).toBeChecked();
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await recordFocus('after edit Cancel');
  await expect(first.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  await first.getByRole('button', { name: 'Delete', exact: true }).click();
  await recordFocus('after Delete');
  await page.getByRole('dialog', { name: 'Delete this task?', exact: true }).getByRole('button', { name: 'Cancel', exact: true }).click();
  await recordFocus('after delete Cancel');
  await test.info().attach('scanner-focus-trail.json', { body: JSON.stringify(focusTrail, null, 2), contentType: 'application/json' });
  await expect(first.getByRole('button', { name: 'Delete', exact: true })).toBeFocused();
  await expect(first).toContainText(taskId);
  await page.getByRole('heading', { name: 'Private Scanner', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('scanner-cards-320.png'), fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await table.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('scanner-cards-768.png'), fullPage: true });
});

test('files back and forward restore the matching response without a fresh search', async ({ page }) => {
  await page.goto('/files');
  await page.getByRole('button', { name: 'Search files', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1,220 file records', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Keywords', { exact: true }).fill('not-present-anywhere');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(page.getByRole('heading', { name: '0 file records', exact: true })).toBeVisible();
  const creditsAfterSearch = await readCreditLabel(page);
  await page.goBack();
  await expect(page.getByLabel('Filename or keywords', { exact: true })).toHaveValue('');
  await expect(page.getByRole('heading', { name: '1,220 file records', exact: true })).toBeVisible();
  await expect(page.getByText('Looking for matching records…', { exact: true })).toHaveCount(0);
  await readCreditLabel(page, creditsAfterSearch);
  await page.goForward();
  await expect(page.getByLabel('Filename or keywords', { exact: true })).toHaveValue('not-present-anywhere');
  await expect(page.getByRole('heading', { name: '0 file records', exact: true })).toBeVisible();
  await readCreditLabel(page, creditsAfterSearch);
  await page.getByRole('button', { name: 'Edit filters', exact: true }).click();
  await expect(page.getByLabel('Hostname', { exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Apply filters', exact: true })).toBeVisible();
});

test('export locks options while the browser save picker is pending and recovers from cancellation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'showSaveFilePicker', { configurable: true, value: () => new Promise((_resolve, reject) => {
      Object.assign(window, { __cancelSave: () => reject(new DOMException('Cancelled', 'AbortError')) });
    }) });
  });
  await page.goto('/files');
  await page.getByRole('button', { name: 'Search files', exact: true }).click();
  await page.getByRole('button', { name: 'Download records', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Export bucket data', exact: true });
  await dialog.getByRole('button', { name: 'Start export', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Preparing download', exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Format', { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Maximum records', { exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.evaluate(() => (window as unknown as { __cancelSave: () => void }).__cancelSave());
  await expect(dialog.getByRole('button', { name: 'Start export', exact: true })).toBeEnabled();
  await expect(dialog.getByLabel('Format', { exact: true })).toBeEnabled();
  await expect(dialog).not.toContainText('Export is incomplete');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});
