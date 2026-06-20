/**
 * USBVault FIDO2 Flow Integration
 *
 * High-level flows that orchestrate WebAuthn browser API calls with
 * the USBVault server's FIDO2 endpoints.
 *
 * Server endpoints (from usbvault-server/cmd/api/main.go):
 *   POST /auth/fido2/challenge          — Begin authentication (get assertion challenge)
 *   POST /auth/fido2/verify             — Finish authentication (verify assertion)
 *   POST /auth/fido2/manage/register/init   — Begin registration (get creation challenge)
 *   POST /auth/fido2/manage/register/verify — Finish registration (verify attestation)
 *   GET  /auth/fido2/manage/credentials     — List registered credentials
 *   DELETE /auth/fido2/manage/credentials?id=... — Delete a credential
 *
 * @module services/webauthn/fido2Flow
 */

import { getApiClient } from '@/services/api';
import { storeTokens } from '@/services/api';
import { logger, fireAndForget } from '@/utils/logger';
import { auditService } from '@/services/auditService';
import { webauthnService, base64urlToArrayBuffer, WebAuthnError } from './webauthnService';

// ── Types matching server responses ─────────────────────────────

/** Server response from POST /auth/fido2/challenge */
interface Fido2ChallengeResponse {
  challenge: string;
  session_id: string;
}

/** Server response from POST /auth/fido2/verify */
interface Fido2VerifyResponse {
  access_token: string;
  refresh_token: string;
}

/** Server response from POST /auth/fido2/manage/register/init */
interface Fido2RegisterChallengeResponse {
  challenge: string;
  session_id: string;
}

/** Server response from POST /auth/fido2/manage/register/verify */
interface Fido2RegisterVerifyResponse {
  credential_id: string;
  message: string;
}

/** Credential info from GET /auth/fido2/manage/credentials */
export interface Fido2CredentialInfo {
  id: string;
  name: string;
  created_at?: string;
  last_used_at?: string;
}

// ── Authentication Flow ─────────────────────────────────────────

/**
 * Authenticate with a FIDO2 security key.
 *
 * Flow:
 * 1. Request assertion challenge from server (POST /auth/fido2/challenge)
 * 2. Call webauthnService.authenticate() with the challenge
 * 3. Send assertion to server for verification (POST /auth/fido2/verify)
 * 4. Server returns JWT tokens on success
 *
 * @param email - User's email address (needed for server to look up credentials)
 * @returns Object with access and refresh tokens
 */
export async function authenticateWithSecurityKey(
  email: string
): Promise<{ accessToken: string; refreshToken: string }> {
  // Step 1: Get challenge from server
  const api = getApiClient();
  const challengeResp = await api.post<Fido2ChallengeResponse>('/auth/fido2/challenge', { email });

  const { challenge, session_id } = challengeResp.data;
  const challengeBuffer = base64urlToArrayBuffer(challenge);

  // Step 2: Prompt user's security key via browser WebAuthn API
  const rpId = typeof window !== 'undefined' ? window.location.hostname : 'usbvault.io';

  const assertion = await webauthnService.authenticate({
    challenge: challengeBuffer,
    rpId,
    // Empty allowCredentials for discoverable login (server uses BeginDiscoverableLogin)
    allowCredentials: [],
  });

  // Step 3: Send assertion to server for cryptographic verification
  // The server expects the raw assertion response serialized as JSON in assertion_response
  const assertionPayload = JSON.stringify({
    id: assertion.credentialId,
    rawId: assertion.credentialId,
    type: 'public-key',
    response: {
      authenticatorData: assertion.authenticatorData,
      clientDataJSON: assertion.clientDataJSON,
      signature: assertion.signature,
      userHandle: assertion.userHandle,
    },
  });

  const verifyResp = await api.post<Fido2VerifyResponse>('/auth/fido2/verify', {
    session_id,
    assertion_response: assertionPayload,
  });

  const { access_token, refresh_token } = verifyResp.data;

  // Step 4: Store tokens
  await storeTokens(access_token, refresh_token);

  fireAndForget(
    auditService.log('fido2_authenticate', email, { credentialId: assertion.credentialId })
  );

  logger.log('FIDO2 authentication successful');

  return {
    accessToken: access_token,
    refreshToken: refresh_token,
  };
}

