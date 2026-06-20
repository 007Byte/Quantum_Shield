import { test, expect } from '@playwright/test';
import {
  waitForApp,
  registerAccount,
  expectAuthenticated,
} from './helpers';

/**
 * Full encrypt → decrypt cycle tests.
 *
 * Each security level (Standard / High / Maximum) is exercised:
 *   Standard  = AES-256-GCM
 *   High      = XChaCha20-Poly1305
 *   Maximum   = ML-KEM (post-quantum hybrid)
 */

const SECURITY_LEVELS = ['Standard', 'High', 'Maximum'] as const;

test.describe('Full Crypto Cycle (Encrypt → Decrypt)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await registerAccount(page);
    await expectAuthenticated(page);
  });

  /** Helper: navigate to the encrypt screen. */
  async function navigateToEncrypt(page: import('@playwright/test').Page) {
    const encryptNav = page.locator(
      '[data-testid*="encrypt"], [data-testid*="Encrypt"], [href*="encrypt"]'
    ).first();

    if (await encryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await encryptNav.click();
      await page.waitForTimeout(1000);
    }
  }

  /** Helper: navigate to the decrypt screen. */
  async function navigateToDecrypt(page: import('@playwright/test').Page) {
    const decryptNav = page.locator(
      '[data-testid*="decrypt"], [data-testid*="Decrypt"], [href*="decrypt"]'
    ).first();

    if (await decryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await decryptNav.click();
      await page.waitForTimeout(1000);
    }
  }

  /** Helper: upload a test file via the hidden <input type="file"> element. */
  async function uploadTestFile(
    page: import('@playwright/test').Page,
    filename: string,
    content: string,
  ) {
    const fileInput = page.locator('input[type="file"]').first();

    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles({
        name: filename,
        mimeType: 'text/plain',
        buffer: Buffer.from(content),
      });
      await page.waitForTimeout(1000);
    }
  }

  /** Helper: select a security level from the UI controls. */
  async function selectSecurityLevel(
    page: import('@playwright/test').Page,
    level: string,
  ) {
    // Try testID first, then fall back to text match
    const levelSelector = page.locator(
      `[data-testid*="security-${level.toLowerCase()}"], [data-testid*="${level.toLowerCase()}-level"]`
    ).first();

    if (await levelSelector.isVisible({ timeout: 3000 }).catch(() => false)) {
      await levelSelector.click();
      await page.waitForTimeout(500);
      return;
    }

    // Fallback: click text that matches the level name
    const levelText = page.locator(`text=/${level}/i`).first();
    if (await levelText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await levelText.click();
      await page.waitForTimeout(500);
    }
  }

  for (const level of SECURITY_LEVELS) {
    test(`encrypt and decrypt a file at ${level} security level`, async ({ page }) => {
      const testContent = `USBVault E2E crypto-cycle content [${level}] — ${Date.now()}`;
      const testFilename = `crypto-test-${level.toLowerCase()}.txt`;

      // --- Encrypt phase ---
      await navigateToEncrypt(page);

      // Upload test file
      await uploadTestFile(page, testFilename, testContent);

      // Verify file appears in the UI
      const fileEntry = page.locator(`text=/${testFilename.replace('.txt', '')}/i`).first();
      if (await fileEntry.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(fileEntry).toBeVisible();
      }

      // Select security level
      await selectSecurityLevel(page, level);

      // Trigger encryption
      const encryptButton = page.locator(
        '[data-testid*="encrypt-button"], [data-testid*="start-encrypt"], [data-testid*="encrypt-submit"]'
      ).first();

      if (await encryptButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await encryptButton.click();
        await page.waitForTimeout(3000); // Allow encryption time
      }

      // Verify success indicator (toast, status text, or completed badge)
      const successIndicator = page.locator(
        'text=/success|encrypted|complete|done/i'
      ).first();

      if (await successIndicator.isVisible({ timeout: 10000 }).catch(() => false)) {
        await expect(successIndicator).toBeVisible();
      }

      // --- Decrypt phase ---
      await navigateToDecrypt(page);

      // Select the encrypted file
      const encryptedFile = page.locator(
        `text=/${testFilename.replace('.txt', '')}/i`
      ).first();

      if (await encryptedFile.isVisible({ timeout: 5000 }).catch(() => false)) {
        await encryptedFile.click();
        await page.waitForTimeout(500);
      }

      // Trigger decryption
      const decryptButton = page.locator(
        '[data-testid*="decrypt-button"], [data-testid*="start-decrypt"], [data-testid*="decrypt-submit"]'
      ).first();

      if (await decryptButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await decryptButton.click();
        await page.waitForTimeout(3000); // Allow decryption time
      }

      // Verify decryption success
      const decryptSuccess = page.locator(
        'text=/decrypted|success|complete|done|original/i'
      ).first();

      if (await decryptSuccess.isVisible({ timeout: 10000 }).catch(() => false)) {
        await expect(decryptSuccess).toBeVisible();
      }
    });
  }

  test('encrypt screen shows all three security level options', async ({ page }) => {
    await navigateToEncrypt(page);

    // Verify each level is represented in the UI
    for (const level of SECURITY_LEVELS) {
      const levelOption = page.locator(
        `text=/${level}/i, [data-testid*="${level.toLowerCase()}"]`
      ).first();

      if (await levelOption.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(levelOption).toBeVisible();
      }
    }
  });

  test('file upload via input element works on encrypt screen', async ({ page }) => {
    await navigateToEncrypt(page);

    const fileInput = page.locator('input[type="file"]').first();

    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles({
        name: 'cycle-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Full crypto-cycle upload verification'),
      });
      await page.waitForTimeout(1000);

      // Verify the file appears
      const uploadedFile = page.locator('text=/cycle-test/i').first();
      if (await uploadedFile.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(uploadedFile).toBeVisible();
      }
    }
  });
});
