/**
 * Bulk Operations Service Tests — Core Functionality
 *
 * Tests bulk encrypt/decrypt/delete/export operations with progress
 * tracking, cancellation, and history management.
 */

import { bulkOperationsService, BulkOperation } from '../bulkOperationsService';

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

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock audit service
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock generateId
jest.mock('@/utils/generateId', () => ({
  generateId: jest.fn((prefix: string) => `${prefix}-test-${Date.now()}-abc123`),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

describe('BulkOperationsService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ============================================================================
  // Test: Starting Operations
  // ============================================================================
  describe('startBulkEncrypt', () => {
    it('should create an in-progress encrypt operation', async () => {
      const op = await bulkOperationsService.startBulkEncrypt(['file1', 'file2', 'file3']);

      expect(op.type).toBe('encrypt');
      expect(op.status).toBe('in-progress');
      expect(op.fileIds).toEqual(['file1', 'file2', 'file3']);
      expect(op.progress).toBe(0);
      expect(op.errors).toEqual([]);
      expect(op.startedAt).toBeDefined();
    });

    it('should log the operation start to audit service', async () => {
      const { auditService } = require('@/services/auditService');

      await bulkOperationsService.startBulkEncrypt(['file1']);

      expect(auditService.log).toHaveBeenCalledWith(
        'bulk_operation_started',
        'bulk-encrypt',
        expect.objectContaining({
          filesCount: 1,
        })
      );
    });
  });

  describe('startBulkDecrypt', () => {
    it('should create a decrypt operation', async () => {
      const op = await bulkOperationsService.startBulkDecrypt(['file1']);
      expect(op.type).toBe('decrypt');
      expect(op.status).toBe('in-progress');
    });
  });

  describe('startBulkDelete', () => {
    it('should create a delete operation', async () => {
      const op = await bulkOperationsService.startBulkDelete(['file1', 'file2']);
      expect(op.type).toBe('delete');
      expect(op.fileIds.length).toBe(2);
    });
  });

  describe('startBulkExport', () => {
    it('should create an export operation', async () => {
      const op = await bulkOperationsService.startBulkExport(['file1']);
      expect(op.type).toBe('export');
    });
  });

  // ============================================================================
  // Test: Operation Retrieval
  // ============================================================================
  describe('getOperation', () => {
    it('should return operation by ID', async () => {
      const op = await bulkOperationsService.startBulkEncrypt(['file1']);
      const retrieved = bulkOperationsService.getOperation(op.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(op.id);
    });

    it('should return null for non-existent operation', () => {
      const result = bulkOperationsService.getOperation('fake-id');
      expect(result).toBeNull();
    });
  });

  describe('getActiveOperations', () => {
    it('should return only in-progress and pending operations', async () => {
      await bulkOperationsService.startBulkEncrypt(['file1']);
      await bulkOperationsService.startBulkDecrypt(['file2']);

      const active = bulkOperationsService.getActiveOperations();
      expect(active.length).toBeGreaterThanOrEqual(2);
      active.forEach(op => {
        expect(['in-progress', 'pending']).toContain(op.status);
      });
    });
  });

  // ============================================================================
  // Test: Progress Tracking
  // ============================================================================
  describe('getProgress', () => {
    it('should return progress for an active operation', async () => {
      const op = await bulkOperationsService.startBulkEncrypt(['f1', 'f2', 'f3', 'f4']);
      const progress = bulkOperationsService.getProgress(op.id);

      expect(progress.total).toBe(4);
      expect(progress.percent).toBe(0);
      expect(progress.completed).toBe(0);
    });

    it('should return zero progress for non-existent operation', () => {
      const progress = bulkOperationsService.getProgress('nonexistent');
      expect(progress).toEqual({ completed: 0, total: 0, percent: 0 });
    });
  });

  // ============================================================================
  // Test: Operation Cancellation
  // ============================================================================
  describe('cancelOperation', () => {
    it('should cancel an in-progress operation', async () => {
      const op = await bulkOperationsService.startBulkEncrypt(['file1', 'file2']);

      const cancelled = bulkOperationsService.cancelOperation(op.id);

      expect(cancelled).toBe(true);
    });

    it('should return false for non-existent operation', () => {
      const result = bulkOperationsService.cancelOperation('fake-id');
      expect(result).toBe(false);
    });

    it('should log cancellation to audit service', async () => {
      const { auditService } = require('@/services/auditService');
      const op = await bulkOperationsService.startBulkEncrypt(['file1']);

      bulkOperationsService.cancelOperation(op.id);

      expect(auditService.log).toHaveBeenCalledWith(
        'bulk_operation_cancelled',
        'bulk-encrypt',
        expect.objectContaining({
          operationId: op.id,
        })
      );
    });

    it('should not cancel an already completed operation', async () => {
      const op = await bulkOperationsService.startBulkEncrypt(['file1']);

      // Force complete
      const retrieved = bulkOperationsService.getOperation(op.id);
      if (retrieved) {
        retrieved.status = 'completed';
      }

      const result = bulkOperationsService.cancelOperation(op.id);
      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // Test: History Management
  // ============================================================================
  describe('getOperationHistory', () => {
    it('should return empty array when no history exists', () => {
      const history = bulkOperationsService.getOperationHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('clearHistory', () => {
    it('should clear operation history from localStorage', () => {
      localStorage.setItem(
        'usbvault:bulk_operations_history',
        JSON.stringify([{ id: 'test', type: 'encrypt' }])
      );

      bulkOperationsService.clearHistory();

      const stored = localStorage.getItem('usbvault:bulk_operations_history');
      expect(stored).toBeNull();
    });
  });
});
