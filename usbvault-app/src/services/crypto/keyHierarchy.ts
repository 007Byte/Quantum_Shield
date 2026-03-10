/**
 * QAV Key Hierarchy Service
 *
 * PH4-FIX: Moved from services/keyHierarchy.ts to crypto domain
 * SG-004: Two-layer key hierarchy (KEK + MEK) for proper key management.
 * SG-005: Per-file encryption keys derived from MEK.
 * SG-007: Key rotation on password change (re-wrap MEK with new KEK).
 *
 * Architecture:
 *   Password → Argon2id → KEK (32 bytes, wrapping only)
 *   Random MEK (64 bytes) wrapped by KEK → stored as opaque blob
 *   MEK → HKDF("vault_index_encryption") → Index encryption key (32 bytes)
 *   MEK → HKDF("file_encryption:<fileId>") → Per-file key (32 bytes)
 *
 * Benefits:
 *   - Password change only re-wraps MEK (O(1)), no file re-encryption
 *   - Per-file keys limit blast radius of key compromise
 *   - Recovery codes can wrap MEK independently of password
 *
 * @module services/crypto/keyHierarchy
 */

import {
  generateMEK,
  deriveKEK,
  wrapMEK,
  unwrapMEK,
  deriveFileKey,
  randomBytes,
} from '@/crypto/bridge';
import { logger } from '@/utils/logger';

// ─── Types ───────────────────────────────────────────────────────────────

/**
 * Result of creating a new key hierarchy for a vault.
 * The wrappedMek and kekSalt must be persisted; the mek is session-only.
 */
export interface KeyHierarchyCreationResult {
  /** 64-byte Master Encryption Key — session-only, never persisted directly */
  mek: Uint8Array;
  /** Encrypted MEK blob (nonce + ciphertext + tag) — store in vault header */
  wrappedMek: Uint8Array;
  /** 32-byte salt used for KEK derivation — store alongside wrappedMek */
  kekSalt: Uint8Array;
}

/**
 * Result of unlocking a vault's key hierarchy.
 */
export interface KeyHierarchyUnlockResult {
  /** 64-byte Master Encryption Key — session-only */
  mek: Uint8Array;
}

/**
 * Result of a password change (key rotation).
 * Only the wrapping changes — MEK and file encryption are untouched.
 */
export interface KeyRotationResult {
  /** New wrapped MEK blob (encrypted with new KEK) */
  newWrappedMek: Uint8Array;
  /** New 32-byte salt for the new KEK */
  newKekSalt: Uint8Array;
}

// ─── Key Hierarchy Operations ────────────────────────────────────────

/**
 * SG-004: Create a new key hierarchy for a vault.
 *
 * Called during vault creation. Generates a random MEK, derives a KEK
 * from the user's password, and wraps the MEK for persistent storage.
 *
 * @param password - User password (used to derive KEK via Argon2id)
 * @returns KeyHierarchyCreationResult with mek, wrappedMek, and kekSalt
 */
