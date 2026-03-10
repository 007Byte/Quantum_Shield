/**
 * Key Verification Service Tests — SEC-04
 *
 * Tests safety number generation, QR payload creation, and verification status management.
 */

import { keyVerificationService } from '../keyVerificationService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('KeyVerificationService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('generateSafetyNumber', () => {
    it('should generate a safety number from two public keys', async () => {
      const localKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1';
      const remoteKey = 'f1e2d3c4b5a6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0';

      const safetyNumber = await keyVerificationService.generateSafetyNumber(
        localKey,
        remoteKey,
      );

      expect(safetyNumber).toBeDefined();
      expect(typeof safetyNumber).toBe('string');
      // Safety number should be 12 groups of 5 digits separated by spaces
      const parts = safetyNumber.split(' ');
      expect(parts).toHaveLength(12);
      parts.forEach((part) => {
        expect(part).toMatch(/^\d{5}$/);
      });
    });

    it('should produce the same safety number for same keys', async () => {
      const localKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1';
      const remoteKey = 'f1e2d3c4b5a6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0';

      const num1 = await keyVerificationService.generateSafetyNumber(
        localKey,
        remoteKey,
      );
      const num2 = await keyVerificationService.generateSafetyNumber(
        localKey,
        remoteKey,
      );

      expect(num1).toBe(num2);
    });

    it('should produce different safety numbers for different keys', async () => {
      const localKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1';
      const remoteKey1 = 'f1e2d3c4b5a6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0';
      const remoteKey2 = '1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p7q8r9s0t1u2v3w4x5y6z7a8b9c0d';

      const num1 = await keyVerificationService.generateSafetyNumber(
        localKey,
        remoteKey1,
      );
      const num2 = await keyVerificationService.generateSafetyNumber(
        localKey,
        remoteKey2,
      );

      expect(num1).not.toBe(num2);
    });
  });

  describe('formatSafetyNumber', () => {
    it('should format hex hash to safety number format', () => {
      // Create a predictable hash (64 hex chars)
      const hash = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0';

      const formatted = keyVerificationService.formatSafetyNumber(hash);

      expect(formatted).toBeDefined();
      const parts = formatted.split(' ');
      expect(parts).toHaveLength(12);
      parts.forEach((part) => {
        expect(part).toMatch(/^\d{5}$/);
      });
    });
  });

  describe('generateQRPayload', () => {
    it('should generate QR payload with all required fields', async () => {
      const publicKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1';
      const email = 'alice@example.com';

      const payload = await keyVerificationService.generateQRPayload(
        publicKey,
        email,
      );

      expect(payload).toBeDefined();
      expect(payload.email).toBe('alice@example.com');
      expect(payload.publicKeyHex).toBe(publicKey);
      expect(payload.fingerprint).toBeDefined();
      expect(payload.fingerprint.length).toBe(16); // First 16 chars of SHA-256 hash
      expect(payload.generatedAt).toBeDefined();
    });

    it('should normalize email in QR payload', async () => {
      const publicKey = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1';
      const email = 'ALICE@EXAMPLE.COM';

      const payload = await keyVerificationService.generateQRPayload(
        publicKey,
        email,
      );

      expect(payload.email).toBe('alice@example.com');
    });
  });

  describe('verifyContact', () => {
    it('should mark contact as verified with safety number', () => {
      const email = 'bob@example.com';
      const safetyNumber = '12345 67890 12345 67890 12345 67890 12345 67890 12345 67890 12345 67890';

      keyVerificationService.verifyContact(email, true, safetyNumber);

      const record = keyVerificationService.getVerificationRecord(email);
      expect(record).toBeDefined();
      expect(record?.verified).toBe(true);
      expect(record?.safetyNumber).toBe(safetyNumber);
      expect(record?.verifiedAt).toBeDefined();
    });

    it('should mark contact as unverified', () => {
      const email = 'mallory@example.com';

      keyVerificationService.verifyContact(email, false);

      const record = keyVerificationService.getVerificationRecord(email);
      expect(record?.verified).toBe(false);
      expect(record?.verifiedAt).toBeUndefined();
    });
  });

  describe('isContactVerified', () => {
    it('should return false for unverified contact', () => {
      const email = 'unknown@example.com';

      const isVerified = keyVerificationService.isContactVerified(email);

      expect(isVerified).toBe(false);
    });

    it('should return true for verified contact', () => {
      const email = 'verified@example.com';
      keyVerificationService.verifyContact(email, true);

      const isVerified = keyVerificationService.isContactVerified(email);

      expect(isVerified).toBe(true);
    });
  });

  describe('getVerificationStatus', () => {
    it('should return empty map initially', () => {
      const status = keyVerificationService.getVerificationStatus();

      expect(status).toBeInstanceOf(Map);
      expect(status.size).toBe(0);
    });

    it('should return all verification records', () => {
      keyVerificationService.verifyContact('alice@example.com', true);
      keyVerificationService.verifyContact('bob@example.com', false);

      const status = keyVerificationService.getVerificationStatus();

      expect(status.size).toBe(2);
      expect(status.has('alice@example.com')).toBe(true);
      expect(status.has('bob@example.com')).toBe(true);
    });
  });

  describe('getVerificationRecord', () => {
    it('should return undefined for non-existent contact', () => {
      const record = keyVerificationService.getVerificationRecord('nonexistent@example.com');

      expect(record).toBeUndefined();
    });

    it('should return verification record for existing contact', () => {
      const email = 'test@example.com';
      const safetyNumber = '12345 67890 12345 67890 12345 67890 12345 67890 12345 67890 12345 67890';

      keyVerificationService.verifyContact(email, true, safetyNumber);

      const record = keyVerificationService.getVerificationRecord(email);

      expect(record).toBeDefined();
      expect(record?.email).toBe(email);
      expect(record?.verified).toBe(true);
      expect(record?.safetyNumber).toBe(safetyNumber);
    });

    it('should normalize email in lookup', () => {
      const email = 'test@example.com';
      keyVerificationService.verifyContact(email, true);

      const record = keyVerificationService.getVerificationRecord('TEST@EXAMPLE.COM');

      expect(record).toBeDefined();
    });
  });

  describe('clearVerification', () => {
    it('should remove specific contact verification', () => {
      const email = 'temp@example.com';
      keyVerificationService.verifyContact(email, true);

      keyVerificationService.clearVerification(email);

      const record = keyVerificationService.getVerificationRecord(email);
      expect(record).toBeUndefined();
    });
  });

  describe('clearAllVerifications', () => {
    it('should remove all verification records', () => {
      keyVerificationService.verifyContact('alice@example.com', true);
      keyVerificationService.verifyContact('bob@example.com', true);

      keyVerificationService.clearAllVerifications();

      const status = keyVerificationService.getVerificationStatus();
      expect(status.size).toBe(0);
    });
  });

  describe('exportVerifications', () => {
    it('should export verifications as JSON string', () => {
      keyVerificationService.verifyContact('alice@example.com', true, '12345 67890 12345 67890 12345 67890 12345 67890 12345 67890 12345 67890');

      const exported = keyVerificationService.exportVerifications();

      expect(typeof exported).toBe('string');
      const parsed = JSON.parse(exported);
      expect(parsed['alice@example.com']).toBeDefined();
      expect(parsed['alice@example.com'].verified).toBe(true);
    });

    it('should return empty object when no verifications', () => {
      const exported = keyVerificationService.exportVerifications();

      expect(exported).toBe('{}');
    });
  });

  describe('importVerifications', () => {
    it('should import verifications from JSON string', () => {
      const data = JSON.stringify({
        'alice@example.com': {
          email: 'alice@example.com',
          verified: true,
          verifiedAt: '2024-01-01T00:00:00Z',
          safetyNumber: '12345 67890 12345 67890 12345 67890 12345 67890 12345 67890 12345 67890',
        },
      });

      keyVerificationService.importVerifications(data);

      const record = keyVerificationService.getVerificationRecord('alice@example.com');
      expect(record).toBeDefined();
      expect(record?.verified).toBe(true);
    });

    it('should throw on invalid JSON', () => {
      expect(() => {
        keyVerificationService.importVerifications('invalid json');
      }).toThrow();
    });
  });
});
