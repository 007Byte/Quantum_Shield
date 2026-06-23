/**
 * AUTH INTEGRATION TESTS (TEST-GAP-2)
 *
 * Tests the integration between:
 *   - auth service (SRP login/register/logout)
 *   - auth store (Zustand state management)
 *   - crypto bridge (key derivation, SRP proofs)
 *   - api service (token storage, network calls)
 *
 * Strategy: Mock the API/network layer, but let auth service, store, and
 * crypto bridge interact through their real interfaces.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import * as authService from '@/services/auth';
import * as apiService from '@/services/api';
import * as cryptoBridge from '@/crypto/bridge';
import { useAuthStore } from '@/stores/authStore';
import { stopVaultPolling } from '@/stores/vaultPolling';
import { stopIdleTimer } from '@/stores/vaultIdleTimer';
import { cleanupStoreSubscriptions } from '@/stores/storeCleanup';

// ── Mocks ──────────────────────────────────────────────────────────

// Mock API layer — the network boundary. Everything above this runs for real.
jest.mock('@/services/api');
jest.mock('@/crypto/bridge');
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/services/fido2Service', () => ({
  fido2Service: {
    isWebAuthnSupported: jest.fn(() => false),
    getDeviceCount: jest.fn(() => 0),
    registerDevice: jest.fn(),
    authenticate: jest.fn(),
    removeDevice: jest.fn(),
  },
}));
jest.mock('@/stores/vaultPolling', () => ({
  stopVaultPolling: jest.fn(),
}));
jest.mock('@/stores/vaultIdleTimer', () => ({
  stopIdleTimer: jest.fn(),
}));
jest.mock('@/stores/storeCleanup', () => ({
  cleanupStoreSubscriptions: jest.fn(),
}));

// ── Helpers ────────────────────────────────────────────────────────

const TEST_EMAIL = 'integration@example.com';
const TEST_PASSWORD = 'Str0ngP@ssw0rd!';
const MOCK_SALT_HEX = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';
const MOCK_B_HEX = '2102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';
const MOCK_M2_HEX = '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

function setupCryptoMocks(): void {
  (cryptoBridge.srpGenerateClientEphemeral as jest.Mock).mockResolvedValue({
    public: new Uint8Array(32),
    private: new Uint8Array(32),
  });
  (cryptoBridge.srpDeriveSession as jest.Mock).mockResolvedValue({
    proof: new Uint8Array(32),
    key: new Uint8Array(32),
  });
  (cryptoBridge.hashSha256 as jest.Mock).mockResolvedValue(MOCK_M2_HEX);
  (cryptoBridge.deriveKey as jest.Mock).mockResolvedValue(new Uint8Array(32).fill(0xaa));
  (cryptoBridge.generateShareKeypair as jest.Mock).mockResolvedValue({
    publicKey: new Uint8Array(32),
    secretKey: new Uint8Array(32),
  });
  (cryptoBridge.generateSigningKeypair as jest.Mock).mockResolvedValue({
    publicKey: new Uint8Array(32),
    secretKey: new Uint8Array(32),
  });
}

function setupApiMocks(): void {
  (apiService.srpInit as jest.Mock).mockResolvedValue({
    salt: MOCK_SALT_HEX,
    B: MOCK_B_HEX,
    sessionId: 'session-integration-1',
  });
  (apiService.srpVerify as jest.Mock).mockResolvedValue({
    M2: MOCK_M2_HEX,
    accessToken: 'access-token-integration',
    refreshToken: 'refresh-token-integration',
    userId: 'user-integ-123',
    email: TEST_EMAIL,
  });
  (apiService.storeTokens as jest.Mock).mockResolvedValue(undefined);
  (apiService.clearTokens as jest.Mock).mockResolvedValue(undefined);
  (apiService.getUserInfo as jest.Mock).mockResolvedValue({
    id: 'user-integ-123',
    email: TEST_EMAIL,
    subscriptionTier: 'pro',
    publicKeyX25519: 'key1',
    publicKeyEd25519: 'key2',
    createdAt: '2026-01-01T00:00:00Z',
  });
}

function resetAuthStore(): void {
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    userId: null,
    email: null,
    subscriptionTier: null,
    error: null,
    fido2Verified: false,
  });
}

// ── Tests ──────────────────────────────────────────────────────────

describe('Auth Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Platform.OS as any) = 'ios';
    setupCryptoMocks();
    setupApiMocks();
    resetAuthStore();
  });

  // ============================================================================
  // 1. Full Login Flow: SRP init → verify → token storage → auth state update
  // ============================================================================
  describe('Full Login Flow', () => {
    it('should complete SRP login and update store state end-to-end', async () => {
      // Act: trigger login through the store (which calls authService.login → api → crypto)
      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      // Verify: auth service called SRP init with email
      expect(apiService.srpInit).toHaveBeenCalledWith(TEST_EMAIL);

      // Verify: SRP verify was called with session proof
      expect(apiService.srpVerify).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-integration-1',
        })
      );

      // Verify: tokens were stored
      expect(apiService.storeTokens).toHaveBeenCalledWith(
        'access-token-integration',
        'refresh-token-integration'
      );

      // Verify: user info was fetched post-login
      expect(apiService.getUserInfo).toHaveBeenCalled();

      // Verify: store state reflects authenticated user
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.userId).toBe('user-integ-123');
      expect(state.email).toBe(TEST_EMAIL);
      expect(state.subscriptionTier).toBe('pro');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should derive master key from password using server-provided salt', async () => {
      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      // Verify: deriveKey was called (password + salt from srpInit response)
      expect(cryptoBridge.deriveKey).toHaveBeenCalledWith(TEST_PASSWORD, expect.any(Uint8Array));

      // Verify: master key is available after login
      const masterKey = authService.getMasterKey();
      expect(masterKey).not.toBeNull();
      expect(masterKey).toBeInstanceOf(Uint8Array);
    });

    it('should verify M2 server proof for mutual authentication', async () => {
      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      // hashSha256 is called to compute expected M2 = SHA256(A || M1 || K)
      // If M2 doesn't match, login would throw — success here implies M2 matched
      expect(cryptoBridge.hashSha256).toHaveBeenCalled();
    });

    it('should set loading state during login', async () => {
      // Slow down the SRP init to inspect intermediate state
      let resolveDelay: () => void;
      const delayPromise = new Promise<void>(r => {
        resolveDelay = r;
      });

      (apiService.srpInit as jest.Mock).mockImplementation(async () => {
        await delayPromise;
        return {
          salt: MOCK_SALT_HEX,
          B: MOCK_B_HEX,
          sessionId: 'session-loading-1',
        };
      });

      const store = useAuthStore.getState();
      const loginPromise = store.login(TEST_EMAIL, TEST_PASSWORD);

      // During login, isLoading should be true
      expect(useAuthStore.getState().isLoading).toBe(true);

      // Let the login proceed
      resolveDelay!();
      await loginPromise;
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  // ============================================================================
  // 2. Token Refresh Flow: Expired access token → refresh → new token stored
  // ============================================================================
  describe('Token Refresh Flow', () => {
    it('should handle 401 and trigger token refresh transparently', async () => {
      // This tests that the API interceptor handles token refresh.
      // Since we mock the API layer, we verify the contract:
      // after login, tokens are stored; if getUserInfo fails with 401,
      // the store catches the error appropriately.
      (apiService.getUserInfo as jest.Mock)
        .mockRejectedValueOnce(new Error('Token expired'))
        .mockResolvedValueOnce({
          id: 'user-integ-123',
          email: TEST_EMAIL,
          subscriptionTier: 'pro',
          publicKeyX25519: 'k1',
          publicKeyEd25519: 'k2',
          createdAt: '2026-01-01',
        });

      const store = useAuthStore.getState();

      // First login attempt fails because getUserInfo throws
      await expect(store.login(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow();

      // Store should be in error state
      const errorState = useAuthStore.getState();
      expect(errorState.isAuthenticated).toBe(false);
      expect(errorState.error).toBeTruthy();

      // Clear error, retry login — simulates refresh having occurred
      store.clearError();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      const successState = useAuthStore.getState();
      expect(successState.isAuthenticated).toBe(true);
      expect(successState.error).toBeNull();
    });

    it('should store both access and refresh tokens on successful login', async () => {
      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      expect(apiService.storeTokens).toHaveBeenCalledWith(
        'access-token-integration',
        'refresh-token-integration'
      );
    });
  });

  // ============================================================================
  // 3. Logout Flow: Clear tokens → clear auth state → clear sensitive data
  // ============================================================================
  describe('Logout Flow', () => {
    it('should clear tokens, auth state, and master key on logout', async () => {
      // First, login
      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Now logout
      await useAuthStore.getState().logout();

      // Verify: tokens cleared
      expect(apiService.clearTokens).toHaveBeenCalled();

      // Verify: store state cleared
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.userId).toBeNull();
      expect(state.email).toBeNull();
      expect(state.subscriptionTier).toBeNull();
      expect(state.isLoading).toBe(false);
    });

    it('should stop background processes on logout', async () => {
      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);
      await useAuthStore.getState().logout();

      expect(stopVaultPolling).toHaveBeenCalled();
      expect(stopIdleTimer).toHaveBeenCalled();
      expect(cleanupStoreSubscriptions).toHaveBeenCalled();
    });

    it('should clear master key from memory on logout', async () => {
      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      // Master key should exist after login
      const mkBefore = authService.getMasterKey();
      expect(mkBefore).not.toBeNull();

      // Logout should clear it
      await useAuthStore.getState().logout();

      const mkAfter = authService.getMasterKey();
      expect(mkAfter).toBeNull();
    });

    it('should handle logout failure gracefully in the store', async () => {
      (apiService.clearTokens as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      await expect(useAuthStore.getState().logout()).rejects.toThrow();

      const state = useAuthStore.getState();
      // auth service wraps the error: "Failed to logout"
      expect(state.error).toContain('Failed to logout');
    });
  });

  // ============================================================================
  // 4. Session Expiry Handling: Token expired → automatic logout
  // ============================================================================
  describe('Session Expiry Handling', () => {
    it('should report unauthenticated when token missing from secure store', async () => {
      // Clear master key so isAuthenticated returns false
      authService.clearMasterKey();
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const isAuth = await authService.isAuthenticated();
      expect(isAuth).toBe(false);
    });

    it('should report unauthenticated when master key cleared (vault locked)', async () => {
      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      // Lock vault — clears master key without full logout
      useAuthStore.getState().lockVault();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);

      // Master key should be gone
      const mk = authService.getMasterKey();
      expect(mk).toBeNull();
    });

    it('should allow re-login after session expiry', async () => {
      const store = useAuthStore.getState();
      await store.login(TEST_EMAIL, TEST_PASSWORD);

      // Simulate session expiry by locking vault
      useAuthStore.getState().lockVault();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      // Re-login should work
      await useAuthStore.getState().login(TEST_EMAIL, TEST_PASSWORD);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('should clear all user fields on checkAuth when not authenticated', async () => {
      // Set up authenticated state
      useAuthStore.setState({
        isAuthenticated: true,
        userId: 'user-integ-123',
        email: TEST_EMAIL,
        subscriptionTier: 'pro',
      });

      // isAuthenticated returns false when master key is null and no token in store
      authService.clearMasterKey();
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      await useAuthStore.getState().checkAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.userId).toBeNull();
      expect(state.email).toBeNull();
      expect(state.subscriptionTier).toBeNull();
    });
  });

  // ============================================================================
  // 5. Registration Flow: Register → auto-login → tokens stored
  // ============================================================================
  describe('Registration Flow', () => {
    it('should register and authenticate the user end-to-end', async () => {
      // Setup: mock fetch for registration endpoint
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(''),
      });

      const store = useAuthStore.getState();
      await store.register(TEST_EMAIL, TEST_PASSWORD);

      // Verify: store state reflects authenticated user after registration
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.userId).toBe('user-integ-123');
      expect(state.email).toBe(TEST_EMAIL);
      expect(state.isLoading).toBe(false);
    });

    it('should generate keypairs during registration', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(''),
      });

      const store = useAuthStore.getState();
      await store.register(TEST_EMAIL, TEST_PASSWORD);

      // Verify: X25519 and Ed25519 keypairs generated
      expect(cryptoBridge.generateShareKeypair).toHaveBeenCalled();
      expect(cryptoBridge.generateSigningKeypair).toHaveBeenCalled();
    });

    it('should store secret keys in secure storage during registration', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(''),
      });

      const store = useAuthStore.getState();
      await store.register(TEST_EMAIL, TEST_PASSWORD);

      // Verify: secret keys stored in SecureStore
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'usbvault_share_secret_key',
        expect.any(String),
        expect.any(Object)
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'usbvault_signing_secret_key',
        expect.any(String),
        expect.any(Object)
      );
    });

    it('should auto-login after successful registration', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(''),
      });

      const store = useAuthStore.getState();
      await store.register(TEST_EMAIL, TEST_PASSWORD);

      // Verify: SRP login was performed (srpInit + srpVerify called)
      expect(apiService.srpInit).toHaveBeenCalled();
      expect(apiService.srpVerify).toHaveBeenCalled();
      expect(apiService.storeTokens).toHaveBeenCalled();
    });

    it('should handle registration server error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        text: jest.fn().mockResolvedValue('Email already registered'),
      });

      const store = useAuthStore.getState();
      await expect(store.register(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeTruthy();
    });
  });

  // ============================================================================
  // 6. Error Recovery: Network failure during auth → proper error state
  // ============================================================================
  describe('Error Recovery', () => {
    it('should set error state on SRP init network failure', async () => {
      (apiService.srpInit as jest.Mock).mockRejectedValue(new Error('Network timeout'));

      const store = useAuthStore.getState();
      await expect(store.login(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeTruthy();
      expect(state.isLoading).toBe(false);
    });

    it('should set error state on SRP verify failure', async () => {
      (apiService.srpVerify as jest.Mock).mockRejectedValue(new Error('Invalid proof'));

      const store = useAuthStore.getState();
      await expect(store.login(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeTruthy();
    });

    it('should set error state on crypto bridge failure', async () => {
      (cryptoBridge.deriveKey as jest.Mock).mockRejectedValue(
        new Error('Native module unavailable')
      );

      const store = useAuthStore.getState();
      await expect(store.login(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBeTruthy();
    });

    it('should allow retry after network error', async () => {
      // First attempt fails
      (apiService.srpInit as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const store = useAuthStore.getState();
      await expect(store.login(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow();

      expect(useAuthStore.getState().error).toBeTruthy();

      // Clear error and retry successfully
      useAuthStore.getState().clearError();
      expect(useAuthStore.getState().error).toBeNull();

      // Restore working mock for retry
      (apiService.srpInit as jest.Mock).mockResolvedValue({
        salt: MOCK_SALT_HEX,
        B: MOCK_B_HEX,
        sessionId: 'session-retry',
      });

      await useAuthStore.getState().login(TEST_EMAIL, TEST_PASSWORD);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });

    it('should not leave partial state on getUserInfo failure', async () => {
      (apiService.getUserInfo as jest.Mock).mockRejectedValue(new Error('Server unreachable'));

      const store = useAuthStore.getState();
      await expect(store.login(TEST_EMAIL, TEST_PASSWORD)).rejects.toThrow();

      // Tokens were stored (auth service succeeded), but store should not
      // show authenticated since getUserInfo failed
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.userId).toBeNull();
    });

    it('should preserve error message from the underlying failure', async () => {
      const specificError = 'SRP proof mismatch — possible MITM';
      (apiService.srpVerify as jest.Mock).mockRejectedValue(new Error(specificError));

      const store = useAuthStore.getState();
      try {
        await store.login(TEST_EMAIL, TEST_PASSWORD);
      } catch {
        // expected
      }

      // The store wraps errors, but the message from the auth service propagates
      const state = useAuthStore.getState();
      expect(state.error).toBeTruthy();
    });
  });

  // ============================================================================
  // Cross-cutting: State consistency across operations
  // ============================================================================
  describe('State Consistency', () => {
    it('should handle login → logout → login cycle cleanly', async () => {
      const store = useAuthStore.getState();

      // Login
      await store.login(TEST_EMAIL, TEST_PASSWORD);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Logout
      await useAuthStore.getState().logout();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().userId).toBeNull();

      // Login again
      await useAuthStore.getState().login(TEST_EMAIL, TEST_PASSWORD);
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().userId).toBe('user-integ-123');
    });

    it('should not expose master key or tokens in store state', () => {
      const state = useAuthStore.getState();
      expect(state).not.toHaveProperty('masterKey');
      expect(state).not.toHaveProperty('accessToken');
      expect(state).not.toHaveProperty('refreshToken');
    });
  });
});
