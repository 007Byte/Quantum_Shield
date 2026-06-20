/**
 * PH9: Auto-Lock Service — locks vault after inactivity timeout
 *
 * Listens to AppState changes (background/foreground) on native,
 * and visibility changes on web. When the app has been inactive
 * longer than the configured timeout, triggers a lock callback.
 *
 * Platform-safe: all native APIs are guarded behind Platform.OS checks.
 */

import { AppState, Platform } from 'react-native';
import type { AppStateStatus, NativeEventSubscription } from 'react-native';
import { logger } from '@/utils/logger';
import { securitySettings } from '@/services/settingsStorage';

export interface AutoLockConfig {
  /** Whether auto-lock is active */
  enabled: boolean;
  /** Inactivity timeout in minutes (1, 5, 15, 30) */
  timeoutMinutes: number;
}

const DEFAULT_CONFIG: AutoLockConfig = {
  enabled: true,
  timeoutMinutes: 5,
};

type LockCallback = () => void;

class AutoLockService {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backgroundTimestamp: number | null = null;
  private config: AutoLockConfig = AutoLockService.loadPersistedConfig();
  private onLock: LockCallback | null = null;
  private appStateSubscription: NativeEventSubscription | null = null;
  private webVisibilityHandler: (() => void) | null = null;
  private started = false;

  /**
   * Start listening for app state changes.
   * Call this once from the root layout on mount.
   */
  start(onLock: LockCallback): void {
    if (this.started) return;
    this.started = true;
    this.onLock = onLock;

    if (Platform.OS === 'web') {
      // Web: use visibilitychange
      if (typeof document !== 'undefined') {
        this.webVisibilityHandler = this.handleWebVisibility.bind(this);
        document.addEventListener('visibilitychange', this.webVisibilityHandler);
      }
    } else {
      // Native: use AppState
      this.appStateSubscription = AppState.addEventListener(
        'change',
        this.handleNativeAppState.bind(this)
      );
    }

    logger.log(
      `[AutoLock] Started — timeout ${this.config.timeoutMinutes}m, enabled=${this.config.enabled}`
    );
  }

  /**
   * Stop listening and clear all timers.
   */
  stop(): void {
    this.started = false;
    this.onLock = null;
    this.clearTimer();

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    if (Platform.OS === 'web' && this.webVisibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.webVisibilityHandler);
      this.webVisibilityHandler = null;
    }

    logger.log('[AutoLock] Stopped');
  }

  /**
   * Record user activity — resets the background timestamp so that
   * returning to foreground within the timeout window won't trigger a lock.
   */
  recordActivity(): void {
    this.backgroundTimestamp = null;
  }

  /**
   * Check whether the timeout has elapsed since the app went to background.
   */
  checkLock(): boolean {
    if (!this.config.enabled || !this.backgroundTimestamp) return false;
    const elapsed = Date.now() - this.backgroundTimestamp;
    return elapsed >= this.config.timeoutMinutes * 60 * 1000;
  }

  /**
   * Load persisted auto-lock config from security settings storage.
   */
  private static loadPersistedConfig(): AutoLockConfig {
    try {
      const stored = securitySettings.load();
      return {
        enabled: stored.autoLockEnabled,
        timeoutMinutes: Math.round(stored.autoLockTimeoutMs / 60000),
      };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Update config at runtime (e.g. from settings toggle).
   * Persists to security settings storage.
   */
  setConfig(config: Partial<AutoLockConfig>): void {
    this.config = { ...this.config, ...config };
    logger.log(
      `[AutoLock] Config updated — timeout ${this.config.timeoutMinutes}m, enabled=${this.config.enabled}`
    );

    // Persist to security settings storage
    securitySettings.save({
      autoLockEnabled: this.config.enabled,
      autoLockTimeoutMs: this.config.timeoutMinutes * 60 * 1000,
    });

    // If disabled, clear any pending timer
    if (!this.config.enabled) {
      this.clearTimer();
    }
  }

  getConfig(): AutoLockConfig {
    return { ...this.config };
  }

  // ── Private ──────────────────────────────────────────────────

  private handleNativeAppState(state: AppStateStatus): void {
    if (!this.config.enabled) return;

    if (state === 'background' || state === 'inactive') {
      this.backgroundTimestamp = Date.now();
      this.startTimer();
    } else if (state === 'active') {
      if (this.checkLock()) {
        logger.log('[AutoLock] Timeout exceeded while in background — locking');
        this.triggerLock();
      } else {
        this.clearTimer();
        this.backgroundTimestamp = null;
      }
    }
  }

  private handleWebVisibility(): void {
    if (!this.config.enabled) return;

    if (typeof document === 'undefined') return;

    if (document.visibilityState === 'hidden') {
      this.backgroundTimestamp = Date.now();
      this.startTimer();
    } else if (document.visibilityState === 'visible') {
      if (this.checkLock()) {
        logger.log('[AutoLock] Timeout exceeded while tab hidden — locking');
        this.triggerLock();
      } else {
        this.clearTimer();
        this.backgroundTimestamp = null;
      }
    }
  }

  private startTimer(): void {
    this.clearTimer();
    const ms = this.config.timeoutMinutes * 60 * 1000;
    this.timer = setTimeout(() => {
      logger.log('[AutoLock] Timer fired — locking vault');
      this.triggerLock();
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private triggerLock(): void {
    this.clearTimer();
    this.backgroundTimestamp = null;
    if (this.onLock) {
      this.onLock();
    }
  }
}

/** Singleton auto-lock service */
export const autoLockService = new AutoLockService();
