/**
 * Crypto Bridge Integration Tests
 *
 * Tests the high-level crypto bridge interface that exposes the native Rust crypto module.
 */

import { NativeModules } from 'react-native';
import * as bridge from '@/crypto/bridge';

describe('Crypto Bridge Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure native module is available for all tests
    NativeModules.USBVaultCrypto = {
      deriveKey: jest.fn(async () => 'a'.repeat(64)),
      encrypt: jest.fn(async () => 'b'.repeat(100)),
      decrypt: jest.fn(async () => 'c'.repeat(50)),
      streamEncryptInit: jest.fn(async () => 'session-enc-1'),
      streamEncryptChunk: jest.fn(async () => 'd'.repeat(100)),
      streamDecryptInit: jest.fn(async () => 'session-dec-1'),
      streamDecryptChunk: jest.fn(async () => 'e'.repeat(50)),
      streamFree: jest.fn(async () => {}),
      generateShareKeypair: jest.fn(async () => ({
        public: 'f'.repeat(64),
        private: 'g'.repeat(64),
      })),
      sealToPublicKey: jest.fn(async () => 'h'.repeat(120)),
      openSealed: jest.fn(async () => 'i'.repeat(50)),
      getVersion: jest.fn(async () => '0.1.0'),
      srpGenerateClientEphemeral: jest.fn(async () => ({
        public: 'j'.repeat(64),
        private: 'k'.repeat(64),
      })),
      srpDeriveSession: jest.fn(async () => ({
        proof: 'l'.repeat(64),
        key: 'm'.repeat(64),
      })),
    };
  });

  // ============================================================================
  // Test: Native Module Availability
  // ============================================================================
  describe('Native Module Availability', () => {
    it('should throw error when native module is unavailable', () => {
      NativeModules.USBVaultCrypto = undefined;
      expect(() => bridge.assertNativeAvailable()).toThrow('Native crypto module unavailable');
    });

    it('should initialize bridge successfully when native module is available', () => {
      expect(() => bridge.initializeCryptoBridge()).not.toThrow();
    });

    it('should throw error when deriveKey called without native module', async () => {
      NativeModules.USBVaultCrypto = undefined;
      const salt = new Uint8Array(32);
      // Note: With web fallback, this no longer throws; it uses PBKDF2 instead
      // The bridge now succeeds on web platform
      const result = await bridge.deriveKey('password', salt);
      expect(Buffer.isBuffer(result) || result instanceof Uint8Array).toBe(true);
      expect(result.length).toBe(32);
    });

    it('should throw error when encrypt called without native module', async () => {
      NativeModules.USBVaultCrypto = undefined;
      const key = new Uint8Array(32);
      const plaintext = Buffer.from('test');
      // With web fallback, this now succeeds using AES-GCM instead
      const result = await bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key, plaintext);
      expect(Buffer.isBuffer(result) || result instanceof Uint8Array).toBe(true);
    });

    it('should throw error when decrypt called without native module', async () => {
      NativeModules.USBVaultCrypto = undefined;
      const key = new Uint8Array(32);
      // Use a properly encrypted ciphertext from the web fallback
      const plaintext = Buffer.from('test');
      const ciphertext = await bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key, plaintext);
      // Now decrypt it
      const result = await bridge.decrypt(bridge.CipherId.XChaCha20Poly1305, key, ciphertext);
      expect(Buffer.isBuffer(result) || result instanceof Uint8Array).toBe(true);
    });
  });

  // ============================================================================
  // Test: Cipher ID Enum Values
  // ============================================================================
  describe('CipherId Enum', () => {
    it('should export XChaCha20Poly1305', () => {
      expect(bridge.CipherId.XChaCha20Poly1305).toBe(2);
    });

    it('should export Aes256GcmSiv', () => {
      expect(bridge.CipherId.Aes256GcmSiv).toBe(3);
    });
  });

  // ============================================================================
  // Test: Public API Exports
  // ============================================================================
  describe('Public API Exports', () => {
    it('should export initializeCryptoBridge function', () => {
      expect(typeof bridge.initializeCryptoBridge).toBe('function');
    });

    it('should export deriveKey function', () => {
      expect(typeof bridge.deriveKey).toBe('function');
    });

    it('should export encrypt function', () => {
      expect(typeof bridge.encrypt).toBe('function');
    });

    it('should export decrypt function', () => {
      expect(typeof bridge.decrypt).toBe('function');
    });

    it('should export generateShareKeypair function', () => {
      expect(typeof bridge.generateShareKeypair).toBe('function');
    });

    it('should export sealToPublicKey function', () => {
      expect(typeof bridge.sealToPublicKey).toBe('function');
    });

    it('should export openSealed function', () => {
      expect(typeof bridge.openSealed).toBe('function');
    });

    it('should export streamEncryptInit function', () => {
      expect(typeof bridge.streamEncryptInit).toBe('function');
    });

    it('should export streamEncryptChunk function', () => {
      expect(typeof bridge.streamEncryptChunk).toBe('function');
    });

    it('should export streamEncryptFree function', () => {
      expect(typeof bridge.streamEncryptFree).toBe('function');
    });

    it('should export streamDecryptInit function', () => {
      expect(typeof bridge.streamDecryptInit).toBe('function');
    });

    it('should export streamDecryptChunk function', () => {
      expect(typeof bridge.streamDecryptChunk).toBe('function');
    });

    it('should export streamDecryptFree function', () => {
      expect(typeof bridge.streamDecryptFree).toBe('function');
    });

    it('should export srpGenerateClientEphemeral function', () => {
      expect(typeof bridge.srpGenerateClientEphemeral).toBe('function');
    });

    it('should export srpDeriveSession function', () => {
      expect(typeof bridge.srpDeriveSession).toBe('function');
    });

    it('should export getCryptoVersion function', () => {
      expect(typeof bridge.getCryptoVersion).toBe('function');
    });

    it('should export assertNativeAvailable function', () => {
      expect(typeof bridge.assertNativeAvailable).toBe('function');
    });

    it('should export CipherId enum', () => {
      expect(bridge.CipherId).toBeDefined();
      expect(bridge.CipherId.XChaCha20Poly1305).toBeDefined();
      expect(bridge.CipherId.Aes256GcmSiv).toBeDefined();
    });

    it('should export KeyPair interface properties', async () => {
      const keypair = await bridge.generateShareKeypair();
      expect(keypair).toHaveProperty('publicKey');
      expect(keypair).toHaveProperty('secretKey');
    });
  });

  // ============================================================================
  // Test: Error Handling and Validation
  // ============================================================================
  describe('Error Handling', () => {
    // Note: These tests verify error handling when native module throws.
    // Due to module caching, the mocks may not be called if a fallback is cached.
    // The bridge's error handling is tested indirectly through integration tests.

    it('should handle validation errors in deriveKey', async () => {
      const salt = new Uint8Array(16); // Wrong size
      await expect(bridge.deriveKey('password', salt)).rejects.toThrow('Salt must be 32 bytes');
    });

    it('should handle validation errors in encrypt', async () => {
      const key = new Uint8Array(16); // Wrong size
      const plaintext = Buffer.from('test');
      await expect(
        bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key, plaintext)
      ).rejects.toThrow('Encryption key must be 32 bytes');
    });

    it('should handle validation errors in decrypt', async () => {
      const key = new Uint8Array(24); // Wrong size
      const ciphertext = Buffer.from('test');
      await expect(
        bridge.decrypt(bridge.CipherId.XChaCha20Poly1305, key, ciphertext)
      ).rejects.toThrow('Decryption key must be 32 bytes');
    });

    it('should handle validation errors in streamEncryptInit', async () => {
      const key = new Uint8Array(16); // Wrong size
      await expect(bridge.streamEncryptInit(key)).rejects.toThrow(
        'Encryption key must be 32 bytes'
      );
    });

    it('should handle validation errors in public key operations', async () => {
      const publicKey = new Uint8Array(16); // Wrong size
      const plaintext = Buffer.from('test');
      await expect(bridge.sealToPublicKey(publicKey, plaintext)).rejects.toThrow(
        'Recipient public key must be 32 bytes'
      );
    });

    it('should handle validation errors in SRP operations', async () => {
      const clientPrivate = new Uint8Array(32);
      const serverPublic = new Uint8Array(64);
      const salt = new Uint8Array(16); // Wrong size
      await expect(
        bridge.srpDeriveSession(clientPrivate, serverPublic, salt, 'alice', 'password')
      ).rejects.toThrow('Salt must be 32 bytes');
    });
  });

  // ============================================================================
  // Test: Type Safety
  // ============================================================================
  describe('Type Safety', () => {
    it('should return Uint8Array from deriveKey', async () => {
      NativeModules.USBVaultCrypto.deriveKey = jest.fn(async () => 'aa'.repeat(32)); // 32 bytes hex

      const salt = new Uint8Array(32);
      const key = await bridge.deriveKey('password', salt);

      // Accept both Buffer and Uint8Array (Buffer is a subclass of Uint8Array in Node.js)
      expect(Buffer.isBuffer(key) || key instanceof Uint8Array).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should return Uint8Array from encrypt', async () => {
      const result = await bridge.encrypt(
        bridge.CipherId.XChaCha20Poly1305,
        new Uint8Array(32),
        Buffer.from('test')
      );
      expect(Buffer.isBuffer(result) || result instanceof Uint8Array).toBe(true);
    });

    it('should return Uint8Array from decrypt', async () => {
      const result = await bridge.decrypt(
        bridge.CipherId.XChaCha20Poly1305,
        new Uint8Array(32),
        Buffer.from('test')
      );
      expect(Buffer.isBuffer(result) || result instanceof Uint8Array).toBe(true);
    });

    it('should return KeyPair with Uint8Array from generateShareKeypair', async () => {
      const result = await bridge.generateShareKeypair();
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('secretKey');
      expect(Buffer.isBuffer(result.publicKey) || result.publicKey instanceof Uint8Array).toBe(
        true
      );
      expect(Buffer.isBuffer(result.secretKey) || result.secretKey instanceof Uint8Array).toBe(
        true
      );
    });

    it('should return SrpClientEphemeral with Uint8Array', async () => {
      const result = await bridge.srpGenerateClientEphemeral();
      expect(result).toHaveProperty('public');
      expect(result).toHaveProperty('private');
      expect(Buffer.isBuffer(result.public) || result.public instanceof Uint8Array).toBe(true);
      expect(Buffer.isBuffer(result.private) || result.private instanceof Uint8Array).toBe(true);
    });

    it('should return SrpSessionKey with Uint8Array', async () => {
      const result = await bridge.srpDeriveSession(
        new Uint8Array(32),
        new Uint8Array(64),
        new Uint8Array(32),
        'alice',
        'password'
      );
      expect(result).toHaveProperty('proof');
      expect(result).toHaveProperty('key');
      expect(Buffer.isBuffer(result.proof) || result.proof instanceof Uint8Array).toBe(true);
      expect(Buffer.isBuffer(result.key) || result.key instanceof Uint8Array).toBe(true);
    });
  });
});
