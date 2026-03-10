// PH4-FIX: Moved to vault domain
import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';

/**
 * Statistics about the vault's storage and fragmentation.
 */
export interface CompactionStats {
  /** Total size of the vault storage in bytes */
  totalSize: number;
  /** Amount of storage currently in use (non-deleted) in bytes */
  usedSize: number;
  /** Amount of storage that can be reclaimed through compaction in bytes */
  reclaimableSize: number;
  /** Fragmentation percentage (0-100) */
  fragmentationPercent: number;
  /** Number of deleted or orphaned entries */
  deletedEntries: number;
  /** Timestamp of the last compaction operation */
  lastCompactedAt: number | null;
}

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
  /** Whether the compaction was successful */
  success: boolean;
  /** Statistics before compaction */
  before: CompactionStats;
  /** Statistics after compaction */
  after: CompactionStats;
  /** Space reclaimed in bytes */
  spaceSaved: number;
  /** Number of entries removed */
  entriesRemoved: number;
  /** Timestamp of the compaction */
  compactedAt: number;
  /** Time taken to compact in milliseconds */
  duration: number;
}

/**
 * Storage breakdown by category.
 */
export interface StorageBreakdown {
  /** Category name (e.g., "passwords", "files", "messages") */
  category: string;
  /** Size of this category in bytes */
  size: number;
  /** Percentage of total storage */
  percentage: number;
}

/**
 * Individual record in the compaction history.
 */
export interface CompactionRecord {
  /** Result of the compaction operation */
  result: CompactionResult;
  /** Reason for the compaction */
  reason: string;
  /** Timestamp when recorded */
  recordedAt: number;
}

const STORAGE_KEY = 'qav:compaction_history';
const VAULT_PREFIX = 'qav:vault_';
const MAX_HISTORY_RECORDS = 100;
const FRAGMENTATION_THRESHOLD = 10; // percentage

/**
 * Vault Compaction Service
 *
 * Analyzes vault storage for reclaimable space and performs compaction operations
 * to optimize storage utilization and reduce fragmentation. Tracks compaction history
 * and provides storage breakdown analytics.
 */
class VaultCompactionService {
  private compactionInProgress = false;

