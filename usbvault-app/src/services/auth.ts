import { Platform } from 'react-native';
import * as crypto from '@/crypto/bridge';
import * as srp from '@/crypto/srpClient';
import * as api from './api';
import { logger } from '@/utils/logger';

// PH4-FIX: Type definitions for native storage modules
interface AsyncStorageInterface {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
}

interface SecureStoreInterface {
  getItemAsync: (key: string, options?: unknown) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: unknown) => Promise<void>;
  deleteItemAsync: (key: string, options?: unknown) => Promise<void>;
  WHEN_UNLOCKED_THIS_DEVICE_ONLY?: string;
}

interface LocalAuthenticationInterface {
  hasHardwareAsync: () => Promise<boolean>;
  isAvailableAsync: () => Promise<boolean>;
  supportedAuthenticationTypesAsync: () => Promise<number[]>;
  authenticateAsync: (options?: unknown) => Promise<{ success: boolean; error?: string }>;
  AuthenticationType: {
    FACIAL_RECOGNITION: number;
    FINGERPRINT: number;
    IRIS: number;
  };
}

// Conditional imports for native-only modules
let SecureStore: SecureStoreInterface | null = null;
let LocalAuthentication: LocalAuthenticationInterface | null = null;
let AsyncStorage: AsyncStorageInterface;

if (Platform.OS !== 'web') {
  SecureStore = require('expo-secure-store');
  LocalAuthentication = require('expo-local-authentication');
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} else {
  // Web stubs
  AsyncStorage = {
    getItem: async (key: string) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: async (key: string, value: string) => {
      try {
        localStorage.setItem(key, value);
      } catch {}
    },
    removeItem: async (key: string) => {
      try {
        localStorage.removeItem(key);
      } catch {}
    },
  };
}

/**
 * Authentication service using SRP (Secure Remote Password).
 *
 * Key features:
 * - Password never sent to server
 * - SRP proof of knowledge
 * - Automatic key derivation (Argon2id via Rust)
 * - Master key kept only in memory
 * - Public key generation for X25519 key exchange
 * - PH9-FIX: Biometric authentication support
 * - PH9-FIX: Secure storage with Keychain/EncryptedSharedPreferences
 */

export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  email: string | null;
  subscriptionTier: string | null;
}

// PH9-FIX: Biometric authentication types
export type BiometricType = 'face' | 'fingerprint' | 'iris' | 'none';

export interface BiometricAvailability {
  available: boolean;
  types: BiometricType[];
}

// PH9-FIX: Secure storage options for iOS Keychain and Android EncryptedSharedPreferences
const SECURE_STORE_OPTIONS = SecureStore
  ? {
      keychainAccessible: SecureStore?.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }
  : {};

// In-memory store for master key (never persisted)
let masterKey: Uint8Array | null = null;

/**
 * Login user with email and password.
 *
 * Process:
 * 1. Hash email (SHA-256)
 * 2. Request SRP parameters from server (salt, B)
 * 3. Derive SRP verifier locally
 * 4. Compute proof (M1)
 * 5. Send proof to server
 * 6. Verify server proof (M2)
 * 7. Derive master key from password using server-provided salt
 * 8. Store tokens, keep master key in memory
 */
export async function login(email: string, password: string): Promise<void> {
  // F7: The SRP-6a handshake now runs in pure TS (crypto/srpClient.ts) and is
  // byte-for-byte interoperable with the Go server on every platform, including
  // web. The previous `Platform.OS === 'web'` hard throw is therefore removed —
  // web logs in via the same real SRP-6a path as native.
  try {
    // Step 1: Get SRP parameters from server
    const srpInitResp = await api.srpInit(email);
    const srpSalt = new Uint8Array(Buffer.from(srpInitResp.salt, 'hex'));
    const B = new Uint8Array(Buffer.from(srpInitResp.B, 'hex'));
    const sessionId = srpInitResp.sessionId;

    // Step 2-4: Compute SRP proof (M1) and session key
    const { A, M1, sessionKey, APub } = await computeSrpProof(
      email, // TD-003 FIX: Use actual email instead of hardcoded 'client'
      password,
      srpSalt,
      B
    );

    // Step 5: Send proof to server
    const srpVerify = await api.srpVerify({
      sessionId,
      A: A.toString('hex'),
      M1: M1.toString('hex'),
    });

    // TD-002 FIX: Verify server proof M2 (mutual authentication)
    // This ensures we're talking to the real server, not a MITM
    const expectedM2 = await computeExpectedM2(APub, M1, sessionKey);
    const serverM2 = Buffer.from(srpVerify.M2, 'hex');
    if (!expectedM2.equals(serverM2)) {
      throw new Error('Server authentication failed: M2 proof mismatch. Possible MITM attack.');
    }

    // Step 6: Store tokens
    await api.storeTokens(srpVerify.accessToken, srpVerify.refreshToken);

    // Step 7: Derive master key from password using SRP salt (Argon2id via Rust)
    masterKey = await crypto.deriveKey(password, srpSalt);

    // PH9-FIX: Optionally enable biometric unlock with derived master key
    const biometricAvailable = await checkBiometricAvailability();
    if (biometricAvailable.available) {
      // User can enable biometric unlock in settings, so we don't force it here
      logger.log('Biometric authentication available for user');
    }

    logger.log('Login successful:', srpVerify.userId, srpVerify.email);
  } catch (error) {
    // #65: do NOT mask the forced-re-registration signal as a generic credential
    // error — the UI must be able to detect it and route the user to re-registration
    // (re-enter the same password to recompute a valid post-modulus-fix verifier).
    if (error instanceof api.ReRegistrationRequiredError) {
      logger.log('Login requires re-registration after SRP modulus fix (#65):', email);
      throw error;
    }
    logger.error('Login failed:', error);
    throw new Error('Failed to login. Please check your credentials.');
  }
}

