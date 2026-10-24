import { expect, type Locator } from '@playwright/test';

/** Exercise the same visible custom menu a person uses; no hidden native select. */
export async function chooseOption(control: Locator, value: string | number) {
  await control.click();
  await expect(control).toHaveAttribute('aria-expanded', 'true');
  const listId = await control.getAttribute('aria-controls');
  if (!listId) throw new Error('The custom select did not expose its option list.');
  const list = control.page().locator(`[id=${JSON.stringify(listId)}]`);
  const option = list.getByRole('option').and(list.locator(`[data-value=${JSON.stringify(String(value))}]`));
  await expect(option).toBeVisible();
  await option.click();
  await expect(control).toHaveAttribute('aria-expanded', 'false');
}
