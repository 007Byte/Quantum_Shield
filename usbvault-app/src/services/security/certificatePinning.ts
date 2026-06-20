// PH4-FIX: Consolidated into security domain
/**
 * PH9-FIX: Certificate pinning configuration (CWE-295)
 *
 * This module provides certificate pinning configuration and validation helpers.
 * Note: TrustKit/native pinning requires native module integration.
 * This provides the pin configuration and validation helpers for HTTPS connections.
 *
 * In production, integrate with:
 * - iOS: Use NSPinningDelegate or TrustKit
 * - Android: Use TrustKit or network-security-config.xml (implemented separately)
 */

import { logger } from '@/utils/logger';

export interface CertificatePin {
  hostname: string;
  sha256Pins: string[]; // Base64-encoded SHA-256 of SubjectPublicKeyInfo
  includeSubdomains: boolean;
  expirationDate?: string;
}

/**
 * CRT-01 FIX: Production-ready certificate pinning configuration.
 *
 * Pin generation instructions:
 *   openssl s_client -connect api.usbvault.io:443 -servername api.usbvault.io < /dev/null 2>/dev/null \
 *     | openssl x509 -pubkey -noout \
 *     | openssl pkey -pubin -outform der \
 *     | openssl dgst -sha256 -binary \
 *     | base64
 *
 * Or use the extraction script: scripts/extract-pins.sh <hostname>
 *
 * Pin strategy:
 * - Primary pin: current leaf certificate SPKI hash
 * - Backup pin: intermediate CA SPKI hash (survives leaf rotation)
 * - Pins are injected at build time via EXPO_PUBLIC_PIN_* environment variables
 *
 * SECURITY: Placeholder detection is fail-closed. The app will not make HTTPS
 * requests until real pins are configured. This prevents shipping with no pinning.
 */

// Environment-injected pins (set during CI/CD build)
const ENV_PRIMARY_PIN = process.env.EXPO_PUBLIC_PIN_PRIMARY || '';
const ENV_BACKUP_PIN = process.env.EXPO_PUBLIC_PIN_BACKUP || '';
const ENV_API_HOSTNAME = process.env.EXPO_PUBLIC_API_HOSTNAME || 'api.usbvault.io';
const ENV_PIN_EXPIRATION = process.env.EXPO_PUBLIC_PIN_EXPIRATION || '2027-06-01';

export const CERTIFICATE_PINS: CertificatePin[] = [
  {
    hostname: ENV_API_HOSTNAME,
    sha256Pins:
      ENV_PRIMARY_PIN && ENV_BACKUP_PIN
        ? [ENV_PRIMARY_PIN, ENV_BACKUP_PIN]
        : [
            // Fallback: placeholder values that will be detected and rejected
            'sha256/PRODUCTION_PIN_REQUIRED',
            'sha256/PRODUCTION_BACKUP_PIN_REQUIRED',
          ],
    includeSubdomains: true,
    expirationDate: ENV_PIN_EXPIRATION,
  },
];

/**
 * arePinsConfigured - Check if certificate pins are properly configured for production.
 *
 * Validates that certificate pins are configured with actual pin values, not placeholders.
 * Returns false for TODO, REPLACE, or known placeholder patterns to ensure fail-closed security.
 *
 * @returns true if all pins are properly configured, false if placeholders detected
 *
 * @remarks
 * - Scans all configured pins for placeholder patterns
 * - Placeholder patterns: /^AAAA+/, /^BBBB+/, /^TODO/, /^REPLACE/
 * - CWE-295 mitigation: Prevents running with unconfigured pins
 * - Should be called before making HTTPS requests
 * - PH1-FIX: In development mode, allows unconfigured pins with warning
 * - In production, fails closed if pins are not configured
 */
export function arePinsConfigured(): boolean {
  if (!CERTIFICATE_PINS || CERTIFICATE_PINS.length === 0) {
    return false;
  }

  // Check for placeholder or TODO values
  const placeholderPatterns = [
    /^AAAA+=/, // Placeholder pattern
    /^BBBB+=/, // Placeholder pattern
    /^TODO/, // TODO marker
    /^REPLACE/, // REPLACE marker
    /_REQUIRED$/, // Placeholder format: *_REQUIRED
    /_PIN_REQUIRED$/, // Placeholder format: *_PIN_REQUIRED
  ];

  let hasPlaceholder = false;
  for (const pin of CERTIFICATE_PINS) {
    for (const pinValue of pin.sha256Pins) {
      for (const pattern of placeholderPatterns) {
        if (pattern.test(pinValue)) {
          hasPlaceholder = true;
          const isDevMode = __DEV__ || process.env.NODE_ENV === 'development';

          // PH1-FIX: Development bypass - log warning but don't fail
          if (isDevMode) {
            logger.warn(
              `Certificate pinning: placeholder pin detected in DEVELOPMENT mode: ${pinValue}`
            );
          } else {
            // Production: fail closed
            logger.error(`Certificate pinning: placeholder pin detected (PRODUCTION): ${pinValue}`);
            return false;
          }
        }
      }
    }
  }

  // In development mode with placeholders, warn but allow
  if (hasPlaceholder && (__DEV__ || process.env.NODE_ENV === 'development')) {
    logger.warn(
      'Certificate pinning: Running in DEVELOPMENT mode with placeholder pins. Configure real pins for production.'
    );
    return true; // Allow in dev mode
  }

  return !hasPlaceholder;
}

