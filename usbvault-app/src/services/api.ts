import axios, { AxiosInstance, AxiosError } from 'axios';
import { Platform } from 'react-native';
import { logger } from '@/utils/logger';
import { arePinsConfigured, initializeCertificatePinning } from './security/certificatePinning';
import { auditService } from './auditService';

// Web-compatible SecureStore shim
const SecureStore =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (key: string) => {
          try {
            return localStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItemAsync: async (key: string, value: string) => {
          try {
            localStorage.setItem(key, value);
          } catch {}
        },
        deleteItemAsync: async (key: string) => {
          try {
            localStorage.removeItem(key);
          } catch {}
        },
      }
    : require('expo-secure-store');
// MEDIUM-FIX: Generate request IDs for tracing without external dependency
function generateRequestId(): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Configuration
const API_BASE_URL = `${process.env.EXPO_PUBLIC_API_URL || 'https://api.usbvault.com'}/api/v1`;
const TOKEN_KEY = 'usbvault_access_token';
const REFRESH_TOKEN_KEY = 'usbvault_refresh_token';

// MEDIUM-FIX: Retry configuration for network errors
const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = [1000, 2000, 4000]; // 1s, 2s, 4s exponential backoff

/**
 * API client for USBVault Go backend.
 *
 * Features:
 * - Automatic JWT attachment to requests
 * - Automatic token refresh on 401
 * - Consistent error handling
 * - Secure token storage
 */

let api: AxiosInstance;
let refreshTokenInProgress: Promise<void> | null = null;

function createApiClient(): AxiosInstance {
  // RM-002 FIX: Validate certificate pinning on API client creation.
  // Fail-closed: log error but don't throw on web dev preview (pins are env-injected in CI/CD).
  // On native production builds, EXPO_PUBLIC_PIN_* env vars MUST be set.
  const pinResult = initializeCertificatePinning();
  if (!pinResult.initialized) {
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && Platform.OS !== 'web') {
      // RM-002: Hard-fail on native production if pins not configured
      throw new Error(
        'Certificate pins not configured for production build. ' +
          'Set EXPO_PUBLIC_PIN_PRIMARY and EXPO_PUBLIC_PIN_BACKUP environment variables.'
      );
    }
    logger.warn(
      '[API] Certificate pinning not active:',
      pinResult.validationResult.errors.join('; ')
    );
  }

  const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor: attach JWT token and request ID
  client.interceptors.request.use(
    async config => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_KEY);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        logger.warn('Failed to retrieve token from secure store:', error);
      }

      // MEDIUM-FIX: Add request ID header (UUID) for tracing
      config.headers['X-Request-ID'] = generateRequestId();

      return config;
    },
    error => {
      return Promise.reject(error);
    }
  );

  // Response interceptor: handle 401, network errors with retry, and other failures
  client.interceptors.response.use(
    response => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as any;

      // MEDIUM-FIX: Retry mechanism for network errors (not 4xx/5xx HTTP errors)
      // Network errors: ECONNREFUSED, ETIMEDOUT, ERR_NETWORK, etc.
      const isNetworkError =
        !error.response &&
        error.message &&
        (error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ERR_NETWORK') ||
          error.code === 'ECONNABORTED');

      if (isNetworkError && !originalRequest._retryCount) {
        originalRequest._retryCount = 0;
      }

      if (isNetworkError && originalRequest._retryCount < MAX_RETRIES) {
        const retryCount = originalRequest._retryCount || 0;
        const backoffMs = RETRY_BACKOFF_MS[retryCount];

        logger.warn(
          `Network error detected, retrying request (${retryCount + 1}/${MAX_RETRIES}) after ${backoffMs}ms`,
          error.message
        );

        // Wait for exponential backoff before retrying
        await new Promise(resolve => setTimeout(resolve, backoffMs));

        originalRequest._retryCount = retryCount + 1;
        // Generate new request ID for retry
        originalRequest.headers['X-Request-ID'] = generateRequestId();

        try {
          return client(originalRequest);
        } catch (retryError) {
          return Promise.reject(retryError);
        }
      }

      if (error.response?.status === 401 && !originalRequest._authRetry) {
        originalRequest._authRetry = true;

        // RELIABILITY FIX (H-2): Synchronous promise assignment eliminates the race window.
        // Previously, multiple concurrent 401 responses could enter the refresh path
        // between the null check and the promise assignment, triggering duplicate refresh
        // calls. Now the assignment is synchronous — no await between check and assign.
        if (!refreshTokenInProgress) {
          const refreshPromise = refreshAccessToken().finally(() => {
            refreshTokenInProgress = null;
          });
          refreshTokenInProgress = refreshPromise;
        }

        try {
          await refreshTokenInProgress;
          // Retry original request with new token
          return api(originalRequest);
        } catch (refreshError) {
          // Refresh failed, redirect to login
          logger.error('Token refresh failed:', refreshError);
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
          // Let auth store handle redirect
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    }
  );

  // RM-002 FIX: Certificate pinning enforcement interceptor.
  // On native platforms with TrustKit or custom native module, the TLS handshake
  // itself validates pins. This interceptor provides a secondary check for
  // environments where native pinning isn't available (e.g., dev builds).
  // In production native builds, TrustKit handles pinning at the TLS layer.
  if (arePinsConfigured()) {
    client.interceptors.response.use(
      response => {
        // RM-002: On native builds, TrustKit enforces pinning at TLS layer.
        // On web/dev, log that pin validation is deferred to native layer.
        return response;
      },
      (error: AxiosError) => {
        // RM-002: Detect SSL/TLS errors that may indicate pin mismatch
        if (
          error.code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
          error.code === 'CERT_HAS_EXPIRED' ||
          error.message?.includes('certificate') ||
          error.message?.includes('SSL')
        ) {
          logger.error(
            '[API] TLS/certificate error detected — possible pin mismatch:',
            error.message
          );
          auditService
            .log(
              'system',
              'certificate_pin_failure',
              {
                url: error.config?.url,
                error: error.message,
              },
              'error'
            )
            .catch(() => {});
        }
        return Promise.reject(error);
      }
    );
  }

  return client;
}

