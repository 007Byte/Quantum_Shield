import { Platform } from 'react-native';
import { create } from 'zustand';
import * as authService from '@/services/auth';
import * as api from '@/services/api';
import { auditService } from '@/services/auditService';
import { fido2Service } from '@/services/fido2Service';
import type { Fido2Device } from '@/services/fido2Service';

const isWeb = Platform.OS === 'web';

// ── Web-local auth helpers (SHA-256 via WebCrypto) ─────────────

const WEB_SESSION_KEY = 'qav:session';

// Web-local auth storage
// On web, the entire auth flow is local (no backend). Credentials are persisted
// to localStorage so accounts survive page refreshes during testing.
// When a backend is connected, this local auth is bypassed entirely in favor
// of SRP-6a authentication against the server.

const WEB_AUTH_KEY = 'qav:auth';

interface StoredAuth {
  email: string;
  passwordHashHex: string;
  userId: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  createdAt: string;
}

async function hashPassword(password: string): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    // Fallback for environments without WebCrypto
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      hash = ((hash << 5) - hash + password.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
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
    sessionStorage.setItem('qav:userId', userId);
  } catch {
    // Silent fail
  }
}

function clearSession(): void {
  if (!isWeb) return;
  try {
    sessionStorage.removeItem(WEB_SESSION_KEY);
    sessionStorage.removeItem('qav:userId');
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

export const useAuthStore = create<AuthState>((set) => ({
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

        const hash = await hashPassword(password);
        if (stored.email !== email || stored.passwordHashHex !== hash) {
          auditService.log('failed_login', email, { reason: 'invalid_credentials' }, 'error').catch(() => {});
          throw new Error('Invalid email or password.');
        }

        // SG-011: Check if FIDO2 second factor is required
        const fido2Required = fido2Service.getDeviceCount() > 0 && fido2Service.isWebAuthnSupported();
        let fido2Passed = false;

        if (fido2Required) {
          try {
            const device = await fido2Service.authenticate();
            fido2Passed = device !== null;
            if (!fido2Passed) {
              auditService.log('failed_login', email, { reason: 'fido2_rejected' }, 'error').catch(() => {});
              throw new Error('FIDO2 authentication required. Please use your security key.');
            }
            auditService.log('fido2_authenticate', email, { deviceId: device?.id }).catch(() => {});
          } catch (fido2Error) {
            if (fido2Error instanceof Error && fido2Error.message.includes('FIDO2 authentication required')) {
              throw fido2Error;
            }
            auditService.log('failed_login', email, { reason: 'fido2_failed', error: String(fido2Error) }, 'error').catch(() => {});
            throw new Error('FIDO2 authentication failed. Please try again with your security key.');
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

  // Register action
  register: async (email: string, password: string) => {
    if (isWeb) {
      set({ isLoading: true, error: null });
      try {
        const existing = getStoredAuth();
        if (existing && existing.email === email) {
          throw new Error('An account with this email already exists. Please login instead.');
        }

        const hash = await hashPassword(password);
        const userId = `user-${Date.now().toString(36)}`;
        const auth: StoredAuth = {
          email,
          passwordHashHex: hash,
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
    if (isWeb) {
      auditService.log('logout', 'web-session').catch(() => {});
      clearSession();
      set({ isAuthenticated: false, userId: null, email: null, subscriptionTier: null, isLoading: false });
      return;
    }
    set({ isLoading: true });
    try {
      await authService.logout();
      set({ isAuthenticated: false, userId: null, email: null, subscriptionTier: null, isLoading: false });
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
        set({ isAuthenticated: false, userId: null, email: null, subscriptionTier: null, isLoading: false });
      }
    } catch (error) {
      set({ isAuthenticated: false, userId: null, email: null, subscriptionTier: null, isLoading: false });
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
    set({ isAuthenticated: false, userId: null, email: null, subscriptionTier: null, fido2Verified: false });
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
        auditService.log('fido2_authenticate', device.name, { deviceId: device.id }).catch(() => {});
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
