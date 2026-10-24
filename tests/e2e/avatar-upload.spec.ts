import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const fixture = (format: string) => fileURLToPath(new URL(`../fixtures/avatars/portrait.${format}`, import.meta.url));
const picker = (page: Page) => page.getByRole('dialog', { name: 'Choose your avatar', exact: true });
const photoInput = (page: Page) => picker(page).getByLabel(/^(Upload|Replace) photo$/);
async function openPicker(page: Page) { await page.getByRole('button', { name: 'Choose avatar', exact: true }).click(); }
async function upload(page: Page, format = 'png') {
  await photoInput(page).setInputFiles(fixture(format));
  await expect(picker(page).getByRole('status')).toHaveText('Photo ready. Check the preview, then save.');
  await expect(picker(page).locator('.avatar-picker-preview img')).toHaveAttribute('src', /^data:image\/(?:webp|png);base64,/);
}

test('a local photo can be previewed, cancelled, saved, replaced and removed without a profile request', async ({ page }, testInfo) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' || request.method() === 'PUT') writes.push(request.url()); });
  await page.goto('/settings');
  const identity = page.locator('.profile-avatar-button img');
  await expect(identity).toHaveAttribute('src', /avatar-\d{2}\.svg$/);
  const original = (await identity.getAttribute('src'))!;
  await openPicker(page);
  await expect(photoInput(page)).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
  await expect(photoInput(page)).not.toHaveAttribute('multiple', '');
  await upload(page);
  await expect(identity).toHaveAttribute('src', original);
  await page.screenshot({ path: testInfo.outputPath('avatar-upload-preview-desktop.png') });
  await picker(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(identity).toHaveAttribute('src', original);
  await expect(page.getByRole('button', { name: 'Choose avatar', exact: true })).toBeFocused();

  await openPicker(page); await upload(page);
  const preview = (await picker(page).locator('.avatar-picker-preview img').getAttribute('src'))!;
  await picker(page).getByRole('button', { name: 'Use avatar', exact: true }).click();
  await expect(identity).toHaveAttribute('src', preview);
  await expect(page.locator('.sidebar-account-row .user-avatar img')).toHaveAttribute('src', preview);
  const output = Buffer.from(preview.split(',')[1], 'base64');
  expect(readFileSync(fixture('png')).includes(Buffer.from('APCOSYS_TEST_METADATA_SHOULD_BE_REMOVED'))).toBe(true);
  expect(output.includes(Buffer.from('APCOSYS_TEST_METADATA_SHOULD_BE_REMOVED'))).toBe(false);
  expect(preview.length).toBeLessThanOrEqual(384 * 1024);
  await expect.poll(() => identity.evaluate(image => ({ width: (image as HTMLImageElement).naturalWidth, height: (image as HTMLImageElement).naturalHeight }))).toEqual({ width: 192, height: 192 });
  await page.reload();
  await expect(identity).toHaveAttribute('src', preview);
  const persisted = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('apcosys.avatar.v1:')));
  expect(persisted).toHaveLength(1);
  expect(persisted[0][0]).toMatch(/^apcosys\.avatar\.v1:[a-f0-9]{16}$/);
  expect(JSON.parse(persisted[0][1])).toEqual({ kind: 'photo', dataUrl: preview, preset: original.match(/(avatar-\d{2})\.svg$/)![1] });
  await page.screenshot({ path: testInfo.outputPath('avatar-upload-profile-desktop.png'), fullPage: true });

  await openPicker(page); await upload(page, 'jpg');
  await picker(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(identity).toHaveAttribute('src', preview);
  await openPicker(page);
  await picker(page).getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(picker(page).locator('.avatar-picker-preview img')).toHaveAttribute('src', original);
  await picker(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(identity).toHaveAttribute('src', preview);
  await openPicker(page);
  await picker(page).getByRole('button', { name: 'Remove photo', exact: true }).click();
  await picker(page).getByRole('button', { name: 'Use avatar', exact: true }).click();
  await expect(identity).toHaveAttribute('src', original);
  await page.reload();
  await expect(identity).toHaveAttribute('src', original);
  const restored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('apcosys.avatar.v1:')));
  expect(restored[0][1]).toMatch(/^avatar-\d{2}$/);
  expect(writes).toEqual([]);
});

for (const format of ['jpg', 'webp']) {
  test(`${format} photo uploads are decoded and re-encoded without their original metadata`, async ({ page }) => {
    await page.goto('/settings'); await openPicker(page); await upload(page, format);
    const preview = (await picker(page).locator('.avatar-picker-preview img').getAttribute('src'))!;
    expect(readFileSync(fixture(format)).includes(Buffer.from('APCOSYS_TEST_METADATA_SHOULD_BE_REMOVED'))).toBe(true);
    expect(Buffer.from(preview.split(',')[1], 'base64').includes(Buffer.from('APCOSYS_TEST_METADATA_SHOULD_BE_REMOVED'))).toBe(false);
    await picker(page).getByRole('button', { name: 'Use avatar', exact: true }).click();
    await expect(page.locator('.profile-avatar-button img')).toHaveAttribute('src', preview);
  });
}

test('invalid uploads leave the saved avatar intact and recover through the same file input at 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/settings');
  const identity = page.locator('.profile-avatar-button img');
  await expect(identity).toHaveAttribute('src', /avatar-\d{2}\.svg$/);
  const original = (await identity.getAttribute('src'))!;
  await openPicker(page);
  await photoInput(page).setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') });
  await expect(picker(page).getByRole('alert')).toContainText('PNG, JPG or WebP');
  await expect(identity).toHaveAttribute('src', original);
  await photoInput(page).setInputFiles({ name: 'oversize.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(picker(page).getByRole('alert')).toContainText('smaller than 5 MB');
  const tooWide = readFileSync(fixture('png')); tooWide.writeUInt32BE(8193, 16);
  await photoInput(page).setInputFiles({ name: 'dimensions.png', mimeType: 'image/png', buffer: tooWide });
  await expect(picker(page).getByRole('alert')).toContainText('8,192 pixels');
  await page.screenshot({ path: testInfo.outputPath('avatar-upload-error-mobile.png') });
  await upload(page);
  await expect(picker(page).getByRole('alert')).toHaveCount(0);
  for (const control of [photoInput(page), picker(page).getByRole('button', { name: 'Remove photo', exact: true }), picker(page).getByRole('button', { name: 'Use avatar', exact: true })]) {
    const box = (await control.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await expect(picker(page).getByRole('button', { name: 'Use avatar', exact: true })).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(accessibility.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) }))).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('avatar-upload-preview-mobile.png') });
  await picker(page).getByRole('button', { name: 'Use avatar', exact: true }).click();
  await expect(identity).toHaveAttribute('src', /^data:image\//);
});

test('unavailable local storage is reported without claiming a permanent avatar save', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key.startsWith('apcosys.avatar.v1:')) throw new DOMException('Storage is unavailable', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.goto('/settings'); await openPicker(page); await upload(page);
  const preview = (await picker(page).locator('.avatar-picker-preview img').getAttribute('src'))!;
  await picker(page).getByRole('button', { name: 'Use avatar', exact: true }).click();
  await expect(page.locator('.profile-avatar-button img')).toHaveAttribute('src', preview);
  await expect(page.getByText('Avatar updated for this visit. Browser storage is unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByText('Avatar updated.', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('apcosys.avatar.v1:')))).toEqual([]);
});
