/**
 * syncStore tests.
 *
 * The store is a thin reactive wrapper over the syncService singleton: it
 * derives a connection status, mirrors pending/online counters, and delegates
 * connect/disconnect/send to the service. We mock ONLY the genuine boundary
 * (syncService) and the cleanup registry, then drive real state transitions and
 * assert the derived status logic, delegation, and the subscription bridge.
 */
import type { SyncState } from '@/services/syncService';

// Capture the subscription callback the store registers at construction so we
// can simulate the service pushing new state into the store.
let subscribedListener: ((s: SyncState) => void) | null = null;

const mockService = {
  subscribe: jest.fn((listener: (s: SyncState) => void) => {
    subscribedListener = listener;
    return jest.fn(); // unsubscribe handle
  }),
  connect: jest.fn(),
  disconnect: jest.fn(),
  sendEncryptedEvent: jest.fn(),
  processQueue: jest.fn(),
  clearSynced: jest.fn(),
  getState: jest.fn(),
  getReconnectInfo: jest.fn(),
};

jest.mock('@/services/syncService', () => ({
  syncService: mockService,
}));

const registerCleanup = jest.fn();
jest.mock('@/stores/storeCleanup', () => ({
  registerCleanup: (...a: unknown[]) => registerCleanup(...a),
  cleanupStoreSubscriptions: jest.fn(),
}));

function svcState(over: Partial<SyncState> = {}): SyncState {
  return {
    lastSyncAt: null,
    pendingCount: 0,
    isOnline: true,
    isSyncing: false,
    wsConnected: false,
    ...over,
  };
}

function reconnect(attempt = 0) {
  return { attempt, maxAttempts: 5, connected: false, lastPongAt: 0 };
}

// Default service responses, set before importing the store so module-init is clean.
mockService.getState.mockReturnValue(svcState());
mockService.getReconnectInfo.mockReturnValue(reconnect());

// Import AFTER the boundary mock + its closed-over const are declared. ts-jest
// hoists jest.mock() but not the const it references; the eslint-disable keeps
// `import/order` autofix from re-hoisting this above the mock.
// eslint-disable-next-line import/order, import/first
import { useSyncStore } from '../syncStore';

const INITIAL = {
  connectionStatus: 'disconnected' as const,
  lastSyncTimestamp: null,
  pendingMessages: 0,
  isOnline: true,
  lastError: null,
  reconnectAttempts: 0,
};

