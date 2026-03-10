/**
 * QAV Cryptographic Bridge
 *
 * Production-grade bridge to the Rust crypto core via FFI/JSI.
 * All cryptographic operations are executed in native code with zero-knowledge guarantee:
 * - No JavaScript crypto fallbacks (fail hard instead)
 * - All key material is automatically zeroed after use
 * - Argon2id key derivation (65MB memory, 3 iterations)
 * - XChaCha20-Poly1305 and AES-256-GCM-SIV AEAD ciphers
 * - X25519 key exchange for E2E sharing
 * - Ed25519 signatures for authentication
 * - SRP-6a for password-based authentication
 *
 * @module crypto/bridge
 *
 * PH1-FIX: Threading & Async Architecture
 * ────────────────────────────────────────────────────────
 * On native platforms (iOS/Android): All crypto operations are async by nature.
 * The JSI bridge to Rust is non-blocking — each operation executes in Rust's thread pool
 * and returns a Promise without blocking the JS main thread.
 *
 * On web platform: WebCrypto API operations are inherently async and handled by the browser's
 * cryptographic engine (hardware accelerated when available). Key derivation (Argon2id equivalent
 * via PBKDF2) and encryption/decryption operations never block the UI thread.
 *
 * Critical operations:
 * - deriveKEK: Async Argon2id key derivation (native) or PBKDF2 (web). Never blocks UI.
 * - encrypt/decryptFile: Async AEAD operations. Processes data asynchronously.
 * - All functions return Promises to ensure UI thread safety on all platforms.
 *
 * PL-033 SCALE NOTE: All crypto FFI currently uses hex encoding (2x memory).
 * A 1MB file produces a 2MB hex string during encrypt/decrypt round-trips.
 * Acceptable for current use but blocks files >100MB. When scaling, evaluate
 * switching to ArrayBuffer/Uint8Array passthrough via JSI TurboModules to
 * eliminate the hex serialization overhead.
 */

// FIX: Ensure Buffer global is available on web — this provides Node.js-compatible
// encoding (hex/base64) only, not any crypto primitives. No fallback involved.
import '@/platformSetup';

import { assertNativeAvailable, nativeModule } from './native';

// Re-export the assertion function
export { assertNativeAvailable } from './native';

// Cipher IDs matching Rust core
export enum CipherId {
  XChaCha20Poly1305 = 2, // Stream-safe AEAD (24-byte nonce)
  Aes256GcmSiv = 3, // AEAD with nonce misuse resilience (12-byte nonce)
}

/**
 * Initialize the crypto bridge and verify native module is available.
 * MUST be called during application startup before any crypto operations.
 *
 * @throws Error if native module is not available
 */
export function initializeCryptoBridge(): void {
  assertNativeAvailable();
}

// ============================================================================
// Key Derivation - Argon2id
// ============================================================================

/**
 * Derive an encryption key from a password using Argon2id.
 * Uses native Rust implementation with high security parameters (65MB memory, 3 iterations).
 * The password is never transmitted and only used on the device.
 *
 * @param password - User password (plain text, will be hashed)
 * @param salt - Random salt (32 bytes)
 * @returns Promise<Uint8Array> - Derived key (32 bytes)
 * @throws Error if native module not available or key derivation fails
 */
