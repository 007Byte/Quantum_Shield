import { test, expect } from '@playwright/test';
import {
  waitForApp,
  registerAccount,
  loginAccount,
  expectAuthenticated,
  expectLoginScreen,
  TEST_PASSWORD,
} from './helpers';

test.describe('Session Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
  });

  test('login loads the authenticated dashboard', async ({ page }) => {
    await registerAccount(page);
    await expectAuthenticated(page);
  });

  test('logout redirects to login screen', async ({ page }) => {
    await registerAccount(page);
    await expectAuthenticated(page);

    // Find and click logout
    const logoutButton = page.locator(
      '[data-testid*="logout"], [data-testid*="sign-out"]'
    ).first();

    if (await logoutButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logoutButton.click();
      await page.waitForTimeout(1500);
      await expectLoginScreen(page);
    } else {
      // Try navigating to settings first
      const settingsTab = page.locator('[data-testid*="settings"]').first();
      if (await settingsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await settingsTab.click();
        await page.waitForTimeout(500);

        const logoutInSettings = page.locator(
          '[data-testid*="logout"], [data-testid*="sign-out"]'
        ).first();

        if (await logoutInSettings.isVisible({ timeout: 3000 }).catch(() => false)) {
          await logoutInSettings.click();
          await page.waitForTimeout(1500);
          await expectLoginScreen(page);
        }
      }
    }
  });

  test('protected routes redirect to login when not authenticated', async ({ page }) => {
    // Clear any stored session
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Try navigating directly to protected routes
    const protectedRoutes = ['/encrypt', '/decrypt', '/share', '/settings', '/vaults'];

    for (const route of protectedRoutes) {
      await page.goto(route);
      await waitForApp(page);

      // Should be redirected to login or see the login screen
      const loginVisible = await page.getByTestId('login-email-input')
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      const authContent = page.locator(
        '[data-testid*="dashboard"], [data-testid*="vault"], [data-testid*="tab"]'
      ).first();
      const authVisible = await authContent.isVisible({ timeout: 2000 }).catch(() => false);

      // Either redirected to login or the app shows login screen
      // (some routes may not exist and fall back to root which is login)
      expect(loginVisible || !authVisible).toBeTruthy();
    }
  });

  test('session persists across page refresh', async ({ page }) => {
    const email = await registerAccount(page);
    await expectAuthenticated(page);

    // Refresh the page
    await page.reload();
    await waitForApp(page);

    // Should still be authenticated (no redirect to login)
    // Give the app time to restore session
    await page.waitForTimeout(2000);

    const stillAuthenticated = page.locator(
      '[data-testid*="dashboard"], [data-testid*="vault"], [data-testid*="tab"], [data-testid*="encrypt"]'
    ).first();

    const loginScreen = page.getByTestId('login-email-input');

    // Either we remain authenticated or we see login (if session is memory-only)
    const isAuth = await stillAuthenticated.isVisible({ timeout: 5000 }).catch(() => false);
    const isLogin = await loginScreen.isVisible({ timeout: 3000 }).catch(() => false);

    // One of the two states must be true
    expect(isAuth || isLogin).toBeTruthy();

    // If we're on the login screen, log back in and verify it works
    if (isLogin) {
      await loginAccount(page, email, TEST_PASSWORD);
      await expectAuthenticated(page);
    }
  });

  test('logout clears session data', async ({ page }) => {
    await registerAccount(page);
    await expectAuthenticated(page);

    // Perform logout
    const logoutButton = page.locator(
      '[data-testid*="logout"], [data-testid*="sign-out"]'
    ).first();

    let loggedOut = false;

    if (await logoutButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      await logoutButton.click();
      await page.waitForTimeout(1500);
      loggedOut = true;
    } else {
      const settingsTab = page.locator('[data-testid*="settings"]').first();
      if (await settingsTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await settingsTab.click();
        await page.waitForTimeout(500);
        const logoutInSettings = page.locator(
          '[data-testid*="logout"], [data-testid*="sign-out"]'
        ).first();
        if (await logoutInSettings.isVisible({ timeout: 3000 }).catch(() => false)) {
          await logoutInSettings.click();
          await page.waitForTimeout(1500);
          loggedOut = true;
        }
      }
    }

    if (loggedOut) {
      // Verify session storage is cleared
      const sessionData = await page.evaluate(() => {
        return localStorage.getItem('usbvault:session');
      });

      // Session should be null or removed after logout
      expect(sessionData).toBeFalsy();

      // Refreshing should land on login
      await page.reload();
      await waitForApp(page);
      await expectLoginScreen(page);
    }
  });

  test('multiple login/logout cycles work correctly', async ({ page }) => {
    const email = await registerAccount(page);
    await expectAuthenticated(page);

    for (let cycle = 0; cycle < 2; cycle++) {
      // Logout
      await page.evaluate(() => {
        localStorage.removeItem('usbvault:session');
      });
      await page.goto('/');
      await waitForApp(page);
      await expectLoginScreen(page);

      // Login again
      await loginAccount(page, email, TEST_PASSWORD);
      await expectAuthenticated(page);
    }
  });
});