// ── Registration Flow ───────────────────────────────────────────

/**
 * Register a new FIDO2 security key.
 *
 * Requires the user to be authenticated (JWT token in headers).
 *
 * Flow:
 * 1. Request registration challenge from server (POST /auth/fido2/manage/register/init)
 * 2. Call webauthnService.register() with the challenge
 * 3. Send attestation to server (POST /auth/fido2/manage/register/verify)
 * 4. Server stores the credential
 *
 * @param credentialName - User-friendly name for the security key (e.g., "YubiKey 5")
 * @returns Object with success status and the server-assigned credential ID
 */
export async function registerSecurityKey(
  credentialName: string
): Promise<{ success: boolean; credentialId?: string }> {
  const api = getApiClient();

  // Step 1: Get registration challenge from server
  const challengeResp = await api.post<Fido2RegisterChallengeResponse>(
    '/auth/fido2/manage/register/init',
    {}
  );

  const { challenge, session_id } = challengeResp.data;
  const challengeBuffer = base64urlToArrayBuffer(challenge);

  const rpId = typeof window !== 'undefined' ? window.location.hostname : 'usbvault.io';

  // Step 2: Create credential via browser WebAuthn API
  const registration = await webauthnService.register({
    userId: 'usbvault-user', // Server extracts real userId from JWT
    userName: 'usbvault-user',
    displayName: credentialName,
    challenge: challengeBuffer,
    rpId,
    rpName: 'USBVault',
  });

  // Step 3: Send attestation to server
  const attestationPayload = JSON.stringify({
    id: registration.credentialId,
    rawId: registration.credentialId,
    type: 'public-key',
    response: {
      attestationObject: registration.attestationObject,
      clientDataJSON: registration.clientDataJSON,
    },
    transports: registration.transports,
  });

  const verifyResp = await api.post<Fido2RegisterVerifyResponse>(
    '/auth/fido2/manage/register/verify',
    {
      session_id,
      attestation_response: attestationPayload,
      credential_name: credentialName,
    }
  );

  fireAndForget(
    auditService.log('fido2_register', credentialName, {
      credentialId: verifyResp.data.credential_id,
    })
  );

  logger.log('FIDO2 credential registered:', verifyResp.data.message);

  return {
    success: true,
    credentialId: verifyResp.data.credential_id,
  };
}

// ── Credential Management ───────────────────────────────────────

/**
 * List registered FIDO2 security keys from the server.
 * Requires authentication (JWT).
 */
export async function listSecurityKeys(): Promise<Fido2CredentialInfo[]> {
  const api = getApiClient();
  const response = await api.get<Fido2CredentialInfo[]>('/auth/fido2/manage/credentials');
  return response.data || [];
}

/**
 * Remove a registered FIDO2 security key from the server.
 * Requires authentication (JWT).
 *
 * @param credentialId - The credential ID to remove
 */
export async function removeSecurityKey(credentialId: string): Promise<void> {
  const api = getApiClient();
  await api.delete('/auth/fido2/manage/credentials', {
    params: { id: credentialId },
  });

  fireAndForget(auditService.log('fido2_revoke', credentialId, { credentialId }));

  logger.log('FIDO2 credential removed:', credentialId);
}

// ── Utility ─────────────────────────────────────────────────────

/**
 * Check if WebAuthn/FIDO2 is available in the current environment.
 */
export function isFido2Available(): boolean {
  return webauthnService.isSupported();
}

/**
 * Map a WebAuthnError to a user-friendly message.
 */
export function getFido2ErrorMessage(error: unknown): string {
  if (error instanceof WebAuthnError) {
    switch (error.code) {
      case 'NOT_SUPPORTED':
        return 'WebAuthn is not supported in this browser. Please use a modern browser.';
      case 'NOT_ALLOWED':
        return 'Security key operation was cancelled or denied. Please try again.';
      case 'SECURITY_ERROR':
        return 'Security error: ensure you are accessing USBVault over HTTPS.';
      case 'INVALID_STATE':
        return 'This security key is already registered.';
      case 'TIMEOUT':
        return 'The security key operation timed out. Please try again.';
      default:
        return 'An unexpected error occurred with the security key.';
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred.';
}
