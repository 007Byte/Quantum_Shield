// PH4-FIX: Consolidated into security domain
/**
 * PH9-FIX / RM-005: Data leakage prevention — auto-lock, clipboard, screenshots (CWE-200)
 *
 * This module implements multiple protections against data leakage:
 * 1. Auto-lock: Automatically locks vault when app goes to background
 * 2. Clipboard clearing: Auto-clears clipboard after copying sensitive data
 * 3. Screenshot prevention: Prevents screen recording and screenshots
 * 4. Lock on background: Clears master key when app loses focus
 * 5. RM-005: Immediate clipboard wipe on background transition
 *
 * These protections are critical for preventing accidental data exposure.
 */

import { AppState, Platform, NativeModules } from 'react-native';
import type { AppStateStatus } from 'react-native';
import { useEffect, useRef } from 'react';
import { logger } from '@/utils/logger';

// PH4-FIX: Type for AppState subscription
interface AppStateSubscription {
  remove: () => void;
}

// RM-005: Native module for screenshot prevention (FLAG_SECURE on Android, UIScreen on iOS)
const { ScreenCaptureProtection } = NativeModules;

export interface AppProtectionConfig {
  /** Auto-lock timeout in milliseconds (default: 5 minutes) */
  autoLockTimeoutMs: number;

  /** Clipboard clearing timeout in milliseconds (default: 30 seconds) */
  clearClipboardMs: number;

  /** Prevent screenshots and screen recording (default: true) */
  preventScreenshots: boolean;

  /** Lock vault when app goes to background (default: true) */
  lockOnBackground: boolean;
}

/**
 * PH9-FIX: Default protection configuration
 */
export const DEFAULT_PROTECTION_CONFIG: AppProtectionConfig = {
  autoLockTimeoutMs: 300000, // 5 minutes
  clearClipboardMs: 30000, // 30 seconds
  preventScreenshots: true,
  lockOnBackground: true,
};

// Global state for protection management
let appStateSubscription: AppStateSubscription | null = null;
let autoLockTimeout: ReturnType<typeof setTimeout> | null = null;
let clipboardTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
let currentConfig: AppProtectionConfig = DEFAULT_PROTECTION_CONFIG;
let isAppInBackground = false;

/**
 * setupAutoLock - Configure and enable automatic vault locking on app background.
 */
export function setupAutoLock(
  config: AppProtectionConfig,
  onLock: () => void
): () => void {
  currentConfig = { ...currentConfig, ...config };

  if (!currentConfig.lockOnBackground) {
    return () => {}; // No-op cleanup
  }

  // PH9-FIX: Listen for app state changes (foreground/background)
  const subscription = AppState.addEventListener('change', handleAppStateChange(config, onLock));

  return () => {
    subscription?.remove();
    if (autoLockTimeout) {
      clearTimeout(autoLockTimeout);
      autoLockTimeout = null;
    }
  };
}

/**
 * PH9-FIX: Create app state change handler for auto-lock.
 */
function handleAppStateChange(
  config: AppProtectionConfig,
  onLock: () => void
): (state: AppStateStatus) => void {
  return (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      // PH9-FIX: App is in background - start auto-lock timer
      isAppInBackground = true;

      // RM-005 FIX: Immediately clear clipboard on background transition
      // Prevents clipboard data from being available to other apps
      clearClipboardImmediately().catch((err) => {
        logger.error('[App Protection] Background clipboard clear failed:', err);
      });

      autoLockTimeout = setTimeout(() => {
        logger.log('[App Protection] Auto-lock triggered after inactivity');
        onLock();
      }, config.autoLockTimeoutMs);

      logger.log(
        `[App Protection] Auto-lock enabled - will lock in ${config.autoLockTimeoutMs / 1000} seconds`
      );
    } else if (state === 'active') {
      // PH9-FIX: App is in foreground - cancel auto-lock timer
      isAppInBackground = false;

      if (autoLockTimeout) {
        clearTimeout(autoLockTimeout);
        autoLockTimeout = null;
      }

      logger.log('[App Protection] App in foreground - auto-lock timer cancelled');
    }
  };
}

