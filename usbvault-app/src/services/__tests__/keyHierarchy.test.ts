/**
 * Key Hierarchy Service Tests
 *
 * Tests createKeyHierarchy, unlockKeyHierarchy, rotatePassword, getFileEncryptionKey,
 * and migrateToKeyHierarchy.
 */

// Mock React Native Platform
import {
  createKeyHierarchy,
  unlockKeyHierarchy,
  rotatePassword,
  getFileEncryptionKey,
  migrateToKeyHierarchy,
} from '../crypto/keyHierarchy';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock crypto bridge
const mockRandomBytes = jest.fn().mockResolvedValue(new Uint8Array(32).fill(0x11));
const mockDeriveKEK = jest.fn().mockResolvedValue(new Uint8Array(32).fill(0x22));
const mockGenerateMEK = jest.fn().mockResolvedValue(new Uint8Array(64).fill(0x33));
const mockWrapMEK = jest.fn().mockResolvedValue(new Uint8Array(80).fill(0x44));
const mockUnwrapMEK = jest.fn().mockResolvedValue(new Uint8Array(64).fill(0x33));
const mockDeriveFileKey = jest.fn().mockResolvedValue(new Uint8Array(32).fill(0x55));

jest.mock('@/crypto/bridge', () => ({
  randomBytes: (...args: any[]) => mockRandomBytes(...args),
  deriveKEK: (...args: any[]) => mockDeriveKEK(...args),
  generateMEK: (...args: any[]) => mockGenerateMEK(...args),
  wrapMEK: (...args: any[]) => mockWrapMEK(...args),
  unwrapMEK: (...args: any[]) => mockUnwrapMEK(...args),
  deriveFileKey: (...args: any[]) => mockDeriveFileKey(...args),
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

describe('Key Hierarchy Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createKeyHierarchy', () => {
    it('should return mek, wrappedMek, and kekSalt', async () => {
      const result = await createKeyHierarchy('mypassword');
      expect(result.mek).toBeDefined();
      expect(result.wrappedMek).toBeDefined();
      expect(result.kekSalt).toBeDefined();
    });

    it('should call randomBytes for salt generation', async () => {
      await createKeyHierarchy('mypassword');
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
    });

    it('should call deriveKEK with password and salt', async () => {
      await createKeyHierarchy('mypassword');
      expect(mockDeriveKEK).toHaveBeenCalledWith('mypassword', expect.any(Uint8Array));
    });

    it('should call generateMEK for random master key', async () => {
      await createKeyHierarchy('mypassword');
      expect(mockGenerateMEK).toHaveBeenCalled();
    });

    it('should call wrapMEK with kek and mek', async () => {
      await createKeyHierarchy('mypassword');
      expect(mockWrapMEK).toHaveBeenCalledWith(
        expect.any(Uint8Array), // kek
        expect.any(Uint8Array) // mek
      );
    });

    it('should throw with descriptive message on failure', async () => {
      mockGenerateMEK.mockRejectedValueOnce(new Error('RNG failure'));
      await expect(createKeyHierarchy('pass')).rejects.toThrow(
        'Key hierarchy creation failed: RNG failure'
      );
    });
  });

  describe('unlockKeyHierarchy', () => {
    it('should return mek on successful unlock', async () => {
      const kekSalt = new Uint8Array(32).fill(0x11);
      const wrappedMek = new Uint8Array(80).fill(0x44);

      const result = await unlockKeyHierarchy('mypassword', kekSalt, wrappedMek);
      expect(result.mek).toBeDefined();
      expect(result.mek.length).toBe(64);
    });

    it('should call deriveKEK with password and stored salt', async () => {
      const kekSalt = new Uint8Array(32).fill(0xaa);
      const wrappedMek = new Uint8Array(80).fill(0x44);

      await unlockKeyHierarchy('password123', kekSalt, wrappedMek);
      expect(mockDeriveKEK).toHaveBeenCalledWith('password123', kekSalt);
    });

    it('should call unwrapMEK with derived kek and wrapped mek', async () => {
      const kekSalt = new Uint8Array(32).fill(0x11);
      const wrappedMek = new Uint8Array(80).fill(0x44);

      await unlockKeyHierarchy('mypassword', kekSalt, wrappedMek);
      expect(mockUnwrapMEK).toHaveBeenCalledWith(expect.any(Uint8Array), wrappedMek);
    });

    it('should throw when password is wrong (unwrap fails)', async () => {
      mockUnwrapMEK.mockRejectedValueOnce(new Error('AEAD tag mismatch'));
      const kekSalt = new Uint8Array(32).fill(0x11);
      const wrappedMek = new Uint8Array(80).fill(0x44);

      await expect(unlockKeyHierarchy('wrongpass', kekSalt, wrappedMek)).rejects.toThrow(
        'Key hierarchy unlock failed'
      );
    });
  });

  describe('rotatePassword', () => {
    it('should return newWrappedMek and newKekSalt', async () => {
      const oldKekSalt = new Uint8Array(32).fill(0x11);
      const wrappedMek = new Uint8Array(80).fill(0x44);

      const result = await rotatePassword('oldpass', 'newpass', oldKekSalt, wrappedMek);
      expect(result.newWrappedMek).toBeDefined();
      expect(result.newKekSalt).toBeDefined();
    });

    it('should generate new salt for new KEK', async () => {
      const oldKekSalt = new Uint8Array(32).fill(0x11);
      const wrappedMek = new Uint8Array(80).fill(0x44);

      await rotatePassword('oldpass', 'newpass', oldKekSalt, wrappedMek);
      // randomBytes called for new salt
      expect(mockRandomBytes).toHaveBeenCalledWith(32);
    });

    it('should derive new KEK with new password', async () => {
      const oldKekSalt = new Uint8Array(32).fill(0x11);
      const wrappedMek = new Uint8Array(80).fill(0x44);

      await rotatePassword('oldpass', 'newpass', oldKekSalt, wrappedMek);
      // deriveKEK called twice: once for old, once for new
      expect(mockDeriveKEK).toHaveBeenCalledTimes(2);
      expect(mockDeriveKEK).toHaveBeenCalledWith('newpass', expect.any(Uint8Array));
    });

    it('should throw when old password is wrong', async () => {
      mockUnwrapMEK.mockRejectedValueOnce(new Error('AEAD tag mismatch'));
      const oldKekSalt = new Uint8Array(32).fill(0x11);
      const wrappedMek = new Uint8Array(80).fill(0x44);

      await expect(rotatePassword('wrongold', 'newpass', oldKekSalt, wrappedMek)).rejects.toThrow(
        'Password rotation failed'
      );
    });
  });

  describe('getFileEncryptionKey', () => {
    it('should derive a 32-byte per-file key from MEK', async () => {
      const mek = new Uint8Array(64).fill(0x33);
      const result = await getFileEncryptionKey(mek, 'file-abc-123');
      expect(result).toBeDefined();
      expect(result.length).toBe(32);
    });

    it('should call deriveFileKey from crypto bridge', async () => {
      const mek = new Uint8Array(64).fill(0x33);
      await getFileEncryptionKey(mek, 'file-xyz');
      expect(mockDeriveFileKey).toHaveBeenCalledWith(mek, 'file-xyz');
    });
  });

  describe('migrateToKeyHierarchy', () => {
    it('should pad legacy 32-byte key to 64-byte synthetic MEK', async () => {
      const legacyKey = new Uint8Array(32).fill(0xee);
      const result = await migrateToKeyHierarchy('password', legacyKey);

      expect(result.mek.length).toBe(64);
      // First 32 bytes should match legacy key
      expect(result.mek.slice(0, 32)).toEqual(legacyKey);
    });

    it('should return wrappedMek and kekSalt', async () => {
      const legacyKey = new Uint8Array(32).fill(0xee);
      const result = await migrateToKeyHierarchy('password', legacyKey);

      expect(result.wrappedMek).toBeDefined();
      expect(result.kekSalt).toBeDefined();
    });
  });
});
