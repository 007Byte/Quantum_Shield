import { offlineQueueService } from '../offlineQueueService';
import type { OperationType } from '../offlineQueueService';

// Mock react-native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  fireAndForget: jest.fn(promise => {
    if (promise && promise.catch) promise.catch(() => {});
  }),
}));

// Mock auditService
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock localStorage
const mockStorage: Record<string, string> = {};
beforeAll(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, value: string) => {
        mockStorage[key] = value;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
      },
    },
    writable: true,
  });
});

beforeEach(() => {
  jest.useFakeTimers();
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
  offlineQueueService.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('OfflineQueueService', () => {
  describe('enqueue', () => {
    it('adds operation to queue and returns an ID', () => {
      const id = offlineQueueService.enqueue('create_vault', { name: 'Test Vault' });
      expect(id).toMatch(/^op-/);
      const state = offlineQueueService.getState();
      expect(state.pendingCount).toBe(1);
    });

    it('persists to localStorage', () => {
      offlineQueueService.enqueue('delete_file', { vaultId: 'v1', fileId: 'f1' });
      const raw = mockStorage['usbvault:offline_queue'];
      expect(raw).toBeDefined();
      const parsed = JSON.parse(raw);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].type).toBe('delete_file');
    });

    it('multiple enqueues accumulate', () => {
      offlineQueueService.enqueue('create_vault', { name: 'A' });
      offlineQueueService.enqueue('rename_vault', { vaultId: 'v1', newName: 'B' });
      offlineQueueService.enqueue('delete_vault', { vaultId: 'v2' });
      expect(offlineQueueService.getState().pendingCount).toBe(3);
    });
  });

  describe('processQueue', () => {
    it('executes handler for pending operations', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      offlineQueueService.registerHandler('create_vault', handler);
      offlineQueueService.enqueue('create_vault', { name: 'Test' });

      await offlineQueueService.processQueue();

      expect(handler).toHaveBeenCalledWith({ name: 'Test' });
      expect(offlineQueueService.getState().pendingCount).toBe(0);
    });

    it('increments retry count on failure', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Temporary error'));
      offlineQueueService.registerHandler('rename_vault', handler);
      offlineQueueService.enqueue('rename_vault', { vaultId: 'v1', newName: 'New' });

      // Use advanceTimersByTimeAsync to handle async sleep
      const promise = offlineQueueService.processQueue();
      await jest.advanceTimersByTimeAsync(5000);
      await promise;

      const ops = offlineQueueService.getOperations();
      expect(ops[0].retryCount).toBe(1);
      expect(ops[0].status).toBe('pending');
      expect(ops[0].lastError).toBe('Temporary error');
    });

    it('marks operation as failed after max retries', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Server error'));
      offlineQueueService.registerHandler('delete_vault', handler);
      offlineQueueService.enqueue('delete_vault', { vaultId: 'v1' });

      for (let i = 0; i < 6; i++) {
        const promise = offlineQueueService.processQueue();
        await jest.advanceTimersByTimeAsync(20000);
        await promise;
      }

      const state = offlineQueueService.getState();
      expect(state.failedCount).toBe(1);
      expect(state.pendingCount).toBe(0);
    }, 15000);

    it('does nothing when queue is empty', async () => {
      await offlineQueueService.processQueue();
      expect(offlineQueueService.getState().pendingCount).toBe(0);
    });

    it('marks operation failed if no handler registered', async () => {
      offlineQueueService.enqueue('upload_file' as OperationType, { data: 'test' });
      await offlineQueueService.processQueue();
      const ops = offlineQueueService.getOperations();
      expect(ops[0].status).toBe('failed');
      expect(ops[0].lastError).toBe('No handler registered');
    });
  });

  describe('removeOperation', () => {
    it('removes an operation by ID', () => {
      const id = offlineQueueService.enqueue('create_vault', { name: 'X' });
      expect(offlineQueueService.removeOperation(id)).toBe(true);
      expect(offlineQueueService.getState().pendingCount).toBe(0);
    });

    it('returns false for non-existent ID', () => {
      expect(offlineQueueService.removeOperation('nonexistent')).toBe(false);
    });
  });

  describe('retryFailed', () => {
    it('resets failed operations to pending', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('fail'));
      offlineQueueService.registerHandler('delete_file', handler);
      offlineQueueService.enqueue('delete_file', { vaultId: 'v1', fileId: 'f1' });

      for (let i = 0; i < 6; i++) {
        const promise = offlineQueueService.processQueue();
        await jest.advanceTimersByTimeAsync(20000);
        await promise;
      }
      expect(offlineQueueService.getState().failedCount).toBe(1);

      offlineQueueService.retryFailed();
      expect(offlineQueueService.getState().pendingCount).toBe(1);
      expect(offlineQueueService.getState().failedCount).toBe(0);
    }, 15000);
  });

  describe('subscribe', () => {
    it('notifies listeners on state change', () => {
      const listener = jest.fn();
      const unsub = offlineQueueService.subscribe(listener);

      offlineQueueService.enqueue('create_vault', { name: 'Test' });
      expect(listener).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ pendingCount: 1 }));

      unsub();
    });

    it('stops notifying after unsubscribe', () => {
      const listener = jest.fn();
      const unsub = offlineQueueService.subscribe(listener);
      unsub();

      offlineQueueService.enqueue('create_vault', { name: 'Test' });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('removes all operations and resets state', () => {
      offlineQueueService.enqueue('create_vault', { name: 'A' });
      offlineQueueService.enqueue('delete_vault', { vaultId: 'v1' });
      offlineQueueService.clear();
      expect(offlineQueueService.getState().pendingCount).toBe(0);
      expect(offlineQueueService.getOperations()).toHaveLength(0);
      expect(offlineQueueService.getState().isProcessing).toBe(false);
    });
  });

  describe('getOperations', () => {
    it('returns a copy of operations', () => {
      offlineQueueService.enqueue('create_vault', { name: 'Test' });
      const ops = offlineQueueService.getOperations();
      expect(ops).toHaveLength(1);
      expect(ops[0].type).toBe('create_vault');
      expect(ops[0].payload).toEqual({ name: 'Test' });
    });
  });
});
