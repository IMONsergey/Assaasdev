import { expect, test, type Page } from '@playwright/test';

async function account(page: Page) {
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: { user_id: 'modality-review', user_name: 'researcher', user_type: 'USER', subscription: { type: 'Business' } } }));
  await page.routeWebSocket('**/backend/ws', socket => socket.onMessage(raw => {
    const request = JSON.parse(String(raw));
    socket.send(JSON.stringify({ id: request.id, type: request.type, data: { unread_count: 0 } }));
  }));
}

test('native avatar radios recover visible keyboard focus after a pointer selection', async ({ page }, info) => {
  await account(page); await page.goto('/account');
  await page.getByRole('button', { name: 'Change avatar', exact: true }).click();
  const first = page.getByRole('radio', { name: 'Avatar 1: Surprised', exact: true });
  const second = page.getByRole('radio', { name: 'Avatar 2: Wink', exact: true });
  await first.click();
  expect(await first.evaluate(element => getComputedStyle(element.closest('.avatar-choice')!).outlineStyle)).toBe('none');
  await first.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(second).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'keyboard');
  expect(await second.evaluate(element => getComputedStyle(element.closest('.avatar-choice')!).outlineStyle)).toBe('solid');
  await page.screenshot({ path: info.outputPath('avatar-radio-keyboard-focus.png'), animations: 'disabled' });
  for (const key of [' ', 'Enter']) {
    await second.click();
    await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'pointer');
    await second.press(key);
    await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'keyboard');
  }
});

test('checkbox and select keys enter keyboard mode while ordinary text editing remains quiet', async ({ page }) => {
  await account(page); await page.goto('/search/history');
  const toggle = page.getByRole('switch', { name: 'Save history', exact: true });
  await toggle.click(); await toggle.press(' ');
  await expect(toggle).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'keyboard');
  const scope = page.getByRole('combobox', { name: 'Scope', exact: true });
  await scope.click();
  await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'pointer');
  expect(await scope.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
  await scope.press('ArrowDown'); await scope.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'keyboard');
  await expect(scope).toHaveValue('public');
  await expect(scope).toBeFocused();
  expect(await scope.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
  const text = page.getByRole('searchbox', { name: 'Find a search', exact: true });
  await text.click(); await text.pressSequentially('query');
  for (const key of ['ArrowLeft', ' ', 'Enter']) await text.press(key);
  await expect(text).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('data-input-modality', 'pointer');
  expect(await text.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none');
});