/**
 * validatePinConfiguration - Validate certificate pinning configuration for correctness.
 *
 * Performs comprehensive validation of pin configuration including:
 * - At least one pin per hostname
 * - Valid Base64-encoded pin values
 * - Non-expired pins (if expiration date specified)
 * - No placeholder or TODO values
 * - Proper hostname format
 *
 * @returns Object with validation result
 *   - valid: true if all pins are properly configured
 *   - errors: array of validation error messages
 *
 * @remarks
 * - Fail-closed in production: returns valid=false if any issue found
 * - Development mode allows placeholder pins with logging
 * - Each pin needs at least one SHA-256 hash
 * - Base64 encoding verified via decode/re-encode
 * - CWE-295 mitigation: Ensures pins are production-ready
 * - Should be called on app startup via initializeCertificatePinning
 * - PH1-FIX: Added development mode bypass
 */
export function validatePinConfiguration(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const isDevMode = __DEV__ || process.env.NODE_ENV === 'development';

  if (!CERTIFICATE_PINS || CERTIFICATE_PINS.length === 0) {
    const msg = 'No certificate pins configured';
    if (!isDevMode) {
      errors.push(msg);
      return { valid: false, errors };
    }
    logger.warn(`${msg} (DEVELOPMENT mode)`);
  }

  // SECURITY FIX: Check for placeholder pins
  // PH1-FIX: In development mode, warn but don't fail
  if (!arePinsConfigured()) {
    const msg = 'Certificate pins contain placeholder values';
    if (!isDevMode) {
      errors.push(`${msg} - not configured for production`);
      return { valid: false, errors };
    }
    logger.warn(`${msg} (DEVELOPMENT mode - configure real pins for production)`);
  }

  CERTIFICATE_PINS.forEach((pin, index) => {
    // Check hostname
    if (!pin.hostname || typeof pin.hostname !== 'string') {
      errors.push(`Pin ${index}: Invalid hostname`);
    }

    // Check pins array
    if (!Array.isArray(pin.sha256Pins) || pin.sha256Pins.length === 0) {
      errors.push(`Pin ${index} (${pin.hostname}): Must have at least one SHA-256 pin`);
    }

    // Validate Base64 encoding
    pin.sha256Pins.forEach((pinValue, pinIndex) => {
      if (!isValidBase64(pinValue)) {
        errors.push(`Pin ${index} (${pin.hostname}): Invalid Base64 encoding at pin ${pinIndex}`);
      }
    });

    // Check expiration
    if (pin.expirationDate && isPinExpired(pin)) {
      errors.push(`Pin ${index} (${pin.hostname}): Certificate pin has expired`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * PH9-FIX: Check if a certificate pin has expired.
 */
export function isPinExpired(pin: CertificatePin): boolean {
  if (!pin.expirationDate) {
    return false; // No expiration date specified
  }

  const expirationDate = new Date(pin.expirationDate);
  return new Date() > expirationDate;
}

/**
 * getActivePins - Retrieve non-expired certificate pins for a hostname.
 *
 * Finds pinning configuration for hostname (with subdomain matching support)
 * and returns only non-expired pins.
 *
 * @param hostname - The hostname to get pins for (e.g., 'api.usbvault.io')
 * @returns Array of active (non-expired) Base64-encoded SHA-256 pins
 *   - Empty array if hostname not found or all pins expired
 *
 * @remarks
 * - Supports subdomain matching via includeSubdomains flag
 * - Returns empty array for expired pins (fail-closed)
 * - Used for certificate validation during HTTPS connections
 */
export function getActivePins(hostname: string): string[] {
  const pin = CERTIFICATE_PINS.find(
    p => p.hostname === hostname || (p.includeSubdomains && hostname.endsWith('.' + p.hostname))
  );

  if (!pin) {
    return [];
  }

  // Filter out expired pins
  if (isPinExpired(pin)) {
    return [];
  }

  return pin.sha256Pins;
}

/**
 * isCertificatePinned - Verify if a certificate's pin matches configured pins for hostname.
 *
 * Checks if the provided certificate pin matches any active pin configuration for the hostname.
 * Fail-closed: returns false if pins not configured, preventing use of potentially bad certs.
 *
 * @param hostname - The hostname being accessed (e.g., 'api.usbvault.io')
 * @param certificatePin - Base64-encoded SHA-256 hash of certificate's SubjectPublicKeyInfo
 * @returns true only if pin matches and is active, false otherwise
 *
 * @remarks
 * - Fail-closed: returns false if pins not properly configured
 * - Reject connection if this returns false
 * - CWE-295 mitigation: Prevents man-in-the-middle HTTPS attacks
 * - Call during TLS certificate validation in axios interceptors
 *
 * @example
 * ```typescript
 * const valid = isCertificatePinned('api.usbvault.io', certificateSha256);
 * if (!valid) {
 *   throw new Error('Certificate validation failed');
 * }
 * ```
 */
export function isCertificatePinned(hostname: string, certificatePin: string): boolean {
  // SECURITY FIX: Fail-closed - return false if pins are not properly configured
  if (!arePinsConfigured()) {
    logger.error('Certificate pinning validation failed: pins not properly configured');
    return false;
  }

  const activePins = getActivePins(hostname);
  return activePins.includes(certificatePin);
}

/**
 * Helper: Validate Base64 string
 */
function isValidBase64(str: string): boolean {
  try {
    return Buffer.from(str, 'base64').toString('base64') === str;
  } catch {
    return false;
  }
}

/**
 * PH9-FIX: Get all pins for a hostname (including expired ones).
 * Useful for debugging and pin rotation.
 */
export function getAllPinsForHostname(hostname: string): CertificatePin | undefined {
  return CERTIFICATE_PINS.find(
    p => p.hostname === hostname || (p.includeSubdomains && hostname.endsWith('.' + p.hostname))
  );
}

/**
 * updatePinsForHostname - Update or add certificate pins for a hostname.
 *
 * Updates existing pin configuration or adds new hostname if not present.
 * Used during certificate rotation procedures or when pins need updating.
 *
 * @param hostname - Hostname to update pins for
 * @param newPins - Partial pin configuration with updated values
 *   - sha256Pins: new array of Base64-encoded pins
 *   - expirationDate: new expiration date
 *   - includeSubdomains: whether to apply to subdomains
 *
 * @remarks
 * - Modifies in-memory configuration only
 * - For persistent storage, integrate with backend config service
 * - Call this during pin rotation workflows
 * - Validates pins should be called after update
 * - CWE-295 mitigation: Enables pin rotation for expired certs
 */
export function updatePinsForHostname(hostname: string, newPins: Partial<CertificatePin>): void {
  const pinIndex = CERTIFICATE_PINS.findIndex(p => p.hostname === hostname);

  if (pinIndex === -1) {
    // Add new pin configuration
    CERTIFICATE_PINS.push({
      hostname,
      sha256Pins: newPins.sha256Pins || [],
      includeSubdomains: newPins.includeSubdomains ?? false,
      expirationDate: newPins.expirationDate,
    });
  } else {
    // Update existing pin configuration
    CERTIFICATE_PINS[pinIndex] = {
      ...CERTIFICATE_PINS[pinIndex],
      ...newPins,
    };
  }

  logger.log(`Updated certificate pins for hostname: ${hostname}`);
}

/**
 * initializeCertificatePinning - Initialize certificate pinning on app startup.
 *
 * Validates pin configuration during app initialization. Should be called early in app
 * startup before making any API requests. Logs warnings if pins are not properly configured.
 *
 * @returns Object containing:
 *   - initialized: true if validation succeeded, false if pins invalid
 *   - validationResult: detailed validation errors and status
 *
 * @remarks
 * - Call in app root component's useEffect during initialization
 * - Fail-closed: logs warning and returns initialized=false if pins invalid
 * - Prevents app from using unconfigured certificate pins
 * - CWE-295 mitigation: Ensures pins validated before HTTPS requests
 *
 * @example
 * ```typescript
 * useEffect(() => {
 *   const result = initializeCertificatePinning();
 *   if (!result.initialized) {
 *     logger.error('Certificate pinning not ready');
 *   }
 * }, []);
 * ```
 */
export function initializeCertificatePinning(): {
  initialized: boolean;
  validationResult: { valid: boolean; errors: string[] };
} {
  const validationResult = validatePinConfiguration();

  if (validationResult.valid) {
    logger.log('Certificate pinning initialized successfully');
  } else {
    logger.warn('Certificate pinning validation failed:', validationResult.errors);
  }

  return {
    initialized: validationResult.valid,
    validationResult,
  };
}
