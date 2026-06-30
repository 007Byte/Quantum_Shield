/**
 * FIDO2 / WebAuthn Service Tests — Extended Coverage
 *
 * Complements fido2Service.test.ts. Covers the WebAuthn flows the original
 * suite leaves untested:
 *   - authenticate(): full assertion flow, lastUsedAt update, unknown
 *     credential, and the "no assertion returned" error.
 *   - registerPasskey(): platform-authenticator gating, PRF extension key
 *     derivation, persistence, and the unsupported-platform error.
 *   - authenticateWithPasskey(): passkey picker flow, PRF extraction, and the
 *     "no passkeys / unknown credential" error branches.
 *   - derivePrfKey(): the SubtleCrypto failure path.
 *   - isPasskeySupported(): the availability-check throw -> false branch.
 *
 * Boundaries mocked: navigator.credentials (WebAuthn), window.PublicKeyCredential,
 * Platform, auditService, logger. The service-under-test runs for real, including
 * its base64/hex helpers and challenge generation (backed by jest.setup webcrypto).
 */

import { fido2Service, Fido2Device } from '../fido2Service';

// Mock localStorage (jsdom's storage is per-origin; this keeps each test clean).
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), log: jest.fn() },
}));

const DEVICES_KEY = 'usbvault:fido2_devices';

// ── Helpers ────────────────────────────────────────────────────────────

/** Encode a byte array as a base64 credential id (matches the service's encoding). */
function bytesToBase64(bytes: number[]): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function enableWebAuthn(credentials: { create?: any; get?: any }): void {
  (window as any).PublicKeyCredential = jest.fn();
  (navigator as any).credentials = { create: jest.fn(), get: jest.fn(), ...credentials };
}

function disableWebAuthn(): void {
  delete (window as any).PublicKeyCredential;
}

