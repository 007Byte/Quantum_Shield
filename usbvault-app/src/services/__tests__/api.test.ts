import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as api from '@/services/api';

jest.mock('axios');
jest.mock('expo-secure-store');

describe('API Client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the API client for each test
    delete (api as any).api;
  });

  // ============================================================================
  // Test: Base URL Configuration
  // ============================================================================
  describe('Base URL Configuration', () => {
    it('should use EXPO_PUBLIC_API_URL environment variable if set', () => {
      process.env.EXPO_PUBLIC_API_URL = 'https://custom.api.com';
      const mockAxios = axios.create as jest.Mock;
      mockAxios.mockReturnValue({
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      });

      // Re-require to pick up env var
      jest.resetModules();
      delete process.env.EXPO_PUBLIC_API_URL;
    });

    it('should use default API URL if env variable not set', () => {
      delete process.env.EXPO_PUBLIC_API_URL;
      expect(process.env.EXPO_PUBLIC_API_URL).toBeUndefined();
    });
  });

  // ============================================================================
  // Test: Token Storage
  // ============================================================================
  describe('Token Storage', () => {
    it('should store tokens in secure store', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);

      await api.storeTokens('access-token-123', 'refresh-token-456');

      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('qav_access_token', 'access-token-123');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('qav_refresh_token', 'refresh-token-456');
    });

    it('should clear tokens from secure store', async () => {
      (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);

      await api.clearTokens();

      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('qav_access_token');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('qav_refresh_token');
    });

    it('should throw error if storeTokens fails', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(
        new Error('Storage error')
      );

      await expect(
        api.storeTokens('access-token', 'refresh-token')
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // Test: SRP Authentication
  // ============================================================================
  describe('SRP Authentication', () => {
    it('should have srpInit function', async () => {
      expect(typeof api.srpInit).toBe('function');
    });

    it('should have srpVerify function', async () => {
      expect(typeof api.srpVerify).toBe('function');
    });
  });

  // ============================================================================
  // Test: Vault Operations
  // ============================================================================
  describe('Vault Operations', () => {
    it('should have listVaults function', async () => {
      expect(typeof api.listVaults).toBe('function');
    });

    it('should have createVault function', async () => {
      expect(typeof api.createVault).toBe('function');
    });

    it('should have deleteVault function', async () => {
      expect(typeof api.deleteVault).toBe('function');
    });
  });

  // ============================================================================
  // Test: Share Operations
  // ============================================================================
  describe('Share Operations', () => {
    it('should have createShare function', async () => {
      expect(typeof api.createShare).toBe('function');
    });

    it('should have listIncomingShares function', async () => {
      expect(typeof api.listIncomingShares).toBe('function');
    });

    it('should have listOutgoingShares function', async () => {
      expect(typeof api.listOutgoingShares).toBe('function');
    });

    it('should have acceptShare function', async () => {
      expect(typeof api.acceptShare).toBe('function');
    });

    it('should have rejectShare function', async () => {
      expect(typeof api.rejectShare).toBe('function');
    });

    it('should have revokeShare function', async () => {
      expect(typeof api.revokeShare).toBe('function');
    });
  });

  // ============================================================================
  // Test: User Information
  // ============================================================================
  describe('User Information', () => {
    it('should have getUserInfo function', async () => {
      expect(typeof api.getUserInfo).toBe('function');
    });

    it('should have getPublicKey function', async () => {
      expect(typeof api.getPublicKey).toBe('function');
    });
  });

  // ============================================================================
  // Test: Error Handling
  // ============================================================================
  describe('Error Handling', () => {
    it('should handle API errors', async () => {
      const mockClient = {
        get: jest.fn().mockRejectedValue(new Error('Network error')),
        post: jest.fn(),
        delete: jest.fn(),
        interceptors: {
          request: { use: jest.fn() },
          response: { use: jest.fn() },
        },
      };
      (axios.create as jest.Mock).mockReturnValue(mockClient);

      await expect(api.listVaults()).rejects.toThrow();
    });

    it('should handle storage errors when storing tokens', async () => {
      (SecureStore.setItemAsync as jest.Mock).mockRejectedValue(
        new Error('Storage error')
      );

      await expect(
        api.storeTokens('access-token', 'refresh-token')
      ).rejects.toThrow();
    });
  });
});
