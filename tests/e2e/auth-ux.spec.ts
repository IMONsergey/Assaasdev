import { expect, test, type Page } from '@playwright/test';

/** Render the live auth adapter without an external account or authentication writes. */
async function mockAuthEntry(page: Page) {
  const writes: string[] = [];
  let pendingSecondFactor = false;
  await page.route('**/runtime-config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'window.__APCOSYS_CONFIG__ = {dataMode:"live", apiBaseUrl:"/backend"};',
  }));
  await page.route('**/backend/**', route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST') writes.push(path);
    return route.fulfill({
      status: path === '/backend/whoami' ? 401 : 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: path === '/backend/whoami' ? pendingSecondFactor ? 'Session requires 2FA verification' : 'Unauthorized' : 'Unexpected auth request' }),
    });
  });
  return { writes, requireSecondFactor: () => { pendingSecondFactor = true; } };
}

for (const flow of [
  { route: '/auth/signup', passwordLabel: 'Password', submit: 'Create account', image: 'signup' },
  { route: '/auth/recovery/confirm', passwordLabel: 'New password', submit: 'Reset password', image: 'reset' },
]) {
  test(`${flow.image} mismatch focuses a visible field error at 320px without an auth write`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const { writes } = await mockAuthEntry(page);
    await page.goto(flow.route);
    if (flow.image === 'signup') {
      await page.getByLabel('Email address', { exact: true }).fill('auth-review@example.test');
      await page.getByLabel('Username', { exact: true }).fill('auth_review');
    } else {
      await page.getByLabel('Email or username', { exact: true }).fill('auth_review');
      await page.getByLabel('Reset code', { exact: true }).fill('complete-reset-code');
    }
    const password = page.getByLabel(flow.passwordLabel, { exact: true });
    const confirmation = page.getByLabel('Confirm password', { exact: true });
    const submit = page.getByRole('button', { name: flow.submit, exact: true });
    await password.fill('correct horse battery staple');
    await confirmation.fill('different horse battery staple');
    await submit.click();

    await expect(confirmation).toBeFocused();
    await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    await expect(confirmation).toHaveAccessibleDescription('The passwords do not match.');
    await expect(confirmation).toBeInViewport({ ratio: 1 });
    await expect(page.getByText('The passwords do not match.', { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(password).toHaveValue('correct horse battery staple');
    await expect(confirmation).toHaveValue('different horse battery staple');
    await expect(page).toHaveURL(flow.route);
    expect(writes).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`auth-${flow.image}-mismatch-320.png`) });

    // Editing either password clears the old error; another invalid submit still focuses it.
    await password.fill('updated correct horse battery staple');
    await expect(confirmation).not.toHaveAttribute('aria-invalid', 'true');
    await submit.click();
    await expect(confirmation).toBeFocused();
    await expect(confirmation).toHaveAccessibleDescription('The passwords do not match.');
    await confirmation.fill('updated correct horse battery staple');
    await expect(confirmation).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('The passwords do not match.', { exact: true })).toHaveCount(0);
    expect(writes).toEqual([]);
  });
}

for (const width of [1440, 320]) {
  test(`auth states use complete layouts and a full-width provider action at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width > 760 ? 960 : 844 });
    const { writes, requireSecondFactor } = await mockAuthEntry(page);
    for (const screen of [
      { route: '/auth/login', title: 'Welcome back', image: 'login' },
      { route: '/auth/signup', title: 'Create account', image: 'signup' },
      { route: '/auth/recovery', title: 'Reset password', image: 'recovery' },
      { route: '/auth/recovery/confirm', title: 'Choose a new password', image: 'reset' },
      { route: '/auth/verify', title: 'Verify email', image: 'verify' },
      { route: '/auth/totp', title: 'Two-factor authentication', image: 'totp' },
    ]) {
      if (screen.image === 'totp') requireSecondFactor();
      await page.goto(screen.route);
      await expect(page.getByRole('heading', { name: screen.title, level: 1, exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (screen.image === 'login') {
        const provider = page.getByRole('button', { name: 'Continue with Google', exact: true });
        await expect(provider).toBeVisible();
        const providerBox = await provider.boundingBox();
        const submitBox = await page.getByRole('button', { name: 'Log in', exact: true }).boundingBox();
        expect(providerBox).not.toBeNull();
        expect(submitBox).not.toBeNull();
        expect(Math.abs(providerBox!.width - submitBox!.width)).toBeLessThanOrEqual(1);
      }
      if (screen.image === 'totp') await expect(page.getByLabel('Authenticator code', { exact: true })).toBeFocused();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: testInfo.outputPath(`auth-${screen.image}-${width}.png`), fullPage: true });
    }
    expect(writes).toEqual([]);
  });
}
