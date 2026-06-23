import { type Page, expect } from '@playwright/test';

/**
 * Shared helpers for USBVault E2E tests.
 *
 * React Native Web renders testID as `data-testid` attributes.
 * We use Playwright's `getByTestId()` which maps to `[data-testid]` by default.
 */

/** Generate a unique test email to avoid collisions between runs. */
export function testEmail(): string {
  return `e2e-${Date.now()}@test.usbvault.com`;
}

/** A password that meets NIST SP 800-63B-4 requirements. */
export const TEST_PASSWORD = 'E2E-Str0ng!Pass#2026';

// Generous timeouts: the slow single-worker CI runner is ~6x slower than a dev
// machine, so every wait below uses web-first (reactive) polling with margin
// rather than fixed `waitForTimeout` sleeps that were calibrated for fast
// hardware. This is what makes the suite machine-speed-independent.
const SCREEN_TIMEOUT = 45000;

/** Wait for the app to finish initial loading and render a real screen. */
export async function waitForApp(page: Page): Promise<void> {
  await page.waitForSelector('#root', { state: 'attached', timeout: SCREEN_TIMEOUT });
  // Wait until the app has actually rendered one of its entry screens (login,
  // dashboard, or the onboarding wizard) — reactive, not a fixed hydration sleep.
  await page
    .locator(
      '[data-testid="login-email-input"], [data-testid="dashboard-screen"], [data-testid="onboarding-next-button"]'
    )
    .first()
    .waitFor({ state: 'visible', timeout: SCREEN_TIMEOUT });
}

/** Register a new account and return the email used. */
export async function registerAccount(page: Page, email?: string): Promise<string> {
  const userEmail = email || testEmail();

  // Navigate to register if not already there
  const registerLink = page.getByTestId('login-register-link');
  if (await registerLink.isVisible({ timeout: 10000 }).catch(() => false)) {
    await registerLink.click();
  }

  // fill()/click() auto-wait for the element to be actionable.
  await page
    .getByTestId('register-email-input')
    .waitFor({ state: 'visible', timeout: SCREEN_TIMEOUT });
  await page.getByTestId('register-email-input').fill(userEmail);
  await page.getByTestId('register-password-input').fill(TEST_PASSWORD);
  await page.getByTestId('register-confirm-password-input').fill(TEST_PASSWORD);
  await page.getByTestId('register-button').click();

  // After registration the OnboardingWizard is shown (PQC check → cipher →
  // identity → vault-ready). No input is required (cipher/displayName default),
  // so click "Continue" through all steps until the wizard is gone.
  await completeOnboarding(page);

  return userEmail;
}

/** Click through the post-registration OnboardingWizard if present. */
export async function completeOnboarding(page: Page): Promise<void> {
  const next = page.getByTestId('onboarding-next-button');
  // Wizard has 4 steps; click() auto-waits for the button to be actionable each
  // iteration, so no fixed sleep between clicks. Loop until the button is gone.
  for (let i = 0; i < 8; i++) {
    if (!(await next.isVisible({ timeout: i === 0 ? 10000 : 5000 }).catch(() => false))) break;
    await next.click();
  }
  // Onboarding finished → the dashboard should render. (Soft wait; the calling
  // test asserts authentication via expectAuthenticated.)
  await page
    .getByTestId('dashboard-screen')
    .waitFor({ state: 'visible', timeout: SCREEN_TIMEOUT })
    .catch(() => {});
}

/** Log out via Settings → Sign Out. Returns to the login screen. */
export async function logout(page: Page): Promise<void> {
  await page.goto('/settings');
  const signOut = page.getByTestId('settings-sign-out');
  await signOut.waitFor({ state: 'visible', timeout: SCREEN_TIMEOUT });
  await signOut.scrollIntoViewIfNeeded().catch(() => {});
  await signOut.click();
  // Sign-out shows a confirmation modal — confirm it.
  await page.getByTestId('modal-confirm').click({ timeout: 15000 });
  // After confirming we return to the login screen.
  await page
    .getByTestId('login-email-input')
    .waitFor({ state: 'visible', timeout: SCREEN_TIMEOUT });
}

