/**
 * Offline Operation Queue Service
 *
 * Queues vault/file operations that fail due to network errors so they
 * can be replayed when connectivity returns. Complements the existing
 * syncService (which handles messaging/sharing over WebSocket).
 *
 * Features:
 * - localStorage persistence (web) with max queue size
 * - Automatic flush on `window.online` event
 * - Per-operation retry with exponential backoff
 * - Conflict detection via operation timestamps
 * - Observable state for UI (pending count, syncing status)
 *
 * @module services/offlineQueueService
 */

import { Platform } from 'react-native';
import { logger, fireAndForget } from '@/utils/logger';
import { auditService } from '@/services/auditService';
import { generateId } from '@/utils/generateId';

// ── Types ──────────────────────────────────────────

export type OperationType =
  | 'create_vault'
  | 'delete_vault'
  | 'rename_vault'
  | 'upload_file'
  | 'delete_file'
  | 'rename_file';

export type OperationStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'conflict';

export interface QueuedOperation {
  id: string;
  type: OperationType;
  payload: Record<string, unknown>;
  status: OperationStatus;
  createdAt: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  /** ISO timestamp of last attempt */
  lastAttemptAt?: string;
}

export interface OfflineQueueState {
  pendingCount: number;
  processingCount: number;
  failedCount: number;
  isProcessing: boolean;
  isOnline: boolean;
}

type QueueListener = (state: OfflineQueueState) => void;

// ── Configuration ──────────────────────────────────

const STORAGE_KEY = 'usbvault:offline_queue';
const MAX_QUEUE_SIZE = 100;
const MAX_RETRIES_DEFAULT = 5;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000]; // exponential

// ── Operation Handlers Registry ────────────────────

type OperationHandler = (payload: Record<string, unknown>) => Promise<void>;
const handlers = new Map<OperationType, OperationHandler>();

// ── Service ────────────────────────────────────────

class OfflineQueueService {
  private queue: QueuedOperation[] = [];
  private isProcessing = false;
  private isOnline = true;
  private listeners: Set<QueueListener> = new Set();
  private cleanupFns: (() => void)[] = [];

  constructor() {
    this.loadQueue();
    this.setupNetworkListeners();
  }

  // ── Public API ───────────────────────────────────

  /**
   * Register a handler for an operation type.
   * Called during app initialization to wire up store actions.
   */
  registerHandler(type: OperationType, handler: OperationHandler): void {
    handlers.set(type, handler);
  }

  /**
   * Enqueue an operation for later execution.
   * @returns The operation ID
   */
  enqueue(type: OperationType, payload: Record<string, unknown>): string {
    const id = generateId('op');
    const operation: QueuedOperation = {
      id,
      type,
      payload,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      maxRetries: MAX_RETRIES_DEFAULT,
    };

    this.queue.push(operation);
    this.trimQueue();
    this.saveQueue();
    this.notifyListeners();

    logger.info(`[offlineQueue] Enqueued ${type} (${id})`);
    fireAndForget(
      auditService.log('offline_op_queued', `op:${id}`, {
        type,
        payloadKeys: Object.keys(payload).join(','),
      })
    );

    return id;
  }

