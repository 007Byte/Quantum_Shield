import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for USBVault Enterprise.
 *
 * Tests run against the Expo web dev server. The port defaults to 8081 (what CI
 * uses) but is overridable via E2E_PORT so the suite can run on a machine where
 * 8081 is already taken by another service, without editing config — specs
 * navigate with relative paths, so only the port number changes. preflight.sh
 * sets E2E_PORT automatically when it detects 8081 is busy.
 */
const E2E_PORT = process.env.E2E_PORT || '8081';
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // GitHub's hosted runner has only 2 vCPUs. Running 3 Playwright workers there
  // OVERSUBSCRIBES the CPU — the parallel browser contexts starve each other and
  // the auth→dashboard flow blows its timeout (this caused 21 failed/7 flaky on
  // CI while passing locally, where there are more cores). A single worker avoids
  // the contention — each test gets the full CPU — and with web-first waits it is
  // the reliable choice on the constrained runner. Locally (undefined) Playwright
  // still parallelizes across all available cores.
  workers: process.env.CI ? 1 : undefined,
  // Per-test timeout (there was none). 90s leaves ample margin for the slow
  // register→onboarding→dashboard path on CI.
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    baseURL: E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 20000,
    navigationTimeout: 45000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    // App Store screenshot viewports
    {
      name: 'screenshots-iphone-6.7',
      use: {
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      },
    },
    {
      name: 'screenshots-iphone-6.5',
      use: {
        viewport: { width: 414, height: 896 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      },
    },
    {
      name: 'screenshots-ipad-12.9',
      use: {
        viewport: { width: 1024, height: 1366 },
        deviceScaleFactor: 2,
        isMobile: false,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)',
      },
    },
  ],

  // Start Expo web dev server automatically if not already running
  webServer: {
    command: `npx expo start --web --port ${E2E_PORT}`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Cold Metro web bundle on CI can take well over a minute.
    timeout: 180000,
  },
});
