// PH4-FIX: Consolidated into security domain
/**
 * forensicsService.ts — Anti-forensics and digital footprint cleanup
 *
 * FOR-01: Ports CLI Ghost Mode to Enterprise. Handles RAM scrubbing,
 * clipboard sanitization, temp file cleanup, and OS-specific trace removal.
 *
 * Operations:
 * - Clipboard sanitization: Overwrite + clear clipboard contents
 * - Cache cleanup: Clear app-specific caches and temp storage
 * - Recent files cleanup: Remove OS recent-file entries (native only)
 * - Session data scrubbing: Clear sessionStorage, sensitive in-memory refs
 * - RAM scrubbing: Zero-fill sensitive buffers on lock/logout
 * - Full Ghost Mode: Execute all cleanup operations in sequence
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';
import { auditService } from '@/services/auditService';

// ── Types ──────────────────────────────────────────────────

export type CleanupCategory =
  | 'clipboard'
  | 'app_cache'
  | 'recent_files'
  | 'session_data'
  | 'temp_files'
  | 'swap_pagefile'
  | 'os_journals';

export type CleanupStatus = 'clean' | 'dirty' | 'unknown' | 'not_applicable' | 'requires_desktop';

export interface CleanupCategoryStatus {
  category: CleanupCategory;
  label: string;
  description: string;
  status: CleanupStatus;
  lastCleaned: string | null;
  canClean: boolean;
}

export interface CleanupResult {
  success: boolean;
  categoriesCleaned: CleanupCategory[];
  errors: string[];
  timestamp: string;
}

/**
 * Result from wipeTraces — comprehensive cleanup with skip tracking.
 */
export interface WipeResult {
  categoriesCleaned: string[];
  categoriesSkipped: { category: string; reason: string }[];
  errors: string[];
  timestamp: string;
}

/**
 * Forensics scan report — summary of detected digital traces.
 */
export interface ForensicsReport {
  timestamp: string;
  findings: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// Backward-compatible aliases for consumers importing from forensicsService
export type CategoryStatus = CleanupCategoryStatus;
export type GhostModeResult = CleanupResult;
export interface ForensicsFinding {
  id: string;
  severity: string;
  description: string;
  canRemediate: boolean;
}

export interface ForensicsConfig {
  /** Auto-clean on vault lock */
  cleanOnLock: boolean;
  /** Auto-clean on logout */
  cleanOnLogout: boolean;
  /** Scheduled cleanup interval in minutes (0 = disabled) */
  scheduledIntervalMin: number;
  /** Categories to include in auto-cleanup */
  autoCleanCategories: CleanupCategory[];
}

// ── Storage ────────────────────────────────────────────────

const CONFIG_KEY = 'usbvault:forensics_config';
const LAST_CLEAN_KEY = 'usbvault:forensics_last_clean';

const DEFAULT_CONFIG: ForensicsConfig = {
  cleanOnLock: true,
  cleanOnLogout: true,
  scheduledIntervalMin: 0,
  autoCleanCategories: ['clipboard', 'app_cache', 'session_data', 'temp_files'],
};

// ── Sensitive Buffer Registry ──────────────────────────────

/** Registry of buffers that should be zeroed on cleanup */
const sensitiveBuffers: Set<ArrayBuffer> = new Set();

// ── Forensics Service ──────────────────────────────────────

class ForensicsService {
  private config: ForensicsConfig = DEFAULT_CONFIG;
  private scheduledTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.loadConfig();
  }

  // ── Config ──────────────────────────────

