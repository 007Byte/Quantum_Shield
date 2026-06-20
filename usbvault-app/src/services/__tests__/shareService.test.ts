/**
 * Share Service Tests
 *
 * Tests P2P share creation, listing, accept/reject/revoke, and public key handling.
 */

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

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
const sessionStorageMock = (() => {
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

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({
  generateShareKeypair: jest.fn().mockResolvedValue({
    publicKey: new Uint8Array(32).fill(0xaa),
    secretKey: new Uint8Array(32).fill(0xbb),
  }),
  sealToPublicKey: jest.fn().mockResolvedValue(new Uint8Array(48).fill(0xcc)),
  openSealed: jest.fn().mockResolvedValue(new Uint8Array(32).fill(0xdd)),
}));

// Mock audit service
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock sync service
jest.mock('@/services/syncService', () => ({
  syncService: {
    enqueue: jest.fn(),
  },
}));

// Mock key verification service
jest.mock('@/services/crypto/keyVerification', () => ({
  keyVerificationService: {
    checkKeyChanged: jest.fn().mockResolvedValue({
      changed: false,
      wasVerified: true,
      previousKeyHash: null,
      currentKeyHash: 'abc123',
    }),
  },
}));

// Mock generateId
jest.mock('@/utils/generateId', () => ({
  generateId: jest.fn((prefix: string) => `${prefix}_test_${Date.now()}`),
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

import { shareService } from '../sharing';
import { _resetCachesForTesting } from '@/services/sharing/sharing';
import { auditService } from '@/services/auditService';
import { syncService } from '@/services/syncService';

describe('ShareService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();
    // Reset the cached keypair by clearing localStorage
    (shareService as any)._keypair = null;
    // Invalidate module-level in-memory caches
    _resetCachesForTesting();
  });

  describe('getOrCreateKeypair', () => {
    it('should generate a new keypair when none is stored', async () => {
      const kp = await shareService.getOrCreateKeypair();
      expect(kp).toBeDefined();
      expect(kp.publicKeyHex).toBeDefined();
      expect(kp.secretKeyHex).toBeDefined();
      expect(typeof kp.publicKeyHex).toBe('string');
      expect(typeof kp.secretKeyHex).toBe('string');
    });

    it('should return cached keypair on subsequent calls', async () => {
      const kp1 = await shareService.getOrCreateKeypair();
      const kp2 = await shareService.getOrCreateKeypair();
      expect(kp1.publicKeyHex).toBe(kp2.publicKeyHex);
      expect(kp1.secretKeyHex).toBe(kp2.secretKeyHex);
    });

    it('should persist keypair to localStorage', async () => {
      await shareService.getOrCreateKeypair();
      const stored = localStorage.getItem('usbvault:share_keypair');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.publicKeyHex).toBeDefined();
      expect(parsed.secretKeyHex).toBeDefined();
    });

    it('should restore keypair from localStorage', async () => {
      const mockKp = { publicKeyHex: 'ff'.repeat(32), secretKeyHex: 'ee'.repeat(32) };
      localStorage.setItem('usbvault:share_keypair', JSON.stringify(mockKp));
      (shareService as any)._keypair = null;

      const kp = await shareService.getOrCreateKeypair();
      expect(kp.publicKeyHex).toBe(mockKp.publicKeyHex);
      expect(kp.secretKeyHex).toBe(mockKp.secretKeyHex);
    });
  });

  describe('registerPublicKey / getPublicKey', () => {
    it('should register and retrieve a public key by email', () => {
      shareService.registerPublicKey('alice@example.com', 'abcd1234');
      const key = shareService.getPublicKey('alice@example.com');
      expect(key).toBe('abcd1234');
    });

    it('should return null for unregistered emails', () => {
      const key = shareService.getPublicKey('unknown@example.com');
      expect(key).toBeNull();
    });

    it('should overwrite existing public key for same email', () => {
      shareService.registerPublicKey('alice@example.com', 'key1');
      shareService.registerPublicKey('alice@example.com', 'key2');
      expect(shareService.getPublicKey('alice@example.com')).toBe('key2');
    });

    it('should persist public keys to localStorage', () => {
      shareService.registerPublicKey('bob@test.com', 'deadbeef');
      const stored = localStorage.getItem('usbvault:public_keys');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed['bob@test.com']).toBe('deadbeef');
    });
  });

  describe('shareFile', () => {
    it('should create a share request with pending status', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      const share = await shareService.shareFile(
        'file-1',
        'document.pdf',
        'sender@test.com',
        'recipient@test.com',
        fileKey
      );

      expect(share).toBeDefined();
      expect(share.id).toBeDefined();
      expect(share.fileId).toBe('file-1');
      expect(share.fileName).toBe('document.pdf');
      expect(share.senderEmail).toBe('sender@test.com');
      expect(share.recipientEmail).toBe('recipient@test.com');
      expect(share.status).toBe('pending');
      expect(share.encryptedFileKeyHex).toBeDefined();
      expect(share.createdAt).toBeDefined();
    });

    it('should log a share audit event', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      await shareService.shareFile(
        'file-1',
        'document.pdf',
        'sender@test.com',
        'recipient@test.com',
        fileKey
      );

      expect(auditService.log).toHaveBeenCalledWith(
        'share',
        'document.pdf',
        expect.objectContaining({ recipientEmail: 'recipient@test.com', fileId: 'file-1' })
      );
    });

    it('should enqueue sync event on share creation', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      await shareService.shareFile(
        'file-1',
        'document.pdf',
        'sender@test.com',
        'recipient@test.com',
        fileKey
      );

      expect(syncService.enqueue).toHaveBeenCalledWith(
        'share',
        expect.objectContaining({ fileId: 'file-1', senderEmail: 'sender@test.com' })
      );
    });

    it('should persist the share to localStorage', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      await shareService.shareFile(
        'file-1',
        'doc.pdf',
        'sender@test.com',
        'recipient@test.com',
        fileKey
      );

      const stored = localStorage.getItem('usbvault:shares');
      expect(stored).not.toBeNull();
      const shares = JSON.parse(stored!);
      expect(shares.length).toBe(1);
      expect(shares[0].fileId).toBe('file-1');
    });
  });

  describe('acceptShare', () => {
    it('should update share status to accepted', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      const share = await shareService.shareFile(
        'file-1',
        'doc.pdf',
        'sender@test.com',
        'recipient@test.com',
        fileKey
      );

      await shareService.acceptShare(share.id);

      const all = shareService.getAllShares();
      const updated = all.find(s => s.id === share.id);
      expect(updated?.status).toBe('accepted');
    });

    it('should throw for non-existent share id', async () => {
      await expect(shareService.acceptShare('nonexistent')).rejects.toThrow('Share not found');
    });

    it('should log share_accept audit event', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      const share = await shareService.shareFile(
        'file-1',
        'doc.pdf',
        'sender@test.com',
        'recipient@test.com',
        fileKey
      );
      jest.clearAllMocks();

      await shareService.acceptShare(share.id);
      expect(auditService.log).toHaveBeenCalledWith(
        'share_accept',
        'doc.pdf',
        expect.objectContaining({ shareId: share.id })
      );
    });
  });

  describe('rejectShare', () => {
    it('should update share status to rejected', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      const share = await shareService.shareFile(
        'file-1',
        'doc.pdf',
        'sender@test.com',
        'recipient@test.com',
        fileKey
      );

      await shareService.rejectShare(share.id);

      const all = shareService.getAllShares();
      const updated = all.find(s => s.id === share.id);
      expect(updated?.status).toBe('rejected');
    });

    it('should throw for non-existent share id', async () => {
      await expect(shareService.rejectShare('nonexistent')).rejects.toThrow('Share not found');
    });
  });

  describe('revokeShare', () => {
    it('should update share status to revoked', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      const share = await shareService.shareFile(
        'file-1',
        'doc.pdf',
        'sender@test.com',
        'recipient@test.com',
        fileKey
      );

      await shareService.revokeShare(share.id);

      const all = shareService.getAllShares();
      const updated = all.find(s => s.id === share.id);
      expect(updated?.status).toBe('revoked');
    });

    it('should throw for non-existent share id', async () => {
      await expect(shareService.revokeShare('nonexistent')).rejects.toThrow('Share not found');
    });

    it('should log share_revoke audit event', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      const share = await shareService.shareFile(
        'file-1',
        'doc.pdf',
        'sender@test.com',
        'recipient@test.com',
        fileKey
      );
      jest.clearAllMocks();

      await shareService.revokeShare(share.id);
      expect(auditService.log).toHaveBeenCalledWith(
        'share_revoke',
        'doc.pdf',
        expect.objectContaining({ shareId: share.id })
      );
    });
  });

  describe('getOutgoingShares', () => {
    it('should return shares filtered by sender email', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      await shareService.shareFile('f1', 'a.pdf', 'alice@test.com', 'bob@test.com', fileKey);
      await shareService.shareFile('f2', 'b.pdf', 'carol@test.com', 'bob@test.com', fileKey);

      const aliceShares = shareService.getOutgoingShares('alice@test.com');
      expect(aliceShares.length).toBe(1);
      expect(aliceShares[0].senderEmail).toBe('alice@test.com');
    });

    it('should return non-rejected shares when no email filter given', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      const share = await shareService.shareFile(
        'f1',
        'a.pdf',
        'alice@test.com',
        'bob@test.com',
        fileKey
      );
      await shareService.rejectShare(share.id);

      const all = shareService.getOutgoingShares();
      expect(all.length).toBe(0);
    });
  });

  describe('getIncomingShares', () => {
    it('should return shares filtered by recipient email', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      await shareService.shareFile('f1', 'a.pdf', 'alice@test.com', 'bob@test.com', fileKey);
      await shareService.shareFile('f2', 'b.pdf', 'alice@test.com', 'carol@test.com', fileKey);

      const bobShares = shareService.getIncomingShares('bob@test.com');
      expect(bobShares.length).toBe(1);
      expect(bobShares[0].recipientEmail).toBe('bob@test.com');
    });

    it('should return all shares when no email filter given', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      await shareService.shareFile('f1', 'a.pdf', 'alice@test.com', 'bob@test.com', fileKey);
      await shareService.shareFile('f2', 'b.pdf', 'alice@test.com', 'carol@test.com', fileKey);

      const all = shareService.getIncomingShares();
      expect(all.length).toBe(2);
    });
  });

  describe('getAllShares', () => {
    it('should return empty array when no shares exist', () => {
      const shares = shareService.getAllShares();
      expect(shares).toEqual([]);
    });

    it('should return all shares regardless of status', async () => {
      const fileKey = new Uint8Array(32).fill(0x42);
      const s1 = await shareService.shareFile('f1', 'a.pdf', 'a@test.com', 'b@test.com', fileKey);
      await shareService.shareFile('f2', 'b.pdf', 'a@test.com', 'c@test.com', fileKey);
      await shareService.acceptShare(s1.id);

      const all = shareService.getAllShares();
      expect(all.length).toBe(2);
    });
  });
});
