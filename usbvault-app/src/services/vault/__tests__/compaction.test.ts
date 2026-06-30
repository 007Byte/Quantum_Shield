/**
 * Vault Compaction Service Tests — src/services/vault/compaction.ts
 *
 * Exercises real behavior against a working localStorage: vault-entry
 * enumeration + byte-size accounting, fragmentation math, the compaction
 * operation (deleted-entry removal, space-saved/entries-removed, history
 * persistence + trimming), storage-breakdown categorization, time
 * estimation heuristic, the in-progress guard, and the non-web path.
 *
 * Mocked boundaries only:
 *  - react-native Platform (toggled per-test between 'web' and a native OS)
 *  - auditService / logger (collaborators / noise)
 * localStorage is a real working mock; compaction logic runs for real.
 */

// Mutable Platform so individual tests can flip to the non-web branch.
import { vaultCompactionService } from '../compaction';
import { auditService } from '@/services/auditService';

const platform = { OS: 'web' as string };
jest.mock('react-native', () => ({
  get Platform() {
    return platform;
  },
}));

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn(), debug: jest.fn() },
}));

// Working localStorage mock with real key/length enumeration semantics.
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
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

const VP = 'usbvault:vault_';

beforeEach(() => {
  platform.OS = 'web';
  localStorage.clear();
  jest.clearAllMocks();
});

/** byte length of a string under UTF-8, matching the service's accounting. */
const bytes = (s: string) => new TextEncoder().encode(s).length;

describe('compaction — analyzeVault', () => {
  it('returns all-zero stats for an empty vault', () => {
    const stats = vaultCompactionService.analyzeVault();
    expect(stats).toMatchObject({
      totalSize: 0,
      usedSize: 0,
      reclaimableSize: 0,
      fragmentationPercent: 0,
      deletedEntries: 0,
      lastCompactedAt: null,
    });
  });

  it('counts only vault-prefixed entries and ignores unrelated keys', () => {
    localStorage.setItem(`${VP}a`, 'hello'); // 5 bytes, used
    localStorage.setItem('other:thing', 'IGNORED-LARGE-VALUE');
    const stats = vaultCompactionService.analyzeVault();
    expect(stats.totalSize).toBe(bytes('hello'));
    expect(stats.usedSize).toBe(bytes('hello'));
  });

  it('separates deleted: entries into reclaimable space and fragmentation %', () => {
    localStorage.setItem(`${VP}live`, 'AAAA'); // 4 bytes used
    localStorage.setItem(`${VP}deleted:gone`, 'BBBBBB'); // 6 bytes reclaimable
    const stats = vaultCompactionService.analyzeVault();

    expect(stats.totalSize).toBe(10);
    expect(stats.usedSize).toBe(4);
    expect(stats.reclaimableSize).toBe(6);
    expect(stats.deletedEntries).toBe(1);
    expect(stats.fragmentationPercent).toBe(60); // round(6/10 * 100)
  });

  it('returns empty stats on a non-web platform', () => {
    platform.OS = 'ios';
    localStorage.setItem(`${VP}a`, 'data');
    const stats = vaultCompactionService.analyzeVault();
    expect(stats.totalSize).toBe(0);
  });
});

describe('compaction — isCompactionNeeded', () => {
  it('is false below the 10% fragmentation threshold', () => {
    // 1 deleted byte out of ~100 total -> ~1% fragmentation.
    localStorage.setItem(`${VP}live`, 'X'.repeat(99));
    localStorage.setItem(`${VP}deleted:a`, 'Y');
    expect(vaultCompactionService.isCompactionNeeded()).toBe(false);
  });

  it('is true above the threshold', () => {
    localStorage.setItem(`${VP}live`, 'X'.repeat(50));
    localStorage.setItem(`${VP}deleted:a`, 'Y'.repeat(50)); // 50% fragmentation
    expect(vaultCompactionService.isCompactionNeeded()).toBe(true);
  });
});

