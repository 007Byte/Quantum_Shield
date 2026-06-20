/**
 * App Password Gate — V2.0 Fortress Spec §5 / §9
 *
 * Separate app-level password (distinct from vault master password) that
 * protects app settings access. Uses PBKDF2-SHA256 with 150,000 iterations.
 *
 * This is NOT the vault password — it protects the app configuration layer.
 * The vault password protects encrypted data via Argon2id.
 *
 * Constants (from spec):
 *   APP_PASSWORD_MIN_LENGTH = 12
 *   APP_MAX_LOGIN_ATTEMPTS = 3
 *   APP_LOCKOUT_SECONDS = 30
 *   APP_PASSWORD_PBKDF2_ITERS = 150000
 *
 * @module services/security/appPasswordService
 */

import { logger, fireAndForget } from '@/utils/logger';
import { auditService } from '@/services/auditService';

// ── Constants (V2.0 Fortress Spec §9) ──────────────────────

const APP_PASSWORD_MIN_LENGTH = 12;
const APP_MAX_LOGIN_ATTEMPTS = 3;
const APP_LOCKOUT_SECONDS = 30;
const APP_PASSWORD_PBKDF2_ITERS = 150000;
const STORAGE_KEY = 'usbvault:app_password';

// ── Types ──────────────────────────────────────────────────

interface StoredAppPassword {
  /** Base64-encoded PBKDF2 hash */
  hash: string;
  /** Base64-encoded 32-byte salt */
  salt: string;
  /** Iteration count (stored for future migration if needed) */
  iterations: number;
  /** When the password was set */
  createdAt: string;
}

// ── Helpers ────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Derive PBKDF2-SHA256 hash of a password with the given salt.
 */
async function pbkdf2Hash(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);

  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt.buffer as ArrayBuffer,
      iterations: APP_PASSWORD_PBKDF2_ITERS,
    },
    keyMaterial,
    256 // 32 bytes output
  );
}

/**
 * Constant-time comparison of two ArrayBuffers.
 * Prevents timing attacks on password verification.
 */
function constantTimeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  const va = new Uint8Array(a);
  const vb = new Uint8Array(b);
  if (va.length !== vb.length) return false;
  let diff = 0;
  for (let i = 0; i < va.length; i++) {
    diff |= va[i] ^ vb[i];
  }
  return diff === 0;
}

// ── Service ────────────────────────────────────────────────

class AppPasswordServiceImpl {
  private failCount = 0;
  private lockoutUntil = 0;

  /**
   * Check if an app password has been configured.
   */
  isAppPasswordSet(): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== null;
    } catch {
      return false;
    }
  }

  /**
   * Set a new app password. Validates minimum length.
   * Stores PBKDF2 hash + salt in localStorage (NOT the password).
   */
  async setAppPassword(password: string): Promise<void> {
    if (password.length < APP_PASSWORD_MIN_LENGTH) {
      throw new Error(`App password must be at least ${APP_PASSWORD_MIN_LENGTH} characters`);
    }

    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    const hash = await pbkdf2Hash(password, salt);

    const stored: StoredAppPassword = {
      hash: arrayBufferToBase64(hash),
      salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
      iterations: APP_PASSWORD_PBKDF2_ITERS,
      createdAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      throw new Error('Failed to save app password');
    }

    fireAndForget(auditService.log('system', 'app_password_set', {}, 'success'));
    logger.info('[AppPassword] App password configured');
  }

  /**
   * Verify an app password attempt. Enforces lockout after max attempts.
   *
   * @returns true if password matches, false if wrong
   * @throws Error if locked out
   */
  async verifyAppPassword(password: string): Promise<boolean> {
    // Check lockout
    if (this.lockoutUntil > Date.now()) {
      const remainingSec = Math.ceil((this.lockoutUntil - Date.now()) / 1000);
      throw new Error(`Too many failed attempts. Try again in ${remainingSec} seconds.`);
    }

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      throw new Error('No app password configured');
    }

    const stored: StoredAppPassword = JSON.parse(raw);
    const salt = new Uint8Array(base64ToArrayBuffer(stored.salt));
    const expectedHash = base64ToArrayBuffer(stored.hash);

    const computedHash = await pbkdf2Hash(password, salt);

    if (constantTimeEqual(computedHash, expectedHash)) {
      // Success — reset fail counter
      this.failCount = 0;
      this.lockoutUntil = 0;
      fireAndForget(auditService.log('system', 'app_password_verified', {}, 'success'));
      return true;
    }

    // Failure — increment counter, check lockout
    this.failCount++;
    fireAndForget(
      auditService.log(
        'system',
        'app_password_failed',
        {
          attempt: this.failCount,
          maxAttempts: APP_MAX_LOGIN_ATTEMPTS,
        },
        'warning'
      )
    );

    if (this.failCount >= APP_MAX_LOGIN_ATTEMPTS) {
      this.lockoutUntil = Date.now() + APP_LOCKOUT_SECONDS * 1000;
      this.failCount = 0;
      logger.warn(`[AppPassword] Lockout triggered for ${APP_LOCKOUT_SECONDS}s`);
    }

    return false;
  }

  /**
   * Remove the app password (disabling the gate).
   * Requires verifying the current password first.
   */
  async removeAppPassword(currentPassword: string): Promise<void> {
    const valid = await this.verifyAppPassword(currentPassword);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }

    localStorage.removeItem(STORAGE_KEY);
    fireAndForget(auditService.log('system', 'app_password_removed', {}, 'success'));
    logger.info('[AppPassword] App password removed');
  }

  /**
   * Change the app password. Requires verifying the current password.
   */
  async changeAppPassword(currentPassword: string, newPassword: string): Promise<void> {
    const valid = await this.verifyAppPassword(currentPassword);
    if (!valid) {
      throw new Error('Current password is incorrect');
    }

    await this.setAppPassword(newPassword);
    fireAndForget(auditService.log('system', 'app_password_changed', {}, 'success'));
  }

  /**
   * Get remaining lockout time in seconds (0 if not locked out).
   */
  getLockoutRemaining(): number {
    if (this.lockoutUntil <= Date.now()) return 0;
    return Math.ceil((this.lockoutUntil - Date.now()) / 1000);
  }

  /**
   * Get the number of failed attempts in the current session.
   */
  getFailCount(): number {
    return this.failCount;
  }
}

export const appPasswordService = new AppPasswordServiceImpl();
