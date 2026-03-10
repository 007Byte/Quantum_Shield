// PH4-FIX: Moved to vault domain
'use strict';

/**
 * FEAT-02: BIP39 Recovery Phrase System
 *
 * Implements BIP39 24-word mnemonic generation, seed derivation, and encrypted
 * master key management. Provides recovery flow for restoring access and optional
 * trusted contact escrow functionality.
 *
 * Security Features:
 * - 256-bit entropy (24-word mnemonic)
 * - PBKDF2 key derivation (2048 iterations)
 * - AES-256-GCM encryption for master key
 * - SHA-256 hashing for phrase verification (never stores plaintext)
 * - Web Crypto API for all cryptographic operations
 * - Secure storage with never storing mnemonic directly
 */

import { BIP39_ENGLISH_WORDLIST } from './bip39Wordlist';
import { logger } from '@/utils/logger';

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface TrustedContact {
  email: string;
  createdAt: string;
}

interface EncryptedBlob {
  iv: string;
  ciphertext: string;
  tag: string;
  salt: string;
}

const STORAGE_KEYS = {
  RECOVERY_PHRASE_HASH: 'qav_recovery_phrase_hash',
  ENCRYPTED_MASTER_KEY: 'qav_encrypted_master_key',
  ESCROW_CONTACT: 'qav_escrow_contact',
};

const BIP39_CONFIG = {
  WORD_COUNT: 24,
  ENTROPY_BITS: 256,
  PBKDF2_ITERATIONS: 2048,
  PBKDF2_HASH: 'SHA-256',
  ENCRYPTION_ALGORITHM: 'AES-GCM',
  KEY_LENGTH: 256,
  IV_LENGTH: 12,
  TAG_LENGTH: 128,
  SALT: 'mnemonic',
};

/**
 * RecoveryPhraseService
 *
 * Manages BIP39 recovery phrases and encrypted key storage.
 * All cryptographic operations use Web Crypto API for maximum compatibility.
 */
class RecoveryPhraseService {
  private wordlistSet: Set<string>;

  constructor() {
    this.wordlistSet = new Set(BIP39_ENGLISH_WORDLIST);
    logger.info('[FEAT-02] RecoveryPhraseService initialized');
  }

  /**
   * Generate a 24-word BIP39 mnemonic using 256 bits of entropy.
   *
   * FEAT-02: Mnemonic generation during onboarding
   *
   * @returns {string[]} Array of 24 random words from BIP39 wordlist
   */
  async generateMnemonic(): Promise<string[]> {
    try {
      const entropyBytes = BIP39_CONFIG.ENTROPY_BITS / 8;
      const entropy = new Uint8Array(entropyBytes);
      crypto.getRandomValues(entropy);

      // Calculate checksum: SHA-256 of entropy, use first ENT/32 bits
      const hashBuffer = await crypto.subtle.digest('SHA-256', entropy);
      const checksumBits = BIP39_CONFIG.ENTROPY_BITS / 32;
      const checksumBytes = Math.ceil(checksumBits / 8);
      const checksumBuffer = new Uint8Array(hashBuffer).slice(0, checksumBytes);

      // Combine entropy and checksum bits
      const combined = this.combineBitsToBytes(entropy, checksumBuffer, checksumBits);

      // Convert to mnemonic words (11 bits per word)
      const mnemonic: string[] = [];
      for (let i = 0; i < BIP39_CONFIG.WORD_COUNT; i++) {
        const wordIndex = this.extractBits(combined, i * 11, 11);
        mnemonic.push(BIP39_ENGLISH_WORDLIST[wordIndex]);
      }

      logger.info('[FEAT-02] Generated 24-word mnemonic');
      return mnemonic;
    } catch (error) {
      logger.error('[FEAT-02] Mnemonic generation failed', error);
      throw new Error(`Failed to generate mnemonic: ${error}`);
    }
  }

