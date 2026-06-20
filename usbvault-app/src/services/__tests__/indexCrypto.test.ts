/**
 * Index Crypto Service Tests
 *
 * Tests that indexCrypto.ts re-exports from crypto module and provides
 * encryptFileIndex, decryptFileIndex, and isEncryptedIndex.
 */

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({
  encryptVaultIndex: jest.fn().mockResolvedValue(new Uint8Array([0x01, 0x02, 0x03, 0x04])),
  decryptVaultIndex: jest.fn().mockImplementation((_key: Uint8Array, data: Uint8Array) => {
    // Return the data as-is for test simplicity
    return Promise.resolve(data);
  }),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock domain types (StoredFileInfo)
jest.mock('@/types/domain', () => ({}), { virtual: true });

import * as indexCrypto from '../crypto/index';

describe('indexCrypto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export encryptFileIndex function', () => {
      expect(typeof indexCrypto.encryptFileIndex).toBe('function');
    });

    it('should export decryptFileIndex function', () => {
      expect(typeof indexCrypto.decryptFileIndex).toBe('function');
    });

    it('should export isEncryptedIndex function', () => {
      expect(typeof indexCrypto.isEncryptedIndex).toBe('function');
    });
  });

  describe('encryptFileIndex', () => {
    it('should return empty string for empty file array', async () => {
      const masterKey = new Uint8Array(32).fill(0x42);
      const result = await indexCrypto.encryptFileIndex(masterKey, []);
      expect(result).toBe('');
    });

    it('should return a base64 string for non-empty file array', async () => {
      const masterKey = new Uint8Array(32).fill(0x42);
      const files = [
        { id: 'file-1', name: 'test.pdf', size: 1024, type: 'application/pdf' },
      ] as any;

      const result = await indexCrypto.encryptFileIndex(masterKey, files);
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
      // Should be base64 encoded
      expect(result!.length).toBeGreaterThan(0);
    });

    it('should call encryptVaultIndex from crypto bridge', async () => {
      const { encryptVaultIndex } = require('@/crypto/bridge');
      const masterKey = new Uint8Array(32).fill(0x42);
      const files = [{ id: 'file-1', name: 'test.pdf' }] as any;

      await indexCrypto.encryptFileIndex(masterKey, files);
      expect(encryptVaultIndex).toHaveBeenCalledWith(masterKey, expect.anything());
    });

    it('should return null when encryption fails', async () => {
      const { encryptVaultIndex } = require('@/crypto/bridge');
      encryptVaultIndex.mockRejectedValueOnce(new Error('crypto error'));

      const masterKey = new Uint8Array(32).fill(0x42);
      const files = [{ id: 'file-1', name: 'test.pdf' }] as any;

      const result = await indexCrypto.encryptFileIndex(masterKey, files);
      expect(result).toBeNull();
    });
  });

  describe('decryptFileIndex', () => {
    it('should return empty array for empty string input', async () => {
      const masterKey = new Uint8Array(32).fill(0x42);
      const result = await indexCrypto.decryptFileIndex(masterKey, '');
      expect(result).toEqual([]);
    });

    it('should return empty array for null/undefined input', async () => {
      const masterKey = new Uint8Array(32).fill(0x42);
      const result = await indexCrypto.decryptFileIndex(masterKey, null as any);
      expect(result).toEqual([]);
    });

    it('should call decryptVaultIndex from crypto bridge', async () => {
      const { decryptVaultIndex } = require('@/crypto/bridge');
      const masterKey = new Uint8Array(32).fill(0x42);
      // Provide valid base64 that decodes to valid JSON
      const jsonStr = JSON.stringify([{ id: 'file-1', name: 'test.pdf' }]);
      const jsonBytes = new TextEncoder().encode(jsonStr);
      decryptVaultIndex.mockResolvedValueOnce(jsonBytes);

      const base64Input = Buffer.from(new Uint8Array([0x01, 0x02])).toString('base64');
      const result = await indexCrypto.decryptFileIndex(masterKey, base64Input);
      expect(decryptVaultIndex).toHaveBeenCalled();
      expect(result).toEqual([{ id: 'file-1', name: 'test.pdf' }]);
    });

    it('should return null when decryption fails', async () => {
      const { decryptVaultIndex } = require('@/crypto/bridge');
      decryptVaultIndex.mockRejectedValueOnce(new Error('bad key'));

      const masterKey = new Uint8Array(32).fill(0x42);
      const result = await indexCrypto.decryptFileIndex(masterKey, 'invaliddata');
      expect(result).toBeNull();
    });
  });

  describe('isEncryptedIndex', () => {
    it('should return false for empty string', () => {
      expect(indexCrypto.isEncryptedIndex('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(indexCrypto.isEncryptedIndex(null as any)).toBe(false);
    });

    it('should return false for JSON array string', () => {
      expect(indexCrypto.isEncryptedIndex('[{"id":"file-1"}]')).toBe(false);
    });

    it('should return false for JSON object string', () => {
      expect(indexCrypto.isEncryptedIndex('{"key":"value"}')).toBe(false);
    });

    it('should return true for base64 encrypted data', () => {
      expect(indexCrypto.isEncryptedIndex('AQIDBA==')).toBe(true);
    });

    it('should return true for non-JSON string', () => {
      expect(indexCrypto.isEncryptedIndex('someBase64EncodedBlobData')).toBe(true);
    });

    it('should handle strings with leading whitespace', () => {
      expect(indexCrypto.isEncryptedIndex('  [{"id":"1"}]')).toBe(false);
      expect(indexCrypto.isEncryptedIndex('  {}')).toBe(false);
    });
  });
});
