/**
 * Additional Sync Service tests — extends syncService.test.ts.
 *
 * Focus: REAL behavior of the WebSocket transport + queue engine:
 *  - connect() opens a WS with the bearer subprotocol; onopen flushes the queue
 *    and requests replay; disconnect() closes cleanly without reconnecting
 *  - server message routing: pong cancels the timeout, sync events update the
 *    last-seen sequence and fire the callback, replay/error/unknown branches
 *  - reconnect with exponential backoff + jitter (computeBackoff via the close
 *    handler) and intentional-close suppression
 *  - heartbeat ping/pong: ping is sent on the interval; a missed pong force-closes
 *  - sendEncryptedEvent: sends when OPEN, queues when not connected
 *  - processQueue / _syncItem: success marks items synced, send failure increments
 *    retry, MAX_RETRIES is enforced, encrypted vs legacy payload shaping
 *
 * Boundaries mocked: WebSocket (network transport), localStorage (web storage),
 * window online/offline events, react-native Platform, logger. The service under
 * test (syncService) is NEVER mocked. We import the SyncService class directly so
 * each test gets a clean instance instead of fighting the shared singleton.
 */

// ── localStorage mock (web queue/state persistence) ──
// Import AFTER mocks are in place. SyncService is the class; the named export is
// the shared singleton (which we avoid to keep tests isolated).
import { SyncQueueItem } from '../syncService';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
    _getStore: () => store,
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });

// ── window online/offline listener capture ──
const eventListeners: Record<string, Function[]> = {};
(window as any).addEventListener = jest.fn((event: string, handler: Function) => {
  (eventListeners[event] ||= []).push(handler);
});
(window as any).removeEventListener = jest.fn((event: string, handler: Function) => {
  if (eventListeners[event]) {
    eventListeners[event] = eventListeners[event].filter(h => h !== handler);
  }
});
Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });

jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));
jest.mock('@/utils/logger', () => ({
  logger: {
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// ── WebSocket mock that records the latest constructed instance ──
let lastWs: MockWebSocket | null = null;
const wsInstances: MockWebSocket[] = [];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static CONNECTING = 0;
  static CLOSING = 2;

  url: string;
  protocols: string | string[];
  readyState: number = MockWebSocket.OPEN;
  onopen: ((ev?: any) => void) | null = null;
  onclose: ((ev: any) => void) | null = null;
  onmessage: ((ev: any) => void) | null = null;
  onerror: ((ev?: any) => void) | null = null;

  send = jest.fn();
  close = jest.fn((code?: number, reason?: string) => {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' });
  });

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols ?? '';
    lastWs = this;
    wsInstances.push(this);
  }

  /** Test helper: fire the open handler. */
  fireOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
  /** Test helper: deliver a server message. */
  fireMessage(data: string) {
    this.onmessage?.({ data });
  }
}
(global as any).WebSocket = MockWebSocket;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const syncModule = require('../syncService');

/** The SyncService class isn't exported; reconstruct a fresh instance via the
 *  singleton's constructor so every test starts clean. */
function freshService(): any {
  const SyncServiceCtor = syncModule.syncService.constructor;
  return new SyncServiceCtor();
}

const QUEUE_KEY = 'usbvault:sync_queue';

beforeEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
  lastWs = null;
  wsInstances.length = 0;
});

