/**
 * Unit tests for the Footprint (digital-trace elimination) service.
 *
 * Exercises the real category mapping (cleanup<->footprint), scan-result and
 * cleanup-history persistence (localStorage round-trip, requires Platform='web'),
 * the dirty/unknown tallying, status normalization ('not_applicable'->'clean'),
 * the history trimming (keep last 10), cleanAll aggregation, and the error
 * paths. forensicsService and the audit sink are the only mocked boundaries.
 *
 * Platform is forced to 'web' before module load because the service captures
 * `isWeb = Platform.OS === 'web'` at import time and no-ops storage otherwise.
 */

import type { CleanupCategoryStatus } from '../forensics';

const forensicsMock = {
  getCategoryStatuses: jest.fn<CleanupCategoryStatus[], []>(),
  cleanCategory: jest.fn(() => Promise.resolve(true)),
};

const auditLog = jest.fn(() => Promise.resolve());

/** A representative status set across clean / dirty / not_applicable. */
function defaultStatuses(): CleanupCategoryStatus[] {
  return [
    {
      category: 'clipboard',
      label: 'Clipboard History',
      description: 'clip',
      status: 'dirty',
      lastCleaned: null,
      canClean: true,
    },
    {
      category: 'app_cache',
      label: 'App Cache',
      description: 'cache',
      status: 'unknown',
      lastCleaned: '2026-01-01T00:00:00.000Z',
      canClean: true,
    },
    {
      category: 'recent_files',
      label: 'Recent Files',
      description: 'recent',
      status: 'not_applicable',
      lastCleaned: null,
      canClean: false,
    },
    {
      category: 'session_data',
      label: 'Session Data',
      description: 'session',
      status: 'clean',
      lastCleaned: null,
      canClean: true,
    },
  ];
}

function loadFootprintService(): typeof import('../privacyTools').footprintService {
  let mod!: typeof import('../privacyTools');
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
    mod = require('../privacyTools');
  });
  return mod.footprintService;
}

const SCAN_RESULT_KEY = 'usbvault:footprint_scan';
const CLEANUP_HISTORY_KEY = 'usbvault:cleanup_history';