/** Log in with an existing account. The caller asserts the resulting screen. */
export async function loginAccount(
  page: Page,
  email: string,
  password = TEST_PASSWORD
): Promise<void> {
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-button').click();
  // No fixed wait — callers assert the next screen (expectAuthenticated /
  // expectLoginScreen) which poll reactively.
}

/** Assert we're on the authenticated dashboard. */
export async function expectAuthenticated(page: Page): Promise<void> {
  // After auth (and the onboarding wizard on register) the dashboard renders.
  await expect(page.getByTestId('dashboard-screen')).toBeVisible({ timeout: SCREEN_TIMEOUT });
}

/** Assert we're on the login screen (unauthenticated). */
export async function expectLoginScreen(page: Page): Promise<void> {
  await expect(page.getByTestId('login-email-input')).toBeVisible({ timeout: SCREEN_TIMEOUT });
}

// ─── Additional shared utilities ────────────────────────────

/** Register a new account and then log in (combines register + login for test setup). */
export async function registerAndLogin(page: Page): Promise<string> {
  const email = await registerAccount(page);
  await expectAuthenticated(page);
  return email;
}

/** Navigate to vault management and create a vault with the given name. */
export async function createVault(page: Page, name: string): Promise<void> {
  const vaultsNav = page
    .locator('[data-testid*="vault"], [data-testid*="manage-vault"], [href*="vault"]')
    .first();

  if (await vaultsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    await vaultsNav.click();
    await page.waitForTimeout(1000);
  }

  const createButton = page
    .locator(
      '[data-testid*="create-vault"], [data-testid*="add-vault"], [data-testid*="new-vault"]'
    )
    .first();

  if (await createButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await createButton.click();
    await page.waitForTimeout(500);

    const nameInput = page
      .locator(
        '[data-testid*="vault-name"], input[placeholder*="name" i], input[placeholder*="vault" i]'
      )
      .first();

    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill(name);
      await page.waitForTimeout(300);
    }

    const submitButton = page
      .locator(
        '[data-testid*="submit-vault"], [data-testid*="save-vault"], [data-testid*="confirm"]'
      )
      .first();

    if (await submitButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitButton.click();
      await page.waitForTimeout(1000);
    }
  }
}

/** Navigate to settings and switch the application language. */
export async function switchLanguage(page: Page, locale: string): Promise<void> {
  const settingsNav = page
    .locator('[data-testid*="settings"], [data-testid*="Settings"], [href*="settings"]')
    .first();

  if (await settingsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    await settingsNav.click();
    await page.waitForTimeout(1000);
  }

  const langPicker = page
    .locator('[data-testid*="language"], [data-testid*="locale"], [data-testid*="lang-select"]')
    .first();

  if (await langPicker.isVisible({ timeout: 5000 }).catch(() => false)) {
    await langPicker.click();
    await page.waitForTimeout(500);

    const localeOption = page.locator(`[data-testid*="${locale}"], text=/${locale}/i`).first();

    if (await localeOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await localeOption.click();
      await page.waitForTimeout(1000);
    }
  }
}

/** Wait for a toast/notification with matching text to appear. */
export async function waitForToast(page: Page, text: string): Promise<void> {
  const toast = page
    .locator(
      `[data-testid*="toast"], [role="alert"], [data-testid*="notification"], [data-testid*="snackbar"]`
    )
    .filter({ hasText: new RegExp(text, 'i') })
    .first();

  await expect(toast).toBeVisible({ timeout: 10000 });
}

/**
 * Intercept network requests matching a URL pattern and return a mocked response.
 * Useful for simulating server errors, latency, etc.
 */
export async function interceptNetwork(
  page: Page,
  pattern: string,
  response: { status: number; body?: string; contentType?: string }
): Promise<void> {
  await page.route(pattern, route =>
    route.fulfill({
      status: response.status,
      contentType: response.contentType || 'application/json',
      body: response.body || JSON.stringify({ error: 'Mocked response' }),
    })
  );
}
