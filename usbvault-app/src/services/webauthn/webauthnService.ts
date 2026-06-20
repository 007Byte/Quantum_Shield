/**
 * USBVault WebAuthn Service
 *
 * Pure browser WebAuthn API wrapper for FIDO2 security key operations.
 * Handles credential creation (registration) and credential assertion (authentication).
 *
 * WebAuthn is BROWSER ONLY. On native platforms (iOS/Android), this service
 * reports isSupported() = false. Native biometrics use expo-local-authentication instead.
 *
 * @module services/webauthn/webauthnService
 */

import { Platform } from 'react-native';

// ── Base64url encoding/decoding ─────────────────────────────────
// WebAuthn uses base64url (RFC 4648 section 5) for all binary data
// exchanged with the server. This is NOT the same as standard base64.

export function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToArrayBuffer(base64url: string): ArrayBuffer {
  // Restore standard base64 padding
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ── Types ───────────────────────────────────────────────────────

export interface WebAuthnRegistrationResult {
  /** Base64url-encoded credential ID */
  credentialId: string;
  /** Base64url-encoded attestation object */
  attestationObject: string;
  /** Base64url-encoded client data JSON */
  clientDataJSON: string;
  /** Transport hints from the authenticator (usb, ble, nfc, internal) */
  transports: string[];
}

export interface WebAuthnAuthenticationResult {
  /** Base64url-encoded credential ID */
  credentialId: string;
  /** Base64url-encoded authenticator data */
  authenticatorData: string;
  /** Base64url-encoded client data JSON */
  clientDataJSON: string;
  /** Base64url-encoded signature */
  signature: string;
  /** Base64url-encoded user handle (may be empty) */
  userHandle: string;
}

export type WebAuthnErrorCode =
  | 'NOT_SUPPORTED'
  | 'NOT_ALLOWED'
  | 'SECURITY_ERROR'
  | 'INVALID_STATE'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class WebAuthnError extends Error {
  code: WebAuthnErrorCode;

  constructor(code: WebAuthnErrorCode, message: string) {
    super(message);
    this.name = 'WebAuthnError';
    this.code = code;
  }
}

// ── Error mapping ───────────────────────────────────────────────

function mapDOMException(err: unknown): WebAuthnError {
  if (err instanceof DOMException) {
    switch (err.name) {
      case 'NotAllowedError':
        return new WebAuthnError(
          'NOT_ALLOWED',
          'User cancelled the operation or the request was denied.'
        );
      case 'SecurityError':
        return new WebAuthnError(
          'SECURITY_ERROR',
          'The operation is insecure (e.g., not served over HTTPS or RP ID mismatch).'
        );
      case 'InvalidStateError':
        return new WebAuthnError(
          'INVALID_STATE',
          'The credential already exists on the authenticator (duplicate registration).'
        );
      case 'AbortError':
        return new WebAuthnError('TIMEOUT', 'The operation was aborted or timed out.');
      default:
        return new WebAuthnError('UNKNOWN', `WebAuthn error: ${err.name} - ${err.message}`);
    }
  }
  if (err instanceof Error) {
    return new WebAuthnError('UNKNOWN', err.message);
  }
  return new WebAuthnError('UNKNOWN', 'An unknown WebAuthn error occurred.');
}

// ── Service ─────────────────────────────────────────────────────

class WebAuthnServiceImpl {
  /**
   * Check if WebAuthn is supported in the current environment.
   * Returns false on native platforms (iOS/Android) and old browsers.
   */
  isSupported(): boolean {
    if (Platform.OS !== 'web') return false;
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.credentials !== 'undefined' &&
      typeof navigator.credentials.create === 'function' &&
      typeof navigator.credentials.get === 'function'
    );
  }

  /**
   * Register a new security key (credential creation).
   *
   * Calls navigator.credentials.create() with the server-provided options.
   * The server should have called BeginRegistration and returned the challenge
   * and other parameters needed for PublicKeyCredentialCreationOptions.
   */
  async register(options: {
    userId: string;
    userName: string;
    displayName: string;
    challenge: ArrayBuffer;
    rpId: string;
    rpName: string;
    excludeCredentials?: PublicKeyCredentialDescriptor[];
    timeout?: number;
  }): Promise<WebAuthnRegistrationResult> {
    if (!this.isSupported()) {
      throw new WebAuthnError('NOT_SUPPORTED', 'WebAuthn is not supported in this environment.');
    }

    const createOptions: CredentialCreationOptions = {
      publicKey: {
        rp: {
          name: options.rpName,
          id: options.rpId,
        },
        user: {
          id: new TextEncoder().encode(options.userId),
          name: options.userName,
          displayName: options.displayName,
        },
        challenge: options.challenge,
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256 (ECDSA w/ SHA-256)
          { alg: -257, type: 'public-key' }, // RS256 (RSASSA-PKCS1-v1_5 w/ SHA-256)
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform',
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
        timeout: options.timeout || 60000,
        attestation: 'direct',
        excludeCredentials: options.excludeCredentials || [],
      },
    };

    try {
      const credential = (await navigator.credentials.create(
        createOptions
      )) as PublicKeyCredential | null;

      if (!credential) {
        throw new WebAuthnError('NOT_ALLOWED', 'No credential was returned by the authenticator.');
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      const transports = response.getTransports?.() || [];

      return {
        credentialId: arrayBufferToBase64url(credential.rawId),
        attestationObject: arrayBufferToBase64url(response.attestationObject),
        clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
        transports,
      };
    } catch (err) {
      if (err instanceof WebAuthnError) throw err;
      throw mapDOMException(err);
    }
  }

  /**
   * Authenticate with an existing security key (credential assertion).
   *
   * Calls navigator.credentials.get() with the server-provided challenge.
   * For discoverable login, allowCredentials can be empty.
   */
  async authenticate(options: {
    challenge: ArrayBuffer;
    rpId: string;
    allowCredentials?: PublicKeyCredentialDescriptor[];
    timeout?: number;
  }): Promise<WebAuthnAuthenticationResult> {
    if (!this.isSupported()) {
      throw new WebAuthnError('NOT_SUPPORTED', 'WebAuthn is not supported in this environment.');
    }

    const getOptions: CredentialRequestOptions = {
      publicKey: {
        challenge: options.challenge,
        rpId: options.rpId,
        allowCredentials: options.allowCredentials || [],
        userVerification: 'preferred',
        timeout: options.timeout || 60000,
      },
    };

    try {
      const assertion = (await navigator.credentials.get(getOptions)) as PublicKeyCredential | null;

      if (!assertion) {
        throw new WebAuthnError('NOT_ALLOWED', 'No assertion was returned by the authenticator.');
      }

      const response = assertion.response as AuthenticatorAssertionResponse;

      return {
        credentialId: arrayBufferToBase64url(assertion.rawId),
        authenticatorData: arrayBufferToBase64url(response.authenticatorData),
        clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
        signature: arrayBufferToBase64url(response.signature),
        userHandle: response.userHandle ? arrayBufferToBase64url(response.userHandle) : '',
      };
    } catch (err) {
      if (err instanceof WebAuthnError) throw err;
      throw mapDOMException(err);
    }
  }
}

export const webauthnService = new WebAuthnServiceImpl();
