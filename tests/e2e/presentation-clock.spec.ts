import { expect, test } from '@playwright/test';

test('presentation wallet payments and submitted search history use the same browser date', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date('2026-10-24T15:30:00Z'));
  await page.goto('/search');
  await page.getByRole('combobox', { name: 'Search internet infrastructure' }).fill('nginx');
  await page.locator('.search-query-bar').getByRole('button', { name: 'Run search', exact: true }).click();
  await expect(page.locator('.search-result-row').first()).toBeVisible();
  await page.getByRole('link', { name: 'Search history', exact: true }).click();
  const today = page.getByRole('region', { name: 'Today', exact: true });
  await expect(today.locator('.search-history-row')).toHaveCount(1);
  await expect(today.locator('time')).toHaveAttribute('datetime', '2026-10-24T15:30:00.000Z');
  await page.screenshot({ path: testInfo.outputPath('presentation-history-current-date.png') });

  await page.getByRole('link', { name: 'Billing', exact: true }).click();
  await page.getByRole('tab', { name: 'Credit packs', exact: true }).click();
  await page.locator('.billing-token').filter({ has: page.getByRole('heading', { name: 'Starter Pack', exact: true }) }).getByRole('button', { name: 'Buy credits', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Add 25,000 credits', exact: true });
  await review.getByLabel('Payment method', { exact: true }).selectOption('balance');
  await review.getByRole('button', { name: 'Pay with balance', exact: true }).click();
  await expect(review.getByRole('heading', { name: 'Payment complete', exact: true })).toBeVisible();
  await expect(review.locator('[data-onboarding="wallet-receipt"]')).toContainText('$70');
  await review.getByRole('button', { name: 'View payments', exact: true }).click();
  const payment = page.locator('.billing-history-table tbody tr').filter({ hasText: 'Starter Pack' });
  await expect(payment).toHaveCount(1);
  await expect(payment).toContainText('completed');
  await expect(payment.locator('[data-label="Date"]')).toHaveText('Oct 24, 2026, 3:30 PM');
  await page.screenshot({ path: testInfo.outputPath('presentation-wallet-current-date.png') });
});