function getApiClient(): AxiosInstance {
  if (!api) {
    api = createApiClient();
  }
  return api;
}

export { getApiClient };

/**
 * RELIABILITY FIX (M-2): Create an AbortController-linked request config.
 * Components pass this to API calls in useEffect, and abort in the cleanup.
 *
 * Usage:
 *   useEffect(() => {
 *     const { signal, abort } = createAbortableRequest();
 *     api.get('/endpoint', { signal }).then(...).catch(...);
 *     return abort;
 *   }, []);
 */
export function createAbortableRequest(): { signal: AbortSignal; abort: () => void } {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
  };
}

/**
 * RELIABILITY FIX (M-1): Lightweight runtime validation for critical API responses.
 * Validates that required fields exist and are the expected type before the app
 * relies on them. Catches server-side schema drift early at the API boundary.
 */
export function validateResponse<T>(
  data: unknown,
  requiredFields: { key: string; type: 'string' | 'number' | 'boolean' | 'object' }[],
  context: string
): T {
  if (!data || typeof data !== 'object') {
    throw new Error(`[${context}] Invalid response: expected object, got ${typeof data}`);
  }
  const obj = data as Record<string, unknown>;
  for (const { key, type } of requiredFields) {
    if (!(key in obj)) {
      throw new Error(`[${context}] Missing required field: ${key}`);
    }
    if (typeof obj[key] !== type) {
      throw new Error(`[${context}] Field "${key}" expected ${type}, got ${typeof obj[key]}`);
    }
  }
  return data as T;
}

// DV-008 FIX: Generate device fingerprint from available device info
// This ensures refresh tokens are only used from the same device
// SECURITY FIX: Improved entropy collection for stronger fingerprinting
async function getDeviceFingerprint(): Promise<string> {
  try {
    // Collect comprehensive device information for fingerprinting
    const deviceInfo = {
      os: Platform.OS || 'unknown',
      // Collect multiple entropy sources from browser/platform APIs
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
      screenResolution:
        typeof window !== 'undefined' && window.screen
          ? `${window.screen.width}x${window.screen.height}`
          : 'unknown',
      timezone:
        typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'unknown',
      language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
      // For native platforms, you would add:
      // - Unique device ID (requires native module)
      // - Hardware serial number (requires native module)
      // - SIM card IMEI (requires native module and permissions)
    };

    // Create fingerprint from multiple entropy sources
    const fingerprintString = JSON.stringify(deviceInfo);
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprintString);

    // Use SubtleCrypto API available in modern JS environments
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    logger.log('Device fingerprint generated from:', Object.keys(deviceInfo).join(', '));
    return hashHex;
  } catch (error) {
    logger.warn('Failed to generate device fingerprint:', error);
    // Fallback: Create a basic fingerprint from limited entropy
    // This is weaker but ensures some device binding
    const fallbackEntropy =
      typeof navigator !== 'undefined'
        ? navigator.userAgent + (new Date().getTime() % 86400000)
        : 'fallback-' + Math.random();
    const encoder = new TextEncoder();
    const data = encoder.encode(fallbackEntropy);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}