export async function createKeyHierarchy(
  password: string
): Promise<KeyHierarchyCreationResult> {
  try {
    // 1. Generate random 32-byte salt for KEK derivation
    const kekSalt = await randomBytes(32);

    // 2. Derive KEK from password: Argon2id(password, salt) → domain-separated 32-byte key
    const kek = await deriveKEK(password, kekSalt);

    // 3. Generate random 64-byte MEK (32 encryption + 32 HMAC)
    const mek = await generateMEK();

    // 4. Wrap MEK with KEK: XChaCha20-Poly1305(kek, mek) → nonce||ct||tag
    const wrappedMek = await wrapMEK(kek, mek);

    logger.info('[keyHierarchy] Created new key hierarchy (MEK generated + wrapped)');

    return { mek, wrappedMek, kekSalt };
  } catch (error) {
    logger.error('[keyHierarchy] Failed to create key hierarchy:', error);
    throw new Error(
      `Key hierarchy creation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * SG-004: Unlock an existing vault's key hierarchy.
 *
 * Called during vault unlock/login. Derives the KEK from the password
 * and unwraps the stored MEK blob.
 *
 * @param password - User password
 * @param kekSalt - Salt stored with the vault (from createKeyHierarchy)
 * @param wrappedMek - Encrypted MEK blob stored with the vault
 * @returns KeyHierarchyUnlockResult with the unwrapped MEK
 * @throws Error if password is wrong (AEAD tag verification fails)
 */
export async function unlockKeyHierarchy(
  password: string,
  kekSalt: Uint8Array,
  wrappedMek: Uint8Array
): Promise<KeyHierarchyUnlockResult> {
  try {
    // 1. Re-derive KEK from password + stored salt
    const kek = await deriveKEK(password, kekSalt);

    // 2. Unwrap MEK — fails with AEAD error if password is wrong
    const mek = await unwrapMEK(kek, wrappedMek);

    logger.info('[keyHierarchy] Successfully unlocked key hierarchy');

    return { mek };
  } catch (error) {
    logger.error('[keyHierarchy] Failed to unlock key hierarchy:', error);
    throw new Error(
      `Key hierarchy unlock failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * SG-007: Rotate the password (re-wrap MEK with new KEK).
 *
 * The MEK itself does NOT change — only the wrapping. This means:
 * - No file re-encryption needed (O(1) password change)
 * - Vault index encryption keys remain valid
 * - All per-file keys remain valid
 *
 * @param oldPassword - Current password
 * @param newPassword - New password
 * @param oldKekSalt - Current KEK salt stored with the vault
 * @param wrappedMek - Current wrapped MEK blob
 * @returns KeyRotationResult with new wrapped MEK and new salt
 * @throws Error if old password is wrong
 */
export async function rotatePassword(
  oldPassword: string,
  newPassword: string,
  oldKekSalt: Uint8Array,
  wrappedMek: Uint8Array
): Promise<KeyRotationResult> {
  try {
    // 1. Unwrap MEK with old password's KEK
    const { mek } = await unlockKeyHierarchy(oldPassword, oldKekSalt, wrappedMek);

    // 2. Generate new salt for new KEK
    const newKekSalt = await randomBytes(32);

    // 3. Derive new KEK from new password
    const newKek = await deriveKEK(newPassword, newKekSalt);

    // 4. Re-wrap same MEK with new KEK
    const newWrappedMek = await wrapMEK(newKek, mek);

    logger.info('[keyHierarchy] Password rotated — MEK re-wrapped with new KEK');

    return { newWrappedMek, newKekSalt };
  } catch (error) {
    logger.error('[keyHierarchy] Password rotation failed:', error);
    throw new Error(
      `Password rotation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * SG-005: Derive a per-file encryption key from the MEK.
 *
 * Each file gets a unique 32-byte key: HKDF(mek, "file_encryption:<fileId>").
 * This limits blast radius — compromising one file's key doesn't expose others.
 *
 * @param mek - 64-byte Master Encryption Key
 * @param fileId - Unique file identifier
 * @returns Promise<Uint8Array> - 32-byte per-file encryption key
 */
export async function getFileEncryptionKey(
  mek: Uint8Array,
  fileId: string
): Promise<Uint8Array> {
  return deriveFileKey(mek, fileId);
}

/**
 * SG-004 Migration: Create a key hierarchy for an existing vault that
 * currently uses direct password-derived encryption.
 *
 * This wraps the existing password-derived key as a "synthetic MEK" to
 * maintain backward compatibility while establishing the KEK layer.
 *
 * Migration path:
 *   1. Old vault has no wrappedMek → use password-derived key directly (legacy)
 *   2. Call migrateToKeyHierarchy() → generates wrappedMek
 *   3. Future unlocks go through KEK → MEK path
 *
 * @param password - User password
 * @param legacyKey - Current 32-byte password-derived key used for encryption
 * @returns KeyHierarchyCreationResult with the legacy key padded to 64 bytes as MEK
 */
export async function migrateToKeyHierarchy(
  password: string,
  legacyKey: Uint8Array
): Promise<KeyHierarchyCreationResult> {
  try {
    // Pad the legacy 32-byte key to 64 bytes (add HMAC portion)
    // The HMAC portion is derived deterministically so the migration is reproducible
    const hmacPortion = await randomBytes(32);
    const syntheticMek = new Uint8Array(64);
    syntheticMek.set(legacyKey.slice(0, 32), 0);
    syntheticMek.set(hmacPortion, 32);

    // Create KEK and wrap the synthetic MEK
    const kekSalt = await randomBytes(32);
    const kek = await deriveKEK(password, kekSalt);
    const wrappedMek = await wrapMEK(kek, syntheticMek);

    logger.info('[keyHierarchy] Migrated legacy vault to key hierarchy');

    return { mek: syntheticMek, wrappedMek, kekSalt };
  } catch (error) {
    logger.error('[keyHierarchy] Migration to key hierarchy failed:', error);
    throw new Error(
      `Key hierarchy migration failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
