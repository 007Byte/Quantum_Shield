// PH4-FIX: Consolidated into security domain
/**
 * Metadata Reduction Service — SEC-05 Implementation
 *
 * Implements metadata reduction techniques to minimize information leakage
 * through message timing, size patterns, and delivery metadata:
 *
 * - Timing Jitter: Random delays (0–5s) before sending to obscure timing patterns
 * - Batch Delivery: Accumulate messages for 10–30s and send together
 * - Fixed-Size Padding: PKCS7-style padding to 256B/1KB/4KB/16KB chunks
 *
 * Per-user configuration persisted to localStorage with key:
 * 'usbvault_metadata_reduction_config'
 *
 * SEC-05 Reference: https://github.com/usbvault/security-spec/SEC-05
 */

import { logger } from '@/utils/logger';

const STORAGE_KEY = 'usbvault_metadata_reduction_config';

/**
 * Configuration interface for metadata reduction techniques.
 * SEC-05: All settings are user-configurable and persisted per-user.
 */
export interface MetadataReductionConfig {
  /** Enable/disable timing jitter before message sends */
  timingJitterEnabled: boolean;
  /** Maximum jitter delay in milliseconds (0–5000) */
  timingJitterMaxMs: number;
  /** Enable/disable batch message delivery */
  batchDeliveryEnabled: boolean;
  /** Batch accumulation interval in milliseconds (10000–30000) */
  batchIntervalMs: number;
  /** Enable/disable fixed-size padding */
  paddingEnabled: boolean;
  /** Fixed padding size in bytes: 256, 1024, 4096, or 16384 */
  paddingSize: 256 | 1024 | 4096 | 16384;
}

/**
 * Default configuration with all metadata reduction techniques enabled.
 * SEC-05: Safe defaults that provide good privacy with reasonable performance.
 */
export const DEFAULT_METADATA_CONFIG: MetadataReductionConfig = {
  timingJitterEnabled: true,
  timingJitterMaxMs: 5000,
  batchDeliveryEnabled: true,
  batchIntervalMs: 15000, // 15s average between 10s and 30s
  paddingEnabled: true,
  paddingSize: 1024,
};

/**
 * Message entry in the batch queue.
 * Tracks pending sends for batch delivery.
 */
interface QueuedMessage {
  messageId: string;
  sendFn: () => Promise<void>;
  queuedAt: number;
}

/**
 * Metadata Reduction Service — SEC-05 Implementation
 *
 * Provides configurable methods to reduce metadata leakage through:
 * timing analysis, message size patterns, and delivery metadata.
 *
 * All configuration is per-user and persisted to localStorage.
 * SEC-05 Reference: https://github.com/usbvault/security-spec/SEC-05
 */
class MetadataReductionService {
  private config: MetadataReductionConfig | null = null;
  private messageQueue: Map<string, QueuedMessage> = new Map();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  /** PL-028: Guard to prevent overlapping batch flushes */
  private flushInFlight = false;

  /**
   * Load configuration from localStorage.
   * If not found, returns DEFAULT_METADATA_CONFIG without persisting.
   *
   * @returns Current metadata reduction configuration
   */
  getConfig(): MetadataReductionConfig {
    if (this.config !== null) {
      return { ...this.config };
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Merge with defaults to handle schema evolution
        this.config = { ...DEFAULT_METADATA_CONFIG, ...parsed };
      } else {
        this.config = { ...DEFAULT_METADATA_CONFIG };
      }
    } catch (err) {
      logger.warn('[MetadataReduction] Failed to load config from localStorage, using defaults:', err);
      this.config = { ...DEFAULT_METADATA_CONFIG };
    }

