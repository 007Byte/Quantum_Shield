/**
 * useSessionTimeoutWarning — Warns users before their web session expires.
 *
 * Monitors the sessionStorage-backed session and shows a warning modal
 * when the session has ≤ WARNING_BEFORE_MS remaining. The user can
 * extend their session (resets the 30-minute timer) or log out immediately.
 *
 * Only active on web when authenticated. Native session management is
 * handled separately by authStore's native session flow.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '@/stores/authStore';
import { logger, fireAndForget } from '@/utils/logger';
import { auditService } from '@/services/auditService';

const isWeb = Platform.OS === 'web';
const SESSION_KEY = 'usbvault:session';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // must match authStore
const WARNING_BEFORE_MS = 5 * 60 * 1000; // show warning at 5 min remaining
const TICK_INTERVAL_MS = 1000;

export interface SessionTimeoutState {
  /** Whether the warning modal should be visible */
  visible: boolean;
  /** Seconds remaining until session expires (counts down every second) */
  secondsLeft: number;
  /** Extend the session by resetting the 30-minute timer */
  extendSession: () => void;
  /** Log out immediately */
  logoutNow: () => void;
}

export function useSessionTimeoutWarning(): SessionTimeoutState {
  const [visible, setVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isAuthenticated = useAuthStore((s: any) => s.isAuthenticated);
  const lockVault = useAuthStore((s: any) => s.lockVault);

  const clearTick = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const getExpiresAt = useCallback((): number | null => {
    if (!isWeb || typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      return session.expiresAt ?? null;
    } catch {
      return null;
    }
  }, []);

  const extendSession = useCallback(() => {
    if (!isWeb || typeof sessionStorage === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      session.expiresAt = Date.now() + SESSION_TIMEOUT_MS;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
      setVisible(false);
      clearTick();
      fireAndForget(auditService.log('system', 'session_extended', {}), {
        context: 'sessionTimeout.extend',
        severity: 'warn',
      });
      logger.debug('[SessionTimeout] Session extended by user');
    } catch {
      // If we can't extend, do nothing — session monitor will handle logout
    }
  }, [clearTick]);

  const logoutNow = useCallback(() => {
    setVisible(false);
    clearTick();
    fireAndForget(auditService.log('logout', 'user_initiated_from_timeout_warning', {}), {
      context: 'sessionTimeout.logout',
      severity: 'warn',
    });
    lockVault();
  }, [lockVault, clearTick]);

  useEffect(() => {
    if (!isWeb || !isAuthenticated) {
      setVisible(false);
      clearTick();
      return;
    }

    // Check every 10 seconds whether we need to show the warning
    const checkInterval = setInterval(() => {
      const expiresAt = getExpiresAt();
      if (!expiresAt) return;

      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        // Already expired — session monitor will handle logout
        setVisible(false);
        clearTick();
        return;
      }

      if (remaining <= WARNING_BEFORE_MS && !visible) {
        setVisible(true);
        setSecondsLeft(Math.ceil(remaining / 1000));
        logger.debug(`[SessionTimeout] Warning shown — ${Math.ceil(remaining / 1000)}s remaining`);
      }
    }, 10_000);

    return () => {
      clearInterval(checkInterval);
      clearTick();
    };
  }, [isAuthenticated, visible, getExpiresAt, clearTick]);

  // Countdown tick — only runs when modal is visible
  useEffect(() => {
    if (!visible) {
      clearTick();
      return;
    }

    intervalRef.current = setInterval(() => {
      const expiresAt = getExpiresAt();
      if (!expiresAt) {
        setVisible(false);
        clearTick();
        return;
      }
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);

      if (remaining <= 0) {
        setVisible(false);
        clearTick();
        // Session monitor in authStore handles the actual logout
      }
    }, TICK_INTERVAL_MS);

    return clearTick;
  }, [visible, getExpiresAt, clearTick]);

  return { visible, secondsLeft, extendSession, logoutNow };
}
