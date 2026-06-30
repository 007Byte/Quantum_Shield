/**
 * Billing Domain Tests — Extended Coverage
 *
 * Complements tierService.test.ts (which covers the tier/feature-gate section).
 * This suite targets the UNCOVERED parts of services/billing/billing.ts:
 *   - Tier branches the existing suite misses: server-sourced tier precedence in
 *     getCurrentTier(), and the localStorage-throw error paths in
 *     getCurrentTier()/setCurrentTier().
 *   - The entire Receipt Timing Obfuscation sub-service (SEC-09): preferences
 *     read/merge/write, scheduling with and without delay, the enabled=false
 *     fast path, pending-receipt bookkeeping, batching (with/without sync), and
 *     flush (including timer cancellation and per-receipt error capture).
 *
 * Boundaries mocked: Platform (forced to 'web' so the localStorage-backed code
 * runs), auditService, logger, and timers (jest fake timers for setTimeout).
 * crypto.getRandomValues is real (jest.setup webcrypto), exercising the actual
 * rejection-sampling secureRandomInt used to pick the obfuscation delay.
 */

import { tierService, receiptService, ReceiptPreferences } from '../billing';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  let throwOnAccess = false;
  return {
    getItem: (key: string) => {
      if (throwOnAccess) throw new Error('storage blocked');
      return store[key] || null;
    },
    setItem: (key: string, value: string) => {
      if (throwOnAccess) throw new Error('storage blocked');
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    __setThrow: (v: boolean) => {
      throwOnAccess = v;
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const PREFS_KEY = 'usbvault:receipt_prefs';
const PENDING_KEY = 'usbvault:pending_receipts';

describe('Billing domain — extended coverage', () => {
  beforeEach(() => {
    localStorage.clear();
    (localStorage as any).__setThrow(false);
    jest.clearAllMocks();
  });

  // ============================================================================
  // Tier service — branches not covered by tierService.test.ts
  // ============================================================================
  describe('tierService.getCurrentTier — server precedence & error handling', () => {
    it('prefers an explicit server-sourced tier over the client-cached one', () => {
      // Client cache says 'free', but the authoritative server tier is 'enterprise'.
      tierService.setCurrentTier('free');

      expect(tierService.getCurrentTier('enterprise')).toBe('enterprise');
      expect(tierService.getCurrentTier('pro')).toBe('pro');
    });

    it('ignores an invalid server-sourced tier and falls back to the cache', () => {
      tierService.setCurrentTier('pro');

      // An unrecognized server value is not trusted; the advisory cache wins.
      expect(tierService.getCurrentTier('platinum' as any)).toBe('pro');
    });

    it('returns free when reading the cached tier throws', () => {
      tierService.setCurrentTier('pro');
      (localStorage as any).__setThrow(true);

      expect(tierService.getCurrentTier()).toBe('free');
      const { logger } = require('@/utils/logger');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('tierService.setCurrentTier — error handling', () => {
    it('logs but does not throw when persistence fails', () => {
      (localStorage as any).__setThrow(true);

      expect(() => tierService.setCurrentTier('pro')).not.toThrow();
      const { logger } = require('@/utils/logger');
      expect(logger.error).toHaveBeenCalled();
    });

    it('audits a successful tier change', () => {
      const { auditService } = require('@/services/auditService');
      tierService.setCurrentTier('enterprise');

      expect(auditService.log).toHaveBeenCalledWith(
        'settings_change',
        '',
        expect.objectContaining({ setting: 'subscription_tier', newValue: 'enterprise' })
      );
    });
  });

  describe('tierService.getTierConfig — invalid tier fallback', () => {
    it('falls back to the free config for an unrecognized tier argument', () => {
      const config = tierService.getTierConfig('mystery' as any);
      expect(config.name).toBe('Free');
    });
  });

  // ============================================================================
  // Receipt service — preferences
  // ============================================================================
  describe('receiptService preferences', () => {
    it('returns the default preferences when nothing is stored', () => {
      const prefs = receiptService.getReceiptPreferences();
      expect(prefs).toEqual({
        enabled: true,
        randomDelay: true,
        minDelaySec: 1,
        maxDelaySec: 15,
        batchWithSync: true,
      });
    });

    it('merges a partial preference update over the defaults', () => {
      receiptService.setReceiptPreferences({ randomDelay: false, maxDelaySec: 5 });

      const prefs = receiptService.getReceiptPreferences();
      expect(prefs.randomDelay).toBe(false);
      expect(prefs.maxDelaySec).toBe(5);
      // Untouched fields keep their defaults.
      expect(prefs.enabled).toBe(true);
      expect(prefs.minDelaySec).toBe(1);

      const { auditService } = require('@/services/auditService');
      expect(auditService.log).toHaveBeenCalledWith(
        'settings_change',
        'receipt_prefs',
        expect.any(Object),
        'success'
      );
    });

    it('persists merged preferences across reads', () => {
      receiptService.setReceiptPreferences({ minDelaySec: 3 });
      receiptService.setReceiptPreferences({ maxDelaySec: 9 });

      const prefs = receiptService.getReceiptPreferences();
      expect(prefs.minDelaySec).toBe(3);
      expect(prefs.maxDelaySec).toBe(9);
    });

    it('falls back to defaults when stored preferences are corrupt JSON', () => {
      localStorage.setItem(PREFS_KEY, '{not valid json');

      const prefs = receiptService.getReceiptPreferences();
      expect(prefs.enabled).toBe(true);
      expect(prefs.maxDelaySec).toBe(15);
    });
  });

  // ============================================================================
  // Receipt service — scheduling
  // ============================================================================
  describe('receiptService scheduleReadReceipt', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('sends immediately (no pending entry) when receipts are disabled', async () => {
      receiptService.setReceiptPreferences({ enabled: false });

      await receiptService.scheduleReadReceipt('msg-disabled');

      // sendReceipt removes the id from pending; with the fast path nothing is queued.
      expect(receiptService.getPendingReceipts().some(r => r.messageId === 'msg-disabled')).toBe(
        false
      );
    });

    it('queues a pending receipt with an explicit delay and fires after the timeout', async () => {
      receiptService.setReceiptPreferences({ enabled: true });

      await receiptService.scheduleReadReceipt('msg-explicit', 4);

      // Before the timer fires the receipt is pending and scheduled.
      const pending = receiptService.getPendingReceipts();
      const entry = pending.find(r => r.messageId === 'msg-explicit');
      expect(entry).toBeDefined();
      expect(entry!.scheduledFor).toBeDefined();

      // Advance past the 4s delay; the timer callback removes it from pending.
      await jest.advanceTimersByTimeAsync(4000);
      expect(receiptService.getPendingReceipts().some(r => r.messageId === 'msg-explicit')).toBe(
        false
      );
    });

    it('picks a delay within [minDelaySec, maxDelaySec] when randomDelay is on', async () => {
      receiptService.setReceiptPreferences({
        enabled: true,
        randomDelay: true,
        minDelaySec: 2,
        maxDelaySec: 2, // pin the range so the secure RNG yields exactly 2s
      });

      await receiptService.scheduleReadReceipt('msg-random');

      const { auditService } = require('@/services/auditService');
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'receipt_scheduled',
        expect.objectContaining({ messageId: 'msg-random', delaySec: 2 }),
        'success'
      );
    });

    it('draws a secure random delay inside a real [min,max] range', async () => {
      // A genuine range (min < max) drives the rejection-sampling RNG path in
      // secureRandomInt (not the min===max early return). The chosen delay must
      // land within bounds and the scheduled timer must fire there.
      receiptService.setReceiptPreferences({
        enabled: true,
        randomDelay: true,
        minDelaySec: 1,
        maxDelaySec: 15,
      });

      await receiptService.scheduleReadReceipt('msg-ranged');

      const { auditService } = require('@/services/auditService');
      const scheduledCall = auditService.log.mock.calls.find(
        (c: any[]) => c[1] === 'receipt_scheduled' && c[2]?.messageId === 'msg-ranged'
      );
      expect(scheduledCall).toBeDefined();
      const delaySec = scheduledCall[2].delaySec;
      expect(delaySec).toBeGreaterThanOrEqual(1);
      expect(delaySec).toBeLessThanOrEqual(15);

      // The pending receipt clears once its (in-range) timer fires.
      expect(receiptService.getPendingReceipts().some(r => r.messageId === 'msg-ranged')).toBe(
        true
      );
      await jest.advanceTimersByTimeAsync(15000);
      expect(receiptService.getPendingReceipts().some(r => r.messageId === 'msg-ranged')).toBe(
        false
      );
    });

    it('uses minDelaySec when randomDelay is off and no explicit delay is passed', async () => {
      receiptService.setReceiptPreferences({
        enabled: true,
        randomDelay: false,
        minDelaySec: 7,
        maxDelaySec: 30,
      });

      await receiptService.scheduleReadReceipt('msg-fixed');

      const { auditService } = require('@/services/auditService');
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'receipt_scheduled',
        expect.objectContaining({ messageId: 'msg-fixed', delaySec: 7 }),
        'success'
      );
    });

    it('replaces an existing timer when the same message is rescheduled', async () => {
      receiptService.setReceiptPreferences({ enabled: true });

      await receiptService.scheduleReadReceipt('msg-dup', 10);
      await receiptService.scheduleReadReceipt('msg-dup', 10);

      // Only one pending entry for the message id (the earlier one was replaced).
      const matches = receiptService.getPendingReceipts().filter(r => r.messageId === 'msg-dup');
      expect(matches).toHaveLength(1);
    });
  });

  // ============================================================================
  // Receipt service — batching & flushing
  // ============================================================================
  describe('receiptService batchReceipts', () => {
    it('flushes immediately when batchWithSync is disabled', async () => {
      receiptService.setReceiptPreferences({ batchWithSync: false });
      // Seed a pending receipt; flush should clear it.
      localStorage.setItem(
        PENDING_KEY,
        JSON.stringify([{ messageId: 'm1', sentAt: new Date().toISOString() }])
      );

      await receiptService.batchReceipts();

      expect(receiptService.getPendingReceipts()).toEqual([]);
    });

    it('defers (batches) without flushing when batchWithSync is enabled', async () => {
      receiptService.setReceiptPreferences({ batchWithSync: true });
      localStorage.setItem(
        PENDING_KEY,
        JSON.stringify([{ messageId: 'm-keep', sentAt: new Date().toISOString() }])
      );

      await receiptService.batchReceipts();

      // Batching does NOT flush; the pending receipt is retained for the sync window.
      expect(receiptService.getPendingReceipts().some(r => r.messageId === 'm-keep')).toBe(true);
      const { auditService } = require('@/services/auditService');
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'receipts_batched',
        expect.any(Object),
        'success'
      );
    });
  });

  describe('receiptService flushReceipts', () => {
    it('drains all pending receipts and records the flushed count', async () => {
      localStorage.setItem(
        PENDING_KEY,
        JSON.stringify([
          { messageId: 'a', sentAt: new Date().toISOString() },
          { messageId: 'b', sentAt: new Date().toISOString() },
        ])
      );

      await receiptService.flushReceipts();

      expect(receiptService.getPendingReceipts()).toEqual([]);
      const { auditService } = require('@/services/auditService');
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'receipts_flushed',
        expect.objectContaining({ count: 2, errors: 0 }),
        'success'
      );
    });

    it('cancels a scheduled timer for a pending receipt during flush', async () => {
      jest.useFakeTimers();
      try {
        receiptService.setReceiptPreferences({ enabled: true });
        await receiptService.scheduleReadReceipt('m-timer', 30);
        expect(receiptService.getPendingReceipts().some(r => r.messageId === 'm-timer')).toBe(true);

        await receiptService.flushReceipts();

        // Flush sends + clears; advancing time must NOT re-fire a cancelled timer.
        expect(receiptService.getPendingReceipts()).toEqual([]);
        await jest.advanceTimersByTimeAsync(60000);
        expect(receiptService.getPendingReceipts()).toEqual([]);
      } finally {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
      }
    });

    it('handles an empty pending list without error', async () => {
      await receiptService.flushReceipts();

      expect(receiptService.getPendingReceipts()).toEqual([]);
      const { auditService } = require('@/services/auditService');
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'receipts_flushed',
        expect.objectContaining({ count: 0, errors: 0 }),
        'success'
      );
    });
  });

  // ============================================================================
  // Receipt service — pending getter
  // ============================================================================
  describe('receiptService.getPendingReceipts', () => {
    it('returns an empty array when stored pending data is corrupt', () => {
      localStorage.setItem(PENDING_KEY, 'not-json');
      expect(receiptService.getPendingReceipts()).toEqual([]);
    });

    it('reflects directly-seeded pending receipts', () => {
      const seeded: { messageId: string; sentAt: string }[] = [
        { messageId: 'seed-1', sentAt: '2026-01-01T00:00:00.000Z' },
      ];
      localStorage.setItem(PENDING_KEY, JSON.stringify(seeded));

      const pending = receiptService.getPendingReceipts();
      expect(pending).toHaveLength(1);
      expect(pending[0].messageId).toBe('seed-1');
    });
  });

  // Type-level usage to keep the imported type referenced.
  it('ReceiptPreferences shape is honoured by getReceiptPreferences', () => {
    const prefs: ReceiptPreferences = receiptService.getReceiptPreferences();
    expect(typeof prefs.enabled).toBe('boolean');
    expect(typeof prefs.minDelaySec).toBe('number');
  });
});