    return { ...this.config! };
  }

  /**
   * Update configuration and persist to localStorage.
   * Validates constraints (jitter 0–5000ms, batch 10000–30000ms, padding sizes).
   * SEC-05: Configuration changes are logged.
   *
   * @param partial Partial configuration update
   * @throws On validation errors (logged but does not throw)
   */
  updateConfig(partial: Partial<MetadataReductionConfig>): void {
    const current = this.getConfig();

    // Validate constraints
    if (partial.timingJitterMaxMs !== undefined) {
      if (partial.timingJitterMaxMs < 0 || partial.timingJitterMaxMs > 5000) {
        logger.warn('[MetadataReduction] timingJitterMaxMs out of range [0–5000]:', partial.timingJitterMaxMs);
        partial.timingJitterMaxMs = Math.max(0, Math.min(5000, partial.timingJitterMaxMs));
      }
    }

    if (partial.batchIntervalMs !== undefined) {
      if (partial.batchIntervalMs < 10000 || partial.batchIntervalMs > 30000) {
        logger.warn('[MetadataReduction] batchIntervalMs out of range [10000–30000]:', partial.batchIntervalMs);
        partial.batchIntervalMs = Math.max(10000, Math.min(30000, partial.batchIntervalMs));
      }
    }

    if (partial.paddingSize !== undefined) {
      const validSizes = [256, 1024, 4096, 16384];
      if (!validSizes.includes(partial.paddingSize)) {
        logger.warn('[MetadataReduction] paddingSize not in [256, 1024, 4096, 16384]:', partial.paddingSize);
        partial.paddingSize = 1024; // fallback to default
      }
    }

    // Merge and persist
    const updated = { ...current, ...partial };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      this.config = updated;
      logger.log('[MetadataReduction] Configuration updated:', Object.keys(partial).join(', '));
    } catch (err) {
      logger.error('[MetadataReduction] Failed to persist config:', err);
    }
  }

  /**
   * Apply timing jitter by sleeping for a random delay.
   * SEC-05: Uses crypto.getRandomValues() for cryptographically secure randomness.
   *
   * If jitter is disabled or maxMs is 0, resolves immediately.
   *
   * @returns Promise that resolves after jitter delay
   */
  async applyTimingJitter(): Promise<void> {
    const cfg = this.getConfig();

    if (!cfg.timingJitterEnabled || cfg.timingJitterMaxMs === 0) {
      return;
    }

    // Use crypto.getRandomValues() for cryptographically secure random number
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    const randomValue = randomBytes[0];

    // Normalize to [0, maxMs] using rejection sampling to avoid modulo bias
    const range = cfg.timingJitterMaxMs + 1;
    const maxUnbiased = Math.floor(0x100000000 / range) * range;
    let jitterMs = randomValue;
    while (jitterMs >= maxUnbiased) {
      crypto.getRandomValues(randomBytes);
      jitterMs = randomBytes[0];
    }
    jitterMs = jitterMs % range;

    return new Promise((resolve) => {
      setTimeout(resolve, jitterMs);
    });
  }

  /**
   * Pad plaintext to fixed size using PKCS7-style padding.
   * SEC-05: Fixed-size padding obscures message size patterns.
   *
   * Padding is added as repeated bytes equal to the padding length.
   * If plaintext is already at or exceeds target size, it is returned as-is.
   *
   * @param plaintext Message to pad
   * @returns Padded message (fixed size or larger if plaintext is large)
   */
  padMessage(plaintext: string): string {
    const cfg = this.getConfig();

    if (!cfg.paddingEnabled) {
      return plaintext;
    }

    const targetSize = cfg.paddingSize;
    const textBytes = new TextEncoder().encode(plaintext);

    if (textBytes.length >= targetSize) {
      // Message is already at or larger than target; return as-is
      return plaintext;
    }

    const paddingLength = targetSize - textBytes.length;
    const paddingChar = String.fromCharCode(paddingLength & 0xff);
    const padding = paddingChar.repeat(paddingLength);

    return plaintext + padding;
  }

  /**
   * Remove PKCS7-style padding from a padded message.
   * SEC-05: Inverse of padMessage().
   *
   * Reads the last byte as padding length and removes that many bytes.
   * If the message has no padding or padding is malformed, returns as-is.
   *
   * @param padded Message with potential PKCS7 padding
   * @returns Unpadded message (original plaintext)
   */
  unpadMessage(padded: string): string {
    const cfg = this.getConfig();

    if (!cfg.paddingEnabled || padded.length === 0) {
      return padded;
    }

    const textBytes = new TextEncoder().encode(padded);
    const lastByte = textBytes[textBytes.length - 1];
    const paddingLength = lastByte & 0xff;

    // Sanity check: padding should not exceed message length
    if (paddingLength === 0 || paddingLength > textBytes.length) {
      return padded;
    }

    // Verify PKCS7: all padding bytes should equal paddingLength
    for (let i = 0; i < paddingLength; i++) {
      if ((textBytes[textBytes.length - 1 - i] & 0xff) !== paddingLength) {
        return padded; // Invalid padding format
      }
    }

    // Remove padding and decode back to string
    const unpadded = textBytes.slice(0, textBytes.length - paddingLength);
    return new TextDecoder().decode(unpadded);
  }

  /**
   * Queue a message for batch delivery.
   * SEC-05: Batch delivery obscures individual message timing.
   *
   * Messages are accumulated and sent together on the next flush.
   * If a message with the same ID is already queued, it is replaced.
   *
   * @param messageId Unique identifier for the message
   * @param sendFn Async function that performs the actual send
   */
  /** PL-029: Maximum queue size to prevent unbounded memory growth */
  private static readonly MAX_QUEUE_SIZE = 1000;

  queueForBatch(messageId: string, sendFn: () => Promise<void>): void {
    // PL-029: Reject new entries when queue is at capacity
    if (this.messageQueue.size >= MetadataReductionService.MAX_QUEUE_SIZE && !this.messageQueue.has(messageId)) {
      logger.warn('[MetadataReduction] Queue full, dropping message:', messageId);
      return;
    }

    const now = Date.now();
    this.messageQueue.set(messageId, {
      messageId,
      sendFn,
      queuedAt: now,
    });

    logger.debug('[MetadataReduction] Message queued for batch:', messageId, `(queue size: ${this.messageQueue.size})`);
  }

  /**
   * Flush and send all queued messages.
   * SEC-05: Batch sends reduce per-message metadata leakage.
   *
   * All queued sends are executed in parallel. Failures are logged.
   * Queue is cleared regardless of send success/failure.
   *
   * @returns Promise that resolves when all sends complete
   */
  async flushBatch(): Promise<void> {
    const cfg = this.getConfig();

    if (!cfg.batchDeliveryEnabled || this.messageQueue.size === 0) {
      return;
    }

    const messages = Array.from(this.messageQueue.values());
    this.messageQueue.clear();

    logger.log('[MetadataReduction] Flushing batch with', messages.length, 'messages');

    const promises = messages.map(async (msg) => {
      try {
        await msg.sendFn();
        logger.debug('[MetadataReduction] Batch message sent:', msg.messageId);
      } catch (err) {
        logger.error('[MetadataReduction] Batch message send failed:', msg.messageId, err);
      }
    });

    await Promise.all(promises);
  }

  /**
   * Start the batch delivery timer.
   * SEC-05: Periodic flushing ensures messages are sent within batchIntervalMs.
   *
   * If already running, does nothing.
   * Timer is set to flushBatch() on the configured interval.
   */
  startBatchTimer(): void {
    const cfg = this.getConfig();

    if (this.batchTimer !== null) {
      logger.warn('[MetadataReduction] Batch timer already running');
      return;
    }

    if (!cfg.batchDeliveryEnabled) {
      logger.warn('[MetadataReduction] Batch delivery disabled, not starting timer');
      return;
    }

    // PL-028: Async interval guard — skip if previous flush still running
    this.batchTimer = setInterval(async () => {
      if (this.flushInFlight) return;
      this.flushInFlight = true;
      try {
        await this.flushBatch();
      } finally {
        this.flushInFlight = false;
      }
    }, cfg.batchIntervalMs);

    logger.log('[MetadataReduction] Batch timer started with interval:', cfg.batchIntervalMs, 'ms');
  }

  /**
   * Stop the batch delivery timer.
   * SEC-05: Call before shutdown or when batch delivery is no longer needed.
   *
   * If no timer is running, does nothing.
   * Note: Queued messages are NOT flushed; call flushBatch() first if needed.
   */
  stopBatchTimer(): void {
    if (this.batchTimer === null) {
      logger.warn('[MetadataReduction] No batch timer running to stop');
      return;
    }

    clearInterval(this.batchTimer);
    this.batchTimer = null;

    logger.log('[MetadataReduction] Batch timer stopped');
  }

  /**
   * Get current statistics about the batch queue and configuration.
   * SEC-05: Provides diagnostic information without exposing message contents.
   *
   * @returns Object with pendingBatch count, paddingSize, and jitterEnabled status
   */
  getStats(): { pendingBatch: number; paddingSize: number; jitterEnabled: boolean } {
    const cfg = this.getConfig();

    return {
      pendingBatch: this.messageQueue.size,
      paddingSize: cfg.paddingSize,
      jitterEnabled: cfg.timingJitterEnabled,
    };
  }
}

/**
 * Singleton instance of MetadataReductionService.
 * SEC-05: Use this for all metadata reduction operations.
 */
export const metadataReductionService = new MetadataReductionService();
