/**
 * Unit tests for the Ghost Mode service (privacyModes).
 *
 * Exercises real settings/status persistence (localStorage round-trip via the
 * storageHelpers, which require Platform.OS='web'), the default-merge behavior,
 * the forensics integration wiring (config derivation), cleanup-timestamp
 * recording, the clipboard auto-clean interval (fake timers + the in-flight
 * guard), and the enable/disable flows. The forensics engine and audit sink are
 * the only mocked boundaries.
 *
 * Platform must be 'web' BEFORE the module graph loads, because storageHelpers
 * captures `isWeb = Platform.OS === 'web'` at import time. We therefore load the
 * service inside jest.isolateModules with a web react-native mock.
 */

const forensicsMock = {
  updateConfig: jest.fn(),
  executeGhostMode: jest.fn(() => Promise.resolve({ success: true })),
  cleanCategory: jest.fn(() => Promise.resolve(true)),
};

const auditLog = jest.fn(() => Promise.resolve());

function loadGhostModeService(): typeof import('../privacyModes').ghostModeService {
  let mod!: typeof import('../privacyModes');
  jest.isolateModules(() => {
    jest.resetModules();
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web', select: (o: Record<string, unknown>) => o.web ?? o.default },
    }));
    jest.doMock('../forensics', () => ({ forensicsService: forensicsMock }));
    jest.doMock('../auditService', () => ({ auditService: { log: auditLog } }));
    jest.doMock('@/utils/logger', () => ({
      logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
      fireAndForget: jest.fn(),
    }));
    mod = require('../privacyModes');
  });
  return mod.ghostModeService;
}

const SETTINGS_KEY = 'usbvault:ghost_mode_settings';
const STATUS_KEY = 'usbvault:ghost_mode_status';

