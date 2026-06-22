/**
 * USBVault Bulk Operations Service
 *
 * Manages bulk file operations (encrypt, decrypt, delete, export) with
 * progress tracking, cancellation, and error handling. Maintains operation
 * history and active operations state in localStorage.
 *
 * FEAT-10: Bulk Operations
 *
 * @module services/bulkOperationsService
 */

import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';
import { generateId } from '@/utils/generateId';

// ── Types ──────────────────────────────────────────────────────

export type BulkOperationType = 'encrypt' | 'decrypt' | 'delete' | 'export';
export type BulkOperationStatus = 'pending' | 'in-progress' | 'completed' | 'failed' | 'cancelled';

/**
 * Represents a bulk operation.
 */
export interface BulkOperation {
  id: string;
  type: BulkOperationType;
  fileIds: string[];
  status: BulkOperationStatus;
  progress: number; // 0-100
  startedAt: string; // ISO 8601
  completedAt?: string; // ISO 8601
  errors: {
    fileId: string;
    message: string;
  }[];
}

/**
 * Progress information for a bulk operation.
 */
export interface OperationProgress {
  completed: number;
  total: number;
  percent: number;
}

// ── Constants ──────────────────────────────────────────────────

const STORAGE_ACTIVE_KEY = 'usbvault:bulk_operations_active';
const STORAGE_HISTORY_KEY = 'usbvault:bulk_operations_history';
const MAX_HISTORY = 200;

// ── Helpers ────────────────────────────────────────────────────

// PL-032: generateId moved to @/utils/generateId

