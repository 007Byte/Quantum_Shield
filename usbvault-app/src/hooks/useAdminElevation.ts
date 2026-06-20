/**
 * useAdminElevation — Shared hook for OS-level admin elevation flow.
 *
 * Encapsulates the state machine for prompting the user for an admin/root
 * password before operations that require elevated privileges (USB provisioning,
 * zero-trace cleanup, drive reset, etc.).
 *
 * UI-agnostic: no React Native imports — just React state primitives.
 * Pair with <AdminElevationModal /> for the visual component.
 */

import { useState, useCallback } from 'react';
import { usbService } from '@/services/usbService';

// ── Types ──────────────────────────────────────────────────────────────

export interface AdminElevationState {
  /** Whether the admin elevation modal should be shown */
  needed: boolean;
  /** Current password value (cleared after submit or cancel) */
  password: string;
  /** Inline error to display in the modal */
  error: string | null;
  /** Whether an elevated operation is currently in progress */
  elevating: boolean;
  /** Detected OS platform (macos, linux, windows, unknown) */
  platform: string;
  /** How many attempts remain before rate-limit lockout */
  attemptsRemaining: number;
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 5;

/** Platform-specific prompt text for the password field. */
const PLATFORM_DESCRIPTIONS: Record<string, string> = {
  macos:
    'Enter your Mac login password to continue. This password is only used locally and is never stored.',
  darwin:
    'Enter your Mac login password to continue. This password is only used locally and is never stored.',
  linux: 'Enter your password to continue. This password is only used locally and is never stored.',
  windows: 'Administrator access is required to continue. Approve the UAC prompt to proceed.',
};

const DEFAULT_DESCRIPTION =
  'Administrator privileges are required. Enter your password to continue. This password is only used locally and is never stored.';

// ── Hook ───────────────────────────────────────────────────────────────

export function useAdminElevation() {
  const [needed, setNeeded] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elevating, setElevating] = useState(false);
  const [platform, setPlatform] = useState('unknown');
  const [attemptsRemaining, setAttemptsRemaining] = useState(MAX_ATTEMPTS);

  // ── Derived state object ───────────────────────────────────────────

  const state: AdminElevationState = {
    needed,
    password,
    error,
    elevating,
    platform,
    attemptsRemaining,
  };

  // ── Actions ────────────────────────────────────────────────────────

  /**
   * Ask the USB Companion Service whether the current platform requires
   * admin elevation for privileged operations.
   *
   * @returns `true` if admin elevation is needed (modal should be shown),
   *          `false` if the operation can proceed without elevation.
   */
  const requestElevation = useCallback(async (driveId?: string): Promise<boolean> => {
    try {
      const preflight = await usbService.provisionPreflight(driveId);
      setPlatform(preflight.platform || 'unknown');
      if (preflight.needsAdmin) {
        setNeeded(true);
        setError(null);
        setAttemptsRemaining(MAX_ATTEMPTS);
        return true;
      }
      return false;
    } catch {
      // If preflight fails, assume admin is needed as a safe default
      setPlatform('unknown');
      setNeeded(true);
      setError(null);
      setAttemptsRemaining(MAX_ATTEMPTS);
      return true;
    }
  }, []);

  /**
   * Set the password value. Separate setter so the modal can bind to
   * onChangeText without importing the full hook return.
   */
  const setPasswordValue = useCallback(
    (pw: string) => {
      setPassword(pw);
      // Clear previous error when user starts typing again
      if (error) setError(null);
    },
    [error]
  );

