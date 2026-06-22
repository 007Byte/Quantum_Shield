/**
 * cleanupRegistry — Centralized subscription/timer cleanup registry (L0 util).
 *
 * RELIABILITY FIX (H-4): Stores and services that subscribe to external
 * services or start timers previously never tore them down, causing unbounded
 * memory growth over long sessions.
 *
 * This is a dependency-free leaf utility so BOTH the stores layer (L2) and the
 * services layer (L1) can register cleanup without violating the architectural
 * layering rules (services must not import stores). It collects unsubscribe
 * handles and exposes a single `cleanupStoreSubscriptions()` function called
 * during logout.
 */

const _unsubscribers: (() => void)[] = [];

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
