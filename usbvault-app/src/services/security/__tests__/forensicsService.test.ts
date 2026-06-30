/**
 * Forensics Service Tests — PH4-FIX (security domain)
 *
 * Exercises the real logic of forensicsService.ts:
 *  - scan() risk-level escalation from clipboard / sessionStorage / localStorage /
 *    registered RAM buffers
 *  - config load/merge/persist
 *  - sensitive-buffer registration + RAM scrubbing (zeroing)
 *  - per-category cleanup (clipboard, session_data, app_cache, temp_files,
 *    browser_traces, unknown) and last-clean timestamp recording
 *  - executeGhostMode / quickClean / wipeTraces orchestration
 *  - scheduled cleanup timer lifecycle
 *
 * Only true external boundaries are stubbed: navigator.clipboard, the CacheStorage
 * (`caches`) API, and performance.clearResourceTimings. localStorage/sessionStorage
 * use jsdom's real implementations (cleared between tests).
 */

import { forensicsService } from '../forensicsService';

// CacheStorage API stub (not implemented in jsdom).
let cacheStore: Record<string, true> = {};
const cachesMock = {
  keys: jest.fn(async () => Object.keys(cacheStore)),
  delete: jest.fn(async (name: string) => {
    const existed = name in cacheStore;
    delete cacheStore[name];
    return existed;
  }),
};

const clipboardWrite = jest.fn().mockResolvedValue(undefined);
const clipboardRead = jest.fn().mockResolvedValue('');

beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite, readText: clipboardRead },
  });
  (globalThis as unknown as { caches: typeof cachesMock }).caches = cachesMock;
  // performance exists in jsdom; ensure clearResourceTimings is present.
  if (typeof performance.clearResourceTimings !== 'function') {
    (performance as unknown as { clearResourceTimings: () => void }).clearResourceTimings =
      jest.fn();
  }
});

