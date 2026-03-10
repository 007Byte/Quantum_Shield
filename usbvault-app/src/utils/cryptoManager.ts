/**
 * QAV Crypto Manager
 *
 * High-level abstraction over the crypto bridge for file encryption/decryption.
 * Handles:
 * - 64KB chunked streaming AEAD for large files
 * - Single-pass encryption for small files
 * - Progress tracking with callbacks
 * - Key derivation from password + salt
 * - Platform-agnostic: native uses Rust FFI, web uses WebCrypto fallback
 *
 * @module utils/cryptoManager
 *
 * PH1-FIX: Threading Architecture
 * ────────────────────────────────────
 * All encryption/decryption operations in this module are async and non-blocking:
 *
 * - encryptFile: Async key derivation (via deriveKEK) followed by streaming or single-pass AEAD
 *   Native: JSI bridge handles async execution via Rust thread pool
 *   Web: WebCrypto operations run asynchronously in browser's crypto engine
 *
 * - decryptData: Async key derivation and AEAD decryption operations
 *   UI thread is never blocked regardless of file size
 *
 * All functions return Promises ensuring proper async/await handling on all platforms.
 */

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import {
  CipherId,
  deriveKey,
  encrypt,
  decrypt,
  streamEncryptInit,
  streamEncryptChunk,
  streamEncryptFree,
  streamDecryptInit,
  streamDecryptChunk,
  streamDecryptFree,
} from '../crypto/bridge';

// ─── Constants ───────────────────────────────────────────────────────

/** Chunk size for streaming encryption (64 KiB per roadmap spec) */
export const CHUNK_SIZE = 64 * 1024; // 65,536 bytes

/** Threshold for switching to streaming mode */
const STREAMING_THRESHOLD = CHUNK_SIZE;

/** Salt size for Argon2id key derivation */
const SALT_SIZE = 32;

// ─── Types ───────────────────────────────────────────────────────────

export interface EncryptionResult {
  /** Encrypted data (nonce + ciphertext + tag, or concatenated stream chunks) */
  encryptedData: Uint8Array;
  /** Random salt used for key derivation (must be stored alongside ciphertext) */
  salt: Uint8Array;
  /** Cipher algorithm used */
  cipherId: CipherId;
  /** Original file size in bytes */
  originalSize: number;
  /** Whether streaming mode was used */
  isStreamed: boolean;
}

export interface DecryptionResult {
  /** Decrypted plaintext data */
  data: Uint8Array;
  /** Original file size */
  originalSize: number;
}

export type ProgressCallback = (progress: number) => void;

// ─── Key Derivation ──────────────────────────────────────────────────

/**
 * Generate a random salt for key derivation.
 */
export function generateSalt(): Uint8Array {
  const salt = new Uint8Array(SALT_SIZE);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(salt);
  } else {
    // Fallback for environments without WebCrypto
    for (let i = 0; i < SALT_SIZE; i++) {
      salt[i] = Math.floor(Math.random() * 256);
    }
  }
  return salt;
}

/**
 * Derive an encryption key from a password using Argon2id.
 * Uses the crypto bridge which calls native Rust (or WebCrypto PBKDF2 fallback on web).
 *
 * @param password - User password
 * @param salt - 32-byte random salt
 * @returns 32-byte derived key
 */
export async function deriveEncryptionKey(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  return deriveKey(password, salt);
}

// ─── File Reading ────────────────────────────────────────────────────

/**
 * Read a file into a Uint8Array.
 * Works on both native (Expo FileSystem) and web (fetch/FileReader).
 */
async function readFileAsBytes(fileUri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    // On web, fileUri may be a blob: URL or data: URL
    const response = await fetch(fileUri);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } else {
    // On native, use Expo FileSystem
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return base64ToUint8Array(base64);
  }
}

/**
 * Read a file in chunks for streaming encryption.
 * Yields chunks of CHUNK_SIZE bytes.
 */
async function* readFileInChunks(
  fileData: Uint8Array,
  chunkSize: number = CHUNK_SIZE,
): AsyncGenerator<{ chunk: Uint8Array; offset: number; isFinal: boolean }> {
  const totalSize = fileData.length;
  let offset = 0;

  while (offset < totalSize) {
    const end = Math.min(offset + chunkSize, totalSize);
    const chunk = fileData.slice(offset, end);
    const isFinal = end >= totalSize;

    yield { chunk, offset, isFinal };
    offset = end;
  }
}

// ─── Encryption ──────────────────────────────────────────────────────

/**
 * Encrypt a file from a URI.
 *
 * For small files (< 64KB): uses single-pass AEAD encryption.
 * For large files (>= 64KB): uses streaming chunked AEAD with 64KB chunks.
 *
 * @param fileUri - URI of the file to encrypt (blob:, file://, etc.)
 * @param password - Vault password for key derivation
 * @param cipherId - Cipher algorithm to use
 * @param onProgress - Optional progress callback (0.0 to 1.0)
 * @returns EncryptionResult with encrypted data and metadata
 */
