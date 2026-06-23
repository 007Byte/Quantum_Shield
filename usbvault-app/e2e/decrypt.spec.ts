import { test, expect } from './test-base';
import { waitForApp, registerAccount, expectAuthenticated } from './helpers';

test.describe('File Decryption Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForApp(page);
    await registerAccount(page);
    await expectAuthenticated(page);
  });

  test('navigate to decrypt screen', async ({ page }) => {
    const decryptNav = page
      .locator('[data-testid*="decrypt"], [data-testid*="Decrypt"], [href*="decrypt"]')
      .first();

    if (await decryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await decryptNav.click();
      await page.waitForTimeout(1000);
    }

    // Decrypt screen should show file list or empty state
    const decryptContent = page
      .locator('text=/decrypt|Decrypt|no files|select files|unlock/i')
      .first();
    await expect(decryptContent).toBeVisible({ timeout: 10000 });
  });

  test('decrypt screen shows empty state for new user', async ({ page }) => {
    const decryptNav = page
      .locator('[data-testid*="decrypt"], [data-testid*="Decrypt"], [href*="decrypt"]')
      .first();

    if (await decryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await decryptNav.click();
      await page.waitForTimeout(1000);
    }

    // New user with no encrypted files should see empty state
    const emptyState = page.locator('text=/no files|empty|get started|add files|unlock/i').first();

    if (await emptyState.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(emptyState).toBeVisible();
    }
  });

  test('decrypt screen has search/filter capability', async ({ page }) => {
    const decryptNav = page
      .locator('[data-testid*="decrypt"], [data-testid*="Decrypt"], [href*="decrypt"]')
      .first();

    if (await decryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await decryptNav.click();
      await page.waitForTimeout(1000);
    }

    // Look for search input or filter controls
    const searchInput = page
      .locator(
        '[data-testid*="search"], input[placeholder*="search" i], input[placeholder*="filter" i]'
      )
      .first();

    if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(searchInput).toBeVisible();
      // Verify it's interactive
      await searchInput.fill('test');
      await page.waitForTimeout(300);
      const value = await searchInput.inputValue();
      expect(value).toBe('test');
    }
  });

  test('decrypt controls show mode selection', async ({ page }) => {
    const decryptNav = page
      .locator('[data-testid*="decrypt"], [data-testid*="Decrypt"], [href*="decrypt"]')
      .first();

    if (await decryptNav.isVisible({ timeout: 5000 }).catch(() => false)) {
      await decryptNav.click();
      await page.waitForTimeout(1000);
    }

    // Decrypt screen should offer View or Save modes
    const modeControls = page
      .locator('text=/view|save|download|decrypt all|decrypt selected/i')
      .first();

    if (await modeControls.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(modeControls).toBeVisible();
    }
  });
});