describe('ghostModeService', () => {
  beforeEach(() => {
    localStorage.clear();
    forensicsMock.updateConfig.mockClear();
    forensicsMock.executeGhostMode.mockClear();
    forensicsMock.executeGhostMode.mockResolvedValue({ success: true });
    forensicsMock.cleanCategory.mockClear();
    forensicsMock.cleanCategory.mockResolvedValue(true);
    auditLog.mockClear();
  });

  describe('construction + defaults', () => {
    it('derives the forensics config from default settings on construction', () => {
      loadGhostModeService();
      expect(forensicsMock.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          cleanOnLock: true,
          cleanOnLogout: true,
          scheduledIntervalMin: 0,
          autoCleanCategories: ['clipboard', 'app_cache', 'session_data', 'temp_files'],
        })
      );
    });

    it('returns the documented default settings when nothing is stored', () => {
      const svc = loadGhostModeService();
      expect(svc.getGhostModeSettings()).toEqual({
        enabled: true,
        ramScrubOnLock: true,
        ramScrubOnLogout: true,
        clipboardAutoClean: true,
        clipboardCleanDelaySec: 5,
        metadataSanitization: true,
        journalCleanup: true,
        autoCleanScheduleMinutes: 0,
      });
    });

    it('merges stored partial settings over the defaults', () => {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ enabled: false, clipboardCleanDelaySec: 30 })
      );
      const svc = loadGhostModeService();
      const settings = svc.getGhostModeSettings();
      expect(settings.enabled).toBe(false);
      expect(settings.clipboardCleanDelaySec).toBe(30);
      // Unspecified keys fall back to defaults.
      expect(settings.ramScrubOnLock).toBe(true);
    });
  });

  describe('updateGhostModeSettings', () => {
    it('persists merged settings to localStorage and re-derives forensics config', () => {
      const svc = loadGhostModeService();
      forensicsMock.updateConfig.mockClear();

      svc.updateGhostModeSettings({ ramScrubOnLock: false, autoCleanScheduleMinutes: 10 });

      const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) as string);
      expect(stored.ramScrubOnLock).toBe(false);
      expect(stored.autoCleanScheduleMinutes).toBe(10);
      expect(forensicsMock.updateConfig).toHaveBeenCalledWith(
        expect.objectContaining({ cleanOnLock: false, scheduledIntervalMin: 10 })
      );
      expect(auditLog).toHaveBeenCalledWith(
        'settings_change',
        'ghost_mode_settings',
        expect.objectContaining({
          settings: { ramScrubOnLock: false, autoCleanScheduleMinutes: 10 },
        }),
        'success'
      );
    });
  });

  describe('cleanup triggers', () => {
    it('triggerRamScrub runs the full ghost-mode cleanup and records a timestamp', async () => {
      const svc = loadGhostModeService();
      await svc.triggerRamScrub();

      expect(forensicsMock.executeGhostMode).toHaveBeenCalledTimes(1);
      const status = JSON.parse(localStorage.getItem(STATUS_KEY) as string);
      expect(typeof status.lastRamScrub).toBe('string');
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'ghost_mode_ram_scrub_triggered',
        { success: true },
        'success'
      );
    });

    it('triggerRamScrub logs an error event when the engine throws (no timestamp written)', async () => {
      const svc = loadGhostModeService();
      forensicsMock.executeGhostMode.mockRejectedValueOnce(new Error('boom'));

      await svc.triggerRamScrub();

      expect(localStorage.getItem(STATUS_KEY)).toBeNull();
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'ghost_mode_ram_scrub_failed',
        expect.objectContaining({ error: expect.stringContaining('boom') }),
        'error'
      );
    });

    it('triggerJournalCleanup cleans the os_journals category and records a timestamp', async () => {
      const svc = loadGhostModeService();
      await svc.triggerJournalCleanup();

      expect(forensicsMock.cleanCategory).toHaveBeenCalledWith('os_journals');
      const status = JSON.parse(localStorage.getItem(STATUS_KEY) as string);
      expect(typeof status.lastJournalCleanup).toBe('string');
    });

    it('triggerMetadataSanitization cleans app_cache + session_data and records a timestamp', async () => {
      const svc = loadGhostModeService();
      await svc.triggerMetadataSanitization();

      expect(forensicsMock.cleanCategory).toHaveBeenCalledWith('app_cache');
      expect(forensicsMock.cleanCategory).toHaveBeenCalledWith('session_data');
      const status = JSON.parse(localStorage.getItem(STATUS_KEY) as string);
      expect(typeof status.lastMetadataSanitization).toBe('string');
    });

    it('triggerJournalCleanup logs an error and skips the timestamp on failure', async () => {
      const svc = loadGhostModeService();
      forensicsMock.cleanCategory.mockRejectedValueOnce(new Error('nope'));
      await svc.triggerJournalCleanup();
      expect(localStorage.getItem(STATUS_KEY)).toBeNull();
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'ghost_mode_journal_cleanup_failed',
        expect.objectContaining({ error: expect.stringContaining('nope') }),
        'error'
      );
    });

    it('triggerMetadataSanitization logs an error event when a category clean rejects', async () => {
      const svc = loadGhostModeService();
      forensicsMock.cleanCategory.mockRejectedValueOnce(new Error('meta-fail'));
      await svc.triggerMetadataSanitization();
      expect(localStorage.getItem(STATUS_KEY)).toBeNull();
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'ghost_mode_metadata_sanitization_failed',
        expect.objectContaining({ error: expect.stringContaining('meta-fail') }),
        'error'
      );
    });
  });

  describe('getGhostModeStatus', () => {
    it('reflects the enabled flag from settings as the active state', () => {
      const svc = loadGhostModeService();
      svc.updateGhostModeSettings({ enabled: false });
      expect(svc.getGhostModeStatus().active).toBe(false);

      svc.updateGhostModeSettings({ enabled: true });
      expect(svc.getGhostModeStatus().active).toBe(true);
    });

    it('merges recorded timestamps into the status', async () => {
      const svc = loadGhostModeService();
      await svc.triggerRamScrub();
      const status = svc.getGhostModeStatus();
      expect(status.active).toBe(true);
      expect(typeof status.lastRamScrub).toBe('string');
    });
  });

  describe('enable/disable', () => {
    it('enableGhostMode flips the flag on and triggers a RAM scrub', async () => {
      const svc = loadGhostModeService();
      svc.updateGhostModeSettings({ enabled: false });
      forensicsMock.executeGhostMode.mockClear();

      await svc.enableGhostMode();

      expect(svc.getGhostModeSettings().enabled).toBe(true);
      expect(forensicsMock.executeGhostMode).toHaveBeenCalledTimes(1);
      expect(auditLog).toHaveBeenCalledWith('settings_change', 'ghost_mode_enabled', {}, 'success');
    });

    it('disableGhostMode flips the flag off', async () => {
      const svc = loadGhostModeService();
      await svc.disableGhostMode();
      expect(svc.getGhostModeSettings().enabled).toBe(false);
      expect(auditLog).toHaveBeenCalledWith(
        'settings_change',
        'ghost_mode_disabled',
        {},
        'success'
      );
    });
  });

  describe('clipboard auto-clean interval', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('schedules a recurring clipboard clean at the configured delay', async () => {
      const svc = loadGhostModeService();
      // Toggling clipboardAutoClean (re)arms the interval.
      svc.updateGhostModeSettings({ clipboardAutoClean: true, clipboardCleanDelaySec: 2 });
      forensicsMock.cleanCategory.mockClear();

      jest.advanceTimersByTime(2000);
      // Flush the async cleanup body queued by the interval callback.
      await Promise.resolve();
      await Promise.resolve();

      expect(forensicsMock.cleanCategory).toHaveBeenCalledWith('clipboard');
    });

    it('clears the interval when clipboard auto-clean is disabled', () => {
      const svc = loadGhostModeService();
      svc.updateGhostModeSettings({ clipboardAutoClean: true, clipboardCleanDelaySec: 2 });
      svc.updateGhostModeSettings({ clipboardAutoClean: false });
      forensicsMock.cleanCategory.mockClear();

      jest.advanceTimersByTime(10_000);
      expect(forensicsMock.cleanCategory).not.toHaveBeenCalled();
    });
  });
});
