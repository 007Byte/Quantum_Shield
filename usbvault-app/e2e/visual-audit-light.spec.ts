/**
 * Visual Audit — Light Mode — captures screenshots for review.
 * Toggles to light mode via localStorage before capturing.
 * Run: npx playwright test e2e/visual-audit-light.spec.ts --project=chromium
 */

import { test } from '@playwright/test';
import path from 'path';

const AUDIT_DIR = path.join(__dirname, '..', 'screenshots', 'audit-light');

const SCREENS = [
  { name: '01-dashboard', path: '/dashboard' },
  { name: '02-encrypt-store', path: '/encrypt-store' },
  { name: '03-decrypt-export', path: '/decrypt-export' },
  { name: '04-vault-manager', path: '/vault-manager' },
  { name: '05-settings', path: '/settings' },
  { name: '06-defense', path: '/defense' },
  { name: '07-zero-trace', path: '/zero-trace' },
  { name: '08-remove-file', path: '/remove-file' },
  { name: '09-premium', path: '/premium' },
  { name: '10-keys', path: '/keys' },
];

for (const screen of SCREENS) {
  test(`Audit Light: ${screen.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Set light mode before navigating
    await page.goto('/dashboard');
    await page.evaluate(() => {
      localStorage.setItem('usbvault:theme', 'light');
    });
    await page.goto(screen.path);
    await page.waitForTimeout(2500);
    await page.screenshot({
      path: path.join(AUDIT_DIR, `${screen.name}.png`),
      fullPage: false,
    });
  });
}