export async function encryptFile(
  fileUri: string,
  password: string,
  cipherId: CipherId = CipherId.Aes256GcmSiv,
  onProgress?: ProgressCallback,
): Promise<EncryptionResult> {
  // Read the file
  onProgress?.(0);
  const fileData = await readFileAsBytes(fileUri);
  const originalSize = fileData.length;

  if (originalSize === 0) {
    throw new Error('Cannot encrypt an empty file');
  }

  // Derive key
  onProgress?.(0.05);
  const salt = generateSalt();
  const key = await deriveEncryptionKey(password, salt);

  try {
    if (originalSize < STREAMING_THRESHOLD) {
      // ── Single-pass encryption for small files ──
      onProgress?.(0.3);
      const encryptedData = await encrypt(cipherId, key, fileData);
      onProgress?.(1.0);

      return {
        encryptedData,
        salt,
        cipherId,
        originalSize,
        isStreamed: false,
      };
    } else {
      // ── Streaming chunked encryption for large files ──
      return await streamEncryptFile(key, fileData, cipherId, salt, onProgress);
    }
  } finally {
    // Zero out the key material in JS (best effort — GC may have copies)
    key.fill(0);
  }
}

/**
 * Streaming encryption for files >= 64KB.
 * Processes file in 64KB chunks via the crypto bridge's streaming API.
 */
async function streamEncryptFile(
  key: Uint8Array,
  fileData: Uint8Array,
  cipherId: CipherId,
  salt: Uint8Array,
  onProgress?: ProgressCallback,
): Promise<EncryptionResult> {
  const sessionId = await streamEncryptInit(key);
  const encryptedChunks: Uint8Array[] = [];
  const totalSize = fileData.length;

  try {
    for await (const { chunk, offset, isFinal } of readFileInChunks(fileData)) {
      const encryptedChunk = await streamEncryptChunk(sessionId, chunk, isFinal);
      encryptedChunks.push(encryptedChunk);

      // Progress: 10% for key derivation, 90% for encryption
      const encryptionProgress = (offset + chunk.length) / totalSize;
      onProgress?.(0.1 + encryptionProgress * 0.9);
    }
  } finally {
    await streamEncryptFree(sessionId);
  }

  // Concatenate all encrypted chunks
  const totalEncryptedSize = encryptedChunks.reduce((sum, c) => sum + c.length, 0);
  const encryptedData = new Uint8Array(totalEncryptedSize);
  let writeOffset = 0;
  for (const chunk of encryptedChunks) {
    encryptedData.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  onProgress?.(1.0);

  return {
    encryptedData,
    salt,
    cipherId,
    originalSize: totalSize,
    isStreamed: true,
  };
}

// ─── Decryption ──────────────────────────────────────────────────────

/**
 * Decrypt encrypted data back to plaintext.
 *
 * @param encryptedData - The encrypted blob (from encryptFile)
 * @param password - Vault password
 * @param salt - Salt used during encryption (must be stored alongside ciphertext)
 * @param cipherId - Cipher algorithm used during encryption
 * @param isStreamed - Whether streaming mode was used during encryption
 * @param originalSize - Original file size (for streaming chunk calculation)
 * @param onProgress - Optional progress callback (0.0 to 1.0)
 * @returns DecryptionResult with plaintext data
 */
export async function decryptData(
  encryptedData: Uint8Array,
  password: string,
  salt: Uint8Array,
  cipherId: CipherId = CipherId.Aes256GcmSiv,
  isStreamed: boolean = false,
  _originalSize?: number,
  onProgress?: ProgressCallback,
): Promise<DecryptionResult> {
  onProgress?.(0);

  // Derive key from password + salt
  onProgress?.(0.05);
  const key = await deriveEncryptionKey(password, salt);

  try {
    if (!isStreamed) {
      // ── Single-pass decryption ──
      onProgress?.(0.3);
      const data = await decrypt(cipherId, key, encryptedData);
      onProgress?.(1.0);

      return { data, originalSize: data.length };
    } else {
      // ── Streaming chunked decryption ──
      return await streamDecryptData(key, encryptedData, onProgress);
    }
  } finally {
    key.fill(0);
  }
}

/**
 * Streaming decryption for data that was encrypted with streaming mode.
 */
async function streamDecryptData(
  key: Uint8Array,
  encryptedData: Uint8Array,
  onProgress?: ProgressCallback,
): Promise<DecryptionResult> {
  const sessionId = await streamDecryptInit(key);
  const decryptedChunks: Uint8Array[] = [];
  const totalSize = encryptedData.length;

  try {
    for await (const { chunk, offset, isFinal } of readFileInChunks(encryptedData)) {
      const decryptedChunk = await streamDecryptChunk(sessionId, chunk, isFinal);
      decryptedChunks.push(decryptedChunk);

      const decryptionProgress = (offset + chunk.length) / totalSize;
      onProgress?.(0.1 + decryptionProgress * 0.9);
    }
  } finally {
    await streamDecryptFree(sessionId);
  }

  // Concatenate decrypted chunks
  const totalDecryptedSize = decryptedChunks.reduce((sum, c) => sum + c.length, 0);
  const data = new Uint8Array(totalDecryptedSize);
  let writeOffset = 0;
  for (const chunk of decryptedChunks) {
    data.set(chunk, writeOffset);
    writeOffset += chunk.length;
  }

  onProgress?.(1.0);

  return { data, originalSize: data.length };
}

// ─── Web Download Helper ─────────────────────────────────────────────

/**
 * Trigger a browser download of decrypted data.
 * Creates a temporary blob URL and clicks a hidden anchor.
 */
export function downloadDecryptedFile(
  data: Uint8Array,
  filename: string,
  mimeType: string = 'application/octet-stream',
): void {
  if (Platform.OS !== 'web') {
    throw new Error('downloadDecryptedFile is only available on web');
  }

  const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();

  // Cleanup
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 100);
}

// ─── Utility ─────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert Uint8Array to base64 string.
 */
export function uint8ArrayToBase64(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary);
}

/**
 * Get a human-readable file size string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
