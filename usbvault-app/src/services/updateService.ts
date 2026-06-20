/**
 * OTA Update Service — expo-updates integration
 *
 * Checks for over-the-air updates on app launch and foreground resume.
 * When an update is available, downloads it in the background and applies
 * it on the next app restart.
 *
 * In development builds (where expo-updates is not available), all methods
 * are safe no-ops.
 */

import { Platform, AppState, type AppStateStatus } from 'react-native';
import { logger } from '@/utils/logger';

interface UpdateStatus {
  isAvailable: boolean;
  isDownloading: boolean;
  isReady: boolean;
  lastChecked: Date | null;
  error: string | null;
}

class UpdateServiceImpl {
  private initialized = false;
  private appStateSubscription: { remove: () => void } | null = null;
  private status: UpdateStatus = {
    isAvailable: false,
    isDownloading: false,
    isReady: false,
    lastChecked: null,
    error: null,
  };

  /**
   * Initialize the update service.
   * Sets up an AppState listener to check for updates when the app
   * returns to the foreground.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // expo-updates is not available in Expo Go or dev builds
    if (!this.isUpdatesAvailable()) {
      logger.log('[UpdateService] expo-updates not available (development mode)');
      this.initialized = true;
      return;
    }

    // Check on launch
    await this.checkForUpdates();

    // Check when app returns to foreground
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

    this.initialized = true;
    logger.log('[UpdateService] Initialized');
  }

  /**
   * Check if expo-updates runtime is available.
   * Returns false in Expo Go, dev builds, and web.
   */
  private isUpdatesAvailable(): boolean {
    if (Platform.OS === 'web') return false;
    try {
      const Updates = require('expo-updates');
      return Updates && typeof Updates.checkForUpdateAsync === 'function';
    } catch {
      return false;
    }
  }

  /**
   * Handle app state changes — check for updates when returning to foreground.
   */
  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    if (nextAppState === 'active') {
      this.checkForUpdates();
    }
  };

  /**
   * Check for available OTA updates.
   * If an update is available, downloads and stages it for the next restart.
   */
  async checkForUpdates(): Promise<UpdateStatus> {
    if (!this.isUpdatesAvailable()) return this.status;

    try {
      const Updates = require('expo-updates');

      const checkResult = await Updates.checkForUpdateAsync();
      this.status.lastChecked = new Date();
      this.status.isAvailable = checkResult.isAvailable;

      if (checkResult.isAvailable) {
        logger.log('[UpdateService] Update available, downloading...');
        this.status.isDownloading = true;

        const fetchResult = await Updates.fetchUpdateAsync();
        this.status.isDownloading = false;
        this.status.isReady = fetchResult.isNew;

        if (fetchResult.isNew) {
          logger.log('[UpdateService] Update downloaded — will apply on next restart');
        }
      }

      this.status.error = null;
    } catch (error: any) {
      this.status.isDownloading = false;
      this.status.error = error?.message || 'Update check failed';
      logger.warn('[UpdateService] Update check failed:', error);
    }

    return this.status;
  }

  /**
   * Force-apply a downloaded update by reloading the app.
   * Only call this when the user has confirmed they want to restart.
   */
  async applyUpdate(): Promise<void> {
    if (!this.isUpdatesAvailable() || !this.status.isReady) return;

    try {
      const Updates = require('expo-updates');
      await Updates.reloadAsync();
    } catch (error) {
      logger.error('[UpdateService] Failed to apply update:', error);
    }
  }

  /** Get current update status */
  getStatus(): UpdateStatus {
    return { ...this.status };
  }

  /** Cleanup listeners */
  destroy(): void {
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
  }
}

export const updateService = new UpdateServiceImpl();
