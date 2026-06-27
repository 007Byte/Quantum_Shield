/**
 * F7: SRP-6a cross-implementation known-answer test (KAT) — Web/TS side.
 *
 * Pins the ONE canonical RFC 5054-style convention (PAD to 384 bytes,
 * k=H(PAD(N)||PAD(g)), u=H(PAD(A)||PAD(B)), K=H(PAD(S)),
 * M1=H(PAD(A)||PAD(B)||K), M2=H(PAD(A)||M1||K)) with FIXED, RNG-free inputs.
 *
 * Uses the SAME fixed inputs as the Go KAT
 * (usbvault-server/internal/auth/srp_test.go, TestSRPInteropKAT) and the Rust KAT
 * (usbvault-crypto/src/srp_client.rs, tests::srp_interop_kat):
 *
 *   a = 3, b = 5, x = 7, g = 2, N = ffdhe3072.
 *   x is injected directly (NOT password-derived), so this KAT does not depend on
 *   the Argon2id x-derivation.
 *
 * The expected_* constants below are copied verbatim from the locked contract
 * /srp_interop_vector.json. A passing run proves: web-TS == Go == Rust, byte for
 * byte, for k / A / B / u / S / K / M1 / M2.
 */

import {
  N,
  g,
  pad,
  modPow,
  sha256,
  computeK,
  bigIntToBytes,
  bytesToBigInt,
  processChallenge,
  computeM2,
  verifyServerM2,
  _internal,
} from '@/crypto/srpClient';

const { bytesToHex } = _internal;

// ─── Locked expected hex (copied from /srp_interop_vector.json) ─
const EXPECTED = {
  k: '1c030432002aa938dce6575dd2d419e3e748fec526bdbba8a28c849952370428',
  A: '08',
  B: '0e0182190015549c6e732baee96a0cf1f3a47f62935eddd45146424ca91b821420',
  u: 'cfe9baafb3a51933680e31f7a49b4364d6ad89142fd0c4bb734e75308d0e6f55',
  S: '159b7594cebaa2ca9e5132c172c9d534d004534b456802b2c06f27762b9f43aac1ae8e475af4503e11d6b6e1253b1a5454711b1e4695235858f2c250b4a3a07b1b1f4e17a0b8dcd35e9be669b97f98070d9ac1a7b813438311a77ed3de13699ae6b401700f9f442b0751702ede4f6bf2672cedfc3c6b04b176eb8de344a46456afb13b1589dfdc9e7fcd3112615dfd053c6209dc5ac4cb60b9c966a8db48107aa5b4fd098b7d21a2b7c92b11240fdd3ce01025647512e49b06c3bf055fdd132754aee2cdffe5cfdf71e07a5294c5887e3695010c1ee5f5f409e235588b3023cdf96393f675c561b173676c8fb62c89617f7336d8ca08da3fdbfedc5072c69875612a57a7f0d9f42ba143b3c782898057e8de87994725a1341df065a8cc59ae804ee7d7749dba90d37a187f3e90a4145672226bc4f158786c4cfc53d222de6e0d7334997ec8d0213f26143f87d6b71ee4cd5a8d3854a6ebe96b63fb79aea3c559fc3d5698cfb5cd3ad65d6855f7f96433b33278858f1fdaf5cb50c1d467dedecd',
  K: '58e7293fe5f28bfcc8ab8cd7d64934eb6a1336e77fb5faa9ed865dcfda1ab568',
  M1: '350a85edaefb298e1322c41797462cccaaae940014aab486ba767cfcd13ad89b',
  M2: 'c2abc70b30ad7f77598d9d91211e9a02d2e1e831cff8de5c0770762c4564db4c',
};

// Fixed RNG-free scalars (must match Go / Rust KAT and the vector file).
const a = 3n;
const b = 5n;
const x = 7n;

describe('SRP-6a interop KAT (web-TS == Go == Rust)', () => {
  it('reproduces byte-identical k/A/B/u/S/K/M1/M2 against the locked vector', async () => {
    // k = H(PAD(N) || PAD(g))
    const k = await computeK();
    expect(bytesToHex(bigIntToBytes(k))).toBe(EXPECTED.k);

    // Verifier v = g^x mod N (x injected directly; not password-derived).
    const v = modPow(g, x, N);

    // Client public A = g^a mod N
    const A = modPow(g, a, N);
    expect(bytesToHex(bigIntToBytes(A))).toBe(EXPECTED.A);

    // Server public B = (k*v + g^b) mod N
    const gb = modPow(g, b, N);
    const B = (((k * v) % N) + gb) % N;
    expect(bytesToHex(bigIntToBytes(B))).toBe(EXPECTED.B);

    // u = H(PAD(A) || PAD(B))
    const u = bytesToBigInt(await sha256(pad(A), pad(B)));
    expect(bytesToHex(bigIntToBytes(u))).toBe(EXPECTED.u);

    // Client side: process the challenge to obtain S, K, M1 via the real client API.
    const { S, K, M1 } = await processChallenge(a, x, B);
    expect(bytesToHex(bigIntToBytes(S))).toBe(EXPECTED.S);
    expect(bytesToHex(K)).toBe(EXPECTED.K);
    expect(bytesToHex(M1)).toBe(EXPECTED.M1);

    // Server side cross-check: S_server = (A * v^u)^b mod N must equal S_client.
    const vu = modPow(v, u, N);
    const avu = (A * vu) % N;
    const sServer = modPow(avu, b, N);
    expect(sServer).toBe(S);

    // M2 = H(PAD(A) || M1 || K)
    const M2 = await computeM2(A, M1, K);
    expect(bytesToHex(M2)).toBe(EXPECTED.M2);

    // The client must accept the server's (matching) M2.
    const ok = await verifyServerM2(A, M1, K, M2);
    expect(ok).toBe(true);

    // And reject a tampered M2.
    const badM2 = new Uint8Array(M2);
    badM2[0] ^= 0xff;
    const bad = await verifyServerM2(A, M1, K, badM2);
    expect(bad).toBe(false);
  });

  it('rejects a zero server public key B', async () => {
    await expect(processChallenge(a, x, 0n)).rejects.toThrow('Invalid server public key B');
  });
});
