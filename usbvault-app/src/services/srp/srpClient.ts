/**
 * Pure JavaScript SRP-6a client for web authentication.
 *
 * Uses WebCrypto (crypto.subtle) for SHA-256 hashing and BigInt for
 * large-number arithmetic. Matches the Go server implementation in
 * usbvault-server/internal/auth/srp.go exactly.
 *
 * Protocol flow:
 *   1. Client calls srpInit (sends email) -> gets (salt, B, sessionId)
 *   2. Client computes A, derives x from password+salt, computes S, K, M1
 *   3. Client calls srpVerify (sends sessionId, A, M1) -> gets (M2, tokens)
 *   4. Client validates M2 for mutual authentication
 *
 * IMPORTANT NOTES on server compatibility:
 * - Server sends B as a base-10 decimal string (big.Int.String() in Go)
 * - Server expects A as a base-10 decimal string
 * - Server expects M1 as a hex string
 * - Server returns M2 as a hex string
 * - k = H(PAD(N) | PAD(g)) where PAD means zero-padded to N's byte length
 * - u = H(PAD(A) | PAD(B)) where PAD means zero-padded to N's byte length
 * - M1 = H(A.bytes | B.bytes | K) using RAW (unpadded) big-endian bytes
 * - M2 = H(A.bytes | M1 | K)
 * - K = H(S.bytes) using RAW big-endian bytes
 */

import { N, N_BYTE_LENGTH, G } from './constants';

// ============================================================================
// Utility functions
// ============================================================================

/**
 * Convert a BigInt to a big-endian byte array (Uint8Array).
 * This matches Go's big.Int.Bytes() — no leading zeros, minimal representation.
 */
function bigIntToBytes(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array([0]);
  let hex = n.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a Uint8Array to a BigInt (big-endian).
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return BigInt('0x' + hex);
}

/**
 * Zero-pad a BigInt to exactly `length` bytes (big-endian).
 * This matches the Go server's PAD() for RFC 5054 computations.
 */
function padToN(value: bigint, length: number = N_BYTE_LENGTH): Uint8Array {
  const raw = bigIntToBytes(value);
  if (raw.length >= length) return raw.slice(raw.length - length);
  const padded = new Uint8Array(length);
  padded.set(raw, length - raw.length);
  return padded;
}

/**
 * Convert a hex string to Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) hex = '0' + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a Uint8Array to a hex string.
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * SHA-256 hash using WebCrypto.
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  return new Uint8Array(hashBuffer);
}

/**
 * SHA-256 hash of concatenated byte arrays.
 */
async function sha256Concat(...parts: Uint8Array[]): Promise<Uint8Array> {
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return sha256(combined);
}

/**
 * Generate cryptographically secure random bytes.
 */
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Modular exponentiation: base^exp mod mod.
 * Uses square-and-multiply algorithm with BigInt.
 */
function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  base = ((base % mod) + mod) % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    exp = exp >> 1n;
    base = (base * base) % mod;
  }
  return result;
}

// ============================================================================
// SRP-6a computations (matching Go server exactly)
// ============================================================================

/**
 * Compute k = H(PAD(N) | PAD(g)) per RFC 5054.
 * Matches computeSRPk() in srp.go.
 */
async function computeK(): Promise<bigint> {
  const nPadded = padToN(N);
  const gPadded = padToN(G);
  const hash = await sha256Concat(nPadded, gPadded);
  return bytesToBigInt(hash);
}

/**
 * Compute scrambling parameter u = H(PAD(A) | PAD(B)) per RFC 5054.
 * Matches computeSRPu() in srp.go.
 *
 * NOTE: The server's computeSRPu takes B as a base-10 string and converts
 * to big.Int, then pads both A and B to N's byte length.
 */
async function computeU(A: bigint, B: bigint): Promise<bigint> {
  const aPadded = padToN(A);
  const bPadded = padToN(B);
  const hash = await sha256Concat(aPadded, bPadded);
  return bytesToBigInt(hash);
}

/**
 * Compute client proof M1 = H(A, B, K).
 * Matches computeSRPProofM1() in srp.go.
 *
 * IMPORTANT: The server uses RAW (unpadded) bytes for A and B in M1:
 *   h.Write(A.Bytes())   -- minimal big-endian, no leading zeros
 *   h.Write(B.Bytes())   -- converted from base-10 string to big.Int.Bytes()
 *   h.Write(K)           -- 32-byte session key hash
 */
async function computeM1(A: bigint, B: bigint, K: Uint8Array): Promise<Uint8Array> {
  const aBytes = bigIntToBytes(A);
  const bBytes = bigIntToBytes(B);
  return sha256Concat(aBytes, bBytes, K);
}

/**
 * Compute server proof M2 = H(A, M1, K).
 * Matches computeSRPProofM2() in srp.go.
 *
 * Uses raw A bytes (same as M1).
 */
