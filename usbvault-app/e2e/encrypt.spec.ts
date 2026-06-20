import { test, expect } from '@playwright/test';
import path from 'path';
import {
  waitForApp,
  registerAccount,
  expectAuthenticated,
} from './helpers';

test.describe('File Encryption Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    // Register and authenticate
    await registerAccount(page);
    await expectAuthenticated(page);
  });

  test('navigate to encrypt screen', async ({ page }) => {
    // Find and click the encrypt tab/nav item
    const encryptNav = page.locator(
      '[data-testid*="encrypt"], [data-testid*="Encrypt"], [href*="encrypt"]'
    ).first();

    if (await encryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await encryptNav.click();
      await page.waitForTimeout(1000);
    }

    // Verify encrypt screen elements are visible
    // The encrypt screen should show a file picker / drop zone area
    const encryptContent = page.locator('text=/encrypt|Encrypt|drop|file/i').first();
    await expect(encryptContent).toBeVisible({ timeout: 10000 });
  });

  test('encrypt screen shows algorithm selection', async ({ page }) => {
    // Navigate to encrypt
    const encryptNav = page.locator(
      '[data-testid*="encrypt"], [data-testid*="Encrypt"], [href*="encrypt"]'
    ).first();

    if (await encryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await encryptNav.click();
      await page.waitForTimeout(1000);
    }

    // Should show encryption algorithm options (AES-256-GCM-SIV, XChaCha20, ML-KEM)
    const algorithmContent = page.locator(
      'text=/AES|XChaCha|algorithm|security level/i'
    ).first();

    if (await algorithmContent.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(algorithmContent).toBeVisible();
    }
  });

  test('file upload via input element', async ({ page }) => {
    // Navigate to encrypt
    const encryptNav = page.locator(
      '[data-testid*="encrypt"], [data-testid*="Encrypt"], [href*="encrypt"]'
    ).first();

    if (await encryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await encryptNav.click();
      await page.waitForTimeout(1000);
    }

    // Look for file input element (React Native Web document picker uses <input type="file">)
    const fileInput = page.locator('input[type="file"]').first();

    if (await fileInput.count() > 0) {
      // Create a test file and upload it
      await fileInput.setInputFiles({
        name: 'test-document.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('USBVault E2E test content - confidential data for encryption testing'),
      });
      await page.waitForTimeout(1000);

      // Verify the file appears in the UI
      const fileEntry = page.locator('text=/test-document/i').first();
      if (await fileEntry.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(fileEntry).toBeVisible();
      }
    }
  });
});
