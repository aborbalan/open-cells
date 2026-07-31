import { defineConfig, devices } from '@playwright/test';

/** See https://playwright.dev/docs/test-configuration. */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  /* Fail the build on CI if a test.only was left behind. */
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  /* One worker on CI, and on Windows too: concurrent WebKit workers crash the browser
   * process there (STATUS_STACK_BUFFER_OVERRUN, 0xC0000409), failing tests that pass
   * perfectly well when run one at a time. */
  workers: process.env.CI || process.platform === 'win32' ? 1 : undefined,
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'on-first-retry',
    /* No bypassCSP and no --disable-web-security. They were needed to reach the recipes
     * API cross-origin; the suite now serves it from fixtures, so the pages run under the
     * same security rules as in a browser and a real CSP or CORS regression is visible. */
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