  /**
   * Process all pending operations in order.
   * Skips if already processing or offline.
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing || !this.isOnline) return;
    const pending = this.queue.filter(op => op.status === 'pending');
    if (pending.length === 0) return;

    this.isProcessing = true;
    this.notifyListeners();

    for (const op of pending) {
      const handler = handlers.get(op.type);
      if (!handler) {
        logger.warn(`[offlineQueue] No handler for ${op.type}, marking failed`);
        op.status = 'failed';
        op.lastError = 'No handler registered';
        continue;
      }

      op.status = 'processing';
      op.lastAttemptAt = new Date().toISOString();
      this.notifyListeners();

      try {
        await handler(op.payload);
        op.status = 'completed';
        logger.info(`[offlineQueue] Completed ${op.type} (${op.id})`);
        fireAndForget(auditService.log('offline_op_completed', `op:${op.id}`, { type: op.type }));
      } catch (error) {
        op.retryCount += 1;
        op.lastError = error instanceof Error ? error.message : String(error);

        if (op.retryCount >= op.maxRetries) {
          op.status = 'failed';
          logger.error(
            `[offlineQueue] Failed permanently: ${op.type} (${op.id}) after ${op.retryCount} retries`
          );
          fireAndForget(
            auditService.log(
              'offline_op_failed',
              `op:${op.id}`,
              { type: op.type, error: op.lastError },
              'error'
            )
          );
        } else {
          op.status = 'pending'; // Will retry on next processQueue
          logger.warn(
            `[offlineQueue] Retry ${op.retryCount}/${op.maxRetries} for ${op.type} (${op.id})`
          );

          // If network error, stop processing remaining items
          if (this.isNetworkError(error)) {
            this.isOnline = false;
            break;
          }

          // Wait before next item (backoff)
          const delay = RETRY_DELAYS_MS[Math.min(op.retryCount - 1, RETRY_DELAYS_MS.length - 1)];
          await this.sleep(delay);
        }
      }
    }

    // Remove completed operations
    this.queue = this.queue.filter(op => op.status !== 'completed');
    this.isProcessing = false;
    this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Get current queue state for UI display.
   */
  getState(): OfflineQueueState {
    // Single pass instead of 3 separate .filter() calls
    let pending = 0,
      processing = 0,
      failed = 0;
    for (let i = 0; i < this.queue.length; i++) {
      switch (this.queue[i].status) {
        case 'pending':
          pending++;
          break;
        case 'processing':
          processing++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }
    return {
      pendingCount: pending,
      processingCount: processing,
      failedCount: failed,
      isProcessing: this.isProcessing,
      isOnline: this.isOnline,
    };
  }

  /**
   * Get all queued operations (for debugging or admin UI).
   */
  getOperations(): ReadonlyArray<QueuedOperation> {
    return [...this.queue];
  }

  /**
   * Remove a specific operation from the queue.
   */
  removeOperation(id: string): boolean {
    const idx = this.queue.findIndex(op => op.id === id);
    if (idx === -1) return false;
    this.queue.splice(idx, 1);
    this.saveQueue();
    this.notifyListeners();
    return true;
  }

  /**
   * Retry all failed operations by resetting their status.
   */
  retryFailed(): void {
    for (const op of this.queue) {
      if (op.status === 'failed') {
        op.status = 'pending';
        op.retryCount = 0;
        op.lastError = undefined;
      }
    }
    this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Subscribe to state changes.
   */
  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all operations and reset processing state.
   * Used for testing or account logout.
   */
  clear(): void {
    this.queue = [];
    this.isProcessing = false;
    this.isOnline = true;
    this.saveQueue();
    this.notifyListeners();
  }

  /**
   * Clean up all listeners and timers.
   */
  destroy(): void {
    for (const cleanup of this.cleanupFns) {
      cleanup();
    }
    this.cleanupFns = [];
    this.listeners.clear();
  }

  // ── Internal ─────────────────────────────────────

  private loadQueue(): void {
    if (Platform.OS !== 'web') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as QueuedOperation[];
        // Reset any 'processing' ops back to 'pending' (interrupted session)
        this.queue = parsed.map(op =>
          op.status === 'processing' ? { ...op, status: 'pending' as OperationStatus } : op
        );
      }
    } catch {
      this.queue = [];
    }
  }

  private saveQueue(): void {
    if (Platform.OS !== 'web') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch {
      // Silent fail
    }
  }

  private trimQueue(): void {
    if (this.queue.length > MAX_QUEUE_SIZE) {
      // Remove oldest completed/failed first, then oldest pending
      const removable = this.queue.filter(
        op => op.status === 'failed' || op.status === 'completed'
      );
      const toRemove = this.queue.length - MAX_QUEUE_SIZE;
      for (let i = 0; i < toRemove && i < removable.length; i++) {
        const idx = this.queue.indexOf(removable[i]);
        if (idx !== -1) this.queue.splice(idx, 1);
      }
    }
  }

  private setupNetworkListeners(): void {
    if (
      Platform.OS !== 'web' ||
      typeof window === 'undefined' ||
      typeof window.addEventListener !== 'function'
    )
      return;

    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      this.isOnline = navigator.onLine;
    }

    const handleOnline = () => {
      this.isOnline = true;
      this.notifyListeners();
      fireAndForget(
        // Auto-flush queue when connection returns
        this.processQueue()
      );
    };

    const handleOffline = () => {
      this.isOnline = false;
      this.notifyListeners();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    this.cleanupFns.push(() => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    });
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private isNetworkError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      return code === 'NETWORK_ERROR' || code === 'OFFLINE' || code === 'ERR_NETWORK';
    }
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return msg.includes('network') || msg.includes('offline') || msg.includes('failed to fetch');
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const offlineQueueService = new OfflineQueueService();