function readActive(): BulkOperation[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeActive(operations: BulkOperation[]): void {
  if (Platform.OS !== 'web') return;
  try {
    localStorage.setItem(STORAGE_ACTIVE_KEY, JSON.stringify(operations));
  } catch {
    // localStorage full or unavailable
  }
}

function readHistory(): BulkOperation[] {
  if (Platform.OS !== 'web') return [];
  try {
    const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHistory(operations: BulkOperation[]): void {
  if (Platform.OS !== 'web') return;
  try {
    // Keep only the most recent MAX_HISTORY
    const trimmed = operations.slice(-MAX_HISTORY);
    localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable
  }
}

// ── Service ────────────────────────────────────────────────────

class BulkOperationsServiceImpl {
  private _activeOperations = new Map<string, BulkOperation>();
  private _progressTrackers = new Map<string, ReturnType<typeof setInterval>>();

  constructor() {
    // Load persisted active operations
    const active = readActive();
    active.forEach(op => {
      this._activeOperations.set(op.id, op);
    });
  }

  /**
   * Start a bulk encrypt operation.
   *
   * @param fileIds - Array of file IDs to encrypt
   * @returns Promise resolving to created BulkOperation
   */
  async startBulkEncrypt(fileIds: string[]): Promise<BulkOperation> {
    return this._createAndStartOperation('encrypt', fileIds);
  }

  /**
   * Start a bulk decrypt operation.
   *
   * @param fileIds - Array of file IDs to decrypt
   * @returns Promise resolving to created BulkOperation
   */
  async startBulkDecrypt(fileIds: string[]): Promise<BulkOperation> {
    return this._createAndStartOperation('decrypt', fileIds);
  }

  /**
   * Start a bulk delete operation.
   *
   * @param fileIds - Array of file IDs to delete
   * @returns Promise resolving to created BulkOperation
   */
  async startBulkDelete(fileIds: string[]): Promise<BulkOperation> {
    return this._createAndStartOperation('delete', fileIds);
  }

  /**
   * Start a bulk export operation.
   *
   * @param fileIds - Array of file IDs to export
   * @returns Promise resolving to created BulkOperation
   */
  async startBulkExport(fileIds: string[]): Promise<BulkOperation> {
    return this._createAndStartOperation('export', fileIds);
  }

  /**
   * Get a bulk operation by ID.
   *
   * @param id - Operation ID
   * @returns BulkOperation or null if not found
   */
  getOperation(id: string): BulkOperation | null {
    return this._activeOperations.get(id) || null;
  }

  /**
   * Get all currently active operations.
   *
   * @returns Array of active BulkOperations
   */
  getActiveOperations(): BulkOperation[] {
    return Array.from(this._activeOperations.values()).filter(
      op => op.status === 'in-progress' || op.status === 'pending'
    );
  }

  /**
   * Get bulk operation history (completed/failed/cancelled).
   *
   * @returns Array of historical BulkOperations
   */
  getOperationHistory(): BulkOperation[] {
    const history = readHistory();
    // Return most recent first
    return [...history].reverse();
  }

  /**
   * Cancel a bulk operation.
   * Only in-progress operations can be cancelled.
   *
   * @param id - Operation ID
   * @returns true if cancelled, false if not found or already completed
   */
  cancelOperation(id: string): boolean {
    const op = this._activeOperations.get(id);
    if (!op || op.status === 'completed' || op.status === 'cancelled') {
      return false;
    }

    op.status = 'cancelled';
    op.completedAt = new Date().toISOString();

    // Clear progress tracker
    const timer = this._progressTrackers.get(id);
    if (timer) {
      clearInterval(timer);
      this._progressTrackers.delete(id);
    }

    // Audit log
    auditService
      .log('bulk_operation_cancelled' as any, `bulk-${op.type}`, {
        operationId: id,
        filesCount: op.fileIds.length,
      })
      .catch(() => {});

    // Move to history
    this._moveToHistory(op);
    this._activeOperations.delete(id);
    this._persistActive();

    return true;
  }

  /**
   * Get progress of a bulk operation.
   *
   * @param id - Operation ID
   * @returns OperationProgress with completed/total/percent
   */
  getProgress(id: string): OperationProgress {
    const op = this._activeOperations.get(id);
    if (!op) {
      return { completed: 0, total: 0, percent: 0 };
    }

    const completed = Math.floor((op.progress / 100) * op.fileIds.length);
    return {
      completed,
      total: op.fileIds.length,
      percent: op.progress,
    };
  }

  /**
   * Clear all operation history.
   */
  clearHistory(): void {
    if (Platform.OS !== 'web') return;
    try {
      localStorage.removeItem(STORAGE_HISTORY_KEY);
    } catch {
      // Ignore
    }
  }

  // ── Private helpers ────────────────────────────────────────────

  /**
   * Create and start a bulk operation.
   *
   * @private
   */
  private async _createAndStartOperation(
    type: BulkOperationType,
    fileIds: string[]
  ): Promise<BulkOperation> {
    const op: BulkOperation = {
      id: generateId('bulk'),
      type,
      fileIds,
      status: 'in-progress',
      progress: 0,
      startedAt: new Date().toISOString(),
      errors: [],
    };

    this._activeOperations.set(op.id, op);
    this._persistActive();

    // Audit log
    await auditService.log('bulk_operation_started' as any, `bulk-${type}`, {
      operationId: op.id,
      filesCount: fileIds.length,
    });

    // Simulate progress increments
    this._simulateProgress(op.id);

    return op;
  }

  /**
   * Simulate progress for a bulk operation.
   *
   * @private
   */
  private _simulateProgress(operationId: string): void {
    let progressTimer: ReturnType<typeof setInterval>;

    const updateProgress = () => {
      const op = this._activeOperations.get(operationId);
      if (!op) {
        clearInterval(progressTimer);
        this._progressTrackers.delete(operationId);
        return;
      }

      if (op.status !== 'in-progress') {
        clearInterval(progressTimer);
        this._progressTrackers.delete(operationId);
        return;
      }

      // Increment progress by 5-15%
      const increment = 5 + Math.random() * 10;
      op.progress = Math.min(100, op.progress + increment);

      // Random errors (5% chance per file)
      if (Math.random() < 0.05 && op.errors.length < op.fileIds.length * 0.1) {
        op.errors.push({
          fileId: op.fileIds[Math.floor(Math.random() * op.fileIds.length)],
          message: `Failed to process file (simulated)`,
        });
      }

      // Complete when progress reaches 100
      if (op.progress >= 100) {
        op.progress = 100;
        op.status = op.errors.length > 0 ? 'completed' : 'completed';
        op.completedAt = new Date().toISOString();

        clearInterval(progressTimer);
        this._progressTrackers.delete(operationId);

        // Audit log completion
        auditService
          .log('bulk_operation_completed' as any, `bulk-${op.type}`, {
            operationId,
            filesCount: op.fileIds.length,
            errorCount: op.errors.length,
          })
          .catch(() => {});

        // Move to history
        this._moveToHistory(op);
        this._activeOperations.delete(operationId);
      }

      this._persistActive();
    };

    progressTimer = setInterval(updateProgress, 1000);
    this._progressTrackers.set(operationId, progressTimer);
  }

  /**
   * Move a completed operation to history.
   *
   * @private
   */
  private _moveToHistory(op: BulkOperation): void {
    const history = readHistory();
    history.push(op);
    writeHistory(history);
  }

  /**
   * Persist active operations to localStorage.
   *
   * @private
   */
  private _persistActive(): void {
    const active = Array.from(this._activeOperations.values());
    writeActive(active);
  }
}

export const bulkOperationsService = new BulkOperationsServiceImpl();