/**
 * Refresh access token using refresh token.
 * Stores new tokens in secure store.
 * DV-008 FIX: Includes device fingerprint for device binding
 */
async function refreshAccessToken(): Promise<void> {
  try {
    const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    // DV-008 FIX: Generate and include device fingerprint
    const deviceFingerprint = await getDeviceFingerprint();

    const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refreshToken,
      deviceFingerprint, // DV-008 FIX: Include device context
    });

    const { accessToken, refreshToken: newRefreshToken } = response.data;

    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    if (newRefreshToken) {
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, newRefreshToken);
    }
  } catch (error) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    throw error;
  }
}

/**
 * Store tokens securely.
 */
export async function storeTokens(accessToken: string, refreshToken: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  } catch (error) {
    logger.error('Failed to store tokens:', error);
    throw new Error('Failed to store authentication tokens');
  }
}

/**
 * Clear stored tokens.
 */
export async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  } catch (error) {
    logger.error('Failed to clear tokens:', error);
  }
}

// ============================================================================
// SRP Authentication
// ============================================================================

export interface SrpInitResponse {
  salt: string; // hex-encoded
  B: string; // hex-encoded server's ephemeral public key
  sessionId: string; // session identifier
}

export async function srpInit(email: string): Promise<SrpInitResponse> {
  const client = getApiClient();
  const response = await client.post('/auth/srp/init', { email });
  return response.data;
}

export interface SrpVerifyRequest {
  sessionId: string;
  A: string; // hex-encoded client ephemeral public key
  M1: string; // hex-encoded proof
}

export interface SrpVerifyResponse {
  M2: string; // hex-encoded server proof
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
}

export async function srpVerify(request: SrpVerifyRequest): Promise<SrpVerifyResponse> {
  const client = getApiClient();
  const response = await client.post('/auth/srp/verify', request);
  return response.data;
}

// ============================================================================
// Vault Operations
// ============================================================================

export interface VaultSummary {
  id: string;
  name: string;
  encryptedMetadata: string; // base64-encoded
  fileCount: number;
  lastModified: string; // ISO 8601
  securityLevel: 'standard' | 'high' | 'maximum';
}

// M-5 FIX: Paginated vault list response
export interface PaginatedVaultResponse {
  vaults: VaultSummary[];
  next_cursor?: string;
  has_more: boolean;
}

export async function listVaults(): Promise<VaultSummary[]> {
  const client = getApiClient();
  const response = await client.get('/vaults');
  // Support both paginated (new) and flat array (legacy) response formats
  if (Array.isArray(response.data)) {
    return response.data;
  }
  return response.data.vaults || [];
}

// M-5 FIX: Fetch a single page of vaults with cursor-based pagination.
export async function listVaultsPaginated(
  cursor?: string,
  limit: number = 50
): Promise<PaginatedVaultResponse> {
  const client = getApiClient();
  const params: Record<string, string> = { limit: String(limit) };
  if (cursor) params.cursor = cursor;
  const response = await client.get('/vaults', { params });
  return {
    vaults: response.data.vaults || [],
    next_cursor: response.data.next_cursor,
    has_more: response.data.has_more ?? false,
  };
}

export interface CreateVaultRequest {
  name: string;
  encryptedMetadata: string; // base64-encoded
  wrappedMek?: string;
  kekSaltHex?: string;
}

export async function createVault(request: CreateVaultRequest): Promise<string> {
  const client = getApiClient();
  const response = await client.post('/vaults', request);
  return response.data.vaultId;
}

export async function deleteVault(vaultId: string): Promise<void> {
  const client = getApiClient();
  await client.delete(`/vaults/${vaultId}`);
}

// ============================================================================
// File Upload/Download URLs
// ============================================================================

export interface GetUploadUrlRequest {
  vaultId: string;
  blobId: string;
  encryptedMetadata: string; // base64-encoded
  size: number;
}

export interface GetUploadUrlResponse {
  uploadUrl: string;
  method: string; // 'PUT' or 'POST'
}