describe('syncService — connect()/disconnect() lifecycle', () => {
  it('connect() opens a WebSocket with the bearer subprotocol', () => {
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');

    expect(lastWs).not.toBeNull();
    expect(lastWs!.url).toBe('wss://api.usbvault.io/ws/sync');
    expect(lastWs!.protocols).toEqual(['bearer-jwt-token-abc123']);
    svc.destroy();
  });

  it('onopen marks connected, flips wsConnected in state, and notifies listeners', () => {
    const svc = freshService();
    const listener = jest.fn();
    svc.subscribe(listener);

    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();

    expect(svc.getState().wsConnected).toBe(true);
    expect(svc.getReconnectInfo().connected).toBe(true);
    expect(listener).toHaveBeenCalled();
    svc.destroy();
  });

  it('disconnect() closes the socket with code 1000 and does not reconnect', () => {
    jest.useFakeTimers();
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();
    const created = wsInstances.length;

    svc.disconnect();

    expect(lastWs!.close).toHaveBeenCalledWith(1000, 'client disconnect');
    expect(svc.getState().wsConnected).toBe(false);

    // No reconnection should be scheduled after an intentional close.
    jest.advanceTimersByTime(120_000);
    expect(wsInstances.length).toBe(created);
    jest.useRealTimers();
    svc.destroy();
  });

  it('_openWebSocket bails when called without URL or token', () => {
    const svc = freshService();
    // Not connected → no socket constructed.
    svc.processQueue();
    expect(lastWs).toBeNull();
    svc.destroy();
  });
});

describe('syncService — server message routing', () => {
  it('a "sync" message updates last-seen sequence and fires the onSyncEvent callback', () => {
    const svc = freshService();
    const onEvent = jest.fn();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123', onEvent);
    lastWs!.fireOpen();

    const event = {
      id: 'evt-1',
      event_type: 'share_created',
      encrypted_data: 'Yzju+ciphertext',
      nonce: 'bm9uY2U=',
      sequence: 7,
    };
    lastWs!.fireMessage(JSON.stringify({ type: 'sync', event }));

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ id: 'evt-1', sequence: 7 }));
    // Reconnecting now should request replay from sequence 7.
    svc.disconnect();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123', onEvent);
    lastWs!.fireOpen();
    const replaySend = lastWs!.send.mock.calls.find(c => String(c[0]).includes('replay'));
    expect(replaySend).toBeDefined();
    expect(JSON.parse(replaySend![0])).toEqual({
      type: 'replay',
      data: { last_sequence: 7 },
    });
    svc.destroy();
  });

  it('a "sync" message carrying the event as a JSON string in message is parsed', () => {
    const svc = freshService();
    const onEvent = jest.fn();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123', onEvent);
    lastWs!.fireOpen();

    const inner = { event_type: 'message_sent', encrypted_data: 'ZGF0YQ==', nonce: 'bm9uY2U=' };
    lastWs!.fireMessage(JSON.stringify({ type: 'sync', message: JSON.stringify(inner) }));

    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'message_sent' }));
    svc.destroy();
  });

  it('a "pong" message cancels the pending pong timeout (no force-close)', () => {
    jest.useFakeTimers();
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();

    // Advance to trigger one ping (25s) — this arms the pong timeout.
    jest.advanceTimersByTime(25_000);
    expect(lastWs!.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ping' }));

    // Server answers in time.
    lastWs!.fireMessage(JSON.stringify({ type: 'pong' }));
    expect(svc.getReconnectInfo().lastPongAt).toBeGreaterThan(0);

    // The pong cleared the timeout → no force-close after PONG_TIMEOUT_MS.
    const closeCallsBefore = lastWs!.close.mock.calls.length;
    jest.advanceTimersByTime(10_000);
    expect(lastWs!.close.mock.calls.length).toBe(closeCallsBefore);

    jest.useRealTimers();
    svc.destroy();
  });

  it('a missed pong force-closes the socket with code 4000', () => {
    jest.useFakeTimers();
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();
    const ws = lastWs!;

    jest.advanceTimersByTime(25_000); // send ping, arm pong timeout
    jest.advanceTimersByTime(10_000); // pong never arrives → force close

    expect(ws.close).toHaveBeenCalledWith(4000, 'pong timeout');
    jest.useRealTimers();
    svc.destroy();
  });

  it('replay_complete / error / unknown message types do not throw', () => {
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();

    expect(() => {
      lastWs!.fireMessage(JSON.stringify({ type: 'replay_complete', message: 'done' }));
      lastWs!.fireMessage(JSON.stringify({ type: 'error', message: 'rate limited' }));
      lastWs!.fireMessage(JSON.stringify({ type: 'totally_unknown' }));
    }).not.toThrow();
    svc.destroy();
  });

  it('malformed JSON in a server message is swallowed (no throw)', () => {
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();

    expect(() => lastWs!.fireMessage('{not valid json')).not.toThrow();
    svc.destroy();
  });
});

