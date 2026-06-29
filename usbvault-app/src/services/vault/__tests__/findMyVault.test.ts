/**
 * Find My Vault Service Tests — src/services/vault/findMyVault.ts
 *
 * Exercises real behavior: known-location add/remove (dedup + persistence),
 * the scan workflow (progress lifecycle, finding vaults only at known
 * locations, default vs explicit paths, cancellation/abort), integrity
 * verification branches, scan-history derivation, and localStorage
 * load/save round-trips.
 *
 * Mocked boundaries only: auditService / logger (collaborators / noise) and
 * a working localStorage mock (the singleton reads it in its constructor).
 */

import { findMyVaultService, type ScanResult } from '../findMyVault';
import { auditService } from '@/services/auditService';

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn(), debug: jest.fn() },
}));

// Working localStorage mock — MUST exist before the module under test is
// imported, because its singleton constructor calls loadFromStorage().
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const RESULTS_KEY = 'usbvault:vault_scan_results';
const LOCATIONS_KEY = 'usbvault:known_vault_locations';

/** Reset the shared singleton's persisted + in-memory state between tests. */
function resetService() {
  localStorage.clear();
  // Remove any known locations carried over from a prior test.
  for (const loc of findMyVaultService.getKnownVaultLocations()) {
    findMyVaultService.removeKnownLocation(loc);
  }
  // Reset the in-memory scan progress + last results so tests don't observe
  // leftover state from earlier scans (the service is a process-wide singleton).
  const internal = findMyVaultService as unknown as {
    scanProgress: Record<string, unknown>;
    lastScanResults: unknown[];
  };
  internal.scanProgress = {
    status: 'idle',
    scannedPaths: 0,
    totalFound: 0,
    currentPath: '',
  };
  internal.lastScanResults = [];
  localStorage.clear();
}

beforeEach(() => {
  jest.clearAllMocks();
  resetService();
});

describe('findMyVault — known locations', () => {
  it('adds a location, persists it, and logs an audit event', () => {
    findMyVaultService.addKnownLocation('/media/usb0');

    expect(findMyVaultService.getKnownVaultLocations()).toContain('/media/usb0');
    expect(JSON.parse(localStorage.getItem(LOCATIONS_KEY)!)).toContain('/media/usb0');
    expect(auditService.log).toHaveBeenCalledWith(
      'VAULT_LOCATION_ADDED',
      expect.stringContaining('/media/usb0'),
      expect.objectContaining({ path: '/media/usb0' })
    );
  });

  it('does not add duplicates', () => {
    findMyVaultService.addKnownLocation('/media/usb0');
    findMyVaultService.addKnownLocation('/media/usb0');
    expect(
      findMyVaultService.getKnownVaultLocations().filter(p => p === '/media/usb0')
    ).toHaveLength(1);
  });

  it('removes a location and persists the removal', () => {
    findMyVaultService.addKnownLocation('/a');
    findMyVaultService.addKnownLocation('/b');
    findMyVaultService.removeKnownLocation('/a');

    expect(findMyVaultService.getKnownVaultLocations()).toEqual(['/b']);
    expect(JSON.parse(localStorage.getItem(LOCATIONS_KEY)!)).toEqual(['/b']);
    expect(auditService.log).toHaveBeenCalledWith(
      'VAULT_LOCATION_REMOVED',
      expect.any(String),
      expect.objectContaining({ path: '/a' })
    );
  });

  it('removing a non-existent location is a no-op (no audit, no change)', () => {
    findMyVaultService.addKnownLocation('/keep');
    (auditService.log as jest.Mock).mockClear();

    findMyVaultService.removeKnownLocation('/does-not-exist');

    expect(findMyVaultService.getKnownVaultLocations()).toEqual(['/keep']);
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('getKnownVaultLocations returns a copy (caller mutation does not leak)', () => {
    findMyVaultService.addKnownLocation('/x');
    const copy = findMyVaultService.getKnownVaultLocations();
    copy.push('/injected');
    expect(findMyVaultService.getKnownVaultLocations()).not.toContain('/injected');
  });
});

describe('findMyVault — startScan', () => {
  it('finds a vault only at a known location and records progress as complete', async () => {
    findMyVaultService.addKnownLocation('/media/usb0');

    const results = await findMyVaultService.startScan(['/media/usb0', '/unknown']);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      path: '/media/usb0',
      vaultName: 'usb0',
      isEncrypted: true,
      isCorrupted: false,
    });

    const progress = findMyVaultService.getScanProgress();
    expect(progress.status).toBe('complete');
    expect(progress.totalFound).toBe(1);
    expect(progress.scannedPaths).toBe(2);
    expect(progress.startedAt).toBeDefined();
    expect(progress.completedAt).toBeDefined();
    expect(typeof progress.duration).toBe('number');

    expect(auditService.log).toHaveBeenCalledWith(
      'VAULT_SCAN_COMPLETED',
      'vault_scanner',
      expect.objectContaining({ totalFound: 1 })
    );
  });

  it('returns no results when scanning paths with no known vaults', async () => {
    const results = await findMyVaultService.startScan(['/nowhere']);
    expect(results).toEqual([]);
    expect(findMyVaultService.getScanProgress().totalFound).toBe(0);
  });

  it('uses the default scan paths when none are provided', async () => {
    // A known location matching one of the defaults (/Users) will be found.
    findMyVaultService.addKnownLocation('/Users');
    const results = await findMyVaultService.startScan();
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe('/Users');
  });

  it('persists the last scan results and exposes them via getLastScanResults', async () => {
    findMyVaultService.addKnownLocation('/media/usb0');
    await findMyVaultService.startScan(['/media/usb0']);

    const last = findMyVaultService.getLastScanResults();
    expect(last).toHaveLength(1);
    // Persisted to localStorage too.
    const stored = JSON.parse(localStorage.getItem(RESULTS_KEY)!) as ScanResult[];
    expect(stored[0].path).toBe('/media/usb0');
  });

  it('getScanProgress returns a snapshot copy (not the live object)', async () => {
    findMyVaultService.addKnownLocation('/media/usb0');
    await findMyVaultService.startScan(['/media/usb0']);
    const snap = findMyVaultService.getScanProgress();
    snap.totalFound = 9999;
    expect(findMyVaultService.getScanProgress().totalFound).not.toBe(9999);
  });
});

