/**
 * Vault Orchestrator Tests — Core Functionality
 *
 * Tests vault provisioning, unlock flow with brute-force protection,
 * file operations, vault locking, and session management.
 */

import { vaultOrchestrator, getBackoffDelay } from '../vaultOrchestrator';

// Mock crypto bridge
jest.mock('@/crypto/bridge', () => ({
  CipherId: { XChaCha20Poly1305: 0 },
  createVaultHeader: jest.fn().mockResolvedValue({
    headerBytes: new Uint8Array(256),
    session: {
      encryptionKey: new Uint8Array(32),
      hmacKey: new Uint8Array(32),
    },
  }),
  readVaultHeader: jest.fn().mockResolvedValue({
    version: 4,
    cipherId: 0,
    activeIndexSlot: 0,
    index0Offset: 256,
    index0Length: 128,
    index1Offset: 384,
    index1Length: 128,
  }),
  unlockVault: jest.fn().mockResolvedValue({
    encryptionKey: new Uint8Array(32),
    hmacKey: new Uint8Array(32),
  }),
  encryptVaultContainerIndex: jest.fn().mockResolvedValue(new Uint8Array(128)),
  decryptVaultContainerIndex: jest.fn().mockResolvedValue({ files: {} }),
  encryptFileRecord: jest.fn().mockResolvedValue(new Uint8Array(1024)),
  decryptFileRecord: jest.fn().mockResolvedValue({
    filename: 'test.txt',
    data: new Uint8Array([72, 101, 108, 108, 111]),
  }),
  readFailCounter: jest.fn().mockResolvedValue(0),
  resetFailCounter: jest.fn().mockImplementation((header) => Promise.resolve(header)),
  incrementFailCounter: jest.fn().mockImplementation((header) => Promise.resolve(header)),
  commitVaultIndex: jest.fn().mockResolvedValue(new Uint8Array(256)),
}));

// Mock USB service
// readVaultHeader must return a header whose first 8 bytes spell "USBVLT\0\0",
// because both provision() and unlock() verify the magic bytes before proceeding.
jest.mock('../usbService', () => {
  const makeValidHeaderBytes = () => {
    const bytes = new Uint8Array(256);
    const magic = new TextEncoder().encode('USBVLT');
    bytes.set(magic, 0);
    return bytes;
  };
  return {
  usbService: {
    initVaultContainer: jest.fn().mockResolvedValue(undefined),
    appendVaultBytes: jest.fn().mockResolvedValue({ offset: 256, length: 128 }),
    writeVaultHeader: jest.fn().mockResolvedValue(undefined),
    readVaultHeader: jest.fn().mockResolvedValue(makeValidHeaderBytes()),
    readVaultBytes: jest.fn().mockResolvedValue(new Uint8Array(128)),
    checkCapacity: jest.fn().mockResolvedValue({
      total: 1073741824,
      available: 536870912,
      allowed: true,
      remaining: 536870912,
      maxAllowed: 536870912,
    }),
    compactVaultContainer: jest.fn().mockResolvedValue({
      entries: [],
      newOffsets: {},
      oldSize: 1024,
      newSize: 512,
      spaceSaved: 512,
    }),
  },
  };
});

// Mock audit service
jest.mock('../auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
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
  fireAndForget: jest.fn((p: Promise<any>) => p.catch(() => {})),
}));

// Mock errors
jest.mock('@/errors/typed', () => ({
  RateLimitError: class RateLimitError extends Error {
    constructor(message: string, public retryAfter: number, public attempts: number) {
      super(message);
      this.name = 'RateLimitError';
    }
  },
}));

