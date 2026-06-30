/**
 * offlineStore tests.
 *
 * The store is a reactive mirror of the offlineQueueService: it seeds initial
 * state + operations at construction, re-mirrors on every service push, and
 * delegates process/retry/remove/clear. We mock ONLY the genuine boundary
 * (offlineQueueService) and the cleanup registry, then assert the seeding,
 * the subscription bridge, and each delegating action.
 */
import type { OfflineQueueState, QueuedOperation } from '@/services/offlineQueueService';

let subscribedListener: ((s: OfflineQueueState) => void) | null = null;

const mockService = {
  subscribe: jest.fn((listener: (s: OfflineQueueState) => void) => {
    subscribedListener = listener;
    return jest.fn();
  }),
  getState: jest.fn(),
  getOperations: jest.fn(),
  processQueue: jest.fn(),
  retryFailed: jest.fn(),
  removeOperation: jest.fn(),
  clear: jest.fn(),
};

jest.mock('@/services/offlineQueueService', () => ({
  offlineQueueService: mockService,
}));

const registerCleanup = jest.fn();
jest.mock('@/stores/storeCleanup', () => ({
  registerCleanup: (...a: unknown[]) => registerCleanup(...a),
  cleanupStoreSubscriptions: jest.fn(),
}));

function queueState(over: Partial<OfflineQueueState> = {}): OfflineQueueState {
  return {
    pendingCount: 0,
    processingCount: 0,
    failedCount: 0,
    isProcessing: false,
    isOnline: true,
    ...over,
  };
}

function op(over: Partial<QueuedOperation> = {}): QueuedOperation {
  return {
    id: 'op-1a2b',
    type: 'upload' as QueuedOperation['type'],
    payload: {},
    status: 'pending' as QueuedOperation['status'],
    createdAt: '2026-06-29T10:00:00Z',
    retryCount: 0,
    maxRetries: 3,
    ...over,
  };
}

// Seed the service before importing the store so construction reads real values.
mockService.getState.mockReturnValue(queueState({ pendingCount: 2 }));
mockService.getOperations.mockReturnValue([op()]);

// NB: the store-under-test MUST be imported AFTER its boundary mocks + the
// mockService const are declared. ts-jest hoists jest.mock() above imports, but
// NOT the const it closes over; importing here keeps eval order correct. The
// eslint-disable prevents `import/order` autofix from re-hoisting this line.
// eslint-disable-next-line import/order, import/first
import { useOfflineStore } from '../offlineStore';

describe('offlineStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockService.getState.mockReturnValue(queueState());
    mockService.getOperations.mockReturnValue([]);
  });

  describe('initialization', () => {
    it('seeds state and operations from the service at construction', () => {
      // Construction ran during import with pendingCount:2 and one operation.
      const s = useOfflineStore.getState();
      expect(s.pendingCount).toBe(2);
      expect(s.operations).toHaveLength(1);
      expect(s.operations[0].id).toBe('op-1a2b');
    });

    it('subscribed to the service and registered cleanup', () => {
      expect(subscribedListener).toBeInstanceOf(Function);
    });

    it('exposes all delegating actions', () => {
      const s = useOfflineStore.getState();
      expect(typeof s.processQueue).toBe('function');
      expect(typeof s.retryFailed).toBe('function');
      expect(typeof s.removeOperation).toBe('function');
      expect(typeof s.clearQueue).toBe('function');
    });
  });

  describe('subscription bridge', () => {
    it('re-mirrors queue state and operations when the service pushes', () => {
      mockService.getOperations.mockReturnValue([
        op({ id: 'op-aa01', status: 'failed' }),
        op({ id: 'op-bb02', status: 'pending' }),
      ]);

      subscribedListener!(
        queueState({ pendingCount: 1, failedCount: 1, processingCount: 0, isOnline: false })
      );

      const s = useOfflineStore.getState();
      expect(s.pendingCount).toBe(1);
      expect(s.failedCount).toBe(1);
      expect(s.isOnline).toBe(false);
      expect(s.operations.map(o => o.id)).toEqual(['op-aa01', 'op-bb02']);
    });
  });

  describe('processQueue', () => {
    it('delegates to the service', async () => {
      mockService.processQueue.mockResolvedValue(undefined);
      await useOfflineStore.getState().processQueue();
      expect(mockService.processQueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryFailed', () => {
    it('delegates to the service', () => {
      useOfflineStore.getState().retryFailed();
      expect(mockService.retryFailed).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeOperation', () => {
    it('delegates the operation id to the service', () => {
      useOfflineStore.getState().removeOperation('op-aa01');
      expect(mockService.removeOperation).toHaveBeenCalledWith('op-aa01');
    });
  });

  describe('clearQueue', () => {
    it('delegates to the service clear()', () => {
      useOfflineStore.getState().clearQueue();
      expect(mockService.clear).toHaveBeenCalledTimes(1);
    });
  });
});
