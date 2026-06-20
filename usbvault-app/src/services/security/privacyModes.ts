// PH4-FIX: Consolidated into security domain
/**
 * FOR-03 / RM-01: Ghost Mode Settings Service
 *
 * Manages comprehensive Ghost Mode configuration and operations.
 * Ghost Mode performs aggressive RAM scrubbing, clipboard cleaning,
 * metadata sanitization, and journal cleanup on demand or on lock/logout.
 * Integrates with forensicsService for actual cleanup operations.
 *
 * @module services/ghostModeService
 */

import { forensicsService } from './forensics';
import { auditService } from './auditService';
import { readLocal, writeLocal } from '@/utils/storageHelpers';
import { logger } from '@/utils/logger';

// ── Types ──────────────────────────────────────────────────────

export interface GhostModeSettings {
  enabled: boolean;
  ramScrubOnLock: boolean;
  ramScrubOnLogout: boolean;
  clipboardAutoClean: boolean;
  clipboardCleanDelaySec: number;
  metadataSanitization: boolean;
  journalCleanup: boolean;
  autoCleanScheduleMinutes: number;
}

export interface GhostModeStatus {
  active: boolean;
  lastRamScrub?: string; // ISO 8601
  lastJournalCleanup?: string; // ISO 8601
  lastMetadataSanitization?: string; // ISO 8601
}

// ── Constants ──────────────────────────────────────────────────

const SETTINGS_KEY = 'usbvault:ghost_mode_settings';
const STATUS_KEY = 'usbvault:ghost_mode_status';

const DEFAULT_SETTINGS: GhostModeSettings = {
  enabled: true,
  ramScrubOnLock: true,
  ramScrubOnLogout: true,
  clipboardAutoClean: true,
  clipboardCleanDelaySec: 5,
  metadataSanitization: true,
  journalCleanup: true,
  autoCleanScheduleMinutes: 0, // 0 = disabled
};

const DEFAULT_STATUS: GhostModeStatus = { active: false };

// ── Helper Functions ───────────────────────────────────────────
// PL-031: Thin wrappers over readLocal/writeLocal for type safety

function readSettings(): GhostModeSettings {
  const stored = readLocal<Partial<GhostModeSettings> | null>(SETTINGS_KEY, null);
  return stored ? { ...DEFAULT_SETTINGS, ...stored } : DEFAULT_SETTINGS;
}

const writeSettings = (settings: GhostModeSettings) => writeLocal(SETTINGS_KEY, settings);

const readStatus = () => readLocal<GhostModeStatus>(STATUS_KEY, DEFAULT_STATUS);

const writeStatus = (status: GhostModeStatus) => writeLocal(STATUS_KEY, status);

/**
 * Record a cleanup operation timestamp.
 */
function recordCleanupTimestamp(
  operation: 'ram_scrub' | 'journal_cleanup' | 'metadata_sanitization'
): void {
  const status = readStatus();

  switch (operation) {
    case 'ram_scrub':
      status.lastRamScrub = new Date().toISOString();
      break;
    case 'journal_cleanup':
      status.lastJournalCleanup = new Date().toISOString();
      break;
    case 'metadata_sanitization':
      status.lastMetadataSanitization = new Date().toISOString();
      break;
  }

  writeStatus(status);
}

// ── Service ────────────────────────────────────────────────────

class GhostModeServiceImpl {
  private clipboardCleanupTimer: NodeJS.Timeout | null = null;
  /** PL-027: Guard to prevent overlapping async clipboard cleanups */
  private clipboardCleanInFlight = false;

  constructor() {
    this.initializeSettings();
  }

  /**
   * Initialize Ghost Mode settings from storage.
   * @private
   */
  private initializeSettings(): void {
    const settings = readSettings();

    // Setup forensics config based on Ghost Mode settings
    forensicsService.updateConfig({
      cleanOnLock: settings.ramScrubOnLock,
      cleanOnLogout: settings.ramScrubOnLogout,
      scheduledIntervalMin: settings.autoCleanScheduleMinutes,
      autoCleanCategories: ['clipboard', 'app_cache', 'session_data', 'temp_files'],
    });
  }

  /**
   * Get current Ghost Mode settings.
   *
   * @returns Current Ghost Mode configuration
   */
  getGhostModeSettings(): GhostModeSettings {
    return readSettings();
  }

