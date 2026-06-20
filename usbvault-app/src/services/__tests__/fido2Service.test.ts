/**
 * FIDO2 / WebAuthn Service Tests — Security-Critical
 *
 * Tests device registration, authentication, passkey support,
 * PRF key derivation, and device management.
 */

import { fido2Service, Fido2Device } from '../fido2Service';

// Mock localStorage
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

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock React Native Platform
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// Mock audit service
jest.mock('@/services/auditService', () => ({
  auditService: {
    log: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    log: jest.fn(),
  },
}));

describe('Fido2Service', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  // ============================================================================
  // Test: WebAuthn Support Detection
  // ============================================================================
  describe('isWebAuthnSupported', () => {
    it('should return true when PublicKeyCredential and navigator.credentials exist', () => {
      // jsdom provides window but not PublicKeyCredential by default
      // Mock them
      (window as any).PublicKeyCredential = jest.fn();
      (navigator as any).credentials = { create: jest.fn(), get: jest.fn() };

      expect(fido2Service.isWebAuthnSupported()).toBe(true);

      delete (window as any).PublicKeyCredential;
    });

    it('should return false when PublicKeyCredential is missing', () => {
      delete (window as any).PublicKeyCredential;

      expect(fido2Service.isWebAuthnSupported()).toBe(false);
    });
  });

  // ============================================================================
  // Test: Device Registration
  // ============================================================================
  describe('registerDevice', () => {
    it('should throw when WebAuthn is not supported', async () => {
      delete (window as any).PublicKeyCredential;

      await expect(fido2Service.registerDevice('My Key')).rejects.toThrow(
        'WebAuthn is not supported in this browser'
      );
    });

    it('should call navigator.credentials.create with correct options', async () => {
      // Mock WebAuthn API
      const mockRawId = new Uint8Array([1, 2, 3, 4]).buffer;
      const mockAttestationObject = new Uint8Array([5, 6, 7, 8]).buffer;

      const mockCredential = {
        rawId: mockRawId,
        response: {
          attestationObject: mockAttestationObject,
          getTransports: () => ['usb'],
          getPublicKey: () => new Uint8Array([9, 10, 11, 12]).buffer,
        },
      };

      (window as any).PublicKeyCredential = jest.fn();
      (navigator as any).credentials = {
        create: jest.fn().mockResolvedValue(mockCredential),
        get: jest.fn(),
      };

      const device = await fido2Service.registerDevice('Test Key', 'user-123');

      expect(navigator.credentials.create).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: expect.objectContaining({
            rp: expect.objectContaining({ name: 'USBVault' }),
            pubKeyCredParams: expect.arrayContaining([
              expect.objectContaining({ alg: -7 }),
            ]),
          }),
        })
      );

      expect(device.name).toBe('Test Key');
      expect(device.transport).toBe('usb');
      expect(device.credentialIdBase64).toBeDefined();
      expect(device.publicKeyBase64).toBeDefined();
      expect(device.id).toContain('fido2-');

      delete (window as any).PublicKeyCredential;
    });

    it('should throw when no credential returned', async () => {
      (window as any).PublicKeyCredential = jest.fn();
      (navigator as any).credentials = {
        create: jest.fn().mockResolvedValue(null),
        get: jest.fn(),
      };

      await expect(fido2Service.registerDevice('Null Key')).rejects.toThrow(
        'No credential returned from authenticator'
      );

      delete (window as any).PublicKeyCredential;
    });

    it('should persist device to localStorage', async () => {
      const mockRawId = new Uint8Array([1, 2]).buffer;
      const mockCredential = {
        rawId: mockRawId,
        response: {
          attestationObject: new Uint8Array([3, 4]).buffer,
          getTransports: () => ['ble'],
          getPublicKey: () => null,
        },
      };

      (window as any).PublicKeyCredential = jest.fn();
      (navigator as any).credentials = {
        create: jest.fn().mockResolvedValue(mockCredential),
        get: jest.fn(),
      };

      await fido2Service.registerDevice('Persist Key');

      const devices = fido2Service.listDevices();
      expect(devices.length).toBeGreaterThanOrEqual(1);
      expect(devices.some(d => d.name === 'Persist Key')).toBe(true);

      delete (window as any).PublicKeyCredential;
    });
  });

  // ============================================================================
  // Test: Authentication
  // ============================================================================
  describe('authenticate', () => {
    it('should throw when WebAuthn is not supported', async () => {
      delete (window as any).PublicKeyCredential;

      await expect(fido2Service.authenticate()).rejects.toThrow(
        'WebAuthn is not supported in this browser'
      );
    });

    it('should throw when no devices are registered', async () => {
      (window as any).PublicKeyCredential = jest.fn();
      (navigator as any).credentials = { create: jest.fn(), get: jest.fn() };

      await expect(fido2Service.authenticate()).rejects.toThrow(
        'No FIDO2 devices registered'
      );

      delete (window as any).PublicKeyCredential;
    });
  });

  // ============================================================================
  // Test: Device Management
  // ============================================================================
  describe('device management', () => {
    const seedDevice = (): Fido2Device => {
      const device: Fido2Device = {
        id: 'fido2-test-123',
        name: 'Test Device',
        credentialIdBase64: btoa('test-cred-id'),
        publicKeyBase64: btoa('test-public-key'),
        registeredAt: new Date().toISOString(),
        transport: 'usb',
      };

      localStorage.setItem('usbvault:fido2_devices', JSON.stringify([device]));
      return device;
    };

    it('listDevices should return all registered devices', () => {
      seedDevice();
      const devices = fido2Service.listDevices();
      expect(devices.length).toBe(1);
      expect(devices[0].name).toBe('Test Device');
    });

    it('listDevices should return empty array when no devices stored', () => {
      const devices = fido2Service.listDevices();
      expect(devices).toEqual([]);
    });

    it('removeDevice should remove device by ID', async () => {
      const device = seedDevice();
      await fido2Service.removeDevice(device.id);

      const devices = fido2Service.listDevices();
      expect(devices.length).toBe(0);
    });

    it('removeDevice should throw for non-existent device', async () => {
      await expect(fido2Service.removeDevice('fake-id')).rejects.toThrow('Device not found');
    });

    it('getDeviceCount should return correct count', () => {
      expect(fido2Service.getDeviceCount()).toBe(0);
      seedDevice();
      expect(fido2Service.getDeviceCount()).toBe(1);
    });

    it('hasPasskeys should return false when no passkeys registered', () => {
      seedDevice(); // Regular device, not a passkey
      expect(fido2Service.hasPasskeys()).toBe(false);
    });

    it('hasPasskeys should return true when passkey exists', () => {
      const device: Fido2Device = {
        id: 'passkey-test-123',
        name: 'Test Passkey',
        credentialIdBase64: btoa('passkey-cred'),
        publicKeyBase64: btoa('passkey-key'),
        registeredAt: new Date().toISOString(),
        transport: 'internal',
        isPasskey: true,
      };
      localStorage.setItem('usbvault:fido2_devices', JSON.stringify([device]));

      expect(fido2Service.hasPasskeys()).toBe(true);
    });
  });

  // ============================================================================
  // Test: Passkey Support
  // ============================================================================
  describe('isPasskeySupported', () => {
    it('should return false when PublicKeyCredential is not available', async () => {
      delete (window as any).PublicKeyCredential;
      const supported = await fido2Service.isPasskeySupported();
      expect(supported).toBe(false);
    });

    it('should check platform authenticator availability', async () => {
      (window as any).PublicKeyCredential = {
        isUserVerifyingPlatformAuthenticatorAvailable: jest.fn().mockResolvedValue(true),
      };
      (navigator as any).credentials = { create: jest.fn(), get: jest.fn() };

      const supported = await fido2Service.isPasskeySupported();
      expect(supported).toBe(true);

      delete (window as any).PublicKeyCredential;
    });
  });

  // ============================================================================
  // Test: PRF Key Derivation
  // ============================================================================
  describe('derivePrfKey', () => {
    it('should throw for empty PRF output', async () => {
      await expect(fido2Service.derivePrfKey(new ArrayBuffer(0))).rejects.toThrow(
        'Invalid PRF output'
      );
    });

    it('should throw for null PRF output', async () => {
      await expect(fido2Service.derivePrfKey(null as any)).rejects.toThrow(
        'Invalid PRF output'
      );
    });

    it('should derive a hex key from valid PRF output', async () => {
      // Mock SubtleCrypto
      const mockDerivedBits = new Uint8Array(32).buffer;
      const mockKeyMaterial = {};

      const originalCrypto = global.crypto;
      Object.defineProperty(global, 'crypto', {
        value: {
          ...originalCrypto,
          subtle: {
            importKey: jest.fn().mockResolvedValue(mockKeyMaterial),
            deriveBits: jest.fn().mockResolvedValue(mockDerivedBits),
          },
          getRandomValues: (arr: Uint8Array) => {
            for (let i = 0; i < arr.length; i++) arr[i] = i;
            return arr;
          },
        },
        configurable: true,
      });

      const prfOutput = new Uint8Array(32).buffer;
      const hexKey = await fido2Service.derivePrfKey(prfOutput);

      expect(typeof hexKey).toBe('string');
      expect(hexKey.length).toBe(64); // 32 bytes = 64 hex chars

      Object.defineProperty(global, 'crypto', {
        value: originalCrypto,
        configurable: true,
      });
    });
  });
});
