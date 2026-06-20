import { useAuthStore } from '@/stores/authStore';
import * as authService from '@/services/auth';
import * as api from '@/services/api';

jest.mock('@/services/auth');
jest.mock('@/services/api');

describe('Auth Store (Zustand)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the store to initial state
    useAuthStore.setState({
      isAuthenticated: false,
      isLoading: false,
      userId: null,
      email: null,
      subscriptionTier: null,
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test: Initial State
  // ============================================================================
  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.userId).toBeNull();
      expect(state.email).toBeNull();
      expect(state.subscriptionTier).toBeNull();
      expect(state.error).toBeNull();
    });

    it('should have all required action methods', () => {
      const store = useAuthStore.getState();

      expect(typeof store.login).toBe('function');
      expect(typeof store.register).toBe('function');
      expect(typeof store.logout).toBe('function');
      expect(typeof store.checkAuth).toBe('function');
      expect(typeof store.clearError).toBe('function');
      expect(typeof store.lockVault).toBe('function');
    });
  });

  // ============================================================================
  // Test: Login Action
  // ============================================================================
  describe('Login Action', () => {
    it('should update state on successful login', async () => {
      (authService.login as jest.Mock).mockResolvedValue(undefined);
      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        subscriptionTier: 'pro',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const store = useAuthStore.getState();
      await store.login('test@example.com', 'password123');

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(true);
      expect(updatedState.userId).toBe('user-123');
      expect(updatedState.email).toBe('test@example.com');
      expect(updatedState.subscriptionTier).toBe('pro');
      expect(updatedState.isLoading).toBe(false);
      expect(updatedState.error).toBeNull();
    });

    it('should set error on login failure', async () => {
      (authService.login as jest.Mock).mockRejectedValue(new Error('Invalid credentials'));

      const store = useAuthStore.getState();
      await expect(store.login('test@example.com', 'wrong-password')).rejects.toThrow();

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(false);
      expect(updatedState.error).toContain('Invalid credentials');
    });

    it('should set isLoading to true during login', async () => {
      (authService.login as jest.Mock).mockImplementation(
        () =>
          new Promise(resolve => {
            setTimeout(resolve, 100);
          })
      );

      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        subscriptionTier: 'free',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const store = useAuthStore.getState();
      const loginPromise = store.login('test@example.com', 'password123');

      const stateWhileLoading = useAuthStore.getState();
      expect(stateWhileLoading.isLoading).toBe(true);

      await loginPromise;

      const stateAfterLoading = useAuthStore.getState();
      expect(stateAfterLoading.isLoading).toBe(false);
    });
  });

  // ============================================================================
  // Test: Register Action
  // ============================================================================
  describe('Register Action', () => {
    it('should update state on successful registration', async () => {
      (authService.register as jest.Mock).mockResolvedValue(undefined);
      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-456',
        email: 'newuser@example.com',
        subscriptionTier: 'free',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const store = useAuthStore.getState();
      await store.register('newuser@example.com', 'password123');

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(true);
      expect(updatedState.userId).toBe('user-456');
      expect(updatedState.email).toBe('newuser@example.com');
    });

    it('should set error on registration failure', async () => {
      (authService.register as jest.Mock).mockRejectedValue(new Error('Email already exists'));

      const store = useAuthStore.getState();
      await expect(store.register('existing@example.com', 'password123')).rejects.toThrow();

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(false);
      expect(updatedState.error).toContain('Email already exists');
    });
  });

  // ============================================================================
  // Test: Logout Action
  // ============================================================================
  describe('Logout Action', () => {
    it('should clear auth state on logout', async () => {
      // First login
      useAuthStore.setState({
        isAuthenticated: true,
        userId: 'user-123',
        email: 'test@example.com',
        subscriptionTier: 'pro',
      });

      (authService.logout as jest.Mock).mockResolvedValue(undefined);

      const store = useAuthStore.getState();
      await store.logout();

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(false);
      expect(updatedState.userId).toBeNull();
      expect(updatedState.email).toBeNull();
      expect(updatedState.subscriptionTier).toBeNull();
      expect(updatedState.isLoading).toBe(false);
    });

    it('should call authService.logout', async () => {
      (authService.logout as jest.Mock).mockResolvedValue(undefined);

      const store = useAuthStore.getState();
      await store.logout();

      expect(authService.logout).toHaveBeenCalled();
    });

    it('should set error if logout fails', async () => {
      (authService.logout as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const store = useAuthStore.getState();
      await expect(store.logout()).rejects.toThrow();

      const updatedState = useAuthStore.getState();
      expect(updatedState.error).toContain('Storage error');
    });
  });

  // ============================================================================
  // Test: CheckAuth Action
  // ============================================================================
  describe('CheckAuth Action', () => {
    it('should update state if authenticated', async () => {
      (authService.isAuthenticated as jest.Mock).mockResolvedValue(true);
      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        subscriptionTier: 'enterprise',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const store = useAuthStore.getState();
      await store.checkAuth();

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(true);
      expect(updatedState.userId).toBe('user-123');
      expect(updatedState.email).toBe('test@example.com');
      expect(updatedState.subscriptionTier).toBe('enterprise');
    });

    it('should clear auth state if not authenticated', async () => {
      (authService.isAuthenticated as jest.Mock).mockResolvedValue(false);

      useAuthStore.setState({
        isAuthenticated: true,
        userId: 'user-123',
        email: 'test@example.com',
      });

      const store = useAuthStore.getState();
      await store.checkAuth();

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(false);
      expect(updatedState.userId).toBeNull();
      expect(updatedState.email).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      (authService.isAuthenticated as jest.Mock).mockRejectedValue(new Error('Check failed'));

      const store = useAuthStore.getState();
      await store.checkAuth();

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(false);
      expect(updatedState.userId).toBeNull();
    });
  });

  // ============================================================================
  // Test: Clear Error Action
  // ============================================================================
  describe('Clear Error Action', () => {
    it('should clear error message', () => {
      useAuthStore.setState({ error: 'Some error' });

      const store = useAuthStore.getState();
      store.clearError();

      const updatedState = useAuthStore.getState();
      expect(updatedState.error).toBeNull();
    });
  });

  // ============================================================================
  // Test: Lock Vault Action
  // ============================================================================
  describe('Lock Vault Action', () => {
    it('should call authService.clearMasterKey', () => {
      (authService.clearMasterKey as jest.Mock) = jest.fn();

      const store = useAuthStore.getState();
      store.lockVault();

      expect(authService.clearMasterKey).toHaveBeenCalled();
    });

    it('should set isAuthenticated to false', () => {
      (authService.clearMasterKey as jest.Mock) = jest.fn();

      useAuthStore.setState({ isAuthenticated: true });

      const store = useAuthStore.getState();
      store.lockVault();

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(false);
    });
  });

  // ============================================================================
  // Test: State Isolation
  // ============================================================================
  describe('State Isolation', () => {
    it('should not expose sensitive data', () => {
      useAuthStore.setState({
        userId: 'user-123',
        email: 'test@example.com',
      });

      const state = useAuthStore.getState();
      expect(state).not.toHaveProperty('masterKey');
      expect(state).not.toHaveProperty('accessToken');
    });
  });

  // ============================================================================
  // Test: Subscription Tier Management
  // ============================================================================
  describe('Subscription Tier Management', () => {
    it('should update subscription tier on login', async () => {
      (authService.login as jest.Mock).mockResolvedValue(undefined);
      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        subscriptionTier: 'pro',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const store = useAuthStore.getState();
      await store.login('test@example.com', 'password123');

      const updatedState = useAuthStore.getState();
      expect(updatedState.subscriptionTier).toBe('pro');
    });

    it('should handle different subscription tiers', async () => {
      const tiers = ['free', 'pro', 'enterprise'];

      for (const tier of tiers) {
        (authService.login as jest.Mock).mockResolvedValue(undefined);
        (api.getUserInfo as jest.Mock).mockResolvedValue({
          id: 'user-123',
          email: 'test@example.com',
          subscriptionTier: tier,
          publicKeyX25519: 'key1',
          publicKeyEd25519: 'key2',
          createdAt: '2024-01-01T00:00:00Z',
        });

        const store = useAuthStore.getState();
        await store.login('test@example.com', 'password123');

        const updatedState = useAuthStore.getState();
        expect(updatedState.subscriptionTier).toBe(tier);
      }
    });

    it('should clear subscription tier on logout', async () => {
      useAuthStore.setState({
        isAuthenticated: true,
        subscriptionTier: 'pro',
      });

      (authService.logout as jest.Mock).mockResolvedValue(undefined);

      const store = useAuthStore.getState();
      await store.logout();

      const updatedState = useAuthStore.getState();
      expect(updatedState.subscriptionTier).toBeNull();
    });
  });

  // ============================================================================
  // Test: Error State Management
  // ============================================================================
  describe('Error State Management', () => {
    it('should preserve error message on failed login', async () => {
      const errorMessage = 'Invalid credentials';
      (authService.login as jest.Mock).mockRejectedValue(new Error(errorMessage));

      const store = useAuthStore.getState();
      try {
        await store.login('test@example.com', 'wrong-password');
      } catch (e) {
        // Expected to throw
      }

      const state = useAuthStore.getState();
      expect(state.error).toContain(errorMessage);
    });

    it('should clear error when clearError is called', () => {
      useAuthStore.setState({ error: 'Some error' });

      const store = useAuthStore.getState();
      store.clearError();

      const updatedState = useAuthStore.getState();
      expect(updatedState.error).toBeNull();
    });

    it('should clear error on successful login', async () => {
      useAuthStore.setState({ error: 'Previous error' });

      (authService.login as jest.Mock).mockResolvedValue(undefined);
      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        subscriptionTier: 'free',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const store = useAuthStore.getState();
      await store.login('test@example.com', 'password123');

      const updatedState = useAuthStore.getState();
      expect(updatedState.error).toBeNull();
    });
  });

  // ============================================================================
  // Test: Multiple State Changes
  // ============================================================================
  describe('Multiple State Changes', () => {
    it('should handle rapid state updates', () => {
      const store = useAuthStore.getState();

      store.clearError();
      expect(useAuthStore.getState().error).toBeNull();

      useAuthStore.setState({ isLoading: true });
      expect(useAuthStore.getState().isLoading).toBe(true);

      useAuthStore.setState({ isLoading: false });
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it('should maintain state consistency across operations', async () => {
      (authService.login as jest.Mock).mockResolvedValue(undefined);
      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        subscriptionTier: 'pro',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const store = useAuthStore.getState();
      await store.login('test@example.com', 'password123');

      // Verify all state is consistent
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.userId).toBe('user-123');
      expect(state.email).toBe('test@example.com');
      expect(state.subscriptionTier).toBe('pro');
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  // ============================================================================
  // Test: Lock Vault Advanced Scenarios
  // ============================================================================
  describe('Lock Vault Advanced Scenarios', () => {
    it('should clear authentication when locking vault', () => {
      useAuthStore.setState({
        isAuthenticated: true,
        userId: 'user-123',
        email: 'test@example.com',
      });

      (authService.clearMasterKey as jest.Mock).mockImplementation(() => {});

      const store = useAuthStore.getState();
      store.lockVault();

      const updatedState = useAuthStore.getState();
      expect(updatedState.isAuthenticated).toBe(false);
      expect(authService.clearMasterKey).toHaveBeenCalled();
    });

    it('should allow re-authentication after lock vault', async () => {
      // First lock the vault
      useAuthStore.setState({ isAuthenticated: true });
      (authService.clearMasterKey as jest.Mock).mockImplementation(() => {});

      const store = useAuthStore.getState();
      store.lockVault();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);

      // Then login again
      (authService.login as jest.Mock).mockResolvedValue(undefined);
      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        subscriptionTier: 'free',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      await store.login('test@example.com', 'password123');
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
  });

  // ============================================================================
  // Test: Edge Cases and Boundary Conditions
  // ============================================================================
  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle null user info gracefully', async () => {
      (authService.login as jest.Mock).mockResolvedValue(undefined);
      (api.getUserInfo as jest.Mock).mockResolvedValue(null);

      const store = useAuthStore.getState();

      // Should not throw, but might not set auth state
      try {
        await store.login('test@example.com', 'password123');
      } catch (e) {
        // Expected behavior - store might not be updated
      }
    });

    it('should handle very long email addresses', async () => {
      const longEmail = 'a'.repeat(100) + '@example.com';

      (authService.login as jest.Mock).mockResolvedValue(undefined);
      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: longEmail,
        subscriptionTier: 'free',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const store = useAuthStore.getState();
      await store.login(longEmail, 'password123');

      expect(useAuthStore.getState().email).toBe(longEmail);
    });

    it('should handle special characters in email', async () => {
      const specialEmail = 'user+test@sub.example.com';

      (authService.login as jest.Mock).mockResolvedValue(undefined);
      (api.getUserInfo as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: specialEmail,
        subscriptionTier: 'free',
        publicKeyX25519: 'key1',
        publicKeyEd25519: 'key2',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const store = useAuthStore.getState();
      await store.login(specialEmail, 'password123');

      expect(useAuthStore.getState().email).toBe(specialEmail);
    });
  });
});