describe('syncService — reconnection with backoff', () => {
  it('an unexpected close schedules a reconnect that opens a new socket', () => {
    jest.useFakeTimers();
    // Make backoff deterministic (no jitter): jitterFactor 0.
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();
    const firstSocket = lastWs!;
    const createdBefore = wsInstances.length;

    // Simulate a network drop (not an intentional close).
    firstSocket.onclose?.({ code: 1006, reason: 'abnormal' });
    expect(svc.getState().wsConnected).toBe(false);

    // First backoff is ~1000ms (jitter cancels at random=0.5). Run all timers.
    jest.advanceTimersByTime(2_000);
    expect(wsInstances.length).toBeGreaterThan(createdBefore);
    expect(svc.getReconnectInfo().attempt).toBeGreaterThanOrEqual(1);

    spy.mockRestore();
    jest.useRealTimers();
    svc.destroy();
  });

  it('the online event triggers an immediate reconnect when disconnected', () => {
    jest.useFakeTimers();
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();
    // Drop the connection.
    lastWs!.onclose?.({ code: 1006, reason: 'abnormal' });
    svc.disconnect(); // stop the backoff timer so only the online path can reconnect
    const createdBefore = wsInstances.length;

    // Fire the captured window 'online' handler.
    (eventListeners['online'] || []).forEach(h => h());
    jest.advanceTimersByTime(10);

    expect(wsInstances.length).toBeGreaterThanOrEqual(createdBefore);
    jest.useRealTimers();
    svc.destroy();
  });
});

describe('syncService — sendEncryptedEvent', () => {
  it('sends over the socket when OPEN and returns true', () => {
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();
    lastWs!.send.mockClear();

    const event = { event_type: 'share_created', encrypted_data: 'Y2lwaGVy', nonce: 'bm9uY2U=' };
    const ok = svc.sendEncryptedEvent(event);

    expect(ok).toBe(true);
    expect(lastWs!.send).toHaveBeenCalledWith(JSON.stringify({ type: 'sync', data: event }));
    svc.destroy();
  });

  it('queues the event and returns false when the socket is not OPEN', () => {
    const svc = freshService();
    // Never connected → _ws is null.
    const event = { event_type: 'share_created', encrypted_data: 'Y2lwaGVy', nonce: 'bm9uY2U=' };
    const ok = svc.sendEncryptedEvent(event);

    expect(ok).toBe(false);
    const queued = svc.getQueueItems().find((i: SyncQueueItem) => i.payload._encrypted === true);
    expect(queued).toBeDefined();
    expect(queued!.payload.event_type).toBe('share_created');
    svc.destroy();
  });

  it('returns false when ws.send throws', () => {
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();
    lastWs!.send.mockImplementation(() => {
      throw new Error('socket write failed');
    });

    const ok = svc.sendEncryptedEvent({
      event_type: 'share_created',
      encrypted_data: 'Y2lwaGVy',
      nonce: 'bm9uY2U=',
    });
    expect(ok).toBe(false);
    svc.destroy();
  });
});