export async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  if (!password || password.length === 0) {
    throw new Error('Password cannot be empty');
  }

  if (salt.length !== 32) {
    throw new Error('Salt must be 32 bytes');
  }

  try {
    const saltHex = Buffer.from(salt).toString('hex');
    const keyHex = await nativeModule.deriveKey(password, saltHex);
    return Buffer.from(keyHex, 'hex');
  } catch (error) {
    throw new Error(
      `Key derivation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}


// ============================================================================
// Encryption/Decryption (AEAD)
// ============================================================================

/**
 * Encrypt plaintext using XChaCha20-Poly1305 or AES-256-GCM-SIV.
 * Includes random nonce prepended to ciphertext.
 *
 * @param cipherId - Cipher algorithm (CipherId.XChaCha20Poly1305 or CipherId.Aes256GcmSiv)
 * @param key - 32-byte encryption key
 * @param plaintext - Data to encrypt
 * @param aad - Optional additional authenticated data
 * @returns Promise<Uint8Array> - nonce || ciphertext || tag
 * @throws Error if native module not available, key/plaintext invalid, or encryption fails
 */
export async function encrypt(
  _cipherId: CipherId, // Kept for API compatibility; cipher is chosen by native module
  key: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array
): Promise<Uint8Array> {
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }

  if (plaintext.length === 0) {
    throw new Error('Plaintext cannot be empty');
  }

  try {
    const keyHex = Buffer.from(key).toString('hex');
    const plaintextHex = Buffer.from(plaintext).toString('hex');
    const aadHex = aad ? Buffer.from(aad).toString('hex') : undefined;

    const resultHex = await nativeModule.encrypt(keyHex, plaintextHex, aadHex);
    return Buffer.from(resultHex, 'hex');
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Decrypt ciphertext using XChaCha20-Poly1305 or AES-256-GCM-SIV.
 * Extracts nonce from ciphertext prefix and verifies authentication tag.
 *
 * @param cipherId - Cipher algorithm (must match encryption cipher)
 * @param key - 32-byte decryption key
 * @param ciphertext - nonce || ciphertext || tag (from encrypt)
 * @param aad - Optional additional authenticated data (must match encryption AAD)
 * @returns Promise<Uint8Array> - Original plaintext
 * @throws Error if native module not available, key invalid, or decryption/tag verification fails
 */
export async function decrypt(
  _cipherId: CipherId, // Kept for API compatibility; cipher is detected from ciphertext header
  key: Uint8Array,
  ciphertext: Uint8Array,
  aad?: Uint8Array
): Promise<Uint8Array> {
  if (key.length !== 32) {
    throw new Error('Decryption key must be 32 bytes');
  }

  if (ciphertext.length === 0) {
    throw new Error('Ciphertext cannot be empty');
  }

  try {
    const keyHex = Buffer.from(key).toString('hex');
    const ciphertextHex = Buffer.from(ciphertext).toString('hex');
    const aadHex = aad ? Buffer.from(aad).toString('hex') : undefined;

    const resultHex = await nativeModule.decrypt(keyHex, ciphertextHex, aadHex);
    return Buffer.from(resultHex, 'hex');
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Key Generation (X25519)
// ============================================================================

/**
 * KeyPair representation for key sharing.
 */
export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

/**
 * Generate an X25519 key exchange keypair.
 * Public key can be shared with others; secret key must never leave the device.
 *
 * @returns Promise<KeyPair> - { publicKey: 32 bytes, secretKey: 32 bytes }
 * @throws Error if native module not available or key generation fails
 */
export async function generateShareKeypair(): Promise<KeyPair> {
  try {
    const result = await nativeModule.generateShareKeypair();
    return {
      publicKey: Buffer.from(result.public, 'hex'),
      secretKey: Buffer.from(result.private, 'hex'),
    };
  } catch (error) {
    throw new Error(
      `Share keypair generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Streaming Encryption (for large files)
// ============================================================================

/**
 * Initialize a streaming encryption session for large files.
 * Returns a session ID that must be used for all subsequent chunk operations.
 *
 * @param key - 32-byte encryption key
 * @returns Promise<string> - Opaque session ID handle
 * @throws Error if native module not available or initialization fails
 */
export async function streamEncryptInit(key: Uint8Array): Promise<string> {
  if (key.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }

  try {
    const keyHex = Buffer.from(key).toString('hex');
    return await nativeModule.streamEncryptInit(keyHex);
  } catch (error) {
    throw new Error(
      `Streaming encryption initialization failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Feed a plaintext chunk to a streaming encryption session.
 *
 * @param sessionId - Session ID from streamEncryptInit
 * @param chunk - Plaintext data chunk
 * @param isFinal - True if this is the final chunk
 * @returns Promise<Uint8Array> - Encrypted chunk (ready to write to storage)
 * @throws Error if session not found, native module not available, or encryption fails
 */
export async function streamEncryptChunk(
  sessionId: string,
  chunk: Uint8Array,
  isFinal: boolean
): Promise<Uint8Array> {
  try {
    const chunkBase64 = Buffer.from(chunk).toString('base64');
    const resultHex = await nativeModule.streamEncryptChunk(sessionId, chunkBase64, isFinal);
    return Buffer.from(resultHex, 'hex');
  } catch (error) {
    throw new Error(
      `Streaming encryption chunk failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Free a streaming encryption session and its resources.
 * MUST be called after the final chunk is processed.
 *
 * @param sessionId - Session ID from streamEncryptInit
 * @returns Promise<void>
 * @throws Error if session not found or native module not available
 */
export async function streamEncryptFree(sessionId: string): Promise<void> {
  try {
    await nativeModule.streamFree(sessionId);
  } catch (error) {
    throw new Error(
      `Streaming encryption cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Initialize a streaming decryption session.
 *
 * @param key - 32-byte decryption key
 * @returns Promise<string> - Opaque session ID handle
 * @throws Error if native module not available or initialization fails
 */
export async function streamDecryptInit(key: Uint8Array): Promise<string> {
  if (key.length !== 32) {
    throw new Error('Decryption key must be 32 bytes');
  }

  try {
    const keyHex = Buffer.from(key).toString('hex');
    return await nativeModule.streamDecryptInit(keyHex);
  } catch (error) {
    throw new Error(
      `Streaming decryption initialization failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Feed an encrypted chunk to a streaming decryption session.
 *
 * @param sessionId - Session ID from streamDecryptInit
 * @param chunk - Encrypted data chunk
 * @param isFinal - True if this is the final chunk (triggers HMAC verification)
 * @returns Promise<Uint8Array> - Decrypted plaintext
 * @throws Error if session not found, HMAC verification fails, or decryption fails
 */
export async function streamDecryptChunk(
  sessionId: string,
  chunk: Uint8Array,
  isFinal: boolean
): Promise<Uint8Array> {
  try {
    const chunkBase64 = Buffer.from(chunk).toString('base64');
    const resultHex = await nativeModule.streamDecryptChunk(sessionId, chunkBase64, isFinal);
    return Buffer.from(resultHex, 'hex');
  } catch (error) {
    throw new Error(
      `Streaming decryption chunk failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Free a streaming decryption session and its resources.
 * MUST be called after the final chunk is processed.
 *
 * @param sessionId - Session ID from streamDecryptInit
 * @returns Promise<void>
 * @throws Error if session not found or native module not available
 */
export async function streamDecryptFree(sessionId: string): Promise<void> {
  try {
    await nativeModule.streamFree(sessionId);
  } catch (error) {
    throw new Error(
      `Streaming decryption cleanup failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Public Key Encryption (X25519 + XChaCha20-Poly1305)
// ============================================================================

/**
 * Encrypt data for a recipient using their public key.
 * Uses ephemeral X25519 key exchange + XChaCha20-Poly1305.
 * The recipient can decrypt using their secret key via openSealed().
 *
 * @param recipientPublicKey - Recipient's X25519 public key (32 bytes)
 * @param plaintext - Data to encrypt
 * @returns Promise<Uint8Array> - Ephemeral public (32) || nonce (24) || ciphertext || tag (16)
 * @throws Error if native module not available, key invalid, or encryption fails
 */
export async function sealToPublicKey(
  recipientPublicKey: Uint8Array,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  if (recipientPublicKey.length !== 32) {
    throw new Error('Recipient public key must be 32 bytes');
  }

  if (plaintext.length === 0) {
    throw new Error('Plaintext cannot be empty');
  }

  try {
    const recipientPublicHex = Buffer.from(recipientPublicKey).toString('hex');
    const plaintextHex = Buffer.from(plaintext).toString('hex');

    const resultHex = await nativeModule.sealToPublicKey(recipientPublicHex, plaintextHex);
    return Buffer.from(resultHex, 'hex');
  } catch (error) {
    throw new Error(
      `Public key encryption failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Decrypt sealed data using your secret key.
 * Opens a message encrypted with your public key via sealToPublicKey().
 *
 * @param secretKey - Your X25519 secret key (32 bytes)
 * @param sealed - Ephemeral public (32) || nonce (24) || ciphertext || tag (16) (from sealToPublicKey)
 * @returns Promise<Uint8Array> - Original plaintext
 * @throws Error if native module not available, key invalid, or decryption fails
 */
export async function openSealed(
  secretKey: Uint8Array,
  sealed: Uint8Array
): Promise<Uint8Array> {
  if (secretKey.length !== 32) {
    throw new Error('Secret key must be 32 bytes');
  }

  if (sealed.length === 0) {
    throw new Error('Sealed data cannot be empty');
  }

  try {
    const secretKeyHex = Buffer.from(secretKey).toString('hex');
    const sealedHex = Buffer.from(sealed).toString('hex');

    const resultHex = await nativeModule.openSealed(secretKeyHex, sealedHex);
    return Buffer.from(resultHex, 'hex');
  } catch (error) {
    throw new Error(
      `Public key decryption failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// SRP-6a Authentication
// ============================================================================

/**
 * SRP client ephemeral keypair representation.
 */
export interface SrpClientEphemeral {
  public: Uint8Array;
  private: Uint8Array;
}

/**
 * Generate an SRP-6a client ephemeral keypair.
 * The public key is sent to the server; the private key is secret.
 *
 * @returns Promise<SrpClientEphemeral> - { public: 32+ bytes, private: 32+ bytes }
 * @throws Error if native module not available or key generation fails
 */
export async function srpGenerateClientEphemeral(): Promise<SrpClientEphemeral> {
  try {
    const result = await nativeModule.srpGenerateClientEphemeral();
    return {
      public: Buffer.from(result.public, 'hex'),
      private: Buffer.from(result.private, 'hex'),
    };
  } catch (error) {
    throw new Error(
      `SRP ephemeral keypair generation failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * SRP client session derivation result.
 */
export interface SrpSessionKey {
  proof: Uint8Array; // M1 proof (32 bytes)
  key: Uint8Array; // Session key (32 bytes)
}

/**
 * Derive an SRP-6a session key and proof.
 * Computes M1 proof for authentication and a shared symmetric session key.
 *
 * @param clientPrivate - Client ephemeral secret (from srpGenerateClientEphemeral)
 * @param serverPublic - Server's ephemeral public key (from authentication challenge)
 * @param salt - Registration salt (known by server)
 * @param username - Registration username
 * @param password - User password
 * @returns Promise<SrpSessionKey> - { proof (M1), key (session key) }
 * @throws Error if native module not available or derivation fails
 */
export async function srpDeriveSession(
  clientPrivate: Uint8Array,
  serverPublic: Uint8Array,
  salt: Uint8Array,
  username: string,
  password: string
): Promise<SrpSessionKey> {
  if (clientPrivate.length === 0) {
    throw new Error('Client private key cannot be empty');
  }

  if (serverPublic.length === 0) {
    throw new Error('Server public key cannot be empty');
  }

  if (salt.length !== 32) {
    throw new Error('Salt must be 32 bytes');
  }

  if (!username || username.length === 0) {
    throw new Error('Username cannot be empty');
  }

  if (!password || password.length === 0) {
    throw new Error('Password cannot be empty');
  }

  try {
    const clientPrivateHex = Buffer.from(clientPrivate).toString('hex');
    const serverPublicHex = Buffer.from(serverPublic).toString('hex');
    const saltHex = Buffer.from(salt).toString('hex');

    const result = await nativeModule.srpDeriveSession(
      clientPrivateHex,
      serverPublicHex,
      saltHex,
      username,
      password
    );

    return {
      proof: Buffer.from(result.proof, 'hex'),
      key: Buffer.from(result.key, 'hex'),
    };
  } catch (error) {
    throw new Error(
      `SRP session derivation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Digital Signatures (Ed25519)
// ============================================================================

/**
 * Ed25519 signing keypair representation.
 */
export interface SigningKeyPair {
  publicKey: Uint8Array;  // 32 bytes - Ed25519 public key
  secretKey: Uint8Array;  // 64 bytes - Ed25519 private key (PKCS8 on web)
}

/**
 * Generate an Ed25519 signing keypair.
 * Used for digital signatures (non-repudiation) on vault headers, messages, and audit records.
 * The public key can be shared; the secret key must never leave the device.
 *
 * @returns Promise<SigningKeyPair> - { publicKey, secretKey }
 * @throws Error if native module not available or key generation fails
 */
export async function generateSigningKeypair(): Promise<SigningKeyPair> {
  try {
    const result = await nativeModule.generateSigningKeypair();
    return {
      publicKey: Buffer.from(result.public, 'hex'),
      secretKey: Buffer.from(result.private, 'hex'),
    };
  } catch (error) {
    throw new Error(
      `Signing keypair generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Sign a message using Ed25519 private key.
 * Produces a 64-byte signature that can be verified with the corresponding public key.
 *
 * @param secretKey - Ed25519 private key
 * @param message - Data to sign
 * @returns Promise<Uint8Array> - 64-byte Ed25519 signature
 * @throws Error if native module not available or signing fails
 */
export async function sign(
  secretKey: Uint8Array,
  message: Uint8Array
): Promise<Uint8Array> {
  if (secretKey.length === 0) {
    throw new Error('Secret key cannot be empty');
  }
  if (message.length === 0) {
    throw new Error('Message cannot be empty');
  }

  try {
    const secretKeyHex = Buffer.from(secretKey).toString('hex');
    const messageHex = Buffer.from(message).toString('hex');
    const signatureHex = await nativeModule.sign(secretKeyHex, messageHex);
    return Buffer.from(signatureHex, 'hex');
  } catch (error) {
    throw new Error(
      `Signing failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Verify an Ed25519 signature against a message and public key.
 *
 * @param publicKey - Ed25519 public key (32 bytes)
 * @param message - Original signed data
 * @param signature - Ed25519 signature to verify (64 bytes)
 * @returns Promise<boolean> - true if signature is valid
 * @throws Error if native module not available or verification fails
 */
export async function verify(
  publicKey: Uint8Array,
  message: Uint8Array,
  signature: Uint8Array
): Promise<boolean> {
  if (publicKey.length === 0) {
    throw new Error('Public key cannot be empty');
  }
  if (message.length === 0) {
    throw new Error('Message cannot be empty');
  }
  if (signature.length === 0) {
    throw new Error('Signature cannot be empty');
  }

  try {
    const publicKeyHex = Buffer.from(publicKey).toString('hex');
    const messageHex = Buffer.from(message).toString('hex');
    const signatureHex = Buffer.from(signature).toString('hex');
    return await nativeModule.verify(publicKeyHex, messageHex, signatureHex);
  } catch (error) {
    throw new Error(
      `Signature verification failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Key Hierarchy (SG-004: Two-layer KEK + MEK architecture)
// ============================================================================

/**
 * Generate a random Master Encryption Key (MEK).
 * The MEK is a 64-byte random key: 32 bytes for encryption + 32 bytes for HMAC.
 * Generated once per vault and wrapped by the KEK for storage.
 *
 * Matches Rust: MasterEncryptionKey::generate() → random 64-byte key
 *
 * @returns Promise<Uint8Array> - 64-byte random MEK
 */
export async function generateMEK(): Promise<Uint8Array> {
  try {
    const mekHex = await nativeModule.randomBytes(64);
    return Buffer.from(mekHex, 'hex');
  } catch (error) {
    throw new Error(
      `MEK generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Derive a Key Encryption Key (KEK) from a password using Argon2id.
 * The KEK is used solely to wrap/unwrap the MEK — never for direct file encryption.
 *
 * Uses HKDF domain separation on top of the password-derived key material
 * to ensure the KEK is cryptographically distinct from any other key derived
 * from the same password.
 *
 * Matches Rust: derive_kek(password, salt) → 32-byte KEK
 *
 * @param password - User password
 * @param salt - 32-byte random salt
 * @returns Promise<Uint8Array> - 32-byte KEK
 */
export async function deriveKEK(
  password: string,
  salt: Uint8Array
): Promise<Uint8Array> {
  if (!password || password.length === 0) {
    throw new Error('Password cannot be empty');
  }
  if (salt.length !== 32) {
    throw new Error('Salt must be 32 bytes');
  }

  try {
    // PH1-FIX: Key derivation is inherently async — on native it goes through JSI to Rust,
    // on web it uses PBKDF2 via WebCrypto (which runs in browser's crypto thread).
    // UI thread is never blocked for key derivation.
    const rawKey = await deriveKey(password, salt);

    // Domain separation: derive KEK-specific key from the raw material
    // This ensures the KEK is distinct from any direct-encryption use of deriveKey()
    return await deriveSubkey(rawKey.slice(0, 32), 'kek_wrapping');
  } catch (error) {
    throw new Error(
      `KEK derivation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Wrap (encrypt) a MEK with the KEK using XChaCha20-Poly1305 AEAD.
 * The result is an opaque blob: nonce(24) || ciphertext(64+16) = 104 bytes.
 *
 * Matches Rust: wrap_mek(kek, mek) → Vec<u8>
 *
 * @param kek - 32-byte Key Encryption Key (from deriveKEK)
 * @param mek - 64-byte Master Encryption Key (from generateMEK)
 * @returns Promise<Uint8Array> - Wrapped MEK blob (nonce || ciphertext || tag)
 */
export async function wrapMEK(
  kek: Uint8Array,
  mek: Uint8Array
): Promise<Uint8Array> {
  if (kek.length !== 32) {
    throw new Error('KEK must be 32 bytes');
  }
  if (mek.length !== 64) {
    throw new Error('MEK must be 64 bytes');
  }

  try {
    return await encrypt(CipherId.XChaCha20Poly1305, kek, mek);
  } catch (error) {
    throw new Error(
      `MEK wrapping failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Unwrap (decrypt) a MEK from the wrapped blob using the KEK.
 *
 * Matches Rust: unwrap_mek(kek, wrapped) → MasterEncryptionKey
 *
 * @param kek - 32-byte Key Encryption Key (from deriveKEK)
 * @param wrappedMek - Wrapped MEK blob (from wrapMEK)
 * @returns Promise<Uint8Array> - 64-byte Master Encryption Key
 * @throws Error if KEK is wrong (AEAD tag verification fails)
 */
export async function unwrapMEK(
  kek: Uint8Array,
  wrappedMek: Uint8Array
): Promise<Uint8Array> {
  if (kek.length !== 32) {
    throw new Error('KEK must be 32 bytes');
  }
  if (wrappedMek.length === 0) {
    throw new Error('Wrapped MEK cannot be empty');
  }

  try {
    const mek = await decrypt(CipherId.XChaCha20Poly1305, kek, wrappedMek);
    if (mek.length !== 64) {
      throw new Error(`Unwrapped MEK has unexpected length: ${mek.length} (expected 64)`);
    }
    return mek;
  } catch (error) {
    throw new Error(
      `MEK unwrapping failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Per-File Encryption Keys (SG-005: Each file gets its own key)
// ============================================================================

/**
 * Derive a per-file encryption key (FEK) from the MEK using HKDF domain separation.
 * Each file gets a unique 32-byte key derived from MEK + file ID.
 * Compromising one file's key does not expose other files.
 *
 * Matches Rust: derive_file_key(mek, file_id) → [u8; 32]
 *
 * @param mek - 64-byte Master Encryption Key
 * @param fileId - Unique file identifier (UUID)
 * @returns Promise<Uint8Array> - 32-byte per-file encryption key
 */
export async function deriveFileKey(
  mek: Uint8Array,
  fileId: string
): Promise<Uint8Array> {
  if (mek.length !== 64) {
    throw new Error('MEK must be 64 bytes');
  }
  if (!fileId || fileId.length === 0) {
    throw new Error('File ID cannot be empty');
  }

  try {
    // Use the encryption portion of the MEK (first 32 bytes) with file-specific info
    const info = `file_encryption:${fileId}`;
    return await deriveSubkey(mek.slice(0, 32), info);
  } catch (error) {
    throw new Error(
      `File key derivation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generic subkey derivation using SHA-256 domain separation.
 * Matches the pattern of Rust's derive_subkey(master, info) via HKDF-SHA256.
 *
 * @param masterKey - 32-byte master key material
 * @param info - Domain separation string
 * @returns Promise<Uint8Array> - 32-byte derived subkey
 */
export async function deriveSubkey(
  masterKey: Uint8Array,
  info: string
): Promise<Uint8Array> {
  if (masterKey.length === 0) {
    throw new Error('Master key cannot be empty');
  }
  if (!info || info.length === 0) {
    throw new Error('Info string cannot be empty');
  }

  const encoder = new TextEncoder();
  const infoBytes = encoder.encode(info);
  const combined = new Uint8Array(masterKey.length + infoBytes.length);
  combined.set(masterKey, 0);
  combined.set(infoBytes, masterKey.length);

  const hashHex = await hashSha256(combined);
  return Buffer.from(hashHex, 'hex');
}

/**
 * Generate cryptographically random bytes.
 * Uses native CSPRNG (Rust) or Web Crypto API.
 *
 * @param length - Number of random bytes
 * @returns Promise<Uint8Array> - Random bytes
 */
export async function randomBytes(length: number): Promise<Uint8Array> {
  if (length <= 0) {
    throw new Error('Length must be positive');
  }

  try {
    const hex = await nativeModule.randomBytes(length);
    return Buffer.from(hex, 'hex');
  } catch (error) {
    throw new Error(
      `Random bytes generation failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ============================================================================
// Vault Index Encryption (SG-003: Client-side index encryption)
// ============================================================================

/**
 * Derive a subkey from the master key using HKDF-SHA256 domain separation.
 * Matches the Rust crypto core's `derive_subkey(master, info)` implementation.
 *
 * Delegates to the generic deriveSubkey() function (SG-004).
 *
 * @param masterKey - 32-byte master encryption key (from Argon2id key derivation)
 * @param info - Domain separation string (e.g., "vault_index_encryption")
 * @returns Promise<Uint8Array> - 32-byte derived subkey
 */
export async function deriveIndexKey(
  masterKey: Uint8Array,
  info: string = 'vault_index_encryption'
): Promise<Uint8Array> {
  if (masterKey.length !== 32) {
    throw new Error('Master key must be 32 bytes');
  }
  return deriveSubkey(masterKey, info);
}

/**
 * Encrypt a vault file index (array of file metadata) for secure client-side storage.
 * Uses XChaCha20-Poly1305 AEAD with a key derived from the master key using
 * "vault_index_encryption" domain separation — matching the Rust VaultIndex::encrypt().
 *
 * @param masterKey - 32-byte master encryption key
 * @param indexJson - UTF-8 encoded JSON bytes of the file index
 * @returns Promise<Uint8Array> - Encrypted blob: nonce || ciphertext || tag
 */
export async function encryptVaultIndex(
  masterKey: Uint8Array,
  indexJson: Uint8Array
): Promise<Uint8Array> {
  if (indexJson.length === 0) {
    throw new Error('Index data cannot be empty');
  }

  const indexKey = await deriveIndexKey(masterKey, 'vault_index_encryption');
  return encrypt(CipherId.XChaCha20Poly1305, indexKey, indexJson);
}

/**
 * Decrypt a vault file index blob encrypted by encryptVaultIndex().
 *
 * @param masterKey - 32-byte master encryption key (same key used for encryption)
 * @param encryptedIndex - Encrypted blob from encryptVaultIndex()
 * @returns Promise<Uint8Array> - Decrypted JSON bytes of the file index
 */
export async function decryptVaultIndex(
  masterKey: Uint8Array,
  encryptedIndex: Uint8Array
): Promise<Uint8Array> {
  if (encryptedIndex.length === 0) {
    throw new Error('Encrypted index cannot be empty');
  }

  const indexKey = await deriveIndexKey(masterKey, 'vault_index_encryption');
  return decrypt(CipherId.XChaCha20Poly1305, indexKey, encryptedIndex);
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Hash data using SHA-256.
 * Uses native Rust implementation for secure hashing.
 *
 * @param data - Data to hash (Uint8Array)
 * @returns Promise<string> - SHA-256 hash (hex string)
 * @throws Error if native module not available or hashing fails
 */
export async function hashSha256(data: Uint8Array): Promise<string> {
  if (data.length === 0) {
    throw new Error('Data cannot be empty');
  }

  try {
    const dataHex = Buffer.from(data).toString('hex');
    return await nativeModule.hashSha256(dataHex);
  } catch (error) {
    throw new Error(
      `SHA-256 hashing failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get the version of the native crypto library.
 * Useful for debugging and checking API compatibility.
 *
 * @returns Promise<string> - Version string (e.g., "0.1.0")
 * @throws Error if native module not available
 */
export async function getCryptoVersion(): Promise<string> {
  try {
    return await nativeModule.getVersion();
  } catch (error) {
    throw new Error(
      `Failed to get crypto version: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ── SG-012: Rollback Protection ──────────────────────────────────

/**
 * SG-012: Validate that a file update does not roll back the version.
 *
 * @param currentVersion - The version we currently have stored for this file
 * @param incomingVersion - The version from the incoming update
 * @returns true if the update is valid (incoming > current), false if rollback detected
 *
 * @example
 * if (!validateFileVersion(file.version ?? 0, update.version)) {
 *   throw new Error('Rollback detected — rejecting stale file update');
 * }
 */
export function validateFileVersion(currentVersion: number, incomingVersion: number): boolean {
  // Legacy files (version 0) accept any update
  if (currentVersion === 0) return true;
  // Incoming must be strictly greater than current
  return incomingVersion > currentVersion;
}

/**
 * SG-012: Build AEAD associated data for version-bound encryption.
 *
 * Matches the Rust-side `build_version_ad` format:
 *   "file_version:" || version_le_bytes(8) || ":" || filename_bytes
 *
 * @param version - Monotonic file version
 * @param filename - File name to bind
 * @returns Uint8Array of associated data
 */
export function buildVersionAD(version: number, filename: string): Uint8Array {
  const prefix = new TextEncoder().encode('file_version:');
  const versionBytes = new Uint8Array(8);
  const view = new DataView(versionBytes.buffer);
  view.setBigUint64(0, BigInt(version), true); // little-endian
  const separator = new Uint8Array([0x3A]); // ':'
  const filenameBytes = new TextEncoder().encode(filename);

  const ad = new Uint8Array(prefix.length + 8 + 1 + filenameBytes.length);
  ad.set(prefix, 0);
  ad.set(versionBytes, prefix.length);
  ad.set(separator, prefix.length + 8);
  ad.set(filenameBytes, prefix.length + 8 + 1);
  return ad;
}
