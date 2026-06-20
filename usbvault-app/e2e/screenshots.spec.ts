/**
 * App Store Screenshot Automation
 *
 * Captures key screens at App Store required sizes.
 * Run: npx playwright test --project=screenshots-iphone-6.7 e2e/screenshots.spec.ts
 *
 * Output: screenshots/ directory organized by device size.
 *
 * NOTE: These run against the web version of the app.
 * For pixel-perfect native screenshots, use device screen recording.
 */

import { test, expect } from '@playwright/test';
import path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '..', 'screenshots');

// Helper: wait for app to settle after navigation
async function waitForAppReady(page: any) {
  // Wait for any loading spinners to disappear
  await page.waitForTimeout(1500);
}

// Helper: generate screenshot path with device info
function screenshotPath(project: string, name: string): string {
  return path.join(SCREENSHOT_DIR, project, `${name}.png`);
}

test.describe('App Store Screenshots', () => {
  const projectName = test.info().project.name || 'default';

  test('01 - Login Screen', async ({ page }) => {
    await page.goto('/');
    await waitForAppReady(page);
    await page.screenshot({
      path: screenshotPath(projectName, '01-login'),
      fullPage: false,
    });
  });

  test('02 - Dashboard', async ({ page }) => {
    // Navigate to dashboard (app starts at login, need to authenticate first)
    await page.goto('/');
    await waitForAppReady(page);

    // Try to fill login form if visible
    const emailInput = page.locator('input[type="email"], [placeholder*="email" i]').first();
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill('demo@usbvault.io');
      const passwordInput = page.locator('input[type="password"], [placeholder*="password" i]').first();
      if (await passwordInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await passwordInput.fill('DemoPassword123!');
        const loginButton = page.locator('button, [role="button"]').filter({ hasText: /log\s*in|sign\s*in/i }).first();
        if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          await loginButton.click();
          await waitForAppReady(page);
        }
      }
    }

    await page.screenshot({
      path: screenshotPath(projectName, '02-dashboard'),
      fullPage: false,
    });
  });

  test('03 - Encrypt & Store', async ({ page }) => {
    await page.goto('/encrypt-store');
    await waitForAppReady(page);
    await page.screenshot({
      path: screenshotPath(projectName, '03-encrypt-store'),
      fullPage: false,
    });
  });

  test('04 - Decrypt & Export', async ({ page }) => {
    await page.goto('/decrypt-export');
    await waitForAppReady(page);
    await page.screenshot({
      path: screenshotPath(projectName, '04-decrypt-export'),
      fullPage: false,
    });
  });

  test('05 - Password Manager', async ({ page }) => {
    await page.goto('/passwords');
    await waitForAppReady(page);
    await page.screenshot({
      path: screenshotPath(projectName, '05-passwords'),
      fullPage: false,
    });
  });

  test('06 - Secure Sharing', async ({ page }) => {
    await page.goto('/share');
    await waitForAppReady(page);
    await page.screenshot({
      path: screenshotPath(projectName, '06-share'),
      fullPage: false,
    });
  });

  test('07 - Settings', async ({ page }) => {
    await page.goto('/settings');
    await waitForAppReady(page);
    await page.screenshot({
      path: screenshotPath(projectName, '07-settings'),
      fullPage: false,
    });
  });

  test('08 - Premium / Subscription', async ({ page }) => {
    await page.goto('/premium');
    await waitForAppReady(page);
    await page.screenshot({
      path: screenshotPath(projectName, '08-premium'),
      fullPage: false,
    });
  });

  test('09 - Defense Dashboard', async ({ page }) => {
    await page.goto('/defense');
    await waitForAppReady(page);
    await page.screenshot({
      path: screenshotPath(projectName, '09-defense'),
      fullPage: false,
    });
  });

  test('10 - Zero Trace', async ({ page }) => {
    await page.goto('/zero-trace');
    await waitForAppReady(page);
    await page.screenshot({
      path: screenshotPath(projectName, '10-zero-trace'),
      fullPage: false,
    });
  });
});