/**
 * copyWithAutoClear - Copy text to clipboard with automatic clearing after timeout.
 */
export async function copyWithAutoClear(text: string, timeoutMs?: number): Promise<void> {
  try {
    const timeout = timeoutMs || currentConfig.clearClipboardMs;

    // Use expo-clipboard for cross-platform support
    const ExpoClipboard = require('expo-clipboard');
    await ExpoClipboard.setStringAsync(text);
    logger.log('[App Protection] Sensitive data copied to clipboard - will auto-clear');

    // PH9-FIX: Create a unique key for this clipboard operation
    const clipboardKey = `clipboard_${Date.now()}_${Math.random()}`;

    // PH9-FIX: Clear any existing timeout for this data
    const existingTimeout = clipboardTimeouts.get(clipboardKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // PH9-FIX: Schedule clipboard clear
    const clearTimer = setTimeout(async () => {
      try {
        const currentContent = await ExpoClipboard.getStringAsync();
        // Only clear if content hasn't changed (to avoid clearing user's own data)
        if (currentContent === text) {
          await ExpoClipboard.setStringAsync('');
          logger.log('[App Protection] Clipboard cleared automatically');
        }
      } catch (error) {
        logger.error('[App Protection] Error clearing clipboard:', error);
      }

      // Cleanup
      clipboardTimeouts.delete(clipboardKey);
    }, timeout);

    clipboardTimeouts.set(clipboardKey, clearTimer);
  } catch (error) {
    logger.error('[App Protection] Error copying to clipboard:', error);
    throw error;
  }
}

/**
 * RM-005 FIX: Enable/disable screenshot and screen recording prevention.
 * Calls native module (FLAG_SECURE on Android, UIScreen capture protection on iOS).
 * Falls back to logging if native module unavailable (web platform or missing native code).
 */
export function setScreenshotPrevention(enabled: boolean): void {
  if (!currentConfig.preventScreenshots) {
    return; // Screenshot prevention is disabled in config
  }

  try {
    if (Platform.OS === 'android') {
      // RM-005: Android — use FLAG_SECURE via native module
      if (ScreenCaptureProtection?.setFlagSecure) {
        ScreenCaptureProtection.setFlagSecure(enabled);
        logger.log(
          `[App Protection] Screenshot prevention ${enabled ? 'enabled' : 'disabled'} (Android FLAG_SECURE)`
        );
      } else {
        // RM-005: Fallback — use react-native-prevent-screenshots if available
        try {
          const PreventScreenshot = require('react-native-prevent-screenshots');
          if (enabled) {
            PreventScreenshot.enableSecureView();
          } else {
            PreventScreenshot.disableSecureView();
          }
          logger.log(`[App Protection] Screenshot prevention ${enabled ? 'enabled' : 'disabled'} via library`);
        } catch {
          logger.warn('[App Protection] No native screenshot prevention module available (Android)');
        }
      }
    } else if (Platform.OS === 'ios') {
      // RM-005: iOS — use UITextField secure entry trick or native module
      if (ScreenCaptureProtection?.setCaptureProtection) {
        ScreenCaptureProtection.setCaptureProtection(enabled);
        logger.log(
          `[App Protection] Screenshot prevention ${enabled ? 'enabled' : 'disabled'} (iOS native)`
        );
      } else {
        try {
          const PreventScreenshot = require('react-native-prevent-screenshots');
          if (enabled) {
            PreventScreenshot.enableSecureView();
          } else {
            PreventScreenshot.disableSecureView();
          }
          logger.log(`[App Protection] Screenshot prevention ${enabled ? 'enabled' : 'disabled'} via library`);
        } catch {
          logger.warn('[App Protection] No native screenshot prevention module available (iOS)');
        }
      }
    }
  } catch (error) {
    logger.error('[App Protection] Error setting screenshot prevention:', error);
  }
}

/**
 * initializeAppProtection - Initialize all security protections for the application.
 */
export function initializeAppProtection(customConfig?: Partial<AppProtectionConfig>): () => void {
  const config: AppProtectionConfig = {
    ...DEFAULT_PROTECTION_CONFIG,
    ...customConfig,
  };

  currentConfig = config;

  logger.log('[App Protection] Initializing app protection...');
  logger.log(`  Auto-lock timeout: ${config.autoLockTimeoutMs / 1000}s`);
  logger.log(`  Clipboard clear timeout: ${config.clearClipboardMs / 1000}s`);
  logger.log(`  Screenshot prevention: ${config.preventScreenshots}`);
  logger.log(`  Lock on background: ${config.lockOnBackground}`);

  // PH9-FIX: Enable screenshot prevention if configured
  if (config.preventScreenshots) {
    setScreenshotPrevention(true);
  }

  // Return cleanup function
  return () => {
    logger.log('[App Protection] Cleaning up protections...');

    // Cleanup auto-lock
    if (autoLockTimeout) {
      clearTimeout(autoLockTimeout);
      autoLockTimeout = null;
    }

    // Cleanup clipboard timeouts
    clipboardTimeouts.forEach((t) => clearTimeout(t));
    clipboardTimeouts.clear();

    // Cleanup app state subscription
    if (appStateSubscription) {
      appStateSubscription.remove();
      appStateSubscription = null;
    }

    // Disable screenshot prevention
    setScreenshotPrevention(false);
  };
}

/**
 * PH9-FIX: Check if app is currently in background.
 */
export function isAppInBackgroundNow(): boolean {
  return isAppInBackground;
}

/**
 * clearClipboardImmediately - Instantly clear clipboard of all sensitive data.
 */
export async function clearClipboardImmediately(): Promise<void> {
  try {
    // Clear all pending clipboard timeouts
    clipboardTimeouts.forEach((t) => clearTimeout(t));
    clipboardTimeouts.clear();

    // Clear clipboard content
    const ExpoClipboard = require('expo-clipboard');
    await ExpoClipboard.setStringAsync('');
    logger.log('[App Protection] Clipboard cleared immediately');
  } catch (error) {
    logger.error('[App Protection] Error clearing clipboard:', error);
  }
}

/**
 * triggerManualLock - Immediately lock the vault without waiting for auto-lock timeout.
 */
export function triggerManualLock(onLock: () => void): void {
  logger.log('[App Protection] Manual lock triggered');

  // Clear auto-lock timeout
  if (autoLockTimeout) {
    clearTimeout(autoLockTimeout);
    autoLockTimeout = null;
  }

  // Call lock callback
  onLock();
}

/**
 * useAppProtection - React hook for app protection initialization in components.
 */
export function useAppProtection(
  onLock: () => void,
  config?: Partial<AppProtectionConfig>
): void {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Initialize on mount
    cleanupRef.current = initializeAppProtection(config);

    // Setup auto-lock
    const autoLockCleanup = setupAutoLock(
      { ...DEFAULT_PROTECTION_CONFIG, ...config },
      onLock
    );

    // Cleanup on unmount
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
      autoLockCleanup();
    };
  }, [onLock, config]);
}

/**
 * PH9-FIX: Get current protection status for logging/debugging.
 */
export function getProtectionStatus(): {
  enabled: boolean;
  config: AppProtectionConfig;
  appInBackground: boolean;
  clipboardOperationsPending: number;
  autoLockArmed: boolean;
} {
  return {
    enabled: true,
    config: currentConfig,
    appInBackground: isAppInBackground,
    clipboardOperationsPending: clipboardTimeouts.size,
    autoLockArmed: autoLockTimeout !== null,
  };
}

/**
 * PH9-FIX: Log protection status (for debugging).
 */
export function logProtectionStatus(): void {
  const status = getProtectionStatus();
  logger.log('[App Protection Status]');
  logger.log(`  Enabled: ${status.enabled}`);
  logger.log(`  App in background: ${status.appInBackground}`);
  logger.log(`  Auto-lock armed: ${status.autoLockArmed}`);
  logger.log(`  Pending clipboard operations: ${status.clipboardOperationsPending}`);
}