describe('compaction — compact', () => {
  it('removes deleted entries, reports space saved + history, and emits audit events', async () => {
    localStorage.setItem(`${VP}live`, 'KEEP'); // 4 bytes, retained
    localStorage.setItem(`${VP}deleted:a`, 'GONEAAA'); // 7 bytes, removed
    localStorage.setItem(`${VP}deleted:b`, 'GONEB'); // 5 bytes, removed

    const result = await vaultCompactionService.compact();

    expect(result.success).toBe(true);
    expect(result.entriesRemoved).toBe(2);
    expect(result.spaceSaved).toBe(12); // 7 + 5 removed
    expect(result.before.totalSize).toBe(16);
    expect(result.after.totalSize).toBe(4); // only the live entry remains
    expect(typeof result.duration).toBe('number');

    // The deleted entries are physically gone from storage.
    expect(localStorage.getItem(`${VP}deleted:a`)).toBeNull();
    expect(localStorage.getItem(`${VP}live`)).toBe('KEEP');

    // History recorded.
    const history = vaultCompactionService.getCompactionHistory();
    expect(history).toHaveLength(1);
    expect(history[0].reason).toBe('manual_compaction');
    expect(history[0].result.entriesRemoved).toBe(2);

    // Audit lifecycle events.
    const actions = (auditService.log as jest.Mock).mock.calls.map(c => c[0]);
    expect(actions).toContain('vault_compaction_started');
    expect(actions).toContain('vault_compaction_completed');
  });

  it('is idempotent: a second compaction removes nothing', async () => {
    localStorage.setItem(`${VP}live`, 'KEEP');
    localStorage.setItem(`${VP}deleted:a`, 'GONE');

    await vaultCompactionService.compact();
    const second = await vaultCompactionService.compact();

    expect(second.entriesRemoved).toBe(0);
    expect(second.spaceSaved).toBe(0);
    expect(vaultCompactionService.getCompactionHistory()).toHaveLength(2);
  });

  it('rejects a re-entrant compaction while one is already in progress', async () => {
    // The compaction body is synchronous (no internal await), so it can never
    // overlap a normal concurrent caller. The guard exists to defend against
    // re-entrancy; drive that branch by setting the private in-progress flag.
    const svc = vaultCompactionService as unknown as { compactionInProgress: boolean };
    svc.compactionInProgress = true;
    try {
      await expect(vaultCompactionService.compact()).rejects.toThrow(/already in progress/);
    } finally {
      svc.compactionInProgress = false; // release so later tests aren't blocked
    }
  });

  it('returns an unsuccessful, no-op result on a non-web platform', async () => {
    platform.OS = 'android';
    const result = await vaultCompactionService.compact();
    expect(result.success).toBe(false);
    expect(result.entriesRemoved).toBe(0);
    expect(result.spaceSaved).toBe(0);
  });

  it('updates analyzeVault().lastCompactedAt after a compaction', async () => {
    localStorage.setItem(`${VP}deleted:a`, 'GONE');
    const result = await vaultCompactionService.compact();
    expect(vaultCompactionService.analyzeVault().lastCompactedAt).toBe(result.compactedAt);
  });

  it('trims persisted history to the most recent 100 records', async () => {
    // Seed 100 pre-existing records, then compact once more -> 101 in memory,
    // but saveHistory keeps only the last 100.
    const seed = Array.from({ length: 100 }, (_, i) => ({
      result: { compactedAt: i } as never,
      reason: 'seed',
      recordedAt: i,
    }));
    localStorage.setItem('usbvault:compaction_history', JSON.stringify(seed));

    localStorage.setItem(`${VP}deleted:a`, 'GONE');
    await vaultCompactionService.compact();

    const history = vaultCompactionService.getCompactionHistory();
    expect(history).toHaveLength(100);
    // Oldest seed record (recordedAt 0) was dropped; newest manual record is last.
    expect(history[history.length - 1].reason).toBe('manual_compaction');
    expect(history.some(h => h.recordedAt === 0)).toBe(false);
  });

  it('tolerates corrupt history JSON and treats it as empty', async () => {
    localStorage.setItem('usbvault:compaction_history', '{not json');
    expect(vaultCompactionService.getCompactionHistory()).toEqual([]);
  });
});

