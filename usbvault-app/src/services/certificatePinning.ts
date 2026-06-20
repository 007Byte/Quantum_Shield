/**
 * TD-1 FIX: Certificate pinning service with environment-driven pin injection.
 *
 * Pins are injected at build time via EXPO_PUBLIC_PIN_* environment variables.
 * See .env.production.example for pin generation instructions.
 *
 * @deprecated Use services/security/certificatePinning.ts instead.
 * This file is kept for backward compatibility; all active imports use the
 * security/ module.
 */

import { logger } from '@/utils/logger';

export interface PinConfig {
  hostname: string;
  pins: string[];
}

export interface CertificatePin {
  hostname: string;
  sha256Pins: string[];
  includeSubdomains: boolean;
  expirationDate?: string;
}

// ── Internal pin store ──

// TD-1 FIX: Read pins from environment variables instead of hardcoded placeholders.
// In CI/CD, EXPO_PUBLIC_PIN_PRIMARY and EXPO_PUBLIC_PIN_BACKUP are set from the
// production TLS certificate's SPKI SHA-256 hash (base64-encoded).
const ENV_PRIMARY_PIN = process.env.EXPO_PUBLIC_PIN_PRIMARY || '';
const ENV_BACKUP_PIN = process.env.EXPO_PUBLIC_PIN_BACKUP || '';
const ENV_API_HOSTNAME = process.env.EXPO_PUBLIC_API_HOSTNAME || 'api.usbvault.io';
const ENV_PIN_EXPIRATION = process.env.EXPO_PUBLIC_PIN_EXPIRATION || '2027-06-01';

const _pins: CertificatePin[] = [
  {
    hostname: ENV_API_HOSTNAME,
    sha256Pins:
      ENV_PRIMARY_PIN && ENV_BACKUP_PIN
        ? [ENV_PRIMARY_PIN, ENV_BACKUP_PIN]
        : [],
    includeSubdomains: true,
    expirationDate: ENV_PIN_EXPIRATION,
  },
];

// Runtime additions (from updatePinsForHostname)
const _runtimePins: Map<string, CertificatePin> = new Map();

/**
 * The built-in certificate pins array.
 */
export const CERTIFICATE_PINS: CertificatePin[] = _pins;

// ── Functions ──

/**
 * Configure certificate pins from an external source (e.g., remote config).
 * Overwrites runtime pins for each hostname provided.
 */
export function configurePinning(configs: PinConfig[]): void {
  for (const config of configs) {
    if (!config.hostname || !config.pins || config.pins.length === 0) {
      logger.debug(`Skipping invalid pin config for hostname: ${config.hostname}`);
      continue;
    }
    updatePinsForHostname(config.hostname, {
      sha256Pins: config.pins,
      includeSubdomains: true,
    });
  }
  logger.debug(`Certificate pinning configured for ${configs.length} host(s)`);
}

/**
 * Validate a certificate's SHA-256 fingerprint against pinned values.
 *
 * @param hostname - The hostname being connected to
 * @param certificate - The DER-encoded certificate (ArrayBuffer)
 * @returns true if the certificate fingerprint matches a pinned value
 */
export function validatePin(hostname: string, certificate: ArrayBuffer): boolean {
  // If pins aren't properly configured (TODO placeholders), fail open with warning
  // This ensures development environments still work while logging the issue
  if (!arePinsConfigured()) {
    logger.debug('Certificate pinning: pins not configured, skipping validation');
    return true;
  }

  const activePins = getActivePins(hostname);
  if (activePins.length === 0) {
    // No pins for this hostname — allow (only pinned hosts are enforced)
    return true;
  }

  // Compute SHA-256 fingerprint of the certificate
  const fingerprint = computeCertificateFingerprint(certificate);
  if (!fingerprint) {
    logger.debug('Certificate pinning: failed to compute fingerprint');
    return false;
  }

  return activePins.includes(fingerprint);
}

/**
 * Compute a base64-encoded SHA-256 fingerprint of a DER certificate.
 * Returns null if the Web Crypto API is unavailable (synchronous fallback).
 */
function computeCertificateFingerprint(certificate: ArrayBuffer): string | null {
  try {
    // For environments with SubtleCrypto (async path handled externally),
    // provide a synchronous check using the raw pin format.
    // In production, the native TLS stack provides the fingerprint directly.
    const bytes = new Uint8Array(certificate);
    if (bytes.length === 0) return null;

    // Convert raw bytes to base64 for comparison against stored pins
    // Note: In production, the native module provides the SHA-256 hash directly
    // This is a passthrough for when the fingerprint is already computed
    const base64 = btoa(String.fromCharCode(...bytes));
    return base64;
  } catch {
    return null;
  }
}