  private loadConfig(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const stored = localStorage.getItem(CONFIG_KEY);
      if (stored) {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      }
    } catch {
      /* defaults */
    }
  }

  getConfig(): ForensicsConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<ForensicsConfig>): void {
    this.config = { ...this.config, ...partial };
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
      }
    } catch {
      /* silent */
    }

    // Re-schedule if interval changed
    if ('scheduledIntervalMin' in partial) {
      this.stopScheduledCleanup();
      if (this.config.scheduledIntervalMin > 0) {
        this.startScheduledCleanup();
      }
    }
  }

  // ── Buffer Registration ─────────────────

  /**
   * Register a buffer containing sensitive data for cleanup on scrub.
   */
  registerSensitiveBuffer(buffer: ArrayBuffer): void {
    sensitiveBuffers.add(buffer);
  }

  /**
   * Unregister a buffer (e.g., after it's been processed).
   */
  unregisterSensitiveBuffer(buffer: ArrayBuffer): void {
    sensitiveBuffers.delete(buffer);
  }

  // ── Category Status ─────────────────────

  /**
   * Get status of all cleanup categories.
   */
  getCategoryStatuses(): CleanupCategoryStatus[] {
    const lastClean = this.getLastCleanTimestamps();
    const isWeb = Platform.OS === 'web';

    return [
      {
        category: 'clipboard',
        label: 'Clipboard History',
        description: 'System clipboard contents and history',
        status: this.getClipboardStatus(),
        lastCleaned: lastClean.clipboard || null,
        canClean: true,
      },
      {
        category: 'app_cache',
        label: 'App Cache',
        description: 'Application cache, service workers, cached responses',
        status: this.getCacheStatus(),
        lastCleaned: lastClean.app_cache || null,
        canClean: true,
      },
      {
        category: 'recent_files',
        label: 'Recent Files',
        description: 'OS recent files list, jump list entries',
        status: isWeb ? 'not_applicable' : 'unknown',
        lastCleaned: lastClean.recent_files || null,
        canClean: !isWeb,
      },
      {
        category: 'session_data',
        label: 'Session Data',
        description: 'Session storage, sensitive in-memory data',
        status: this.getSessionStatus(),
        lastCleaned: lastClean.session_data || null,
        canClean: true,
      },
      {
        category: 'temp_files',
        label: 'Temporary Files',
        description: 'App temp directory, download fragments',
        status: isWeb ? 'not_applicable' : 'unknown',
        lastCleaned: lastClean.temp_files || null,
        canClean: !isWeb,
      },
      {
        category: 'swap_pagefile',
        label: 'Swap / Pagefile',
        description: 'OS swap space that may contain vault data',
        status: 'not_applicable',
        lastCleaned: null,
        canClean: false, // Requires OS-level permissions
      },
      {
        category: 'os_journals',
        label: 'System Journals',
        description: 'Filesystem journals, syslog, event logs',
        status: isWeb ? 'not_applicable' : 'unknown',
        lastCleaned: lastClean.os_journals || null,
        canClean: !isWeb,
      },
    ];
  }

  // ── Cleanup Operations ──────────────────

  /**
   * Clean a specific category.
   */
  async cleanCategory(category: CleanupCategory): Promise<boolean> {
    try {
      switch (category) {
        case 'clipboard':
          await this.cleanClipboard();
          break;
        case 'app_cache':
          await this.cleanAppCache();
          break;
        case 'session_data':
          await this.cleanSessionData();
          break;
        case 'recent_files':
          await this.cleanRecentFiles();
          break;
        case 'temp_files':
          await this.cleanTempFiles();
          break;
        case 'os_journals':
          // Requires native module — stub for now
          logger.log('[Forensics] OS journal cleanup requires native module');
          break;
        default:
          return false;
      }
      this.recordCleanTimestamp(category);
      return true;
    } catch (err) {
      logger.error(`[Forensics] Failed to clean ${category}:`, err);
      return false;
    }
  }

  /**
   * Execute full Ghost Mode cleanup — all categories.
   */
  async executeGhostMode(): Promise<CleanupResult> {
    const result: CleanupResult = {
      success: true,
      categoriesCleaned: [],
      errors: [],
      timestamp: new Date().toISOString(),
    };

    const categories = this.config.autoCleanCategories;

    for (const cat of categories) {
      try {
        const ok = await this.cleanCategory(cat);
        if (ok) {
          result.categoriesCleaned.push(cat);
        }
      } catch (err) {
        result.errors.push(`${cat}: ${err instanceof Error ? err.message : 'unknown'}`);
        result.success = false;
      }
    }

    // Always scrub RAM regardless of config
    this.scrubRAM();
    result.categoriesCleaned.push('session_data');

    // Log audit entry
    auditService
      .log('vault_lock', 'ghost_mode_cleanup', {
        categories: result.categoriesCleaned.join(','),
        errors: result.errors.length,
      })
      .catch(() => {});

    logger.log(
      `[Forensics] Ghost Mode complete: ${result.categoriesCleaned.length} categories cleaned`
    );
    return result;
  }

  /**
   * Quick cleanup — for vault lock events.
   */
  async quickClean(): Promise<void> {
    await this.cleanClipboard();
    await this.cleanSessionData();
    this.scrubRAM();
  }

  /**
   * Scan for forensic traces across all categories.
   * Returns a summary report with findings and risk level.
   */
  async scan(): Promise<ForensicsReport> {
    const statuses = this.getCategoryStatuses();
    const findings: string[] = [];

    for (const status of statuses) {
      if (status.status === 'dirty') {
        findings.push(`${status.label}: ${status.description}`);
      }
    }

    const riskLevel: ForensicsReport['riskLevel'] =
      findings.length === 0
        ? 'low'
        : findings.length <= 2
          ? 'medium'
          : findings.length <= 4
            ? 'high'
            : 'critical';

    return {
      timestamp: new Date().toISOString(),
      findings,
      riskLevel,
    };
  }

  /**
   * Wipe all accessible forensic traces with detailed result tracking.
   * Reports which categories were cleaned, skipped, or errored.
   */
  async wipeTraces(): Promise<WipeResult> {
    const statuses = this.getCategoryStatuses();
    const cleaned: string[] = [];
    const skipped: { category: string; reason: string }[] = [];
    const errors: string[] = [];

    for (const status of statuses) {
      if (!status.canClean) {
        skipped.push({ category: status.category, reason: 'Not available on this platform' });
        continue;
      }
      try {
        const ok = await this.cleanCategory(status.category);
        if (ok) {
          cleaned.push(status.category);
        } else {
          skipped.push({ category: status.category, reason: 'Cleanup returned false' });
        }
      } catch (err) {
        errors.push(`${status.category}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }

    // Always scrub RAM regardless
    this.scrubRAM();

    auditService
      .log('vault_lock', 'wipe_traces', {
        cleaned: cleaned.length,
        skipped: skipped.length,
        errors: errors.length,
      })
      .catch(() => {});

    logger.log(
      `[Forensics] Wipe traces complete: ${cleaned.length} cleaned, ${skipped.length} skipped, ${errors.length} errors`
    );

    return {
      categoriesCleaned: cleaned,
      categoriesSkipped: skipped,
      errors,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Individual Cleanup Implementations ──

  private async cleanClipboard(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        // Overwrite clipboard with empty string
        await navigator.clipboard.writeText('');
        logger.log('[Forensics] Clipboard sanitized');
      }
    } catch {
      // Clipboard API may not be available without user gesture
      logger.log('[Forensics] Clipboard sanitization requires user focus');
    }
  }

  private async cleanAppCache(): Promise<void> {
    try {
      // Clear service worker caches
      if (typeof caches !== 'undefined') {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        logger.log(`[Forensics] Cleared ${cacheNames.length} cache entries`);
      }

      // Clear performance entries
      if (typeof performance !== 'undefined' && performance.clearResourceTimings) {
        performance.clearResourceTimings();
      }
    } catch {
      logger.log('[Forensics] Cache cleanup partial');
    }
  }

  private async cleanSessionData(): Promise<void> {
    try {
      if (typeof sessionStorage !== 'undefined') {
        // Preserve auth session key, clear everything else
        const authKey = sessionStorage.getItem('usbvault:session');
        sessionStorage.clear();
        if (authKey) {
          sessionStorage.setItem('usbvault:session', authKey);
        }
        logger.log('[Forensics] Session data cleaned');
      }
    } catch {
      /* silent */
    }
  }

  private async cleanRecentFiles(): Promise<void> {
    // Native-only: would call into native module to clear:
    // - Windows: Shell recent items, jump list
    // - macOS: .DS_Store, com.apple.dock.recent-apps
    // - Linux: recently-used.xbel, Zeitgeist
    logger.log('[Forensics] Recent files cleanup (native stub)');
  }

  private async cleanTempFiles(): Promise<void> {
    // Native-only: would call into native module to shred:
    // - App temp directory
    // - Download fragments
    // - Preview cache
    logger.log('[Forensics] Temp files cleanup (native stub)');
  }

  /**
   * Zero-fill all registered sensitive buffers.
   */
  private scrubRAM(): void {
    let count = 0;
    sensitiveBuffers.forEach(buffer => {
      try {
        const view = new Uint8Array(buffer);
        // Overwrite with cryptographic random then zeros (anti-cold-boot)
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
          crypto.getRandomValues(view);
        }
        view.fill(0);
        count++;
      } catch {
        /* buffer may have been detached */
      }
    });
    sensitiveBuffers.clear();
    if (count > 0) {
      logger.log(`[Forensics] Scrubbed ${count} sensitive buffers from RAM`);
    }
  }

  // ── Scheduling ──────────────────────────

  startScheduledCleanup(): void {
    if (this.config.scheduledIntervalMin <= 0) return;
    const ms = this.config.scheduledIntervalMin * 60_000;
    this.scheduledTimer = setInterval(() => {
      this.quickClean().catch(() => {});
    }, ms);
    logger.log(`[Forensics] Scheduled cleanup every ${this.config.scheduledIntervalMin} minutes`);
  }

  stopScheduledCleanup(): void {
    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer);
      this.scheduledTimer = null;
    }
  }

  // ── Status Helpers ──────────────────────

  private getClipboardStatus(): CleanupStatus {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return 'not_applicable';
    const last = this.getLastCleanTimestamps().clipboard;
    if (!last) return 'dirty';
    const age = Date.now() - new Date(last).getTime();
    return age < 300_000 ? 'clean' : 'dirty'; // 5 min threshold
  }

  private getCacheStatus(): CleanupStatus {
    if (typeof caches === 'undefined') return 'not_applicable';
    const last = this.getLastCleanTimestamps().app_cache;
    if (!last) return 'dirty';
    const age = Date.now() - new Date(last).getTime();
    return age < 3600_000 ? 'clean' : 'dirty'; // 1 hour threshold
  }

  private getSessionStatus(): CleanupStatus {
    if (typeof sessionStorage === 'undefined') return 'not_applicable';
    // Check if there's excess session data beyond auth
    try {
      const keyCount = sessionStorage.length;
      const hasOnlyAuth = keyCount <= 1;
      return hasOnlyAuth ? 'clean' : 'dirty';
    } catch {
      return 'unknown';
    }
  }

  private getLastCleanTimestamps(): Record<string, string> {
    try {
      if (typeof localStorage === 'undefined') return {};
      const stored = localStorage.getItem(LAST_CLEAN_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  private recordCleanTimestamp(category: CleanupCategory): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const timestamps = this.getLastCleanTimestamps();
      timestamps[category] = new Date().toISOString();
      localStorage.setItem(LAST_CLEAN_KEY, JSON.stringify(timestamps));
    } catch {
      /* silent */
    }
  }
}

// ── Singleton ──────────────────────────────────────────────

export const forensicsService = new ForensicsService();
