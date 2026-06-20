/**
 * @deprecated This file is a legacy shim. The real implementation lives at
 * src/services/security/appProtection.ts which provides auto-lock, clipboard
 * clearing, screenshot prevention, and background lock functionality.
 *
 * Import from '@/services/security/appProtection' or '@/services/security' instead.
 */

export {
  setupAutoLock,
  copyWithAutoClear,
  setScreenshotPrevention,
  initializeAppProtection,
  isAppInBackgroundNow,
  clearClipboardImmediately,
  triggerManualLock,
  useAppProtection,
  getProtectionStatus,
  logProtectionStatus,
  DEFAULT_PROTECTION_CONFIG,
} from './security/appProtection';

export type { AppProtectionConfig } from './security/appProtection';