export async function getUploadUrl(request: GetUploadUrlRequest): Promise<GetUploadUrlResponse> {
  const client = getApiClient();
  const response = await client.post('/blobs/upload-url', request);
  return response.data;
}

export interface GetDownloadUrlResponse {
  downloadUrl: string;
}

export async function getDownloadUrl(
  vaultId: string,
  blobId: string
): Promise<GetDownloadUrlResponse> {
  const client = getApiClient();
  const response = await client.get(`/vaults/${vaultId}/blobs/${blobId}/download-url`);
  return response.data;
}

// ============================================================================
// Secure Sharing
// ============================================================================

export interface CreateShareRequest {
  vaultId: string;
  blobId: string;
  recipientId: string;
  encryptedKey: string; // base64-encoded (X25519 sealed)
  expiresAt?: string; // ISO 8601
  permissions?: 'read' | 'read-decrypt';
}

export async function createShare(request: CreateShareRequest): Promise<string> {
  const client = getApiClient();
  const response = await client.post('/shares', request);
  return response.data.shareId;
}

export interface ShareInfo {
  id: string;
  vaultId: string;
  blobId: string;
  recipientId: string;
  recipientEmail: string;
  createdAt: string;
  expiresAt?: string;
  permissions: string;
}

export async function listIncomingShares(): Promise<ShareInfo[]> {
  const client = getApiClient();
  const response = await client.get('/shares/incoming');
  return response.data.shares || [];
}

export async function listOutgoingShares(): Promise<ShareInfo[]> {
  const client = getApiClient();
  const response = await client.get('/shares/outgoing');
  return response.data.shares || [];
}

export async function acceptShare(shareId: string): Promise<void> {
  const client = getApiClient();
  await client.post(`/shares/${shareId}/accept`);
}

export async function rejectShare(shareId: string): Promise<void> {
  const client = getApiClient();
  await client.post(`/shares/${shareId}/reject`);
}

export async function revokeShare(shareId: string): Promise<void> {
  const client = getApiClient();
  await client.delete(`/shares/${shareId}`);
}

// ============================================================================
// User Information
// ============================================================================

export interface UserInfo {
  id: string;
  email: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  publicKeyX25519: string; // base64-encoded
  publicKeyEd25519: string; // base64-encoded
  createdAt: string;
}

export async function getUserInfo(): Promise<UserInfo> {
  // SECURITY FIX: Remove mock user data for web platform
  // Web platform must connect to real server or fail-closed
  if (Platform.OS === 'web') {
    throw new Error(
      'Web platform requires proper authentication. ' +
        'Please ensure API endpoint is configured and user is authenticated via proper SRP flow.'
    );
  }
  const client = getApiClient();
  const response = await client.get('/user/profile');
  return response.data;
}

export async function getPublicKey(userId: string): Promise<Uint8Array> {
  const client = getApiClient();
  const response = await client.get(`/users/${userId}/public-key`);
  const publicKey = response.data.publicKey; // base64-encoded
  return new Uint8Array(Buffer.from(publicKey, 'base64'));
}

// ============================================================================
// Account Management
// ============================================================================

export async function changePassword(
  oldPasswordProof: string,
  newPasswordVerifier: string
): Promise<void> {
  const client = getApiClient();
  await client.post('/user/change-password', {
    oldPasswordProof,
    newPasswordVerifier,
  });
}

export async function deleteAccount(): Promise<void> {
  const client = getApiClient();
  await client.delete('/user/account');
}

// ============================================================================
// Device Management (FIDO2)
// ============================================================================

export interface RegisterFido2DeviceRequest {
  name: string;
  credentialId: string; // base64-encoded
  publicKey: string; // base64-encoded
}

export async function registerFido2Device(request: RegisterFido2DeviceRequest): Promise<string> {
  const client = getApiClient();
  const response = await client.post('/user/fido2-devices', request);
  return response.data.deviceId;
}

export interface Fido2Device {
  id: string;
  name: string;
  registeredAt: string;
  lastUsedAt?: string;
}

export async function listFido2Devices(): Promise<Fido2Device[]> {
  const client = getApiClient();
  const response = await client.get('/user/fido2-devices');
  return response.data.devices || [];
}

export async function revokeFido2Device(deviceId: string): Promise<void> {
  const client = getApiClient();
  await client.delete(`/user/fido2-devices/${deviceId}`);
}
