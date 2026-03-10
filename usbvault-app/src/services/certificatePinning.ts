/**
 * PH4-FIX: Certificate pinning service.
 * TODO: Implement certificate pinning for API connections.
 */

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

const _pins: CertificatePin[] = [
  {
    hostname: 'api.usbvault.io',
    sha256Pins: ['TODO-REPLACE-WITH-PRODUCTION-PIN-1', 'TODO-REPLACE-WITH-PRODUCTION-PIN-2'],
    includeSubdomains: true,
  },
  {
    hostname: 'auth.usbvault.io',
    sha256Pins: ['TODO-REPLACE-WITH-PRODUCTION-PIN-3'],
    includeSubdomains: false,
  },
];

// Runtime additions (from updatePinsForHostname)
const _runtimePins: Map<string, CertificatePin> = new Map();

/**
 * The built-in certificate pins array.
 */
export const CERTIFICATE_PINS: CertificatePin[] = _pins;

// ── Functions ──

export function configurePinning(_configs: PinConfig[]): void {
  // Stub — not yet implemented
}

export function validatePin(_hostname: string, _certificate: ArrayBuffer): boolean {
  return true;
}

/**
 * Check if pins are properly configured (not placeholder/TODO values).
 */
export function arePinsConfigured(): boolean {
  const allPins = [...CERTIFICATE_PINS, ..._runtimePins.values()];
  if (allPins.length === 0) return false;

  for (const pin of allPins) {
    for (const sha of pin.sha256Pins) {
      if (sha.includes('TODO') || sha.startsWith('AAAA')) {
        console.warn('Certificate pinning: placeholder pin detected');
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
      pin.hostname === hostname ||
      (pin.includeSubdomains && hostname.endsWith('.' + pin.hostname));

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
      errors.push(`No pins configured for ${pin.hostname}`);
    }
    for (const sha of pin.sha256Pins) {
      if (sha.includes('TODO') || sha.startsWith('AAAA')) {
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
    console.error('Certificate pins not properly configured');
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
  const exact = CERTIFICATE_PINS.find((p) => p.hostname === hostname);
  if (exact) return exact;

  // Check subdomain match
  const subdomain = CERTIFICATE_PINS.find(
    (p) => p.includeSubdomains && hostname.endsWith('.' + p.hostname),
  );
  return subdomain;
}

/**
 * Update or add pins for a hostname at runtime.
 */
export function updatePinsForHostname(
  hostname: string,
  update: Partial<Omit<CertificatePin, 'hostname'>>,
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
  console.log(`Updated certificate pins for ${hostname}`);
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
    console.warn(
      'Certificate pinning: configuration has errors',
      validationResult.errors,
    );
  } else {
    console.log('Certificate pinning initialized successfully');
  }

  return {
    initialized: true,
    validationResult,
  };
}
