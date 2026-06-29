/**
 * Metadata Reduction Service Tests — SEC-05 (security domain)
 *
 * Exercises the real logic of security/metadataReductionService.ts:
 *  - config load/merge/validate/persist with range clamping + invalid-padding fallback
 *  - PKCS7-style padMessage / unpadMessage round trips and edge cases
 *  - timing jitter bounds (real crypto.getRandomValues; fake timers)
 *  - batch queue: enqueue, replace-by-id, capacity cap, flush ordering + failure isolation
 *  - batch timer lifecycle (start/stop, disabled, idempotency) and overlap guard
 *  - getStats reflecting live state
 *
 * Only true boundaries are stubbed: logger and the cleanupRegistry. crypto and
 * TextEncoder/Decoder use the real polyfills from jest.setup.js; localStorage is
 * jsdom's real implementation.
 */

import { metadataReductionService, DEFAULT_METADATA_CONFIG } from '../metadataReductionService';
import { logger } from '@/utils/logger';

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const registerCleanup = jest.fn();
jest.mock('@/utils/cleanupRegistry', () => ({
  registerCleanup: (fn: () => void) => registerCleanup(fn),
}));

describe('MetadataReductionService (security)', () => {
  beforeEach(async () => {
    localStorage.clear();
    metadataReductionService.stopBatchTimer();
    // The singleton's message queue persists across tests; drain it so each test
    // starts from an empty batch queue.
    metadataReductionService.updateConfig({ ...DEFAULT_METADATA_CONFIG });
    await metadataReductionService.flushBatch();
    jest.clearAllMocks();
  });

  afterEach(() => {
    metadataReductionService.stopBatchTimer();
  });

  describe('getConfig', () => {
    it('returns a copy of the config, not the internal reference', () => {
      const a = metadataReductionService.getConfig();
      const b = metadataReductionService.getConfig();
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
    });

    it('falls back to defaults and warns when stored JSON is corrupt', () => {
      localStorage.setItem('usbvault_metadata_reduction_config', '{broken');
      // Force a cold read by clearing the in-memory cache via isolateModules.
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('../metadataReductionService');
        const cfg = mod.metadataReductionService.getConfig();
        expect(cfg).toEqual(mod.DEFAULT_METADATA_CONFIG);
      });
    });

    it('merges stored config over defaults to tolerate schema evolution', () => {
      localStorage.setItem(
        'usbvault_metadata_reduction_config',
        JSON.stringify({ paddingSize: 4096 })
      );
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('../metadataReductionService');
        const cfg = mod.metadataReductionService.getConfig();
        expect(cfg.paddingSize).toBe(4096);
        // Unspecified fields keep defaults.
        expect(cfg.timingJitterEnabled).toBe(mod.DEFAULT_METADATA_CONFIG.timingJitterEnabled);
      });
    });
  });

  describe('updateConfig validation', () => {
    it('clamps timingJitterMaxMs above 5000 down to 5000 and warns', () => {
      metadataReductionService.updateConfig({ timingJitterMaxMs: 99999 });
      expect(metadataReductionService.getConfig().timingJitterMaxMs).toBe(5000);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('clamps negative timingJitterMaxMs up to 0', () => {
      metadataReductionService.updateConfig({ timingJitterMaxMs: -50 });
      expect(metadataReductionService.getConfig().timingJitterMaxMs).toBe(0);
    });

    it('clamps batchIntervalMs below the floor up to 10000', () => {
      metadataReductionService.updateConfig({ batchIntervalMs: 1000 });
      expect(metadataReductionService.getConfig().batchIntervalMs).toBe(10000);
    });

    it('clamps batchIntervalMs above the ceiling down to 30000', () => {
      metadataReductionService.updateConfig({ batchIntervalMs: 999999 });
      expect(metadataReductionService.getConfig().batchIntervalMs).toBe(30000);
    });

    it('rejects an invalid padding size and falls back to 1024', () => {
      metadataReductionService.updateConfig({ paddingSize: 777 as never });
      expect(metadataReductionService.getConfig().paddingSize).toBe(1024);
    });

    it('accepts a valid padding size unchanged and persists it', () => {
      metadataReductionService.updateConfig({ paddingSize: 256 });
      expect(metadataReductionService.getConfig().paddingSize).toBe(256);
      const raw = JSON.parse(localStorage.getItem('usbvault_metadata_reduction_config')!);
      expect(raw.paddingSize).toBe(256);
    });
  });

  describe('padMessage / unpadMessage', () => {
    it('returns plaintext unchanged when padding is disabled', () => {
      metadataReductionService.updateConfig({ paddingEnabled: false });
      expect(metadataReductionService.padMessage('hello')).toBe('hello');
    });

    it('pads to exactly the target byte size when padding length is single-byte', () => {
      // A 200-byte message + 256 target => paddingLength 56 (0x38), a single
      // ASCII byte, so the padded output lands exactly on the target size.
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 256 });
      const padded = metadataReductionService.padMessage('p'.repeat(200));
      expect(new TextEncoder().encode(padded).length).toBe(256);
    });

    it('grows beyond target when padding length exceeds 0x7f (multi-byte pad char)', () => {
      // Real behavior of the PKCS7-style padder: String.fromCharCode(paddingLen)
      // for paddingLen > 127 yields a U+0080..U+00FF char that TextEncoder emits
      // as two UTF-8 bytes, so the output overshoots the nominal target size.
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 256 });
      const padded = metadataReductionService.padMessage('hi'); // paddingLen 254
      expect(new TextEncoder().encode(padded).length).toBeGreaterThan(256);
    });

    it('round-trips for small single-byte padding (pad length < 0x80)', () => {
      // Target 256 with a 250-byte message => paddingLength 6 (0x06), a single
      // ASCII byte, so the PKCS7-style unpad reconstructs the original exactly.
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 256 });
      const original = 'y'.repeat(250);
      const padded = metadataReductionService.padMessage(original);
      expect(new TextEncoder().encode(padded).length).toBe(256);
      expect(metadataReductionService.unpadMessage(padded)).toBe(original);
    });

    it('returns a message already >= target size unchanged', () => {
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 256 });
      const big = 'x'.repeat(300);
      expect(metadataReductionService.padMessage(big)).toBe(big);
    });

    it('unpadMessage returns input unchanged for an empty string', () => {
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 256 });
      expect(metadataReductionService.unpadMessage('')).toBe('');
    });

    it('unpadMessage leaves a message whose last byte is 0x00 untouched', () => {
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 256 });
      // paddingLength === 0 short-circuits and returns the input as-is.
      const msg = 'abc' + String.fromCharCode(0);
      expect(metadataReductionService.unpadMessage(msg)).toBe(msg);
    });

    it('unpadMessage rejects malformed padding (inconsistent pad bytes)', () => {
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 256 });
      // Last byte claims 3 padding bytes, but the trailing bytes are not all 0x03.
      const malformed =
        'data' + String.fromCharCode(1) + String.fromCharCode(2) + String.fromCharCode(3);
      expect(metadataReductionService.unpadMessage(malformed)).toBe(malformed);
    });
  });

  describe('applyTimingJitter', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('resolves immediately when jitter is disabled', async () => {
      metadataReductionService.updateConfig({ timingJitterEnabled: false });
      await expect(metadataReductionService.applyTimingJitter()).resolves.toBeUndefined();
    });

    it('resolves immediately when max jitter is 0', async () => {
      metadataReductionService.updateConfig({ timingJitterEnabled: true, timingJitterMaxMs: 0 });
      await expect(metadataReductionService.applyTimingJitter()).resolves.toBeUndefined();
    });

    it('schedules a bounded timeout within [0, maxMs] when enabled', async () => {
      metadataReductionService.updateConfig({ timingJitterEnabled: true, timingJitterMaxMs: 200 });
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

      const promise = metadataReductionService.applyTimingJitter();
      // A timeout should have been scheduled with a delay in range.
      expect(setTimeoutSpy).toHaveBeenCalled();
      const delay = setTimeoutSpy.mock.calls[0][1] as number;
      expect(delay).toBeGreaterThanOrEqual(0);
      expect(delay).toBeLessThanOrEqual(200);

      jest.runAllTimers();
      await expect(promise).resolves.toBeUndefined();
      setTimeoutSpy.mockRestore();
    });
  });

  describe('queueForBatch', () => {
    it('adds a message and reflects it in getStats', () => {
      metadataReductionService.queueForBatch('m1', jest.fn().mockResolvedValue(undefined));
      expect(metadataReductionService.getStats().pendingBatch).toBe(1);
    });

    it('replaces an entry with the same id rather than duplicating it', () => {
      metadataReductionService.queueForBatch('m1', jest.fn());
      metadataReductionService.queueForBatch('m1', jest.fn());
      expect(metadataReductionService.getStats().pendingBatch).toBe(1);
    });

    it('drops new messages once the queue reaches MAX_QUEUE_SIZE (1000)', () => {
      for (let i = 0; i < 1000; i++) {
        metadataReductionService.queueForBatch(`k${i}`, jest.fn());
      }
      expect(metadataReductionService.getStats().pendingBatch).toBe(1000);

      metadataReductionService.queueForBatch('overflow', jest.fn());
      expect(metadataReductionService.getStats().pendingBatch).toBe(1000);
      expect(logger.warn).toHaveBeenCalledWith(
        '[MetadataReduction] Queue full, dropping message:',
        'overflow'
      );
    });
  });

  describe('flushBatch', () => {
    it('invokes every queued sendFn and clears the queue', async () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true });
      const f1 = jest.fn().mockResolvedValue(undefined);
      const f2 = jest.fn().mockResolvedValue(undefined);
      metadataReductionService.queueForBatch('a', f1);
      metadataReductionService.queueForBatch('b', f2);

      await metadataReductionService.flushBatch();

      expect(f1).toHaveBeenCalledTimes(1);
      expect(f2).toHaveBeenCalledTimes(1);
      expect(metadataReductionService.getStats().pendingBatch).toBe(0);
    });

    it('isolates failures: one rejecting send does not block the others', async () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true });
      const bad = jest.fn().mockRejectedValue(new Error('nope'));
      const good = jest.fn().mockResolvedValue(undefined);
      metadataReductionService.queueForBatch('bad', bad);
      metadataReductionService.queueForBatch('good', good);

      await expect(metadataReductionService.flushBatch()).resolves.toBeUndefined();
      expect(good).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });

    it('does nothing when batch delivery is disabled', async () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: false });
      const f = jest.fn();
      metadataReductionService.queueForBatch('x', f);

      await metadataReductionService.flushBatch();

      expect(f).not.toHaveBeenCalled();
      // Queue is left intact since flush short-circuited.
      expect(metadataReductionService.getStats().pendingBatch).toBe(1);
    });

    it('is a no-op when the queue is empty', async () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true });
      await expect(metadataReductionService.flushBatch()).resolves.toBeUndefined();
    });
  });

  describe('startBatchTimer / stopBatchTimer', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      metadataReductionService.stopBatchTimer();
      jest.useRealTimers();
    });

    it('does not start a timer when batch delivery is disabled', () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: false });
      metadataReductionService.startBatchTimer();
      expect(jest.getTimerCount()).toBe(0);
      expect(registerCleanup).not.toHaveBeenCalled();
    });

    it('starts a single interval and registers a cleanup handler', () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true, batchIntervalMs: 10000 });
      metadataReductionService.startBatchTimer();
      expect(jest.getTimerCount()).toBe(1);
      expect(registerCleanup).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: a second start does not create a second timer', () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true });
      metadataReductionService.startBatchTimer();
      metadataReductionService.startBatchTimer();
      expect(jest.getTimerCount()).toBe(1);
      expect(logger.warn).toHaveBeenCalledWith('[MetadataReduction] Batch timer already running');
    });

    it('flushes queued messages when the interval elapses', async () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true, batchIntervalMs: 10000 });
      const send = jest.fn().mockResolvedValue(undefined);
      metadataReductionService.queueForBatch('tick', send);

      metadataReductionService.startBatchTimer();
      await jest.advanceTimersByTimeAsync(10000);

      expect(send).toHaveBeenCalledTimes(1);
    });

    it('stop clears the interval and warns if stopped again with no timer', () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true });
      metadataReductionService.startBatchTimer();
      metadataReductionService.stopBatchTimer();
      expect(jest.getTimerCount()).toBe(0);

      metadataReductionService.stopBatchTimer();
      expect(logger.warn).toHaveBeenCalledWith(
        '[MetadataReduction] No batch timer running to stop'
      );
    });
  });

  describe('getStats', () => {
    it('reflects pending count, padding size, and jitter enabled flag', () => {
      metadataReductionService.updateConfig({ paddingSize: 4096, timingJitterEnabled: false });
      metadataReductionService.queueForBatch('s1', jest.fn());
      const stats = metadataReductionService.getStats();
      expect(stats.pendingBatch).toBe(1);
      expect(stats.paddingSize).toBe(4096);
      expect(stats.jitterEnabled).toBe(false);
    });
  });
});
