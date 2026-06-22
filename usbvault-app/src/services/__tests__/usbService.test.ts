/**
 * USB Service Tests — Core Functionality
 *
 * Tests USB drive listing, vault provisioning, drive reset,
 * container I/O, and companion health checks.
 */

import { usbService } from '../usbService';

// Mock API client
const mockGet = jest.fn();
const mockPost = jest.fn();
const mockDelete = jest.fn();

jest.mock('../api', () => ({
  getApiClient: () => ({
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  }),
}));

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
}));

describe('UsbService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test: List Drives
  // ============================================================================
  describe('listDrives', () => {
    it('should return list of USB drives', async () => {
      mockGet.mockResolvedValue({
        data: {
          drives: [
            { id: 'drive1', name: 'USB Drive 1', capacity: '32GB', device: '/dev/sdb', available: true, hasVault: false },
            { id: 'drive2', name: 'USB Drive 2', capacity: '64GB', device: '/dev/sdc', available: true, hasVault: true },
          ],
        },
      });

      const drives = await usbService.listDrives();

      expect(drives).toHaveLength(2);
      expect(drives[0].id).toBe('drive1');
      expect(drives[1].hasVault).toBe(true);
    });

    it('should return empty array when no drives found', async () => {
      mockGet.mockResolvedValue({ data: { drives: [] } });

      const drives = await usbService.listDrives();
      expect(drives).toEqual([]);
    });

    it('should handle null drives response', async () => {
      mockGet.mockResolvedValue({ data: {} });

      const drives = await usbService.listDrives();
      expect(drives).toEqual([]);
    });

    it('should throw human-readable error on failure', async () => {
      mockGet.mockRejectedValue({
        response: { data: { message: 'USB subsystem not available' } },
      });

      await expect(usbService.listDrives()).rejects.toThrow('USB subsystem not available');
    });

    it('should handle generic errors', async () => {
      mockGet.mockRejectedValue(new Error('Network error'));

      await expect(usbService.listDrives()).rejects.toThrow('Network error');
    });
  });

  // ============================================================================
  // Test: Provision Vault
  // ============================================================================
  describe('provisionVault', () => {
    it('should send provision request and return result', async () => {
      mockPost.mockResolvedValue({
        data: {
          vaultId: 'vault-123',
          recoveryPhrase: ['word1', 'word2', 'word3'],
        },
      });

      const result = await usbService.provisionVault({
        driveId: 'drive1',
        formatType: 'quick',
        fileSystem: 'exfat',
        masterPassword: 'strongpassword',
      });

      expect(result.vaultId).toBe('vault-123');
      expect(result.recoveryPhrase).toHaveLength(3);
      expect(mockPost).toHaveBeenCalledWith('/usb/provision', expect.objectContaining({
        drive_id: 'drive1',
        format_type: 'quick',
        file_system: 'exfat',
      }));
    });

    it('should log successful provision to audit service', async () => {
      const { auditService } = require('../auditService');
      mockPost.mockResolvedValue({
        data: { vaultId: 'vault-123', recoveryPhrase: [] },
      });

      await usbService.provisionVault({
        driveId: 'drive1',
        formatType: 'quick',
        fileSystem: 'exfat',
        masterPassword: 'password',
      });

      expect(auditService.log).toHaveBeenCalledWith(
        'vault',
        'usb_vault_provisioned',
        expect.objectContaining({ driveId: 'drive1' }),
        'success'
      );
    });

    it('should throw on provision failure', async () => {
      mockPost.mockRejectedValue({
        response: { data: { error: 'Drive not available' } },
      });

      await expect(
        usbService.provisionVault({
          driveId: 'drive1',
          formatType: 'quick',
          fileSystem: 'exfat',
          masterPassword: 'password',
        })
      ).rejects.toThrow('Drive not available');
    });
  });

  // ============================================================================
  // Test: Reset Drive
  // ============================================================================
  describe('resetDrive', () => {
    it('should send reset request', async () => {
      mockPost.mockResolvedValue({});

      await usbService.resetDrive({
        driveId: 'drive1',
        wipeMethod: 'quick',
      });

      expect(mockPost).toHaveBeenCalledWith('/usb/reset', expect.objectContaining({
        drive_id: 'drive1',
        wipe_method: 'quick',
        passes: 1,
      }));
    });

    it('should support secure wipe with multiple passes', async () => {
      mockPost.mockResolvedValue({});

      await usbService.resetDrive({
        driveId: 'drive1',
        wipeMethod: 'secure',
        passes: 3,
      });

      expect(mockPost).toHaveBeenCalledWith('/usb/reset', expect.objectContaining({
        wipe_method: 'secure',
        passes: 3,
      }));
    });

    it('should throw on reset failure', async () => {
      mockPost.mockRejectedValue({ message: 'Reset failed' });

      await expect(
        usbService.resetDrive({ driveId: 'drive1', wipeMethod: 'quick' })
      ).rejects.toThrow('Reset failed');
    });
  });

  // ============================================================================
  // Test: Container I/O
  // ============================================================================
  describe('container operations', () => {
    it('initVaultContainer should send header hex to API', async () => {
      mockPost.mockResolvedValue({});

      await usbService.initVaultContainer('/mnt/usb', new Uint8Array([0xab, 0xcd]));

      expect(mockPost).toHaveBeenCalledWith('/usb/container/init', expect.objectContaining({
        mount_point: '/mnt/usb',
        header_hex: expect.any(String),
      }));
    });

    it('appendVaultBytes should return offset and length', async () => {
      mockPost.mockResolvedValue({
        data: { offset: 256, length: 1024 },
      });

      const result = await usbService.appendVaultBytes('/mnt/usb', new Uint8Array(1024));

      expect(result.offset).toBe(256);
      expect(result.length).toBe(1024);
    });

    it('readVaultHeader should return Uint8Array', async () => {
      mockGet.mockResolvedValue({
        data: { header_hex: 'aabbccdd' },
      });

      const header = await usbService.readVaultHeader('/mnt/usb');

      expect(header).toBeInstanceOf(Uint8Array);
      expect(header.length).toBe(4);
    });

    it('readVaultBytes should return Uint8Array for range', async () => {
      mockGet.mockResolvedValue({
        data: { data_hex: '0102030405' },
      });

      const data = await usbService.readVaultBytes('/mnt/usb', 100, 5);

      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(5);
    });

    it('checkCapacity should return capacity info', async () => {
      mockGet.mockResolvedValue({
        data: {
          allowed: true,
          vaultSize: 536870912,
          partitionTotal: 1073741824,
          maxAllowed: 536870912,
          remaining: 536870912,
        },
      });

      const capacity = await usbService.checkCapacity('/mnt/usb', 1024);

      expect(capacity.allowed).toBe(true);
      expect(capacity.partitionTotal).toBe(1073741824);
    });
  });

  // ============================================================================
  // Test: Companion Health
  // ============================================================================
  describe('companion checks', () => {
    it('isCompanionAvailable should return true when reachable', async () => {
      mockGet.mockResolvedValue({});

      const available = await usbService.isCompanionAvailable();
      expect(available).toBe(true);
    });

    it('isCompanionAvailable should return false when unreachable', async () => {
      mockGet.mockRejectedValue(new Error('Connection refused'));

      const available = await usbService.isCompanionAvailable();
      expect(available).toBe(false);
    });

    it('isApiVersionMismatch should return false when compatible', async () => {
      mockGet.mockResolvedValue({ data: { compatible: true } });

      const mismatch = await usbService.isApiVersionMismatch();
      expect(mismatch).toBe(false);
    });

    it('isApiVersionMismatch should return true when unreachable', async () => {
      mockGet.mockRejectedValue(new Error('Timeout'));

      const mismatch = await usbService.isApiVersionMismatch();
      expect(mismatch).toBe(true);
    });
  });

  // ============================================================================
  // Test: Zero-Trace
  // ============================================================================
  describe('zero-trace operations', () => {
    it('scanArtifacts should return artifacts array', async () => {
      mockPost.mockResolvedValue({
        data: {
          artifacts: [
            { id: 'art1', severity: 'high', description: 'Log file', canRemediate: true },
          ],
        },
      });

      const artifacts = await usbService.scanArtifacts(['/mnt/usb']);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0].severity).toBe('high');
    });

    it('runZeroTrace should return cleanup results', async () => {
      mockPost.mockResolvedValue({
        data: { cleaned: 5, failed: 0 },
      });

      const result = await usbService.runZeroTrace(['/mnt/usb']);
      expect(result.cleaned).toBe(5);
      expect(result.failed).toBe(0);
    });
  });
});
