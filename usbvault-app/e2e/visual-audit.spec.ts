/**
 * Visual Audit — captures screenshots of all key screens for review.
 * Run: npx playwright test e2e/visual-audit.spec.ts --project=chromium
 */

import { test } from '@playwright/test';
import path from 'path';

const AUDIT_DIR = path.join(__dirname, '..', 'screenshots', 'audit');

const SCREENS = [
  { name: '01-dashboard', path: '/dashboard' },
  { name: '02-encrypt-store', path: '/encrypt-store' },
  { name: '03-decrypt-export', path: '/decrypt-export' },
  { name: '04-vault-manager', path: '/vault-manager' },
  { name: '05-settings', path: '/settings' },
  { name: '06-defense', path: '/defense' },
  { name: '07-zero-trace', path: '/zero-trace' },
  { name: '08-remove-file', path: '/remove-file' },
  { name: '09-setup-usb', path: '/setup-usb' },
  { name: '10-keys', path: '/keys' },
  { name: '11-passwords', path: '/passwords' },
  { name: '12-premium', path: '/premium' },
];

for (const screen of SCREENS) {
  test(`Audit: ${screen.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(screen.path);
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(AUDIT_DIR, `${screen.name}.png`),
      fullPage: false,
    });
  });
}
