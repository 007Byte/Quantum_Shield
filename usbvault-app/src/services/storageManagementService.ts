import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';

export interface StorageStats {
  totalUsed: number;
  totalAvailable: number;
  fileCount: number;
  avgFileSize: number;
  largestFile: {
    name: string;
    size: number;
  };
  categoryBreakdown: Record<string, { count: number; size: number }>;
  growthRate: number;
}

export interface DuplicateFile {
  id: string;
  name: string;
  size: number;
  path: string;
  lastModified: number;
}

export interface DuplicateGroup {
  hash: string;
  files: DuplicateFile[];
  totalWastedSpace: number;
}

export interface CleanupRecommendation {
  id: string;
  type: 'duplicate' | 'orphan' | 'oversized' | 'stale' | 'temp';
  description: string;
  potentialSavings: number;
  files: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface StorageHistoryPoint {
  date: number;
  used: number;
  fileCount: number;
}

export interface CompactionStats {
  beforeSize: number;
  afterSize: number;
  savedSpace: number;
  savedPercent: number;
  orphansRemoved: number;
  fragmentsDefragged: number;
  duration: number;
}

export interface StorageQuota {
  used: number;
  limit: number;
  usagePercent: number;
  tierLimit: number;
}

export interface StorageAlert {
  type: 'warning' | 'critical' | 'info';
  message: string;
  severity: 'high' | 'medium' | 'low';
}

class StorageManagementService {
  private readonly STATS_KEY = 'qav:storage_stats';
  private readonly HISTORY_KEY = 'qav:storage_history';
  private readonly CLEANUP_HISTORY_KEY = 'qav:cleanup_history';
  private readonly HISTORY_LIMIT = 30;

  constructor() {
    this.initializeStorage();
  }

  private initializeStorage(): void {
    if (Platform.OS === 'web') {
      if (!localStorage.getItem(this.STATS_KEY)) {
        const initialStats: StorageStats = {
          totalUsed: 0,
          totalAvailable: 1099511627776,
          fileCount: 0,
          avgFileSize: 0,
          largestFile: { name: '', size: 0 },
          categoryBreakdown: {},
          growthRate: 0,
        };
        localStorage.setItem(this.STATS_KEY, JSON.stringify(initialStats));
      }

      if (!localStorage.getItem(this.HISTORY_KEY)) {
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify([]));
      }

      if (!localStorage.getItem(this.CLEANUP_HISTORY_KEY)) {
        localStorage.setItem(this.CLEANUP_HISTORY_KEY, JSON.stringify([]));
      }
    }
  }

