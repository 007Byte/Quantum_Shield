/**
 * Tests for fido2Flow — high-level FIDO2 flows orchestrating WebAuthn + server.
 *
 * Exercises the REAL orchestration logic:
 *  - authenticateWithSecurityKey: challenge -> assertion -> verify -> store tokens,
 *    plus the assertion payload shape and audit side-effect
 *  - registerSecurityKey: init -> create -> verify, attestation payload shape
 *  - listSecurityKeys / removeSecurityKey server calls + null-data handling
 *  - isFido2Available delegation
 *  - getFido2ErrorMessage code mapping + Error/unknown fallbacks
 *
 * Boundaries mocked: api client (network) + storeTokens, webauthnService (the
 * navigator.credentials boundary), auditService, logger. base64urlToArrayBuffer
 * and WebAuthnError are the REAL implementations (via requireActual).
 */

import {
  authenticateWithSecurityKey,
  registerSecurityKey,
  listSecurityKeys,
  removeSecurityKey,
  isFido2Available,
  getFido2ErrorMessage,
} from '../fido2Flow';
import { WebAuthnError } from '../webauthnService';

const post = jest.fn();
const get = jest.fn();
const del = jest.fn();
const storeTokensMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@/services/api', () => ({
  getApiClient: () => ({ post, get, delete: del }),
  storeTokens: (...a: unknown[]) => storeTokensMock(...a),
}));

const waAuthenticate = jest.fn();
const waRegister = jest.fn();
const waIsSupported = jest.fn();

// Keep base64urlToArrayBuffer + WebAuthnError REAL; only stub the service object.
jest.mock('../webauthnService', () => {
  const actual = jest.requireActual('../webauthnService');
  return {
    ...actual,
    webauthnService: {
      authenticate: (...a: unknown[]) => waAuthenticate(...a),
      register: (...a: unknown[]) => waRegister(...a),
      isSupported: (...a: unknown[]) => waIsSupported(...a),
    },
  };
});

const auditLog = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/auditService', () => ({
  auditService: { log: (...a: unknown[]) => auditLog(...a) },
}));