  /**
   * Update Ghost Mode settings.
   *
   * @param settings - Partial settings to update
   */
  updateGhostModeSettings(settings: Partial<GhostModeSettings>): void {
    const current = readSettings();
    const updated = { ...current, ...settings };
    writeSettings(updated);

    // Update forensics config
    this.initializeSettings();

    // Update clipboard cleanup timer if needed
    if ('clipboardAutoClean' in settings || 'clipboardCleanDelaySec' in settings) {
      this.setupClipboardAutoClean();
    }

    auditService
      .log('settings_change', 'ghost_mode_settings', { settings }, 'success')
      .catch(() => {});
  }

  /**
   * Trigger an immediate RAM scrub operation.
   */
  async triggerRamScrub(): Promise<void> {
    try {
      // forensicsService has a private scrubRAM method, so we trigger
      // the full Ghost Mode cleanup which includes RAM scrubbing
      const result = await forensicsService.executeGhostMode();

      recordCleanupTimestamp('ram_scrub');

      auditService
        .log('system', 'ghost_mode_ram_scrub_triggered', { success: result.success }, 'success')
        .catch(() => {});
    } catch (err) {
      logger.error('[GhostMode] RAM scrub failed:', err);
      auditService
        .log('system', 'ghost_mode_ram_scrub_failed', { error: String(err) }, 'error')
        .catch(() => {});
    }
  }

  /**
   * Trigger an immediate journal cleanup operation.
   */
  async triggerJournalCleanup(): Promise<void> {
    try {
      await forensicsService.cleanCategory('os_journals');
      recordCleanupTimestamp('journal_cleanup');

      auditService
        .log('system', 'ghost_mode_journal_cleanup_triggered', {}, 'success')
        .catch(() => {});
    } catch (err) {
      logger.error('[GhostMode] Journal cleanup failed:', err);
      auditService
        .log('system', 'ghost_mode_journal_cleanup_failed', { error: String(err) }, 'error')
        .catch(() => {});
    }
  }

  /**
   * Trigger an immediate metadata sanitization operation.
   */
  async triggerMetadataSanitization(): Promise<void> {
    try {
      // Sanitize file metadata by clearing app cache and session data
      await Promise.all([
        forensicsService.cleanCategory('app_cache'),
        forensicsService.cleanCategory('session_data'),
      ]);

      recordCleanupTimestamp('metadata_sanitization');

      auditService
        .log('system', 'ghost_mode_metadata_sanitization_triggered', {}, 'success')
        .catch(() => {});
    } catch (err) {
      logger.error('[GhostMode] Metadata sanitization failed:', err);
      auditService
        .log('system', 'ghost_mode_metadata_sanitization_failed', { error: String(err) }, 'error')
        .catch(() => {});
    }
  }

  /**
   * Get current Ghost Mode status (including last operation timestamps).
   *
   * @returns Ghost Mode status
   */
  getGhostModeStatus(): GhostModeStatus {
    const settings = readSettings();
    const status = readStatus();

    return {
      ...status,
      active: settings.enabled,
    };
  }

  /**
   * Enable Ghost Mode.
   */
  async enableGhostMode(): Promise<void> {
    this.updateGhostModeSettings({ enabled: true });
    await this.triggerRamScrub();

    auditService.log('settings_change', 'ghost_mode_enabled', {}, 'success').catch(() => {});
  }

  /**
   * Disable Ghost Mode.
   */
  async disableGhostMode(): Promise<void> {
    this.updateGhostModeSettings({ enabled: false });
    this.clearClipboardAutoClean();

    auditService.log('settings_change', 'ghost_mode_disabled', {}, 'success').catch(() => {});
  }

  /**
   * Set up automatic clipboard cleanup with delay.
   * @private
   */
  private setupClipboardAutoClean(): void {
    this.clearClipboardAutoClean();

    const settings = readSettings();
    if (!settings.clipboardAutoClean) return;

    const delayMs = settings.clipboardCleanDelaySec * 1000;
    // PL-027: Async interval guard — skip if previous cleanup still running
    this.clipboardCleanupTimer = setInterval(async () => {
      if (this.clipboardCleanInFlight) return;
      this.clipboardCleanInFlight = true;
      try {
        await forensicsService.cleanCategory('clipboard');
      } catch (err) {
        logger.error('[GhostMode] Clipboard auto-clean failed:', err);
      } finally {
        this.clipboardCleanInFlight = false;
      }
    }, delayMs);
  }

  /**
   * Clear the clipboard cleanup timer.
   * @private
   */
  private clearClipboardAutoClean(): void {
    if (this.clipboardCleanupTimer) {
      clearInterval(this.clipboardCleanupTimer);
      this.clipboardCleanupTimer = null;
    }
  }
}

// ── Singleton ──────────────────────────────────────────────────

export const ghostModeService = new GhostModeServiceImpl();