  /**
   * Submit the admin password. Runs the provided callback with the
   * password, then clears the password from state regardless of outcome.
   *
   * @param callback - Async function to execute with the admin password
   *                   (e.g., provisioning, zero-trace cleanup)
   */
  const submit = useCallback(
    async (callback: (password: string) => Promise<void>): Promise<void> => {
      const pw = password.trim();
      if (!pw) {
        setError('Password is required');
        return;
      }

      setElevating(true);
      setError(null);

      try {
        await callback(pw);
        // Success — close the modal and clear all state
        setNeeded(false);
        setPassword('');
        setError(null);
        setAttemptsRemaining(MAX_ATTEMPTS);
      } catch (err: unknown) {
        // Let handleError inspect the error; if it's not an admin error,
        // re-throw so the caller can handle it
        const wasHandled = _handleErrorInternal(err);
        if (!wasHandled) {
          // Clear password but keep modal open for unrecognized errors
          setPassword('');
          throw err;
        }
      } finally {
        setElevating(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [password, attemptsRemaining]
  );

  /**
   * Cancel the elevation flow. Clears password and hides the modal.
   */
  const cancel = useCallback(() => {
    setNeeded(false);
    setPassword('');
    setError(null);
    setElevating(false);
  }, []);

  /**
   * Inspect an error for admin-related status codes.
   *
   * - 409 + ADMIN_REQUIRED  → show the elevation modal
   * - 401 + ADMIN_AUTH_FAILED → show inline error, decrement attempts
   *
   * @returns `true` if the error was recognized and handled,
   *          `false` if the caller should handle it normally.
   */
  const handleError = useCallback(
    (err: unknown): boolean => {
      return _handleErrorInternal(err);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [attemptsRemaining]
  );

  /**
   * Internal error handler (shared between submit and handleError).
   * Not wrapped in useCallback so submit's closure can access current state.
   */
  function _handleErrorInternal(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;

    // Check for .code property (set by usbService error normalization)
    const errObj = err as Error & {
      code?: string;
      response?: { status?: number; data?: { code?: string; message?: string } };
    };

    // Pattern 1: usbService already normalized the error with a .code
    if (errObj.code === 'ADMIN_REQUIRED') {
      setNeeded(true);
      setError(null);
      setPassword('');
      return true;
    }

    if (errObj.code === 'ADMIN_AUTH_FAILED') {
      const remaining = Math.max(0, attemptsRemaining - 1);
      setAttemptsRemaining(remaining);
      setError(
        remaining === 0
          ? 'Too many failed attempts. Please try again later.'
          : 'Incorrect password. Please try again.'
      );
      setPassword('');
      return true;
    }

    // Pattern 2: Raw Axios error with response.status + response.data.code
    if ('response' in errObj && errObj.response) {
      const { status, data } = errObj.response;

      if (status === 409 && data?.code === 'ADMIN_REQUIRED') {
        setNeeded(true);
        setError(null);
        setPassword('');
        return true;
      }

      if (status === 401 && data?.code === 'ADMIN_AUTH_FAILED') {
        const remaining = Math.max(0, attemptsRemaining - 1);
        setAttemptsRemaining(remaining);
        setError(
          remaining === 0
            ? 'Too many failed attempts. Please try again later.'
            : (data.message ?? 'Incorrect password. Please try again.')
        );
        setPassword('');
        return true;
      }
    }

    return false;
  }

  // ── Platform description helper ────────────────────────────────────

  /**
   * Get the platform-specific description text for the elevation modal.
   */
  const getPlatformDescription = useCallback((): string => {
    return PLATFORM_DESCRIPTIONS[platform.toLowerCase()] ?? DEFAULT_DESCRIPTION;
  }, [platform]);

  /**
   * Get the platform-specific placeholder text for the password input.
   */
  const getPlaceholder = useCallback((): string => {
    const p = platform.toLowerCase();
    if (p === 'macos' || p === 'darwin') return 'Mac login password';
    if (p === 'linux') return 'Password';
    if (p === 'windows') return 'Administrator password';
    return 'Password';
  }, [platform]);

  return {
    state,
    setPassword: setPasswordValue,
    requestElevation,
    submit,
    cancel,
    handleError,
    getPlatformDescription,
    getPlaceholder,
  };
}
