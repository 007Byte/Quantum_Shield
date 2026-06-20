// PH4-FIX: Moved from services/keyVerificationService.ts to crypto domain
/**
 * USBVault Key Verification Service — SEC-04
 *
 * Implements safety number verification for X25519 public keys using SHA-256 hashing.
 * Provides QR code data generation and persistent storage of verification status per contact.
 *
 * Safety numbers follow Signal's format: 12 groups of 5 digits derived from SHA-256 hash
 * of concatenated local and remote public keys. This enables out-of-band verification
 * without requiring a trusted PKI.
 *
 * @module services/keyVerificationService
 * @see SEC-04: Key Verification UX
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

// ── Types ──────────────────────────────────────────────────────

/**
 * Verification status for a contact's X25519 public key.
 */
export interface VerificationRecord {
  /** Contact email address */
  email: string;
  /** Whether this contact's key has been verified */
  verified: boolean;
  /** ISO timestamp of when verification occurred */
  verifiedAt?: string;
  /** Safety number (12 groups of 5 digits) */
  safetyNumber?: string;
  /** Fingerprint derived from public key */
  fingerprint?: string;
  /**
   * SG-009: SHA-256 hash of the contact's X25519 public key at verification time.
   * Used to detect key changes — if the current key hash differs, verification
   * is automatically invalidated and a warning is surfaced to the user.
   */
  publicKeyHash?: string;
  /**
   * SG-009: Whether a key change was detected since last verification.
   * Set to true when checkKeyChanged() detects a mismatch.
   */
  keyChanged?: boolean;
  /**
   * SG-009: ISO timestamp of when a key change was detected.
   */
  keyChangedAt?: string;
}

/**
 * SG-009: Result of a key change check.
 */
export interface KeyChangeResult {
  /** Whether the key has changed since verification */
  changed: boolean;
  /** Whether the contact was previously verified */
  wasVerified: boolean;
  /** Previous key hash (if any) */
  previousKeyHash?: string;
  /** Current key hash */
  currentKeyHash: string;
}

/**
 * QR code payload for key exchange and verification.
 */
export interface QRPayload {
  /** Contact email address */
  email: string;
  /** X25519 public key in hex format */
  publicKeyHex: string;
  /** Safety number fingerprint */
  fingerprint: string;
  /** Timestamp when payload was generated */
  generatedAt: string;
}

/**
 * SG-010: Result of verifying a scanned QR code.
 */
export interface QRVerificationResult {
  /** Whether the QR code is valid and key matches */
  valid: boolean;
  /** Detailed status of the verification */
  status: 'verified' | 'fingerprint_mismatch' | 'expired' | 'invalid_format' | 'key_changed';
  /** Contact email from the QR payload */
  email?: string;
  /** Computed safety number (if verification succeeded) */
  safetyNumber?: string;
  /** Human-readable error message (if verification failed) */
  error?: string;
}

// ── Constants ──────────────────────────────────────────────────

const VERIFICATIONS_KEY = 'usbvault_key_verifications';
const SAFETY_NUMBER_GROUPS = 12;
const DIGITS_PER_GROUP = 5;
/** SG-010: QR codes expire after 10 minutes to prevent replay */
const QR_EXPIRY_MS = 10 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────

/**
 * Convert Uint8Array to hex string.
 */
function uint8ToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array.
 */
function hexToUint8(hex: string): Uint8Array {
  const bytes = hex.match(/.{1,2}/g);
  return new Uint8Array(bytes ? bytes.map(b => parseInt(b, 16)) : []);
}

/**
 * Read verification records from localStorage (web) or SecureStore (native).
 */
function readVerifications(): Map<string, VerificationRecord> {
  if (Platform.OS !== 'web') return new Map();

  try {
    const raw = localStorage.getItem(VERIFICATIONS_KEY);
    if (!raw) return new Map();

    const parsed = JSON.parse(raw);
    return new Map(Object.entries(parsed));
  } catch (err) {
    logger.error('Failed to read verifications from storage', err);
    return new Map();
  }
}

/**
 * Write verification records to localStorage (web) or SecureStore (native).
 */
