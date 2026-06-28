/**
 * USBVault Native Crypto Module
 *
 * Bridges React Native to the Rust crypto library via JSI (TurboModules).
 * On web platforms, provides a Web Crypto API implementation with WASM-accelerated
 * Argon2id for key derivation, achieving near-parity with the native Rust path.
 *
 * SECURITY NOTE:
 * - On native (iOS/Android), all crypto is handled by the Rust library (production-grade).
 * - On web, Argon2id key derivation uses hash-wasm (WASM). Symmetric encryption uses
 *   AES-256-GCM via Web Crypto API (hardware-accelerated in modern browsers).
 *   The web path is suitable for production use with the caveat that XChaCha20-Poly1305
 *   is not available — AES-256-GCM is used as a secure alternative.
 *
 * @module crypto/native
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';
import { argon2id } from 'hash-wasm';
// X25519 sealed-box primitives for the web sharing fallback. These match the
// native Rust path (usbvault-crypto/src/sharing.rs) byte-for-byte: X25519 ECDH
// -> HKDF-SHA256(info="seal") -> XChaCha20-Poly1305, layout
// ephemeral_public(32) || nonce(24) || ciphertext||tag(16). Verified by a
// cross-impl interop KAT. Replaces the broken ECDH P-256 fallback (issue #71).
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

// HKDF info string for the sealing subkey (must equal Rust derive_subkey(..,"seal")).
const SHARE_SEAL_INFO = new TextEncoder().encode('seal');

/**
 * Represents the native USBVault crypto module interface.
 */
export interface USBVaultCryptoModule {
  deriveKey(password: string, saltHex: string): Promise<string>;
  encrypt(keyHex: string, plaintextHex: string, aadHex?: string): Promise<string>;
  decrypt(keyHex: string, ciphertextHex: string, aadHex?: string): Promise<string>;
  streamEncryptInit(keyHex: string): Promise<string>;
  streamEncryptChunk(sessionId: string, chunkBase64: string, isFinal: boolean): Promise<string>;
  streamDecryptInit(keyHex: string): Promise<string>;
  streamDecryptChunk(sessionId: string, chunkBase64: string, isFinal: boolean): Promise<string>;
  streamFree(sessionId: string): Promise<void>;
  generateShareKeypair(): Promise<{ public: string; private: string }>;
  sealToPublicKey(recipientPublicHex: string, plaintextHex: string): Promise<string>;
  openSealed(secretKeyHex: string, sealedHex: string): Promise<string>;
  getVersion(): Promise<string>;
  srpGenerateClientEphemeral(): Promise<{ public: string; private: string }>;
  srpDeriveSession(
    clientPrivateHex: string,
    serverPublicHex: string,
    saltHex: string,
    username: string,
    password: string
  ): Promise<{ proof: string; key: string }>;
  hashSha256(dataHex: string): Promise<string>;
  randomBytes(length: number): Promise<string>;
  generateSigningKeypair(): Promise<{ public: string; private: string }>;
  sign(privateKeyHex: string, messageHex: string): Promise<string>;
  verify(publicKeyHex: string, messageHex: string, signatureHex: string): Promise<boolean>;

  // Vault container operations (Rust FFI)
  createVaultHeader(
    password: string,
    cipherId: number
  ): Promise<{ headerHex: string; encKeyHex: string; hmacKeyHex: string }>;
  readVaultHeader(headerHex: string): Promise<{
    version: number;
    cipherId: number;
    kdfParams: { memory: number; iterations: number; parallelism: number };
    saltHex: string;
    activeIndexSlot: number;
    indexOffset: number;
    indexLength: number;
    failCount: number;
    createdAt: string;
  }>;
  unlockVault(
    headerHex: string,
    password: string
  ): Promise<{ encKeyHex: string; hmacKeyHex: string }>;
  encryptVaultIndex(keyHex: string, indexJson: string): Promise<string>;
  decryptVaultIndex(keyHex: string, dataHex: string): Promise<string>;
  encryptFileRecord(keyHex: string, dataHex: string, cipherId: number): Promise<string>;
  decryptFileRecord(
    keyHex: string,
    dataHex: string
  ): Promise<{ dataHex: string; metadata: { name: string; size: number; cipherId: number } }>;
  readFailCounter(headerHex: string, keyHex: string): Promise<number>;
  resetFailCounter(headerHex: string, keyHex: string): Promise<string>;
  incrementFailCounter(headerHex: string, keyHex: string): Promise<string>;
  commitVaultIndex(
    headerHex: string,
    keyHex: string,
    indexOffset: number,
    indexLength: number
  ): Promise<string>;
}

// ─── Hex helpers ───────────────────────────────────────────────

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

// ─── Web Crypto API fallback (development only) ────────────────

let _streamSessions: Map<string, { key: CryptoKey; counter: number }> = new Map();
let _sessionCounter = 0;