/**
 * Register new user with email and password.
 *
 * Process:
 * 1. Generate SRP salt
 * 2. Generate SRP verifier
 * 3. Generate X25519 keypair (key exchange)
 * 4. Generate Ed25519 keypair (signing)
 * 5. Send verifier + public keys to server
 * 6. Auto-login after registration
 */
// TD-001 CLIENT FIX: Complete registration with SRP verifier and key generation
export async function register(email: string, password: string): Promise<void> {
  // F7: Registration now derives a REAL SRP-6a verifier in pure TS, so it works
  // on web and native alike. The previous `Platform.OS === 'web'` hard throw is
  // removed.
  try {
    // Step 1: Generate a random 32-byte SRP salt via the CSPRNG.
    const srpSalt = await crypto.randomBytes(32);

    // Step 2: Compute the REAL SRP-6a verifier v = g^x mod N, where x is derived
    // from (salt, email, password) with Argon2id exactly as the Rust client / Go
    // server expect. This is what the server stores and later authenticates
    // against — proven interoperable by the F6/F7 cross-implementation KAT.
    const srpVerifier = await computeSrpVerifierHex(email, password, srpSalt);

    // Step 3: Generate X25519 keypair for encrypted file sharing
    const shareKeypair = await crypto.generateShareKeypair();

    // Step 4: Generate Ed25519 keypair for digital signatures (non-repudiation)
    // AUTH-1 FIX: Separate Ed25519 signing key from X25519 key exchange key
    const signingKeypair = await crypto.generateSigningKeypair();

    // Store both secret keys securely on device
    // Public keys are sent to server for other users to encrypt to us / verify our signatures
    const publicKeyX25519 = Buffer.from(shareKeypair.publicKey).toString('base64');
    const publicKeyEd25519 = Buffer.from(signingKeypair.publicKey).toString('base64');

    // Step 5: Send registration data to server
    const response = await fetch(
      // RM-002 FIX: Default host must match the pinned host (api.usbvault.io).
      `${process.env.EXPO_PUBLIC_API_URL || 'https://api.usbvault.io'}/auth/register`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          srp_salt: Buffer.from(srpSalt).toString('hex'),
          srp_verifier: srpVerifier,
          public_key_x25519: publicKeyX25519,
          public_key_ed25519: publicKeyEd25519,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Registration failed: ${errorText}`);
    }

    // Step 5b: Store secret keys securely on device when SecureStore is available
    // (native iOS Keychain / Android EncryptedSharedPreferences). On web there is
    // no SecureStore, so this block is skipped — share/signing secret persistence
    // on web is handled elsewhere by the web key-storage layer.
    // These keys are needed for decrypting shared files and signing messages.
    if (SecureStore) {
      await SecureStore.setItemAsync(
        'usbvault_share_secret_key',
        Buffer.from(shareKeypair.secretKey).toString('hex'),
        SECURE_STORE_OPTIONS
      );
      await SecureStore.setItemAsync(
        'usbvault_signing_secret_key',
        Buffer.from(signingKeypair.secretKey).toString('hex'),
        SECURE_STORE_OPTIONS
      );
    }

    // Step 6: Auto-login after successful registration
    await login(email, password);
  } catch (error) {
    logger.error('Registration failed:', error);
    throw new Error('Failed to register. Please try again.');
  }
}

/**
 * PH9-FIX: Check biometric availability on device.
 * Returns available biometric types (face, fingerprint, etc.)
 */
export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  if (Platform.OS === 'web' || !LocalAuthentication) {
    return { available: false, types: [] };
  }
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      return { available: false, types: [] };
    }

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const biometricTypes: BiometricType[] = [];

    // Map LocalAuthentication types to our BiometricType
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometricTypes.push('face');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometricTypes.push('fingerprint');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      biometricTypes.push('iris');
    }

    return {
      available: biometricTypes.length > 0,
      types: biometricTypes,
    };
  } catch (error) {
    logger.error('Failed to check biometric availability:', error);
    return { available: false, types: [] };
  }
}

/**
 * PH9-FIX: Authenticate user with biometric authentication (Face ID or Fingerprint).
 * Falls back to password authentication if biometrics are not available.
 */
export async function authenticateWithBiometrics(): Promise<boolean> {
  try {
    const biometricAvailable = await checkBiometricAvailability();

    if (!biometricAvailable.available) {
      logger.warn('Biometric authentication not available, falling back to password');
      return false;
    }

    // Attempt biometric authentication
    const isAuthenticated = await LocalAuthentication!.authenticateAsync({
      reason: 'Authenticate to unlock your vault',
      fallbackLabel: 'Use passcode instead',
      disableDeviceFallback: false,
    });

    if (isAuthenticated.success) {
      logger.log('Biometric authentication successful');
      return true;
    } else if (isAuthenticated.error === 'user_cancel') {
      logger.log('User cancelled biometric authentication');
      return false;
    } else {
      logger.error('Biometric authentication failed:', isAuthenticated.error);
      return false;
    }
  } catch (error) {
    logger.error('Error during biometric authentication:', error);
    // Fallback to password authentication
    return false;
  }
}

/**
 * PH9-FIX: Enable biometric unlock for fast re-authentication.
 * Stores an encrypted reference to the master key in SecureStore.
 * Note: The master key itself is NOT stored; only a reference/token is stored.
 */
export async function enableBiometricUnlock(masterKeyRef: string): Promise<void> {
  if (Platform.OS === 'web' || !SecureStore) {
    throw new Error('Biometric authentication is not available on web');
  }
  try {
    const biometricAvailable = await checkBiometricAvailability();

    if (!biometricAvailable.available) {
      throw new Error('Biometric authentication is not available on this device');
    }

    await SecureStore.setItemAsync('usbvault_biometric_unlock', masterKeyRef, SECURE_STORE_OPTIONS);

    logger.log('Biometric unlock enabled');
  } catch (error) {
    logger.error('Failed to enable biometric unlock:', error);
    throw new Error('Failed to enable biometric unlock');
  }
}

/**
 * PH9-FIX: Disable biometric unlock by removing stored key reference.
 */
export async function disableBiometricUnlock(): Promise<void> {
  if (Platform.OS === 'web' || !SecureStore) return;
  try {
    await SecureStore.deleteItemAsync('usbvault_biometric_unlock');
    logger.log('Biometric unlock disabled');
  } catch (error) {
    logger.error('Failed to disable biometric unlock:', error);
    throw new Error('Failed to disable biometric unlock');
  }
}

/**
 * PH9-FIX: Check if biometric unlock is currently enabled.
 */
export async function isBiometricUnlockEnabled(): Promise<boolean> {
  if (Platform.OS === 'web' || !SecureStore) return false;
  try {
    const biometricRef = await SecureStore.getItemAsync('usbvault_biometric_unlock');
    return biometricRef !== null;
  } catch (error) {
    logger.error('Failed to check biometric unlock status:', error);
    return false;
  }
}

/**
 * PH9-FIX: Migrate any tokens from AsyncStorage to SecureStore.
 * This ensures sensitive tokens are stored in the most secure location (Keychain/EncryptedSharedPreferences).
 * expo-secure-store uses iOS Keychain and Android EncryptedSharedPreferences internally.
 */
export async function migrateToSecureStorage(): Promise<void> {
  try {
    const accessTokenKey = 'usbvault_access_token_async';
    const refreshTokenKey = 'usbvault_refresh_token_async';

    // Check if tokens exist in AsyncStorage
    const accessToken = await AsyncStorage.getItem(accessTokenKey);
    const refreshToken = await AsyncStorage.getItem(refreshTokenKey);

    if (accessToken) {
      await SecureStore!.setItemAsync('usbvault_access_token', accessToken, SECURE_STORE_OPTIONS);
      await AsyncStorage.removeItem(accessTokenKey);
      logger.log('Migrated access token to SecureStore');
    }

    if (refreshToken) {
      await SecureStore!.setItemAsync('usbvault_refresh_token', refreshToken, SECURE_STORE_OPTIONS);
      await AsyncStorage.removeItem(refreshTokenKey);
      logger.log('Migrated refresh token to SecureStore');
    }
  } catch (error) {
    logger.error('Failed to migrate tokens to SecureStore:', error);
    // Don't throw - this is a best-effort migration
  }
}

/**
 * Logout user.
 * Clears tokens and master key.
 */
export async function logout(): Promise<void> {
  try {
    await api.clearTokens();
    // PH9-FIX: Also clear biometric unlock reference on logout
    await disableBiometricUnlock().catch(() => {
      // Silently ignore if biometric unlock wasn't enabled
    });
    masterKey = null;
    logger.log('Logout successful');
  } catch (error) {
    logger.error('Logout failed:', error);
    throw new Error('Failed to logout');
  }
}

/**
 * Get master key from memory.
 * Required for file encryption/decryption.
 */
export function getMasterKey(): Uint8Array | null {
  return masterKey;
}

/**
 * Check if user is authenticated.
 * Verifies both tokens and master key are available.
 * PH9-FIX: Uses WHEN_UNLOCKED_THIS_DEVICE_ONLY for secure storage
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      // SECURITY FIX (JWT-WEB): Never read JWTs from localStorage. Access tokens on web
      // live in the in-memory store inside api.ts (via SecureStore shim) and are gone
      // after a reload. Authentication state on web is governed by the in-memory master
      // key and the (also in-memory) access token retrieved through the api module.
      const token = await api.getAccessToken();
      return token !== null && masterKey !== null;
    }
    const token = await SecureStore?.getItemAsync('usbvault_access_token', SECURE_STORE_OPTIONS);
    return token !== null && masterKey !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Clear master key from memory (for security).
 * Useful for locking vault without full logout.
 */
export function clearMasterKey(): void {
  masterKey = null;
}

// ============================================================================
// SRP Helper Functions
// ============================================================================

/**
 * Compute the SRP-6a client proof using the REAL SRP-6a client
 * (crypto/srpClient.ts). This performs genuine modular exponentiation over the
 * ffdhe3072 group and is byte-for-byte interoperable with the Go server and the
 * Rust client (proven by the F6/F7 cross-implementation KAT).
 *
 * Works identically on web and native — the client is pure TS/BigInt + Argon2id
 * (hash-wasm) for the x-derivation, so no platform-specific SRP path is needed.
 *
 * TD-003: the actual email is used as the SRP identity (must match registration).
 *
 * @returns A (client public, as big-endian bytes), M1 (proof), the shared
 *   session key K, and the client public A as a BigInt for M2 verification.
 */
async function computeSrpProof(
  email: string,
  password: string,
  salt: Uint8Array,
  B: Uint8Array
): Promise<{ A: Buffer; M1: Buffer; sessionKey: Buffer; APub: bigint }> {
  // Generate the client ephemeral (a, A = g^a mod N) with a CSPRNG.
  const { a, A } = srp.generateEphemeral();

  // Derive the SRP private key x from (salt, email, password) the SAME way the
  // Rust client does (Argon2id with domain-separated salt).
  const x = await srp.deriveSrpX(salt, email, password);

  // Process the server challenge B -> { S, K, M1 } via real SRP-6a math.
  const { K, M1 } = await srp.processChallenge(a, x, srp.bytesToBigInt(B));

  return {
    A: Buffer.from(srp.bigIntToBytes(A)),
    M1: Buffer.from(M1),
    sessionKey: Buffer.from(K),
    APub: A,
  };
}

// TD-002: Compute expected M2 = H(PAD(A) || M1 || K) for mutual authentication,
// matching the server's computation (srp.go) and the Rust client (verify_server).
async function computeExpectedM2(APub: bigint, M1: Buffer, sessionKey: Buffer): Promise<Buffer> {
  const m2 = await srp.computeM2(APub, new Uint8Array(M1), new Uint8Array(sessionKey));
  return Buffer.from(m2);
}

/**
 * Compute the SRP-6a verifier v = g^x mod N for registration, where x is derived
 * from (salt, email, password) exactly as the Rust client / Go server expect.
 * Returns the verifier as a big-endian hex string.
 */
async function computeSrpVerifierHex(
  email: string,
  password: string,
  salt: Uint8Array
): Promise<string> {
  const x = await srp.deriveSrpX(salt, email, password);
  const v = srp.deriveVerifier(x);
  return Buffer.from(srp.bigIntToBytes(v)).toString('hex');
}

// ============================================================================
// Note: Random bytes generation is handled by crypto.bridge module.
// The SRP-6a handshake runs in pure TS (crypto/srpClient.ts) on every platform.
// ============================================================================