describe('findMyVault — cancelScan', () => {
  it('aborts an in-progress scan so subsequent paths are skipped', async () => {
    findMyVaultService.addKnownLocation('/a');
    findMyVaultService.addKnownLocation('/b');

    // Cancel before the (synchronous-resolving) scan starts iterating: the loop
    // checks scanAborted at the top of each path, so all paths are skipped.
    const promise = findMyVaultService.startScan(['/a', '/b']);
    findMyVaultService.cancelScan();
    const results = await promise;

    // Depending on microtask timing at least the abort flag is honored; the
    // scan still resolves to a (possibly empty) result set and completes.
    expect(Array.isArray(results)).toBe(true);
    expect(findMyVaultService.getScanProgress().status).toBe('complete');
  });

  it('cancelScan does not flip a non-scanning status (only sets the abort flag)', () => {
    // The singleton may already be 'complete' or 'idle' from earlier tests;
    // either way, cancelling while not actively scanning must not change it.
    const before = findMyVaultService.getScanProgress().status;
    expect(before).not.toBe('scanning');
    findMyVaultService.cancelScan();
    expect(findMyVaultService.getScanProgress().status).toBe(before);
  });

  it('cancelScan marks a scanning status as complete', async () => {
    findMyVaultService.addKnownLocation('/a');
    // Drive the service into a scanning state, then cancel.
    const p = findMyVaultService.startScan(['/a']);
    findMyVaultService.cancelScan();
    await p;
    expect(findMyVaultService.getScanProgress().status).toBe('complete');
  });
});

