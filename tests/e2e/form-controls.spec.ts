import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { chooseOption } from './helpers/controls';

async function fileFilters(page: Page) {
  await page.goto('/files');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'File filters', exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

async function dates(page: Page) {
  const drawer = await fileFilters(page);
  await drawer.locator('summary').filter({ hasText: 'Dates' }).click();
  const discovered = drawer.getByRole('group', { name: 'Discovered · UTC' });
  return { drawer, discovered, from: discovered.getByLabel('From, inclusive', { exact: true }) };
}

async function expectInViewport(control: Locator, width: number, height: number) {
  await expect(control).toBeVisible();
  const box = await control.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(height + 1);
}

test('custom selections support keyboard, pointer, outside dismissal and persist appearance', async ({ page }, info) => {
  await page.goto('/settings?section=appearance');
  const density = page.getByRole('combobox', { name: 'Interface density', exact: true });
  await chooseOption(density, 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await density.press('ArrowDown');
  await density.press('Home');
  await density.press('Enter');
  await expect(density).toHaveAttribute('data-control-value', 'comfortable');
  await expect(density).toBeFocused();
  await density.press('c');
  await expect(density).toHaveAttribute('data-control-value', 'comfortable');
  await density.click();
  await expect(page.getByRole('option', { name: 'Compact', exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('settings-custom-menu-desktop.png'), animations: 'disabled' });
  await page.getByText('Choose more space or a more compact view.', { exact: true }).click();
  await expect(density).toHaveAttribute('aria-expanded', 'false');
  await chooseOption(page.getByRole('combobox', { name: 'Text size', exact: true }), '125');
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Text size', exact: true })).toHaveAttribute('data-control-value', '125');
  expect(await page.locator('select').count()).toBe(0);
});

test('a select stays inside a native drawer and Escape closes only its popup', async ({ page }, info) => {
  const drawer = await fileFilters(page);
  const matching = drawer.getByRole('combobox', { name: 'Extension matching', exact: true });
  await matching.click();
  const option = drawer.getByRole('option', { name: 'Exclude these extensions', exact: true });
  await expect(option).toBeVisible();
  expect(await option.evaluate(element => element.closest('dialog')?.open)).toBe(true);
  await page.screenshot({ path: info.outputPath('files-custom-menu-desktop.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeVisible();
  await expect(matching).toHaveAttribute('aria-expanded', 'false');
  await expect(matching).toBeFocused();
  await chooseOption(matching, 'exclude');
  await expect(matching).toHaveAttribute('data-control-value', 'exclude');
  await expect(drawer).toBeVisible();
  const a11y = await new AxeBuilder({ page }).include('dialog[open]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
});

test('calendar keeps exact UTC seconds, cancels a popup draft and serializes the chosen date', async ({ page }, info) => {
  const { drawer, discovered, from } = await dates(page);
  await from.fill('2026-10-24T12:34:56');
  const trigger = discovered.getByRole('button', { name: 'Choose from, inclusive', exact: true });
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'From, inclusive calendar', exact: true });
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole('gridcell', { name: 'Saturday, October 24, 2026', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(calendar.getByRole('textbox', { name: 'Seconds UTC', exact: true })).toHaveValue('56');
  await page.screenshot({ path: info.outputPath('calendar-desktop.png'), animations: 'disabled' });
  await calendar.getByRole('textbox', { name: 'Seconds UTC', exact: true }).fill('59');
  await page.keyboard.press('Escape');
  await expect(calendar).not.toBeVisible();
  await expect(drawer).toBeVisible();
  await expect(trigger).toBeFocused();
  await expect(from).toHaveValue('2026-10-24 12:34:56');
  await trigger.click();
  await calendar.getByRole('gridcell', { name: 'Saturday, October 24, 2026', exact: true }).press('ArrowRight');
  await expect(calendar.getByRole('gridcell', { name: 'Sunday, October 25, 2026', exact: true })).toBeFocused();
  await calendar.getByRole('textbox', { name: 'Seconds UTC', exact: true }).fill('57');
  await calendar.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(from).toHaveValue('2026-10-25 12:34:57');
  await drawer.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  const filter = JSON.parse(new URL(page.url()).searchParams.get('filter')!);
  expect(filter.gte_cts).toBe(Date.parse('2026-10-25T12:34:57Z') / 1000);
});

test('incomplete dates do not interrupt typing, invalid dates block submit, and cancellation restores saved filters', async ({ page }) => {
  const { drawer, discovered, from } = await dates(page);
  await from.fill('2026-10-24 12:34:');
  await expect(discovered.getByRole('alert')).toHaveCount(0);
  await from.pressSequentially('56');
  await expect(from).toHaveValue('2026-10-24 12:34:56');
  await expect(discovered.getByRole('alert')).toHaveCount(0);
  await from.fill('2026-02-30 12:34:56');
  await drawer.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(drawer).toBeVisible();
  await expect(discovered.getByRole('alert')).toContainText('Enter a valid date and time');
  expect(await from.evaluate(element => (element as HTMLInputElement).validity.valid)).toBe(false);
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const reopened = page.getByRole('group', { name: 'Discovered · UTC' });
  await expect(reopened.getByLabel('From, inclusive', { exact: true })).toHaveValue('');
  await expect(reopened.getByRole('alert')).toHaveCount(0);
});

test('field suggestions retain readable labels and accept arbitrary API fields without losing canonical values', async ({ page }, info) => {
  await page.goto('/search?conditions=1');
  const drawer = page.getByRole('dialog', { name: 'Filters', exact: true });
  await drawer.getByRole('button', { name: 'Add condition', exact: true }).click();
  const field = drawer.getByRole('combobox', { name: 'Field', exact: true });
  await field.fill('count');
  const country = page.getByRole('option').filter({ hasText: 'country_name' });
  await expect(country).toBeVisible();
  await field.press('ArrowUp');
  const lastSuggestion = page.getByRole('listbox', { name: 'Field suggestions', exact: true }).getByRole('option').last();
  await expect(field).toHaveAttribute('aria-activedescendant', (await lastSuggestion.getAttribute('id'))!);
  await country.click();
  await expect(field).toHaveValue('Country');
  await drawer.getByRole('combobox', { name: 'Value', exact: true }).fill('Germany');
  await drawer.getByRole('button', { name: 'Show field suggestions', exact: true }).click();
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  expect((await page.locator('.combobox-popover').boundingBox())!.height).toBeLessThanOrEqual(320);
  await page.screenshot({ path: info.outputPath('field-suggestions.png'), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeVisible();
  await expect(field).toHaveAttribute('aria-expanded', 'false');
  await drawer.getByRole('button', { name: 'Add condition', exact: true }).click();
  await drawer.getByRole('combobox', { name: 'Field', exact: true }).nth(1).fill('http.headers.x-request-id');
  await drawer.getByRole('combobox', { name: 'Value', exact: true }).nth(1).fill('research-42');
  await drawer.getByRole('button', { name: 'Apply conditions', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  const request = JSON.parse(new URL(page.url()).searchParams.get('request')!);
  expect(request.simple_search_filters).toEqual([{ field: 'country_name', value: 'Germany' }, { field: 'http.headers.x-request-id', value: 'research-42' }]);
});

test('calendar remains readable in dark appearance with large text and month navigation', async ({ page }, info) => {
  await page.goto('/settings?section=appearance');
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await chooseOption(page.getByRole('combobox', { name: 'Text size', exact: true }), '125');
  const { discovered, from } = await dates(page);
  await from.fill('2026-10-24 23:59:59');
  await discovered.getByRole('button', { name: 'Choose from, inclusive', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'From, inclusive calendar', exact: true });
  await calendar.getByRole('button', { name: 'Choose month and year', exact: true }).click();
  await calendar.getByRole('textbox', { name: 'Calendar year', exact: true }).fill('2028');
  await calendar.getByRole('button', { name: 'Feb', exact: true }).click();
  await calendar.getByRole('gridcell', { name: 'Tuesday, February 29, 2028', exact: true }).click();
  await expect(calendar.getByRole('gridcell', { name: 'Tuesday, February 29, 2028', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.screenshot({ path: info.outputPath('calendar-dark-large-text.png'), animations: 'disabled' });
  const a11y = await new AxeBuilder({ page }).include('.calendar-popover').withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(a11y.violations.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) }))).toEqual([]);
  await calendar.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(from).toHaveValue('2028-02-29 23:59:59');
});

for (const width of [320, 390]) test(`menus, calendar and checkbox are aligned and usable at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto('/settings?section=appearance');
  await chooseOption(page.getByRole('combobox', { name: 'Text size', exact: true }), '125');
  const { drawer, discovered, from } = await dates(page);
  await from.fill('2026-10-24 12:34:56');
  await page.evaluate(() => document.fonts.ready);
  const inputSpacing = await from.evaluate(element => {
    const input = element as HTMLInputElement, style = getComputedStyle(input), canvas = document.createElement('canvas'), context = canvas.getContext('2d')!;
    context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    // Firefox reports the inner editor's width for input.clientWidth, whereas
    // Chromium includes padding. Measure the visible CSS border box instead.
    return { padding: parseFloat(style.paddingRight), available: input.getBoundingClientRect().width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth) - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight), text: context.measureText(input.value).width };
  });
  expect(inputSpacing.padding).toBeGreaterThanOrEqual(44);
  expect(inputSpacing.available).toBeGreaterThanOrEqual(inputSpacing.text);
  await discovered.getByRole('button', { name: 'Choose from, inclusive', exact: true }).click();
  const calendar = page.getByRole('dialog', { name: 'From, inclusive calendar', exact: true });
  await expectInViewport(calendar, width, 800);
  await expect(calendar.getByRole('button', { name: 'Choose month and year', exact: true })).toBeInViewport();
  await expect(calendar.getByRole('button', { name: 'Apply', exact: true })).toBeInViewport();
  await page.screenshot({ path: info.outputPath(`calendar-${width}.png`), animations: 'disabled' });
  await calendar.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(from).toHaveValue('');
  const matching = drawer.getByRole('combobox', { name: 'Extension matching', exact: true });
  await matching.click();
  await expectInViewport(page.locator('.select-popover'), width, 800);
  await page.screenshot({ path: info.outputPath(`select-${width}.png`), animations: 'disabled' });
  await page.keyboard.press('Escape');
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.goto('/scanner');
  const check = page.getByRole('checkbox', { name: 'Refresh every 15 seconds', exact: true });
  await expect(check).toBeVisible();
  const before = await check.isChecked();
  await page.getByText('Refresh every 15 seconds', { exact: true }).click();
  await expect(check).toBeChecked({ checked: !before });
  const geometry = await check.evaluate(element => {
    const box = element.getBoundingClientRect(), text = element.closest('label')!.querySelector('.checkbox-label')!.getBoundingClientRect();
    return { width: box.width, height: box.height, offset: box.y - text.y };
  });
  expect(geometry.width).toBe(geometry.height);
  expect(geometry.offset).toBeGreaterThanOrEqual(0);
  expect(geometry.offset).toBeLessThanOrEqual(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath(`scanner-checkbox-${width}.png`), animations: 'disabled' });
});
