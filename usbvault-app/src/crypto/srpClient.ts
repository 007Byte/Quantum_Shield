/**
 * USBVault SRP-6a Web Client
 *
 * A genuine, byte-for-byte interoperable SRP-6a client implementation for the web
 * platform. This replaces the previous fake `srpDeriveSession` path in
 * crypto/native.ts which merely Argon2id-hashed the password into a "proof"+"key"
 * with NO modular exponentiation and therefore could never complete a real
 * handshake with the Go server.
 *
 * CANONICAL CONVENTION (must match the Go server + Rust client EXACTLY — see
 * /srp_interop_vector.json and usbvault-crypto/src/srp_client.rs):
 *   Group  = RFC 7919 ffdhe3072, g = 2, len(N) = 384 bytes.
 *   PAD(x) = left-zero-pad big-endian to 384 bytes.
 *   Hash   = SHA-256.
 *   k  = H(PAD(N) || PAD(g))
 *   A  = g^a mod N                       (client public ephemeral)
 *   B  = (k*v + g^b) mod N               (server public ephemeral)
 *   v  = g^x mod N                       (verifier)
 *   u  = H(PAD(A) || PAD(B))
 *   S_client = (B - k*g^x)^(a + u*x) mod N
 *   K  = H(PAD(S))
 *   M1 = H(PAD(A) || PAD(B) || K)
 *   M2 = H(PAD(A) || M1 || K)
 *
 * All big integers use native BigInt. modPow uses square-and-multiply with a
 * reduction mod N every step (never `(base ** exp) % n`, which is catastrophically
 * slow for 3072-bit operands).
 *
 * @module crypto/srpClient
 */

import { argon2id } from 'hash-wasm';

// ─── ffdhe3072 group parameters (RFC 7919) ─────────────────────
//
// N hex is byte-identical to the Rust client's srp_params::N_HEX
// (usbvault-crypto/src/srp_client.rs) with whitespace stripped.
const N_HEX =
  'FFFFFFFFFFFFFFFFADF85458A2BB4A9AAFDC5620273D3CF1' +
  'D8B9C583CE2D3695A9E13641146433FBCC939DCE249B3EF9' +
  '7D2FE363630C75D8F681B202AEC4617AD3DF1ED5D5FD6561' +
  '2433F51F5F066ED0856365553DED1AF3B557135E7F57C935' +
  '984F0C70E0E68B77E2A689DAF3EFE8721DF158A136ADE735' +
  '30ACCA4F483A797ABC0AB182B324FB61D108A94BB2C8E3FB' +
  'B96ADAB760D7F4681D4F42A3DE394DF4AE56EDE76372BB19' +
  '0B07A7C8EE0A6D709E02FCE1CDF7E2ECC03404CD28342F61' +
  '9172FE9CE98583FF8E4F1232EEF28183C3FE3B1B4C6FAD73' +
  '3BB5FCBC2EC22005C58EF1837D1683B2C6F34A26C1B2EFFA' +
  '886B4238611FCFDCDE355B3B6519035BBC34F4DEF99C0238' +
  '61B46FC9D6E6C9077AD91D2691F7F7EE598CB0FAC186D91C' +
  'AEFE130985139270B4130C93BC437944F4FD4452E2D74DD3' +
  '64F2E21E71F54BFF5CAE82AB9C9DF69EE86D2BC522363A0D' +
  'ABC521979B0DEADA1DBF9A42D5C4484E0ABCD06BFA53DDEF' +
  '3C1B20EE3FD59D7C25E41D2B66C62E37FFFFFFFFFFFFFFFF';

/** N = prime modulus (3072-bit ffdhe3072). */
export const N: bigint = BigInt('0x' + N_HEX);

/** g = generator (always 2 for RFC 7919). */
export const g: bigint = 2n;

/**
 * PAD_LEN is the canonical PAD width for all SRP hash inputs: the byte length of
 * N (3072-bit => 384 bytes). EVERY big-integer operand fed into a hash (N, g, A,
 * B, S) is left-zero-padded, big-endian, to exactly this width before hashing.
 */
export const PAD_LEN = 384;

// ─── Hex / byte helpers ─────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : '0' + hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Convert a non-negative BigInt to a minimal big-endian byte array (no leading zeros, matching Rust BigUint::to_bytes_be). */
export function bigIntToBytes(value: bigint): Uint8Array {
  if (value === 0n) return new Uint8Array([0]);
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) hex = '0' + hex;
  return hexToBytes(hex);
}