async function computeM2(A: bigint, M1: Uint8Array, K: Uint8Array): Promise<Uint8Array> {
  const aBytes = bigIntToBytes(A);
  return sha256Concat(aBytes, M1, K);
}

/**
 * Derive SRP private key x from password and salt.
 *
 * NOTE ON ARGON2ID: The Rust native client uses Argon2id with domain separation
 * for x derivation (SG-008). The server stores verifiers that were computed
 * using this Argon2id-derived x. For the web client, we need to match this.
 *
 * However, Argon2id in JavaScript is expensive and requires a WASM or JS
 * implementation. For the initial web implementation, we use SHA-256 based
 * x derivation which matches the server's LEGACY path (verifierHashAlgo="sha256").
 *
 * For accounts registered from native clients (using Argon2id), the server
 * stores the verifier with algo="argon2id". Those accounts will need the
 * Argon2id web implementation to be added later, OR the server will need
 * to support a migration path.
 *
 * Legacy x derivation: x = SHA-256(salt | SHA-256(email | ":" | password))
 * This matches the traditional SRP-6a x derivation formula.
 */
async function deriveSrpX(salt: Uint8Array, email: string, password: string): Promise<bigint> {
  // Inner hash: H(email | ":" | password)
  const encoder = new TextEncoder();
  const identityPassword = encoder.encode(email + ':' + password);
  const innerHash = await sha256(identityPassword);

  // Outer hash: x = H(salt | innerHash)
  const xHash = await sha256Concat(salt, innerHash);
  return bytesToBigInt(xHash);
}

// ============================================================================
// Public API
// ============================================================================

export interface EphemeralKeyPair {
  /** Private key a (secret, never sent to server) */
  privateKey: bigint;
  /** Public key A = g^a mod N (sent to server) */
  publicKey: bigint;
}

export interface SrpSession {
  /** Client public key A */
  A: bigint;
  /** Session key K = H(S) — shared secret */
  sessionKey: Uint8Array;
  /** Client proof M1 = H(A, B, K) */
  M1: Uint8Array;
}

export interface SrpLoginResult {
  /** JWT access token */
  accessToken: string;
  /** JWT refresh token */
  refreshToken: string;
  /** Session key K (for optional further key derivation) */
  sessionKey: Uint8Array;
}

export interface SrpRegistrationData {
  /** Hex-encoded salt (32 bytes random) */
  salt: string;
  /** Hex-encoded verifier v = g^x mod N */
  verifier: string;
}

/**
 * Generate a random client ephemeral key pair.
 *
 * Returns { privateKey: a, publicKey: A } where A = g^a mod N.
 * The private key a is 256 bits (32 bytes) of cryptographic randomness.
 */
export function generateEphemeral(): EphemeralKeyPair {
  // Generate 32 bytes of random data for private key a
  const aBytes = randomBytes(32);
  const a = bytesToBigInt(aBytes);

  // Compute A = g^a mod N
  const A = modPow(G, a, N);

  // Ensure A != 0 mod N (astronomically unlikely but required by spec)
  if (A === 0n) {
    throw new Error('SRP: generated A = 0, this should never happen');
  }

  return { privateKey: a, publicKey: A };
}

/**
 * Derive the session key and client proof from the server's challenge.
 *
 * @param email - User's email (used as SRP identity)
 * @param password - User's password
 * @param salt - Server-provided salt (raw bytes)
 * @param clientPrivate - Client's private ephemeral key a
 * @param clientPublic - Client's public ephemeral key A
 * @param serverPublic - Server's public ephemeral key B
 * @returns SRP session with A, sessionKey K, and proof M1
 */
export async function deriveSession(
  email: string,
  password: string,
  salt: Uint8Array,
  clientPrivate: bigint,
  clientPublic: bigint,
  serverPublic: bigint
): Promise<SrpSession> {
  // Validate B: must not be 0 mod N
  if (serverPublic <= 0n || serverPublic >= N) {
    throw new Error('SRP: invalid server public key B (out of range)');
  }
  if (serverPublic % N === 0n) {
    throw new Error('SRP: invalid server public key B (zero mod N)');
  }

  // Compute k = H(PAD(N) | PAD(g))
  const k = await computeK();

  // Compute u = H(PAD(A) | PAD(B))
  const u = await computeU(clientPublic, serverPublic);
  if (u === 0n) {
    throw new Error('SRP: computed u = 0, aborting (possible attack)');
  }

  // Derive x from password and salt
  const x = await deriveSrpX(salt, email, password);

  // Compute S = (B - k*g^x)^(a + u*x) mod N
  // Step 1: g^x mod N
  const gx = modPow(G, x, N);

  // Step 2: k*g^x mod N
  const kgx = (k * gx) % N;

  // Step 3: B - k*g^x mod N (handle potential negative by adding N)
  let base = serverPublic - kgx;
  if (base < 0n) {
    base = ((base % N) + N) % N;
  } else {
    base = base % N;
  }

  // Step 4: exponent = a + u*x
  // Note: The server computes S = (A * v^u)^b mod N, which is equivalent
  // when the client computes S = (B - k*g^x)^(a + u*x) mod N
  const exponent = clientPrivate + u * x;

  // Step 5: S = base^exponent mod N
  const S = modPow(base, exponent, N);

  // Compute K = H(S) using raw (unpadded) S bytes
  const sBytes = bigIntToBytes(S);
  const K = await sha256(sBytes);

  // Compute M1 = H(A, B, K) using raw (unpadded) A and B bytes
  const M1 = await computeM1(clientPublic, serverPublic, K);

  return {
    A: clientPublic,
    sessionKey: K,
    M1,
  };
}

