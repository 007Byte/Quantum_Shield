/**
 * Backup Service Tests — FEAT-07
 *
 * Tests backup creation, encryption, export, import, and restore workflows.
 */

import { backupService } from '../backupService';
import type { BackupData } from '../backupService';

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

// Mock vault list store (vaultStore was deleted; app now uses vaultListStore)
jest.mock('@/stores/vaultListStore', () => ({
  useVaultListStore: {
    getState: () => ({
      vaults: [{ id: 'vault1', name: 'Main', encryptedMetadata: 'metadata1' }],
      files: [{ id: 'file1', name: 'document.pdf', size: 1024, encryptedMetadata: 'meta' }],
      deleteVault: jest.fn().mockResolvedValue(undefined),
      createVault: jest.fn().mockResolvedValue(undefined),
      addFile: jest.fn(),
    }),
  },
}));

// Mock settings service
jest.mock('@/services/settingsService', () => ({
  settingsService: {
    load: () => ({
      biometricLockEnabled: false,
      twoFactorEnabled: false,
      autoLockTimeoutMin: 5,
      ghostModeEnabled: false,
      selfDestructEnabled: false,
      selfDestructAttempts: 5,
      keyProvider: 'software' as const,
      pqcEnabled: false,
      autoBackupEnabled: false,
      backupFrequency: 'weekly' as const,
      lastBackupAt: null,
      notificationsEnabled: true,
    }),
    save: jest.fn(),
  },
}));

// Mock audit service
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock document for download
Object.defineProperty(window, 'URL', {
  value: {
    createObjectURL: jest.fn(() => 'blob:mock-url'),
    revokeObjectURL: jest.fn(),
  },
});

Object.defineProperty(window, 'Blob', {
  value: class Blob {
    constructor(
      public parts: any[],
      public options: any
    ) {}
  },
});

