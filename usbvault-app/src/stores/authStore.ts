import { Platform } from 'react-native';
import { create } from 'zustand';
import * as authService from '@/services/auth';
import * as api from '@/services/api';
import * as srp from '@/crypto/srpClient';
import { auditService } from '@/services/auditService';
import { fido2Service } from '@/services/fido2Service';
import type { Fido2Device } from '@/services/fido2Service';
import { stopVaultPolling } from '@/stores/vaultPolling';
import { stopIdleTimer } from '@/stores/vaultIdleTimer';
import { cleanupStoreSubscriptions } from '@/stores/storeCleanup';

const isWeb = Platform.OS === 'web';

// ── Web-local auth helpers (real Argon2id + SRP-6a verifier) ───

const WEB_SESSION_KEY = 'usbvault:session';

// Web-local auth storage
// On web, the entire auth flow is local (no backend). Credentials are persisted
// to localStorage so accounts survive page refreshes during testing.
// When a backend is connected, this local auth is bypassed entirely in favor
// of SRP-6a authentication against the server.

const WEB_AUTH_KEY = 'usbvault:auth';

interface StoredAuth {
  email: string;
  /**
   * SRP-6a salt (32-byte hex) used to derive the verifier. Random per-account.
   */
  srpSaltHex: string;
  /**
   * SRP-6a verifier v = g^x mod N (hex), where x is derived from
   * (salt, email, password) via Argon2id — the SAME memory-hard derivation used
   * by the native/server path (crypto/srpClient.ts, usbvault-crypto/src/srp_client.rs).
   * The password itself is never stored.
   */
  srpVerifierHex: string;
  userId: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  createdAt: string;
}

/**
 * SECURITY FIX (WEB-PWD): The web-local auth path previously hashed passwords with a
 * single unsalted SHA-256 (plus an even weaker non-crypto fallback) — no work factor,
 * no salt, no mutual auth. That insecure path has been REMOVED entirely.
 *
 * F7: Web-local credentials now use the REAL SRP-6a verifier. We derive the SRP
 * private key x from (salt, email, password) with Argon2id (memory-hard, identical
 * params to the native path) and store only the verifier v = g^x mod N. On login we
 * re-derive the verifier and compare in constant time. No password and no SHA-256
 * password digest is ever persisted, in dev or production.
 *
 * @returns the SRP-6a verifier (hex) for the given salt/email/password.
 */
async function computeWebVerifier(
  email: string,
  password: string,
  saltBytes: Uint8Array
): Promise<string> {
  const x = await srp.deriveSrpX(saltBytes, email, password);
  const v = srp.deriveVerifier(x);
  return Buffer.from(srp.bigIntToBytes(v)).toString('hex');
}

