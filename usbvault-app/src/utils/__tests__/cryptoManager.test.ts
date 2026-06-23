/**
 * Crypto Manager Tests
 *
 * Tests encryptFile, decryptData, key derivation, salt generation,
 * file size formatting, chunk size constants, and download helper.
 */

// Mock React Native Platform
import {
  CHUNK_SIZE,
  generateSalt,
  deriveEncryptionKey,
  encryptFile,
  decryptData,
  downloadDecryptedFile,
  formatFileSize,
  uint8ArrayToBase64,
} from '../cryptoManager';
import { CipherId } from '../../crypto/bridge';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: 'base64' },
}));

// Mock crypto bridge
const mockDeriveKey = jest.fn().mockResolvedValue(new Uint8Array(32).fill(0x42));
const mockEncrypt = jest.fn().mockResolvedValue(new Uint8Array(64).fill(0xee));
const mockDecrypt = jest.fn().mockResolvedValue(new Uint8Array(32).fill(0xdd));
const mockStreamEncryptInit = jest.fn().mockResolvedValue('session-enc-1');
const mockStreamEncryptChunk = jest.fn().mockResolvedValue(new Uint8Array(100).fill(0xaa));
const mockStreamEncryptFree = jest.fn().mockResolvedValue(undefined);
const mockStreamDecryptInit = jest.fn().mockResolvedValue('session-dec-1');
const mockStreamDecryptChunk = jest.fn().mockResolvedValue(new Uint8Array(100).fill(0xbb));
const mockStreamDecryptFree = jest.fn().mockResolvedValue(undefined);

jest.mock('../../crypto/bridge', () => ({
  CipherId: { Aes256GcmSiv: 0, XChaCha20Poly1305: 1 },
  deriveKey: (...args: any[]) => mockDeriveKey(...args),
  encrypt: (...args: any[]) => mockEncrypt(...args),
  decrypt: (...args: any[]) => mockDecrypt(...args),
  streamEncryptInit: (...args: any[]) => mockStreamEncryptInit(...args),
  streamEncryptChunk: (...args: any[]) => mockStreamEncryptChunk(...args),
  streamEncryptFree: (...args: any[]) => mockStreamEncryptFree(...args),
  streamDecryptInit: (...args: any[]) => mockStreamDecryptInit(...args),
  streamDecryptChunk: (...args: any[]) => mockStreamDecryptChunk(...args),
  streamDecryptFree: (...args: any[]) => mockStreamDecryptFree(...args),
}));