// ─── Vault header helpers ──────────────────────────────────────

const HEADER_SIZE = 24576;
const MAGIC = new TextEncoder().encode('USBVLT04');
const VERIFY_MARKER = 'USBVAULT_VERIFY_OK_0000';

/** Write a u16 little-endian into buf at offset. */
function writeU16LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
}

/** Read a u16 little-endian from buf at offset. */
function readU16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

/** Write a u32 little-endian into buf at offset. */
function writeU32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >> 8) & 0xff;
  buf[offset + 2] = (value >> 16) & 0xff;
  buf[offset + 3] = (value >> 24) & 0xff;
}

/** Read a u32 little-endian from buf at offset. */
function readU32LE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset] |
      (buf[offset + 1] << 8) |
      (buf[offset + 2] << 16) |
      ((buf[offset + 3] << 24) >>> 0)) >>>
    0
  );
}

/** Write a u64 little-endian into buf at offset (limited to Number.MAX_SAFE_INTEGER). */
function writeU64LE(buf: Uint8Array, offset: number, value: number): void {
  const lo = value >>> 0;
  const hi = Math.floor(value / 0x100000000) >>> 0;
  writeU32LE(buf, offset, lo);
  writeU32LE(buf, offset + 4, hi);
}

/** Read a u64 little-endian from buf at offset (limited to Number.MAX_SAFE_INTEGER). */
function readU64LE(buf: Uint8Array, offset: number): number {
  const lo = readU32LE(buf, offset);
  const hi = readU32LE(buf, offset + 4);
  return lo + hi * 0x100000000;
}

/** Compute HMAC-SHA256 of data using key bytes. */
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, data.buffer as ArrayBuffer);
  return new Uint8Array(sig);
}

/** AES-GCM encrypt raw bytes with a 32-byte key, returning nonce(12) || ciphertext+tag. */
async function aesGcmEncryptRaw(keyBytes: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    'AES-GCM',
    false,
    ['encrypt']
  );
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext.buffer as ArrayBuffer
  );
  const result = new Uint8Array(12 + ct.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ct), 12);
  return result;
}

/** AES-GCM decrypt nonce(12) || ciphertext+tag with a 32-byte key. */
async function aesGcmDecryptRaw(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    'AES-GCM',
    false,
    ['decrypt']
  );
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
    key,
    ct.buffer as ArrayBuffer
  );
  return new Uint8Array(pt);
}

/**
 * Compute the header HMAC over salt + verify_iv + verify_ct_len + verify_ct.
 * hmacKey is the second 32 bytes of the MEK.
 */
async function computeHeaderHMAC(header: Uint8Array, hmacKey: Uint8Array): Promise<Uint8Array> {
  const salt = header.slice(10, 42);
  const verifyIv = header.slice(42, 66);
  const verifyCTLen = readU16LE(header, 66);
  const verifyCT = header.slice(68, 68 + verifyCTLen);
  // Concat: salt(32) + verifyIv(24) + verifyCTLenBytes(2) + verifyCT
  const combined = new Uint8Array(32 + 24 + 2 + verifyCTLen);
  combined.set(salt, 0);
  combined.set(verifyIv, 32);
  combined.set(header.slice(66, 68), 56); // len bytes
  combined.set(verifyCT, 58);
  return hmacSha256(hmacKey, combined);
}

/**
 * Compute fail counter HMAC.
 * Domain = "USBVault-FailCounter-v1:" (23 bytes) + counter_le_bytes (4 bytes).
 */
async function computeFailCounterHMAC(counter: number, hmacKey: Uint8Array): Promise<Uint8Array> {
  const domain = new TextEncoder().encode('USBVault-FailCounter-v1:');
  const counterBuf = new Uint8Array(4);
  writeU32LE(counterBuf, 0, counter);
  const msg = new Uint8Array(domain.length + 4);
  msg.set(domain, 0);
  msg.set(counterBuf, domain.length);
  return hmacSha256(hmacKey, msg);
}

/**
 * Find the fail counter block offset in the header.
 * After verify ciphertext + header HMAC + index metadata + argon2 params + identity + tfa blocks.
 */
function getFailCounterBlockOffset(header: Uint8Array): number {
  const verifyCTLen = readU16LE(header, 66);
  let offset = 68 + verifyCTLen + 32; // after verify ct + header HMAC
  // active_index_slot(1) + index1_offset(4) + index1_length(4) + index2_offset(4) + index2_length(4)
  // + commit_counter(8) + argon2_memory(4) + argon2_time(4) + argon2_parallelism(1)
  offset += 1 + 4 + 4 + 4 + 4 + 8 + 4 + 4 + 1; // = 34
  // identity_block_len(4) + identity_block
  const identityBlockLen = readU32LE(header, offset);
  offset += 4 + identityBlockLen;
  // tfa_block_len(4) + tfa_block
  const tfaBlockLen = readU32LE(header, offset);
  offset += 4 + tfaBlockLen;
  // fail_counter_block_len(4) — the block starts here
  return offset;
}