/** Convert a big-endian byte array to a non-negative BigInt. */
export function bytesToBigInt(bytes: Uint8Array): bigint {
  if (bytes.length === 0) return 0n;
  return BigInt('0x' + bytesToHex(bytes));
}

/**
 * PAD(x): left-zero-pad a BigInt's big-endian byte representation to PAD_LEN
 * (384) bytes. Canonical PAD used on BOTH the Rust client and the Go server so
 * that k, u, K, M1 and M2 are byte-identical across implementations.
 */
export function pad(value: bigint): Uint8Array {
  const out = new Uint8Array(PAD_LEN);
  const bytes = bigIntToBytes(value);
  if (bytes.length <= PAD_LEN) {
    out.set(bytes, PAD_LEN - bytes.length);
  } else {
    // Defensive: keep the low PAD_LEN bytes if oversized.
    out.set(bytes.subarray(bytes.length - PAD_LEN));
  }
  return out;
}

// ─── Modular exponentiation (square-and-multiply) ──────────────

/**
 * modPow(base, exp, mod): efficient modular exponentiation via square-and-multiply.
 * Reduces mod `mod` at every step so intermediate values never exceed ~2x the
 * modulus width. NEVER use `(base ** exp) % mod` — for 3072-bit operands that
 * produces an astronomically large intermediate and effectively hangs.
 */
export function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let result = 1n;
  let b = base % mod;
  if (b < 0n) b += mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) {
      result = (result * b) % mod;
    }
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

// ─── SHA-256 ────────────────────────────────────────────────────

/**
 * SHA-256 over the concatenation of the given byte parts. Uses crypto.subtle
 * (available in browsers and the jsdom/Node test environment).
 */
export async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  let total = 0;
  for (const p of parts) total += p.length;
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    combined.set(p, offset);
    offset += p.length;
  }
  const digest = await crypto.subtle.digest('SHA-256', combined.buffer as ArrayBuffer);
  return new Uint8Array(digest);
}

// ─── SRP-6a primitives ──────────────────────────────────────────

/**
 * Compute the multiplier k = H(PAD(N) || PAD(g)) — canonical RFC 5054 convention.
 * Returned as a BigInt.
 */
export async function computeK(): Promise<bigint> {
  const kHash = await sha256(pad(N), pad(g));
  return bytesToBigInt(kHash);
}

/**
 * Derive the SRP private key x from (salt, username, password) using Argon2id,
 * matching the Rust client's `SrpClient::derive_srp_x`
 * (usbvault-crypto/src/srp_client.rs):
 *
 *   srp_salt = SHA-256("srp-verifier" || salt || username)        (32 bytes)
 *   x_bytes  = Argon2id(password, srp_salt, m=65536, t=3, p=4, 32 bytes)
 *   x        = BigInt(x_bytes, big-endian)
 *
 * The Rust path goes through `kdf::derive_kek`, which feeds the raw 32-byte
 * srp_salt into Argon2id (the PHC `SaltString::encode_b64` round-trips to the
 * SAME raw salt bytes that Argon2id consumes). hash-wasm's `argon2id` consumes
 * the raw salt bytes directly, so the inputs to the Argon2id core are identical.
 *
 * @param salt - registration salt (32 bytes; same salt the server stored)
 * @param username - SRP identity (e.g. the user's email) — MUST match registration
 * @param password - user password
 * @returns x as a BigInt
 */
export async function deriveSrpX(
  salt: Uint8Array,
  username: string,
  password: string
): Promise<bigint> {
  // Domain-separate the salt: srp_salt = SHA-256("srp-verifier" || salt || username)
  const domain = new TextEncoder().encode('srp-verifier');
  const usernameBytes = new TextEncoder().encode(username);
  const srpSalt = await sha256(domain, salt, usernameBytes);

  // Argon2id with the canonical KEK parameters (65536 KiB, 3 iterations, 4 lanes, 32-byte output).
  const xHex = await argon2id({
    password,
    salt: srpSalt,
    parallelism: 4,
    iterations: 3,
    memorySize: 65536, // 64 MiB
    hashLength: 32,
    outputType: 'hex',
  });

  return BigInt('0x' + xHex);
}

/**
 * Compute the verifier v = g^x mod N for registration.
 *
 * @param x - SRP private key (from deriveSrpX)
 * @returns v as a BigInt
 */
export function deriveVerifier(x: bigint): bigint {
  return modPow(g, x, N);
}