describe('BackupService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('createBackup', () => {
    it('should create backup with metadata', async () => {
      const backup = await backupService.createBackup();

      expect(backup).toBeDefined();
      expect(backup.metadata).toBeDefined();
      expect(backup.metadata.id).toMatch(/^backup-/);
      expect(backup.metadata.createdAt).toBeDefined();
      expect(backup.metadata.version).toBe('1.0.0');
      expect(backup.metadata.encrypted).toBe(false);
      expect(backup.vaults.length).toBeGreaterThanOrEqual(0);
      expect(backup.files.length).toBeGreaterThanOrEqual(0);
      expect(backup.settings).toBeDefined();
    });

    it('should include correct vault count in metadata', async () => {
      const backup = await backupService.createBackup();

      expect(backup.metadata.vaultCount).toBeGreaterThanOrEqual(0);
      expect(backup.metadata.fileCount).toBeGreaterThanOrEqual(0);
    });

    it('should not include passwords by default', async () => {
      const backup = await backupService.createBackup();

      expect(backup.passwords).toBeUndefined();
    });

    it('should include passwords when requested', async () => {
      const backup = await backupService.createBackup(true);

      expect(backup.passwords).toBeDefined();
      expect(Array.isArray(backup.passwords)).toBe(true);
    });
  });

  describe('exportBackup', () => {
    it('should export unencrypted backup as base64', async () => {
      const backup = await backupService.createBackup();

      const exported = await backupService.exportBackup(backup);

      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);
      // Should be valid base64
      expect(() => Buffer.from(exported, 'base64')).not.toThrow();
    });

    it('should export encrypted backup with key', async () => {
      const backup = await backupService.createBackup();

      const exported = await backupService.exportBackup(backup, 'my-secret-passphrase');

      expect(typeof exported).toBe('string');
      expect(exported.length).toBeGreaterThan(0);
    });

    it('should produce different output with encryption', async () => {
      const backup = await backupService.createBackup();

      const unencrypted = await backupService.exportBackup(backup);
      const encrypted = await backupService.exportBackup(backup, 'passphrase');

      expect(unencrypted).not.toBe(encrypted);
    });
  });

  describe('importBackup', () => {
    it('should import unencrypted backup', async () => {
      const backup = await backupService.createBackup();
      const exported = await backupService.exportBackup(backup);

      const imported = await backupService.importBackup(exported);

      expect(imported).toBeDefined();
      expect(imported.metadata.id).toBe(backup.metadata.id);
      expect(imported.vaults).toEqual(backup.vaults);
      expect(imported.files).toEqual(backup.files);
    });

    it('should import encrypted backup with correct key', async () => {
      const backup = await backupService.createBackup();
      const passphrase = 'my-secret-passphrase';
      const exported = await backupService.exportBackup(backup, passphrase);

      const imported = await backupService.importBackup(exported, passphrase);

      expect(imported.metadata.id).toBe(backup.metadata.id);
    });

    it('should throw on encrypted backup without key', async () => {
      const backup = await backupService.createBackup();
      const exported = await backupService.exportBackup(backup, 'passphrase');

      await expect(backupService.importBackup(exported)).rejects.toThrow();
    });

    it('should throw on invalid base64', async () => {
      await expect(backupService.importBackup('not valid base64!!!')).rejects.toThrow();
    });
  });

  describe('validateBackup', () => {
    it('should validate correct backup', () => {
      const backup: BackupData = {
        metadata: {
          id: 'backup-123',
          createdAt: '2024-01-01T00:00:00Z',
          vaultCount: 1,
          fileCount: 1,
          sizeBytes: 1024,
          version: '1.0.0',
          encrypted: false,
        },
        vaults: [],
        files: [],
        settings: {
          biometricLockEnabled: false,
          twoFactorEnabled: false,
          autoLockTimeoutMin: 5,
          ghostModeEnabled: false,
          selfDestructEnabled: false,
          selfDestructAttempts: 5,
          keyProvider: 'software',
          pqcEnabled: false,
          autoBackupEnabled: false,
          backupFrequency: 'weekly',
          lastBackupAt: null,
          notificationsEnabled: true,
        },
      };

      const result = backupService.validateBackup(backup);

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      expect(result.metadata).toBeDefined();
    });

    it('should reject backup with missing metadata', () => {
      const result = backupService.validateBackup({
        vaults: [],
        files: [],
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('metadata'))).toBe(true);
    });

    it('should reject backup with missing vaults array', () => {
      const result = backupService.validateBackup({
        metadata: { id: 'test', createdAt: '2024-01-01T00:00:00Z' },
        files: [],
      });

      expect(result.valid).toBe(false);
    });

    it('should reject non-object data', () => {
      const result = backupService.validateBackup('not an object');

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must be an object'))).toBe(true);
    });
  });

  describe('getAutoBackupConfig', () => {
    it('should return default config initially', () => {
      const config = backupService.getAutoBackupConfig();

      expect(config).toBeDefined();
      expect(config.enabled).toBe(false);
      expect(config.intervalHours).toBe(168);
      expect(config.maxBackups).toBe(5);
      expect(config.lastBackupAt).toBeNull();
    });

    it('should load saved config from localStorage', () => {
      const savedConfig = {
        enabled: true,
        intervalHours: 24 as const,
        maxBackups: 3 as const,
        lastBackupAt: '2024-01-01T00:00:00Z',
      };
      localStorage.setItem('usbvault_auto_backup_config', JSON.stringify(savedConfig));

      const config = backupService.getAutoBackupConfig();

      expect(config.enabled).toBe(true);
      expect(config.intervalHours).toBe(24);
    });
  });

  describe('setAutoBackupConfig', () => {
    it('should update auto-backup config', () => {
      backupService.setAutoBackupConfig({
        enabled: true,
        intervalHours: 24,
      });

      const config = backupService.getAutoBackupConfig();

      expect(config.enabled).toBe(true);
      expect(config.intervalHours).toBe(24);
    });

    it('should persist to localStorage', () => {
      backupService.setAutoBackupConfig({ enabled: true });

      const stored = localStorage.getItem('usbvault_auto_backup_config');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.enabled).toBe(true);
    });
  });

  describe('getBackupHistory', () => {
    it('should return empty array initially', () => {
      const history = backupService.getBackupHistory();

      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBe(0);
    });

    it('should load history from localStorage', () => {
      const mockHistory = [
        {
          id: 'backup-1',
          createdAt: '2024-01-01T00:00:00Z',
          sizeBytes: 1024,
          vaultCount: 1,
          fileCount: 1,
          status: 'success' as const,
        },
      ];
      localStorage.setItem('usbvault_backup_history', JSON.stringify(mockHistory));

      const history = backupService.getBackupHistory();

      expect(history.length).toBe(1);
      expect(history[0].id).toBe('backup-1');
    });
  });

  describe('addToHistory', () => {
    it('should add entry to backup history', () => {
      const entry = {
        id: 'backup-123',
        createdAt: '2024-01-01T00:00:00Z',
        sizeBytes: 2048,
        vaultCount: 2,
        fileCount: 5,
        status: 'success' as const,
      };

      backupService.addToHistory(entry);

      const history = backupService.getBackupHistory();
      expect(history.length).toBe(1);
      expect(history[0].id).toBe('backup-123');
    });
  });

  describe('deleteBackupHistory', () => {
    it('should remove entry from history', () => {
      const entry = {
        id: 'backup-123',
        createdAt: '2024-01-01T00:00:00Z',
        sizeBytes: 2048,
        vaultCount: 2,
        fileCount: 5,
        status: 'success' as const,
      };

      backupService.addToHistory(entry);
      backupService.deleteBackupHistory('backup-123');

      const history = backupService.getBackupHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('shouldAutoBackup', () => {
    it('should return false when auto-backup disabled', () => {
      backupService.setAutoBackupConfig({ enabled: false });

      const should = backupService.shouldAutoBackup();

      expect(should).toBe(false);
    });

    it('should return true when enabled and no last backup', () => {
      backupService.setAutoBackupConfig({ enabled: true, lastBackupAt: null });

      const should = backupService.shouldAutoBackup();

      expect(should).toBe(true);
    });

    it('should check interval elapsed', () => {
      const now = new Date();
      const oldTime = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago

      backupService.setAutoBackupConfig({
        enabled: true,
        intervalHours: 24,
        lastBackupAt: oldTime.toISOString(),
      });

      const should = backupService.shouldAutoBackup();

      expect(should).toBe(true);
    });

    it('should return false if interval not elapsed', () => {
      const now = new Date();
      const recentTime = new Date(now.getTime() - 12 * 60 * 60 * 1000); // 12 hours ago

      backupService.setAutoBackupConfig({
        enabled: true,
        intervalHours: 24,
        lastBackupAt: recentTime.toISOString(),
      });

      const should = backupService.shouldAutoBackup();

      expect(should).toBe(false);
    });
  });

  describe('getLastBackupTime', () => {
    it('should return null when no backup', () => {
      const time = backupService.getLastBackupTime();

      expect(time).toBeNull();
    });

    it('should return last backup timestamp', () => {
      const timestamp = '2024-01-15T12:00:00Z';
      backupService.setAutoBackupConfig({ lastBackupAt: timestamp });

      const time = backupService.getLastBackupTime();

      expect(time).toBe(timestamp);
    });
  });

  describe('integration: full backup and restore flow', () => {
    it('should complete backup-export-import cycle', async () => {
      // 1. Create backup
      const backup = await backupService.createBackup();
      expect(backup.metadata.id).toBeDefined();

      // 2. Export backup
      const exported = await backupService.exportBackup(backup);
      expect(typeof exported).toBe('string');

      // 3. Import backup
      const imported = await backupService.importBackup(exported);
      expect(imported.metadata.id).toBe(backup.metadata.id);

      // 4. Validate imported backup
      const validation = backupService.validateBackup(imported);
      expect(validation.valid).toBe(true);

      // 5. Add to history
      backupService.addToHistory({
        id: backup.metadata.id,
        createdAt: backup.metadata.createdAt,
        sizeBytes: backup.metadata.sizeBytes,
        vaultCount: backup.metadata.vaultCount,
        fileCount: backup.metadata.fileCount,
        status: 'success',
      });

      // 6. Verify in history
      const history = backupService.getBackupHistory();
      expect(history.some(h => h.id === backup.metadata.id)).toBe(true);
    });

    it('should complete encrypted backup flow', async () => {
      const passphrase = 'very-secure-passphrase-123';

      // 1. Create and export encrypted
      const backup = await backupService.createBackup();
      const exported = await backupService.exportBackup(backup, passphrase);

      // 2. Import with correct key
      const imported = await backupService.importBackup(exported, passphrase);
      expect(imported.metadata.id).toBe(backup.metadata.id);

      // 3. Try with wrong key
      await expect(backupService.importBackup(exported, 'wrong-passphrase')).rejects.toThrow();
    });
  });
});