  /**
   * Load compaction history from storage.
   *
   * @returns Array of CompactionRecord objects
   */
  private loadHistory(): CompactionRecord[] {
    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
        console.error('Failed to load compaction history:', error);
      }
    }
    return [];
  }

  /**
   * Save compaction history to storage.
   *
   * @param history - Array of CompactionRecord objects
   */
  private saveHistory(history: CompactionRecord[]): void {
    if (Platform.OS === 'web') {
      try {
        // Keep only the most recent records
        const trimmed = history.slice(-MAX_HISTORY_RECORDS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch (error) {
        console.error('Failed to save compaction history:', error);
      }
    }
  }

  /**
   * Get all vault entries from localStorage.
   */
  private getVaultEntries(): Array<{ key: string; size: number }> {
    const entries: Array<{ key: string; size: number }> = [];

    if (Platform.OS === 'web') {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(VAULT_PREFIX)) {
            const value = localStorage.getItem(key);
            const size = value ? new TextEncoder().encode(value).length : 0;
            entries.push({ key, size });
          }
        }
      } catch (error) {
        console.error('Failed to enumerate vault entries:', error);
      }
    }

    return entries;
  }

  /**
   * Analyze the vault for storage statistics and fragmentation.
   * This method scans all vault entries and calculates usage metrics.
   *
   * @returns CompactionStats object with current vault statistics
   */
  analyzeVault(): CompactionStats {
    const entries = this.getVaultEntries();
    let totalSize = 0;
    let usedSize = 0;
    let deletedEntries = 0;

    for (const entry of entries) {
      totalSize += entry.size;

      // Check if entry is marked as deleted (convention: prefix with deleted:)
      if (entry.key.includes('deleted:')) {
        deletedEntries++;
      } else {
        usedSize += entry.size;
      }
    }

    const reclaimableSize = Math.max(0, totalSize - usedSize);
    const fragmentationPercent =
      totalSize > 0 ? Math.round((reclaimableSize / totalSize) * 100) : 0;

    return {
      totalSize,
      usedSize,
      reclaimableSize,
      fragmentationPercent,
      deletedEntries,
      lastCompactedAt: this.getLastCompactionResult()?.compactedAt ?? null,
    };
  }

  /**
   * Perform vault compaction by removing deleted/orphaned entries and defragmenting.
   * This operation is idempotent and safe to call multiple times.
   *
   * @returns CompactionResult with before/after statistics and space saved
   */
  async compact(): Promise<CompactionResult> {
    if (this.compactionInProgress) {
      throw new Error('Compaction already in progress');
    }

    this.compactionInProgress = true;
    const startTime = Date.now();

    try {
      const before = this.analyzeVault();

      auditService.log('vault_compaction_started', 'vault_compaction', {
        before,
      });

      if (Platform.OS === 'web') {
        try {
          const entries = this.getVaultEntries();
          let entriesRemoved = 0;

          // Remove deleted entries
          for (const entry of entries) {
            if (entry.key.includes('deleted:')) {
              localStorage.removeItem(entry.key);
              entriesRemoved++;
            }
          }

          // Defragment by rewriting entries (simulated)
          // In a real implementation, this might involve reorganizing data
          const remaining = this.getVaultEntries();
          const remainingSize = remaining.reduce((sum, e) => sum + e.size, 0);

          const duration = Date.now() - startTime;
          const after = this.analyzeVault();
          const spaceSaved = Math.max(0, before.totalSize - remainingSize);

          const result: CompactionResult = {
            success: true,
            before,
            after,
            spaceSaved,
            entriesRemoved,
            compactedAt: Date.now(),
            duration,
          };

          // Save to history
          const history = this.loadHistory();
          history.push({
            result,
            reason: 'manual_compaction',
            recordedAt: Date.now(),
          });
          this.saveHistory(history);

          auditService.log('vault_compaction_completed', 'vault_compaction', {
            spaceSaved,
            entriesRemoved,
            duration,
          });

          return result;
        } catch (error) {
          throw new Error(`Compaction failed: ${String(error)}`);
        }
      } else {
        // Non-web platform: return empty result
        return {
          success: false,
          before,
          after: before,
          spaceSaved: 0,
          entriesRemoved: 0,
          compactedAt: Date.now(),
          duration: Date.now() - startTime,
        };
      }
    } finally {
      this.compactionInProgress = false;
    }
  }

  /**
   * Get the compaction history for this vault.
   * Returns records in chronological order (oldest first).
   *
   * @returns Array of CompactionRecord objects
   */
  getCompactionHistory(): CompactionRecord[] {
    return this.loadHistory();
  }

  /**
   * Get a breakdown of storage usage by category.
   * Categories are inferred from key prefixes and patterns.
   *
   * @returns Array of StorageBreakdown objects
   */
  getStorageBreakdown(): StorageBreakdown[] {
    const breakdown = new Map<string, number>();
    const entries = this.getVaultEntries();
    let totalSize = 0;

    for (const entry of entries) {
      totalSize += entry.size;

      // Categorize by key pattern
      let category = 'other';
      if (entry.key.includes('password')) category = 'passwords';
      else if (entry.key.includes('file') || entry.key.includes('document'))
        category = 'files';
      else if (entry.key.includes('message')) category = 'messages';
      else if (entry.key.includes('audit')) category = 'audit_logs';
      else if (entry.key.includes('recovery')) category = 'recovery_data';
      else if (entry.key.includes('backup')) category = 'backups';

      const current = breakdown.get(category) || 0;
      breakdown.set(category, current + entry.size);
    }

    return Array.from(breakdown.entries())
      .map(([category, size]) => ({
        category,
        size,
        percentage: totalSize > 0 ? Math.round((size / totalSize) * 100) : 0,
      }))
      .sort((a, b) => b.size - a.size);
  }

  /**
   * Estimate the time required to compact the vault.
   * This is a heuristic based on the number of entries and total size.
   *
   * @param stats - CompactionStats to base the estimate on
   * @returns Estimated time in milliseconds
   */
  estimateCompactionTime(stats: CompactionStats): number {
    // Heuristic: 0.1ms per entry + 0.001ms per byte
    const baseTime = 50; // minimum time
    const entryTime = stats.deletedEntries * 0.1;
    const sizeTime = stats.totalSize * 0.001;

    return Math.max(baseTime, entryTime + sizeTime);
  }

  /**
   * Determine if compaction is needed based on fragmentation level.
   * Returns true if reclaimable space is greater than the threshold.
   *
   * @returns True if compaction is recommended
   */
  isCompactionNeeded(): boolean {
    const stats = this.analyzeVault();
    return stats.fragmentationPercent > FRAGMENTATION_THRESHOLD;
  }

  /**
   * Get the result of the most recent compaction operation.
   *
   * @returns CompactionResult of the last compaction, or null if none performed
   */
  getLastCompactionResult(): CompactionResult | null {
    const history = this.loadHistory();
    if (history.length === 0) {
      return null;
    }
    return history[history.length - 1].result;
  }

  /**
   * Get a summary of the compaction analysis without performing compaction.
   * Useful for displaying UI previews of what would be reclaimed.
   *
   * @returns Analysis summary with statistics
   */
  getCompactionPreview(): {
    stats: CompactionStats;
    isNeeded: boolean;
    estimatedTime: number;
    breakdown: StorageBreakdown[];
  } {
    const stats = this.analyzeVault();
    return {
      stats,
      isNeeded: this.isCompactionNeeded(),
      estimatedTime: this.estimateCompactionTime(stats),
      breakdown: this.getStorageBreakdown(),
    };
  }

  /**
   * Automatically trigger compaction if needed based on fragmentation threshold.
   * Logs the decision and performs compaction if warranted.
   *
   * @returns CompactionResult if compaction was performed, null if not needed
   */
  async compactIfNeeded(): Promise<CompactionResult | null> {
    if (!this.isCompactionNeeded()) {
      return null;
    }

    auditService.log('vault_auto_compaction_triggered', 'vault_compaction', {
      fragmentationPercent: this.analyzeVault().fragmentationPercent,
    });

    return this.compact();
  }
}

/** Singleton instance of the Vault Compaction Service */
export const vaultCompactionService = new VaultCompactionService();
