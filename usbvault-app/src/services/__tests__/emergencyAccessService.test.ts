/**
 * Emergency Access Service Tests — Security-Critical
 *
 * Tests emergency contact designation, 72-hour access requests,
 * approval/denial flows, vault access, and revocation.
 */

import { emergencyAccessService } from '../emergencyAccessService';

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

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
}));

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({
  sealToPublicKey: jest.fn().mockResolvedValue(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd])),
}));

// Mock share service
jest.mock('@/services/shareService', () => ({
  shareService: {
    getOrCreateKeypair: jest.fn().mockResolvedValue({
      publicKeyHex: 'aabbccdd',
      secretKeyHex: '11223344',
    }),
    registerPublicKey: jest.fn(),
    getPublicKey: jest.fn().mockReturnValue('aabbccdd'),
  },
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
    enqueue: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

describe('EmergencyAccessService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test: Contact Designation
  // ============================================================================
  describe('designateContact', () => {
    it('should create an emergency contact with correct fields', async () => {
      const contact = await emergencyAccessService.designateContact(
        'contact@example.com',
        'Emergency Contact',
        'aabbccdd'
      );

      expect(contact.email).toBe('contact@example.com');
      expect(contact.displayName).toBe('Emergency Contact');
      expect(contact.status).toBe('active');
      expect(contact.id).toContain('emg-');
      expect(contact.encryptedVaultKeyHex).toBeDefined();
      expect(contact.publicKeyHex).toBeDefined();
    });

    it('should persist contact to storage', async () => {
      await emergencyAccessService.designateContact(
        'persist@example.com',
        'Persist Contact',
        'aabbccdd'
      );

      const contacts = await emergencyAccessService.getContacts();
      expect(contacts.length).toBeGreaterThanOrEqual(1);
      expect(contacts.some(c => c.email === 'persist@example.com')).toBe(true);
    });

    it('should throw error for missing email', async () => {
      await expect(
        emergencyAccessService.designateContact('', 'Name', 'key')
      ).rejects.toThrow('Email, display name, and vault key are required');
    });

    it('should throw error for missing display name', async () => {
      await expect(
        emergencyAccessService.designateContact('email@test.com', '', 'key')
      ).rejects.toThrow('Email, display name, and vault key are required');
    });

    it('should throw error for missing vault key', async () => {
      await expect(
        emergencyAccessService.designateContact('email@test.com', 'Name', '')
      ).rejects.toThrow('Email, display name, and vault key are required');
    });

    it('should log designation to audit service', async () => {
      const { auditService } = require('@/services/auditService');

      await emergencyAccessService.designateContact(
        'audit@example.com',
        'Audit Contact',
        'aabbccdd'
      );

      expect(auditService.log).toHaveBeenCalledWith(
        'emergency_contact_designated',
        expect.any(String),
        expect.objectContaining({
          email: 'audit@example.com',
        })
      );
    });

    it('should enqueue sync after designation', async () => {
      const { syncService } = require('@/services/syncService');

      await emergencyAccessService.designateContact(
        'sync@example.com',
        'Sync Contact',
        'aabbccdd'
      );

      expect(syncService.enqueue).toHaveBeenCalledWith(
        'share',
        expect.objectContaining({
          email: 'sync@example.com',
        })
      );
    });
  });

  // ============================================================================
  // Test: Contact Removal
  // ============================================================================
  describe('removeContact', () => {
    it('should revoke a contact', async () => {
      const contact = await emergencyAccessService.designateContact(
        'revoke@example.com',
        'Revoke Me',
        'aabbccdd'
      );

      await emergencyAccessService.removeContact(contact.id);

      const contacts = await emergencyAccessService.getContacts();
      const revoked = contacts.find(c => c.id === contact.id);
      expect(revoked!.status).toBe('revoked');
    });

    it('should throw error for missing contact ID', async () => {
      await expect(emergencyAccessService.removeContact('')).rejects.toThrow(
        'Contact ID is required'
      );
    });

    it('should throw error for non-existent contact', async () => {
      await expect(emergencyAccessService.removeContact('fake-id')).rejects.toThrow(
        'Contact fake-id not found'
      );
    });
  });

  // ============================================================================
  // Test: Access Requests
  // ============================================================================
  describe('requestAccess', () => {
    it('should create a pending access request with 72-hour window', async () => {
      await emergencyAccessService.designateContact(
        'requester@example.com',
        'Requester',
        'aabbccdd'
      );

      const request = await emergencyAccessService.requestAccess('requester@example.com', 'Lost access');

      expect(request.status).toBe('pending');
      expect(request.contactEmail).toBe('requester@example.com');
      expect(request.reason).toBe('Lost access');
      expect(request.id).toContain('emg-');

      // Verify 72-hour window
      const requestedAt = new Date(request.requestedAt).getTime();
      const expiresAt = new Date(request.expiresAt).getTime();
      const diff = expiresAt - requestedAt;
      expect(diff).toBe(72 * 60 * 60 * 1000);
    });

    it('should throw error for missing email', async () => {
      await expect(emergencyAccessService.requestAccess('')).rejects.toThrow(
        'Contact email is required'
      );
    });

    it('should throw error for non-existent active contact', async () => {
      await expect(
        emergencyAccessService.requestAccess('nobody@example.com')
      ).rejects.toThrow('Active contact not found');
    });
  });

  // ============================================================================
  // Test: Deny Access
  // ============================================================================
  describe('denyAccess', () => {
    it('should deny a pending request', async () => {
      await emergencyAccessService.designateContact(
        'deny@example.com',
        'Deny Contact',
        'aabbccdd'
      );
      const request = await emergencyAccessService.requestAccess('deny@example.com');

      await emergencyAccessService.denyAccess(request.id);

      const status = await emergencyAccessService.checkAccessStatus(request.id);
      expect(status.status).toBe('denied');
      expect(status.deniedAt).toBeDefined();
    });

    it('should throw error for missing request ID', async () => {
      await expect(emergencyAccessService.denyAccess('')).rejects.toThrow(
        'Request ID is required'
      );
    });

    it('should throw error for non-pending request', async () => {
      await emergencyAccessService.designateContact(
        'double-deny@example.com',
        'Double Deny',
        'aabbccdd'
      );
      const request = await emergencyAccessService.requestAccess('double-deny@example.com');
      await emergencyAccessService.denyAccess(request.id);

      await expect(emergencyAccessService.denyAccess(request.id)).rejects.toThrow(
        'Cannot deny request with status: denied'
      );
    });
  });

  // ============================================================================
  // Test: Approve Access
  // ============================================================================
  describe('approveAccess', () => {
    it('should approve a pending request', async () => {
      await emergencyAccessService.designateContact(
        'approve@example.com',
        'Approve Contact',
        'aabbccdd'
      );
      const request = await emergencyAccessService.requestAccess('approve@example.com');

      await emergencyAccessService.approveAccess(request.id);

      const status = await emergencyAccessService.checkAccessStatus(request.id);
      expect(status.status).toBe('approved');
    });

    it('should throw error for missing request ID', async () => {
      await expect(emergencyAccessService.approveAccess('')).rejects.toThrow(
        'Request ID is required'
      );
    });

    it('should throw error when approving a denied request', async () => {
      await emergencyAccessService.designateContact(
        'deny-then-approve@example.com',
        'Deny Then Approve',
        'aabbccdd'
      );
      const request = await emergencyAccessService.requestAccess('deny-then-approve@example.com');
      await emergencyAccessService.denyAccess(request.id);

      await expect(emergencyAccessService.approveAccess(request.id)).rejects.toThrow(
        'Cannot approve request with status: denied'
      );
    });
  });

  // ============================================================================
  // Test: Vault Access
  // ============================================================================
  describe('accessVault', () => {
    it('should return encrypted vault key for approved request', async () => {
      await emergencyAccessService.designateContact(
        'vault-access@example.com',
        'Vault Access',
        'aabbccdd'
      );
      const request = await emergencyAccessService.requestAccess('vault-access@example.com');
      await emergencyAccessService.approveAccess(request.id);

      const encryptedKey = await emergencyAccessService.accessVault(
        request.id,
        'vault-access@example.com'
      );

      expect(encryptedKey).toBeDefined();
      expect(typeof encryptedKey).toBe('string');
    });

    it('should throw error for missing params', async () => {
      await expect(emergencyAccessService.accessVault('', '')).rejects.toThrow(
        'Request ID and contact email are required'
      );
    });

    it('should throw error for non-approved request', async () => {
      await emergencyAccessService.designateContact(
        'not-approved@example.com',
        'Not Approved',
        'aabbccdd'
      );
      const request = await emergencyAccessService.requestAccess('not-approved@example.com');

      await expect(
        emergencyAccessService.accessVault(request.id, 'not-approved@example.com')
      ).rejects.toThrow('Request not approved');
    });

    it('should throw error for mismatched email', async () => {
      await emergencyAccessService.designateContact(
        'mismatch@example.com',
        'Mismatch',
        'aabbccdd'
      );
      const request = await emergencyAccessService.requestAccess('mismatch@example.com');
      await emergencyAccessService.approveAccess(request.id);

      await expect(
        emergencyAccessService.accessVault(request.id, 'wrong@example.com')
      ).rejects.toThrow('Contact email does not match');
    });

    it('should mark request as accessed after retrieval', async () => {
      await emergencyAccessService.designateContact(
        'accessed@example.com',
        'Accessed',
        'aabbccdd'
      );
      const request = await emergencyAccessService.requestAccess('accessed@example.com');
      await emergencyAccessService.approveAccess(request.id);
      await emergencyAccessService.accessVault(request.id, 'accessed@example.com');

      const status = await emergencyAccessService.checkAccessStatus(request.id);
      expect(status.status).toBe('accessed');
      expect(status.accessedAt).toBeDefined();
    });
  });

  // ============================================================================
  // Test: Revoke All Access
  // ============================================================================
  describe('revokeAllAccess', () => {
    it('should revoke all contacts and deny all pending requests', async () => {
      await emergencyAccessService.designateContact('r1@example.com', 'R1', 'aabbccdd');
      await emergencyAccessService.designateContact('r2@example.com', 'R2', 'aabbccdd');
      await emergencyAccessService.requestAccess('r1@example.com');

      await emergencyAccessService.revokeAllAccess();

      const contacts = await emergencyAccessService.getContacts();
      contacts.forEach(c => {
        expect(c.status).toBe('revoked');
      });

      const activeRequests = await emergencyAccessService.getActiveRequests();
      expect(activeRequests.length).toBe(0);
    });
  });

  // ============================================================================
  // Test: Access History
  // ============================================================================
  describe('getAccessHistory', () => {
    it('should return empty array when no history exists', async () => {
      const history = await emergencyAccessService.getAccessHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should record history entries for access requests', async () => {
      await emergencyAccessService.designateContact(
        'history@example.com',
        'History',
        'aabbccdd'
      );
      await emergencyAccessService.requestAccess('history@example.com');

      const history = await emergencyAccessService.getAccessHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history.some(h => h.action === 'requested')).toBe(true);
    });
  });
});