describe('VaultOrchestrator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Lock vault to reset state
    vaultOrchestrator.lock();
  });

  // ============================================================================
  // Test: Backoff Delay Calculation
  // ============================================================================
  describe('getBackoffDelay', () => {
    it('should return 0 for zero or negative fail count', () => {
      expect(getBackoffDelay(0)).toBe(0);
      expect(getBackoffDelay(-1)).toBe(0);
    });

    it('should return exponential delay', () => {
      expect(getBackoffDelay(1)).toBe(2000); // 2^1 * 1000
      expect(getBackoffDelay(2)).toBe(4000); // 2^2 * 1000
      expect(getBackoffDelay(3)).toBe(8000); // 2^3 * 1000
    });

    it('should cap at 3600 seconds (1 hour)', () => {
      expect(getBackoffDelay(20)).toBe(3600_000);
      expect(getBackoffDelay(100)).toBe(3600_000);
    });
  });

  // ============================================================================
  // Test: Vault Provisioning
  // ============================================================================
  describe('provision', () => {
    it('should create a new vault and return provision result', async () => {
      const result = await vaultOrchestrator.provision('/mnt/usb', 'strongpassword');

      expect(result.mountPoint).toBe('/mnt/usb');
      expect(result.headerInfo).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.session.encryptionKey).toBeDefined();
      expect(result.session.hmacKey).toBeDefined();
    });

    it('should write header to USB', async () => {
      const { usbService } = require('../usbService');
      await vaultOrchestrator.provision('/mnt/usb', 'password');

      // provision() overwrites the companion-created VAULT.bin placeholder header
      // via writeVaultHeader (the container already exists at this point).
      expect(usbService.writeVaultHeader).toHaveBeenCalledWith(
        '/mnt/usb',
        expect.any(Uint8Array)
      );
    });

    it('should write empty index to both slots', async () => {
      const { usbService } = require('../usbService');
      await vaultOrchestrator.provision('/mnt/usb', 'password');

      // appendVaultBytes called at least twice (slot 0 and slot 1)
      expect(usbService.appendVaultBytes).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================================
  // Test: Vault Unlock
  // ============================================================================
  describe('unlock', () => {
    it('should unlock vault and return active vault', async () => {
      const result = await vaultOrchestrator.unlock('/mnt/usb', 'correct-password');

      expect(result.vault).toBeDefined();
      expect(result.vault.mountPoint).toBe('/mnt/usb');
      expect(result.vault.session).toBeDefined();
      expect(result.vault.index).toBeDefined();
      expect(result.failCounterWasNonZero).toBe(false);
      expect(result.previousFailCount).toBe(0);
    });

    it('should set vault as active after unlock', async () => {
      expect(vaultOrchestrator.isUnlocked()).toBe(false);

      await vaultOrchestrator.unlock('/mnt/usb', 'password');

      expect(vaultOrchestrator.isUnlocked()).toBe(true);
    });

    it('should reset session fail count on successful unlock', async () => {
      await vaultOrchestrator.unlock('/mnt/usb', 'password');
      expect(vaultOrchestrator.getSessionFailCount()).toBe(0);
    });

    it('should track fail count on failed unlock', async () => {
      const { unlockVault } = require('@/crypto/bridge');
      unlockVault.mockRejectedValueOnce(new Error('Bad password'));

      try {
        await vaultOrchestrator.unlock('/mnt/usb', 'wrong-password');
      } catch {
        // Expected
      }

      expect(vaultOrchestrator.getSessionFailCount()).toBe(1);
    });

    it('should attach failCount and maxAttempts to error on failed unlock', async () => {
      const { unlockVault } = require('@/crypto/bridge');
      unlockVault.mockRejectedValueOnce(new Error('Bad password'));

      try {
        await vaultOrchestrator.unlock('/mnt/usb', 'wrong');
        fail('Should have thrown');
      } catch (err: any) {
        expect(err.failCount).toBeDefined();
        expect(err.maxAttempts).toBe(10);
      }
    });
  });

  // ============================================================================
  // Test: File Operations
  // ============================================================================
  describe('addFile', () => {
    it('should throw if no vault is unlocked', async () => {
      await expect(
        vaultOrchestrator.addFile('file1', 'test.txt', new Uint8Array([1, 2, 3]))
      ).rejects.toThrow('No vault is currently unlocked');
    });

    it('should add file to unlocked vault', async () => {
      await vaultOrchestrator.unlock('/mnt/usb', 'password');

      await vaultOrchestrator.addFile('file1', 'test.txt', new Uint8Array([1, 2, 3]));

      const index = vaultOrchestrator.getIndex();
      expect(index).not.toBeNull();
      expect(index!.files['file1']).toBeDefined();
      expect(index!.files['file1'].name).toBe('test.txt');
    });

    it('should check capacity before adding file', async () => {
      const { usbService } = require('../usbService');
      await vaultOrchestrator.unlock('/mnt/usb', 'password');

      await vaultOrchestrator.addFile('file1', 'test.txt', new Uint8Array(100));

      expect(usbService.checkCapacity).toHaveBeenCalledWith(
        '/mnt/usb',
        expect.any(Number)
      );
    });

    it('should throw when vault is at capacity', async () => {
      const { usbService } = require('../usbService');
      usbService.checkCapacity.mockResolvedValueOnce({
        total: 1024,
        available: 0,
        allowed: false,
        remaining: 0,
        maxAllowed: 512,
      });

      await vaultOrchestrator.unlock('/mnt/usb', 'password');

      await expect(
        vaultOrchestrator.addFile('file1', 'test.txt', new Uint8Array(1024))
      ).rejects.toThrow('Vault is at capacity');
    });
  });

  describe('readFile', () => {
    it('should throw if no vault is unlocked', async () => {
      await expect(vaultOrchestrator.readFile('file1')).rejects.toThrow(
        'No vault is currently unlocked'
      );
    });

    it('should throw for non-existent file', async () => {
      await vaultOrchestrator.unlock('/mnt/usb', 'password');

      await expect(vaultOrchestrator.readFile('nonexistent')).rejects.toThrow(
        "File 'nonexistent' not found in vault index"
      );
    });
  });

  describe('removeFile', () => {
    it('should throw if no vault is unlocked', async () => {
      await expect(vaultOrchestrator.removeFile('file1')).rejects.toThrow(
        'No vault is currently unlocked'
      );
    });

    it('should remove file from index', async () => {
      await vaultOrchestrator.unlock('/mnt/usb', 'password');
      await vaultOrchestrator.addFile('file1', 'test.txt', new Uint8Array([1, 2, 3]));

      await vaultOrchestrator.removeFile('file1');

      const index = vaultOrchestrator.getIndex();
      expect(index!.files['file1']).toBeUndefined();
    });
  });

  // ============================================================================
  // Test: Vault Lock
  // ============================================================================
  describe('lock', () => {
    it('should zero key material and clear active vault', async () => {
      await vaultOrchestrator.unlock('/mnt/usb', 'password');
      expect(vaultOrchestrator.isUnlocked()).toBe(true);

      vaultOrchestrator.lock();

      expect(vaultOrchestrator.isUnlocked()).toBe(false);
      expect(vaultOrchestrator.getActiveVault()).toBeNull();
      expect(vaultOrchestrator.getIndex()).toBeNull();
    });

    it('should be safe to call lock when no vault is active', () => {
      expect(() => vaultOrchestrator.lock()).not.toThrow();
    });
  });

  // ============================================================================
  // Test: State Queries
  // ============================================================================
  describe('state queries', () => {
    it('isUnlocked should return false initially', () => {
      expect(vaultOrchestrator.isUnlocked()).toBe(false);
    });

    it('getActiveVault should return null initially', () => {
      expect(vaultOrchestrator.getActiveVault()).toBeNull();
    });

    it('getIndex should return null when no vault active', () => {
      expect(vaultOrchestrator.getIndex()).toBeNull();
    });

    it('getSessionFailCount should return 0 initially', () => {
      expect(vaultOrchestrator.getSessionFailCount()).toBe(0);
    });
  });
});
