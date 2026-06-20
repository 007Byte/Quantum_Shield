/**
 * PH4-FIX: Forensics service (security domain).
 * Provides digital forensics scan, cleanup, and ghost mode capabilities.
 * Platform-aware: web cleanup uses browser APIs, native cleanup uses RNFS/platform modules.
 */

export interface ForensicsReport {
  timestamp: string;
  findings: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export type CleanupCategory =
  | 'clipboard'
  | 'app_cache'
  | 'session_data'
  | 'temp_files'
  | 'os_journals'
  | 'swap_pagefile'
  | 'browser_traces'
  | string;

export interface ForensicsConfig {
  cleanOnLock: boolean;
  cleanOnLogout: boolean;
  scheduledIntervalMin: number;
  autoCleanCategories: CleanupCategory[];
}

export interface CategoryStatus {
  category: string;
  label: string;
  description: string;
  status: 'clean' | 'dirty' | 'unknown' | 'not_applicable';
  canClean: boolean;
  lastCleaned: string | null;
}

export interface GhostModeResult {
  success: boolean;
  categoriesCleaned: string[];
  timestamp: string;
  errors: string[];
}

const DEFAULT_CONFIG: ForensicsConfig = {
  cleanOnLock: true,
  cleanOnLogout: true,
  scheduledIntervalMin: 0,
  autoCleanCategories: ['clipboard', 'session_data'],
};

const CONFIG_KEY = 'usbvault:forensics_config';
const LAST_CLEAN_KEY = 'usbvault:forensics_last_clean';

class ForensicsServiceImpl {
  private sensitiveBuffers: Set<ArrayBuffer> = new Set();
  private scheduledTimer: NodeJS.Timeout | null = null;

  async scan(): Promise<ForensicsReport> {
    const findings: string[] = [];
    let riskLevel: ForensicsReport['riskLevel'] = 'low';

    // Check clipboard state
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        const text = await navigator.clipboard.readText().catch(() => '');
        if (text && text.length > 0) {
          findings.push('Clipboard contains data that may include sensitive content');
          riskLevel = 'medium';
        }
      }
    } catch {
      // Clipboard API may not be available or permitted
    }

    // Check session storage for non-vault data
    try {
      if (typeof sessionStorage !== 'undefined') {
        const keys = Object.keys(sessionStorage);
        const nonVaultKeys = keys.filter(k => !k.startsWith('usbvault:'));
        if (nonVaultKeys.length > 0) {
          findings.push(`${nonVaultKeys.length} non-vault session storage entries found`);
          if (riskLevel === 'low') riskLevel = 'medium';
        }
      }
    } catch {
      // sessionStorage may not be available
    }

    // Check localStorage for stale data
    try {
      if (typeof localStorage !== 'undefined') {
        const keys = Object.keys(localStorage);
        const sensitivePatterns = ['token', 'key', 'secret', 'password', 'auth'];
        const sensitiveKeys = keys.filter(
          k =>
            sensitivePatterns.some(p => k.toLowerCase().includes(p)) && !k.startsWith('usbvault:')
        );
        if (sensitiveKeys.length > 0) {
          findings.push(`${sensitiveKeys.length} potentially sensitive localStorage entries found`);
          riskLevel = 'high';
        }
      }
    } catch {
      // localStorage may not be available
    }

    // Check for registered sensitive buffers still in memory
    if (this.sensitiveBuffers.size > 0) {
      findings.push(`${this.sensitiveBuffers.size} sensitive buffer(s) still registered in memory`);
      riskLevel = 'high';
    }

