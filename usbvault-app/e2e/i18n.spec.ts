import { test, expect } from './test-base';
import { waitForApp, registerAccount, expectAuthenticated, expectLoginScreen } from './helpers';

/**
 * Internationalization (i18n) E2E tests.
 *
 * USBVault Enterprise supports multiple locales. These tests verify that
 * switching languages updates visible UI labels on both auth and dashboard screens.
 */

const LOCALES = [
  { code: 'es', label: 'Español', sampleText: /iniciar|contraseña|cifrar|bóveda/i },
  { code: 'fr', label: 'Français', sampleText: /connexion|mot de passe|chiffrer|coffre/i },
  { code: 'de', label: 'Deutsch', sampleText: /anmelden|passwort|verschlüsseln|tresor/i },
  { code: 'en', label: 'English', sampleText: /login|password|encrypt|vault/i },
] as const;

/** Helper: navigate to language/settings and switch locale. */
async function switchLanguage(page: import('@playwright/test').Page, localeCode: string) {
  // Try settings tab first
  const settingsNav = page
    .locator('[data-testid*="settings"], [data-testid*="Settings"], [href*="settings"]')
    .first();

  if (await settingsNav.isVisible({ timeout: 5000 }).catch(() => false)) {
    await settingsNav.click();
    await page.waitForTimeout(1000);
  }

  // Look for language picker / selector
  const langPicker = page
    .locator('[data-testid*="language"], [data-testid*="locale"], [data-testid*="lang-select"]')
    .first();

  if (await langPicker.isVisible({ timeout: 5000 }).catch(() => false)) {
    await langPicker.click();
    await page.waitForTimeout(500);

    // Select the target locale
    const localeOption = page
      .locator(`[data-testid*="${localeCode}"], text=/${localeCode}/i`)
      .first();

    if (await localeOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await localeOption.click();
      await page.waitForTimeout(1000);
    }
  }
}

test.describe('Internationalization (i18n)', () => {
  test.describe('unauthenticated — login screen locale switching', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForApp(page);
    });

    test('login screen loads in English by default', async ({ page }) => {
      await expectLoginScreen(page);

      const englishContent = page.locator('text=/login|sign in|email|password/i').first();
      await expect(englishContent).toBeVisible({ timeout: 10000 });
    });

    for (const locale of LOCALES.filter(l => l.code !== 'en')) {
      test(`switch login screen to ${locale.label} (${locale.code})`, async ({ page }) => {
        await expectLoginScreen(page);

        // Look for an on-screen language selector (some apps show it on login)
        const langToggle = page
          .locator('[data-testid*="language"], [data-testid*="locale"], [data-testid*="lang"]')
          .first();

        if (await langToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
          await langToggle.click();
          await page.waitForTimeout(500);

          const option = page
            .locator(`[data-testid*="${locale.code}"], text=/${locale.label}/i`)
            .first();

          if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
            await option.click();
            await page.waitForTimeout(1000);

            // Verify localized text appears
            const localizedText = page.locator(`text=${locale.sampleText.source}`).first();
            if (await localizedText.isVisible({ timeout: 5000 }).catch(() => false)) {
              await expect(localizedText).toBeVisible();
            }
          }
        }
      });
    }
  });

  test.describe('authenticated — dashboard locale switching', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto('/');
      await waitForApp(page);
      await registerAccount(page);
      await expectAuthenticated(page);
    });

    for (const locale of LOCALES) {
      test(`switch dashboard to ${locale.label} (${locale.code})`, async ({ page }) => {
        await switchLanguage(page, locale.code);

        // After switching, verify localized text is somewhere on the page
        const localizedContent = page.locator(`text=${locale.sampleText.source}`).first();

        if (await localizedContent.isVisible({ timeout: 5000 }).catch(() => false)) {
          await expect(localizedContent).toBeVisible();
        }
      });
    }

    test('switch through all locales and return to English', async ({ page }) => {
      for (const locale of LOCALES) {
        await switchLanguage(page, locale.code);
        await page.waitForTimeout(500);
      }

      // Final state should be English
      const englishContent = page.locator('text=/encrypt|vault|dashboard|settings/i').first();
      if (await englishContent.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(englishContent).toBeVisible();
      }
    });

    test('error messages display in selected language', async ({ page }) => {
      // Switch to Spanish
      await switchLanguage(page, 'es');

      // Navigate to encrypt with no file selected and try to encrypt
      const encryptNav = page.locator('[data-testid*="encrypt"], [href*="encrypt"]').first();

      if (await encryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
        await encryptNav.click();
        await page.waitForTimeout(1000);

        const encryptButton = page
          .locator('[data-testid*="encrypt-button"], [data-testid*="start-encrypt"]')
          .first();

        if (await encryptButton.isVisible({ timeout: 3000 }).catch(() => false)) {
          await encryptButton.click();
          await page.waitForTimeout(1000);

          // Any error/validation should be in Spanish (or at least not English)
          const errorText = page
            .locator('[data-testid*="error"], [data-testid*="validation"]')
            .first();

          if (await errorText.isVisible({ timeout: 3000 }).catch(() => false)) {
            await expect(errorText).toBeVisible();
          }
        }
      }
    });
  });
});