describe('syncStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockService.getState.mockReturnValue(svcState());
    mockService.getReconnectInfo.mockReturnValue(reconnect());
    useSyncStore.setState({ ...INITIAL });
  });

  describe('initialization', () => {
    it('subscribes to the syncService and registers cleanup at construction', () => {
      // The subscribe handle was captured during the (already-completed) import.
      expect(subscribedListener).toBeInstanceOf(Function);
    });

    it('starts in the disconnected state', () => {
      const s = useSyncStore.getState();
      expect(s.connectionStatus).toBe('disconnected');
      expect(s.pendingMessages).toBe(0);
      expect(s.isOnline).toBe(true);
      expect(s.lastError).toBeNull();
      expect(s.reconnectAttempts).toBe(0);
    });
  });

  describe('connect', () => {
    it('sets connecting status and clears the previous error before delegating', () => {
      useSyncStore.setState({ lastError: 'previous failure' });
      useSyncStore.getState().connect('wss://api.example.io/sync', 'jwt-token');

      const s = useSyncStore.getState();
      expect(s.connectionStatus).toBe('connecting');
      expect(s.lastError).toBeNull();
      expect(mockService.connect).toHaveBeenCalledWith(
        'wss://api.example.io/sync',
        'jwt-token',
        expect.any(Function)
      );
    });

    it('updates lastSyncTimestamp and forwards events when the service emits one', () => {
      const onEvent = jest.fn();
      useSyncStore.getState().connect('wss://api.example.io/sync', 'jwt-token', onEvent);

      // Pull the wrapper the store passed to syncService.connect and fire it.
      const wrapper = mockService.connect.mock.calls[0][2] as (e: unknown) => void;
      const event = { event_type: 'file.added', encrypted_data: 'a1b2c3', nonce: 'd4e5f6' };
      wrapper(event);

      expect(useSyncStore.getState().lastSyncTimestamp).not.toBeNull();
      expect(onEvent).toHaveBeenCalledWith(event);
    });

    it('records the error and reverts to disconnected when the service throws', () => {
      mockService.connect.mockImplementationOnce(() => {
        throw new Error('handshake rejected');
      });
      useSyncStore.getState().connect('wss://api.example.io/sync', 'jwt-token');

      const s = useSyncStore.getState();
      expect(s.connectionStatus).toBe('disconnected');
      expect(s.lastError).toBe('handshake rejected');
    });
  });

  describe('disconnect', () => {
    it('delegates to the service and resets connection state', () => {
      useSyncStore.setState({
        connectionStatus: 'connected',
        reconnectAttempts: 3,
        lastError: 'stale',
      });
      useSyncStore.getState().disconnect();

      const s = useSyncStore.getState();
      expect(mockService.disconnect).toHaveBeenCalled();
      expect(s.connectionStatus).toBe('disconnected');
      expect(s.reconnectAttempts).toBe(0);
      expect(s.lastError).toBeNull();
    });
  });

  describe('sendEvent', () => {
    it('returns true and refreshes the pending count when sent immediately', () => {
      mockService.sendEncryptedEvent.mockReturnValue(true);
      mockService.getState.mockReturnValue(svcState({ pendingCount: 0 }));

      const sent = useSyncStore
        .getState()
        .sendEvent({ event_type: 'file.added', encrypted_data: 'a1b2c3', nonce: 'd4e5f6' });

      expect(sent).toBe(true);
      expect(useSyncStore.getState().pendingMessages).toBe(0);
    });

    it('returns false and reflects the queued count when offline', () => {
      mockService.sendEncryptedEvent.mockReturnValue(false);
      mockService.getState.mockReturnValue(svcState({ pendingCount: 4 }));

      const sent = useSyncStore
        .getState()
        .sendEvent({ event_type: 'file.added', encrypted_data: 'a1b2c3', nonce: 'd4e5f6' });

      expect(sent).toBe(false);
      expect(useSyncStore.getState().pendingMessages).toBe(4);
    });
  });

  describe('processQueue', () => {
    it('drains the queue and syncs pending count + timestamp from the service', async () => {
      mockService.processQueue.mockResolvedValue(undefined);
      mockService.getState.mockReturnValue(
        svcState({ pendingCount: 0, lastSyncAt: '2026-06-29T12:00:00Z' })
      );

      await useSyncStore.getState().processQueue();

      expect(mockService.processQueue).toHaveBeenCalled();
      const s = useSyncStore.getState();
      expect(s.pendingMessages).toBe(0);
      expect(s.lastSyncTimestamp).toBe('2026-06-29T12:00:00Z');
    });
  });

  describe('clearSynced', () => {
    it('clears synced items and refreshes the pending count', () => {
      mockService.getState.mockReturnValue(svcState({ pendingCount: 2 }));
      useSyncStore.getState().clearSynced();

      expect(mockService.clearSynced).toHaveBeenCalled();
      expect(useSyncStore.getState().pendingMessages).toBe(2);
    });
  });

  describe('refreshState', () => {
    it('pulls a full snapshot from the service', () => {
      mockService.getState.mockReturnValue(
        svcState({
          wsConnected: true,
          pendingCount: 1,
          isOnline: true,
          lastSyncAt: '2026-06-29T09:30:00Z',
        })
      );
      mockService.getReconnectInfo.mockReturnValue(reconnect(0));

      useSyncStore.getState().refreshState();

      const s = useSyncStore.getState();
      expect(s.connectionStatus).toBe('connected');
      expect(s.pendingMessages).toBe(1);
      expect(s.isOnline).toBe(true);
      expect(s.lastSyncTimestamp).toBe('2026-06-29T09:30:00Z');
      expect(s.reconnectAttempts).toBe(0);
    });
  });

  describe('deriveConnectionStatus via the service subscription bridge', () => {
    function push(state: SyncState, attempt: number) {
      mockService.getReconnectInfo.mockReturnValue(reconnect(attempt));
      subscribedListener!(state);
    }

    it('maps wsConnected → connected', () => {
      push(svcState({ wsConnected: true }), 0);
      expect(useSyncStore.getState().connectionStatus).toBe('connected');
    });

    it('maps reconnect attempts while online → reconnecting', () => {
      push(svcState({ wsConnected: false, isOnline: true }), 2);
      const s = useSyncStore.getState();
      expect(s.connectionStatus).toBe('reconnecting');
      expect(s.reconnectAttempts).toBe(2);
    });

    it('maps isSyncing (no attempts) → connecting', () => {
      push(svcState({ wsConnected: false, isSyncing: true }), 0);
      expect(useSyncStore.getState().connectionStatus).toBe('connecting');
    });

    it('maps idle offline state → disconnected', () => {
      push(svcState({ wsConnected: false, isOnline: false }), 0);
      expect(useSyncStore.getState().connectionStatus).toBe('disconnected');
    });

    it('does NOT report reconnecting when attempts exist but the device is offline', () => {
      push(svcState({ wsConnected: false, isOnline: false }), 3);
      expect(useSyncStore.getState().connectionStatus).toBe('disconnected');
    });

    it('mirrors pending count and online flag from the pushed state', () => {
      push(svcState({ pendingCount: 7, isOnline: false }), 0);
      const s = useSyncStore.getState();
      expect(s.pendingMessages).toBe(7);
      expect(s.isOnline).toBe(false);
    });
  });
});
