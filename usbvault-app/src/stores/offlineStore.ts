/**
 * Zustand store for offline queue UI state.
 *
 * Subscribes to the offlineQueueService and exposes reactive state
 * for components (e.g., pending operation badges, sync indicators).
 */

import { create } from 'zustand';
import { registerCleanup } from '@/stores/storeCleanup';
import {
  offlineQueueService,
  type OfflineQueueState,
  type QueuedOperation,
} from '@/services/offlineQueueService';

interface OfflineStoreState extends OfflineQueueState {
  /** All queued operations (for admin/debug UI) */
  operations: ReadonlyArray<QueuedOperation>;
  /** Trigger queue processing manually */
  processQueue: () => Promise<void>;
  /** Retry all failed operations */
  retryFailed: () => void;
  /** Remove a specific operation */
  removeOperation: (id: string) => void;
  /** Clear all queued operations */
  clearQueue: () => void;
}

export const useOfflineStore = create<OfflineStoreState>(set => {
  // RELIABILITY FIX (H-4): Store unsubscribe handle and register for cleanup.
  const unsubOffline = offlineQueueService.subscribe(state => {
    set({
      ...state,
      operations: offlineQueueService.getOperations(),
    });
  });

  registerCleanup(unsubOffline);

  const initial = offlineQueueService.getState();

  return {
    ...initial,
    operations: offlineQueueService.getOperations(),

    processQueue: async () => {
      await offlineQueueService.processQueue();
    },

    retryFailed: () => {
      offlineQueueService.retryFailed();
    },

    removeOperation: (id: string) => {
      offlineQueueService.removeOperation(id);
    },

    clearQueue: () => {
      offlineQueueService.clear();
    },
  };
});
