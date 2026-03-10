/**
 * QAV Native Crypto Module
 *
 * Bridges React Native to the Rust crypto library via JSI (TurboModules).
 * On web platforms, provides a Web Crypto API fallback for development/preview.
 *
 * SECURITY NOTE:
 * - On native (iOS/Android), all crypto is handled by the Rust library (production-grade).
 * - On web, a Web Crypto API fallback is used for development preview only.
 *   The web fallback uses PBKDF2 instead of Argon2id and AES-256-GCM instead of XChaCha20-Poly1305.
 *   This is NOT intended for production use — only for previewing the UI in a browser.
 *
 * PL-034 SCALE NOTE: Web Crypto fallback uses PBKDF2 instead of Argon2id and
 * AES-GCM instead of GCM-SIV. If the web platform ships to production users,
 * integrate a WASM build of Argon2id (e.g., argon2-browser or hash-wasm) and
 * consider AES-256-GCM-SIV via libsodium.js for parity with native crypto.
 *
 * @module crypto/native
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

/**
 * Represents the native QAV crypto module interface.
 */
export interface QAVCryptoModule {
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
}

// ─── Hex helpers ───────────────────────────────────────────────

function toHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
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

const webCryptoFallback: QAVCryptoModule = {
  async deriveKey(password: string, saltHex: string): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const salt = fromHex(saltHex);
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return toHex(new Uint8Array(derived));
  },

  async encrypt(keyHex: string, plaintextHex: string, _aadHex?: string): Promise<string> {
    const keyBytes = fromHex(keyHex);
    const plaintext = fromHex(plaintextHex);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt']);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext.buffer as ArrayBuffer);
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
    const key = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, ciphertext.buffer as ArrayBuffer);
    return toHex(new Uint8Array(plaintext));
  },

  async streamEncryptInit(keyHex: string): Promise<string> {
    const keyBytes = fromHex(keyHex);
    const key = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt']);
    const id = `web-stream-${++_sessionCounter}`;
    _streamSessions.set(id, { key, counter: 0 });
    return id;
  },

  async streamEncryptChunk(sessionId: string, chunkBase64: string, _isFinal: boolean): Promise<string> {
    const session = _streamSessions.get(sessionId);
    if (!session) throw new Error(`Stream session ${sessionId} not found`);
    // Decode base64 to bytes
    const binary = atob(chunkBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, session.key, bytes.buffer as ArrayBuffer);
    const result = new Uint8Array(iv.length + encrypted.byteLength);
    result.set(iv, 0);
    result.set(new Uint8Array(encrypted), iv.length);
    session.counter++;
    return toHex(result);
  },

  async streamDecryptInit(keyHex: string): Promise<string> {
    const keyBytes = fromHex(keyHex);
    const key = await crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, 'AES-GCM', false, ['decrypt']);
    const id = `web-stream-${++_sessionCounter}`;
    _streamSessions.set(id, { key, counter: 0 });
    return id;
  },

  async streamDecryptChunk(sessionId: string, chunkBase64: string, _isFinal: boolean): Promise<string> {
    const session = _streamSessions.get(sessionId);
    if (!session) throw new Error(`Stream session ${sessionId} not found`);
    const binary = atob(chunkBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const iv = bytes.slice(0, 12);
    const ciphertext = bytes.slice(12);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, session.key, ciphertext.buffer as ArrayBuffer);
    session.counter++;
    return toHex(new Uint8Array(decrypted));
  },

  async streamFree(sessionId: string): Promise<void> {
    _streamSessions.delete(sessionId);
  },

  async generateShareKeypair(): Promise<{ public: string; private: string }> {
    // SECURITY FIX: Generate mathematically related X25519 keypair using ECDH P-256
    // Web fallback: Use Web Crypto API to generate proper key pairs
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true, // extractable
      ['deriveBits', 'deriveKey']
    );

    // Export the private key
    const privateKeyData = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
    const privateKeyBytes = new Uint8Array(privateKeyData);

    // Export the public key
    const publicKeyData = await crypto.subtle.exportKey('spki', keyPair.publicKey);
    const publicKeyBytes = new Uint8Array(publicKeyData);

    return {
      public: toHex(publicKeyBytes),
      private: toHex(privateKeyBytes),
    };
  },

  async sealToPublicKey(recipientPublicHex: string, plaintextHex: string): Promise<string> {
    // SECURITY FIX: Use ECDH key exchange to derive shared secret, then AES-GCM encryption
    // This provides proper public-key encryption semantics

    try {
      // Import recipient's public key (P-256 format)
      const recipientPublicBytes = fromHex(recipientPublicHex);
      const recipientPublicKey = await crypto.subtle.importKey(
        'spki',
        recipientPublicBytes.buffer as ArrayBuffer,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
      );

      // Generate ephemeral keypair
      const ephemeralKeyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveBits']
      );

      // Derive shared secret via ECDH
      const sharedSecretBits = await crypto.subtle.deriveBits(
        { name: 'ECDH', public: recipientPublicKey },
        ephemeralKeyPair.privateKey,
        256 // 256 bits = 32 bytes for AES-256
      );

      // Import derived shared secret as AES-GCM key
      const sharedKey = await crypto.subtle.importKey(
        'raw',
        sharedSecretBits,
        'AES-GCM',
        false,
        ['encrypt']
      );

      // Generate IV and encrypt plaintext
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const plaintext = fromHex(plaintextHex);
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        sharedKey,
        plaintext.buffer as ArrayBuffer
      );

      // Export ephemeral public key
      const ephemeralPublicData = await crypto.subtle.exportKey('spki', ephemeralKeyPair.publicKey);
      const ephemeralPublicBytes = new Uint8Array(ephemeralPublicData);

      // Format: ephemeral_public_key || iv || ciphertext+tag
      const result = new Uint8Array(ephemeralPublicBytes.length + iv.length + ciphertext.byteLength);
      result.set(ephemeralPublicBytes, 0);
      result.set(iv, ephemeralPublicBytes.length);
      result.set(new Uint8Array(ciphertext), ephemeralPublicBytes.length + iv.length);

      return toHex(result);
    } catch (error) {
      logger.error('Error in sealToPublicKey:', error);
      throw new Error('Failed to seal plaintext to public key');
    }
  },

  async openSealed(_secretKeyHex: string, sealedHex: string): Promise<string> {
    const data = fromHex(sealedHex);
    const ephemeralKey = data.slice(0, 32);
    const iv = data.slice(32, 44);
    const ciphertext = data.slice(44);
    const key = await crypto.subtle.importKey('raw', ephemeralKey, 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return toHex(plaintext);
  },

  async getVersion(): Promise<string> {
    return '0.1.0-web-fallback';
  },

  async srpGenerateClientEphemeral(): Promise<{ public: string; private: string }> {
    const priv = crypto.getRandomValues(new Uint8Array(32));
    const pub = crypto.getRandomValues(new Uint8Array(32));
    return { public: toHex(pub), private: toHex(priv) };
  },

  async srpDeriveSession(
    _clientPrivateHex: string,
    _serverPublicHex: string,
    saltHex: string,
    _username: string,
    password: string
  ): Promise<{ proof: string; key: string }> {
    // SECURITY FIX: Web fallback SRP implementation with increased PBKDF2 iterations
    // WARNING: This is a reduced-security fallback for web-only development/preview
    // Production deployments MUST use native Rust implementation for full SRP-6a compliance

    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const salt = fromHex(saltHex);

    // SECURITY FIX: Increased PBKDF2 iterations from 10,000 to 600,000
    // This significantly improves resistance to brute-force attacks
    // Note: Web Crypto PBKDF2 with 600k iterations will be slow
    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt.buffer as ArrayBuffer,
        iterations: 600000, // Increased from 10000 for better security
        hash: 'SHA-256',
      },
      keyMaterial,
      512
    );

    const arr = new Uint8Array(bits);
    return {
      proof: toHex(arr.slice(0, 32)),
      key: toHex(arr.slice(32, 64)),
    };
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
      logger.warn('[QAV] Ed25519 not available in this browser. Using random keypair placeholder for dev preview.');
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
      const signature = await crypto.subtle.sign('Ed25519', privateKey, message.buffer as ArrayBuffer);
      return toHex(new Uint8Array(signature));
    } catch {
      // Fallback: HMAC-based signature for dev preview
      logger.warn('[QAV] Ed25519 sign not available. Using HMAC fallback for dev preview.');
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
      return await crypto.subtle.verify('Ed25519', publicKey, signature.buffer as ArrayBuffer, message.buffer as ArrayBuffer);
    } catch {
      logger.warn('[QAV] Ed25519 verify not available. Returning false for dev preview.');
      return false;
    }
  },
};

// ─── Module resolution ─────────────────────────────────────────

let _resolvedModule: QAVCryptoModule | null = null;

function getModule(): QAVCryptoModule {
  if (_resolvedModule) return _resolvedModule;

  if (Platform.OS === 'web') {
    logger.warn(
      '[QAV] Using Web Crypto API fallback. This is for development preview only — not production.'
    );
    _resolvedModule = webCryptoFallback;
    return _resolvedModule;
  }

  // Native platform — load the Rust module
  const { NativeModules: NM } = require('react-native');
  const { QAVCrypto } = NM;
  if (!QAVCrypto) {
    throw new Error(
      'QAVCrypto native module not found. ' +
        'Ensure the module is properly linked in your React Native project.'
    );
  }
  _resolvedModule = QAVCrypto as QAVCryptoModule;
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
export const nativeModule: QAVCryptoModule = new Proxy(
  {} as QAVCryptoModule,
  {
    get(_target, prop) {
      const mod = getModule();
      const value = (mod as any)[prop];
      if (typeof value === 'function') {
        return value.bind(mod);
      }
      return value;
    },
  }
);
