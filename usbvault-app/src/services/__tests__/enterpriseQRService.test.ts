/**
 * Enterprise QR Identity Service Tests — FEAT-15
 *
 * Exercises REAL Ed25519 crypto (Node webcrypto, polyfilled in jest.setup.js):
 * generate → verify round-trips, expiry detection, tamper rejection, enrollment
 * lifecycle (enroll/revoke/isEnrolled), QR data-url generation + scan round-trip,
 * and persistence to the localStorage-backed web store. Only the genuine
 * boundaries (Platform, localStorage, auditService, syncService) are mocked.
 */

import enterpriseQRService from '../enterpriseQRService';
import { auditService } from '../auditService';
import { syncService } from '../syncService';

// ── Mock localStorage (web persistence boundary) ──
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
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

// ── Platform: drive the web persistence branches ──
jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// ── Audit + sync are downstream side-effect boundaries ──
jest.mock('@/services/auditService', () => ({
  auditService: { log: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('@/services/syncService', () => ({
  syncService: { enqueue: jest.fn().mockResolvedValue(undefined) },
}));

const STORAGE_KEY_IDENTITY = 'usbvault:enterprise_qr_identity';
const STORAGE_KEY_ENROLLED_DEVICES = 'usbvault:enterprise_enrolled_devices';

/**
 * Generate a real Ed25519 keypair via Node webcrypto and return the private key
 * in pkcs8-hex form (what generateQRPayload/signPayload expect) plus the raw
 * public key hex (what verifyQRPayload expects).
 */
async function realKeyPairHex(): Promise<{ privateKeyHex: string; publicKeyHex: string }> {
  const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  const toHex = (b: Uint8Array) =>
    Array.from(b)
      .map(x => x.toString(16).padStart(2, '0'))
      .join('');
  return { privateKeyHex: toHex(pkcs8), publicKeyHex: toHex(rawPub) };
}

describe('EnterpriseQRService', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    // Reset the singleton's in-memory state between tests so persistence/state
    // assertions start from a clean slate.
    (enterpriseQRService as any).currentIdentity = null;
    (enterpriseQRService as any).enrolledDevices = new Map();
  });

  describe('init', () => {
    it('loads a stored identity from localStorage and logs initialization', async () => {
      const stored = {
        orgId: 'org-acme',
        employeeNumber: 'E-1042',
        deviceSerial: 'SN-7781',
        publicKeyHex: 'deadbeef',
        signatureHex: 'cafef00d',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
      };
      localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify(stored));

      await enterpriseQRService.init();

      expect(enterpriseQRService.getDeviceIdentity()).toEqual(stored);
      expect(auditService.log).toHaveBeenCalledWith('system', 'qr_init', {
        status: 'initialized',
      });
    });

    it('rehydrates enrolled devices map from localStorage', async () => {
      const entries = [
        [
          'SN-7781',
          {
            deviceSerial: 'SN-7781',
            orgId: 'org-acme',
            enrolledAt: '2026-01-01T00:00:00.000Z',
            publicKeyHex: 'deadbeef',
          },
        ],
      ];
      localStorage.setItem(STORAGE_KEY_ENROLLED_DEVICES, JSON.stringify(entries));

      await enterpriseQRService.init();

      // currentIdentity is still null, but the rehydrated device should be present.
      (enterpriseQRService as any).currentIdentity = { deviceSerial: 'SN-7781' };
      expect(enterpriseQRService.isEnrolled()).toBe(true);
    });

    it('starts with no identity when nothing is stored', async () => {
      await enterpriseQRService.init();
      expect(enterpriseQRService.getDeviceIdentity()).toBeNull();
    });
  });

  describe('generateQRPayload + verifyQRPayload (real Ed25519)', () => {
    it('produces a payload that verifies against the derived public key', async () => {
      const { privateKeyHex, publicKeyHex } = await realKeyPairHex();

      const payloadJson = await enterpriseQRService.generateQRPayload(
        'org-acme',
        'E-1042',
        'SN-7781',
        privateKeyHex
      );

      const identity = JSON.parse(payloadJson);
      expect(identity.orgId).toBe('org-acme');
      expect(identity.employeeNumber).toBe('E-1042');
      expect(identity.deviceSerial).toBe('SN-7781');
      expect(typeof identity.signatureHex).toBe('string');
      expect(identity.signatureHex.length).toBeGreaterThan(0);

      const result = await enterpriseQRService.verifyQRPayload(payloadJson, publicKeyHex);
      expect(result.signatureValid).toBe(true);
      expect(result.expired).toBe(false);
      expect(result.valid).toBe(true);
      expect(result.orgId).toBe('org-acme');
      expect(result.deviceSerial).toBe('SN-7781');
    });

    it('sets expiry one year out from issuance', async () => {
      const { privateKeyHex } = await realKeyPairHex();
      const before = Date.now();
      const payloadJson = await enterpriseQRService.generateQRPayload(
        'org',
        'E',
        'SN',
        privateKeyHex
      );
      const identity = JSON.parse(payloadJson);
      const issued = new Date(identity.issuedAt).getTime();
      const expires = new Date(identity.expiresAt).getTime();
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      expect(issued).toBeGreaterThanOrEqual(before);
      expect(expires - issued).toBe(oneYearMs);
    });

    it('persists the generated identity to localStorage and in-memory state', async () => {
      const { privateKeyHex } = await realKeyPairHex();
      await enterpriseQRService.generateQRPayload('org-acme', 'E-1', 'SN-9', privateKeyHex);

      const persisted = localStorage.getItem(STORAGE_KEY_IDENTITY);
      expect(persisted).not.toBeNull();
      expect(JSON.parse(persisted!).deviceSerial).toBe('SN-9');
      expect(enterpriseQRService.getDeviceIdentity()?.deviceSerial).toBe('SN-9');
    });

    it('rejects a payload whose body was tampered with after signing', async () => {
      const { privateKeyHex, publicKeyHex } = await realKeyPairHex();
      const payloadJson = await enterpriseQRService.generateQRPayload(
        'org-acme',
        'E-1042',
        'SN-7781',
        privateKeyHex
      );

      const identity = JSON.parse(payloadJson);
      identity.orgId = 'org-evil'; // tamper, keep the original signature
      const tampered = JSON.stringify(identity);

      const result = await enterpriseQRService.verifyQRPayload(tampered, publicKeyHex);
      expect(result.signatureValid).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('rejects a valid signature checked against the wrong public key', async () => {
      const { privateKeyHex } = await realKeyPairHex();
      const other = await realKeyPairHex();
      const payloadJson = await enterpriseQRService.generateQRPayload(
        'org-acme',
        'E-1042',
        'SN-7781',
        privateKeyHex
      );

      const result = await enterpriseQRService.verifyQRPayload(payloadJson, other.publicKeyHex);
      expect(result.signatureValid).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('flags a correctly-signed but expired identity as expired and not valid', async () => {
      // Build an identity whose expiresAt is in the past, signed with a real
      // Ed25519 key over the exact body shape verifyQRPayload reconstructs. This
      // exercises the "signature valid but expired" branch without mocking Date.
      const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, [
        'sign',
        'verify',
      ])) as CryptoKeyPair;
      const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
      const toHex = (b: Uint8Array) =>
        Array.from(b)
          .map(x => x.toString(16).padStart(2, '0'))
          .join('');
      const publicKeyHex = toHex(rawPub);

      const body = {
        orgId: 'org-acme',
        employeeNumber: 'E-1042',
        deviceSerial: 'SN-7781',
        publicKeyHex,
        issuedAt: '2020-01-01T00:00:00.000Z',
        expiresAt: '2021-01-01T00:00:00.000Z', // already past
      };
      const bodyJson = JSON.stringify(body);
      const sig = new Uint8Array(
        await crypto.subtle.sign(
          'Ed25519' as any,
          kp.privateKey,
          new TextEncoder().encode(bodyJson)
        )
      );
      const identityJson = JSON.stringify({ ...body, signatureHex: toHex(sig) });

      const result = await enterpriseQRService.verifyQRPayload(identityJson, publicKeyHex);
      expect(result.signatureValid).toBe(true);
      expect(result.expired).toBe(true);
      expect(result.valid).toBe(false);
    });

    it('returns an error result (not a throw) for malformed payload JSON', async () => {
      const result = await enterpriseQRService.verifyQRPayload('{not json', 'deadbeef');
      expect(result.valid).toBe(false);
      expect(result.signatureValid).toBe(false);
      expect(result.error).toBeDefined();
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'qr_verify_error',
        expect.objectContaining({ error: expect.any(String) }),
        'error'
      );
    });

    it('throws a wrapped error when the signing key is not valid hex/pkcs8', async () => {
      await expect(enterpriseQRService.generateQRPayload('org', 'E', 'SN', 'zz')).rejects.toThrow(
        /Failed to generate QR payload/
      );
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'qr_generate_error',
        expect.objectContaining({ error: expect.any(String) }),
        'error'
      );
    });
  });

  describe('generateQRDataUrl + scanQR', () => {
    it('produces a deterministic SVG data URL for the same payload', async () => {
      const url1 = await enterpriseQRService.generateQRDataUrl('hello-payload', 128);
      const url2 = await enterpriseQRService.generateQRDataUrl('hello-payload', 128);
      expect(url1.startsWith('data:image/svg+xml;base64,')).toBe(true);
      expect(url1).toBe(url2); // hash-driven matrix is deterministic
    });

    it('produces different output for different payloads', async () => {
      const url1 = await enterpriseQRService.generateQRDataUrl('payload-one');
      const url2 = await enterpriseQRService.generateQRDataUrl('payload-two');
      expect(url1).not.toBe(url2);
    });

    it('decodes the SVG and renders a square module grid', async () => {
      const size = 116; // divisible by 29 modules → integer module size
      const url = await enterpriseQRService.generateQRDataUrl('grid-check', size);
      const base64 = url.split(',')[1];
      const svg = Buffer.from(base64, 'base64').toString('utf-8');
      expect(svg).toContain(`viewBox="0 0 ${size} ${size}"`);
      expect(svg).toContain('<rect width="116" height="116" fill="white"/>');
      // At least some black modules should be present from the hash pattern.
      expect(svg).toContain('fill="black"');
    });

    it('scanQR returns null for a non-svg data url', async () => {
      const result = await enterpriseQRService.scanQR('data:image/png;base64,iVBORw0KGgo');
      expect(result).toBeNull();
    });

    it('scanQR returns null for an svg with no embedded comment payload', async () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      const result = await enterpriseQRService.scanQR(dataUrl);
      expect(result).toBeNull();
      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'qr_scan_failed',
        expect.objectContaining({ reason: expect.any(String) })
      );
    });

    it('scanQR extracts and parses a base64url payload embedded in an SVG comment', async () => {
      const identity = {
        orgId: 'org-acme',
        employeeNumber: 'E-55',
        deviceSerial: 'SN-1234',
        publicKeyHex: 'deadbeef',
        signatureHex: 'cafef00d',
        issuedAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2027-01-01T00:00:00.000Z',
      };
      // base64url encode the identity exactly as toBase64Url would.
      const b64 = Buffer.from(JSON.stringify(identity)).toString('base64');
      const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      const svg = `<svg xmlns="http://www.w3.org/2000/svg"><!--${b64url}--></svg>`;
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

      const result = await enterpriseQRService.scanQR(dataUrl);
      expect(result).not.toBeNull();
      expect(result?.orgId).toBe('org-acme');
      expect(result?.deviceSerial).toBe('SN-1234');
    });
  });

  describe('enrollDevice / revokeDevice / isEnrolled', () => {
    it('enrolls a device, persists it, and notifies audit + sync', async () => {
      await enterpriseQRService.enrollDevice('org-acme', 'E-1042', 'SN-7781');

      const persisted = localStorage.getItem(STORAGE_KEY_ENROLLED_DEVICES);
      expect(persisted).not.toBeNull();
      const entries = JSON.parse(persisted!);
      expect(entries[0][0]).toBe('SN-7781');
      expect(entries[0][1].orgId).toBe('org-acme');
      expect(entries[0][1].publicKeyHex).toMatch(/^[0-9a-f]+$/);

      expect(auditService.log).toHaveBeenCalledWith(
        'system',
        'SN-7781',
        expect.objectContaining({ orgId: 'org-acme' })
      );
      expect(syncService.enqueue).toHaveBeenCalledWith('message', {
        deviceSerial: 'SN-7781',
        orgId: 'org-acme',
      });
    });

    it('isEnrolled is false before enrollment and after the current device is revoked', async () => {
      expect(enterpriseQRService.isEnrolled()).toBe(false);

      await enterpriseQRService.enrollDevice('org-acme', 'E-1', 'SN-7781');
      // Point currentIdentity at the enrolled device.
      (enterpriseQRService as any).currentIdentity = { deviceSerial: 'SN-7781' };
      expect(enterpriseQRService.isEnrolled()).toBe(true);

      await enterpriseQRService.revokeDevice('SN-7781');
      // Current identity for that serial is cleared on revoke.
      expect(enterpriseQRService.getDeviceIdentity()).toBeNull();
      expect(enterpriseQRService.isEnrolled()).toBe(false);
    });

    it('revokeDevice stamps revokedAt and clears the matching stored identity', async () => {
      await enterpriseQRService.enrollDevice('org-acme', 'E-1', 'SN-7781');
      (enterpriseQRService as any).currentIdentity = { deviceSerial: 'SN-7781' };
      localStorage.setItem(STORAGE_KEY_IDENTITY, JSON.stringify({ deviceSerial: 'SN-7781' }));

      await enterpriseQRService.revokeDevice('SN-7781');

      const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY_ENROLLED_DEVICES)!);
      expect(persisted[0][1].revokedAt).toBeDefined();
      expect(localStorage.getItem(STORAGE_KEY_IDENTITY)).toBeNull();
      expect(syncService.enqueue).toHaveBeenCalledWith('message', { deviceSerial: 'SN-7781' });
    });

    it('revokeDevice is a no-op for an unknown serial but still audits + syncs', async () => {
      await enterpriseQRService.revokeDevice('SN-does-not-exist');
      expect(auditService.log).toHaveBeenCalledWith('system', 'SN-does-not-exist', {
        action: 'revoked',
      });
      expect(syncService.enqueue).toHaveBeenCalledWith('message', {
        deviceSerial: 'SN-does-not-exist',
      });
      // No identity was set, so it stays null.
      expect(enterpriseQRService.getDeviceIdentity()).toBeNull();
    });

    it('does not clear a different device identity on revoke', async () => {
      await enterpriseQRService.enrollDevice('org-acme', 'E-1', 'SN-AAA');
      (enterpriseQRService as any).currentIdentity = { deviceSerial: 'SN-BBB' };

      await enterpriseQRService.revokeDevice('SN-AAA');

      // Current identity (SN-BBB) is untouched because only SN-AAA was revoked.
      expect(enterpriseQRService.getDeviceIdentity()).toEqual({ deviceSerial: 'SN-BBB' });
    });
  });
});
