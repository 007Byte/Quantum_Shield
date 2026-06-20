import { Platform } from 'react-native';
import * as authService from '@/services/auth';
import * as apiService from '@/services/api';
import * as cryptoBridge from '@/crypto/bridge';
import * as SecureStore from 'expo-secure-store';

// Mock dependencies
jest.mock('react-native');
jest.mock('@/services/api');
jest.mock('@/crypto/bridge');

// Helper to setup common crypto mocks
function setupCryptoMocks() {
  (cryptoBridge.srpGenerateClientEphemeral as jest.Mock).mockResolvedValue({
    public: new Uint8Array(32),
    private: new Uint8Array(32),
  });
  (cryptoBridge.srpDeriveSession as jest.Mock).mockResolvedValue({
    proof: new Uint8Array(32),
    key: new Uint8Array(32),
  });
  (cryptoBridge.hashSha256 as jest.Mock).mockResolvedValue(
    '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20'
  );
  (cryptoBridge.generateShareKeypair as jest.Mock).mockResolvedValue({
    publicKey: new Uint8Array(32),
    secretKey: new Uint8Array(32),
  });
  (cryptoBridge.generateSigningKeypair as jest.Mock).mockResolvedValue({
    publicKey: new Uint8Array(32),
    secretKey: new Uint8Array(32),
  });
}