jest.mock('@/utils/logger', () => ({
  logger: { log: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  fireAndForget: (p: Promise<unknown>) => {
    void Promise.resolve(p).catch(() => {});
  },
}));

const assertion = {
  credentialId: 'cred-id-aa',
  authenticatorData: 'auth-data-bb',
  clientDataJSON: 'client-data-cc',
  signature: 'sig-dd',
  userHandle: 'handle-ee',
};

const registration = {
  credentialId: 'reg-cred-ff',
  attestationObject: 'attest-gg',
  clientDataJSON: 'client-data-hh',
  transports: ['usb', 'nfc'],
};

beforeEach(() => {
  jest.clearAllMocks();
  storeTokensMock.mockResolvedValue(undefined);
});

describe('authenticateWithSecurityKey', () => {
  it('runs the full challenge -> assert -> verify -> store-tokens flow', async () => {
    // "SGVsbG8" decodes to a valid ArrayBuffer via the real base64url decoder.
    post
      .mockResolvedValueOnce({ data: { challenge: 'SGVsbG8', session_id: 'sess-1' } })
      .mockResolvedValueOnce({ data: { access_token: 'acc-tok', refresh_token: 'ref-tok' } });
    waAuthenticate.mockResolvedValue(assertion);

    const result = await authenticateWithSecurityKey('user@example.com');

    // Step 1: challenge request includes the email.
    expect(post).toHaveBeenNthCalledWith(1, '/auth/fido2/challenge', {
      email: 'user@example.com',
    });
    // Step 2: webauthnService.authenticate called with a decoded challenge buffer.
    const authArgs = waAuthenticate.mock.calls[0][0];
    expect(authArgs.challenge).toBeInstanceOf(ArrayBuffer);
    expect(authArgs.allowCredentials).toEqual([]);

    // Step 3: verify request carries the session id + serialized assertion payload.
    const verifyCall = post.mock.calls[1];
    expect(verifyCall[0]).toBe('/auth/fido2/verify');
    expect(verifyCall[1].session_id).toBe('sess-1');
    const payload = JSON.parse(verifyCall[1].assertion_response);
    expect(payload.id).toBe('cred-id-aa');
    expect(payload.type).toBe('public-key');
    expect(payload.response.signature).toBe('sig-dd');
    expect(payload.response.userHandle).toBe('handle-ee');

    // Step 4: tokens stored + returned.
    expect(storeTokensMock).toHaveBeenCalledWith('acc-tok', 'ref-tok');
    expect(result).toEqual({ accessToken: 'acc-tok', refreshToken: 'ref-tok' });
  });

  it('records an audit entry for the authentication', async () => {
    post
      .mockResolvedValueOnce({ data: { challenge: 'SGVsbG8', session_id: 'sess-2' } })
      .mockResolvedValueOnce({ data: { access_token: 'a', refresh_token: 'r' } });
    waAuthenticate.mockResolvedValue(assertion);

    await authenticateWithSecurityKey('audit@example.com');
    expect(auditLog).toHaveBeenCalledWith('fido2_authenticate', 'audit@example.com', {
      credentialId: 'cred-id-aa',
    });
  });

  it('propagates a WebAuthn cancellation without storing tokens', async () => {
    post.mockResolvedValueOnce({ data: { challenge: 'SGVsbG8', session_id: 'sess-3' } });
    waAuthenticate.mockRejectedValue(new WebAuthnError('NOT_ALLOWED', 'cancelled'));

    await expect(authenticateWithSecurityKey('user@example.com')).rejects.toThrow('cancelled');
    expect(storeTokensMock).not.toHaveBeenCalled();
  });
});

describe('registerSecurityKey', () => {
  it('runs the full init -> create -> verify registration flow', async () => {
    post
      .mockResolvedValueOnce({ data: { challenge: 'SGVsbG8', session_id: 'reg-sess' } })
      .mockResolvedValueOnce({ data: { credential_id: 'server-cred-1', message: 'ok' } });
    waRegister.mockResolvedValue(registration);

    const result = await registerSecurityKey('My YubiKey');

    // Step 1: registration init.
    expect(post).toHaveBeenNthCalledWith(1, '/auth/fido2/manage/register/init', {});
    // Step 2: webauthnService.register gets a decoded challenge + names.
    const regArgs = waRegister.mock.calls[0][0];
    expect(regArgs.challenge).toBeInstanceOf(ArrayBuffer);
    expect(regArgs.displayName).toBe('My YubiKey');
    expect(regArgs.rpName).toBe('USBVault');

    // Step 3: verify carries the serialized attestation + credential name.
    const verifyCall = post.mock.calls[1];
    expect(verifyCall[0]).toBe('/auth/fido2/manage/register/verify');
    expect(verifyCall[1].session_id).toBe('reg-sess');
    expect(verifyCall[1].credential_name).toBe('My YubiKey');
    const payload = JSON.parse(verifyCall[1].attestation_response);
    expect(payload.response.attestationObject).toBe('attest-gg');
    expect(payload.transports).toEqual(['usb', 'nfc']);

    expect(result).toEqual({ success: true, credentialId: 'server-cred-1' });
    expect(auditLog).toHaveBeenCalledWith('fido2_register', 'My YubiKey', {
      credentialId: 'server-cred-1',
    });
  });

  it('propagates an InvalidState (duplicate) error from the authenticator', async () => {
    post.mockResolvedValueOnce({ data: { challenge: 'SGVsbG8', session_id: 'reg-sess' } });
    waRegister.mockRejectedValue(new WebAuthnError('INVALID_STATE', 'already registered'));

    await expect(registerSecurityKey('dup')).rejects.toThrow('already registered');
  });
});

describe('listSecurityKeys / removeSecurityKey', () => {
  it('returns the credential list from the server', async () => {
    get.mockResolvedValue({
      data: [
        { id: 'k1', name: 'Key One' },
        { id: 'k2', name: 'Key Two' },
      ],
    });
    const keys = await listSecurityKeys();
    expect(get).toHaveBeenCalledWith('/auth/fido2/manage/credentials');
    expect(keys.map(k => k.id)).toEqual(['k1', 'k2']);
  });

  it('returns an empty array when the server sends no data', async () => {
    get.mockResolvedValue({ data: null });
    expect(await listSecurityKeys()).toEqual([]);
  });

  it('deletes a credential by id and audits the revocation', async () => {
    del.mockResolvedValue({});
    await removeSecurityKey('k-del');
    expect(del).toHaveBeenCalledWith('/auth/fido2/manage/credentials', {
      params: { id: 'k-del' },
    });
    expect(auditLog).toHaveBeenCalledWith('fido2_revoke', 'k-del', { credentialId: 'k-del' });
  });
});

describe('isFido2Available', () => {
  it('delegates to webauthnService.isSupported', () => {
    waIsSupported.mockReturnValue(true);
    expect(isFido2Available()).toBe(true);
    waIsSupported.mockReturnValue(false);
    expect(isFido2Available()).toBe(false);
  });
});

describe('getFido2ErrorMessage', () => {
  it('maps each WebAuthnError code to a distinct user-facing message', () => {
    expect(getFido2ErrorMessage(new WebAuthnError('NOT_SUPPORTED', 'x'))).toContain(
      'not supported'
    );
    expect(getFido2ErrorMessage(new WebAuthnError('NOT_ALLOWED', 'x'))).toContain('cancelled');
    expect(getFido2ErrorMessage(new WebAuthnError('SECURITY_ERROR', 'x'))).toContain('HTTPS');
    expect(getFido2ErrorMessage(new WebAuthnError('INVALID_STATE', 'x'))).toContain(
      'already registered'
    );
    expect(getFido2ErrorMessage(new WebAuthnError('TIMEOUT', 'x'))).toContain('timed out');
    expect(getFido2ErrorMessage(new WebAuthnError('UNKNOWN', 'x'))).toContain('unexpected');
  });

  it('returns the message for a plain Error', () => {
    expect(getFido2ErrorMessage(new Error('plain'))).toBe('plain');
  });

  it('returns a generic message for non-Error values', () => {
    expect(getFido2ErrorMessage(42)).toBe('An unknown error occurred.');
  });
});