describe('ForensicsServiceImpl', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    cacheStore = {};
    clipboardRead.mockResolvedValue('');
    clipboardWrite.mockResolvedValue(undefined);
    jest.clearAllMocks();
  });

  describe('scan', () => {
    it('reports low risk and no findings on a clean environment', async () => {
      const report = await forensicsService.scan();
      expect(report.riskLevel).toBe('low');
      expect(report.findings).toEqual([]);
      expect(typeof report.timestamp).toBe('string');
    });

    it('escalates to medium when the clipboard holds data', async () => {
      clipboardRead.mockResolvedValue('some copied secret');
      const report = await forensicsService.scan();
      expect(report.riskLevel).toBe('medium');
      expect(report.findings.some(f => f.includes('Clipboard'))).toBe(true);
    });

    it('flags non-vault session entries and escalates from low to medium', async () => {
      sessionStorage.setItem('thirdparty', 'x');
      sessionStorage.setItem('usbvault:keep', 'y');
      const report = await forensicsService.scan();
      expect(report.findings.some(f => f.includes('session storage'))).toBe(true);
      expect(report.riskLevel).toBe('medium');
    });

    it('escalates to high when sensitive non-vault localStorage keys exist', async () => {
      localStorage.setItem('auth_token', 'abc');
      localStorage.setItem('usbvault:auth', 'safe'); // vault-prefixed => ignored
      const report = await forensicsService.scan();
      expect(report.findings.some(f => f.includes('localStorage'))).toBe(true);
      expect(report.riskLevel).toBe('high');
    });

    it('escalates to high when sensitive buffers are still registered', async () => {
      const buf = new ArrayBuffer(16);
      forensicsService.registerSensitiveBuffer(buf);
      const report = await forensicsService.scan();
      expect(report.findings.some(f => f.includes('sensitive buffer'))).toBe(true);
      expect(report.riskLevel).toBe('high');
      forensicsService.unregisterSensitiveBuffer(buf);
    });
  });

  describe('config', () => {
    it('returns the default config when storage is empty', () => {
      const cfg = forensicsService.getConfig();
      expect(cfg.cleanOnLock).toBe(true);
      expect(cfg.cleanOnLogout).toBe(true);
      expect(cfg.scheduledIntervalMin).toBe(0);
      expect(cfg.autoCleanCategories).toEqual(['clipboard', 'session_data']);
    });

    it('merges persisted partial config over defaults', () => {
      forensicsService.updateConfig({ scheduledIntervalMin: 30 });
      const cfg = forensicsService.getConfig();
      expect(cfg.scheduledIntervalMin).toBe(30);
      // unspecified fields retain defaults
      expect(cfg.cleanOnLock).toBe(true);
      const raw = JSON.parse(localStorage.getItem('usbvault:forensics_config')!);
      expect(raw.scheduledIntervalMin).toBe(30);
    });

    it('falls back to defaults if stored config is corrupt JSON', () => {
      localStorage.setItem('usbvault:forensics_config', '{not json');
      const cfg = forensicsService.getConfig();
      expect(cfg).toEqual({
        cleanOnLock: true,
        cleanOnLogout: true,
        scheduledIntervalMin: 0,
        autoCleanCategories: ['clipboard', 'session_data'],
      });
    });
  });

  describe('sensitive buffer scrubbing', () => {
    it('zeroes registered buffers and clears the set during wipeTraces', async () => {
      const buf = new ArrayBuffer(8);
      const view = new Uint8Array(buf);
      view.fill(0xff);
      forensicsService.registerSensitiveBuffer(buf);

      await forensicsService.wipeTraces();

      expect(Array.from(view)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
      // Buffer set was cleared: a subsequent scan reports no registered buffers.
      const report = await forensicsService.scan();
      expect(report.findings.some(f => f.includes('sensitive buffer'))).toBe(false);
    });
  });

  describe('cleanCategory', () => {
    it('clears the clipboard and records a timestamp', async () => {
      const ok = await forensicsService.cleanCategory('clipboard');
      expect(ok).toBe(true);
      expect(clipboardWrite).toHaveBeenCalledWith('');
      const ts = JSON.parse(localStorage.getItem('usbvault:forensics_last_clean')!);
      expect(ts.clipboard).toBeDefined();
    });

    it('removes non-vault session keys but preserves usbvault: keys', async () => {
      sessionStorage.setItem('foreign', '1');
      sessionStorage.setItem('usbvault:session', 'keep');
      const ok = await forensicsService.cleanCategory('session_data');
      expect(ok).toBe(true);
      expect(sessionStorage.getItem('foreign')).toBeNull();
      expect(sessionStorage.getItem('usbvault:session')).toBe('keep');
    });

    it('deletes all named caches for app_cache', async () => {
      cacheStore = { 'cache-a': true, 'cache-b': true };
      const ok = await forensicsService.cleanCategory('app_cache');
      expect(ok).toBe(true);
      expect(cachesMock.delete).toHaveBeenCalledWith('cache-a');
      expect(cachesMock.delete).toHaveBeenCalledWith('cache-b');
      expect(Object.keys(cacheStore)).toHaveLength(0);
    });

    it('removes only usbvault temp_/blob_ localStorage keys for temp_files', async () => {
      localStorage.setItem('usbvault:temp_1', 'a');
      localStorage.setItem('usbvault:blob_1', 'b');
      localStorage.setItem('usbvault:keep', 'c');
      localStorage.setItem('other', 'd');
      const ok = await forensicsService.cleanCategory('temp_files');
      expect(ok).toBe(true);
      expect(localStorage.getItem('usbvault:temp_1')).toBeNull();
      expect(localStorage.getItem('usbvault:blob_1')).toBeNull();
      expect(localStorage.getItem('usbvault:keep')).toBe('c');
      expect(localStorage.getItem('other')).toBe('d');
    });

    it('clears performance timings and usbvault/workbox caches for browser_traces', async () => {
      cacheStore = { 'usbvault-runtime': true, 'workbox-precache': true, unrelated: true };
      const ok = await forensicsService.cleanCategory('browser_traces');
      expect(ok).toBe(true);
      expect(performance.clearResourceTimings).toHaveBeenCalled();
      expect(cacheStore.unrelated).toBe(true); // untouched
      expect(cacheStore['usbvault-runtime']).toBeUndefined();
      expect(cacheStore['workbox-precache']).toBeUndefined();
    });

    it('is a no-op success for os_journals (not applicable on web)', async () => {
      expect(await forensicsService.cleanCategory('os_journals')).toBe(true);
    });

    it('returns false for an unknown category', async () => {
      expect(await forensicsService.cleanCategory('bogus')).toBe(false);
    });

    it('returns false when an underlying operation throws', async () => {
      clipboardWrite.mockRejectedValueOnce(new Error('denied'));
      expect(await forensicsService.cleanCategory('clipboard')).toBe(false);
    });
  });

  describe('getCategoryStatuses', () => {
    it('returns a status entry per category with required fields', () => {
      const statuses = forensicsService.getCategoryStatuses();
      const categories = statuses.map(s => s.category);
      expect(categories).toEqual(
        expect.arrayContaining([
          'clipboard',
          'app_cache',
          'session_data',
          'temp_files',
          'os_journals',
          'swap_pagefile',
          'browser_traces',
        ])
      );
      statuses.forEach(s => {
        expect(s.label).toBeTruthy();
        expect(s.description).toBeTruthy();
        expect(typeof s.canClean).toBe('boolean');
      });
    });

    it('marks swap_pagefile as not_applicable and not cleanable', () => {
      const swap = forensicsService.getCategoryStatuses().find(s => s.category === 'swap_pagefile');
      expect(swap?.status).toBe('not_applicable');
      expect(swap?.canClean).toBe(false);
    });

    it('reports session_data as dirty when non-vault keys exist, clean otherwise', () => {
      sessionStorage.setItem('foreign', '1');
      let session = forensicsService.getCategoryStatuses().find(s => s.category === 'session_data');
      expect(session?.status).toBe('dirty');

      sessionStorage.clear();
      session = forensicsService.getCategoryStatuses().find(s => s.category === 'session_data');
      expect(session?.status).toBe('clean');
    });

    it('surfaces the recorded lastCleaned timestamp after a clean', async () => {
      await forensicsService.cleanCategory('clipboard');
      const clip = forensicsService.getCategoryStatuses().find(s => s.category === 'clipboard');
      expect(clip?.lastCleaned).not.toBeNull();
    });
  });

  describe('executeGhostMode', () => {
    it('cleans configured categories, always includes session_data, and scrubs RAM', async () => {
      forensicsService.updateConfig({ autoCleanCategories: ['clipboard'] });
      const buf = new ArrayBuffer(4);
      new Uint8Array(buf).fill(0xff);
      forensicsService.registerSensitiveBuffer(buf);

      const result = await forensicsService.executeGhostMode();

      expect(result.success).toBe(true);
      expect(result.categoriesCleaned).toContain('clipboard');
      expect(result.categoriesCleaned).toContain('session_data');
      expect(result.errors).toEqual([]);
      expect(Array.from(new Uint8Array(buf))).toEqual([0, 0, 0, 0]);
    });

    it('falls back to default categories when autoCleanCategories is empty', async () => {
      forensicsService.updateConfig({ autoCleanCategories: [] });
      const result = await forensicsService.executeGhostMode();
      expect(result.categoriesCleaned).toContain('clipboard');
      expect(result.categoriesCleaned).toContain('session_data');
    });
  });

  describe('quickClean', () => {
    it('clears clipboard and non-vault session data', async () => {
      sessionStorage.setItem('temp', 'v');
      await forensicsService.quickClean();
      expect(clipboardWrite).toHaveBeenCalledWith('');
      expect(sessionStorage.getItem('temp')).toBeNull();
    });
  });

  describe('scheduled cleanup', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      forensicsService.stopScheduledCleanup();
      jest.useRealTimers();
    });

    it('does not schedule when interval is 0', () => {
      forensicsService.updateConfig({ scheduledIntervalMin: 0 });
      forensicsService.startScheduledCleanup();
      // No timer scheduled => advancing time triggers nothing.
      expect(jest.getTimerCount()).toBe(0);
    });

    it('schedules a repeating timer and fires ghost mode on interval', () => {
      forensicsService.updateConfig({
        scheduledIntervalMin: 1,
        autoCleanCategories: ['clipboard'],
      });
      const ghostSpy = jest.spyOn(forensicsService, 'executeGhostMode').mockResolvedValue({
        success: true,
        categoriesCleaned: [],
        timestamp: '',
        errors: [],
      });

      forensicsService.startScheduledCleanup();
      expect(jest.getTimerCount()).toBe(1);

      jest.advanceTimersByTime(60_000);
      expect(ghostSpy).toHaveBeenCalledTimes(1);

      ghostSpy.mockRestore();
    });

    it('replaces an existing timer when started again (single active timer)', () => {
      forensicsService.updateConfig({ scheduledIntervalMin: 1 });
      forensicsService.startScheduledCleanup();
      forensicsService.startScheduledCleanup();
      expect(jest.getTimerCount()).toBe(1);
    });
  });
});