describe('Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock Platform.OS to be 'ios' so it doesn't throw the web auth error
    (Platform.OS as any) = 'ios';
    setupCryptoMocks();
  });

  // ============================================================================
  // Test: Login Flow
  // ============================================================================
  describe('Login Flow', () => {
    it('should call srpInit with email hash', async () => {
      const mockSrpInit = jest.fn().mockResolvedValue({
        salt: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        B: '2102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        sessionId: 'session-123',
      });

      const mockSrpVerify = jest.fn().mockResolvedValue({
        M2: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        userId: 'user-123',
        email: 'test@example.com',
      });

      const mockDeriveKey = jest.fn().mockResolvedValue(new Uint8Array(32));

      (apiService.srpInit as jest.Mock) = mockSrpInit;
      (apiService.srpVerify as jest.Mock) = mockSrpVerify;
      (apiService.storeTokens as jest.Mock) = jest.fn();
      (cryptoBridge.deriveKey as jest.Mock) = mockDeriveKey;

      await authService.login('test@example.com', 'password123');

      // Verify srpInit was called
      expect(mockSrpInit).toHaveBeenCalled();
      expect(mockSrpVerify).toHaveBeenCalled();
    });

    it('should store tokens after successful login', async () => {
      const mockStoreTokens = jest.fn().mockResolvedValue(undefined);
      const mockDeriveKey = jest.fn().mockResolvedValue(new Uint8Array(32));

      (apiService.srpInit as jest.Mock).mockResolvedValue({
        salt: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        B: '2102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        sessionId: 'session-123',
      });

      (apiService.srpVerify as jest.Mock).mockResolvedValue({
        M2: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        userId: 'user-123',
        email: 'test@example.com',
      });

      (apiService.storeTokens as jest.Mock) = mockStoreTokens;
      (cryptoBridge.deriveKey as jest.Mock) = mockDeriveKey;

      await authService.login('test@example.com', 'password123');

      expect(mockStoreTokens).toHaveBeenCalledWith('access-token', 'refresh-token');
    });

    it('should derive master key using server-provided salt', async () => {
      const mockDeriveKey = jest.fn().mockResolvedValue(new Uint8Array(32));
      const serverSalt = new Uint8Array([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
        26, 27, 28, 29, 30, 31, 32,
      ]);

      (apiService.srpInit as jest.Mock).mockResolvedValue({
        salt: Buffer.from(serverSalt).toString('hex'),
        B: '2102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        sessionId: 'session-123',
      });

      (apiService.srpVerify as jest.Mock).mockResolvedValue({
        M2: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        userId: 'user-123',
        email: 'test@example.com',
      });

      (apiService.storeTokens as jest.Mock) = jest.fn();
      (cryptoBridge.deriveKey as jest.Mock) = mockDeriveKey;

      await authService.login('test@example.com', 'password123');

      // Verify deriveKey was called with server-provided salt
      expect(mockDeriveKey).toHaveBeenCalledWith(
        'password123',
        expect.objectContaining({
          0: 1,
          1: 2,
        })
      );
    });

    it('should throw error on login failure', async () => {
      (apiService.srpInit as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(authService.login('test@example.com', 'password123')).rejects.toThrow(
        'Failed to login'
      );
    });

    it('should provide getMasterKey function', () => {
      const getMasterKey = authService.getMasterKey;
      expect(typeof getMasterKey).toBe('function');
    });
  });

  // ============================================================================
  // Test: Registration Flow
  // ============================================================================
  describe('Registration Flow', () => {
    it('should call srpInit for registration', async () => {
      // Mock fetch for the registration API call
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(''),
      });

      (apiService.srpInit as jest.Mock).mockResolvedValue({
        salt: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        B: '2102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        sessionId: 'session-123',
      });

      (apiService.srpVerify as jest.Mock).mockResolvedValue({
        M2: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        userId: 'user-123',
        email: 'test@example.com',
      });
      (apiService.storeTokens as jest.Mock) = jest.fn();
      (cryptoBridge.deriveKey as jest.Mock).mockResolvedValue(new Uint8Array(32));

      await authService.register('test@example.com', 'password123');

      expect(global.fetch).toHaveBeenCalled();
    });

    it('should throw error on registration failure', async () => {
      (apiService.srpInit as jest.Mock).mockRejectedValue(new Error('Email already exists'));

      await expect(authService.register('test@example.com', 'password123')).rejects.toThrow(
        'Failed to register'
      );
    });
  });

  // ============================================================================
  // Test: Logout Flow
  // ============================================================================
  describe('Logout Flow', () => {
    it('should clear tokens on logout', async () => {
      const mockClearTokens = jest.fn().mockResolvedValue(undefined);
      (apiService.clearTokens as jest.Mock) = mockClearTokens;

      await authService.logout();

      expect(mockClearTokens).toHaveBeenCalled();
    });

    it('should throw error if clearTokens fails', async () => {
      (apiService.clearTokens as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(authService.logout()).rejects.toThrow('Failed to logout');
    });
  });

  // ============================================================================
  // Test: Master Key Management
  // ============================================================================
  describe('Master Key Management', () => {
    it('should clear master key', () => {
      authService.clearMasterKey();
      const masterKey = authService.getMasterKey();
      expect(masterKey).toBeNull();
    });
  });

  // ============================================================================
  // Test: Authentication Status
  // ============================================================================
  describe('Authentication Status', () => {
    it('should return false if no access token in secure store', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

      const isAuth = await authService.isAuthenticated();

      expect(isAuth).toBe(false);
    });

    it('should return false if getItemAsync throws error', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const isAuth = await authService.isAuthenticated();

      expect(isAuth).toBe(false);
    });

    it('should return false if master key is null', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('access-token-123');
      authService.clearMasterKey();

      const isAuth = await authService.isAuthenticated();

      expect(isAuth).toBe(false);
    });
  });

  // ============================================================================
  // Test: Error Handling
  // ============================================================================
  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      (apiService.srpInit as jest.Mock).mockRejectedValue(new Error('Network timeout'));

      await expect(authService.login('test@example.com', 'password123')).rejects.toThrow();
    });

    it('should handle crypto module errors gracefully', async () => {
      (apiService.srpInit as jest.Mock).mockResolvedValue({
        salt: '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        B: '2102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        sessionId: 'session-123',
      });

      (apiService.srpVerify as jest.Mock).mockResolvedValue({
        M2: 'proof',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        userId: 'user-123',
        email: 'test@example.com',
      });

      (apiService.storeTokens as jest.Mock) = jest.fn();
      (cryptoBridge.deriveKey as jest.Mock).mockRejectedValue(new Error('Crypto error'));

      await expect(authService.login('test@example.com', 'password123')).rejects.toThrow();
    });
  });
});
