/**
 * activityHighlightStore.ts — Lightweight bridge between NotificationBell and Activity screen
 *
 * When a user clicks a notification in the bell dropdown, we store the audit entry's
 * identifying info here. The Activity screen reads it on mount/update and applies
 * a highlight animation to the matching row, then clears the store.
 */

type Listener = () => void;

interface HighlightTarget {
  /** Timestamp + action + resource combo from the notification key */
  notifKey: string;
  /** When this highlight was requested (auto-expires after 10s) */
  requestedAt: number;
}

let _target: HighlightTarget | null = null;
const _listeners = new Set<Listener>();

function notify() {
  _listeners.forEach(fn => fn());
}

export const activityHighlightStore = {
  /**
   * Called by NotificationBell when a notification is clicked.
   * @param notifKey — The notification's key (timestamp_action_resource)
   */
  setHighlight(notifKey: string): void {
    _target = { notifKey, requestedAt: Date.now() };
    notify();
  },

  /**
   * Called by Activity screen to check if there's a pending highlight.
   * Returns the notifKey if the highlight was requested within the last 10 seconds.
   */
  getHighlight(): string | null {
    if (!_target) return null;
    // Auto-expire after 10 seconds
    if (Date.now() - _target.requestedAt > 10_000) {
      _target = null;
      return null;
    }
    return _target.notifKey;
  },

  /**
   * Called by Activity screen after it has applied the highlight.
   */
  clearHighlight(): void {
    _target = null;
    notify();
  },

  /**
   * Subscribe to changes.
   */
  subscribe(listener: Listener): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },
};