/** Get the offset of the index metadata section (after verify CT + header HMAC). */
function getIndexMetadataOffset(header: Uint8Array): number {
  const verifyCTLen = readU16LE(header, 66);
  return 68 + verifyCTLen + 32;
}

const webCryptoFallback: USBVaultCryptoModule = {
  async deriveKey(password: string, saltHex: string): Promise<string> {
    const salt = fromHex(saltHex);
    // Match native Rust Argon2id parameters: 64MB memory, 3 iterations, 4 parallelism
    const hash = await argon2id({
      password,
      salt,
      parallelism: 4,
      iterations: 3,
      memorySize: 65536, // 64 MiB
      hashLength: 32, // 256-bit key
      outputType: 'hex',
    });
    return hash;
  },

  async encrypt(keyHex: string, plaintextHex: string, _aadHex?: string): Promise<string> {
    const keyBytes = fromHex(keyHex);
    const plaintext = fromHex(plaintextHex);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      'AES-GCM',
      false,
      ['encrypt']
    );
    const encParams: AesGcmParams = { name: 'AES-GCM', iv };
    if (_aadHex) {
      // Bind the associated data (e.g. version/header) so it is authenticated —
      // dropping it silently defeated rollback/version binding on web.
      encParams.additionalData = fromHex(_aadHex).buffer as ArrayBuffer;
    }
    const ciphertext = await crypto.subtle.encrypt(encParams, key, plaintext.buffer as ArrayBuffer);
    // Return iv || ciphertext (tag is appended by AES-GCM)
    const result = new Uint8Array(iv.length + ciphertext.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(ciphertext), iv.length);
    return toHex(result);
  },

  async decrypt(keyHex: string, ciphertextHex: string, _aadHex?: string): Promise<string> {
    const keyBytes = fromHex(keyHex);
    const data = fromHex(ciphertextHex);
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      'AES-GCM',
      false,
      ['decrypt']
    );
    const decParams: AesGcmParams = { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer };
    if (_aadHex) {
      decParams.additionalData = fromHex(_aadHex).buffer as ArrayBuffer;
    }
    const plaintext = await crypto.subtle.decrypt(decParams, key, ciphertext.buffer as ArrayBuffer);
    return toHex(new Uint8Array(plaintext));
  },

  async streamEncryptInit(keyHex: string): Promise<string> {
    const keyBytes = fromHex(keyHex);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      'AES-GCM',
      false,
      ['encrypt']
    );
    const id = `web-stream-${++_sessionCounter}`;
    _streamSessions.set(id, { key, counter: 0 });
    return id;
  },

  async streamEncryptChunk(
    sessionId: string,
    chunkBase64: string,
    _isFinal: boolean
  ): Promise<string> {
    const session = _streamSessions.get(sessionId);
    if (!session) throw new Error(`Stream session ${sessionId} not found`);
    // Decode base64 to bytes
    const binary = atob(chunkBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      session.key,
      bytes.buffer as ArrayBuffer
    );
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);
    session.counter++;
    return toHex(result);
  },

  async streamDecryptInit(keyHex: string): Promise<string> {
    const keyBytes = fromHex(keyHex);
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      'AES-GCM',
      false,
      ['decrypt']
    );
    const id = `web-stream-${++_sessionCounter}`;
    _streamSessions.set(id, { key, counter: 0 });
    return id;
  },

  async streamDecryptChunk(
    sessionId: string,
    chunkBase64: string,
    _isFinal: boolean
  ): Promise<string> {
    const session = _streamSessions.get(sessionId);
    if (!session) throw new Error(`Stream session ${sessionId} not found`);
    const binary = atob(chunkBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      session.key,
      ciphertext.buffer as ArrayBuffer
    );
    session.counter++;
    return toHex(new Uint8Array(decrypted));
  },

  async streamFree(sessionId: string): Promise<void> {
    _streamSessions.delete(sessionId);
  },

  async generateShareKeypair(): Promise<{ public: string; private: string }> {
    // 32-byte X25519 keypair matching the native Rust sharing contract
    // (usbvault-crypto sharing::generate_keypair). The bridge and native path
    // reject non-32-byte keys, so this MUST be raw X25519, not ECDH P-256 SPKI.
    const secret = x25519.utils.randomSecretKey();
    const publicKey = x25519.getPublicKey(secret);
    return {
      public: toHex(publicKey),
      private: toHex(secret),
    };
  },

  async sealToPublicKey(recipientPublicHex: string, plaintextHex: string): Promise<string> {
    // X25519 sealed box, byte-identical to Rust sharing::seal:
    //   ephemeral X25519 -> ECDH -> HKDF-SHA256(info="seal", 32B) ->
    //   XChaCha20-Poly1305(24B nonce); output ephemeral_public(32) || nonce(24) ||
    //   ciphertext||tag(16). Interoperable with the native/Rust recipients.
    try {
      const recipientPublic = fromHex(recipientPublicHex);
      if (recipientPublic.length !== 32) {
        throw new Error('Recipient public key must be 32 bytes');
      }

      const ephemeralSecret = x25519.utils.randomSecretKey();
      const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
      const shared = x25519.getSharedSecret(ephemeralSecret, recipientPublic);
      // Reject an all-zero shared secret (low-order recipient key) — matches the
      // Rust CR-5 low-order-point check; a zero shared secret breaks encryption.
      if (shared.every(b => b === 0)) {
        throw new Error('Invalid recipient public key (low-order point)');
      }

      const key = hkdf(sha256, shared, undefined, SHARE_SEAL_INFO, 32);
      const nonce = crypto.getRandomValues(new Uint8Array(24));
      const ciphertext = xchacha20poly1305(key, nonce).encrypt(fromHex(plaintextHex));

      const sealed = new Uint8Array(32 + 24 + ciphertext.length);
      sealed.set(ephemeralPublic, 0);
      sealed.set(nonce, 32);
      sealed.set(ciphertext, 56);
      return toHex(sealed);
    } catch (error) {
      logger.error('Error in sealToPublicKey:', error);
      throw new Error('Failed to seal plaintext to public key');
    }
  },

  async openSealed(secretKeyHex: string, sealedHex: string): Promise<string> {
    // Inverse of sealToPublicKey; also opens native/Rust-sealed boxes since the
    // construction is identical (X25519 ECDH -> HKDF-SHA256("seal") ->
    // XChaCha20-Poly1305 over ephemeral_public(32) || nonce(24) || ct||tag).
    try {
      const secret = fromHex(secretKeyHex);
      if (secret.length !== 32) {
        throw new Error('Secret key must be 32 bytes');
      }
      const sealed = fromHex(sealedHex);
      if (sealed.length < 32 + 24 + 16) {
        throw new Error('Sealed ciphertext too short');
      }

      const ephemeralPublic = sealed.slice(0, 32);
      const nonce = sealed.slice(32, 56);
      const ciphertext = sealed.slice(56);

      const shared = x25519.getSharedSecret(secret, ephemeralPublic);
      if (shared.every(b => b === 0)) {
        throw new Error('Invalid ephemeral public key (low-order point)');
      }
      const key = hkdf(sha256, shared, undefined, SHARE_SEAL_INFO, 32);
      const plaintext = xchacha20poly1305(key, nonce).decrypt(ciphertext);

      return toHex(plaintext);
    } catch (error) {
      logger.error('Error in openSealed:', error);
      throw new Error('Failed to open sealed ciphertext');
    }
  },

  async getVersion(): Promise<string> {
    return '0.1.0-web-fallback';
  },

  async srpGenerateClientEphemeral(): Promise<{ public: string; private: string }> {
    // SECURITY FIX (H-1): Generate a proper ECDH keypair instead of unrelated random bytes.
    // The SRP-6a protocol requires the public value A = g^a mod N. In our Web Crypto
    // adaptation, we use P-256 ECDH as the underlying DH group, so A and a are a
    // mathematically related keypair that can be used for key agreement.
    const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ]);

    const privateKeyData = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const publicKeyData = await crypto.subtle.exportKey('spki', keyPair.publicKey);

    return {
      public: toHex(new Uint8Array(publicKeyData)),
      private: toHex(new Uint8Array(privateKeyData)),
    };
  },

  async srpDeriveSession(
    _clientPrivateHex: string,
    _serverPublicHex: string,
    _saltHex: string,
    _username: string,
    _password: string
  ): Promise<{ proof: string; key: string }> {
    // F7: The previous web implementation here was a FAKE — it merely Argon2id-
    // hashed the password into "proof"+"key" with NO modular exponentiation, so it
    // could never complete a real SRP-6a handshake with the Go server. The real,
    // byte-for-byte interoperable SRP-6a client now lives in crypto/srpClient.ts
    // and is wired directly into services/auth.ts on every platform. Nothing in the
    // app should call this web-fallback method anymore; fail loudly if it does so a
    // fake SRP path can never silently come back.
    throw new Error(
      'srpDeriveSession (web fallback) is removed. Use the real SRP-6a client in ' +
        'crypto/srpClient.ts (wired through services/auth.ts).'
    );
  },

  async hashSha256(dataHex: string): Promise<string> {
    const data = fromHex(dataHex);
    const hash = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
    return toHex(new Uint8Array(hash));
  },

  async randomBytes(length: number): Promise<string> {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return toHex(bytes);
  },

  async generateSigningKeypair(): Promise<{ public: string; private: string }> {
    // Web fallback: Use Ed25519 if available, otherwise ECDSA P-256
    // Ed25519 is supported in modern browsers (Chrome 113+, Safari 17+, Firefox 130+)
    try {
      const keyPair = await crypto.subtle.generateKey(
        'Ed25519',
        true, // extractable for export
        ['sign', 'verify']
      );
      const privateKeyData = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
      const publicKeyData = await crypto.subtle.exportKey('raw', keyPair.publicKey);
      return {
        public: toHex(new Uint8Array(publicKeyData)),
        private: toHex(new Uint8Array(privateKeyData)),
      };
    } catch {
      // Fallback: derive a 32-byte "signing key" from random bytes
      // WARNING: This is NOT real Ed25519 — dev/preview only
      logger.warn(
        '[USBVault] Ed25519 not available in this browser. Using random keypair placeholder for dev preview.'
      );
      const privateBytes = crypto.getRandomValues(new Uint8Array(64));
      const publicBytes = crypto.getRandomValues(new Uint8Array(32));
      return {
        public: toHex(publicBytes),
        private: toHex(privateBytes),
      };
    }
  },

  async sign(privateKeyHex: string, messageHex: string): Promise<string> {
    try {
      const privateKeyBytes = fromHex(privateKeyHex);
      const message = fromHex(messageHex);
      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        privateKeyBytes.buffer as ArrayBuffer,
        'Ed25519',
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign(
        'Ed25519',
        privateKey,
        message.buffer as ArrayBuffer
      );
      return toHex(new Uint8Array(signature));
    } catch {
      // Fallback: HMAC-based signature for dev preview
      logger.warn('[USBVault] Ed25519 sign not available. Using HMAC fallback for dev preview.');
      const key = await crypto.subtle.importKey(
        'raw',
        fromHex(privateKeyHex.substring(0, 64)).buffer as ArrayBuffer,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sig = await crypto.subtle.sign('HMAC', key, fromHex(messageHex).buffer as ArrayBuffer);
      return toHex(new Uint8Array(sig));
    }
  },

  async verify(publicKeyHex: string, messageHex: string, signatureHex: string): Promise<boolean> {
    try {
      const publicKeyBytes = fromHex(publicKeyHex);
      const message = fromHex(messageHex);
      const signature = fromHex(signatureHex);
      const publicKey = await crypto.subtle.importKey(
        'raw',
        publicKeyBytes.buffer as ArrayBuffer,
        'Ed25519',
        false,
        ['verify']
      );
      return await crypto.subtle.verify(
        'Ed25519',
        publicKey,
        signature.buffer as ArrayBuffer,
        message.buffer as ArrayBuffer
      );
    } catch {
      logger.warn('[USBVault] Ed25519 verify not available. Returning false for dev preview.');
      return false;
    }
  },

  async createVaultHeader(
    password: string,
    cipherId: number
  ): Promise<{ headerHex: string; encKeyHex: string; hmacKeyHex: string }> {
    const header = new Uint8Array(HEADER_SIZE);

    // Magic "USBVLT04"
    header.set(MAGIC, 0);

    // KDF Hash ID = 2 (Argon2id)
    header[8] = 2;

    // Cipher ID (use 3 = AES-GCM-SIV on web since we only have AES-GCM)
    header[9] = cipherId || 3;

    // Salt (32 random bytes)
    const salt = crypto.getRandomValues(new Uint8Array(32));
    header.set(salt, 10);

    // Derive KEK from password + salt
    const saltHex = toHex(salt);
    const kekHex = await this.deriveKey(password, saltHex);
    const kek = fromHex(kekHex);

    // Generate MEK: 64 random bytes (first 32 = enc key, second 32 = HMAC key)
    const mek = crypto.getRandomValues(new Uint8Array(64));
    const encKey = mek.slice(0, 32);
    const hmacKey = mek.slice(32, 64);

    // Verify marker: AES-GCM encrypt "USBVAULT_VERIFY_OK_0000" with encKey
    const markerBytes = new TextEncoder().encode(VERIFY_MARKER);
    const verifyEncrypted = await aesGcmEncryptRaw(encKey, markerBytes);
    // verifyEncrypted = nonce(12) + ciphertext+tag

    // Verify IV: store 12 real nonce bytes + 12 zero bytes at offset 42
    header.set(verifyEncrypted.slice(0, 12), 42); // first 12 bytes of IV field
    // bytes 54-65 remain zero (12 zero pad bytes)

    // Verify ciphertext (without the nonce)
    const verifyCT = verifyEncrypted.slice(12);
    writeU16LE(header, 66, verifyCT.length);
    header.set(verifyCT, 68);

    // Header HMAC (over salt + verify_iv + verify_ct_len + verify_ct)
    const headerHmac = await computeHeaderHMAC(header, hmacKey);
    let offset = 68 + verifyCT.length;
    header.set(headerHmac, offset);
    offset += 32;

    // Index metadata
    header[offset] = 0; // active_index_slot
    offset += 1;
    writeU32LE(header, offset, HEADER_SIZE); // index1_offset
    offset += 4;
    writeU32LE(header, offset, 0); // index1_length
    offset += 4;
    writeU32LE(header, offset, HEADER_SIZE); // index2_offset
    offset += 4;
    writeU32LE(header, offset, 0); // index2_length
    offset += 4;
    writeU64LE(header, offset, 0); // commit_counter
    offset += 8;
    writeU32LE(header, offset, 65536); // argon2_memory
    offset += 4;
    writeU32LE(header, offset, 3); // argon2_time
    offset += 4;
    header[offset] = 4; // argon2_parallelism
    offset += 1;

    // identity_block_len = 0
    writeU32LE(header, offset, 0);
    offset += 4;

    // tfa_block_len = 0
    writeU32LE(header, offset, 0);
    offset += 4;

    // fail_counter_block_len = 36 (4 bytes counter + 32 bytes HMAC)
    writeU32LE(header, offset, 36);
    offset += 4;

    // fail counter = 0 (u32 LE)
    writeU32LE(header, offset, 0);
    offset += 4;

    // fail counter HMAC
    const failHmac = await computeFailCounterHMAC(0, hmacKey);
    header.set(failHmac, offset);
    offset += 32;

    // Wrap MEK: AES-GCM encrypt MEK(64 bytes) with KEK
    const wrappedMek = await aesGcmEncryptRaw(kek, mek);
    // wrappedMek = nonce(12) + ciphertext(64+16tag) = 92 bytes
    writeU32LE(header, offset, wrappedMek.length);
    offset += 4;
    header.set(wrappedMek, offset);
    offset += wrappedMek.length;

    // state_version = 1 (u64 LE)
    writeU64LE(header, offset, 1);
    offset += 8;

    // index_encrypted = 1
    header[offset] = 1;

    return {
      headerHex: toHex(header),
      encKeyHex: toHex(encKey),
      hmacKeyHex: toHex(hmacKey),
    };
  },

  async readVaultHeader(headerHex: string): Promise<{
    version: number;
    cipherId: number;
    kdfParams: { memory: number; iterations: number; parallelism: number };
    saltHex: string;
    activeIndexSlot: number;
    indexOffset: number;
    indexLength: number;
    failCount: number;
    createdAt: string;
  }> {
    const header = fromHex(headerHex);

    // Validate magic
    const magic = new TextDecoder().decode(header.slice(0, 8));
    if (magic !== 'USBVLT04') {
      throw new Error(`Invalid vault magic: ${magic}`);
    }

    const cipherId = header[9];
    const saltHex = toHex(header.slice(10, 42));

    // Parse index metadata
    const metaOffset = getIndexMetadataOffset(header);
    const activeIndexSlot = header[metaOffset];
    let off = metaOffset + 1;

    const index1Offset = readU32LE(header, off);
    off += 4;
    const index1Length = readU32LE(header, off);
    off += 4;
    const index2Offset = readU32LE(header, off);
    off += 4;
    const index2Length = readU32LE(header, off);
    off += 4;
    off += 8; // commit_counter

    const argon2Memory = readU32LE(header, off);
    off += 4;
    const argon2Time = readU32LE(header, off);
    off += 4;
    const argon2Parallelism = header[off];
    off += 1;

    // Determine active index offset/length
    const indexOffset = activeIndexSlot === 0 ? index1Offset : index2Offset;
    const indexLength = activeIndexSlot === 0 ? index1Length : index2Length;

    // Read fail counter
    const fcBlockOffset = getFailCounterBlockOffset(header);
    const fcBlockLen = readU32LE(header, fcBlockOffset);
    let failCount = 0;
    if (fcBlockLen >= 4) {
      failCount = readU32LE(header, fcBlockOffset + 4);
    }

    return {
      version: 4,
      cipherId,
      kdfParams: {
        memory: argon2Memory,
        iterations: argon2Time,
        parallelism: argon2Parallelism,
      },
      saltHex,
      activeIndexSlot,
      indexOffset,
      indexLength,
      failCount,
      createdAt: new Date().toISOString(),
    };
  },

  async unlockVault(
    headerHex: string,
    password: string
  ): Promise<{ encKeyHex: string; hmacKeyHex: string }> {
    const header = fromHex(headerHex);

    // Validate magic
    const magic = new TextDecoder().decode(header.slice(0, 8));
    if (magic !== 'USBVLT04') {
      throw new Error(`Invalid vault magic: ${magic}`);
    }

    // Extract salt
    const salt = header.slice(10, 42);

    // Read Argon2 params from header
    const metaOffset = getIndexMetadataOffset(header);
    let off = metaOffset + 1 + 4 + 4 + 4 + 4 + 8; // skip to argon2 params
    const argon2Memory = readU32LE(header, off);
    off += 4;
    const argon2Time = readU32LE(header, off);
    off += 4;
    const argon2Parallelism = header[off];

    // Derive KEK from password + salt using header's Argon2 params
    const kekHex = await argon2id({
      password,
      salt,
      parallelism: argon2Parallelism,
      iterations: argon2Time,
      memorySize: argon2Memory,
      hashLength: 32,
      outputType: 'hex',
    });
    const kek = fromHex(kekHex);

    // Find and unwrap MEK
    const fcBlockOffset = getFailCounterBlockOffset(header);
    const fcBlockLen = readU32LE(header, fcBlockOffset);
    let wrappedOffset = fcBlockOffset + 4 + fcBlockLen;

    const wrappedMekLen = readU32LE(header, wrappedOffset);
    wrappedOffset += 4;
    const wrappedMek = header.slice(wrappedOffset, wrappedOffset + wrappedMekLen);

    // Decrypt wrapped MEK with KEK
    const mek = await aesGcmDecryptRaw(kek, wrappedMek);
    if (mek.length !== 64) {
      throw new Error('Invalid MEK length after unwrap');
    }

    const encKey = mek.slice(0, 32);
    const hmacKey = mek.slice(32, 64);

    // Verify the marker
    const verifyIv = header.slice(42, 54); // 12 real nonce bytes
    const verifyCTLen = readU16LE(header, 66);
    const verifyCT = header.slice(68, 68 + verifyCTLen);
    // Reconstruct nonce(12) || ciphertext for decryption
    const verifyBlob = new Uint8Array(12 + verifyCTLen);
    verifyBlob.set(verifyIv, 0);
    verifyBlob.set(verifyCT, 12);
    const markerBytes = await aesGcmDecryptRaw(encKey, verifyBlob);
    const marker = new TextDecoder().decode(markerBytes);
    if (marker !== VERIFY_MARKER) {
      throw new Error('Vault verification failed — wrong password or corrupted header');
    }

    return {
      encKeyHex: toHex(encKey),
      hmacKeyHex: toHex(hmacKey),
    };
  },

  async encryptVaultIndex(keyHex: string, indexJson: string): Promise<string> {
    const plaintextHex = toHex(new TextEncoder().encode(indexJson));
    return this.encrypt(keyHex, plaintextHex);
  },

  async decryptVaultIndex(keyHex: string, dataHex: string): Promise<string> {
    const plaintextHex = await this.decrypt(keyHex, dataHex);
    const bytes = fromHex(plaintextHex);
    return new TextDecoder().decode(bytes);
  },

  async encryptFileRecord(keyHex: string, dataHex: string, cipherId: number): Promise<string> {
    const data = fromHex(dataHex);

    // Build metadata header: "V2RC"(4) + cipherId(u32 LE) + originalSize(u32 LE)
    const metaHeader = new Uint8Array(12);
    metaHeader[0] = 0x56; // 'V'
    metaHeader[1] = 0x32; // '2'
    metaHeader[2] = 0x52; // 'R'
    metaHeader[3] = 0x43; // 'C'
    writeU32LE(metaHeader, 4, cipherId);
    writeU32LE(metaHeader, 8, data.length);

    // Combine metadata header + original data
    const combined = new Uint8Array(12 + data.length);
    combined.set(metaHeader, 0);
    combined.set(data, 12);

    // Encrypt the whole blob
    const combinedHex = toHex(combined);
    return this.encrypt(keyHex, combinedHex);
  },

  async decryptFileRecord(
    keyHex: string,
    dataHex: string
  ): Promise<{ dataHex: string; metadata: { name: string; size: number; cipherId: number } }> {
    const plaintextHex = await this.decrypt(keyHex, dataHex);
    const plaintext = fromHex(plaintextHex);

    // Extract metadata header: "V2RC"(4) + cipherId(u32 LE) + originalSize(u32 LE)
    const magicStr = new TextDecoder().decode(plaintext.slice(0, 4));
    if (magicStr !== 'V2RC') {
      throw new Error(`Invalid file record magic: ${magicStr}`);
    }
    const recordCipherId = readU32LE(plaintext, 4);
    const originalSize = readU32LE(plaintext, 8);
    const fileData = plaintext.slice(12);

    return {
      dataHex: toHex(fileData),
      metadata: {
        name: '', // Name is stored in the vault index, not in the file record
        size: originalSize,
        cipherId: recordCipherId,
      },
    };
  },

  async readFailCounter(headerHex: string, _keyHex: string): Promise<number> {
    const header = fromHex(headerHex);
    const fcBlockOffset = getFailCounterBlockOffset(header);
    const fcBlockLen = readU32LE(header, fcBlockOffset);
    if (fcBlockLen < 4) return 0;
    return readU32LE(header, fcBlockOffset + 4);
  },

  async resetFailCounter(headerHex: string, keyHex: string): Promise<string> {
    const header = fromHex(headerHex);
    const hmacKey = fromHex(keyHex);

    const fcBlockOffset = getFailCounterBlockOffset(header);
    // Write counter = 0
    writeU32LE(header, fcBlockOffset + 4, 0);
    // Recompute fail counter HMAC
    const hmac = await computeFailCounterHMAC(0, hmacKey);
    header.set(hmac, fcBlockOffset + 4 + 4);

    return toHex(header);
  },

  async incrementFailCounter(headerHex: string, keyHex: string): Promise<string> {
    const header = fromHex(headerHex);
    const hmacKey = fromHex(keyHex);

    const fcBlockOffset = getFailCounterBlockOffset(header);
    const currentCount = readU32LE(header, fcBlockOffset + 4);
    const newCount = currentCount + 1;

    // Write new counter
    writeU32LE(header, fcBlockOffset + 4, newCount);
    // Recompute fail counter HMAC
    const hmac = await computeFailCounterHMAC(newCount, hmacKey);
    header.set(hmac, fcBlockOffset + 4 + 4);

    return toHex(header);
  },

  async commitVaultIndex(
    headerHex: string,
    keyHex: string,
    indexOffset: number,
    indexLength: number
  ): Promise<string> {
    const header = fromHex(headerHex);
    const hmacKey = fromHex(keyHex);

    const metaOffset = getIndexMetadataOffset(header);
    const activeSlot = header[metaOffset];
    const newSlot = activeSlot === 0 ? 1 : 0;

    let off = metaOffset;
    // Flip active_index_slot
    header[off] = newSlot;
    off += 1;

    if (newSlot === 0) {
      // Update index1
      writeU32LE(header, off, indexOffset); // index1_offset
      off += 4;
      writeU32LE(header, off, indexLength); // index1_length
      off += 4 + 4 + 4; // skip index2_offset + index2_length
    } else {
      // Update index2
      off += 4 + 4; // skip index1_offset + index1_length
      writeU32LE(header, off, indexOffset); // index2_offset
      off += 4;
      writeU32LE(header, off, indexLength); // index2_length
      off += 4;
    }

    // Increment commit_counter
    const commitCounter = readU64LE(header, off);
    writeU64LE(header, off, commitCounter + 1);
    off += 8;

    // Skip argon2 params to find state_version after wrapped_mek
    // We need to find state_version — it's after wrapped_mek
    const fcBlockOffset = getFailCounterBlockOffset(header);
    const fcBlockLen = readU32LE(header, fcBlockOffset);
    let svOffset = fcBlockOffset + 4 + fcBlockLen;
    const wrappedMekLen = readU32LE(header, svOffset);
    svOffset += 4 + wrappedMekLen;

    // Increment state_version
    const stateVersion = readU64LE(header, svOffset);
    writeU64LE(header, svOffset, stateVersion + 1);

    // Recompute header HMAC
    const newHmac = await computeHeaderHMAC(header, hmacKey);
    const verifyCTLen = readU16LE(header, 66);
    header.set(newHmac, 68 + verifyCTLen);

    return toHex(header);
  },
};