/**
 * Compute the client public ephemeral A = g^a mod N.
 *
 * @param a - client private ephemeral (from generateEphemeral or a fixed test scalar)
 * @returns A as a BigInt
 */
export function computePublicA(a: bigint): bigint {
  return modPow(g, a, N);
}

/**
 * Generate a cryptographically random client ephemeral.
 * Returns the private scalar `a` and public `A = g^a mod N`.
 *
 * `a` is a 256-bit random value, validated 1 < a and A not trivially weak,
 * mirroring the Rust `start_auth` validation.
 */
export function generateEphemeral(): { a: bigint; A: bigint } {
  // 256-bit random scalar via CSPRNG.
  for (;;) {
    const aBytes = crypto.getRandomValues(new Uint8Array(32));
    const a = bytesToBigInt(aBytes);
    if (a <= 1n) continue;
    const A = computePublicA(a);
    // Reject weak/trivial A (0 or 1 mod N).
    if (A === 0n || A === 1n || A % N === 0n) continue;
    return { a, A };
  }
}

/**
 * Result of processing the server's challenge.
 */
export interface SrpChallengeResult {
  /** Shared secret S as a BigInt. */
  S: bigint;
  /** Session key K = H(PAD(S)) as raw bytes (32). */
  K: Uint8Array;
  /** Client proof M1 = H(PAD(A) || PAD(B) || K) as raw bytes (32). */
  M1: Uint8Array;
}

/**
 * Process the server challenge B and compute the shared secret S, session key K
 * and client proof M1, using the canonical SRP-6a convention.
 *
 *   u  = H(PAD(A) || PAD(B))
 *   S  = (B - k*g^x)^(a + u*x) mod N
 *   K  = H(PAD(S))
 *   M1 = H(PAD(A) || PAD(B) || K)
 *
 * @param a - client private ephemeral
 * @param x - SRP private key (from deriveSrpX)
 * @param B - server public ephemeral (BigInt)
 * @returns { S, K, M1 }
 * @throws Error if B is invalid (zero mod N)
 */
export async function processChallenge(
  a: bigint,
  x: bigint,
  B: bigint
): Promise<SrpChallengeResult> {
  // Validate B: must not be zero mod N.
  if (B === 0n || B % N === 0n) {
    throw new Error('Invalid server public key B');
  }

  const A = computePublicA(a);
  const k = await computeK();

  // u = H(PAD(A) || PAD(B))
  const uHash = await sha256(pad(A), pad(B));
  const u = bytesToBigInt(uHash);

  // S = (B - k*g^x)^(a + u*x) mod N
  const gx = modPow(g, x, N);
  const kgx = (k * gx) % N;
  // (B - k*g^x) mod N, handling the negative case by adding N.
  let base = (B - kgx) % N;
  if (base < 0n) base += N;
  const exponent = a + u * x; // exponent need not be reduced; modPow handles full width
  const S = modPow(base, exponent, N);

  // K = H(PAD(S))
  const K = await sha256(pad(S));

  // M1 = H(PAD(A) || PAD(B) || K)
  const M1 = await sha256(pad(A), pad(B), K);

  return { S, K, M1 };
}

/**
 * Verify the server's proof M2 = H(PAD(A) || M1 || K), confirming the server
 * knows the verifier (mutual authentication / MITM protection).
 *
 * @param A - client public ephemeral
 * @param M1 - client proof (from processChallenge)
 * @param K - session key (from processChallenge)
 * @param serverM2 - the M2 bytes received from the server (32 bytes)
 * @returns true iff the computed M2 byte-matches serverM2
 */
export async function verifyServerM2(
  A: bigint,
  M1: Uint8Array,
  K: Uint8Array,
  serverM2: Uint8Array
): Promise<boolean> {
  if (serverM2.length !== 32) return false;
  const expected = await sha256(pad(A), M1, K);
  // Length-checked, content compare (constant-time-ish; M2 is public-ish post-auth).
  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= expected[i] ^ serverM2[i];
  }
  return diff === 0;
}

/**
 * Compute the expected server proof M2 = H(PAD(A) || M1 || K) as bytes.
 * Exposed for callers (e.g. auth.ts) that compare against the server's M2.
 */
export async function computeM2(A: bigint, M1: Uint8Array, K: Uint8Array): Promise<Uint8Array> {
  return sha256(pad(A), M1, K);
}

// ─── Re-export low-level hex helpers for callers/tests ─────────

export const _internal = {
  bytesToHex,
  hexToBytes,
};
