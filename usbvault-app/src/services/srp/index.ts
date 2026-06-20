/**
 * SRP-6a authentication module for web platform.
 *
 * Provides a pure JavaScript SRP client using WebCrypto and BigInt
 * that communicates with the Go server's SRP endpoints.
 */

export {
  generateEphemeral,
  deriveSession,
  verifyServerProof,
  srpLogin,
  srpRegister,
} from './srpClient';

export type {
  EphemeralKeyPair,
  SrpSession,
  SrpLoginResult,
  SrpRegistrationData,
} from './srpClient';

export { N, G, N_HEX, N_BYTE_LENGTH } from './constants';