describe('footprintService', () => {
  beforeEach(() => {
    localStorage.clear();
    forensicsMock.getCategoryStatuses.mockReset();
    forensicsMock.getCategoryStatuses.mockReturnValue(defaultStatuses());
    forensicsMock.cleanCategory.mockReset();
    forensicsMock.cleanCategory.mockResolvedValue(true);
    auditLog.mockClear();
  });

  describe('scanFootprint', () => {
    it('maps forensics statuses to footprint items with mapped ids', async () => {
      const svc = loadFootprintService();
      const items = await svc.scanFootprint();

      const ids = items.map(i => i.id);
      expect(ids).toContain('clipboard_history'); // clipboard -> clipboard_history
      expect(ids).toContain('app_cache');
      expect(ids).toContain('os_recent_files'); // recent_files -> os_recent_files
      expect(ids).toContain('browser_traces'); // session_data -> browser_traces
      // Item count is the per-category estimate (clipboard -> 2).
      const clip = items.find(i => i.id === 'clipboard_history')!;
      expect(clip.itemCount).toBe(2);
      expect(clip.status).toBe('dirty');
    });

    it("normalizes 'not_applicable' status to 'clean'", async () => {
      const svc = loadFootprintService();
      const items = await svc.scanFootprint();
      const recent = items.find(i => i.id === 'os_recent_files')!;
      expect(recent.status).toBe('clean');
    });

    it('persists a scan result with correct dirty/unknown tallies', async () => {
      const svc = loadFootprintService();
      await svc.scanFootprint();

      const stored = JSON.parse(localStorage.getItem(SCAN_RESULT_KEY) as string);
      expect(stored.totalDirty).toBe(1); // only clipboard is dirty
      expect(stored.totalUnknown).toBe(1); // only app_cache is unknown
      expect(stored.categories).toHaveLength(4);
      expect(typeof stored.timestamp).toBe('string');
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'footprint_scan_complete',
        { categories: 4 },
        'success'
      );
    });

    it('returns [] and logs an error when forensics throws', async () => {
      const svc = loadFootprintService();
      forensicsMock.getCategoryStatuses.mockImplementation(() => {
        throw new Error('scan-fail');
      });

      const items = await svc.scanFootprint();
      expect(items).toEqual([]);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'footprint_scan_error',
        expect.objectContaining({ error: expect.stringContaining('scan-fail') }),
        'error'
      );
    });
  });

  describe('cleanCategory', () => {
    it('maps the footprint id back to a cleanup category and records history on success', async () => {
      const svc = loadFootprintService();
      const ok = await svc.cleanCategory('clipboard_history');

      expect(ok).toBe(true);
      expect(forensicsMock.cleanCategory).toHaveBeenCalledWith('clipboard'); // reverse map
      const history = JSON.parse(localStorage.getItem(CLEANUP_HISTORY_KEY) as string);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        categories: ['clipboard_history'],
        success: true,
        itemsCleaned: 1,
      });
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'footprint_category_cleaned',
        { category: 'clipboard_history' },
        'success'
      );
    });

    it('does not record history when the underlying clean returns false', async () => {
      const svc = loadFootprintService();
      forensicsMock.cleanCategory.mockResolvedValueOnce(false);

      const ok = await svc.cleanCategory('app_cache');
      expect(ok).toBe(false);
      expect(localStorage.getItem(CLEANUP_HISTORY_KEY)).toBeNull();
    });

    it('returns false and logs an error when the clean throws', async () => {
      const svc = loadFootprintService();
      forensicsMock.cleanCategory.mockRejectedValueOnce(new Error('clean-fail'));

      const ok = await svc.cleanCategory('temp_files');
      expect(ok).toBe(false);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'footprint_cleanup_error',
        expect.objectContaining({
          category: 'temp_files',
          error: expect.stringContaining('clean-fail'),
        }),
        'error'
      );
    });

    it('maps every footprint category to a distinct cleanup category', async () => {
      const svc = loadFootprintService();
      const pairs: [string, string][] = [
        ['clipboard_history', 'clipboard'],
        ['app_cache', 'app_cache'],
        ['os_recent_files', 'recent_files'],
        ['filesystem_journals', 'os_journals'],
        ['swap_pagefile', 'swap_pagefile'],
        ['browser_traces', 'session_data'],
        ['temp_files', 'temp_files'],
      ];
      for (const [footprintId, cleanupCat] of pairs) {
        forensicsMock.cleanCategory.mockClear();
        // eslint-disable-next-line no-await-in-loop
        await svc.cleanCategory(footprintId as never);
        expect(forensicsMock.cleanCategory).toHaveBeenCalledWith(cleanupCat);
      }
    });
  });

  describe('cleanAll', () => {
    it('cleans every scanned category and returns the cleaned count', async () => {
      const svc = loadFootprintService();
      const cleaned = await svc.cleanAll();

      // 4 categories scanned, all clean successfully.
      expect(cleaned).toBe(4);
      expect(auditLog).toHaveBeenCalledWith(
        'system',
        'footprint_full_cleanup',
        { categoriesCleaned: 4, total: 4 },
        'success'
      );
    });

    it('records a combined operation entry with success=false on partial cleanup', async () => {
      const svc = loadFootprintService();
      // Make exactly one clean fail.
      forensicsMock.cleanCategory.mockResolvedValue(true);
      forensicsMock.cleanCategory.mockResolvedValueOnce(false);

      const cleaned = await svc.cleanAll();
      expect(cleaned).toBe(3); // 4 attempted, 1 failed

      const history = svc.getCleanupHistory();
      const combined = history[history.length - 1];
      expect(combined.success).toBe(false);
      expect(combined.itemsCleaned).toBe(3);
      expect(combined.categories).toHaveLength(4);
    });

    it('reports every per-item clean failing as 0 cleaned with a failed combined record', async () => {
      const svc = loadFootprintService();
      // Each per-item clean rejects; cleanCategory swallows -> false, so 0 cleaned,
      // and the combined history entry is marked unsuccessful.
      forensicsMock.cleanCategory.mockRejectedValue(new Error('boom'));
      const cleaned = await svc.cleanAll();
      expect(cleaned).toBe(0);
      const history = svc.getCleanupHistory();
      expect(history[history.length - 1].success).toBe(false);
      expect(history[history.length - 1].itemsCleaned).toBe(0);
    });
  });

  describe('history persistence', () => {
    it('getLastScanResult returns the persisted scan and null before any scan', async () => {
      const svc = loadFootprintService();
      expect(svc.getLastScanResult()).toBeNull();
      await svc.scanFootprint();
      const last = svc.getLastScanResult();
      expect(last).not.toBeNull();
      expect(last!.categories).toHaveLength(4);
    });

    it('keeps only the most recent 10 cleanup operations', async () => {
      const svc = loadFootprintService();
      for (let i = 0; i < 12; i++) {
        // eslint-disable-next-line no-await-in-loop
        await svc.cleanCategory('clipboard_history');
      }
      const history = svc.getCleanupHistory();
      expect(history).toHaveLength(10);
    });

    it('getCleanupHistory returns [] when nothing has been cleaned', () => {
      const svc = loadFootprintService();
      expect(svc.getCleanupHistory()).toEqual([]);
    });

    it('getLastScanResult returns null when the stored scan is corrupt JSON', () => {
      localStorage.setItem(SCAN_RESULT_KEY, '{not-valid-json');
      const svc = loadFootprintService();
      expect(svc.getLastScanResult()).toBeNull();
    });

    it('getCleanupHistory returns [] when the stored history is corrupt JSON', () => {
      localStorage.setItem(CLEANUP_HISTORY_KEY, '[broken');
      const svc = loadFootprintService();
      expect(svc.getCleanupHistory()).toEqual([]);
    });
  });
});