/**
 * Verify the server's proof M2 for mutual authentication.
 *
 * @param A - Client's public ephemeral key
 * @param M1 - Client's proof (as sent to server)
 * @param sessionKey - Session key K
 * @param serverM2Hex - Server's M2 proof (hex-encoded string from server response)
 * @returns true if server proof is valid
 */
export async function verifyServerProof(
  A: bigint,
  M1: Uint8Array,
  sessionKey: Uint8Array,
  serverM2Hex: string
): Promise<boolean> {
  const expectedM2 = await computeM2(A, M1, sessionKey);
  const serverM2 = hexToBytes(serverM2Hex);

  // Constant-time comparison
  if (expectedM2.length !== serverM2.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedM2.length; i++) {
    diff |= expectedM2[i] ^ serverM2[i];
  }
  return diff === 0;
}

/**
 * High-level: perform a complete SRP login against the server.
 *
 * Handles the full protocol:
 *   1. POST /auth/srp/init with email -> (salt, B, sessionId)
 *   2. Compute A, derive session, compute M1
 *   3. POST /auth/srp/verify with (sessionId, A, M1) -> (M2, tokens)
 *   4. Verify M2
 *
 * @param email - User's email address
 * @param password - User's password
 * @param apiClient - Object with srpInit and srpVerify methods (from api.ts)
 * @returns Login result with JWT tokens and session key
 */
export async function srpLogin(
  email: string,
  password: string,
  apiClient: {
    srpInit: (email: string) => Promise<{ salt: string; B: string; sessionId: string }>;
    srpVerify: (req: {
      sessionId: string;
      A: string;
      M1: string;
    }) => Promise<{ M2: string; accessToken: string; refreshToken: string }>;
  }
): Promise<SrpLoginResult> {
  // Step 1: Request SRP parameters from server
  const initResp = await apiClient.srpInit(email);

  // Parse salt from hex
  const salt = hexToBytes(initResp.salt);

  // Parse B from base-10 decimal string (Go's big.Int.String() output)
  const B = BigInt(initResp.B);

  // Step 2: Generate client ephemeral keys
  const { privateKey: a, publicKey: A } = generateEphemeral();

  // Step 3: Derive session key and compute proof
  const session = await deriveSession(email, password, salt, a, A, B);

  // Step 4: Send proof to server
  // A is sent as base-10 decimal string (server parses with SetString(req.A, 10))
  // M1 is sent as hex string (server compares hex-encoded)
  const verifyResp = await apiClient.srpVerify({
    sessionId: initResp.sessionId,
    A: A.toString(10),
    M1: bytesToHex(session.M1),
  });

  // Step 5: Verify server proof M2
  const serverValid = await verifyServerProof(A, session.M1, session.sessionKey, verifyResp.M2);
  if (!serverValid) {
    throw new Error(
      'SRP: server proof (M2) verification failed — possible man-in-the-middle attack'
    );
  }

  return {
    accessToken: verifyResp.accessToken,
    refreshToken: verifyResp.refreshToken,
    sessionKey: session.sessionKey,
  };
}

/**
 * High-level: generate SRP registration data for a new account.
 *
 * Computes salt and verifier that the server will store.
 * The verifier v = g^x mod N where x = H(salt | H(email : password)).
 *
 * @param email - User's email address
 * @param password - User's password
 * @returns Registration data with hex-encoded salt and verifier
 */
export async function srpRegister(email: string, password: string): Promise<SrpRegistrationData> {
  // Generate random 32-byte salt
  const salt = randomBytes(32);

  // Derive x from password and salt
  const x = await deriveSrpX(salt, email, password);

  // Compute verifier v = g^x mod N
  const v = modPow(G, x, N);

  return {
    salt: bytesToHex(salt),
    verifier: bytesToHex(bigIntToBytes(v)),
  };
}

// Re-export utilities that may be needed by auth.ts
export { bigIntToBytes, bytesToBigInt, hexToBytes, bytesToHex, sha256, sha256Concat };
