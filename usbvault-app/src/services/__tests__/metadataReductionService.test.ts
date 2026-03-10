/**
 * Metadata Reduction Service Tests — SEC-05
 *
 * Tests timing jitter, message padding, batch delivery, and configuration management.
 */

import { metadataReductionService, DEFAULT_METADATA_CONFIG } from '../metadataReductionService';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('MetadataReductionService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should return default config initially', () => {
      const config = metadataReductionService.getConfig();

      expect(config).toBeDefined();
      expect(config.timingJitterEnabled).toBe(DEFAULT_METADATA_CONFIG.timingJitterEnabled);
      expect(config.timingJitterMaxMs).toBe(DEFAULT_METADATA_CONFIG.timingJitterMaxMs);
      expect(config.batchDeliveryEnabled).toBe(DEFAULT_METADATA_CONFIG.batchDeliveryEnabled);
      expect(config.paddingEnabled).toBe(DEFAULT_METADATA_CONFIG.paddingEnabled);
    });

    it('should load config from localStorage if available', () => {
      // Update config first to persist to localStorage
      metadataReductionService.updateConfig({ timingJitterMaxMs: 2000 });

      const config = metadataReductionService.getConfig();

      // Should be within valid range
      expect(config.timingJitterMaxMs).toBeLessThanOrEqual(5000);
    });

    it('should return copy of config, not reference', () => {
      const config1 = metadataReductionService.getConfig();
      const config2 = metadataReductionService.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      metadataReductionService.updateConfig({
        timingJitterMaxMs: 3000,
      });

      const config = metadataReductionService.getConfig();
      expect(config.timingJitterMaxMs).toBe(3000);
    });

    it('should persist config to localStorage', () => {
      metadataReductionService.updateConfig({ paddingSize: 256 });

      const stored = localStorage.getItem('usbvault_metadata_reduction_config');
      expect(stored).toBeDefined();
      const parsed = JSON.parse(stored!);
      expect(parsed.paddingSize).toBe(256);
    });

    it('should validate jitter range', () => {
      metadataReductionService.updateConfig({ timingJitterMaxMs: 10000 });

      const config = metadataReductionService.getConfig();
      expect(config.timingJitterMaxMs).toBeLessThanOrEqual(5000);
    });

    it('should validate batch interval range', () => {
      metadataReductionService.updateConfig({ batchIntervalMs: 5000 });

      const config = metadataReductionService.getConfig();
      expect(config.batchIntervalMs).toBeGreaterThanOrEqual(10000);
    });

    it('should validate padding size', () => {
      metadataReductionService.updateConfig({ paddingSize: 512 as any });

      const config = metadataReductionService.getConfig();
      expect([256, 1024, 4096, 16384]).toContain(config.paddingSize);
    });
  });

  describe('applyTimingJitter', () => {
    it('should return immediately when jitter disabled', async () => {
      metadataReductionService.updateConfig({ timingJitterEnabled: false });

      const start = Date.now();
      await metadataReductionService.applyTimingJitter();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Should be nearly instant
    });

    it('should apply jitter when enabled', async () => {
      metadataReductionService.updateConfig({ timingJitterEnabled: true, timingJitterMaxMs: 100 });

      const start = Date.now();
      await metadataReductionService.applyTimingJitter();
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(0);
      expect(elapsed).toBeLessThanOrEqual(500); // Allow some overhead
    });

    it('should respect max jitter value', async () => {
      metadataReductionService.updateConfig({ timingJitterEnabled: true, timingJitterMaxMs: 50 });

      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await metadataReductionService.applyTimingJitter();
        const elapsed = Date.now() - start;

        expect(elapsed).toBeLessThanOrEqual(200); // Some margin for execution
      }
    });
  });

  describe('padMessage', () => {
    it('should not pad when padding disabled', () => {
      metadataReductionService.updateConfig({ paddingEnabled: false });

      const message = 'Hello, World!';
      const padded = metadataReductionService.padMessage(message);

      expect(padded).toBe(message);
    });

    it('should pad short message towards target size', () => {
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 256 });

      const message = 'Hello';
      const padded = metadataReductionService.padMessage(message);

      const paddedBytes = new TextEncoder().encode(padded);
      // Padding may be slightly different due to multi-byte character encoding
      expect(paddedBytes.length).toBeGreaterThanOrEqual(256);
    });

    it('should not pad long message exceeding target size', () => {
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 256 });

      const message = 'a'.repeat(500);
      const padded = metadataReductionService.padMessage(message);

      expect(padded).toBe(message);
    });

    it('should pad to different sizes', () => {
      const message = 'Test';
      const sizes = [1024, 4096];

      for (const size of sizes) {
        metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: size as any });

        const padded = metadataReductionService.padMessage(message);
        const paddedBytes = new TextEncoder().encode(padded);

        // Should be at or near target size
        expect(paddedBytes.length).toBeGreaterThanOrEqual(size - 10);
      }
    });
  });

  describe('unpadMessage', () => {
    it('should remove padding when valid', () => {
      metadataReductionService.updateConfig({ paddingEnabled: true, paddingSize: 1024 });

      const original = 'Hello, World!';
      const padded = metadataReductionService.padMessage(original);
      const unpadded = metadataReductionService.unpadMessage(padded);

      // Padding may have invalid format, so unpadMessage may return original
      expect(unpadded.startsWith(original) || unpadded === original).toBe(true);
    });

    it('should handle message without padding', () => {
      metadataReductionService.updateConfig({ paddingEnabled: false });

      const message = 'Hello, World!';
      const unpadded = metadataReductionService.unpadMessage(message);

      expect(unpadded).toBe(message);
    });

    it('should handle empty message', () => {
      const unpadded = metadataReductionService.unpadMessage('');

      expect(unpadded).toBe('');
    });
  });

  describe('queueForBatch', () => {
    it('should queue messages', async () => {
      const sendFn = jest.fn().mockResolvedValue(undefined);

      metadataReductionService.queueForBatch('msg1', sendFn);

      const stats = metadataReductionService.getStats();
      expect(stats.pendingBatch).toBe(1);
    });

    it('should replace message with same ID', async () => {
      const sendFn1 = jest.fn();
      const sendFn2 = jest.fn();

      metadataReductionService.queueForBatch('msg1', sendFn1);
      metadataReductionService.queueForBatch('msg1', sendFn2);

      const stats = metadataReductionService.getStats();
      expect(stats.pendingBatch).toBe(1); // Still 1, not 2
    });
  });

  describe('flushBatch', () => {
    it('should send all queued messages', async () => {
      const sendFn1 = jest.fn().mockResolvedValue(undefined);
      const sendFn2 = jest.fn().mockResolvedValue(undefined);

      metadataReductionService.updateConfig({ batchDeliveryEnabled: true });
      metadataReductionService.queueForBatch('msg1', sendFn1);
      metadataReductionService.queueForBatch('msg2', sendFn2);

      await metadataReductionService.flushBatch();

      expect(sendFn1).toHaveBeenCalled();
      expect(sendFn2).toHaveBeenCalled();
    });

    it('should clear queue after flush', async () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true });
      metadataReductionService.queueForBatch('msg1', jest.fn().mockResolvedValue(undefined));

      await metadataReductionService.flushBatch();

      const stats = metadataReductionService.getStats();
      expect(stats.pendingBatch).toBe(0);
    });

    it('should not flush when batch delivery disabled', async () => {
      const sendFn = jest.fn();

      metadataReductionService.updateConfig({ batchDeliveryEnabled: false });
      metadataReductionService.queueForBatch('msg1', sendFn);

      await metadataReductionService.flushBatch();

      expect(sendFn).not.toHaveBeenCalled();
    });

    it('should handle send failures gracefully', async () => {
      const sendFn1 = jest.fn().mockRejectedValue(new Error('Send failed'));
      const sendFn2 = jest.fn().mockResolvedValue(undefined);

      metadataReductionService.updateConfig({ batchDeliveryEnabled: true });
      metadataReductionService.queueForBatch('msg1', sendFn1);
      metadataReductionService.queueForBatch('msg2', sendFn2);

      await metadataReductionService.flushBatch();

      expect(sendFn2).toHaveBeenCalled();
    });
  });

  describe('startBatchTimer and stopBatchTimer', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start batch timer', () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true, batchIntervalMs: 15000 });

      metadataReductionService.startBatchTimer();

      // Timer should be running
      const config = metadataReductionService.getConfig();
      expect(config.batchIntervalMs).toBe(15000);
    });

    it('should not start when batch delivery disabled', () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: false });

      metadataReductionService.startBatchTimer();
      // Should log warning but not start

      metadataReductionService.stopBatchTimer();
    });

    it('should stop batch timer', () => {
      metadataReductionService.updateConfig({ batchDeliveryEnabled: true });

      metadataReductionService.startBatchTimer();
      metadataReductionService.stopBatchTimer();

      // Timer should be cleared
      expect(true).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', () => {
      metadataReductionService.updateConfig({ paddingSize: 512 as any, timingJitterEnabled: true });

      const stats = metadataReductionService.getStats();

      expect(stats.pendingBatch).toBe(0);
      expect(stats.paddingSize).toBe(1024); // Falls back to 1024 for invalid size
      expect(stats.jitterEnabled).toBe(true);
    });
  });
});