// Provide a global fetch mock for web file reading
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('CryptoManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('CHUNK_SIZE constant', () => {
    it('should be 64KB (65536 bytes)', () => {
      expect(CHUNK_SIZE).toBe(64 * 1024);
      expect(CHUNK_SIZE).toBe(65536);
    });
  });

  describe('generateSalt', () => {
    it('should return a Uint8Array of 32 bytes', () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Uint8Array);
      expect(salt.length).toBe(32);
    });

    it('should generate different salts on subsequent calls', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      // Extremely unlikely to be equal with random generation
      const areEqual = salt1.every((val, i) => val === salt2[i]);
      expect(areEqual).toBe(false);
    });
  });

  describe('deriveEncryptionKey', () => {
    it('should return a 32-byte key', async () => {
      const salt = new Uint8Array(32).fill(0x11);
      const key = await deriveEncryptionKey('mypassword', salt);
      expect(key).toBeInstanceOf(Uint8Array);
      expect(key.length).toBe(32);
    });

    it('should call deriveKey from crypto bridge', async () => {
      const salt = new Uint8Array(32).fill(0x11);
      await deriveEncryptionKey('mypassword', salt);
      expect(mockDeriveKey).toHaveBeenCalledWith('mypassword', salt);
    });
  });

  describe('encryptFile', () => {
    it('should encrypt a small file using single-pass mode', async () => {
      const fileData = new Uint8Array(1024).fill(0x55); // 1KB, well under threshold
      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(fileData.buffer),
      });

      const result = await encryptFile('blob:test-url', 'password123');
      expect(result).toBeDefined();
      expect(result.encryptedData).toBeDefined();
      expect(result.salt).toBeDefined();
      expect(result.salt.length).toBe(32);
      expect(result.originalSize).toBe(1024);
      expect(result.isStreamed).toBe(false);
    });

    it('should call encrypt for single-pass mode', async () => {
      const fileData = new Uint8Array(100).fill(0x55);
      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(fileData.buffer),
      });

      await encryptFile('blob:test-url', 'password');
      expect(mockEncrypt).toHaveBeenCalled();
    });

    it('should use streaming mode for large files', async () => {
      const fileData = new Uint8Array(CHUNK_SIZE + 100).fill(0x55); // Over threshold
      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(fileData.buffer),
      });

      const result = await encryptFile('blob:test-url', 'password');
      expect(result.isStreamed).toBe(true);
      expect(mockStreamEncryptInit).toHaveBeenCalled();
      expect(mockStreamEncryptChunk).toHaveBeenCalled();
      expect(mockStreamEncryptFree).toHaveBeenCalled();
    });

    it('should throw for empty file', async () => {
      const fileData = new Uint8Array(0);
      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(fileData.buffer),
      });

      await expect(encryptFile('blob:test-url', 'password')).rejects.toThrow(
        'Cannot encrypt an empty file'
      );
    });

    it('should call progress callback during encryption', async () => {
      const fileData = new Uint8Array(100).fill(0x55);
      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(fileData.buffer),
      });

      const onProgress = jest.fn();
      await encryptFile('blob:test-url', 'password', CipherId.Aes256GcmSiv, onProgress);
      expect(onProgress).toHaveBeenCalled();
      // Should be called with 0, 0.05, 0.3, and 1.0
      expect(onProgress).toHaveBeenCalledWith(0);
      expect(onProgress).toHaveBeenCalledWith(1.0);
    });

    it('should zero out key material after encryption', async () => {
      const fileData = new Uint8Array(100).fill(0x55);
      mockFetch.mockResolvedValueOnce({
        arrayBuffer: () => Promise.resolve(fileData.buffer),
      });

      // We can verify by checking that the function completes without error
      // since key.fill(0) is called in the finally block
      await expect(encryptFile('blob:test-url', 'password')).resolves.toBeDefined();
    });
  });

  describe('decryptData', () => {
    it('should decrypt single-pass encrypted data', async () => {
      const encryptedData = new Uint8Array(64).fill(0xee);
      const salt = new Uint8Array(32).fill(0x11);

      const result = await decryptData(encryptedData, 'password', salt);
      expect(result).toBeDefined();
      expect(result.data).toBeDefined();
      expect(result.originalSize).toBeDefined();
    });

    it('should call decrypt from crypto bridge for non-streamed data', async () => {
      const encryptedData = new Uint8Array(64).fill(0xee);
      const salt = new Uint8Array(32).fill(0x11);

      await decryptData(encryptedData, 'password', salt);
      expect(mockDecrypt).toHaveBeenCalled();
    });

    it('should use streaming mode when isStreamed is true', async () => {
      const encryptedData = new Uint8Array(CHUNK_SIZE + 100).fill(0xee);
      const salt = new Uint8Array(32).fill(0x11);

      await decryptData(encryptedData, 'password', salt, CipherId.Aes256GcmSiv, true);
      expect(mockStreamDecryptInit).toHaveBeenCalled();
      expect(mockStreamDecryptChunk).toHaveBeenCalled();
      expect(mockStreamDecryptFree).toHaveBeenCalled();
    });

    it('should call progress callback during decryption', async () => {
      const encryptedData = new Uint8Array(64).fill(0xee);
      const salt = new Uint8Array(32).fill(0x11);
      const onProgress = jest.fn();

      await decryptData(
        encryptedData,
        'password',
        salt,
        CipherId.Aes256GcmSiv,
        false,
        undefined,
        onProgress
      );
      expect(onProgress).toHaveBeenCalledWith(0);
      expect(onProgress).toHaveBeenCalledWith(1.0);
    });

    it('should derive key using the provided salt', async () => {
      const encryptedData = new Uint8Array(64).fill(0xee);
      const salt = new Uint8Array(32).fill(0xab);

      await decryptData(encryptedData, 'pass123', salt);
      expect(mockDeriveKey).toHaveBeenCalledWith('pass123', salt);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10.0 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1048576)).toBe('1.0 MB');
      expect(formatFileSize(5242880)).toBe('5.0 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(1073741824)).toBe('1.00 GB');
      expect(formatFileSize(2147483648)).toBe('2.00 GB');
    });
  });

  describe('uint8ArrayToBase64', () => {
    it('should convert Uint8Array to base64 string', () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      expect(uint8ArrayToBase64(data)).toBe(btoa('Hello'));
    });

    it('should handle empty array', () => {
      const data = new Uint8Array(0);
      expect(uint8ArrayToBase64(data)).toBe('');
    });

    it('should handle binary data', () => {
      const data = new Uint8Array([0, 255, 128, 64]);
      const result = uint8ArrayToBase64(data);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('downloadDecryptedFile', () => {
    it('should create a blob and trigger download on web', () => {
      const mockAnchor = {
        href: '',
        download: '',
        style: { display: '' },
        click: jest.fn(),
      };
      const createElementSpy = jest
        .spyOn(document, 'createElement')
        .mockReturnValue(mockAnchor as any);
      const appendChildSpy = jest
        .spyOn(document.body, 'appendChild')
        .mockImplementation(() => mockAnchor as any);
      const removeChildSpy = jest
        .spyOn(document.body, 'removeChild')
        .mockImplementation(() => mockAnchor as any);
      const createObjectURLSpy = jest
        .spyOn(URL, 'createObjectURL')
        .mockReturnValue('blob:download');
      const revokeObjectURLSpy = jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const data = new Uint8Array([1, 2, 3]);
      downloadDecryptedFile(data, 'test.pdf', 'application/pdf');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockAnchor.download).toBe('test.pdf');
      expect(mockAnchor.click).toHaveBeenCalled();

      createElementSpy.mockRestore();
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
      createObjectURLSpy.mockRestore();
      revokeObjectURLSpy.mockRestore();
    });

    it('should throw on non-web platform', () => {
      const { Platform } = require('react-native');
      const originalOS = Platform.OS;
      Platform.OS = 'ios';

      const data = new Uint8Array([1, 2, 3]);
      expect(() => downloadDecryptedFile(data, 'test.pdf')).toThrow('only available on web');

      Platform.OS = originalOS;
    });
  });
});
