/**
 * PH9: Screen Protection Service — prevent screenshots and screen recording
 *
 * Uses expo-screen-capture on native platforms to prevent screen capture.
 * No-op on web where the API is not applicable.
 *
 * Usage:
 *   screenProtection.enable()   — call when viewing sensitive screens
 *   screenProtection.disable()  — call when leaving sensitive screens
 */

import { Platform } from 'react-native';
import { logger } from '@/utils/logger';

class ScreenProtectionService {
  private _enabled = false;

  /** Whether screen capture prevention is currently active */
  get isEnabled(): boolean {
    return this._enabled;
  }

  /** Prevent screenshots and screen recording (native only) */
  async enable(): Promise<void> {
    if (Platform.OS === 'web') return;
    if (this._enabled) return;

    try {
      const ScreenCapture = require('expo-screen-capture') as {
        preventScreenCaptureAsync: () => Promise<void>;
      };
      await ScreenCapture.preventScreenCaptureAsync();
      this._enabled = true;
      logger.log('[ScreenProtection] Enabled — screenshots blocked');
    } catch (e: unknown) {
      logger.warn('[ScreenProtection] Failed to enable:', e);
    }
  }

  /** Allow screenshots again (native only) */
  async disable(): Promise<void> {
    if (Platform.OS === 'web') return;
    if (!this._enabled) return;

    try {
      const ScreenCapture = require('expo-screen-capture') as {
        allowScreenCaptureAsync: () => Promise<void>;
      };
      await ScreenCapture.allowScreenCaptureAsync();
      this._enabled = false;
      logger.log('[ScreenProtection] Disabled — screenshots allowed');
    } catch (e: unknown) {
      logger.warn('[ScreenProtection] Failed to disable:', e);
    }
  }

  /**
   * Toggle screen protection based on a boolean.
   * Convenience wrapper for settings toggle.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      await this.enable();
    } else {
      await this.disable();
    }
  }
}

/** Singleton screen protection service */
export const screenProtection = new ScreenProtectionService();