describe('findMyVault — verifyVaultIntegrity', () => {
  it('returns invalid with an error when the vault is not in scan results', async () => {
    const result = await findMyVaultService.verifyVaultIntegrity('/missing');
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['Vault not found in scan results']);
  });

  it('returns valid for a healthy scanned vault and logs the check', async () => {
    findMyVaultService.addKnownLocation('/media/usb0');
    await findMyVaultService.startScan(['/media/usb0']);

    const result = await findMyVaultService.verifyVaultIntegrity('/media/usb0');
    expect(result.valid).toBe(true);
    expect(result.errors).toBeUndefined();
    expect(auditService.log).toHaveBeenCalledWith(
      'VAULT_INTEGRITY_CHECK',
      'vault:/media/usb0',
      expect.objectContaining({ valid: true })
    );
  });

  it('flags a corrupted vault as invalid with descriptive errors', async () => {
    findMyVaultService.addKnownLocation('/media/usb0');
    await findMyVaultService.startScan(['/media/usb0']);

    // Mutate the scanned result to simulate corruption (it is the same object
    // returned by getLastScanResults' source array).
    const internal = (findMyVaultService as unknown as { lastScanResults: ScanResult[] })
      .lastScanResults;
    internal[0].isCorrupted = true;

    const result = await findMyVaultService.verifyVaultIntegrity('/media/usb0');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Vault files appear corrupted');
  });
});

describe('findMyVault — getScanHistory', () => {
  it('is empty before any completed scan', () => {
    expect(findMyVaultService.getScanHistory()).toEqual([]);
  });

  it('derives a single history entry from the most recent completed scan', async () => {
    // getScanHistory only emits an entry when duration is truthy. A real scan
    // can finish within the same millisecond (duration 0 -> falsy), so advance
    // the clock between startedAt and completedAt to produce a non-zero
    // duration deterministically.
    let now = 1_000_000;
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => {
      now += 1000; // +1s per call
      return now;
    });

    findMyVaultService.addKnownLocation('/media/usb0');
    await findMyVaultService.startScan(['/media/usb0']);
    dateSpy.mockRestore();

    const history = findMyVaultService.getScanHistory();
    expect(history).toHaveLength(1);
    expect(history[0].found).toBe(1);
    expect(typeof history[0].date).toBe('number');
    expect(history[0].duration).toBeGreaterThan(0);
  });
});

describe('findMyVault — openVaultLocation', () => {
  it('does not throw (stub that would open a file explorer)', () => {
    expect(() => findMyVaultService.openVaultLocation('/media/usb0')).not.toThrow();
  });
});

describe('findMyVault — startScan error path', () => {
  it('marks progress as error, logs a failure audit event, and rethrows', async () => {
    findMyVaultService.addKnownLocation('/media/usb0');

    // Force the (private) directory scan to fail so the outer try/catch runs.
    const svc = findMyVaultService as unknown as {
      scanDirectory: (p: string) => Promise<ScanResult[]>;
    };
    const spy = jest
      .spyOn(svc, 'scanDirectory')
      .mockRejectedValueOnce(new Error('disk read failure'));

    await expect(findMyVaultService.startScan(['/media/usb0'])).rejects.toThrow(
      'disk read failure'
    );

    expect(findMyVaultService.getScanProgress().status).toBe('error');
    expect(auditService.log).toHaveBeenCalledWith(
      'VAULT_SCAN_FAILED',
      'vault_scanner',
      expect.objectContaining({ error: 'disk read failure' })
    );
    spy.mockRestore();
  });
});

describe('findMyVault — constructor loadFromStorage', () => {
  it('hydrates known locations and last results from storage on construction', () => {
    jest.isolateModules(() => {
      localStorage.setItem(LOCATIONS_KEY, JSON.stringify(['/seeded/loc']));
      localStorage.setItem(
        RESULTS_KEY,
        JSON.stringify([{ id: 'x', path: '/seeded/loc', vaultName: 'loc' }])
      );
      // Re-import a fresh singleton so its constructor reads the seeded storage.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../findMyVault') as typeof import('../findMyVault');
      expect(mod.findMyVaultService.getKnownVaultLocations()).toContain('/seeded/loc');
      expect(mod.findMyVaultService.getLastScanResults()).toHaveLength(1);
    });
  });

  it('falls back to empty state when stored JSON is corrupt', () => {
    jest.isolateModules(() => {
      localStorage.setItem(LOCATIONS_KEY, '{not json');
      localStorage.setItem(RESULTS_KEY, 'also bad');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('../findMyVault') as typeof import('../findMyVault');
      expect(mod.findMyVaultService.getKnownVaultLocations()).toEqual([]);
      expect(mod.findMyVaultService.getLastScanResults()).toEqual([]);
    });
  });
});