/** Constant-time-ish comparison of two equal-length hex strings. */
function verifierMatches(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function getStoredAuth(): StoredAuth | null {
  if (!isWeb) return null;
  try {
    const raw = localStorage.getItem(WEB_AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveStoredAuth(auth: StoredAuth): void {
  if (!isWeb) return;
  try {
    localStorage.setItem(WEB_AUTH_KEY, JSON.stringify(auth));
  } catch {
    // Silent fail — localStorage may be unavailable in some contexts
  }
}

function getSession(): { email: string; userId: string; subscriptionTier: string } | null {
  if (!isWeb) return null;
  try {
    const raw = sessionStorage.getItem(WEB_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(email: string, userId: string, subscriptionTier: string): void {
  if (!isWeb) return;
  try {
    sessionStorage.setItem(WEB_SESSION_KEY, JSON.stringify({ email, userId, subscriptionTier }));
    // Also set userId for audit service
    sessionStorage.setItem('usbvault:userId', userId);
  } catch {
    // Silent fail
  }
}

function clearSession(): void {
  if (!isWeb) return;
  try {
    sessionStorage.removeItem(WEB_SESSION_KEY);
    sessionStorage.removeItem('usbvault:userId');
  } catch {
    // Silent fail
  }
}

// ── Store ──────────────────────────────────────────────────────

export interface AuthState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  email: string | null;
  subscriptionTier: 'free' | 'pro' | 'enterprise' | null;
  error: string | null;

  // SG-011: FIDO2/WebAuthn state
  /** Whether FIDO2 is available in this environment */
  fido2Available: boolean;
  /** Whether the user has registered FIDO2 devices */
  fido2Enabled: boolean;
  /** Number of registered FIDO2 devices */
  fido2DeviceCount: number;
  /** Whether FIDO2 second-factor was completed for this session */
  fido2Verified: boolean;

  // Actions
  login: (email: string, password: string) => Promise<void>;
  /**
   * SG-011: Passwordless sign-in with a registered FIDO2 security key / passkey.
   * Single-factor WebAuthn login for the locally-stored account (web only).
   */
  loginWithFido2: () => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
  lockVault: () => void;

  // SG-011: FIDO2 actions
  /** Register a new FIDO2 security key or passkey */
  registerFido2Device: (deviceName: string) => Promise<Fido2Device>;
  /** Authenticate with a registered FIDO2 device (second factor) */
  verifyFido2: () => Promise<boolean>;
  /** Remove a registered FIDO2 device */
  removeFido2Device: (deviceId: string) => Promise<void>;
  /** Refresh FIDO2 availability and device count */
  refreshFido2Status: () => void;
}

export const useAuthStore = create<AuthState>(set => ({
  // Start unauthenticated — checkAuth will restore session if valid
  isAuthenticated: false,
  isLoading: false,
  userId: null,
  email: null,
  subscriptionTier: null,
  error: null,

  // SG-011: FIDO2 initial state
  fido2Available: isWeb && fido2Service.isWebAuthnSupported(),
  fido2Enabled: fido2Service.getDeviceCount() > 0,
  fido2DeviceCount: fido2Service.getDeviceCount(),
  fido2Verified: false,

  // Login action
  login: async (email: string, password: string) => {
    if (isWeb) {
      set({ isLoading: true, error: null });
      try {
        const stored = getStoredAuth();
        if (!stored) {
          throw new Error('No account found. Please register first.');
        }

        // F7: Re-derive the SRP-6a verifier from the stored salt and compare.
        const saltBytes = Uint8Array.from(Buffer.from(stored.srpSaltHex, 'hex'));
        const verifier = await computeWebVerifier(email, password, saltBytes);
        if (stored.email !== email || !verifierMatches(stored.srpVerifierHex, verifier)) {
          auditService
            .log('failed_login', email, { reason: 'invalid_credentials' }, 'error')
            .catch(() => {});
          throw new Error('Invalid email or password.');
        }

        // SG-011: Check if FIDO2 second factor is required
        const fido2Required =
          fido2Service.getDeviceCount() > 0 && fido2Service.isWebAuthnSupported();
        let fido2Passed = false;

        if (fido2Required) {
          try {
            const device = await fido2Service.authenticate();
            fido2Passed = device !== null;
            if (!fido2Passed) {
              auditService
                .log('failed_login', email, { reason: 'fido2_rejected' }, 'error')
                .catch(() => {});
              throw new Error('FIDO2 authentication required. Please use your security key.');
            }
            auditService.log('fido2_authenticate', email, { deviceId: device?.id }).catch(() => {});
          } catch (fido2Error) {
            if (
              fido2Error instanceof Error &&
              fido2Error.message.includes('FIDO2 authentication required')
            ) {
              throw fido2Error;
            }
            auditService
              .log(
                'failed_login',
                email,
                { reason: 'fido2_failed', error: String(fido2Error) },
                'error'
              )
              .catch(() => {});
            throw new Error(
              'FIDO2 authentication failed. Please try again with your security key.'
            );
          }
        }

        saveSession(email, stored.userId, stored.subscriptionTier);
        set({
          isAuthenticated: true,
          userId: stored.userId,
          email: stored.email,
          subscriptionTier: stored.subscriptionTier,
          isLoading: false,
          fido2Verified: fido2Required ? fido2Passed : false,
        });
        auditService.log('login', email, { fido2Used: fido2Required }).catch(() => {});
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Login failed';
        set({ isAuthenticated: false, error: message, isLoading: false });
        throw error;
      }
      return;
    }
    set({ isLoading: true, error: null });
    try {
      await authService.login(email, password);
      const userInfo = await api.getUserInfo();
      set({
        isAuthenticated: true,
        userId: userInfo.id,
        email: userInfo.email,
        subscriptionTier: userInfo.subscriptionTier as any,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      auditService.log('failed_login', email, { error: message }, 'error').catch(() => {});
      set({ isAuthenticated: false, error: message, isLoading: false });
      throw error;
    }
  },

  // SG-011: Passwordless login with a registered FIDO2 security key / passkey.
  // The "Security Key" button on the login screen has no password field, so this is
  // a single-factor WebAuthn login: prove possession (+ user verification) of a
  // registered authenticator, then establish the session for the locally-stored
  // account. Requires an existing account on this device with >=1 FIDO2 device.
  loginWithFido2: async () => {
    if (!isWeb) {
      // Native FIDO2-primary login needs the server WebAuthn assertion endpoint;
      // until that path is wired, native users sign in with their password.
      throw new Error('Security key sign-in is currently available on the web app only.');
    }
    set({ isLoading: true, error: null });
    const stored = getStoredAuth();
    try {
      if (!stored) {
        throw new Error(
          'No account found on this device. Please sign in with your password first.'
        );
      }
      if (!fido2Service.isWebAuthnSupported()) {
        throw new Error('Security keys are not supported in this browser.');
      }
      if (fido2Service.getDeviceCount() === 0) {
        throw new Error(
          'No security key registered. Sign in with your password, then add one in Settings.'
        );
      }

      // WebAuthn assertion against the registered authenticators. Passwordless is
      // single-factor, so require user verification (PIN/biometric) — the ceremony
      // fails closed if the authenticator can't perform UV, preventing a
      // possession-only sign-in.
      const device = await fido2Service.authenticate({ userVerification: 'required' });
      if (!device) {
        throw new Error('Security key authentication was not completed.');
      }

      saveSession(stored.email, stored.userId, stored.subscriptionTier);
      set({
        isAuthenticated: true,
        userId: stored.userId,
        email: stored.email,
        subscriptionTier: stored.subscriptionTier,
        isLoading: false,
        fido2Verified: true,
      });
      auditService
        .log('login', stored.email, { method: 'security_key', deviceId: device.id })
        .catch(() => {});
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Security key sign-in failed';
      auditService
        .log(
          'failed_login',
          stored?.email ?? 'unknown',
          { reason: 'security_key', error: message },
          'error'
        )
        .catch(() => {});
      set({ isAuthenticated: false, error: message, isLoading: false });
      throw error;
    }
  },

  // Register action
  register: async (email: string, password: string) => {
    if (isWeb) {
      set({ isLoading: true, error: null });
      try {
        const existing = getStoredAuth();
        if (existing && existing.email === email) {
          throw new Error('An account with this email already exists. Please login instead.');
        }

        // F7: Generate a random SRP salt and store the REAL Argon2id-derived
        // verifier (v = g^x mod N). The password is never persisted.
        const saltBytes = crypto.getRandomValues(new Uint8Array(32));
        const srpSaltHex = Buffer.from(saltBytes).toString('hex');
        const srpVerifierHex = await computeWebVerifier(email, password, saltBytes);
        const userId = `user-${Date.now().toString(36)}`;
        const auth: StoredAuth = {
          email,
          srpSaltHex,
          srpVerifierHex,
          userId,
          subscriptionTier: 'enterprise',
          createdAt: new Date().toISOString(),
        };
        saveStoredAuth(auth);
        saveSession(email, userId, auth.subscriptionTier);
        set({
          isAuthenticated: true,
          userId,
          email,
          subscriptionTier: auth.subscriptionTier,
          isLoading: false,
        });
        auditService.log('login', email, { type: 'registration' }).catch(() => {});
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Registration failed';
        set({ isAuthenticated: false, error: message, isLoading: false });
        throw error;
      }
      return;
    }
    set({ isLoading: true, error: null });
    try {
      await authService.register(email, password);
      const userInfo = await api.getUserInfo();
      set({
        isAuthenticated: true,
        userId: userInfo.id,
        email: userInfo.email,
        subscriptionTier: userInfo.subscriptionTier as any,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed';
      set({ isAuthenticated: false, error: message, isLoading: false });
      throw error;
    }
  },

  // Logout action
  logout: async () => {
    // RELIABILITY FIX (H-3): Clean up all background processes on logout.
    // Previously, the web path returned early without stopping vault polling,
    // idle timer, or store subscriptions — causing post-logout error storms.
    stopVaultPolling();
    stopIdleTimer();
    cleanupStoreSubscriptions();

    if (isWeb) {
      auditService.log('logout', 'web-session').catch(() => {});
      clearSession();
      set({
        isAuthenticated: false,
        userId: null,
        email: null,
        subscriptionTier: null,
        isLoading: false,
      });
      return;
    }
    set({ isLoading: true });
    try {
      await authService.logout();
      set({
        isAuthenticated: false,
        userId: null,
        email: null,
        subscriptionTier: null,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // Check authentication status
  checkAuth: async () => {
    if (isWeb) {
      // Restore session from sessionStorage
      const session = getSession();
      if (session) {
        set({
          isAuthenticated: true,
          userId: session.userId,
          email: session.email,
          subscriptionTier: session.subscriptionTier as any,
        });
      } else {
        set({ isAuthenticated: false, userId: null, email: null, subscriptionTier: null });
      }
      return;
    }
    set({ isLoading: true });
    try {
      const authenticated = await authService.isAuthenticated();
      if (authenticated) {
        const userInfo = await api.getUserInfo();
        set({
          isAuthenticated: true,
          userId: userInfo.id,
          email: userInfo.email,
          subscriptionTier: userInfo.subscriptionTier as any,
          isLoading: false,
        });
      } else {
        set({
          isAuthenticated: false,
          userId: null,
          email: null,
          subscriptionTier: null,
          isLoading: false,
        });
      }
    } catch (error) {
      set({
        isAuthenticated: false,
        userId: null,
        email: null,
        subscriptionTier: null,
        isLoading: false,
      });
    }
  },

  // Clear error message
  clearError: () => {
    set({ error: null });
  },

  // Lock vault (clear master key)
  lockVault: () => {
    if (isWeb) {
      clearSession();
    } else {
      authService.clearMasterKey();
    }
    set({
      isAuthenticated: false,
      userId: null,
      email: null,
      subscriptionTier: null,
      fido2Verified: false,
    });
  },

  // SG-011: Register a new FIDO2 security key
  registerFido2Device: async (deviceName: string) => {
    set({ isLoading: true, error: null });
    try {
      const device = await fido2Service.registerDevice(deviceName);
      const deviceCount = fido2Service.getDeviceCount();
      set({
        fido2Enabled: true,
        fido2DeviceCount: deviceCount,
        isLoading: false,
      });
      auditService.log('fido2_register', deviceName, { deviceId: device.id }).catch(() => {});
      return device;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FIDO2 registration failed';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // SG-011: Verify identity with FIDO2 device (second factor after password)
  verifyFido2: async () => {
    set({ isLoading: true, error: null });
    try {
      const device = await fido2Service.authenticate();
      if (device) {
        set({ fido2Verified: true, isLoading: false });
        auditService
          .log('fido2_authenticate', device.name, { deviceId: device.id })
          .catch(() => {});
        return true;
      }
      set({ fido2Verified: false, isLoading: false });
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'FIDO2 authentication failed';
      set({ error: message, fido2Verified: false, isLoading: false });
      throw error;
    }
  },

  // SG-011: Remove a FIDO2 device
  removeFido2Device: async (deviceId: string) => {
    set({ isLoading: true, error: null });
    try {
      await fido2Service.removeDevice(deviceId);
      const deviceCount = fido2Service.getDeviceCount();
      set({
        fido2Enabled: deviceCount > 0,
        fido2DeviceCount: deviceCount,
        isLoading: false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to remove FIDO2 device';
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  // SG-011: Refresh FIDO2 status
  refreshFido2Status: () => {
    const deviceCount = fido2Service.getDeviceCount();
    set({
      fido2Available: isWeb && fido2Service.isWebAuthnSupported(),
      fido2Enabled: deviceCount > 0,
      fido2DeviceCount: deviceCount,
    });
  },
}));
