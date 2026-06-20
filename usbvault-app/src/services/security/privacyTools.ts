// PH4-FIX: Consolidated into security domain
/**
 * FOR-02: Digital Footprint Elimination Service
 *
 * Scans and cleans various categories of digital traces left by the app:
 * clipboard history, app cache, OS recent files, filesystem journals,
 * swap/pagefile, browser traces, and temp files. Integrates with forensicsService
 * for actual cleanup operations.
 *
 * @module services/footprintService
 */

import { Platform } from 'react-native';
import { forensicsService, CleanupCategory } from './forensics';
import { auditService } from './auditService';
import { logger } from '@/utils/logger';

// ── Types ──────────────────────────────────────────────────────

export type FootprintCategory =
  | 'clipboard_history'
  | 'app_cache'
  | 'os_recent_files'
  | 'filesystem_journals'
  | 'swap_pagefile'
  | 'browser_traces'
  | 'temp_files';

export interface FootprintItem {
  id: string;
  name: string;
  description: string;
  status: 'clean' | 'dirty' | 'unknown';
  itemCount: number;
  lastCleaned?: string; // ISO 8601
}

export interface ScanResult {
  timestamp: string; // ISO 8601
  categories: FootprintItem[];
  totalDirty: number;
  totalUnknown: number;
}

export interface CleanupOperation {
  timestamp: string; // ISO 8601
  categories: FootprintCategory[];
  success: boolean;
  itemsCleaned: number;
}

// ── Constants ──────────────────────────────────────────────────

const SCAN_RESULT_KEY = 'usbvault:footprint_scan';
const CLEANUP_HISTORY_KEY = 'usbvault:cleanup_history';
const isWeb = Platform.OS === 'web';

// ── Helper Functions ───────────────────────────────────────────

/**
 * Read scan result from storage.
 */
