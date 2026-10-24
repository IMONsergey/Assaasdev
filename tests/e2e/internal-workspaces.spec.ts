import { expect, test, type Page } from '@playwright/test';
import { seedPricing, seedProfile } from '../../src/demo/fixtures';
import type { BillingPayment, PlanningTask, PrivateTask } from '../../src/api';

async function internalApi(page: Page, data: { tasks?: PrivateTask[]; planned?: PlanningTask[]; payments?: BillingPayment[]; omitPayments?: boolean; holdFiles?: boolean } = {}) {
  const frames: Array<{ type: string; id: string; data: Record<string, unknown> }> = [];
  const profile = seedProfile();
  await page.route('**/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'window.__APCOSYS_CONFIG__={dataMode:"live",apiBaseUrl:"/backend"};' }));
  await page.route('**/backend/**', route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/pricing') ? seedPricing() : profile }));
  await page.routeWebSocket('**/backend/ws', socket => {
    socket.onMessage(raw => {
      const frame = JSON.parse(String(raw)); frames.push(frame);
      const reply = (body: unknown, type = frame.type) => socket.send(JSON.stringify({ id: frame.id, type, data: body, metadata: { subscription_type: 'Business' } }));
      if (frame.type === 'private_tasks_get') reply(data.tasks || []);
      else if (frame.type === 'private_planning_tasks_get') reply(data.planned || []);
      else if (frame.type === 'user_billing') reply({ subscription: profile.subscription, ...(data.omitPayments ? {} : { payments: data.payments || [] }) });
      else if (frame.type === 'buckets') { if (!data.holdFiles) reply({ result: [], result_count: 0 }); }
      else if (frame.type === 'private_hosts') reply([{ ip: '192.0.2.1', open_ports: [{ port: 443, protocol: 'https' }] }]);
      else if (frame.type === 'private_analytics') reply({ complete: true });
      else reply({ unread_count: 0 });
    });
  });
  return frames;
}

test('file filters open independently, cancel their draft and remain dismissible while a request is pending', async ({ page }) => {
  const frames = await internalApi(page, { holdFiles: true });
  await page.goto('/files');
  const controls = page.locator('.files-search-toolbar');
  const before = await controls.boundingBox();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'File filters', exact: true });
  await expect(panel).toBeVisible();
  const after = await controls.boundingBox();
  expect(after?.y).toBeCloseTo(before!.y, 1);
  await panel.getByLabel('Keywords', { exact: true }).fill('discarded draft');
  await panel.press('Escape');
  await expect(panel).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(panel.getByLabel('Keywords', { exact: true })).toHaveValue('');
  await panel.getByLabel('Keywords', { exact: true }).fill('report');
  await panel.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByText('Looking for matching records…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await panel.getByLabel('Keywords', { exact: true }).fill('next draft');
  await expect(panel.getByRole('button', { name: 'Cancel', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(page.getByLabel('Filename or keywords', { exact: true })).toHaveValue('report');
  expect(frames.filter(frame => frame.type === 'buckets')).toHaveLength(1);
});

test('invalid file ranges bring the error summary into view from the sticky action', async ({ page }) => {
  const frames = await internalApi(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/files');
  const trigger = page.getByRole('button', { name: 'Filters', exact: true });
  await trigger.click();
  const panel = page.getByRole('dialog', { name: 'File filters', exact: true });
  await panel.getByLabel('Size from · MB', { exact: true }).fill('10');
  await panel.getByLabel('Size to · MB', { exact: true }).fill('2');
  await panel.getByLabel('Hostname', { exact: true }).click();
  await panel.getByRole('button', { name: 'Apply filters', exact: true }).click();
  const error = panel.locator('#files-filter-error');
  await expect(panel).toBeVisible();
  await expect(error).toContainText('The minimum size must not exceed the maximum.');
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport();
  const bounds = await error.boundingBox(), body = await panel.locator('.dialog-body').boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(body!.y - 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(body!.y + body!.height + 1);
  expect(frames.filter(frame => frame.type === 'buckets')).toHaveLength(0);
  await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(panel).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('scanner filters all loaded tasks and preserves the list page through private results', async ({ page }) => {
  const tasks = Array.from({ length: 1000 }, (_, index): PrivateTask => ({ id: `task-${String(index).padStart(4, '0')}`, status: index % 2 ? 'completed' : 'running', host_list: [`host-${index}.example.test`], port_list: [443], result_count: 1, created_at: 1800000000 + index }));
  const planned = Array.from({ length: 1000 }, (_, index): PlanningTask => ({ id: `plan-${index}`, host_list: [`planned-${index}.example.test`], port_list: [443], schedule: '0 0 3 * * *' }));
  const frames = await internalApi(page, { tasks, planned });
  await page.goto('/scanner?rows=10&page=75&tab=all');
  await expect(page.locator('.scanner-task-table tbody tr')).toHaveCount(10);
  await expect(page.locator('.scanner-task-table tbody tr').first()).toContainText('task-0740');
  const before = frames.filter(frame => frame.type === 'private_tasks_get').length;
  await page.getByLabel('Find a task', { exact: true }).fill('task-0999');
  await expect(page.locator('.scanner-task-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.scanner-task-table tbody tr')).toContainText('host-999.example.test');
  await page.getByLabel('Task status', { exact: true }).selectOption('running');
  await expect(page.getByRole('heading', { name: 'No tasks match this filter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear task filter', exact: true }).click();
  await page.getByLabel('Task status', { exact: true }).selectOption('completed');
  await expect(page.getByRole('navigation', { name: 'Pagination', exact: true })).toContainText('500 results');
  expect(frames.filter(frame => frame.type === 'private_tasks_get')).toHaveLength(before);
  await page.getByLabel('Task status', { exact: true }).selectOption('');
  await page.getByRole('navigation', { name: 'Pagination', exact: true }).getByRole('button', { name: 'Next', exact: true }).click();
  const listUrl = page.url();
  await page.locator('.scanner-task-table tbody tr').first().getByRole('link', { name: 'View results', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Back to scanner', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to scanner', exact: true }).click();
  await expect(page).toHaveURL(listUrl);
  await expect(page.locator('.scanner-task-table tbody tr').first()).toContainText('task-0010');
  await page.getByRole('tab', { name: /Scheduled/ }).click();
  await expect(page.locator('.scanner-task-table--planned tbody tr')).toHaveCount(10);
  await page.getByLabel('Find a task', { exact: true }).fill('planned-999');
  await expect(page.locator('.scanner-task-table--planned tbody tr')).toHaveCount(1);
  await expect(page.locator('.scanner-task-table--planned')).toContainText('plan-999');
});

test('rapid scanner filters compose the current URL and preserve Back and Forward history', async ({ page }) => {
  const tasks = Array.from({ length: 1000 }, (_, index): PrivateTask => ({ id: `task-${index}`, status: index % 2 ? 'completed' : 'running', host_list: [`host-${index}.example.test`], port_list: [443], result_count: 1 }));
  const frames = await internalApi(page, { tasks });
  const initial = '/scanner?tab=all&q=host-999&status=running&rows=10&page=7';
  await page.goto(initial);
  await expect(page.getByRole('heading', { name: 'No tasks match this filter', exact: true })).toBeVisible();
  const query = page.getByLabel('Find a task', { exact: true });
  const status = page.getByLabel('Task status', { exact: true });
  const pagination = page.getByRole('navigation', { name: 'Pagination', exact: true });
  const reads = frames.filter(frame => ['private_tasks_get', 'private_planning_tasks_get'].includes(frame.type)).length;

  // One task reproduces the interval between synchronous history and React render.
  await status.evaluate(element => {
    const select = element as HTMLSelectElement;
    const clear = [...document.querySelectorAll<HTMLButtonElement>('.scanner-page button')]
      .find(button => button.textContent?.trim() === 'Clear task filter');
    if (!clear) throw new Error('The unmatched scanner query must expose its clear action.');
    clear.click();
    select.value = 'completed';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page).toHaveURL(url => url.searchParams.get('tab') === 'all'
    && !url.searchParams.has('q') && !url.searchParams.has('page')
    && url.searchParams.get('status') === 'completed' && url.searchParams.get('rows') === '10');
  await expect(query).toHaveValue('');
  await expect(status).toHaveValue('completed');
  await expect(pagination).toContainText('500 results');
  await expect(page.locator('.scanner-task-table tbody tr')).toHaveCount(10);

  await page.goBack();
  await expect(query).toHaveValue('');
  await expect(status).toHaveValue('');
  await expect(pagination).toContainText('1,000 results');
  await page.goForward();
  await expect(query).toHaveValue('');
  await expect(status).toHaveValue('completed');
  await expect(pagination).toContainText('500 results');
  expect(frames.filter(frame => ['private_tasks_get', 'private_planning_tasks_get'].includes(frame.type))).toHaveLength(reads);
  expect(frames.filter(frame => ['private_task_add', 'private_task_update', 'private_task_remove', 'private_planning_task_remove', 'private_task_results_delete'].includes(frame.type))).toEqual([]);
});

test('payment history searches 5,000 records locally with bounded rendering and keeps zero amounts', async ({ page }) => {
  const payments = Array.from({ length: 5000 }, (_, index): BillingPayment => ({ payment_id: `payment-${String(index).padStart(4, '0')}`, amount_usd: index === 4999 ? 0 : 50, subscription: 'Plus', created_at: 1800000000 + index, ...(index === 4999 ? {} : { status: index % 2 ? 'pending' : 'completed' }) }));
  const frames = await internalApi(page, { payments });
  await page.goto('/billing?section=payments');
  const history = page.getByRole('region', { name: 'Payment history records', exact: true });
  await expect(history.locator('tbody tr')).toHaveCount(25);
  await expect(history).toContainText('5,000 loaded');
  const reads = frames.filter(frame => frame.type === 'user_billing').length;
  await history.getByLabel('Search payment history', { exact: true }).fill('payment-4999');
  await expect(history.locator('tbody tr')).toHaveCount(1);
  await expect(history.locator('tbody tr')).toContainText('$0');
  await expect(history.locator('tbody tr')).toContainText('Not provided');
  await history.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await history.getByLabel('Payment status filter', { exact: true }).selectOption('completed');
  await expect(history).toContainText('2,500 matching');
  await history.getByLabel('Payments per page', { exact: true }).selectOption('10');
  await expect(history.locator('tbody tr')).toHaveCount(10);
  await history.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(history.getByRole('navigation', { name: 'Pagination', exact: true })).toContainText('Page 2');
  expect(frames.filter(frame => frame.type === 'user_billing')).toHaveLength(reads);
  expect(frames.filter(frame => ['init_checkout', 'confirm_payment', 'delete_payment'].includes(frame.type))).toEqual([]);
  await page.setViewportSize({ width: 320, height: 844 });
  const mobileLayout = await page.evaluate(() => {
    const documentWidth = document.documentElement.scrollWidth, viewportWidth = innerWidth;
    const bounds = (element: Element) => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return { tag: element.tagName, id: element.id, className: element.getAttribute('class'), x: rect.x, right: rect.right, width: rect.width, marginLeft: style.marginLeft, transition: style.transitionProperty };
    };
    return {
      documentWidth, viewportWidth,
      shell: [...document.querySelectorAll('.workspace-main,.app-topbar,.app-sidebar')].map(bounds),
      rightOfViewport: documentWidth > viewportWidth + 1
        ? [...document.querySelectorAll('body *')].map(bounds).filter(rect => rect.width > 0 && rect.right > viewportWidth + 1).slice(0, 16)
        : [],
    };
  });
  expect(mobileLayout.documentWidth, JSON.stringify(mobileLayout, null, 2)).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
  await expect(history.getByRole('button', { name: 'Remove record', exact: true }).first()).toBeVisible();
});

test('an omitted payment history is shown as unknown instead of an empty history', async ({ page }) => {
  await internalApi(page, { omitPayments: true });
  await page.goto('/billing?section=payments');
  await expect(page.getByText('Payment history was not provided', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No payments to show', exact: true })).toHaveCount(0);
});
