#!/usr/bin/env node
/**
 * F8 TLS-pinning footgun guard (CI).
 *
 * Native certificate pinning is FAIL-CLOSED: an ACTIVE pin-set whose pins do not
 * match the presented certificate chain rejects EVERY TLS handshake. The F8
 * scaffold therefore ships with placeholder pins (AAAA…= / BBBB…=) kept disabled
 * (iOS: behind the `_F8_NSPinnedDomains_DISABLED` key in app.json; Android: the
 * `<pin-set>` is XML-commented). See usbvault-app/PINNING.md.
 *
 * This guard fails the build if the native pinning config is ENABLED while still
 * containing placeholder pins — the one mistake that would brick all HTTPS to
 * api.usbvault.io. A correctly disabled scaffold passes; a correctly enabled
 * config with real SPKI pins passes. Only "enabled + placeholder" fails.
 *
 * Usage: node scripts/check-pin-placeholders.mjs [appDir]   (appDir defaults to ..)
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const APP_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..');

const errors = [];

// A placeholder pin is a single base64 character repeated (e.g. "AAAA…A=",
// "BBBB…B="). Real SPKI SHA-256 pins are 32 random bytes → 44-char base64 with
// high entropy, so they never match. The ≥16-repeat floor avoids false hits.
const isPlaceholderPin = (s) =>
  typeof s === 'string' && /^([A-Za-z0-9+/])\1{15,}=*$/.test(s.trim());

// ---- iOS: app.json ------------------------------------------------------
// Fail if an ACTIVE "NSPinnedDomains" key (NOT the "_F8_…_DISABLED" scaffold)
// contains any placeholder pin. The disabled scaffold key is ignored by name.
const appJsonPath = join(APP_DIR, 'app.json');
if (existsSync(appJsonPath)) {
  let appJson;
  try {
    appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  } catch (e) {
    errors.push(`app.json: could not be parsed as JSON (${e.message})`);
  }
  const collectStrings = (node, out) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach((n) => collectStrings(n, out));
    else if (node && typeof node === 'object')
      Object.values(node).forEach((n) => collectStrings(n, out));
  };
  const walk = (node, path) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'NSPinnedDomains') {
        const pins = [];
        collectStrings(value, pins);
        const bad = pins.filter(isPlaceholderPin);
        if (bad.length) {
          errors.push(
            `app.json: ACTIVE "NSPinnedDomains" (at ${path}) contains ${bad.length} placeholder pin(s) — ` +
              `this would brick iOS TLS. Replace with real SPKI pins (see PINNING.md) or keep the scaffold ` +
              `under "_F8_NSPinnedDomains_DISABLED".`,
          );
        }
      }
      walk(value, `${path}.${key}`);
    }
  };
  if (appJson) walk(appJson, '$');
}

// ---- Android: network_security_config.xml (source + prebuild copy) ------
// Fail if an UNCOMMENTED <pin-set> contains a placeholder <pin>. Comments are
// stripped first so the disabled (commented) scaffold passes.
const nscFiles = [
  'native/android/app/src/main/res/xml/network_security_config.xml',
  'android/app/src/main/res/xml/network_security_config.xml',
];
for (const rel of nscFiles) {
  const p = join(APP_DIR, rel);
  if (!existsSync(p)) continue;
  const uncommented = readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  if (/<pin-set[\s>]/.test(uncommented)) {
    const pins = [...uncommented.matchAll(/<pin\b[^>]*>([^<]*)<\/pin>/g)].map((m) => m[1]);
    const bad = pins.filter(isPlaceholderPin);
    if (bad.length) {
      errors.push(
        `${rel}: ACTIVE <pin-set> contains ${bad.length} placeholder pin(s) — this would brick ` +
          `Android TLS. Replace with real SPKI pins (see PINNING.md) or keep the <pin-set> commented out.`,
      );
    }
  }
}

if (errors.length) {
  console.error('✖ TLS pin placeholder guard FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  console.error(
    '\nNative pinning is fail-closed. Never enable a pin-set with placeholder values. See usbvault-app/PINNING.md.',
  );
  process.exit(1);
}

console.log('✓ TLS pin placeholder guard passed: no enabled-with-placeholder pinning config.');
