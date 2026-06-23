import { test as base } from '@playwright/test';

/**
 * Shared E2E base test.
 *
 * CI-slowness simulation: set E2E_CPU_THROTTLE=N (e.g. 6) to throttle the
 * browser CPU to 1/N speed via the Chrome DevTools Protocol. This reproduces the
 * slow, single-worker GitHub Actions runner on a fast dev machine so timing-
 * sensitive flakiness is caught LOCALLY before it reaches CI. Chromium only
 * (CDP); our CI E2E gate is chromium-only.
 *
 * All functional specs import { test, expect } from './test-base' instead of
 * '@playwright/test' so this throttle (and any future shared fixture) applies
 * everywhere.
 */
export const test = base.extend({
  // `provide` is Playwright's fixture-supply function (conventionally named
  // `use`); renamed here to avoid eslint's react-hooks/rules-of-hooks treating
  // `use(...)` as a React hook call.
  page: async ({ page }, provide) => {
    const rate = Number(process.env.E2E_CPU_THROTTLE || '0');
    if (rate > 1) {
      const client = await page.context().newCDPSession(page);
      await client.send('Emulation.setCPUThrottlingRate', { rate });
    }
    // Deterministic registration: the register screen calls the live Have I Been
    // Pwned API (api.pwnedpasswords.com) on password blur. On CI that network
    // call races the form submit and intermittently blocks registration (the app
    // shows a transient "data breach" warning), which then cascades into
    // dashboard-never-renders timeouts. Stub it to a clean "not breached" (empty
    // 200) response so the suite exercises OUR flow, not HIBP/network weather.
    await page.route('**/api.pwnedpasswords.com/**', route =>
      route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
    );
    await provide(page);
  },
});

export { expect } from '@playwright/test';
