import { defineConfig, devices } from '@playwright/test';

const browserName = process.env.APCOSYS_BROWSER === 'firefox' ? 'firefox' : 'chromium';
const channel = browserName === 'chromium' && process.env.APCOSYS_CHROMIUM_CHANNEL === 'chrome' ? 'chrome' : undefined;
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: true, forbidOnly: !!process.env.CI,
  retries: 0, workers: process.env.CI ? 2 : 2, timeout: 60000,
  expect: { timeout: 10000 }, reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 960 }, locale: 'en-US', timezoneId: 'UTC', reducedMotion: 'reduce', screenshot: 'only-on-failure', trace: 'retain-on-failure', video: channel ? 'off' : 'retain-on-failure' },
  projects: [{ name: browserName, use: { ...(browserName === 'firefox' ? devices['Desktop Firefox'] : devices['Desktop Chrome']), browserName, channel, viewport: { width: 1440, height: 960 }, launchOptions: process.env.APCOSYS_FIREFOX_EXECUTABLE && browserName === 'firefox' ? { executablePath: process.env.APCOSYS_FIREFOX_EXECUTABLE } : {} } }],
  webServer: { command: 'npm run dev:demo', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60000 },
});
