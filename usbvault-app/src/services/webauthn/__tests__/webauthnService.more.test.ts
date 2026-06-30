/**
 * Tests for webauthnService — happy-path register/authenticate + DOMException mapping.
 *
 * The base webauthnService.test.ts covers encoding + the NOT_SUPPORTED guards in
 * a non-web environment. This suite forces a SUPPORTED environment (Platform.OS='web'
 * + a stubbed navigator.credentials/PublicKeyCredential) to exercise the actual
 * navigator.credentials.create()/get() call construction and result mapping, plus
 * the DOMException -> WebAuthnError translation for every branch.
 *
 * Boundary mocked: Platform (native) and navigator.credentials (the browser
 * WebAuthn API). All option construction, base64url result mapping, and error
 * translation is the REAL implementation under test.
 */

import { webauthnService, WebAuthnError, arrayBufferToBase64url } from '../webauthnService';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

// ── WebAuthn environment setup ──────────────────────────────────

const credentialsCreate = jest.fn();
const credentialsGet = jest.fn();

beforeAll(() => {
  // Mark WebAuthn as available in this jsdom window.
  (window as unknown as { PublicKeyCredential: unknown }).PublicKeyCredential = function () {};
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create: (...a: unknown[]) => credentialsCreate(...a),
      get: (...a: unknown[]) => credentialsGet(...a),
    },
  });
});

beforeEach(() => {
  jest.clearAllMocks();
});

/** Build a fake PublicKeyCredential for a registration (attestation) response. */
function fakeAttestationCredential() {
  return {
    rawId: new Uint8Array([1, 2, 3, 4]).buffer,
    response: {
      attestationObject: new Uint8Array([10, 20, 30]).buffer,
      clientDataJSON: new Uint8Array([40, 50]).buffer,
      getTransports: () => ['usb', 'nfc'],
    },
  };
}

/** Build a fake PublicKeyCredential for an authentication (assertion) response. */
function fakeAssertionCredential(withUserHandle = true) {
  return {
    rawId: new Uint8Array([5, 6, 7, 8]).buffer,
    response: {
      authenticatorData: new Uint8Array([60, 70]).buffer,
      clientDataJSON: new Uint8Array([80, 90]).buffer,
      signature: new Uint8Array([100, 110]).buffer,
      userHandle: withUserHandle ? new Uint8Array([120, 130]).buffer : null,
    },
  };
}

describe('webauthnService.isSupported (web environment)', () => {
  it('reports supported once PublicKeyCredential + navigator.credentials exist', () => {
    expect(webauthnService.isSupported()).toBe(true);
  });
});