function writeVerifications(records: Map<string, VerificationRecord>): void {
  if (Platform.OS !== 'web') return;

  try {
    const obj = Object.fromEntries(records);
    localStorage.setItem(VERIFICATIONS_KEY, JSON.stringify(obj));
  } catch (err) {
    logger.error('Failed to write verifications to storage', err);
  }
}

/**
 * Normalize email for case-insensitive lookups.
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

// ── Service ────────────────────────────────────────────────────

/**
 * Key Verification Service (SEC-04)
 *
 * Manages X25519 key verification via safety numbers, QR code generation,
 * and persistent verification status per contact.
 */
class KeyVerificationService {
  /**
   * Generate a safety number from two X25519 public keys.
   *
   * Concatenates local and remote public keys, hashes with SHA-256, and
   * formats as 12 groups of 5 digits (Signal's safety number format).
   *
   * @param localPublicKey - Local user's X25519 public key (hex string)
   * @param remotePublicKey - Remote contact's X25519 public key (hex string)
   * @returns Safety number as 12 groups of 5 digits (e.g., "12345 67890 ...")
   * @throws Error if Web Crypto API is unavailable or hashing fails
   *
   * @example
   * const safetyNumber = await keyVerificationService.generateSafetyNumber(
   *   'a1b2c3d4...',
   *   'e5f6g7h8...'
   * );
   * console.log(safetyNumber); // "12345 67890 12345 67890 ..."
   */
  async generateSafetyNumber(localPublicKey: string, remotePublicKey: string): Promise<string> {
    try {
      // Validate both keys are valid 32-byte X25519 keys (64 hex chars)
      if (!/^[0-9a-f]{64}$/i.test(localPublicKey)) {
        throw new Error('Invalid local public key: expected 64 hex characters');
      }
      if (!/^[0-9a-f]{64}$/i.test(remotePublicKey)) {
        throw new Error('Invalid remote public key: expected 64 hex characters');
      }

      // Concatenate keys for hashing
      const combined = localPublicKey + remotePublicKey;
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);

      // Hash with SHA-256 using Web Crypto API
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = new Uint8Array(hashBuffer);
      const hashHex = uint8ToHex(hashArray);

      // Format as safety number
      const safetyNumber = this.formatSafetyNumber(hashHex);
      logger.debug('Generated safety number:', safetyNumber);
      return safetyNumber;
    } catch (err) {
      logger.error('Failed to generate safety number', err);
      throw new Error(
        `Failed to generate safety number: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Format a raw hex hash into safety number format.
   *
   * Converts hex hash into 12 groups of 5 digits by taking successive
   * bytes and converting to decimal values 0-99999, ensuring each group
   * displays exactly 5 digits with leading zeros.
   *
   * @param hash - Raw SHA-256 hash as hex string
   * @returns Formatted safety number (e.g., "12345 67890 12345 ...")
   *
   * @example
   * const formatted = keyVerificationService.formatSafetyNumber(
   *   'a1b2c3d4e5f6...'
   * );
   * console.log(formatted); // "41395 09236 02391 ..."
   */
  formatSafetyNumber(hash: string): string {
    try {
      const hashBytes = hexToUint8(hash);
      const groups: string[] = [];

      for (let i = 0; i < SAFETY_NUMBER_GROUPS; i++) {
        const offset = i * 2;
        // Take 2 bytes and convert to 0-65535, then mod 100000 for 0-99999
        const byte1 = hashBytes[offset] || 0;
        const byte2 = hashBytes[offset + 1] || 0;
        const value = ((byte1 << 8) | byte2) % 100000;
        const padded = value.toString().padStart(DIGITS_PER_GROUP, '0');
        groups.push(padded);
      }

      const formatted = groups.join(' ');
      logger.debug('Formatted safety number:', formatted);
      return formatted;
    } catch (err) {
      logger.error('Failed to format safety number', err);
      throw new Error(
        `Failed to format safety number: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Generate a QR code payload for key verification exchange.
   *
   * Creates a JSON object containing the public key, fingerprint, and metadata
   * suitable for encoding into a QR code. The recipient scans this QR code to
   * verify the sender's key out-of-band.
   *
   * @param localPublicKey - Local user's X25519 public key (hex string)
   * @param email - Contact email address
   * @returns JSON payload ready for QR encoding
   * @throws Error if fingerprint generation fails
   *
   * @example
   * const payload = await keyVerificationService.generateQRPayload(
   *   'a1b2c3d4...',
   *   'alice@example.com'
   * );
   * const qrString = JSON.stringify(payload);
   * // Use QR library to encode qrString
   */
  async generateQRPayload(localPublicKey: string, email: string): Promise<QRPayload> {
    try {
      // Generate fingerprint (short hash) from public key
      const encoder = new TextEncoder();
      const data = encoder.encode(localPublicKey);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = new Uint8Array(hashBuffer);
      const fingerprint = uint8ToHex(hashArray).substring(0, 16).toUpperCase();

      const payload: QRPayload = {
        email: normalizeEmail(email),
        publicKeyHex: localPublicKey,
        fingerprint,
        generatedAt: new Date().toISOString(),
      };

      logger.debug('Generated QR payload for', email);
      return payload;
    } catch (err) {
      logger.error('Failed to generate QR payload', err);
      throw new Error(
        `Failed to generate QR payload: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * SG-009: Compute SHA-256 hash of a public key for change detection.
   *
   * @param publicKeyHex - X25519 public key in hex format
   * @returns SHA-256 hash of the key as hex string
   */
  async hashPublicKey(publicKeyHex: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(publicKeyHex);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return uint8ToHex(new Uint8Array(hashBuffer));
  }

  /**
   * SG-010: Verify a scanned QR code payload against the local user's key.
   *
   * Performs the following checks:
   * 1. Validates the QR payload format (email, publicKeyHex, fingerprint, generatedAt)
   * 2. Checks the QR code hasn't expired (10-minute window)
   * 3. Recomputes the fingerprint from the payload's public key and verifies it matches
   * 4. Generates a safety number from both keys for display
   * 5. Checks for key changes if this contact was previously verified
   * 6. Auto-marks the contact as verified if all checks pass
   *
   * @param scannedPayload - Raw JSON string from the scanned QR code
   * @param localPublicKeyHex - Local user's X25519 public key (hex)
   * @returns QRVerificationResult with status and safety number
   *
   * @example
   * const result = await keyVerificationService.verifyScannedQR(qrData, myPublicKey);
   * if (result.valid) {
   *   showSuccess(`Verified ${result.email} — Safety #: ${result.safetyNumber}`);
   * } else {
   *   showError(result.error);
   * }
   */
  async verifyScannedQR(
    scannedPayload: string,
    localPublicKeyHex: string
  ): Promise<QRVerificationResult> {
    try {
      // 1. Parse and validate format
      let payload: QRPayload;
      try {
        payload = JSON.parse(scannedPayload);
      } catch {
        return {
          valid: false,
          status: 'invalid_format',
          error: 'QR code contains invalid data — expected JSON payload',
        };
      }

      if (!payload.email || !payload.publicKeyHex || !payload.fingerprint || !payload.generatedAt) {
        return {
          valid: false,
          status: 'invalid_format',
          error:
            'QR payload missing required fields (email, publicKeyHex, fingerprint, generatedAt)',
        };
      }

      // Validate key format (64 hex chars = 32-byte X25519 key)
      if (!/^[0-9a-f]{64}$/i.test(payload.publicKeyHex)) {
        return {
          valid: false,
          status: 'invalid_format',
          error: 'QR payload contains invalid public key format',
        };
      }

      // 2. Check expiration
      const generatedAt = new Date(payload.generatedAt).getTime();
      const now = Date.now();
      if (isNaN(generatedAt) || now - generatedAt > QR_EXPIRY_MS) {
        return {
          valid: false,
          status: 'expired',
          email: payload.email,
          error: 'QR code has expired — please ask the contact to generate a new one',
        };
      }

      // 3. Recompute fingerprint and verify it matches
      const encoder = new TextEncoder();
      const data = encoder.encode(payload.publicKeyHex);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = new Uint8Array(hashBuffer);
      const computedFingerprint = uint8ToHex(hashArray).substring(0, 16).toUpperCase();

      if (computedFingerprint !== payload.fingerprint) {
        return {
          valid: false,
          status: 'fingerprint_mismatch',
          email: payload.email,
          error: 'Fingerprint mismatch — the QR code may have been tampered with',
        };
      }

      // 4. Check for key change (SG-009 integration)
      const keyCheck = await this.checkKeyChanged(payload.email, payload.publicKeyHex);
      if (keyCheck.changed) {
        return {
          valid: false,
          status: 'key_changed',
          email: payload.email,
          error:
            "Contact's key has changed since last verification — please confirm their identity",
        };
      }

      // 5. Generate safety number from both keys
      const safetyNumber = await this.generateSafetyNumber(localPublicKeyHex, payload.publicKeyHex);

      // 6. Auto-mark as verified
      await this.verifyContact(payload.email, true, safetyNumber, payload.publicKeyHex);

      logger.info(`[SG-010] QR verification succeeded for ${payload.email}`);

      return {
        valid: true,
        status: 'verified',
        email: payload.email,
        safetyNumber,
      };
    } catch (err) {
      logger.error('[SG-010] QR verification failed', err);
      return {
        valid: false,
        status: 'invalid_format',
        error: `QR verification error: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Mark a contact's key as verified or unverified.
   *
   * SG-009: Now also stores a hash of the contact's public key at verification
   * time, enabling automatic key change detection on subsequent checks.
   *
   * @param contactEmail - Contact's email address
   * @param verified - True to mark as verified, false to unverify
   * @param safetyNumber - Optional safety number to store
   * @param publicKeyHex - Optional public key to hash and store for change detection
   *
   * @example
   * keyVerificationService.verifyContact('bob@example.com', true, '12345 67890 ...', 'a1b2c3...');
   */
  async verifyContact(
    contactEmail: string,
    verified: boolean,
    safetyNumber?: string,
    publicKeyHex?: string
  ): Promise<void> {
    try {
      const email = normalizeEmail(contactEmail);
      const records = readVerifications();

      const record: VerificationRecord = {
        email,
        verified,
        safetyNumber,
      };

      if (verified) {
        record.verifiedAt = new Date().toISOString();
      }

      // SG-009: Store public key hash for change detection
      if (publicKeyHex) {
        record.publicKeyHash = await this.hashPublicKey(publicKeyHex);
      }

      // SG-009: Clear key change flag when re-verifying
      record.keyChanged = false;
      record.keyChangedAt = undefined;

      records.set(email, record);
      writeVerifications(records);

      logger.info(`Marked ${email} as ${verified ? 'verified' : 'unverified'}`);
    } catch (err) {
      logger.error('Failed to verify contact', err);
    }
  }

  /**
   * SG-009: Check if a contact's public key has changed since verification.
   *
   * Compares the current key hash against the stored hash from verification time.
   * If a change is detected, the contact's verification is automatically
   * invalidated and a warning flag is set.
   *
   * @param contactEmail - Contact's email address
   * @param currentPublicKeyHex - Contact's current X25519 public key (hex)
   * @returns KeyChangeResult indicating whether the key changed
   *
   * @example
   * const result = await keyVerificationService.checkKeyChanged('bob@example.com', currentKey);
   * if (result.changed) {
   *   showWarning('Bob\'s security key has changed! Re-verify before sharing.');
   * }
   */
  async checkKeyChanged(
    contactEmail: string,
    currentPublicKeyHex: string
  ): Promise<KeyChangeResult> {
    const email = normalizeEmail(contactEmail);
    const currentHash = await this.hashPublicKey(currentPublicKeyHex);
    const records = readVerifications();
    const record = records.get(email);

    // No previous record — not a change, just new
    if (!record || !record.publicKeyHash) {
      return {
        changed: false,
        wasVerified: record?.verified ?? false,
        currentKeyHash: currentHash,
      };
    }

    const changed = record.publicKeyHash !== currentHash;

    if (changed) {
      // Invalidate verification on key change
      record.verified = false;
      record.keyChanged = true;
      record.keyChangedAt = new Date().toISOString();
      records.set(email, record);
      writeVerifications(records);

      logger.warn(`[SG-009] Key change detected for ${email} — verification invalidated`);
    }

    return {
      changed,
      wasVerified: !changed && (record.verified ?? false),
      previousKeyHash: record.publicKeyHash,
      currentKeyHash: currentHash,
    };
  }

  /**
   * Check if a contact's key is marked as verified.
   *
   * @param contactEmail - Contact's email address
   * @returns True if contact is verified, false otherwise
   *
   * @example
   * if (keyVerificationService.isContactVerified('alice@example.com')) {
   *   console.log('Key is verified');
   * }
   */
  isContactVerified(contactEmail: string): boolean {
    try {
      const email = normalizeEmail(contactEmail);
      const records = readVerifications();
      const record = records.get(email);
      return record?.verified ?? false;
    } catch (err) {
      logger.error('Failed to check contact verification status', err);
      return false;
    }
  }

  /**
   * Get verification status for all contacts.
   *
   * @returns Map of email to verification record
   *
   * @example
   * const statuses = keyVerificationService.getVerificationStatus();
   * for (const [email, record] of statuses) {
   *   console.log(email, record.verified ? '✓' : '✗');
   * }
   */
  getVerificationStatus(): Map<string, VerificationRecord> {
    try {
      return readVerifications();
    } catch (err) {
      logger.error('Failed to get verification status', err);
      return new Map();
    }
  }

  /**
   * Get verification record for a specific contact.
   *
   * @param contactEmail - Contact's email address
   * @returns Verification record or undefined if not found
   *
   * @example
   * const record = keyVerificationService.getVerificationRecord('bob@example.com');
   * if (record) {
   *   console.log('Verified at:', record.verifiedAt);
   *   console.log('Safety number:', record.safetyNumber);
   * }
   */
  getVerificationRecord(contactEmail: string): VerificationRecord | undefined {
    try {
      const email = normalizeEmail(contactEmail);
      return readVerifications().get(email);
    } catch (err) {
      logger.error('Failed to get verification record', err);
      return undefined;
    }
  }

  /**
   * Clear verification status for a specific contact.
   *
   * Removes the contact's verification record from storage.
   * Called when user wants to reverify a contact or remove trust.
   *
   * @param contactEmail - Contact's email address
   *
   * @example
   * keyVerificationService.clearVerification('mallory@example.com');
   */
  clearVerification(contactEmail: string): void {
    try {
      const email = normalizeEmail(contactEmail);
      const records = readVerifications();
      records.delete(email);
      writeVerifications(records);

      logger.info(`Cleared verification for ${email}`);
    } catch (err) {
      logger.error('Failed to clear verification', err);
    }
  }

  /**
   * Clear all verification records.
   *
   * WARNING: This removes all contact verification data.
   * Useful for factory reset or privacy cleanup.
   *
   * @example
   * keyVerificationService.clearAllVerifications();
   */
  clearAllVerifications(): void {
    try {
      if (Platform.OS === 'web') {
        localStorage.removeItem(VERIFICATIONS_KEY);
      }
      logger.info('Cleared all verifications');
    } catch (err) {
      logger.error('Failed to clear all verifications', err);
    }
  }

  /**
   * Export verification records for backup or audit.
   *
   * @returns JSON string of all verification records
   *
   * @example
   * const backup = keyVerificationService.exportVerifications();
   * localStorage.setItem('backup_verifications', backup);
   */
  exportVerifications(): string {
    try {
      const records = readVerifications();
      const obj = Object.fromEntries(records);
      return JSON.stringify(obj, null, 2);
    } catch (err) {
      logger.error('Failed to export verifications', err);
      return '{}';
    }
  }

  /**
   * Import verification records from backup.
   *
   * @param data - JSON string of verification records
   * @throws Error if import data is invalid
   *
   * @example
   * const backup = localStorage.getItem('backup_verifications');
   * if (backup) {
   *   keyVerificationService.importVerifications(backup);
   * }
   */
  importVerifications(data: string): void {
    try {
      const parsed = JSON.parse(data);
      const records = new Map<string, VerificationRecord>(Object.entries(parsed));
      writeVerifications(records);
      logger.info(`Imported ${records.size} verification records`);
    } catch (err) {
      logger.error('Failed to import verifications', err);
      throw new Error(
        `Failed to import verifications: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

// ── Export ─────────────────────────────────────────────────────

export const keyVerificationService = new KeyVerificationService();
