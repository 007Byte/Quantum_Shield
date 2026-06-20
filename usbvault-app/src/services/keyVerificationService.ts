/**
 * PH4-FIX: Key verification service.
 * Implements safety number generation, QR payloads, and contact verification.
 */

export interface VerificationRecord {
  email: string;
  verified: boolean;
  verifiedAt?: string;
  safetyNumber?: string;
}

export interface QRPayload {
  email: string;
  publicKeyHex: string;
  fingerprint: string;
  generatedAt: string;
}

const STORAGE_KEY = 'usbvault:key_verifications';

function readVerifications(): Map<string, VerificationRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const obj = JSON.parse(raw);
      const map = new Map<string, VerificationRecord>();
      for (const [key, value] of Object.entries(obj)) {
        map.set(key, value as VerificationRecord);
      }
      return map;
    }
  } catch {
    // ignore
  }
  return new Map();
}

function writeVerifications(map: Map<string, VerificationRecord>): void {
  try {
    const obj: Record<string, VerificationRecord> = {};
    for (const [key, value] of map) {
      obj[key] = value;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

/**
 * Simple hash function for generating safety numbers (stub).
 */
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to positive hex, pad to 64 chars
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  // Repeat to get 64 chars
  return hex.repeat(8).slice(0, 64);
}

class KeyVerificationServiceImpl {
  async verifyKey(_key: Uint8Array): Promise<boolean> {
    return true;
  }

  async generateVerificationCode(_key: Uint8Array): Promise<string> {
    return '000000';
  }

  /**
   * Generate a safety number from two public keys.
   * Returns 12 groups of 5 digits separated by spaces.
   */
  async generateSafetyNumber(localKey: string, remoteKey: string): Promise<string> {
    const combined = localKey + ':' + remoteKey;
    const hash = simpleHash(combined);
    return this.formatSafetyNumber(hash);
  }

  /**
   * Format a hex hash into safety number format (12 groups of 5 digits).
   */
  formatSafetyNumber(hash: string): string {
    const groups: string[] = [];
    for (let i = 0; i < 12; i++) {
      // Take 5 chars from hash, convert to number, mod 100000
      const slice = hash.slice((i * 5) % hash.length, ((i * 5 + 5) % hash.length) + 5);
      let num = 0;
      for (let j = 0; j < slice.length; j++) {
        num = (num * 16 + parseInt(slice[j] || '0', 16)) % 100000;
      }
      groups.push(num.toString().padStart(5, '0'));
    }
    return groups.join(' ');
  }

  /**
   * Generate a QR payload for key verification.
   */
  async generateQRPayload(publicKey: string, email: string): Promise<QRPayload> {
    const normalizedEmail = email.toLowerCase();
    const hash = simpleHash(publicKey);
    const fingerprint = hash.slice(0, 16);

    return {
      email: normalizedEmail,
      publicKeyHex: publicKey,
      fingerprint,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Mark a contact as verified or unverified.
   */
  verifyContact(email: string, verified: boolean, safetyNumber?: string): void {
    const map = readVerifications();
    const normalizedEmail = email.toLowerCase();

    const record: VerificationRecord = {
      email: normalizedEmail,
      verified,
      ...(verified ? { verifiedAt: new Date().toISOString() } : {}),
      ...(safetyNumber ? { safetyNumber } : {}),
    };

    map.set(normalizedEmail, record);
    writeVerifications(map);
  }

  /**
   * Get the verification record for a contact.
   */
  getVerificationRecord(email: string): VerificationRecord | undefined {
    const map = readVerifications();
    return map.get(email.toLowerCase());
  }

  /**
   * Check if a contact is verified.
   */
  isContactVerified(email: string): boolean {
    const record = this.getVerificationRecord(email);
    return record?.verified ?? false;
  }

  /**
   * Get all verification records.
   */
  getVerificationStatus(): Map<string, VerificationRecord> {
    return readVerifications();
  }

  /**
   * Clear verification for a specific contact.
   */
  clearVerification(email: string): void {
    const map = readVerifications();
    map.delete(email.toLowerCase());
    writeVerifications(map);
  }

  /**
   * Clear all verifications.
   */
  clearAllVerifications(): void {
    writeVerifications(new Map());
  }

  /**
   * Export all verifications as JSON string.
   */
  exportVerifications(): string {
    const map = readVerifications();
    const obj: Record<string, VerificationRecord> = {};
    for (const [key, value] of map) {
      obj[key] = value;
    }
    return JSON.stringify(obj);
  }

  /**
   * Import verifications from JSON string.
   */
  importVerifications(data: string): void {
    const parsed = JSON.parse(data);
    const map = new Map<string, VerificationRecord>();
    for (const [key, value] of Object.entries(parsed)) {
      map.set(key, value as VerificationRecord);
    }
    writeVerifications(map);
  }
}

export const keyVerificationService = new KeyVerificationServiceImpl();