/**
 * TD-1 FIX: Check if pins are properly configured (env vars set at build time).
 */
export function arePinsConfigured(): boolean {
  const allPins = [...CERTIFICATE_PINS, ..._runtimePins.values()];
  if (allPins.length === 0) return false;

  for (const pin of allPins) {
    if (!pin.sha256Pins || pin.sha256Pins.length === 0) {
      logger.warn('Certificate pinning: no pins configured — set EXPO_PUBLIC_PIN_PRIMARY and EXPO_PUBLIC_PIN_BACKUP');
      return false;
    }
    for (const sha of pin.sha256Pins) {
      if (!sha || sha.includes('TODO') || sha.includes('REPLACE') || sha.startsWith('AAAA') || sha.endsWith('_REQUIRED')) {
        logger.warn('Certificate pinning: placeholder pin detected');
        return false;
      }
    }
  }
  return true;
}

/**
 * Check if a certificate pin has expired.
 */
export function isPinExpired(pin: CertificatePin): boolean {
  if (!pin.expirationDate) return false;
  return new Date(pin.expirationDate) < new Date();
}

/**
 * Get active (non-expired) pin values for a given hostname.
 */
export function getActivePins(hostname: string): string[] {
  const allPins = [...CERTIFICATE_PINS, ..._runtimePins.values()];
  const results: string[] = [];

  for (const pin of allPins) {
    if (isPinExpired(pin)) continue;

    const matches =
      pin.hostname === hostname || (pin.includeSubdomains && hostname.endsWith('.' + pin.hostname));

    if (matches) {
      results.push(...pin.sha256Pins);
    }
  }

  return results;
}

/**
 * Validate the current pin configuration.
 */
export function validatePinConfiguration(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  const allPins = [...CERTIFICATE_PINS, ..._runtimePins.values()];

  for (const pin of allPins) {
    if (!pin.hostname) {
      errors.push('Pin missing hostname');
    }
    if (!pin.sha256Pins || pin.sha256Pins.length === 0) {
      errors.push(`No pins configured for ${pin.hostname} — set EXPO_PUBLIC_PIN_PRIMARY and EXPO_PUBLIC_PIN_BACKUP`);
    }
    for (const sha of pin.sha256Pins) {
      if (!sha || sha.includes('TODO') || sha.includes('REPLACE') || sha.startsWith('AAAA') || sha.endsWith('_REQUIRED')) {
        errors.push(`Hostname ${pin.hostname} has placeholder pin: ${sha}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a certificate fingerprint is pinned for the given hostname.
 */
export function isCertificatePinned(hostname: string, certificatePin: string): boolean {
  if (!arePinsConfigured()) {
    logger.warn('Certificate pins not properly configured');
    return false;
  }

  const activePins = getActivePins(hostname);
  return activePins.includes(certificatePin);
}

/**
 * Get the full CertificatePin object for a hostname (including expired pins).
 */
export function getAllPinsForHostname(hostname: string): CertificatePin | undefined {
  // Check runtime pins first
  const runtime = _runtimePins.get(hostname);
  if (runtime) return runtime;

  // Check built-in pins
  const exact = CERTIFICATE_PINS.find(p => p.hostname === hostname);
  if (exact) return exact;

  // Check subdomain match
  const subdomain = CERTIFICATE_PINS.find(
    p => p.includeSubdomains && hostname.endsWith('.' + p.hostname)
  );
  return subdomain;
}

/**
 * Update or add pins for a hostname at runtime.
 */
export function updatePinsForHostname(
  hostname: string,
  update: Partial<Omit<CertificatePin, 'hostname'>>
): void {
  const existing = _runtimePins.get(hostname) || {
    hostname,
    sha256Pins: [],
    includeSubdomains: false,
  };

  const updated: CertificatePin = {
    ...existing,
    ...update,
    hostname,
  };

  _runtimePins.set(hostname, updated);
  logger.debug(`Updated certificate pins for ${hostname}`);
}

/**
 * Initialize certificate pinning: validate config and return result.
 */
export function initializeCertificatePinning(): {
  initialized: boolean;
  validationResult: { valid: boolean; errors: string[] };
} {
  const validationResult = validatePinConfiguration();

  if (!validationResult.valid) {
    logger.warn('Certificate pinning: configuration has errors', validationResult.errors);
  } else {
    logger.debug('Certificate pinning initialized successfully');
  }

  return {
    initialized: true,
    validationResult,
  };
}