// ─── Module resolution ─────────────────────────────────────────

let _resolvedModule: USBVaultCryptoModule | null = null;

function getModule(): USBVaultCryptoModule {
  if (_resolvedModule) return _resolvedModule;

  if (Platform.OS === 'web') {
    logger.info('[USBVault] Using Web Crypto API with WASM Argon2id for web platform.');
    _resolvedModule = webCryptoFallback;
    return _resolvedModule;
  }

  // Native platform — load the Rust module
  const { NativeModules: NM } = require('react-native');
  const { USBVaultCrypto } = NM;
  if (!USBVaultCrypto) {
    throw new Error(
      'USBVaultCrypto native module not found. ' +
        'Ensure the module is properly linked in your React Native project.'
    );
  }
  _resolvedModule = USBVaultCrypto as USBVaultCryptoModule;
  return _resolvedModule;
}

/**
 * Assert that the native crypto module is available.
 * On web, this always succeeds (uses Web Crypto API fallback).
 */
export function assertNativeAvailable(): void {
  if (Platform.OS === 'web') return; // Web fallback is always available
  try {
    getModule();
  } catch (error) {
    throw new Error(
      'Native crypto module unavailable. The application cannot start without hardware-backed cryptography. ' +
        'Please ensure the Rust crypto library is properly linked as a native module.'
    );
  }
}

/**
 * Lazy-loaded module singleton.
 * Uses a Proxy so the module is only resolved when a method is actually called,
 * preventing crashes at import time on web.
 */
export const nativeModule: USBVaultCryptoModule = new Proxy({} as USBVaultCryptoModule, {
  get(_target, prop) {
    const mod = getModule();
    const value = (mod as any)[prop];
    if (typeof value === 'function') {
      return value.bind(mod);
    }
    return value;
  },
});
