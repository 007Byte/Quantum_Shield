/**
 * Tests for webauthn.ts — thin UI-facing wrapper over fido2Service.
 *
 * Exercises the REAL behavior of the wrapper functions:
 *  - isFido2Available gating on platform + fido2Service support
 *  - authenticateWithSecurityKey: success mapping + cancelled/failed throw
 *  - registerSecurityKey: device -> Fido2RegisterResult shape (snake-case aliases)
 *  - listSecurityKeys: device list -> dual-cased credential info
 *  - removeSecurityKey delegation
 *  - getFido2ErrorMessage: DOMException-name mapping + Error/unknown fallbacks
 *
 * Boundary mocked: fido2Service (the underlying WebAuthn/native service),
 * Platform (native), logger. The mapping/shape logic is the real code under test.
 */

import {
  isFido2Available,
  authenticateWithSecurityKey,
  registerSecurityKey,
  listSecurityKeys,
  removeSecurityKey,
  getFido2ErrorMessage,
} from '../webauthn';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

const isWebAuthnSupported = jest.fn();
const registerDevice = jest.fn();
const authenticate = jest.fn();
const listDevices = jest.fn();
const removeDevice = jest.fn();

jest.mock('../fido2Service', () => ({
  fido2Service: {
    isWebAuthnSupported: (...a: unknown[]) => isWebAuthnSupported(...a),
    registerDevice: (...a: unknown[]) => registerDevice(...a),
    authenticate: (...a: unknown[]) => authenticate(...a),
    listDevices: (...a: unknown[]) => listDevices(...a),
    removeDevice: (...a: unknown[]) => removeDevice(...a),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const sampleDevice = {
  id: 'cred-123',
  name: 'YubiKey 5C',
  registeredAt: '2026-02-01T10:00:00.000Z',
  lastUsedAt: '2026-02-05T12:30:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isFido2Available', () => {
  it('returns true when on web and fido2Service reports support', () => {
    isWebAuthnSupported.mockReturnValue(true);
    expect(isFido2Available()).toBe(true);
  });

  it('returns false when fido2Service reports no support (even on web)', () => {
    isWebAuthnSupported.mockReturnValue(false);
    expect(isFido2Available()).toBe(false);
  });
});

describe('authenticateWithSecurityKey', () => {
  it('returns a session token + deviceId on successful authentication', async () => {
    authenticate.mockResolvedValue(sampleDevice);
    const result = await authenticateWithSecurityKey('user@example.com');
    expect(result).toEqual({ accessToken: 'fido2-session', deviceId: 'cred-123' });
  });

  it('throws when authentication is cancelled or fails (null result)', async () => {
    authenticate.mockResolvedValue(null);
    await expect(authenticateWithSecurityKey('user@example.com')).rejects.toThrow(
      /cancelled or failed/
    );
  });
});

describe('registerSecurityKey', () => {
  it('maps a registered device into the result shape with snake-case aliases', async () => {
    registerDevice.mockResolvedValue(sampleDevice);
    const result = await registerSecurityKey('YubiKey 5C');

    expect(registerDevice).toHaveBeenCalledWith('YubiKey 5C');
    expect(result.success).toBe(true);
    expect(result.credentialId).toBe('cred-123');
    expect(result.id).toBe('cred-123');
    expect(result.name).toBe('YubiKey 5C');
    expect(result.registeredAt).toBe(sampleDevice.registeredAt);
    expect(result.lastUsedAt).toBe(sampleDevice.lastUsedAt);
    // Snake-case aliases mirror the camelCase fields for JSX compatibility.
    expect(result.created_at).toBe(sampleDevice.registeredAt);
    expect(result.last_used_at).toBe(sampleDevice.lastUsedAt);
  });
});

describe('listSecurityKeys', () => {
  it('maps each device to dual-cased credential info', () => {
    listDevices.mockReturnValue([sampleDevice]);
    const keys = listSecurityKeys();
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      id: 'cred-123',
      name: 'YubiKey 5C',
      registeredAt: sampleDevice.registeredAt,
      created_at: sampleDevice.registeredAt,
      last_used_at: sampleDevice.lastUsedAt,
    });
  });

  it('returns an empty array when there are no devices', () => {
    listDevices.mockReturnValue([]);
    expect(listSecurityKeys()).toEqual([]);
  });
});

describe('removeSecurityKey', () => {
  it('delegates removal to fido2Service', async () => {
    removeDevice.mockResolvedValue(undefined);
    await removeSecurityKey('cred-123');
    expect(removeDevice).toHaveBeenCalledWith('cred-123');
  });
});

describe('getFido2ErrorMessage', () => {
  it('maps a NotAllowedError to a cancellation message', () => {
    const err = new Error('cancelled');
    err.name = 'NotAllowedError';
    expect(getFido2ErrorMessage(err)).toBe('Security key authentication was cancelled.');
  });

  it('maps a SecurityError to an origin message', () => {
    const err = new Error('insecure');
    err.name = 'SecurityError';
    expect(getFido2ErrorMessage(err)).toBe('Security key could not be used on this origin.');
  });

  it('returns the message for a generic Error', () => {
    expect(getFido2ErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('returns a generic message for non-Error values', () => {
    expect(getFido2ErrorMessage('not an error')).toBe('An unknown FIDO2 error occurred.');
    expect(getFido2ErrorMessage(undefined)).toBe('An unknown FIDO2 error occurred.');
  });
});
