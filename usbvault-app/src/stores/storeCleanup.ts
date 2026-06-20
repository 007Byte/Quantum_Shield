/**
 * storeCleanup — Centralized subscription cleanup registry.
 *
 * RELIABILITY FIX (H-4): Zustand stores that subscribe to external services
 * (syncService, offlineQueueService) previously never unsubscribed, causing
 * unbounded memory growth over long sessions.
 *
 * This module collects unsubscribe handles and exposes a single
 * `cleanupStoreSubscriptions()` function called during logout.
 */

const _unsubscribers: Array<() => void> = [];

/**
 * Register an unsubscribe function to be called during logout/cleanup.
 */
export function registerCleanup(unsub: () => void): void {
  _unsubscribers.push(unsub);
}

/**
 * Call all registered unsubscribers and clear the list.
 * Called by authStore.logout() to prevent post-logout resource leaks.
 */
export function cleanupStoreSubscriptions(): void {
  for (const unsub of _unsubscribers) {
    try {
      unsub();
    } catch {
      // Swallow errors during cleanup — best-effort
    }
  }
  _unsubscribers.length = 0;
}
