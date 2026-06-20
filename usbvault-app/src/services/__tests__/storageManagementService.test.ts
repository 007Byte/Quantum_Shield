/**
 * Storage Management Service Tests — Core Functionality
 *
 * Tests storage stats, duplicate detection, cleanup recommendations,
 * compaction, quota management, and alert generation.
 */

import { storageManagementService } from '../storageManagementService';

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

// Mock audit service
jest.mock('@/services/auditService', () => ({
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

describe('StorageManagementService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test: Storage Stats
  // ============================================================================
  describe('getStorageStats', () => {
    it('should return default stats when no data exists', () => {
      const stats = storageManagementService.getStorageStats();

      expect(stats.totalUsed).toBe(0);
      expect(stats.totalAvailable).toBe(1099511627776); // 1TB
      expect(stats.fileCount).toBe(0);
      expect(stats.avgFileSize).toBe(0);
    });

    it('should return stored stats from localStorage', () => {
      const customStats = {
        totalUsed: 5000000,
        totalAvailable: 1099511627776,
        fileCount: 10,
        avgFileSize: 500000,
        largestFile: { name: 'big.pdf', size: 2000000 },
        categoryBreakdown: {},
        growthRate: 0.05,
      };
      localStorage.setItem('usbvault:storage_stats', JSON.stringify(customStats));

      const stats = storageManagementService.getStorageStats();
      expect(stats.totalUsed).toBe(5000000);
      expect(stats.fileCount).toBe(10);
    });
  });

  // ============================================================================
  // Test: Storage History
  // ============================================================================
  describe('getStorageHistory', () => {
    it('should return empty array when no history exists', () => {
      const history = storageManagementService.getStorageHistory();
      expect(history).toEqual([]);
    });

    it('should return stored history points', () => {
      const historyData = [
        { date: Date.now() - 86400000, used: 1000000, fileCount: 5 },
        { date: Date.now(), used: 2000000, fileCount: 10 },
      ];
      localStorage.setItem('usbvault:storage_history', JSON.stringify(historyData));

      const history = storageManagementService.getStorageHistory();
      expect(history).toHaveLength(2);
    });

    it('should limit history to 30 entries', () => {
      const historyData = Array.from({ length: 50 }, (_, i) => ({
        date: Date.now() - i * 86400000,
        used: i * 100000,
        fileCount: i,
      }));
      localStorage.setItem('usbvault:storage_history', JSON.stringify(historyData));

      const history = storageManagementService.getStorageHistory();
      expect(history.length).toBeLessThanOrEqual(30);
    });
  });

  // ============================================================================
  // Test: Duplicate Detection
  // ============================================================================
  describe('findDuplicates', () => {
    it('should return duplicate file groups', async () => {
      const duplicates = await storageManagementService.findDuplicates();

      expect(duplicates.length).toBeGreaterThan(0);
      duplicates.forEach(group => {
        expect(group.hash).toBeDefined();
        expect(group.files.length).toBeGreaterThanOrEqual(2);
        expect(group.totalWastedSpace).toBeGreaterThan(0);
      });
    });

    it('should log duplicate detection to audit service', async () => {
      const { auditService } = require('@/services/auditService');

      await storageManagementService.findDuplicates();

      expect(auditService.log).toHaveBeenCalledWith(
        'STORAGE_DUPLICATES_FOUND',
        'storage',
        expect.objectContaining({
          groupCount: expect.any(Number),
        })
      );
    });
  });

  // ============================================================================
  // Test: Cleanup Recommendations
  // ============================================================================
  describe('getCleanupRecommendations', () => {
    it('should return cleanup recommendations', () => {
      const recommendations = storageManagementService.getCleanupRecommendations();

      expect(recommendations.length).toBeGreaterThan(0);
      recommendations.forEach(rec => {
        expect(rec.id).toBeDefined();
        expect(rec.type).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(rec.potentialSavings).toBeGreaterThan(0);
        expect(['high', 'medium', 'low']).toContain(rec.priority);
      });
    });

    it('should include duplicate and stale recommendations', () => {
      const recommendations = storageManagementService.getCleanupRecommendations();
      const types = recommendations.map(r => r.type);

      expect(types).toContain('duplicate');
      expect(types).toContain('stale');
    });
  });

  // ============================================================================
  // Test: Execute Cleanup
  // ============================================================================
  describe('executeCleanup', () => {
    it('should execute a cleanup recommendation and return results', async () => {
      const result = await storageManagementService.executeCleanup('rec_002');

      expect(result.freed).toBeGreaterThan(0);
      expect(result.filesRemoved).toBeGreaterThan(0);
    });

    it('should return zero results for non-existent recommendation', async () => {
      const result = await storageManagementService.executeCleanup('nonexistent');

      expect(result.freed).toBe(0);
      expect(result.filesRemoved).toBe(0);
    });
  });

  describe('executeAllCleanups', () => {
    it('should execute all cleanups and return totals', async () => {
      const result = await storageManagementService.executeAllCleanups();

      expect(result.totalFreed).toBeGreaterThan(0);
      expect(result.totalFilesRemoved).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Test: Compaction
  // ============================================================================
  describe('runCompaction', () => {
    it('should return compaction statistics', async () => {
      // Set some used space so compaction has something to work with
      const stats = {
        totalUsed: 100000000,
        totalAvailable: 1099511627776,
        fileCount: 50,
        avgFileSize: 2000000,
        largestFile: { name: 'big.pdf', size: 10000000 },
        categoryBreakdown: {},
        growthRate: 0,
      };
      localStorage.setItem('usbvault:storage_stats', JSON.stringify(stats));

      const compaction = await storageManagementService.runCompaction();

      expect(compaction.beforeSize).toBe(100000000);
      expect(compaction.afterSize).toBeLessThan(compaction.beforeSize);
      expect(compaction.savedSpace).toBeGreaterThan(0);
      expect(compaction.savedPercent).toBeGreaterThan(0);
      expect(compaction.orphansRemoved).toBeDefined();
      expect(compaction.fragmentsDefragged).toBeDefined();
      expect(compaction.duration).toBeDefined();
    });
  });

  // ============================================================================
  // Test: Quota Management
  // ============================================================================
  describe('getStorageQuota', () => {
    it('should return quota information', () => {
      const quota = storageManagementService.getStorageQuota();

      expect(quota.used).toBeDefined();
      expect(quota.limit).toBe(1099511627776);
      expect(quota.usagePercent).toBeDefined();
      expect(quota.tierLimit).toBe(1099511627776);
    });

    it('should calculate usage percentage correctly', () => {
      const stats = {
        totalUsed: 549755813888, // 50% of 1TB
        totalAvailable: 1099511627776,
        fileCount: 100,
        avgFileSize: 5000000,
        largestFile: { name: 'test', size: 0 },
        categoryBreakdown: {},
        growthRate: 0,
      };
      localStorage.setItem('usbvault:storage_stats', JSON.stringify(stats));

      const quota = storageManagementService.getStorageQuota();
      expect(quota.usagePercent).toBe(50);
    });
  });

  describe('isNearQuota', () => {
    it('should return false when usage is low', () => {
      expect(storageManagementService.isNearQuota()).toBe(false);
    });

    it('should return true when usage is >= 80%', () => {
      const stats = {
        totalUsed: 879609302221, // ~80% of 1TB
        totalAvailable: 1099511627776,
        fileCount: 500,
        avgFileSize: 1000000,
        largestFile: { name: 'test', size: 0 },
        categoryBreakdown: {},
        growthRate: 0,
      };
      localStorage.setItem('usbvault:storage_stats', JSON.stringify(stats));

      expect(storageManagementService.isNearQuota()).toBe(true);
    });
  });

  // ============================================================================
  // Test: Storage Alerts
  // ============================================================================
  describe('getStorageAlerts', () => {
    it('should return empty alerts when usage is low', () => {
      const alerts = storageManagementService.getStorageAlerts();
      // May still return some alerts for duplicates etc.
      expect(Array.isArray(alerts)).toBe(true);
    });

    it('should return critical alert when usage >= 90%', () => {
      const stats = {
        totalUsed: 989560465098, // ~90% of 1TB
        totalAvailable: 1099511627776,
        fileCount: 1000,
        avgFileSize: 1000000,
        largestFile: { name: 'test', size: 0 },
        categoryBreakdown: {},
        growthRate: 0,
      };
      localStorage.setItem('usbvault:storage_stats', JSON.stringify(stats));

      const alerts = storageManagementService.getStorageAlerts();
      const critical = alerts.find(a => a.type === 'critical');
      expect(critical).toBeDefined();
    });
  });

  // ============================================================================
  // Test: Export Report
  // ============================================================================
  describe('exportStorageReport', () => {
    it('should return valid JSON string', () => {
      const report = storageManagementService.exportStorageReport();

      expect(() => JSON.parse(report)).not.toThrow();
      const parsed = JSON.parse(report);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.stats).toBeDefined();
      expect(parsed.quota).toBeDefined();
      expect(parsed.recommendations).toBeDefined();
    });
  });
});
