/**
 * PH7-FIX: Zustand store for real-time sync state management.
 *
 * Exposes reactive sync connection status, pending message count, and
 * connect/disconnect actions that delegate to the syncService singleton.
 *
 * @module stores/syncStore
 */

import { create } from 'zustand';
import { registerCleanup } from '@/stores/storeCleanup';
import { syncService, type SyncState, type EncryptedSyncEvent } from '@/services/syncService';

// ── Types ──────────────────────────────────────────────────────

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface SyncStoreState {
  /** Current WebSocket connection status */
  connectionStatus: ConnectionStatus;
  /** Timestamp of last successful sync (ISO 8601) */
  lastSyncTimestamp: string | null;
  /** Number of messages waiting to be sent */
  pendingMessages: number;
  /** Whether the device is online (network reachable) */
  isOnline: boolean;
  /** Last error from the sync service */
  lastError: string | null;
  /** Number of reconnection attempts since last successful connection */
  reconnectAttempts: number;

  // ── Actions ────────────────────────────────────────────────

  /**
   * Connect to the sync WebSocket endpoint.
   * @param wsUrl  Full WebSocket URL (e.g. wss://api.usbvault.com/api/v1/sync/ws)
   * @param token  JWT access token
   * @param onSyncEvent  Optional callback when an encrypted event arrives
   */
  connect: (
    wsUrl: string,
    token: string,
    onSyncEvent?: (event: EncryptedSyncEvent) => void
  ) => void;

  /** Gracefully disconnect from the sync WebSocket. */
  disconnect: () => void;

  /**
   * Send an encrypted sync event. If disconnected, it is queued for later.
   * @returns true if sent immediately, false if queued
   */
  sendEvent: (event: EncryptedSyncEvent) => boolean;

  /** Force-process the offline message queue. */
  processQueue: () => Promise<void>;

  /** Clear all synced items from the queue. */
  clearSynced: () => void;

  /** Refresh store state from the underlying syncService. */
  refreshState: () => void;
}

// ── Helper ──────────────────────────────────────────────────────

function deriveConnectionStatus(svcState: SyncState, reconnectAttempts: number): ConnectionStatus {
  if (svcState.wsConnected) return 'connected';
  if (reconnectAttempts > 0 && svcState.isOnline) return 'reconnecting';
  if (svcState.isSyncing) return 'connecting';
  return 'disconnected';
}

// ── Store ──────────────────────────────────────────────────────

export const useSyncStore = create<SyncStoreState>((set, _get) => {
  // RELIABILITY FIX (H-4): Store unsubscribe handle and register for cleanup.
  // Previously, syncService.subscribe() was called without storing the return value,
  // causing the subscription to persist forever (memory leak over long sessions).
  const unsubSync = syncService.subscribe((svcState: SyncState) => {
    const reconnectInfo = syncService.getReconnectInfo();
    set({
      connectionStatus: deriveConnectionStatus(svcState, reconnectInfo.attempt),
      lastSyncTimestamp: svcState.lastSyncAt,
      pendingMessages: svcState.pendingCount,
      isOnline: svcState.isOnline,
      reconnectAttempts: reconnectInfo.attempt,
    });
  });

  // Register for cleanup on logout
  registerCleanup(unsubSync);

  return {
    // ── Initial state ──────────────────────────────────────
    connectionStatus: 'disconnected',
    lastSyncTimestamp: null,
    pendingMessages: 0,
    isOnline: true,
    lastError: null,
    reconnectAttempts: 0,

    // ── Actions ────────────────────────────────────────────

    connect: (wsUrl: string, token: string, onSyncEvent?: (event: EncryptedSyncEvent) => void) => {
      set({ connectionStatus: 'connecting', lastError: null });

      try {
        syncService.connect(wsUrl, token, (event: EncryptedSyncEvent) => {
          // Update last sync timestamp on every incoming event
          set({ lastSyncTimestamp: new Date().toISOString() });
          if (onSyncEvent) {
            onSyncEvent(event);
          }
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Connection failed';
        set({ connectionStatus: 'disconnected', lastError: message });
      }
    },

    disconnect: () => {
      syncService.disconnect();
      set({
        connectionStatus: 'disconnected',
        reconnectAttempts: 0,
        lastError: null,
      });
    },

    sendEvent: (event: EncryptedSyncEvent): boolean => {
      const sent = syncService.sendEncryptedEvent(event);
      // Refresh pending count after send
      const svcState = syncService.getState();
      set({ pendingMessages: svcState.pendingCount });
      return sent;
    },

    processQueue: async () => {
      await syncService.processQueue();
      const svcState = syncService.getState();
      set({
        pendingMessages: svcState.pendingCount,
        lastSyncTimestamp: svcState.lastSyncAt,
      });
    },

    clearSynced: () => {
      syncService.clearSynced();
      const svcState = syncService.getState();
      set({ pendingMessages: svcState.pendingCount });
    },

    refreshState: () => {
      const svcState = syncService.getState();
      const reconnectInfo = syncService.getReconnectInfo();
      set({
        connectionStatus: deriveConnectionStatus(svcState, reconnectInfo.attempt),
        lastSyncTimestamp: svcState.lastSyncAt,
        pendingMessages: svcState.pendingCount,
        isOnline: svcState.isOnline,
        reconnectAttempts: reconnectInfo.attempt,
      });
    },
  };
});
