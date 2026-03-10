// PH4-FIX: Moved from services/indexCrypto.ts to crypto domain as barrel
/**
 * USBVault Vault Index Encryption Service
 *
 * SG-003: Encrypts file metadata (names, sizes, types, timestamps) client-side
 * before storage, eliminating plaintext metadata leakage. The server and local
 * storage only ever see opaque encrypted blobs — never file names or structure.
 *
 * Architecture:
 *   FileInfo[] → JSON serialize → AEAD encrypt (XChaCha20-Poly1305) → opaque blob
 *   opaque blob → AEAD decrypt → JSON deserialize → FileInfo[]
 *
 * Key derivation matches the Rust crypto core:
 *   HKDF-SHA256(master_key, "vault_index_encryption") → 32-byte index key
 *
 * @module services/indexCrypto
 */

import { encryptVaultIndex, decryptVaultIndex } from '@/crypto/bridge';
import type { StoredFileInfo } from '@/types/domain';
import { logger } from '@/utils/logger';

/**
 * Encrypt an array of file metadata entries into an opaque blob.
 * The resulting blob contains no readable file names, sizes, or types.
 *
 * @param masterKey - 32-byte master encryption key (from vault unlock)
 * @param files - Array of file metadata entries to encrypt
 * @returns Base64-encoded encrypted blob, or null if encryption fails
 */
export async function encryptFileIndex(
  masterKey: Uint8Array,
  files: StoredFileInfo[]
): Promise<string | null> {
  try {
    if (files.length === 0) {
      // Empty index — store a sentinel so we know it's intentionally empty vs missing
      return '';
    }

    // Serialize to JSON, stripping the encryptedBlob field (stored separately in IDB)
    const sanitized = files.map(({ ...entry }) => {
      // Remove any transient fields that shouldn't be in the encrypted index
      delete (entry as Record<string, unknown>)['encryptedBlob'];
      return entry;
    });

    const json = JSON.stringify(sanitized);
    const jsonBytes = new TextEncoder().encode(json);

    const encrypted = await encryptVaultIndex(masterKey, jsonBytes);

    // Encode as base64 for safe storage in IndexedDB/localStorage
    return Buffer.from(encrypted).toString('base64');
  } catch (error) {
    logger.error('[indexCrypto] Failed to encrypt file index:', error);
    return null;
  }
}

/**
 * Decrypt an encrypted file index blob back into an array of file metadata.
 *
 * @param masterKey - 32-byte master encryption key (same key used for encryption)
 * @param encryptedBase64 - Base64-encoded encrypted blob from encryptFileIndex()
 * @returns Array of decrypted file metadata entries, or null if decryption fails
 */
export async function decryptFileIndex(
  masterKey: Uint8Array,
  encryptedBase64: string
): Promise<StoredFileInfo[] | null> {
  try {
    if (!encryptedBase64 || encryptedBase64 === '') {
      // Empty sentinel — return empty array
      return [];
    }

    const encrypted = Buffer.from(encryptedBase64, 'base64');
    const jsonBytes = await decryptVaultIndex(masterKey, new Uint8Array(encrypted));

    const json = new TextDecoder().decode(jsonBytes);
    const files: StoredFileInfo[] = JSON.parse(json);

    return files;
  } catch (error) {
    logger.error('[indexCrypto] Failed to decrypt file index:', error);
    return null;
  }
}

/**
 * Check whether an index blob is encrypted (base64 of binary data)
 * vs plaintext JSON (starts with '[' or '{').
 * Used during migration from plaintext to encrypted storage.
 *
 * @param data - Raw string from storage
 * @returns true if the data appears to be an encrypted base64 blob
 */
export function isEncryptedIndex(data: string): boolean {
  if (!data || data === '') return false;
  // Plaintext JSON always starts with [ or {
  const trimmed = data.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return false;
  // Base64 of encrypted data will not start with JSON characters
  return true;
}
