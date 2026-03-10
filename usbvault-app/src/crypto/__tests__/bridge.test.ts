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
    NativeModules.QAVCrypto = {
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
      NativeModules.QAVCrypto = undefined;
      expect(() => bridge.assertNativeAvailable()).toThrow('Native crypto module unavailable');
    });

    it('should initialize bridge successfully when native module is available', () => {
      expect(() => bridge.initializeCryptoBridge()).not.toThrow();
    });

    it('should throw error when deriveKey called without native module', async () => {
      NativeModules.QAVCrypto = undefined;
      const salt = new Uint8Array(32);
      await expect(bridge.deriveKey('password', salt)).rejects.toThrow();
    });

    it('should throw error when encrypt called without native module', async () => {
      NativeModules.QAVCrypto = undefined;
      const key = new Uint8Array(32);
      const plaintext = Buffer.from('test');
      await expect(bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key, plaintext)).rejects.toThrow();
    });

    it('should throw error when decrypt called without native module', async () => {
      NativeModules.QAVCrypto = undefined;
      const key = new Uint8Array(32);
      const ciphertext = Buffer.from('test');
      await expect(bridge.decrypt(bridge.CipherId.XChaCha20Poly1305, key, ciphertext)).rejects.toThrow();
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
    it('should throw error if deriveKey throws from native module', async () => {
      NativeModules.QAVCrypto.deriveKey = jest.fn(async () => {
        throw new Error('Native deriveKey failed');
      });

      const salt = new Uint8Array(32);
      await expect(bridge.deriveKey('password', salt)).rejects.toThrow('Key derivation failed');
    });

    it('should throw error if encrypt throws from native module', async () => {
      NativeModules.QAVCrypto.encrypt = jest.fn(async () => {
        throw new Error('Native encrypt failed');
      });

      const key = new Uint8Array(32);
      const plaintext = Buffer.from('test');
      await expect(bridge.encrypt(bridge.CipherId.XChaCha20Poly1305, key, plaintext)).rejects.toThrow(
        'Encryption failed'
      );
    });

    it('should throw error if decrypt throws from native module', async () => {
      NativeModules.QAVCrypto.decrypt = jest.fn(async () => {
        throw new Error('Native decrypt failed');
      });

      const key = new Uint8Array(32);
      const ciphertext = Buffer.from('test');
      await expect(bridge.decrypt(bridge.CipherId.XChaCha20Poly1305, key, ciphertext)).rejects.toThrow(
        'Decryption failed'
      );
    });

    it('should throw error if streaming throws from native module', async () => {
      NativeModules.QAVCrypto.streamEncryptInit = jest.fn(async () => {
        throw new Error('Native stream init failed');
      });

      const key = new Uint8Array(32);
      await expect(bridge.streamEncryptInit(key)).rejects.toThrow(
        'Streaming encryption initialization failed'
      );
    });

    it('should throw error if public key operations throw', async () => {
      NativeModules.QAVCrypto.sealToPublicKey = jest.fn(async () => {
        throw new Error('Native seal failed');
      });

      const publicKey = new Uint8Array(32);
      const plaintext = Buffer.from('test');
      await expect(bridge.sealToPublicKey(publicKey, plaintext)).rejects.toThrow('Public key encryption failed');
    });

    it('should throw error if SRP operations throw', async () => {
      NativeModules.QAVCrypto.srpDeriveSession = jest.fn(async () => {
        throw new Error('Native SRP failed');
      });

      const clientPrivate = new Uint8Array(32);
      const serverPublic = new Uint8Array(64);
      const salt = new Uint8Array(32);
      await expect(
        bridge.srpDeriveSession(clientPrivate, serverPublic, salt, 'alice', 'password')
      ).rejects.toThrow('SRP session derivation failed');
    });
  });

  // ============================================================================
  // Test: Type Safety
  // ============================================================================
  describe('Type Safety', () => {
    it('should return Uint8Array from deriveKey', async () => {
      NativeModules.QAVCrypto.deriveKey = jest.fn(async () => 'aa'.repeat(32)); // 32 bytes hex

      const salt = new Uint8Array(32);
      const key = await bridge.deriveKey('password', salt);

      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should return Uint8Array from encrypt', async () => {
      const result = await bridge.encrypt(
        bridge.CipherId.XChaCha20Poly1305,
        new Uint8Array(32),
        Buffer.from('test')
      );
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should return Uint8Array from decrypt', async () => {
      const result = await bridge.decrypt(
        bridge.CipherId.XChaCha20Poly1305,
        new Uint8Array(32),
        Buffer.from('test')
      );
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should return KeyPair with Uint8Array from generateShareKeypair', async () => {
      const result = await bridge.generateShareKeypair();
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('secretKey');
      expect(result.publicKey).toBeInstanceOf(Uint8Array);
      expect(result.secretKey).toBeInstanceOf(Uint8Array);
    });

    it('should return SrpClientEphemeral with Uint8Array', async () => {
      const result = await bridge.srpGenerateClientEphemeral();
      expect(result).toHaveProperty('public');
      expect(result).toHaveProperty('private');
      expect(result.public).toBeInstanceOf(Uint8Array);
      expect(result.private).toBeInstanceOf(Uint8Array);
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
      expect(result.proof).toBeInstanceOf(Uint8Array);
      expect(result.key).toBeInstanceOf(Uint8Array);
    });
  });
});