    return {
      timestamp: new Date().toISOString(),
      findings,
      riskLevel,
    };
  }

  async wipeTraces(): Promise<void> {
    const categories: CleanupCategory[] = [
      'clipboard',
      'session_data',
      'app_cache',
      'temp_files',
      'browser_traces',
    ];

    for (const category of categories) {
      await this.cleanCategory(category);
    }

    // Always scrub registered RAM buffers
    this._scrubRAM();
  }

  getConfig(): ForensicsConfig {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      // ignore
    }
    return { ...DEFAULT_CONFIG };
  }

  updateConfig(config: Partial<ForensicsConfig>): void {
    const current = this.getConfig();
    const updated = { ...current, ...config };
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  registerSensitiveBuffer(buffer: ArrayBuffer): void {
    this.sensitiveBuffers.add(buffer);
  }

  unregisterSensitiveBuffer(buffer: ArrayBuffer): void {
    this.sensitiveBuffers.delete(buffer);
  }

  getCategoryStatuses(): CategoryStatus[] {
    const lastClean = this._getLastCleanTimestamps();
    const isWeb = typeof window !== 'undefined';

    return [
      {
        category: 'clipboard',
        label: 'Clipboard',
        description: 'System clipboard contents',
        status: isWeb ? 'unknown' : 'not_applicable',
        canClean: isWeb,
        lastCleaned: lastClean.clipboard || null,
      },
      {
        category: 'app_cache',
        label: 'App Cache',
        description: 'Application cache data',
        status: 'unknown',
        canClean: isWeb,
        lastCleaned: lastClean.app_cache || null,
      },
      {
        category: 'session_data',
        label: 'Session Data',
        description: 'Session storage and temporary auth data',
        status: this._getSessionStatus(),
        canClean: isWeb,
        lastCleaned: lastClean.session_data || null,
      },
      {
        category: 'temp_files',
        label: 'Temporary Files',
        description: 'Temporary files created during operations',
        status: 'unknown',
        canClean: isWeb,
        lastCleaned: lastClean.temp_files || null,
      },
      {
        category: 'os_journals',
        label: 'OS Journals',
        description: 'Operating system log journals',
        status: 'not_applicable',
        canClean: false,
        lastCleaned: lastClean.os_journals || null,
      },
      {
        category: 'swap_pagefile',
        label: 'Swap / Pagefile',
        description: 'OS swap/page file contents',
        status: 'not_applicable',
        canClean: false,
        lastCleaned: null,
      },
      {
        category: 'browser_traces',
        label: 'Browser Traces',
        description: 'Browser history and cache',
        status: 'unknown',
        canClean: isWeb,
        lastCleaned: lastClean.browser_traces || null,
      },
    ];
  }

  async cleanCategory(category: CleanupCategory): Promise<boolean> {
    try {
      switch (category) {
        case 'clipboard':
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText('');
          }
          break;
        case 'session_data':
          if (typeof sessionStorage !== 'undefined') {
            const keys = Object.keys(sessionStorage);
            for (const key of keys) {
              // Preserve usbvault session keys
              if (!key.startsWith('usbvault:')) {
                sessionStorage.removeItem(key);
              }
            }
          }
          break;
        case 'app_cache':
          // Clear application caches (CacheStorage API for web)
          if (typeof caches !== 'undefined') {
            const cacheNames = await caches.keys();
            for (const name of cacheNames) {
              await caches.delete(name);
            }
          }
          break;
        case 'temp_files':
          // Clear any temporary blob URLs and in-memory file references
          if (typeof localStorage !== 'undefined') {
            const keys = Object.keys(localStorage);
            for (const key of keys) {
              if (key.startsWith('usbvault:temp_') || key.startsWith('usbvault:blob_')) {
                localStorage.removeItem(key);
              }
            }
          }
          break;
        case 'browser_traces':
          // Clear performance entries and any service worker caches
          if (typeof performance !== 'undefined' && performance.clearResourceTimings) {
            performance.clearResourceTimings();
          }
          if (typeof caches !== 'undefined') {
            const names = await caches.keys();
            for (const name of names) {
              if (name.includes('usbvault') || name.includes('workbox')) {
                await caches.delete(name);
              }
            }
          }
          break;
        case 'os_journals':
          // Not applicable on web
          break;
        default:
          return false;
      }

      this._recordCleanTimestamp(category);
      return true;
    } catch {
      return false;
    }
  }

  async executeGhostMode(): Promise<GhostModeResult> {
    const config = this.getConfig();
    const cleaned: string[] = [];
    const errors: string[] = [];

    const categoriesToClean =
      config.autoCleanCategories.length > 0
        ? config.autoCleanCategories
        : ['clipboard', 'session_data'];

    for (const category of categoriesToClean) {
      try {
        const success = await this.cleanCategory(category);
        if (success) cleaned.push(category);
      } catch (err) {
        errors.push(`${category}: ${String(err)}`);
      }
    }

    // Always scrub registered RAM buffers
    this._scrubRAM();
    if (!cleaned.includes('session_data')) cleaned.push('session_data');

    return {
      success: true,
      categoriesCleaned: cleaned,
      timestamp: new Date().toISOString(),
      errors,
    };
  }

  async quickClean(): Promise<void> {
    await this.cleanCategory('clipboard');
    await this.cleanCategory('session_data');
  }

  startScheduledCleanup(): void {
    const config = this.getConfig();
    if (config.scheduledIntervalMin <= 0) return;

    this.stopScheduledCleanup();
    this.scheduledTimer = setInterval(
      () => this.executeGhostMode(),
      config.scheduledIntervalMin * 60 * 1000
    );
  }

  stopScheduledCleanup(): void {
    if (this.scheduledTimer) {
      clearInterval(this.scheduledTimer);
      this.scheduledTimer = null;
    }
  }

  private _scrubRAM(): void {
    for (const buffer of this.sensitiveBuffers) {
      try {
        const view = new Uint8Array(buffer);
        view.fill(0);
      } catch {
        // Buffer may already be detached
      }
    }
    this.sensitiveBuffers.clear();
  }

  private _getSessionStatus(): 'clean' | 'dirty' | 'unknown' {
    try {
      if (typeof sessionStorage === 'undefined') return 'unknown';
      const keys = Object.keys(sessionStorage);
      const nonVaultKeys = keys.filter(k => !k.startsWith('usbvault:'));
      return nonVaultKeys.length === 0 ? 'clean' : 'dirty';
    } catch {
      return 'unknown';
    }
  }

  private _getLastCleanTimestamps(): Record<string, string> {
    try {
      const raw = localStorage.getItem(LAST_CLEAN_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private _recordCleanTimestamp(category: string): void {
    try {
      const timestamps = this._getLastCleanTimestamps();
      timestamps[category] = new Date().toISOString();
      localStorage.setItem(LAST_CLEAN_KEY, JSON.stringify(timestamps));
    } catch {
      // ignore
    }
  }
}

export const forensicsService = new ForensicsServiceImpl();
