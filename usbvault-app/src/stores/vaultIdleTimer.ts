/**
 * vaultIdleTimer — 15-minute idle auto-lock side-effect module.
 *
 * Not a store. Clears vault session keys after inactivity.
 * Web-only — native uses OS-level lock.
 */

import { Platform } from 'react-native';
import { auditService } from '@/services/auditService';
import { logger, fireAndForget } from '@/utils/logger';

const IDLE_LOCK_MS = 15 * 60_000;
let _idleTimer: ReturnType<typeof setTimeout> | null = null;
let _onLock: (() => void) | null = null;

/** Register the lock callback (called by vaultSessionStore on init) */
export function setIdleLockCallback(cb: () => void): void {
  _onLock = cb;
}

export function resetIdleTimer(): void {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    if (_onLock) {
      fireAndForget(auditService.log('vault_lock', 'idle_timeout', { timeout: IDLE_LOCK_MS }));
      _onLock();
      logger.info('[vaultIdleTimer] Vault auto-locked after idle timeout');
    }
  }, IDLE_LOCK_MS);
}

export function stopIdleTimer(): void {
  if (_idleTimer) {
    clearTimeout(_idleTimer);
    _idleTimer = null;
  }
}

// Attach interaction listeners on web
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const idleEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;
  for (const event of idleEvents) {
    document.addEventListener(event, resetIdleTimer, { passive: true });
  }
}