describe('webauthnService.register (happy path)', () => {
  it('constructs creation options and maps the attestation result to base64url', async () => {
    const cred = fakeAttestationCredential();
    credentialsCreate.mockResolvedValue(cred);

    const challenge = new Uint8Array([9, 9, 9]).buffer;
    const result = await webauthnService.register({
      userId: 'user-1',
      userName: 'user@example.com',
      displayName: 'Test User',
      challenge,
      rpId: 'localhost',
      rpName: 'USBVault',
    });

    // Options passed to navigator.credentials.create reflect the inputs.
    const opts = credentialsCreate.mock.calls[0][0].publicKey;
    expect(opts.rp).toEqual({ name: 'USBVault', id: 'localhost' });
    expect(opts.user.name).toBe('user@example.com');
    expect(opts.user.displayName).toBe('Test User');
    expect(opts.challenge).toBe(challenge);
    expect(opts.timeout).toBe(60000);
    expect(opts.pubKeyCredParams).toEqual([
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ]);

    // Result fields are base64url encodings of the credential buffers.
    expect(result.credentialId).toBe(arrayBufferToBase64url(cred.rawId));
    expect(result.attestationObject).toBe(arrayBufferToBase64url(cred.response.attestationObject));
    expect(result.clientDataJSON).toBe(arrayBufferToBase64url(cred.response.clientDataJSON));
    expect(result.transports).toEqual(['usb', 'nfc']);
  });

  it('honors a custom timeout and excludeCredentials list', async () => {
    credentialsCreate.mockResolvedValue(fakeAttestationCredential());
    const exclude = [{ id: new Uint8Array([1]).buffer, type: 'public-key' as const }];
    await webauthnService.register({
      userId: 'u',
      userName: 'u',
      displayName: 'u',
      challenge: new ArrayBuffer(4),
      rpId: 'localhost',
      rpName: 'USBVault',
      excludeCredentials: exclude,
      timeout: 12345,
    });
    const opts = credentialsCreate.mock.calls[0][0].publicKey;
    expect(opts.timeout).toBe(12345);
    expect(opts.excludeCredentials).toBe(exclude);
  });

  it('defaults transports to [] when getTransports is unavailable', async () => {
    credentialsCreate.mockResolvedValue({
      rawId: new Uint8Array([1]).buffer,
      response: {
        attestationObject: new Uint8Array([2]).buffer,
        clientDataJSON: new Uint8Array([3]).buffer,
        // no getTransports
      },
    });
    const result = await webauthnService.register({
      userId: 'u',
      userName: 'u',
      displayName: 'u',
      challenge: new ArrayBuffer(4),
      rpId: 'localhost',
      rpName: 'USBVault',
    });
    expect(result.transports).toEqual([]);
  });

  it('throws NOT_ALLOWED when the authenticator returns no credential', async () => {
    credentialsCreate.mockResolvedValue(null);
    await expect(
      webauthnService.register({
        userId: 'u',
        userName: 'u',
        displayName: 'u',
        challenge: new ArrayBuffer(4),
        rpId: 'localhost',
        rpName: 'USBVault',
      })
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
});

describe('webauthnService.authenticate (happy path)', () => {
  it('constructs request options and maps the assertion result to base64url', async () => {
    const cred = fakeAssertionCredential();
    credentialsGet.mockResolvedValue(cred);

    const challenge = new Uint8Array([7, 7]).buffer;
    const result = await webauthnService.authenticate({
      challenge,
      rpId: 'localhost',
      allowCredentials: [],
    });

    const opts = credentialsGet.mock.calls[0][0].publicKey;
    expect(opts.challenge).toBe(challenge);
    expect(opts.rpId).toBe('localhost');
    expect(opts.userVerification).toBe('preferred');

    expect(result.credentialId).toBe(arrayBufferToBase64url(cred.rawId));
    expect(result.authenticatorData).toBe(arrayBufferToBase64url(cred.response.authenticatorData));
    expect(result.signature).toBe(arrayBufferToBase64url(cred.response.signature));
    expect(result.userHandle).toBe(arrayBufferToBase64url(cred.response.userHandle as ArrayBuffer));
  });

  it('returns an empty userHandle when the assertion has none', async () => {
    credentialsGet.mockResolvedValue(fakeAssertionCredential(false));
    const result = await webauthnService.authenticate({
      challenge: new ArrayBuffer(2),
      rpId: 'localhost',
    });
    expect(result.userHandle).toBe('');
  });

  it('throws NOT_ALLOWED when the authenticator returns no assertion', async () => {
    credentialsGet.mockResolvedValue(null);
    await expect(
      webauthnService.authenticate({ challenge: new ArrayBuffer(2), rpId: 'localhost' })
    ).rejects.toMatchObject({ code: 'NOT_ALLOWED' });
  });
});

describe('webauthnService — DOMException mapping', () => {
  const cases: [string, string][] = [
    ['NotAllowedError', 'NOT_ALLOWED'],
    ['SecurityError', 'SECURITY_ERROR'],
    ['InvalidStateError', 'INVALID_STATE'],
    ['AbortError', 'TIMEOUT'],
    ['SomeOtherError', 'UNKNOWN'],
  ];

  it.each(cases)(
    'maps DOMException %s to WebAuthnError code %s on register',
    async (name, code) => {
      credentialsCreate.mockRejectedValue(new DOMException('boom', name));
      await expect(
        webauthnService.register({
          userId: 'u',
          userName: 'u',
          displayName: 'u',
          challenge: new ArrayBuffer(4),
          rpId: 'localhost',
          rpName: 'USBVault',
        })
      ).rejects.toMatchObject({ code });
    }
  );

  it.each(cases)(
    'maps DOMException %s to WebAuthnError code %s on authenticate',
    async (name, code) => {
      credentialsGet.mockRejectedValue(new DOMException('boom', name));
      await expect(
        webauthnService.authenticate({ challenge: new ArrayBuffer(2), rpId: 'localhost' })
      ).rejects.toMatchObject({ code });
    }
  );

  it('wraps a non-DOMException Error as UNKNOWN', async () => {
    credentialsGet.mockRejectedValue(new Error('plain failure'));
    await expect(
      webauthnService.authenticate({ challenge: new ArrayBuffer(2), rpId: 'localhost' })
    ).rejects.toMatchObject({ code: 'UNKNOWN', message: 'plain failure' });
  });

  it('wraps a non-Error throw as a generic UNKNOWN WebAuthnError', async () => {
    credentialsCreate.mockRejectedValue('string failure');
    await expect(
      webauthnService.register({
        userId: 'u',
        userName: 'u',
        displayName: 'u',
        challenge: new ArrayBuffer(4),
        rpId: 'localhost',
        rpName: 'USBVault',
      })
    ).rejects.toBeInstanceOf(WebAuthnError);
  });
});