function readScanResult(): ScanResult | null {
  if (!isWeb) return null;

  try {
    const stored = localStorage.getItem(SCAN_RESULT_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Write scan result to storage.
 */
function writeScanResult(result: ScanResult): void {
  if (!isWeb) return;

  try {
    localStorage.setItem(SCAN_RESULT_KEY, JSON.stringify(result));
  } catch {
    // Silent fail
  }
}

/**
 * Read cleanup history from storage.
 */
function readCleanupHistory(): CleanupOperation[] {
  if (!isWeb) return [];

  try {
    const stored = localStorage.getItem(CLEANUP_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

/**
 * Write cleanup history to storage (keep last 10 operations).
 */
function writeCleanupHistory(history: CleanupOperation[]): void {
  if (!isWeb) return;

  try {
    const trimmed = history.slice(-10);
    localStorage.setItem(CLEANUP_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Silent fail
  }
}

/**
 * Map cleanup category to footprint category.
 */
function mapToFootprintCategory(cat: CleanupCategory): FootprintCategory {
  const mapping: Record<CleanupCategory, FootprintCategory> = {
    clipboard: 'clipboard_history',
    app_cache: 'app_cache',
    recent_files: 'os_recent_files',
    session_data: 'browser_traces',
    temp_files: 'temp_files',
    swap_pagefile: 'swap_pagefile',
    os_journals: 'filesystem_journals',
  };
  return mapping[cat];
}

// ── Service ────────────────────────────────────────────────────

class FootprintServiceImpl {
  /**
   * Scan for digital footprints across all categories.
   * Returns status of each category (clean, dirty, or unknown).
   *
   * @returns Array of footprint categories with current status
   *
   * @example
   *   const result = await footprintService.scanFootprint();
   *   result.forEach(cat => console.log(`${cat.name}: ${cat.status}`));
   */
  async scanFootprint(): Promise<FootprintItem[]> {
    try {
      const statuses = forensicsService.getCategoryStatuses();
      const categories: FootprintItem[] = statuses.map(status => {
        const footprintCat = mapToFootprintCategory(status.category);

        const mappedStatus: 'clean' | 'dirty' | 'unknown' =
          status.status === 'not_applicable'
            ? 'clean'
            : (status.status as 'clean' | 'dirty' | 'unknown');
        return {
          id: footprintCat,
          name: status.label,
          description: status.description,
          status: mappedStatus,
          itemCount: this.estimateItemCount(status.category),
          lastCleaned: status.lastCleaned || undefined,
        };
      });

      const result: ScanResult = {
        timestamp: new Date().toISOString(),
        categories,
        totalDirty: categories.filter(c => c.status === 'dirty').length,
        totalUnknown: categories.filter(c => c.status === 'unknown').length,
      };

      writeScanResult(result);

      auditService
        .log('system', 'footprint_scan_complete', { categories: categories.length }, 'success')
        .catch(() => {});

      return categories;
    } catch (err) {
      logger.error('[Footprint] Scan error:', err);
      auditService
        .log('system', 'footprint_scan_error', { error: String(err) }, 'error')
        .catch(() => {});
      return [];
    }
  }

  /**
   * Clean a specific footprint category.
   *
   * @param categoryId - Category to clean
   * @returns True if successful
   */
  async cleanCategory(categoryId: FootprintCategory): Promise<boolean> {
    try {
      // Map back to cleanup category
      const cleanupCatMap: Record<FootprintCategory, CleanupCategory> = {
        clipboard_history: 'clipboard',
        app_cache: 'app_cache',
        os_recent_files: 'recent_files',
        filesystem_journals: 'os_journals',
        swap_pagefile: 'swap_pagefile',
        browser_traces: 'session_data',
        temp_files: 'temp_files',
      };

      const cleanupCat = cleanupCatMap[categoryId];
      const success = await forensicsService.cleanCategory(cleanupCat);

      if (success) {
        // Record in cleanup history
        const history = readCleanupHistory();
        const op: CleanupOperation = {
          timestamp: new Date().toISOString(),
          categories: [categoryId],
          success: true,
          itemsCleaned: 1,
        };
        history.push(op);
        writeCleanupHistory(history);

        auditService
          .log('system', 'footprint_category_cleaned', { category: categoryId }, 'success')
          .catch(() => {});
      }

      return success;
    } catch (err) {
      logger.error(`[Footprint] Failed to clean ${categoryId}:`, err);
      auditService
        .log(
          'system',
          'footprint_cleanup_error',
          { category: categoryId, error: String(err) },
          'error'
        )
        .catch(() => {});
      return false;
    }
  }

  /**
   * One-tap cleanup of all footprint categories.
   *
   * @returns Number of categories successfully cleaned
   */
  async cleanAll(): Promise<number> {
    try {
      const scan = await this.scanFootprint();
      let cleaned = 0;

      for (const item of scan) {
        const result = await this.cleanCategory(item.id as FootprintCategory);
        if (result) cleaned++;
      }

      // Record combined operation
      const history = readCleanupHistory();
      const categories: FootprintCategory[] = scan.map(c => c.id as FootprintCategory);
      const op: CleanupOperation = {
        timestamp: new Date().toISOString(),
        categories,
        success: cleaned === scan.length,
        itemsCleaned: cleaned,
      };
      history.push(op);
      writeCleanupHistory(history);

      auditService
        .log(
          'system',
          'footprint_full_cleanup',
          { categoriesCleaned: cleaned, total: scan.length },
          'success'
        )
        .catch(() => {});

      return cleaned;
    } catch (err) {
      logger.error('[Footprint] Full cleanup error:', err);
      auditService
        .log('system', 'footprint_cleanup_error', { error: String(err) }, 'error')
        .catch(() => {});
      return 0;
    }
  }

  /**
   * Get the last scan result (may be cached).
   *
   * @returns Last scan result or null if no scan performed yet
   */
  getLastScanResult(): ScanResult | null {
    return readScanResult();
  }

  /**
   * Get cleanup operation history.
   *
   * @returns Array of last cleanup operations (up to 10)
   */
  getCleanupHistory(): CleanupOperation[] {
    return readCleanupHistory();
  }

  /**
   * Estimate item count for a category (for UI display).
   * @private
   */
  private estimateItemCount(category: CleanupCategory): number {
    // These are estimates; in a real app, query actual counts
    const estimates: Record<CleanupCategory, number> = {
      clipboard: 2,
      app_cache: 15,
      recent_files: 5,
      session_data: 8,
      temp_files: 24,
      swap_pagefile: 0,
      os_journals: 12,
    };

    return estimates[category] || 0;
  }
}

// ── Singleton ──────────────────────────────────────────────────

export const footprintService = new FootprintServiceImpl();