function seedDevices(devices: Fido2Device[]): void {
  localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

function makeDevice(over: Partial<Fido2Device> = {}): Fido2Device {
  return {
    id: 'fido2-seed-1',
    name: 'YubiKey 5',
    credentialIdBase64: bytesToBase64([0x01, 0x02, 0x03, 0x04]),
    publicKeyBase64: bytesToBase64([0x10, 0x20]),
    registeredAt: '2026-01-01T00:00:00.000Z',
    transport: 'usb',
    ...over,
  };
}

describe('Fido2Service — extended coverage', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    enableWebAuthn({});
  });

  afterEach(() => {
    disableWebAuthn();
    delete (navigator as any).credentials;
  });

  // ============================================================================
  // authenticate()
  // ============================================================================
  describe('authenticate', () => {
    it('returns the matching device and stamps lastUsedAt when the assertion matches', async () => {
      const rawIdBytes = [0xaa, 0xbb, 0xcc, 0xdd];
      const device = makeDevice({
        id: 'fido2-match',
        credentialIdBase64: bytesToBase64(rawIdBytes),
      });
      seedDevices([device]);

      const getMock = jest.fn().mockResolvedValue({
        rawId: new Uint8Array(rawIdBytes).buffer,
      });
      enableWebAuthn({ get: getMock });

      const result = await fido2Service.authenticate();

      expect(getMock).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: expect.objectContaining({
            userVerification: 'preferred',
            allowCredentials: expect.arrayContaining([
              expect.objectContaining({ type: 'public-key' }),
            ]),
          }),
        })
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe('fido2-match');
      // lastUsedAt is freshly set and persisted.
      expect(result!.lastUsedAt).toBeDefined();
      const persisted: Fido2Device[] = JSON.parse(localStorage.getItem(DEVICES_KEY)!);
      expect(persisted[0].lastUsedAt).toBe(result!.lastUsedAt);
    });

    it('returns null when the asserted credential is not among registered devices', async () => {
      seedDevices([makeDevice({ credentialIdBase64: bytesToBase64([0x01, 0x02]) })]);

      // Assertion returns a different rawId than any registered credential.
      enableWebAuthn({
        get: jest.fn().mockResolvedValue({ rawId: new Uint8Array([0x99, 0x88]).buffer }),
      });

      await expect(fido2Service.authenticate()).resolves.toBeNull();
    });

    it('throws when the authenticator returns no assertion', async () => {
      seedDevices([makeDevice()]);
      enableWebAuthn({ get: jest.fn().mockResolvedValue(null) });

      await expect(fido2Service.authenticate()).rejects.toThrow(
        'Authentication failed — no assertion returned'
      );
    });
  });

  // ============================================================================
  // isPasskeySupported() — throw branch
  // ============================================================================
  describe('isPasskeySupported', () => {
    it('returns false when the platform-authenticator availability check throws', async () => {
      (window as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: jest
          .fn()
          .mockRejectedValue(new Error('boom')),
      };
      (navigator as any).credentials = { create: jest.fn(), get: jest.fn() };

      await expect(fido2Service.isPasskeySupported()).resolves.toBe(false);
    });

    it('returns false when isUserVerifyingPlatformAuthenticatorAvailable resolves false', async () => {
      (window as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: jest.fn().mockResolvedValue(false),
      };
      (navigator as any).credentials = { create: jest.fn(), get: jest.fn() };

      await expect(fido2Service.isPasskeySupported()).resolves.toBe(false);
    });
  });

  // ============================================================================
  // derivePrfKey() — SubtleCrypto failure path
  // ============================================================================
  describe('derivePrfKey error path', () => {
    it('wraps a SubtleCrypto deriveBits failure in a descriptive error', async () => {
      const originalCrypto = global.crypto;
      Object.defineProperty(global, 'crypto', {
        value: {
          ...originalCrypto,
          subtle: {
            importKey: jest.fn().mockResolvedValue({}),
            deriveBits: jest.fn().mockRejectedValue(new Error('HKDF unavailable')),
          },
          getRandomValues: (arr: Uint8Array) => {
            for (let i = 0; i < arr.length; i++) arr[i] = i & 0xff;
            return arr;
          },
        },
        configurable: true,
      });

      const { auditService } = require('@/services/auditService');

      await expect(fido2Service.derivePrfKey(new Uint8Array(32).buffer)).rejects.toThrow(
        /PRF key derivation failed/
      );
      expect(auditService.log).toHaveBeenCalledWith(
        'prf_key_derivation_error',
        expect.any(String),
        expect.objectContaining({ error: expect.any(String) })
      );

      Object.defineProperty(global, 'crypto', { value: originalCrypto, configurable: true });
    });
  });

  // ============================================================================
  // registerPasskey()
  // ============================================================================
  describe('registerPasskey', () => {
    function enablePlatformAuthenticator(createMock: any): void {
      (window as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: jest.fn().mockResolvedValue(true),
      };
      (navigator as any).credentials = { create: createMock, get: jest.fn() };
    }

    it('throws when WebAuthn is not supported', async () => {
      disableWebAuthn();
      await expect(fido2Service.registerPasskey('user-1', 'My Passkey')).rejects.toThrow(
        'WebAuthn is not supported in this browser'
      );
    });

    it('throws when the platform authenticator is not available', async () => {
      (window as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: jest.fn().mockResolvedValue(false),
      };
      (navigator as any).credentials = { create: jest.fn(), get: jest.fn() };

      await expect(fido2Service.registerPasskey('user-1', 'My Passkey')).rejects.toThrow(
        'Platform authenticator (passkey) is not supported on this device'
      );
    });

    it('throws when no credential is returned from the authenticator', async () => {
      enablePlatformAuthenticator(jest.fn().mockResolvedValue(null));

      await expect(fido2Service.registerPasskey('user-1', 'My Passkey')).rejects.toThrow(
        'No credential returned from authenticator'
      );
    });

    it('registers a platform passkey and derives a PRF key when PRF output is present', async () => {
      const rawId = new Uint8Array([0x0a, 0x0b, 0x0c]).buffer;
      const prfResult = new Uint8Array(32).buffer;

      const createMock = jest.fn().mockResolvedValue({
        rawId,
        response: {
          attestationObject: new Uint8Array([0xde, 0xad]).buffer,
          getTransports: () => ['internal'],
          getPublicKey: () => new Uint8Array([0xbe, 0xef]).buffer,
        },
        getClientExtensionResults: () => ({ prf: { results: { first: prfResult } } }),
      });
      enablePlatformAuthenticator(createMock);

      // Drive derivePrfKey through a stubbed SubtleCrypto (a genuine boundary).
      const originalCrypto = global.crypto;
      Object.defineProperty(global, 'crypto', {
        value: {
          ...originalCrypto,
          subtle: {
            importKey: jest.fn().mockResolvedValue({}),
            deriveBits: jest.fn().mockResolvedValue(new Uint8Array(32).fill(0xab).buffer),
          },
          getRandomValues: (arr: Uint8Array) => {
            for (let i = 0; i < arr.length; i++) arr[i] = (i * 7) & 0xff;
            return arr;
          },
        },
        configurable: true,
      });

      const { device, prfKey } = await fido2Service.registerPasskey('user-1', 'Phone Passkey');

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: expect.objectContaining({
            authenticatorSelection: expect.objectContaining({
              authenticatorAttachment: 'platform',
              residentKey: 'required',
              requireResidentKey: true,
            }),
            extensions: expect.objectContaining({ prf: expect.any(Object) }),
          }),
        })
      );
      expect(device.isPasskey).toBe(true);
      expect(device.credentialType).toBe('platform');
      expect(device.transport).toBe('internal');
      expect(device.prfSupported).toBe(true);
      expect(typeof prfKey).toBe('string');
      expect(prfKey!.length).toBe(64);

      // Persisted to storage.
      const stored: Fido2Device[] = JSON.parse(localStorage.getItem(DEVICES_KEY)!);
      expect(stored.some(d => d.id === device.id && d.isPasskey)).toBe(true);

      Object.defineProperty(global, 'crypto', { value: originalCrypto, configurable: true });
    });

    it('registers a passkey with prfSupported=false when no PRF result is returned', async () => {
      const createMock = jest.fn().mockResolvedValue({
        rawId: new Uint8Array([0x11, 0x22]).buffer,
        response: {
          attestationObject: new Uint8Array([0x33, 0x44]).buffer,
          // No getTransports -> falls back to 'internal'
          getPublicKey: () => null,
        },
        getClientExtensionResults: () => ({}), // no prf results
      });
      enablePlatformAuthenticator(createMock);

      const { device, prfKey } = await fido2Service.registerPasskey('user-2', '');

      expect(device.isPasskey).toBe(true);
      expect(device.transport).toBe('internal');
      // Empty displayName falls back to userId.
      expect(device.name).toBe('user-2');
      expect(device.prfSupported).toBe(false);
      expect(prfKey).toBeUndefined();
    });
  });

  // ============================================================================
  // authenticateWithPasskey()
  // ============================================================================
  describe('authenticateWithPasskey', () => {
    it('throws when WebAuthn is not supported', async () => {
      disableWebAuthn();
      await expect(fido2Service.authenticateWithPasskey()).rejects.toThrow(
        'WebAuthn is not supported in this browser'
      );
    });

    it('throws when no passkeys are registered', async () => {
      // Only a non-passkey device is present.
      seedDevices([makeDevice({ isPasskey: false })]);
      enableWebAuthn({ get: jest.fn() });

      await expect(fido2Service.authenticateWithPasskey()).rejects.toThrow(
        'No passkeys registered'
      );
    });

    it('throws when the authenticator returns no assertion', async () => {
      seedDevices([makeDevice({ id: 'pk-1', isPasskey: true })]);
      enableWebAuthn({ get: jest.fn().mockResolvedValue(null) });

      await expect(fido2Service.authenticateWithPasskey()).rejects.toThrow(
        'Passkey authentication failed — no assertion returned'
      );
    });

    it('throws when the asserted credential is not a registered passkey', async () => {
      seedDevices([
        makeDevice({ id: 'pk-1', isPasskey: true, credentialIdBase64: bytesToBase64([0x01]) }),
      ]);
      enableWebAuthn({
        get: jest.fn().mockResolvedValue({ rawId: new Uint8Array([0x77]).buffer }),
      });

      await expect(fido2Service.authenticateWithPasskey()).rejects.toThrow(
        'Authenticating credential not found in registered devices'
      );
    });

    it('authenticates a passkey, derives the PRF key, and updates lastUsedAt', async () => {
      const credBytes = [0x05, 0x06, 0x07];
      seedDevices([
        makeDevice({
          id: 'pk-prf',
          name: 'Touch ID',
          isPasskey: true,
          credentialIdBase64: bytesToBase64(credBytes),
        }),
      ]);

      const prfResult = new Uint8Array(32).buffer;
      enableWebAuthn({
        get: jest.fn().mockResolvedValue({
          rawId: new Uint8Array(credBytes).buffer,
          getClientExtensionResults: () => ({ prf: { results: { first: prfResult } } }),
        }),
      });

      const originalCrypto = global.crypto;
      Object.defineProperty(global, 'crypto', {
        value: {
          ...originalCrypto,
          subtle: {
            importKey: jest.fn().mockResolvedValue({}),
            deriveBits: jest.fn().mockResolvedValue(new Uint8Array(32).fill(0x5a).buffer),
          },
          getRandomValues: (arr: Uint8Array) => {
            for (let i = 0; i < arr.length; i++) arr[i] = i & 0xff;
            return arr;
          },
        },
        configurable: true,
      });

      const result = await fido2Service.authenticateWithPasskey();

      expect(result).not.toBeNull();
      expect(result!.device.id).toBe('pk-prf');
      expect(typeof result!.prfKey).toBe('string');
      expect(result!.prfKey!.length).toBe(64);
      expect(result!.device.lastUsedAt).toBeDefined();

      const persisted: Fido2Device[] = JSON.parse(localStorage.getItem(DEVICES_KEY)!);
      expect(persisted.find(d => d.id === 'pk-prf')!.lastUsedAt).toBeDefined();

      Object.defineProperty(global, 'crypto', { value: originalCrypto, configurable: true });
    });

    it('authenticates a passkey without PRF output (prfKey undefined)', async () => {
      const credBytes = [0x42, 0x43];
      seedDevices([
        makeDevice({
          id: 'pk-noprf',
          isPasskey: true,
          credentialIdBase64: bytesToBase64(credBytes),
        }),
      ]);
      enableWebAuthn({
        get: jest.fn().mockResolvedValue({
          rawId: new Uint8Array(credBytes).buffer,
          getClientExtensionResults: () => ({}),
        }),
      });

      const result = await fido2Service.authenticateWithPasskey();

      expect(result!.device.id).toBe('pk-noprf');
      expect(result!.prfKey).toBeUndefined();
    });
  });
});
