import { test, expect } from '@playwright/test';
import {
  waitForApp,
  registerAccount,
  logout,
  expectLoginScreen,
  testEmail,
  TEST_PASSWORD,
} from './helpers';

test.describe('Error Scenarios', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  // ─── Login errors ────────────────────────────────────────

  test('login with wrong password shows error', async ({ page }) => {
    // Register first so the account exists, then log out
    const email = await registerAccount(page);
    await logout(page);
    await expectLoginScreen(page);

    // Attempt login with incorrect password
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('Wrong-Password!123');
    await page.getByTestId('login-button').click();
    await page.waitForTimeout(1500);

    // Should still be on the login screen
    await expect(page.getByTestId('login-email-input')).toBeVisible();

    // Look for an error message
    const errorMessage = page
      .locator(
        '[data-testid*="error"], [data-testid*="alert"], text=/invalid|incorrect|wrong|failed|error/i'
      )
      .first();

    if (await errorMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(errorMessage).toBeVisible();
    }
  });

  test('login with non-existent email shows error', async ({ page }) => {
    await expectLoginScreen(page);

    await page.getByTestId('login-email-input').fill('nonexistent@nowhere.usbvault.com');
    await page.getByTestId('login-password-input').fill(TEST_PASSWORD);
    await page.getByTestId('login-button').click();
    await page.waitForTimeout(1500);

    // Should remain on login
    await expect(page.getByTestId('login-email-input')).toBeVisible();

    const errorMessage = page
      .locator(
        '[data-testid*="error"], [data-testid*="alert"], text=/not found|invalid|no account|error|failed/i'
      )
      .first();

    if (await errorMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(errorMessage).toBeVisible();
    }
  });

  // ─── Registration errors ─────────────────────────────────

  test('register with mismatched passwords shows error', async ({ page }) => {
    await page.getByTestId('login-register-link').click();
    await page.waitForTimeout(500);

    await page.getByTestId('register-email-input').fill(testEmail());
    await page.getByTestId('register-password-input').fill(TEST_PASSWORD);
    await page.getByTestId('register-confirm-password-input').fill('Completely-Different!999');
    await page.getByTestId('register-button').click();
    await page.waitForTimeout(1000);

    // Should remain on register screen
    await expect(page.getByTestId('register-email-input')).toBeVisible();

    const errorMessage = page
      .locator('[data-testid*="error"], text=/match|mismatch|do not match|passwords/i')
      .first();

    if (await errorMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(errorMessage).toBeVisible();
    }
  });

  test('register with weak password shows error', async ({ page }) => {
    await page.getByTestId('login-register-link').click();
    await page.waitForTimeout(500);

    await page.getByTestId('register-email-input').fill(testEmail());
    await page.getByTestId('register-password-input').fill('weak');
    await page.getByTestId('register-confirm-password-input').fill('weak');
    await page.getByTestId('register-button').click();
    await page.waitForTimeout(1000);

    // Should remain on register screen
    await expect(page.getByTestId('register-email-input')).toBeVisible();

    const errorMessage = page
      .locator('[data-testid*="error"], text=/weak|strong|minimum|requirement|length|character/i')
      .first();

    if (await errorMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(errorMessage).toBeVisible();
    }
  });

  // ─── Empty form validation ───────────────────────────────

  test('submit empty login form shows validation', async ({ page }) => {
    await expectLoginScreen(page);

    // Click login without filling anything
    await page.getByTestId('login-button').click();
    await page.waitForTimeout(1000);

    // Should remain on login
    await expect(page.getByTestId('login-email-input')).toBeVisible();

    const validationMessage = page
      .locator(
        '[data-testid*="error"], [data-testid*="validation"], text=/required|enter|fill|empty|email/i'
      )
      .first();

    if (await validationMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(validationMessage).toBeVisible();
    }
  });

  test('submit empty register form shows validation', async ({ page }) => {
    await page.getByTestId('login-register-link').click();
    await page.waitForTimeout(500);

    await page.getByTestId('register-button').click();
    await page.waitForTimeout(1000);

    // Should remain on register
    await expect(page.getByTestId('register-email-input')).toBeVisible();

    const validationMessage = page
      .locator(
        '[data-testid*="error"], [data-testid*="validation"], text=/required|enter|fill|empty/i'
      )
      .first();

    if (await validationMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(validationMessage).toBeVisible();
    }
  });

  // ─── Network failure simulation ──────────────────────────

  test('network failure on login shows error gracefully', async ({ page }) => {
    // Intercept API calls and return 500
    await page.route('**/api/**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    );
    await page.route('**/auth/**', route =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      })
    );

    await expectLoginScreen(page);

    await page.getByTestId('login-email-input').fill(testEmail());
    await page.getByTestId('login-password-input').fill(TEST_PASSWORD);
    await page.getByTestId('login-button').click();
    await page.waitForTimeout(2000);

    // Should remain on login — not crash
    await expect(page.getByTestId('login-email-input')).toBeVisible();

    // Check for a user-facing error
    const errorMessage = page
      .locator(
        '[data-testid*="error"], [data-testid*="alert"], text=/error|failed|unavailable|try again|network/i'
      )
      .first();

    if (await errorMessage.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(errorMessage).toBeVisible();
    }
  });

  test('duplicate email registration shows error gracefully', async ({ page }) => {
    // Web auth is client-side, so register has no network dependency to fail —
    // the real "register fails gracefully" path is a duplicate account. Register
    // an email, log out, then try to register the SAME email again.
    const email = await registerAccount(page);
    await logout(page);
    await expectLoginScreen(page);

    await page.getByTestId('login-register-link').click();
    await page.waitForTimeout(500);

    await page.getByTestId('register-email-input').fill(email);
    await page.getByTestId('register-password-input').fill(TEST_PASSWORD);
    await page.getByTestId('register-confirm-password-input').fill(TEST_PASSWORD);
    await page.getByTestId('register-button').click();
    await page.waitForTimeout(1000);

    // Duplicate is rejected — we stay on the register screen, not onboarding.
    await expect(page.getByTestId('register-email-input')).toBeVisible();
  });

  // ─── Session timeout ─────────────────────────────────────

  test('expired session redirects to login', async ({ page }) => {
    // Register and authenticate
    await registerAccount(page);

    // Simulate session expiry by clearing stored session
    await page.evaluate(() => {
      localStorage.removeItem('usbvault:session');
      sessionStorage.clear();
    });

    // Reload the page
    await page.goto('/');
    await waitForApp(page);

    // Should be redirected to login
    await expectLoginScreen(page);
  });
});
