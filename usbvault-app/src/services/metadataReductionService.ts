/**
 * Metadata Reduction Service — SEC-05
 *
 * Implements timing jitter, message padding, and batch delivery
 * to reduce metadata leakage in communications.
 */

import { registerCleanup } from '@/stores/storeCleanup';

// ── Types ──

export interface MetadataConfig {
  stripExif: boolean;
  stripGps: boolean;
  stripAuthor: boolean;
  stripDates: boolean;
  timingJitterEnabled: boolean;
  timingJitterMaxMs: number;
  batchDeliveryEnabled: boolean;
  batchIntervalMs: number;
  paddingEnabled: boolean;
  paddingSize: number;
}

export const DEFAULT_METADATA_CONFIG: MetadataConfig = {
  stripExif: true,
  stripGps: true,
  stripAuthor: true,
  stripDates: true,
  timingJitterEnabled: false,
  timingJitterMaxMs: 1000,
  batchDeliveryEnabled: false,
  batchIntervalMs: 30000,
  paddingEnabled: false,
  paddingSize: 1024,
};

const VALID_PADDING_SIZES = [256, 1024, 4096, 16384];
const CONFIG_KEY = 'usbvault_metadata_reduction_config';

// ── Service ──

class MetadataReductionServiceImpl {
  private batchQueue: Map<string, () => Promise<void>> = new Map();
  private batchTimer: NodeJS.Timeout | null = null;

  async stripMetadata(file: Uint8Array, _config?: MetadataConfig): Promise<Uint8Array> {
    return file;
  }

  getConfig(): MetadataConfig {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        const merged = { ...DEFAULT_METADATA_CONFIG, ...stored };
        // Validate ranges
        if (merged.timingJitterMaxMs > 5000) merged.timingJitterMaxMs = 5000;
        if (merged.timingJitterMaxMs < 0) merged.timingJitterMaxMs = 0;
        if (merged.batchIntervalMs < 10000) merged.batchIntervalMs = 10000;
        if (!VALID_PADDING_SIZES.includes(merged.paddingSize)) {
          merged.paddingSize = 1024;
        }
        return merged;
      }
    } catch {
      // ignore
    }
    return { ...DEFAULT_METADATA_CONFIG };
  }

  updateConfig(config: Partial<MetadataConfig>): void {
    const current = this.getConfig();
    const updated = { ...current, ...config };

    // Validate ranges
    if (updated.timingJitterMaxMs > 5000) updated.timingJitterMaxMs = 5000;
    if (updated.timingJitterMaxMs < 0) updated.timingJitterMaxMs = 0;
    if (updated.batchIntervalMs < 10000) updated.batchIntervalMs = 10000;
    if (!VALID_PADDING_SIZES.includes(updated.paddingSize)) {
      // Find nearest valid size
      updated.paddingSize = VALID_PADDING_SIZES.reduce((prev, curr) =>
        Math.abs(curr - updated.paddingSize) < Math.abs(prev - updated.paddingSize) ? curr : prev
      );
    }

    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }

  /**
   * Apply timing jitter delay.
   */
  async applyTimingJitter(): Promise<void> {
    const config = this.getConfig();
    if (!config.timingJitterEnabled || config.timingJitterMaxMs <= 0) return;

    const delay = Math.floor(Math.random() * config.timingJitterMaxMs);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Pad a message to a target size.
   */
  padMessage(message: string): string {
    const config = this.getConfig();
    if (!config.paddingEnabled) return message;

    const messageBytes = new TextEncoder().encode(message);
    if (messageBytes.length >= config.paddingSize) return message;

    const paddingNeeded = config.paddingSize - messageBytes.length;
    const padding = '\0'.repeat(paddingNeeded);
    return message + padding;
  }

  /**
   * Remove padding from a message.
   */
  unpadMessage(message: string): string {
    if (!message) return message;
    // Remove trailing null characters
    return message.replace(/\0+$/, '');
  }

  /**
   * Queue a message for batch delivery.
   */
  queueForBatch(id: string, sendFn: () => Promise<void>): void {
    this.batchQueue.set(id, sendFn);
  }

  /**
   * Flush all queued messages.
   */
  async flushBatch(): Promise<void> {
    const config = this.getConfig();
    if (!config.batchDeliveryEnabled) {
      return;
    }

    const entries = Array.from(this.batchQueue.entries());
    this.batchQueue.clear();

    for (const [_id, sendFn] of entries) {
      try {
        await sendFn();
      } catch {
        // Continue with remaining messages
      }
    }
  }

  /**
   * Start the batch delivery timer.
   */
  startBatchTimer(): void {
    const config = this.getConfig();
    if (!config.batchDeliveryEnabled) return;

    this.stopBatchTimer();
    this.batchTimer = setInterval(() => this.flushBatch(), config.batchIntervalMs);

    // RELIABILITY FIX (M-4): Register cleanup to stop timer on logout
    registerCleanup(() => this.stopBatchTimer());
  }

  /**
   * Stop the batch delivery timer.
   */
  stopBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Get current statistics.
   */
  getStats(): { pendingBatch: number; paddingSize: number; jitterEnabled: boolean } {
    const config = this.getConfig();
    return {
      pendingBatch: this.batchQueue.size,
      paddingSize: config.paddingSize,
      jitterEnabled: config.timingJitterEnabled,
    };
  }
}

export const metadataReductionService = new MetadataReductionServiceImpl();
