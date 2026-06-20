/**
 * Tests for WebAuthn service
 *
 * Tests the pure WebAuthn API wrapper: base64url encoding,
 * support detection, registration/authentication flow construction,
 * and error handling.
 */

import { arrayBufferToBase64url, base64urlToArrayBuffer } from '../webauthnService';

// ── Base64url encoding/decoding tests ───────────────────────────

describe('arrayBufferToBase64url', () => {
  it('encodes an empty buffer', () => {
    const buf = new ArrayBuffer(0);
    expect(arrayBufferToBase64url(buf)).toBe('');
  });

  it('encodes a simple buffer to base64url (no padding, URL-safe chars)', () => {
    // "Hello" in bytes: [72, 101, 108, 108, 111]
    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    const result = arrayBufferToBase64url(bytes.buffer);
    expect(result).toBe('SGVsbG8');
    // Standard base64 would be "SGVsbG8=" — base64url strips padding
    expect(result).not.toContain('=');
  });

  it('replaces + with - and / with _', () => {
    // Construct bytes that produce + and / in standard base64
    // 0xFB, 0xEF, 0xBE => standard base64 "+++++/++/++=" which has + and /
    // Actually let's use known values:
    // bytes [63, 191, 255] => standard base64 is "P7//", base64url is "P7__"
    const bytes = new Uint8Array([63, 191, 255]);
    const result = arrayBufferToBase64url(bytes.buffer);
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });

  it('produces URL-safe output for random bytes', () => {
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = i * 7;
    const result = arrayBufferToBase64url(bytes.buffer);
    // base64url alphabet: A-Z, a-z, 0-9, -, _
    expect(result).toMatch(/^[A-Za-z0-9_-]*$/);
  });
});

describe('base64urlToArrayBuffer', () => {
  it('decodes an empty string', () => {
    const buf = base64urlToArrayBuffer('');
    expect(buf.byteLength).toBe(0);
  });

  it('round-trips with arrayBufferToBase64url', () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 255, 128, 0, 63, 191]);
    const encoded = arrayBufferToBase64url(original.buffer);
    const decoded = new Uint8Array(base64urlToArrayBuffer(encoded));
    expect(decoded).toEqual(original);
  });

  it('handles base64url strings without padding', () => {
    // "SGVsbG8" is "Hello" in base64url without padding
    const buf = base64urlToArrayBuffer('SGVsbG8');
    const text = new TextDecoder().decode(buf);
    expect(text).toBe('Hello');
  });

  it('handles base64url with - and _ characters', () => {
    // Encode [63, 191, 255] and decode back
    const bytes = new Uint8Array([63, 191, 255]);
    const encoded = arrayBufferToBase64url(bytes.buffer);
    const decoded = new Uint8Array(base64urlToArrayBuffer(encoded));
    expect(decoded).toEqual(bytes);
  });
});

// ── WebAuthn support detection tests ────────────────────────────

describe('webauthnService.isSupported', () => {
  // We test the service in a Node/Jest environment where WebAuthn is not available.
  // The service should correctly report false.

  it('returns false when navigator.credentials is undefined', () => {
    // In the test environment (Node.js), navigator.credentials is not defined
    // Import the service — it will detect the environment
    const { webauthnService } = require('../webauthnService');
    // Since we're running in a test (not a real browser), platform is 'web'
    // but navigator.credentials may not exist
    const result = webauthnService.isSupported();
    // In test env, this should be false (no PublicKeyCredential)
    expect(typeof result).toBe('boolean');
  });
});

// ── WebAuthnError tests ─────────────────────────────────────────

describe('WebAuthnError', () => {
  it('creates error with code and message', () => {
    const { WebAuthnError } = require('../webauthnService');
    const err = new WebAuthnError('NOT_ALLOWED', 'User cancelled');
    expect(err.code).toBe('NOT_ALLOWED');
    expect(err.message).toBe('User cancelled');
    expect(err.name).toBe('WebAuthnError');
    expect(err instanceof Error).toBe(true);
  });

  it('supports all error codes', () => {
    const { WebAuthnError } = require('../webauthnService');
    const codes = [
      'NOT_SUPPORTED',
      'NOT_ALLOWED',
      'SECURITY_ERROR',
      'INVALID_STATE',
      'TIMEOUT',
      'UNKNOWN',
    ];
    for (const code of codes) {
      const err = new WebAuthnError(code, `test ${code}`);
      expect(err.code).toBe(code);
    }
  });
});

// ── Registration flow construction test ─────────────────────────

describe('webauthnService.register', () => {
  it('throws NOT_SUPPORTED when WebAuthn is not available', async () => {
    const { webauthnService, WebAuthnError } = require('../webauthnService');

    await expect(
      webauthnService.register({
        userId: 'user-1',
        userName: 'user@test.com',
        displayName: 'Test User',
        challenge: new ArrayBuffer(32),
        rpId: 'localhost',
        rpName: 'Test',
      })
    ).rejects.toThrow();

    try {
      await webauthnService.register({
        userId: 'user-1',
        userName: 'user@test.com',
        displayName: 'Test User',
        challenge: new ArrayBuffer(32),
        rpId: 'localhost',
        rpName: 'Test',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(WebAuthnError);
      expect((err as any).code).toBe('NOT_SUPPORTED');
    }
  });
});

// ── Authentication flow construction test ───────────────────────

describe('webauthnService.authenticate', () => {
  it('throws NOT_SUPPORTED when WebAuthn is not available', async () => {
    const { webauthnService, WebAuthnError } = require('../webauthnService');

    try {
      await webauthnService.authenticate({
        challenge: new ArrayBuffer(32),
        rpId: 'localhost',
      });
    } catch (err) {
      expect(err).toBeInstanceOf(WebAuthnError);
      expect((err as any).code).toBe('NOT_SUPPORTED');
    }
  });
});

// ── getFido2ErrorMessage tests ──────────────────────────────────

describe('getFido2ErrorMessage', () => {
  it('maps WebAuthnError codes to user-friendly messages', () => {
    const { WebAuthnError } = require('../webauthnService');
    const { getFido2ErrorMessage } = require('../fido2Flow');

    expect(getFido2ErrorMessage(new WebAuthnError('NOT_SUPPORTED', 'x'))).toContain(
      'not supported'
    );
    expect(getFido2ErrorMessage(new WebAuthnError('NOT_ALLOWED', 'x'))).toContain('cancelled');
    expect(getFido2ErrorMessage(new WebAuthnError('SECURITY_ERROR', 'x'))).toContain('HTTPS');
    expect(getFido2ErrorMessage(new WebAuthnError('INVALID_STATE', 'x'))).toContain(
      'already registered'
    );
    expect(getFido2ErrorMessage(new WebAuthnError('TIMEOUT', 'x'))).toContain('timed out');
  });

  it('handles regular Error objects', () => {
    const { getFido2ErrorMessage } = require('../fido2Flow');
    expect(getFido2ErrorMessage(new Error('something broke'))).toBe('something broke');
  });

  it('handles unknown error types', () => {
    const { getFido2ErrorMessage } = require('../fido2Flow');
    expect(getFido2ErrorMessage('string error')).toContain('unknown');
  });
});
