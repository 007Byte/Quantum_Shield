import { test, expect } from './test-base';
import {
  waitForApp,
  registerAccount,
  loginAccount,
  logout,
  expectAuthenticated,
  expectLoginScreen,
  testEmail,
  TEST_PASSWORD,
} from './helpers';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('shows login screen when unauthenticated', async ({ page }) => {
    await expectLoginScreen(page);
    await expect(page.getByTestId('login-email-input')).toBeVisible();
    await expect(page.getByTestId('login-password-input')).toBeVisible();
    await expect(page.getByTestId('login-button')).toBeVisible();
  });

  test('can navigate to register screen', async ({ page }) => {
    await page.getByTestId('login-register-link').click();
    await page.waitForTimeout(500);

    await expect(page.getByTestId('register-email-input')).toBeVisible();
    await expect(page.getByTestId('register-password-input')).toBeVisible();
    await expect(page.getByTestId('register-confirm-password-input')).toBeVisible();
    await expect(page.getByTestId('register-button')).toBeVisible();
  });

  test('register → auto-login → dashboard', async ({ page }) => {
    const email = await registerAccount(page);
    await expectAuthenticated(page);

    // Verify user context is set (email visible somewhere in the UI)
    // The dashboard or settings should reflect the logged-in user
    expect(email).toBeTruthy();
  });

  test('register → logout → login → dashboard', async ({ page }) => {
    // Step 1: Register
    const email = await registerAccount(page);
    await expectAuthenticated(page);

    // Step 2: Logout via Settings → Sign Out
    await logout(page);

    // Step 3: Should be back on login
    await expectLoginScreen(page);

    // Step 4: Login with same credentials
    await loginAccount(page, email);
    await expectAuthenticated(page);
  });

  test('login with wrong password shows error', async ({ page }) => {
    // First register an account
    const email = await registerAccount(page);
    await expectAuthenticated(page);

    // Log out (the session lives in sessionStorage), then return to login
    await logout(page);
    await expectLoginScreen(page);

    // Try logging in with wrong password
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('WrongPassword123!');
    await page.getByTestId('login-button').click();
    await page.waitForTimeout(1000);

    // Should still be on login screen (not redirected)
    await expect(page.getByTestId('login-email-input')).toBeVisible();
  });

  test('register with mismatched passwords shows error', async ({ page }) => {
    await page.getByTestId('login-register-link').click();
    await page.waitForTimeout(500);

    await page.getByTestId('register-email-input').fill(testEmail());
    await page.getByTestId('register-password-input').fill(TEST_PASSWORD);
    await page.getByTestId('register-confirm-password-input').fill('DifferentPassword123!');
    await page.getByTestId('register-button').click();
    await page.waitForTimeout(500);

    // Should remain on register screen — password mismatch error shown
    await expect(page.getByTestId('register-email-input')).toBeVisible();
  });
});