  getStorageStats(): StorageStats {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(this.STATS_KEY);
      return stored ? JSON.parse(stored) : this.getDefaultStats();
    }
    return this.getDefaultStats();
  }

  private getDefaultStats(): StorageStats {
    return {
      totalUsed: 0,
      totalAvailable: 1099511627776,
      fileCount: 0,
      avgFileSize: 0,
      largestFile: { name: '', size: 0 },
      categoryBreakdown: {},
      growthRate: 0,
    };
  }

  getStorageHistory(): StorageHistoryPoint[] {
    if (Platform.OS === 'web') {
      const stored = localStorage.getItem(this.HISTORY_KEY);
      const history: StorageHistoryPoint[] = stored ? JSON.parse(stored) : [];
      return history.slice(-this.HISTORY_LIMIT);
    }
    return [];
  }

  async findDuplicates(): Promise<DuplicateGroup[]> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const duplicates: DuplicateGroup[] = [
          {
            hash: 'hash_abc123def456',
            files: [
              {
                id: 'file_001',
                name: 'document_v1.pdf',
                size: 2097152,
                path: '/vault/documents/document_v1.pdf',
                lastModified: Date.now() - 86400000,
              },
              {
                id: 'file_002',
                name: 'document_v1_copy.pdf',
                size: 2097152,
                path: '/vault/archive/document_v1_copy.pdf',
                lastModified: Date.now() - 172800000,
              },
            ],
            totalWastedSpace: 2097152,
          },
          {
            hash: 'hash_xyz789uvw012',
            files: [
              {
                id: 'file_003',
                name: 'report_2025.xlsx',
                size: 1048576,
                path: '/vault/reports/report_2025.xlsx',
                lastModified: Date.now() - 604800000,
              },
              {
                id: 'file_004',
                name: 'report_2025_final.xlsx',
                size: 1048576,
                path: '/vault/reports/report_2025_final.xlsx',
                lastModified: Date.now() - 518400000,
              },
              {
                id: 'file_005',
                name: 'report_2025_backup.xlsx',
                size: 1048576,
                path: '/vault/backup/report_2025_backup.xlsx',
                lastModified: Date.now() - 432000000,
              },
            ],
            totalWastedSpace: 2097152,
          },
        ];

        auditService.log('STORAGE_DUPLICATES_FOUND', 'storage', {
          groupCount: duplicates.length,
          totalWasted: duplicates.reduce((sum, g) => sum + g.totalWastedSpace, 0),
        } as any);

        resolve(duplicates);
      }, 100);
    });
  }

  getCleanupRecommendations(): CleanupRecommendation[] {
    const stats = this.getStorageStats();
    const recommendations: CleanupRecommendation[] = [];

    if (stats.fileCount > 1000) {
      recommendations.push({
        id: 'rec_001',
        type: 'oversized',
        description: 'Archive large files older than 6 months',
        potentialSavings: 5368709120,
        files: ['file_large_001', 'file_large_002', 'file_large_003'],
        priority: 'high',
      });
    }

    recommendations.push({
      id: 'rec_002',
      type: 'duplicate',
      description: 'Remove duplicate files detected in vault',
      potentialSavings: 4194304,
      files: ['file_002', 'file_004', 'file_005'],
      priority: 'high',
    });

    recommendations.push({
      id: 'rec_003',
      type: 'stale',
      description: 'Remove files not accessed in 1 year',
      potentialSavings: 1073741824,
      files: ['file_stale_001', 'file_stale_002'],
      priority: 'medium',
    });

    recommendations.push({
      id: 'rec_004',
      type: 'temp',
      description: 'Clean up temporary and cache files',
      potentialSavings: 536870912,
      files: ['file_temp_001', 'file_temp_002', 'file_temp_003'],
      priority: 'medium',
    });

    recommendations.push({
      id: 'rec_005',
      type: 'orphan',
      description: 'Remove orphaned files with missing metadata',
      potentialSavings: 268435456,
      files: ['file_orphan_001'],
      priority: 'low',
    });

    return recommendations;
  }

  async executeCleanup(recommendationId: string): Promise<{ freed: number; filesRemoved: number }> {
    return new Promise((resolve) => {
      const recommendations = this.getCleanupRecommendations();
      const recommendation = recommendations.find((r) => r.id === recommendationId);

      if (!recommendation) {
        resolve({ freed: 0, filesRemoved: 0 });
        return;
      }

      setTimeout(() => {
        const stats = this.getStorageStats();
        const freed = recommendation.potentialSavings;
        const filesRemoved = recommendation.files.length;

        stats.totalUsed = Math.max(0, stats.totalUsed - freed);
        stats.fileCount = Math.max(0, stats.fileCount - filesRemoved);

        if (stats.fileCount > 0) {
          stats.avgFileSize = stats.totalUsed / stats.fileCount;
        }

        if (Platform.OS === 'web') {
          localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
          this.recordCleanupHistory(recommendationId, freed, filesRemoved);
        }

        auditService.log('STORAGE_CLEANUP_EXECUTED', recommendationId, {
          freed,
          filesRemoved,
        } as any);

        resolve({ freed, filesRemoved });
      }, 150);
    });
  }

  async executeAllCleanups(): Promise<{ totalFreed: number; totalFilesRemoved: number }> {
    return new Promise(async (resolve) => {
      const recommendations = this.getCleanupRecommendations();
      let totalFreed = 0;
      let totalFilesRemoved = 0;

      for (const recommendation of recommendations) {
        const result = await this.executeCleanup(recommendation.id);
        totalFreed += result.freed;
        totalFilesRemoved += result.filesRemoved;
      }

      auditService.log('STORAGE_ALL_CLEANUPS_EXECUTED', 'storage', {
        totalFreed,
        totalFilesRemoved,
      } as any);

      resolve({ totalFreed, totalFilesRemoved });
    });
  }

  async runCompaction(): Promise<CompactionStats> {
    return new Promise((resolve) => {
      const stats = this.getStorageStats();
      const beforeSize = stats.totalUsed;

      setTimeout(() => {
        const savedSpace = Math.floor(beforeSize * 0.08);
        const afterSize = Math.max(0, beforeSize - savedSpace);
        const savedPercent = beforeSize > 0 ? Math.round((savedSpace / beforeSize) * 100) : 0;

        const compactionStats: CompactionStats = {
          beforeSize,
          afterSize,
          savedSpace,
          savedPercent,
          orphansRemoved: 3,
          fragmentsDefragged: 12,
          duration: 2500,
        };

        stats.totalUsed = afterSize;
        if (Platform.OS === 'web') {
          localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
        }

        auditService.log('STORAGE_COMPACTION_COMPLETED', 'storage', {
          savedSpace,
          savedPercent,
          duration: compactionStats.duration,
        } as any);

        resolve(compactionStats);
      }, 2500);
    });
  }

  getStorageQuota(): StorageQuota {
    const stats = this.getStorageStats();
    const limit = 1099511627776;
    const usagePercent = Math.round((stats.totalUsed / limit) * 100);

    return {
      used: stats.totalUsed,
      limit,
      usagePercent,
      tierLimit: limit,
    };
  }

  isNearQuota(): boolean {
    const quota = this.getStorageQuota();
    return quota.usagePercent >= 80;
  }

  getStorageAlerts(): StorageAlert[] {
    const quota = this.getStorageQuota();
    const stats = this.getStorageStats();
    const alerts: StorageAlert[] = [];

    if (quota.usagePercent >= 90) {
      alerts.push({
        type: 'critical',
        message: 'Storage usage critical: 90% of quota used',
        severity: 'high',
      });
    } else if (quota.usagePercent >= 80) {
      alerts.push({
        type: 'warning',
        message: 'Storage usage high: 80% of quota used',
        severity: 'high',
      });
    }

    if (stats.growthRate > 0.1) {
      alerts.push({
        type: 'warning',
        message: 'High storage growth rate detected',
        severity: 'medium',
      });
    }

    const duplicates = this.findDuplicates();
    duplicates.then((dups) => {
      if (dups.length > 0) {
        const totalWasted = dups.reduce((sum, g) => sum + g.totalWastedSpace, 0);
        if (totalWasted > 1073741824) {
          alerts.push({
            type: 'info',
            message: `${(totalWasted / 1073741824).toFixed(2)}GB of duplicate files detected`,
            severity: 'medium',
          });
        }
      }
    });

    return alerts;
  }

  exportStorageReport(): string {
    const stats = this.getStorageStats();
    const history = this.getStorageHistory();
    const quota = this.getStorageQuota();
    const recommendations = this.getCleanupRecommendations();

    const report = {
      timestamp: Date.now(),
      stats,
      quota,
      history,
      recommendations,
      alerts: this.getStorageAlerts(),
    };

    return JSON.stringify(report, null, 2);
  }

  private recordCleanupHistory(recommendationId: string, freed: number, filesRemoved: number): void {
    if (Platform.OS === 'web') {
      const history = localStorage.getItem(this.CLEANUP_HISTORY_KEY);
      const cleanupHistory = history ? JSON.parse(history) : [];

      cleanupHistory.push({
        timestamp: Date.now(),
        recommendationId,
        freed,
        filesRemoved,
      });

      const limited = cleanupHistory.slice(-this.HISTORY_LIMIT);
      localStorage.setItem(this.CLEANUP_HISTORY_KEY, JSON.stringify(limited));
    }
  }
}

export const storageManagementService = new StorageManagementService();