describe('compaction — getLastCompactionResult', () => {
  it('is null before any compaction', () => {
    expect(vaultCompactionService.getLastCompactionResult()).toBeNull();
  });

  it('returns the most recent result after multiple compactions', async () => {
    localStorage.setItem(`${VP}deleted:a`, 'GONE');
    const first = await vaultCompactionService.compact();
    localStorage.setItem(`${VP}deleted:b`, 'GONE2');
    const second = await vaultCompactionService.compact();

    // getLastCompactionResult returns the tail of history, i.e. the 2nd result.
    // The two results are structurally distinct (different before-state), so we
    // can assert identity without depending on the Date.now() millisecond.
    const last = vaultCompactionService.getLastCompactionResult();
    expect(vaultCompactionService.getCompactionHistory()).toHaveLength(2);
    expect(last).toEqual(second);
    expect(last).not.toEqual(first);
  });
});

describe('compaction — getStorageBreakdown', () => {
  it('categorizes entries by key pattern and sorts by descending size', () => {
    localStorage.setItem(`${VP}password_1`, 'P'.repeat(10));
    localStorage.setItem(`${VP}file_doc`, 'F'.repeat(30));
    localStorage.setItem(`${VP}message_1`, 'M'.repeat(5));
    localStorage.setItem(`${VP}random_thing`, 'O'.repeat(20)); // -> 'other'

    const breakdown = vaultCompactionService.getStorageBreakdown();
    const byCat = Object.fromEntries(breakdown.map(b => [b.category, b]));

    expect(byCat.files.size).toBe(30);
    expect(byCat.passwords.size).toBe(10);
    expect(byCat.messages.size).toBe(5);
    expect(byCat.other.size).toBe(20);

    // Sorted descending by size.
    const sizes = breakdown.map(b => b.size);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));

    // Percentages sum approximately to 100 and are integers.
    breakdown.forEach(b => expect(Number.isInteger(b.percentage)).toBe(true));
    expect(byCat.files.percentage).toBe(Math.round((30 / 65) * 100));
  });

  it('returns an empty breakdown when there are no entries', () => {
    expect(vaultCompactionService.getStorageBreakdown()).toEqual([]);
  });
});

describe('compaction — estimateCompactionTime', () => {
  it('returns the base minimum for a small vault', () => {
    const stats = { deletedEntries: 0, totalSize: 0 } as never;
    expect(vaultCompactionService.estimateCompactionTime(stats)).toBe(50);
  });

  it('scales with entry count and byte size beyond the base', () => {
    const stats = { deletedEntries: 1000, totalSize: 100000 } as never;
    // 1000*0.1 + 100000*0.001 = 100 + 100 = 200 (> base 50)
    expect(vaultCompactionService.estimateCompactionTime(stats)).toBe(200);
  });
});

describe('compaction — getCompactionPreview', () => {
  it('bundles stats, isNeeded, estimatedTime and breakdown without mutating storage', () => {
    localStorage.setItem(`${VP}live`, 'X'.repeat(50));
    localStorage.setItem(`${VP}deleted:a`, 'Y'.repeat(50));

    const preview = vaultCompactionService.getCompactionPreview();

    expect(preview.isNeeded).toBe(true);
    expect(preview.stats.fragmentationPercent).toBe(50);
    expect(preview.estimatedTime).toBeGreaterThanOrEqual(50);
    expect(Array.isArray(preview.breakdown)).toBe(true);
    // Storage untouched by a preview.
    expect(localStorage.getItem(`${VP}deleted:a`)).not.toBeNull();
  });
});

describe('compaction — compactIfNeeded', () => {
  it('returns null and performs no compaction when fragmentation is low', async () => {
    localStorage.setItem(`${VP}live`, 'X'.repeat(99));
    localStorage.setItem(`${VP}deleted:a`, 'Y');

    const result = await vaultCompactionService.compactIfNeeded();
    expect(result).toBeNull();
    expect(localStorage.getItem(`${VP}deleted:a`)).not.toBeNull();
    expect(vaultCompactionService.getCompactionHistory()).toHaveLength(0);
  });

  it('compacts and emits an auto-trigger audit event when fragmentation is high', async () => {
    localStorage.setItem(`${VP}live`, 'X'.repeat(50));
    localStorage.setItem(`${VP}deleted:a`, 'Y'.repeat(50));

    const result = await vaultCompactionService.compactIfNeeded();
    expect(result).not.toBeNull();
    expect(result?.entriesRemoved).toBe(1);

    const actions = (auditService.log as jest.Mock).mock.calls.map(c => c[0]);
    expect(actions).toContain('vault_auto_compaction_triggered');
  });
});