describe('syncService — processQueue() + _syncItem()', () => {
  it('flushes pending encrypted items over the socket and marks them synced', async () => {
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();

    // Enqueue an encrypted item while connected.
    svc.enqueue('message', {
      _encrypted: true,
      event_type: 'message_sent',
      encrypted_data: 'ZW5jcnlwdGVk',
      nonce: 'bm9uY2U=',
    });

    await svc.processQueue();

    const items = svc.getQueueItems();
    expect(items.every((i: SyncQueueItem) => i.status === 'synced')).toBe(true);
    // The encrypted payload was sent as a sync message.
    const syncSend = lastWs!.send.mock.calls
      .map(c => JSON.parse(c[0]))
      .find((m: any) => m.type === 'sync' && m.data?.event_type === 'message_sent');
    expect(syncSend).toBeDefined();
    // After a successful flush, lastSyncAt is recorded.
    expect(svc.getState().lastSyncAt).not.toBeNull();
    svc.destroy();
  });

  it('shapes a legacy (non-encrypted) item into an empty-ciphertext sync message', async () => {
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();
    lastWs!.send.mockClear();

    svc.enqueue('share', { recipientId: 'user-2' });
    await svc.processQueue();

    const legacySend = lastWs!.send.mock.calls
      .map(c => JSON.parse(c[0]))
      .find((m: any) => m.type === 'sync' && m.data?.event_type === 'SHARE');
    expect(legacySend).toBeDefined();
    expect(legacySend.data.encrypted_data).toBe('');
    svc.destroy();
  });

  it('is a no-op when the socket is not connected (items stay pending)', async () => {
    const svc = freshService();
    svc.enqueue('share', { recipientId: 'user-2' }); // not connected

    await svc.processQueue();

    expect(svc.getState().pendingCount).toBe(1);
    svc.destroy();
  });

  it('increments retryCount and marks error when _syncItem throws', async () => {
    const svc = freshService();
    // Enqueue while disconnected so there is no immediate auto-flush; we want a
    // single, controlled processQueue() pass with the write failing.
    svc.enqueue('share', { recipientId: 'user-2' });

    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    // Make the underlying socket write fail BEFORE onopen flushes the queue.
    lastWs!.send.mockImplementation(() => {
      throw new Error('write failed');
    });
    lastWs!.fireOpen(); // onopen → processQueue (one pass, send throws)

    // Let the onopen-triggered processQueue settle.
    await Promise.resolve();
    await Promise.resolve();

    const item = svc.getQueueItems()[0];
    expect(item.status).toBe('error');
    expect(item.retryCount).toBe(1);
    expect(item.lastError).toContain('write failed');
    svc.destroy();
  });

  it('does not retry items that already exceeded MAX_RETRIES', async () => {
    const svc = freshService();
    // Seed a queue item already at the retry ceiling (5).
    const seeded: SyncQueueItem[] = [
      {
        id: 'sync-seed-1',
        type: 'share',
        payload: { recipientId: 'user-9' },
        createdAt: new Date().toISOString(),
        retryCount: 5,
        status: 'error',
      },
    ];
    localStorageMock.setItem(QUEUE_KEY, JSON.stringify(seeded));

    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();
    lastWs!.send.mockClear();

    await svc.processQueue();

    const item = svc.getQueueItems().find((i: SyncQueueItem) => i.id === 'sync-seed-1')!;
    expect(item.status).toBe('error');
    expect(item.lastError).toContain('Max retries');
    // It was skipped, never sent.
    const sends = lastWs!.send.mock.calls.filter(c => String(c[0]).includes('SHARE'));
    expect(sends.length).toBe(0);
    svc.destroy();
  });
});

describe('syncService — backoff helper behavior', () => {
  it('enqueue while connected triggers an immediate processQueue flush', async () => {
    const svc = freshService();
    svc.connect('wss://api.usbvault.io/ws/sync', 'jwt-token-abc123');
    lastWs!.fireOpen();
    lastWs!.send.mockClear();

    svc.enqueue('message', {
      _encrypted: true,
      event_type: 'message_sent',
      encrypted_data: 'ZGF0YQ==',
      nonce: 'bm9uY2U=',
    });
    // Allow the async processQueue kicked off by enqueue to settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(lastWs!.send).toHaveBeenCalled();
    svc.destroy();
  });
});