  /**
   * Convert BIP39 mnemonic to seed using PBKDF2.
   *
   * FEAT-02: Seed derivation for key encryption
   *
   * @param {string[]} mnemonic - Array of mnemonic words
   * @param {string} [passphrase] - Optional BIP39 passphrase (empty string if not provided)
   * @returns {Promise<ArrayBuffer>} 512-bit seed buffer
   */
  async mnemonicToSeed(mnemonic: string[], passphrase: string = ''): Promise<ArrayBuffer> {
    try {
      // Validate mnemonic first
      const validation = await this.validateMnemonic(mnemonic);
      if (!validation.valid) {
        throw new Error(`Invalid mnemonic: ${validation.errors.join(', ')}`);
      }

      const mnemonicString = mnemonic.join(' ');
      const saltString = BIP39_CONFIG.SALT + passphrase;

      // Encode strings to UTF-8
      const mnemonicBuffer = new TextEncoder().encode(mnemonicString);
      const saltBuffer = new TextEncoder().encode(saltString);

      // Import key for PBKDF2
      const key = await crypto.subtle.importKey(
        'raw',
        mnemonicBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      // Derive 512-bit seed
      const seed = await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt: saltBuffer,
          iterations: BIP39_CONFIG.PBKDF2_ITERATIONS,
        },
        key,
        512
      );

      logger.info('[FEAT-02] Derived seed from mnemonic using PBKDF2');
      return seed;
    } catch (error) {
      logger.error('[FEAT-02] Seed derivation failed', error);
      throw new Error(`Failed to derive seed: ${error}`);
    }
  }

  /**
   * Encrypt master key using derived key from mnemonic.
   *
   * FEAT-02: Encrypt master key with recovery phrase
   *
   * @param {ArrayBuffer} masterKey - The master key to encrypt
   * @param {string[]} mnemonic - BIP39 mnemonic for key derivation
   * @param {string} [passphrase] - Optional BIP39 passphrase
   * @returns {Promise<string>} Base64-encoded encrypted blob
   */
  async encryptMasterKey(
    masterKey: ArrayBuffer,
    mnemonic: string[],
    passphrase: string = ''
  ): Promise<string> {
    try {
      // Generate random IV
      const iv = crypto.getRandomValues(new Uint8Array(BIP39_CONFIG.IV_LENGTH));

      // Derive seed from mnemonic
      const seed = await this.mnemonicToSeed(mnemonic, passphrase);

      // Derive encryption key from seed (first 256 bits)
      const encryptionKey = await crypto.subtle.importKey(
        'raw',
        seed.slice(0, 32),
        { name: 'AES-GCM' },
        false,
        ['encrypt']
      );

      // Encrypt master key
      const encryptedData = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        encryptionKey,
        masterKey
      );

      // Separate ciphertext and tag (last 16 bytes are tag)
      const ciphertextWithTag = new Uint8Array(encryptedData);
      const ciphertext = ciphertextWithTag.slice(0, ciphertextWithTag.length - 16);
      const tag = ciphertextWithTag.slice(ciphertextWithTag.length - 16);

      // Create encrypted blob
      const blob: EncryptedBlob = {
        iv: this.toBase64(iv.buffer),
        ciphertext: this.toBase64(ciphertext.buffer),
        tag: this.toBase64(tag.buffer),
        salt: BIP39_CONFIG.SALT,
      };

      const encryptedBlob = JSON.stringify(blob);
      logger.info('[FEAT-02] Encrypted master key using mnemonic-derived key');
      return encryptedBlob;
    } catch (error) {
      logger.error('[FEAT-02] Master key encryption failed', error);
      throw new Error(`Failed to encrypt master key: ${error}`);
    }
  }

  /**
   * Decrypt master key using mnemonic.
   *
   * FEAT-02: Decrypt master key for recovery
   *
   * @param {string} encryptedBlob - Base64-encoded encrypted blob
   * @param {string[]} mnemonic - BIP39 mnemonic
   * @param {string} [passphrase] - Optional BIP39 passphrase
   * @returns {Promise<ArrayBuffer>} Decrypted master key
   */
  async decryptMasterKey(
    encryptedBlob: string,
    mnemonic: string[],
    passphrase: string = ''
  ): Promise<ArrayBuffer> {
    try {
      const blob: EncryptedBlob = JSON.parse(encryptedBlob);

      // Decode components
      const iv = this.fromBase64(blob.iv);
      const ciphertext = this.fromBase64(blob.ciphertext);
      const tag = this.fromBase64(blob.tag);

      // Reconstruct encrypted data (ciphertext + tag)
      const ciphertextArray = new Uint8Array(ciphertext);
      const tagArray = new Uint8Array(tag);
      const encryptedData = new Uint8Array(ciphertextArray.length + tagArray.length);
      encryptedData.set(ciphertextArray, 0);
      encryptedData.set(tagArray, ciphertextArray.length);

      // Derive seed from mnemonic
      const seed = await this.mnemonicToSeed(mnemonic, passphrase);

      // Derive decryption key
      const decryptionKey = await crypto.subtle.importKey(
        'raw',
        seed.slice(0, 32),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      // Decrypt
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(iv),
        },
        decryptionKey,
        encryptedData
      );

      logger.info('[FEAT-02] Decrypted master key successfully');
      return decrypted;
    } catch (error) {
      logger.error('[FEAT-02] Master key decryption failed', error);
      throw new Error(`Failed to decrypt master key: ${error}`);
    }
  }

  /**
   * Validate BIP39 mnemonic.
   *
   * Checks:
   * - Word count (must be 24 for this implementation)
   * - All words in BIP39 wordlist
   * - Valid checksum (last 8 bits)
   *
   * @param {string[]} words - Array of words to validate
   * @returns {ValidationResult} Validation result with errors if invalid
   */
  async validateMnemonic(words: string[]): Promise<ValidationResult> {
    const errors: string[] = [];

    // Check word count
    if (words.length !== BIP39_CONFIG.WORD_COUNT) {
      errors.push(`Expected ${BIP39_CONFIG.WORD_COUNT} words, got ${words.length}`);
    }

    // Check all words are in wordlist
    for (let i = 0; i < words.length; i++) {
      if (!this.wordlistSet.has(words[i])) {
        errors.push(`Word "${words[i]}" at position ${i} not in BIP39 wordlist`);
      }
    }

    // Validate checksum
    if (words.length === BIP39_CONFIG.WORD_COUNT && errors.length === 0) {
      if (!(await this.validateChecksum(words))) {
        errors.push('Invalid mnemonic checksum');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Store SHA-256 hash of recovery phrase.
   *
   * FEAT-02: Phrase storage for verification
   * Never stores the mnemonic plaintext, only its hash.
   *
   * @param {string[]} mnemonic - The mnemonic phrase
   */
  async storePhraseHash(mnemonic: string[]): Promise<void> {
    try {
      const mnemonicString = mnemonic.join(' ');
      const buffer = new TextEncoder().encode(mnemonicString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      localStorage.setItem(STORAGE_KEYS.RECOVERY_PHRASE_HASH, hashHex);
      logger.info('[FEAT-02] Stored recovery phrase hash');
    } catch (error) {
      logger.error('[FEAT-02] Failed to store phrase hash', error);
      throw new Error(`Failed to store phrase hash: ${error}`);
    }
  }

  /**
   * Verify recovery phrase by checking against stored hash.
   *
   * FEAT-02: Phrase verification
   *
   * @param {string[]} mnemonic - Mnemonic to verify
   * @returns {Promise<boolean>} True if phrase matches stored hash
   */
  async verifyPhraseHash(mnemonic: string[]): Promise<boolean> {
    try {
      const storedHash = localStorage.getItem(STORAGE_KEYS.RECOVERY_PHRASE_HASH);
      if (!storedHash) {
        logger.warn('[FEAT-02] No stored phrase hash found');
        return false;
      }

      const mnemonicString = mnemonic.join(' ');
      const buffer = new TextEncoder().encode(mnemonicString);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const matches = hashHex === storedHash;
      if (matches) {
        logger.info('[FEAT-02] Phrase verification successful');
      } else {
        logger.warn('[FEAT-02] Phrase verification failed - hash mismatch');
      }
      return matches;
    } catch (error) {
      logger.error('[FEAT-02] Phrase verification error', error);
      return false;
    }
  }

  /**
   * Check if a recovery phrase hash exists in storage.
   *
   * @returns {boolean} True if recovery phrase is configured
   */
  hasRecoveryPhrase(): boolean {
    return !!localStorage.getItem(STORAGE_KEYS.RECOVERY_PHRASE_HASH);
  }

  /**
   * Clear all recovery data from storage.
   *
   * FEAT-02: Recovery data cleanup
   * Removes phrase hash and encrypted master key.
   */
  clearRecoveryData(): void {
    try {
      localStorage.removeItem(STORAGE_KEYS.RECOVERY_PHRASE_HASH);
      localStorage.removeItem(STORAGE_KEYS.ENCRYPTED_MASTER_KEY);
      localStorage.removeItem(STORAGE_KEYS.ESCROW_CONTACT);
      logger.info('[FEAT-02] Cleared all recovery data');
    } catch (error) {
      logger.error('[FEAT-02] Failed to clear recovery data', error);
      throw new Error(`Failed to clear recovery data: ${error}`);
    }
  }

  /**
   * Create an encrypted shard for trusted contact escrow.
   *
   * FEAT-02: Trusted contact escrow
   * Encrypts mnemonic with contact's public key for secure backup.
   *
   * @param {string[]} mnemonic - The recovery phrase
   * @param {string} contactPublicKey - Contact's RSA public key (PEM format)
   * @returns {Promise<string>} Base64-encoded encrypted shard
   */
  async createEscrowShard(mnemonic: string[], contactPublicKey: string): Promise<string> {
    try {
      const mnemonicString = mnemonic.join(' ');
      const data = new TextEncoder().encode(mnemonicString);

      // Import the public key
      const publicKey = await crypto.subtle.importKey(
        'spki',
        this.pemToBinary(contactPublicKey),
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        false,
        ['encrypt']
      );

      // Encrypt with contact's public key
      const encryptedData = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        data
      );

      const escrowShard = this.toBase64(encryptedData);
      logger.info('[FEAT-02] Created escrow shard for trusted contact');
      return escrowShard;
    } catch (error) {
      logger.error('[FEAT-02] Failed to create escrow shard', error);
      throw new Error(`Failed to create escrow shard: ${error}`);
    }
  }

  /**
   * Set trusted contact for escrow recovery.
   *
   * FEAT-02: Trusted contact management
   *
   * @param {string} contactEmail - Contact's email address
   * @param {string} escrowShard - Encrypted mnemonic shard
   */
  setTrustedContact(contactEmail: string, escrowShard: string): void {
    try {
      const contact = {
        email: contactEmail,
        escrowShard: escrowShard,
        createdAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEYS.ESCROW_CONTACT, JSON.stringify(contact));
      logger.info(`[FEAT-02] Set trusted contact: ${contactEmail}`);
    } catch (error) {
      logger.error('[FEAT-02] Failed to set trusted contact', error);
      throw new Error(`Failed to set trusted contact: ${error}`);
    }
  }

  /**
   * Get trusted contact info.
   *
   * @returns {TrustedContact | null} Contact info or null if not set
   */
  getTrustedContact(): TrustedContact | null {
    try {
      const contactJson = localStorage.getItem(STORAGE_KEYS.ESCROW_CONTACT);
      if (!contactJson) return null;

      const contact = JSON.parse(contactJson);
      return {
        email: contact.email,
        createdAt: contact.createdAt,
      };
    } catch (error) {
      logger.error('[FEAT-02] Failed to get trusted contact', error);
      return null;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Combine entropy and checksum bits into a byte array.
   */
  private combineBitsToBytes(entropy: Uint8Array, checksumBuffer: Uint8Array, checksumBits: number): Uint8Array {
    const totalBits = entropy.length * 8 + checksumBits;
    const totalBytes = Math.ceil(totalBits / 8);
    const combined = new Uint8Array(totalBytes);

    let bitIndex = 0;

    // Add entropy bits
    for (let i = 0; i < entropy.length; i++) {
      this.setBits(combined, bitIndex, 8, entropy[i]);
      bitIndex += 8;
    }

    // Add checksum bits
    for (let i = 0; i < checksumBits; i++) {
      const byteIndex = Math.floor(i / 8);
      const bitOffset = 7 - (i % 8);
      const bit = (checksumBuffer[byteIndex] >> bitOffset) & 1;
      this.setBits(combined, bitIndex, 1, bit);
      bitIndex += 1;
    }

    return combined;
  }

  /**
   * Extract bits from a byte array.
   */
  private extractBits(data: Uint8Array, startBit: number, length: number): number {
    let result = 0;
    for (let i = 0; i < length; i++) {
      const byteIndex = Math.floor((startBit + i) / 8);
      const bitOffset = 7 - ((startBit + i) % 8);
      const bit = (data[byteIndex] >> bitOffset) & 1;
      result = (result << 1) | bit;
    }
    return result;
  }

  /**
   * Set bits in a byte array.
   */
  private setBits(data: Uint8Array, startBit: number, length: number, value: number): void {
    for (let i = 0; i < length; i++) {
      const byteIndex = Math.floor((startBit + i) / 8);
      const bitOffset = 7 - ((startBit + i) % 8);
      const bit = (value >> (length - 1 - i)) & 1;

      if (bit) {
        data[byteIndex] |= 1 << bitOffset;
      } else {
        data[byteIndex] &= ~(1 << bitOffset);
      }
    }
  }

  /**
   * Validate mnemonic checksum.
   */
  private async validateChecksum(words: string[]): Promise<boolean> {
    try {
      // Convert words to bit array
      const bits: boolean[] = [];
      for (const word of words) {
        const wordIndex = BIP39_ENGLISH_WORDLIST.indexOf(word);
        for (let i = 10; i >= 0; i--) {
          bits.push(((wordIndex >> i) & 1) === 1);
        }
      }

      // Extract entropy and checksum
      const entropyLength = (BIP39_CONFIG.ENTROPY_BITS / 8);
      const checksumLength = BIP39_CONFIG.ENTROPY_BITS / 32;
      const entropy = new Uint8Array(entropyLength);

      for (let i = 0; i < entropyLength * 8; i++) {
        const byteIndex = Math.floor(i / 8);
        const bitOffset = 7 - (i % 8);
        if (bits[i]) {
          entropy[byteIndex] |= 1 << bitOffset;
        }
      }

      // Verify checksum
      const hash = await crypto.subtle.digest('SHA-256', entropy);
      const hashArray = new Uint8Array(hash);

      for (let i = 0; i < checksumLength; i++) {
        const byteIndex = Math.floor(i / 8);
        const bitOffset = 7 - (i % 8);
        const checksumBit = (hashArray[byteIndex] >> bitOffset) & 1;
        const providedBit = bits[entropyLength * 8 + i] ? 1 : 0;
        if (checksumBit !== providedBit) {
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('[FEAT-02] Checksum validation error', error);
      return false;
    }
  }

  /**
   * Convert ArrayBuffer to Base64 string.
   */
  private toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert Base64 string to ArrayBuffer.
   */
  private fromBase64(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Convert PEM-encoded public key to binary.
   */
  private pemToBinary(pem: string): ArrayBuffer {
    const lines = pem.split('\n');
    let base64 = '';
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('-----')) continue;
      base64 += line;
    }
    return this.fromBase64(base64);
  }
}

/**
 * Singleton instance
 */
export const recoveryPhraseService = new RecoveryPhraseService();

export type { ValidationResult, TrustedContact, EncryptedBlob };
