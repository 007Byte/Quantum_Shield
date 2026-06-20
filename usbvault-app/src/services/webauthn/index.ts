/**
 * WebAuthn/FIDO2 service barrel export.
 */

export {
  webauthnService,
  WebAuthnError,
  arrayBufferToBase64url,
  base64urlToArrayBuffer,
} from './webauthnService';

export type {
  WebAuthnRegistrationResult,
  WebAuthnAuthenticationResult,
  WebAuthnErrorCode,
} from './webauthnService';

export {
  authenticateWithSecurityKey,
  registerSecurityKey,
  listSecurityKeys,
  removeSecurityKey,
  isFido2Available,
  getFido2ErrorMessage,
} from './fido2Flow';

export type { Fido2CredentialInfo } from './fido2Flow';
