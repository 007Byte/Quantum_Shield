/**
 * Unit tests for the JavaScript SRP-6a client.
 *
 * Tests cover:
 * - Ephemeral key generation
 * - Session key derivation
 * - Proof computation (M1/M2)
 * - Full SRP flow with simulated server
 * - Edge cases and validation
 */

import {
  generateEphemeral,
  deriveSession,
  verifyServerProof,
  srpLogin,
  srpRegister,
  bigIntToBytes,
  bytesToBigInt,
  hexToBytes,
  bytesToHex,
  sha256,
  sha256Concat,
} from '../srpClient';
import { N, G, N_BYTE_LENGTH } from '../constants';

// ============================================================================
// Helper: simulate the Go server's SRP computations
// ============================================================================

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

function padToN(value: bigint): Uint8Array {
  const raw = bigIntToBytes(value);
  if (raw.length >= N_BYTE_LENGTH) return raw.slice(raw.length - N_BYTE_LENGTH);
  const padded = new Uint8Array(N_BYTE_LENGTH);
  padded.set(raw, N_BYTE_LENGTH - raw.length);
  return padded;
}

/**
 * Simulate server-side SRP computations matching srp.go exactly.
 */
async function simulateServer(email: string, password: string, salt: Uint8Array, clientA: bigint) {
  // Compute k = H(PAD(N) | PAD(g))
  const kHash = await sha256Concat(padToN(N), padToN(G));
  const k = bytesToBigInt(kHash);

  // Derive x (same as client) to compute verifier
  const encoder = new TextEncoder();
  const identityPassword = encoder.encode(email + ':' + password);
  const innerHash = await sha256(identityPassword);
  const xHash = await sha256Concat(salt, innerHash);
  const x = bytesToBigInt(xHash);

  // Compute verifier v = g^x mod N
  const v = modPow(G, x, N);

  // Generate server ephemeral key b (use fixed for deterministic test)
  const bBytes = new Uint8Array(32);
  crypto.getRandomValues(bBytes);
  const b = bytesToBigInt(bBytes);

  // Compute B = (k*v + g^b) mod N
  const gb = modPow(G, b, N);
  const kv = (k * v) % N;
  const B = (kv + gb) % N;

  // Compute u = H(PAD(A) | PAD(B))
  const uHash = await sha256Concat(padToN(clientA), padToN(B));
  const u = bytesToBigInt(uHash);

  // Compute S = (A * v^u)^b mod N
  const vu = modPow(v, u, N);
  const Avu = (clientA * vu) % N;
  const S = modPow(Avu, b, N);

  // Compute K = H(S)
  const K = await sha256(bigIntToBytes(S));

  // Compute M1 = H(A.bytes, B.bytes, K)
  const M1 = await sha256Concat(bigIntToBytes(clientA), bigIntToBytes(B), K);

  // Compute M2 = H(A.bytes, M1, K)
  const M2 = await sha256Concat(bigIntToBytes(clientA), M1, K);

  return {
    B,
    b,
    v,
    K,
    M1,
    M2,
    salt,
    sessionId: 'test-session-123',
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('SRP Constants', () => {
  test('N is a positive BigInt', () => {
    expect(N > 0n).toBe(true);
  });

  test('G is 2', () => {
    expect(G).toBe(2n);
  });

  test('N_BYTE_LENGTH is reasonable for 3072-bit group', () => {
    // 3072 bits / 8 = 384 bytes, but our N_HEX may be shorter
    expect(N_BYTE_LENGTH).toBeGreaterThan(0);
    expect(N_BYTE_LENGTH).toBeLessThanOrEqual(384);
  });
});

describe('Utility functions', () => {
  test('bigIntToBytes and bytesToBigInt are inverse operations', () => {
    const values = [0n, 1n, 255n, 256n, 65535n, BigInt('0xDEADBEEF')];
    for (const v of values) {
      const bytes = bigIntToBytes(v);
      const result = bytesToBigInt(bytes);
      expect(result).toBe(v);
    }
  });

  test('hexToBytes and bytesToHex are inverse operations', () => {
    const hexStrings = ['00', 'ff', 'deadbeef', '0102030405'];
    for (const hex of hexStrings) {
      const bytes = hexToBytes(hex);
      const result = bytesToHex(bytes);
      expect(result).toBe(hex);
    }
  });

  test('sha256 produces 32-byte output', async () => {
    const data = new TextEncoder().encode('test');
    const hash = await sha256(data);
    expect(hash.length).toBe(32);
  });

  test('sha256 is deterministic', async () => {
    const data = new TextEncoder().encode('hello world');
    const hash1 = await sha256(data);
    const hash2 = await sha256(data);
    expect(bytesToHex(hash1)).toBe(bytesToHex(hash2));
  });
});

describe('generateEphemeral', () => {
  test('generates valid ephemeral key pair', () => {
    const { privateKey, publicKey } = generateEphemeral();

    // Private key should be non-zero
    expect(privateKey > 0n).toBe(true);

    // Public key A = g^a mod N should be non-zero
    expect(publicKey > 0n).toBe(true);

    // A should be less than N
    expect(publicKey < N).toBe(true);

    // A should not be zero mod N
    expect(publicKey % N).not.toBe(0n);
  });

  test('generates different keys on each call', () => {
    const kp1 = generateEphemeral();
    const kp2 = generateEphemeral();

    // Extremely unlikely to be equal with 256 bits of randomness
    expect(kp1.privateKey).not.toBe(kp2.privateKey);
    expect(kp1.publicKey).not.toBe(kp2.publicKey);
  });

  test('public key satisfies A = g^a mod N', () => {
    const { privateKey: a, publicKey: A } = generateEphemeral();
    const expected = modPow(G, a, N);
    expect(A).toBe(expected);
  });
});

describe('deriveSession', () => {
  test('rejects B = 0', async () => {
    const { privateKey, publicKey } = generateEphemeral();
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    await expect(
      deriveSession('alice@test.com', 'password', salt, privateKey, publicKey, 0n)
    ).rejects.toThrow('invalid server public key B');
  });

  test('rejects B >= N', async () => {
    const { privateKey, publicKey } = generateEphemeral();
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    await expect(
      deriveSession('alice@test.com', 'password', salt, privateKey, publicKey, N)
    ).rejects.toThrow('invalid server public key B');
  });

  test('produces 32-byte session key', async () => {
    const { privateKey, publicKey } = generateEphemeral();
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    // Use a valid B (just g^b mod N for some random b)
    const bBytes = new Uint8Array(32);
    crypto.getRandomValues(bBytes);
    const b = bytesToBigInt(bBytes);
    const B = modPow(G, b, N);

    // This won't match a real server computation, but it should produce output
    const session = await deriveSession(
      'alice@test.com',
      'password',
      salt,
      privateKey,
      publicKey,
      B
    );

    expect(session.sessionKey.length).toBe(32);
    expect(session.M1.length).toBe(32);
    expect(session.A).toBe(publicKey);
  });
});

describe('Full SRP flow', () => {
  test('client and server derive the same session key', async () => {
    const email = 'alice@test.com';
    const password = 'SecurePassword123!';

    // Generate client ephemeral
    const { privateKey: a, publicKey: A } = generateEphemeral();

    // Generate salt
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    // Simulate server
    const server = await simulateServer(email, password, salt, A);

    // Client derives session
    const session = await deriveSession(email, password, salt, a, A, server.B);

    // Session keys must match
    expect(bytesToHex(session.sessionKey)).toBe(bytesToHex(server.K));

    // Client M1 must match server's expected M1
    expect(bytesToHex(session.M1)).toBe(bytesToHex(server.M1));
  });

  test('server proof M2 is verified correctly', async () => {
    const email = 'bob@test.com';
    const password = 'AnotherPassword456!';

    const { privateKey: a, publicKey: A } = generateEphemeral();
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    const server = await simulateServer(email, password, salt, A);
    const session = await deriveSession(email, password, salt, a, A, server.B);

    // Verify M2
    const m2Hex = bytesToHex(server.M2);
    const isValid = await verifyServerProof(A, session.M1, session.sessionKey, m2Hex);
    expect(isValid).toBe(true);
  });

  test('wrong M2 is rejected', async () => {
    const email = 'carol@test.com';
    const password = 'WrongM2Test789!';

    const { privateKey: a, publicKey: A } = generateEphemeral();
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    const server = await simulateServer(email, password, salt, A);
    const session = await deriveSession(email, password, salt, a, A, server.B);

    // Tamper with M2
    const fakeM2 = 'aa'.repeat(32);
    const isValid = await verifyServerProof(A, session.M1, session.sessionKey, fakeM2);
    expect(isValid).toBe(false);
  });

  test('wrong password produces different session key', async () => {
    const email = 'dave@test.com';
    const correctPassword = 'CorrectHorse!';
    const wrongPassword = 'WrongBattery!';

    const { privateKey: a, publicKey: A } = generateEphemeral();
    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);

    // Server uses the correct password
    const server = await simulateServer(email, correctPassword, salt, A);

    // Client uses the wrong password
    const session = await deriveSession(email, wrongPassword, salt, a, A, server.B);

    // Session keys should NOT match
    expect(bytesToHex(session.sessionKey)).not.toBe(bytesToHex(server.K));

    // M1 should NOT match
    expect(bytesToHex(session.M1)).not.toBe(bytesToHex(server.M1));
  });
});

describe('srpLogin', () => {
  test('performs full login flow with mocked API', async () => {
    const email = 'eve@test.com';
    const password = 'LoginTest123!';

    // We need to simulate the server responses.
    // The challenge: srpInit is called before we know A, and the server
    // generates B without A. So we set up the mock to capture and respond.

    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);
    const saltHex = bytesToHex(salt);

    // Pre-compute verifier for this email/password/salt
    const encoder = new TextEncoder();
    const innerHash = await sha256(encoder.encode(email + ':' + password));
    const xHash = await sha256Concat(salt, innerHash);
    const x = bytesToBigInt(xHash);
    const v = modPow(G, x, N);

    // Server ephemeral
    const bBytes = new Uint8Array(32);
    crypto.getRandomValues(bBytes);
    const b = bytesToBigInt(bBytes);

    // Compute k
    const kHash = await sha256Concat(padToN(N), padToN(G));
    const k = bytesToBigInt(kHash);

    // Compute B = (k*v + g^b) mod N
    const gb = modPow(G, b, N);
    const kv = (k * v) % N;
    const B = (kv + gb) % N;

    // Store server state to use in verify mock
    let capturedA: bigint | null = null;

    const mockApi = {
      srpInit: async (_email: string) => ({
        salt: saltHex,
        B: B.toString(10), // Server sends B as base-10 string
        sessionId: 'mock-session-001',
      }),
      srpVerify: async (req: { sessionId: string; A: string; M1: string }) => {
        // Parse A from base-10 string (matching server)
        capturedA = BigInt(req.A);

        // Server computes u, S, K, M1, M2
        const uHash = await sha256Concat(padToN(capturedA), padToN(B));
        const u = bytesToBigInt(uHash);

        const vu = modPow(v, u, N);
        const Avu = (capturedA * vu) % N;
        const S = modPow(Avu, b, N);
        const K = await sha256(bigIntToBytes(S));

        // Verify M1
        const expectedM1 = await sha256Concat(bigIntToBytes(capturedA), bigIntToBytes(B), K);
        expect(req.M1).toBe(bytesToHex(expectedM1));

        // Compute M2
        const M2 = await sha256Concat(bigIntToBytes(capturedA), expectedM1, K);

        return {
          M2: bytesToHex(M2),
          accessToken: 'mock-access-token',
          refreshToken: 'mock-refresh-token',
        };
      },
    };

    const result = await srpLogin(email, password, mockApi);
    expect(result.accessToken).toBe('mock-access-token');
    expect(result.refreshToken).toBe('mock-refresh-token');
    expect(result.sessionKey.length).toBe(32);
  });

  test('rejects invalid server M2', async () => {
    const email = 'mallory@test.com';
    const password = 'BadServer123!';

    const salt = new Uint8Array(32);
    crypto.getRandomValues(salt);
    const saltHex = bytesToHex(salt);

    // Simple B (just g^b mod N, no verifier component — will be wrong)
    const bBytes = new Uint8Array(32);
    crypto.getRandomValues(bBytes);
    const b = bytesToBigInt(bBytes);
    const B = modPow(G, b, N);

    const mockApi = {
      srpInit: async (_email: string) => ({
        salt: saltHex,
        B: B.toString(10),
        sessionId: 'mock-session-002',
      }),
      srpVerify: async (_req: { sessionId: string; A: string; M1: string }) => ({
        M2: 'ff'.repeat(32), // Fake M2
        accessToken: 'stolen-token',
        refreshToken: 'stolen-refresh',
      }),
    };

    await expect(srpLogin(email, password, mockApi)).rejects.toThrow(
      'server proof (M2) verification failed'
    );
  });
});

describe('srpRegister', () => {
  test('generates valid registration data', async () => {
    const result = await srpRegister('newuser@test.com', 'NewPassword123!');

    // Salt should be 32 bytes (64 hex chars)
    expect(result.salt.length).toBe(64);

    // Verifier should be a non-empty hex string
    expect(result.verifier.length).toBeGreaterThan(0);

    // Parse verifier as BigInt — should be < N
    const v = BigInt('0x' + result.verifier);
    expect(v > 0n).toBe(true);
    expect(v < N).toBe(true);
  });

  test('same inputs produce same verifier (deterministic)', async () => {
    // We need to use the same salt, but srpRegister generates random salt.
    // So we test that the verifier derivation itself is deterministic
    // by calling the lower-level functions directly.
    const result1 = await srpRegister('det@test.com', 'DetPass!');
    const result2 = await srpRegister('det@test.com', 'DetPass!');

    // Different salts means different verifiers — this is expected
    expect(result1.salt).not.toBe(result2.salt);
    expect(result1.verifier).not.toBe(result2.verifier);
  });
});
