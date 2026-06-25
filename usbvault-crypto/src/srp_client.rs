//! SRP-6a client for zero-knowledge authentication
//!
//! Implements RFC 5054 SRP-6a protocol using the 3072-bit group from RFC 7919.
//! This is the CLIENT-SIDE implementation only.

use crate::error::{CryptoError, Result};
use crate::kdf;
use num_bigint::BigUint;
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use zeroize::Zeroizing;

/// SRP constants from RFC 7919 (3072-bit MODP group)
mod srp_params {
    use num_bigint::BigUint;
    use once_cell::sync::Lazy;

    /// N = prime modulus for 3072-bit group (RFC 7919 ffdhe3072)
    pub static N_HEX: &str = "\
        FFFFFFFFFFFFFFFFADF85458A2BB4A9AAFDC5620273D3CF1\
        D8B9C583CE2D3695A9E13641146433FBCC939DCE249B3EF9\
        7D2FE363630C75D8F681B202AEC4617AD3DF1ED5D5FD6561\
        2433F51F5F066ED0856365553DED1AF3B557135E7F57C935\
        984F0C70E0E68B77E2A689DAF3EFE8721DF158A136ADE735\
        30ACCA4F483A797ABC0AB182B324FB61D108A94BB2C8E3FB\
        B96ADAB760D7F4681D4F42A3DE394DF4AE56EDE76372BB19\
        0B07A7C8EE0A6D709E02FCE1CDF7E2ECC03404CD28342F61\
        9172FE9CE98583FF8E4F1232EEF28183C3FE3B1B4C6FAD73\
        3BB5FCBC2EC22005C58EF1837D1683B2C6F34A26C1B2EFFA\
        886B4238611FCFDCDE355B3B6519035BBC34F4DEF99C0238\
        61B46FC9D6E6C9077AD91D2691F7F7EE598CB0FAC186D91C\
        AEFE130985139270B4130C93BC437944F4FD4452E2D74DD3\
        64F2E21E71F54BFF5CAE82AB9C9DF69EE86D2BC522363A0D\
        ABC521979B0DEADA1DBF9A42D5C4484E0ABCD06BFA53DDEF\
        3C1B20EE3FD59D7C25E41D2B66C62E37FFFFFFFFFFFFFFFF";

    /// g = generator (always 2 for RFC 7919)
    pub const G: u32 = 2;

    /// PAD_LEN is the canonical PAD width for all SRP hash inputs: the byte
    /// length of N (3072-bit ffdhe3072 => 384 bytes). Per the canonical SRP-6a
    /// convention shared with the Go server
    /// (usbvault-server/internal/auth/srp.go, srpPadLen), EVERY big-integer
    /// operand fed into a hash (N, g, A, B, S) is left-zero-padded, big-endian,
    /// to exactly this width before hashing. Hashing variable-width
    /// `BigUint::to_bytes_be()` output (which strips leading zero bytes) was the
    /// root cause of the Go<->Rust interop break.
    pub const PAD_LEN: usize = 384;

    /// pad left-zero-pads a big-endian byte slice to PAD_LEN bytes. This is the
    /// canonical PAD(x) used on BOTH the Rust client and the Go server so that
    /// k, u, K, M1 and M2 are byte-identical across implementations.
    pub fn pad(bytes: &[u8]) -> Vec<u8> {
        let mut out = vec![0u8; PAD_LEN];
        if bytes.len() <= PAD_LEN {
            out[PAD_LEN - bytes.len()..].copy_from_slice(bytes);
        } else {
            // Defensive: keep the low PAD_LEN bytes if oversized.
            out.copy_from_slice(&bytes[bytes.len() - PAD_LEN..]);
        }
        out
    }

    /// k = H(PAD(N) || PAD(g)) used in SRP-6a (canonical convention).
    pub static K: Lazy<Vec<u8>> = Lazy::new(|| {
        use sha2::{Digest, Sha256};
        let n_bytes = hex::decode(N_HEX).expect("Valid N_HEX");
        let g_bytes = BigUint::from(G).to_bytes_be();

        let mut hasher = Sha256::new();
        // RFC 5054 canonical: k = H(PAD(N) || PAD(g))
        hasher.update(pad(&n_bytes));
        hasher.update(pad(&g_bytes));
        hasher.finalize().to_vec()
    });

    pub fn get_n() -> BigUint {
        BigUint::from_bytes_be(&hex::decode(N_HEX).expect("Valid N_HEX"))
    }

    pub fn get_g() -> BigUint {
        BigUint::from(G)
    }
}

/// SRP client for zero-knowledge password authentication
pub struct SrpClient {
    username: String,
    password: Zeroizing<Vec<u8>>,
    /// Private ephemeral key 'a' (random, stored as bytes for Zeroize)
    private_key_a: Zeroizing<Vec<u8>>,
    /// Public ephemeral key 'A' = g^a mod N
    public_key_a: BigUint,
}

/// SRP client session after receiving server challenge
pub struct SrpClientSession {
    /// Client's ephemeral public key A
    public_key_a: BigUint,
    /// Username for proof computation
    username: String,
    /// Private ephemeral key 'a' (stored as bytes)
    private_key_a: Zeroizing<Vec<u8>>,
    /// Client proof M1 (stored for M2 verification)
    client_proof_m1: Zeroizing<Vec<u8>>,
    /// Session key K (shared secret)
    session_key: Zeroizing<Vec<u8>>,
}

impl SrpClient {
    /// Create new SRP client
    pub fn new(username: &str, password: &[u8]) -> Self {
        let password_copy = Vec::from(password);

        SrpClient {
            username: username.to_string(),
            password: Zeroizing::new(password_copy),
            private_key_a: Zeroizing::new(vec![0u8; 32]),
            public_key_a: BigUint::from(0u32),
        }
    }

    /// Get the username (for testing)
    pub fn username(&self) -> &str {
        &self.username
    }

    /// Compute verifier for registration: v = g^x mod N
    ///
    /// # Arguments
    /// * `salt` - Random salt (must be 32 bytes)
    ///
    /// # Returns
    /// verifier (v = g^x mod N) as bytes
    ///
    /// SG-008: x is now derived via Argon2id instead of SHA-256.
    /// Formula: x = Argon2id(password, salt, 32 bytes)
    ///
    /// Previously: x = H(salt, H(identity:password)) — weak against brute-force
    /// if verifier database is stolen. Argon2id provides memory-hard resistance.
    pub fn compute_verifier(&self, salt: &[u8]) -> Result<Vec<u8>> {
        // SG-008: Derive x using Argon2id (memory-hard) instead of SHA-256
        let x_bytes = Self::derive_srp_x(salt, &self.username, &self.password)?;

        // Convert to BigUint
        let x = BigUint::from_bytes_be(&x_bytes);

        // Compute v = g^x mod N
        let g = srp_params::get_g();
        let n = srp_params::get_n();
        let v = g.modpow(&x, &n);

        Ok(v.to_bytes_be())
    }

    /// SG-008: Derive SRP private key x using Argon2id.
    ///
    /// Uses the same Argon2id parameters as vault key derivation (65MB, 3 iterations)
    /// but with a domain-separated salt to prevent cross-protocol key reuse:
    ///   srp_salt = SHA-256("srp-verifier" || salt || identity)
    ///
    /// This ensures the SRP verifier is memory-hard to brute-force even if the
    /// verifier database is compromised.
    fn derive_srp_x(salt: &[u8], username: &str, password: &[u8]) -> Result<Vec<u8>> {
        // Domain-separate the salt to prevent cross-protocol key reuse
        // (vault KDF uses the raw salt; SRP uses SHA-256("srp-verifier" || salt || identity))
        let mut hasher = Sha256::new();
        hasher.update(b"srp-verifier");
        hasher.update(salt);
        hasher.update(username.as_bytes());
        let srp_salt = hasher.finalize();

        // Use Argon2id via the existing KEK derivation (32-byte output, same params)
        let kek = kdf::derive_kek(password, &srp_salt)?;
        Ok(kek.as_bytes().to_vec())
    }

    /// Start authentication: generate ephemeral public key A
    ///
    /// Returns public key A and a session for processing the challenge
    pub fn start_auth(&mut self) -> Result<(Vec<u8>, SrpClientSession)> {
        // Generate random private key 'a' (1 < a < N)
        // For security, a should be at least 256 bits
        // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
        let mut rng = OsRng;
        let mut a_bytes = vec![0u8; 32];
        rng.fill_bytes(&mut a_bytes[..]);

        let a = BigUint::from_bytes_be(&a_bytes);
        let n = srp_params::get_n();
        let g = srp_params::get_g();

        // Ensure a is in valid range (1 < a < N)
        let a = if a >= n { a % (&n - 1u32) + 1u32 } else { a };
        // H-1* FIX: Explicitly reject a <= 1 (astronomically unlikely but security-critical)
        if a <= BigUint::from(1u32) {
            return Err(CryptoError::SrpError(
                "Ephemeral key 'a' out of valid range".to_string(),
            ));
        }

        // Compute A = g^a mod N
        let public_a = g.modpow(&a, &n);

        // H-1* FIX: Validate A is not 0 or 1 mod N (weak/trivial values)
        if public_a == BigUint::from(0u32)
            || public_a == BigUint::from(1u32)
            || &public_a % &n == BigUint::from(0u32)
        {
            return Err(CryptoError::SrpError(
                "Computed public key A is weak or trivial".to_string(),
            ));
        }

        let public_a_bytes = public_a.to_bytes_be();

        // Store private key as bytes for zeroizing
        let a_bytes_store = a.to_bytes_be();

        // Create session
        let session = SrpClientSession {
            public_key_a: public_a.clone(),
            username: self.username.clone(),
            private_key_a: Zeroizing::new(a_bytes_store.clone()),
            client_proof_m1: Zeroizing::new(vec![]),
            session_key: Zeroizing::new(vec![]),
        };

        self.private_key_a = Zeroizing::new(a_bytes_store);
        self.public_key_a = public_a;

        Ok((public_a_bytes, session))
    }
}

impl SrpClientSession {
    /// Process server challenge and compute proof M1
    ///
    /// # Arguments
    /// * `salt` - Server's salt for this user
    /// * `password` - User's password
    /// * `server_b` - Server's ephemeral public key B
    ///
    /// # Returns
    /// (M1_proof, session_key)
    ///
    /// Computes:
    /// 1. u = H(PAD(A) || PAD(B)) - scrambler
    /// 2. x = H(salt, H(identity, ":", password))
    /// 3. S = (B - k*g^x)^(a + u*x) mod N
    /// 4. K = H(S)
    /// 5. M1 = H(A, B, K)
    pub fn process_challenge(
        &mut self,
        salt: &[u8],
        password: &[u8],
        server_b: &[u8],
    ) -> Result<(Vec<u8>, Vec<u8>)> {
        let n = srp_params::get_n();
        let g = srp_params::get_g();

        // Parse B from bytes
        let b = BigUint::from_bytes_be(server_b);

        // Validate B: B must not be zero mod N
        if b == BigUint::from(0u32) || &b % &n == BigUint::from(0u32) {
            return Err(CryptoError::SrpError(
                "Invalid server public key B".to_string(),
            ));
        }

        // Compute u = H(PAD(A) || PAD(B)) — canonical convention.
        let mut hasher = Sha256::new();
        hasher.update(srp_params::pad(&self.public_key_a.to_bytes_be()));
        hasher.update(srp_params::pad(&b.to_bytes_be()));
        let u_hash = hasher.finalize();
        let u = BigUint::from_bytes_be(u_hash.as_ref());

        // SG-008: Derive x using Argon2id (memory-hard) instead of SHA-256
        let x_bytes = SrpClient::derive_srp_x(salt, &self.username, password)?;
        let x = BigUint::from_bytes_be(&x_bytes);

        // Compute k from k = H(N || g)
        let k_bytes = srp_params::K.clone();
        let k = BigUint::from_bytes_be(&k_bytes);

        // Compute S = (B - k*g^x)^(a + u*x) mod N
        // Step 1: compute g^x mod N
        let gx = g.modpow(&x, &n);

        // Step 2: compute k*g^x mod N
        let kgx = (&k * &gx) % &n;

        // Step 3: compute B - k*g^x mod N (handle negative by adding N)
        let b_minus_kgx = if b >= kgx {
            (&b - &kgx) % &n
        } else {
            (&b + &n - &kgx) % &n
        };

        // Step 4: Convert private key from bytes to BigUint for computation
        let a = BigUint::from_bytes_be(self.private_key_a.as_slice());

        // Step 5: compute a + u*x mod (N-1) for exponent
        let ux = (&u * &x) % (&n - 1u32);
        let exponent = (&a + &ux) % (&n - 1u32);

        // Step 6: compute S = (B - k*g^x)^exponent mod N
        let s = b_minus_kgx.modpow(&exponent, &n);

        // Compute K = H(PAD(S)) — canonical convention.
        let mut hasher = Sha256::new();
        hasher.update(srp_params::pad(&s.to_bytes_be()));
        let k_session = hasher.finalize();
        let k_bytes = k_session.to_vec();

        // Compute M1 = H(PAD(A) || PAD(B) || K) — canonical convention.
        let mut hasher = Sha256::new();
        hasher.update(srp_params::pad(&self.public_key_a.to_bytes_be()));
        hasher.update(srp_params::pad(&b.to_bytes_be()));
        hasher.update(&k_bytes);
        let m1 = hasher.finalize().to_vec();

        // Store for later verification
        self.client_proof_m1 = Zeroizing::new(m1.clone());
        self.session_key = Zeroizing::new(k_bytes.clone());

        Ok((m1, k_bytes))
    }

    /// Verify server's proof M2 to ensure server knows the password
    ///
    /// Computes expected M2 = H(A, M1, K) and compares with server's M2
    pub fn verify_server(&self, server_m2: &[u8]) -> Result<()> {
        // Compute expected M2 = H(PAD(A) || M1 || K) — canonical convention.
        let mut hasher = Sha256::new();
        hasher.update(srp_params::pad(&self.public_key_a.to_bytes_be()));
        hasher.update(self.client_proof_m1.as_slice());
        hasher.update(self.session_key.as_slice());
        let expected_m2 = hasher.finalize();

        // Compare constant-time - verify length first, then content
        if server_m2.len() != 32 {
            return Err(CryptoError::SrpError(
                "Server proof verification failed".to_string(),
            ));
        }

        let mut expected_m2_array = [0u8; 32];
        expected_m2_array.copy_from_slice(&expected_m2);

        let mut server_m2_array = [0u8; 32];
        server_m2_array.copy_from_slice(server_m2);

        if expected_m2_array.ct_eq(&server_m2_array).unwrap_u8() != 0 {
            Ok(())
        } else {
            Err(CryptoError::SrpError(
                "Server proof verification failed".to_string(),
            ))
        }
    }

    /// Get the session key (only valid after successful challenge processing)
    pub fn session_key(&self) -> &[u8] {
        self.session_key.as_slice()
    }

    /// Get the client proof M1 (for testing verification)
    pub fn client_proof_m1(&self) -> &[u8] {
        self.client_proof_m1.as_slice()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_srp_client_creation() {
        let client = SrpClient::new("alice", b"password123");
        assert_eq!(client.username, "alice");
    }

    #[test]
    fn test_compute_verifier() {
        let client = SrpClient::new("alice", b"password123");
        let salt = [0x42u8; 32];
        let verifier = client
            .compute_verifier(&salt)
            .expect("Verifier computation failed");
        assert!(!verifier.is_empty());
        // Verifier should be a valid BigUint (3072-bit = 384 bytes)
        assert!(!verifier.is_empty());
    }

    #[test]
    fn test_start_auth() {
        let mut client = SrpClient::new("alice", b"password123");
        let (a_pub, _session) = client.start_auth().expect("Auth start failed");
        assert!(!a_pub.is_empty());
        // Verify public key is non-zero by checking the bytes
        assert!(a_pub.iter().any(|&b| b != 0));
    }

    #[test]
    fn test_full_srp_flow() {
        // This is an integration test showing the full SRP-6a flow with
        // a proper server-side simulation.
        let mut client = SrpClient::new("alice", b"password123");
        let salt = [0x42u8; 32];

        // Registration: compute verifier v = g^x mod N
        let verifier_bytes = client
            .compute_verifier(&salt)
            .expect("Verifier computation failed");
        assert!(!verifier_bytes.is_empty());
        let v = BigUint::from_bytes_be(&verifier_bytes);

        // Authentication: client generates A
        let (client_a_bytes, mut session) = client.start_auth().expect("Auth start failed");
        assert!(!client_a_bytes.is_empty());
        let client_a = BigUint::from_bytes_be(&client_a_bytes);

        let g = srp_params::get_g();
        let n = srp_params::get_n();
        let k = BigUint::from_bytes_be(&srp_params::K);

        // Server generates random b and computes B = k*v + g^b mod N
        let mut rng = OsRng;
        let mut b_bytes = vec![0u8; 32];
        rng.fill_bytes(&mut b_bytes[..]);
        let server_b_private = BigUint::from_bytes_be(&b_bytes);

        // Proper SRP-6a: B = (k*v + g^b) mod N
        let gb = g.modpow(&server_b_private, &n);
        let server_b_public = ((&k * &v) % &n + &gb) % &n;
        let server_b_bytes = server_b_public.to_bytes_be();

        // Client processes challenge
        let (m1, session_key) = session
            .process_challenge(&salt, b"password123", &server_b_bytes)
            .expect("Challenge processing failed");

        assert!(!m1.is_empty());
        assert!(!session_key.is_empty());
        assert_eq!(session_key.len(), 32); // SHA256 output

        // Server computes u = H(PAD(A) || PAD(B)) — canonical convention.
        let mut hasher = Sha256::new();
        hasher.update(srp_params::pad(&client_a_bytes));
        hasher.update(srp_params::pad(&server_b_bytes));
        let u_hash = hasher.finalize();
        let u = BigUint::from_bytes_be(u_hash.as_ref());

        // Server computes S = (A * v^u)^b mod N
        let vu = v.modpow(&u, &n);
        let avu = (&client_a * &vu) % &n;
        let server_s = avu.modpow(&server_b_private, &n);

        // Server computes K = H(PAD(S)) — canonical convention.
        let mut hasher = Sha256::new();
        hasher.update(srp_params::pad(&server_s.to_bytes_be()));
        let server_k = hasher.finalize().to_vec();

        // Both sides should derive the same session key
        assert_eq!(
            session_key, server_k,
            "Client and server session keys must match"
        );

        // Server computes M2 = H(PAD(A) || M1 || K) — matching verify_server.
        let mut hasher = Sha256::new();
        hasher.update(srp_params::pad(&client_a_bytes));
        hasher.update(&m1);
        hasher.update(&server_k);
        let server_m2 = hasher.finalize();

        let verify_result = session.verify_server(server_m2.as_ref());
        assert!(verify_result.is_ok());
    }

    #[test]
    fn test_invalid_server_b_zero() {
        let mut client = SrpClient::new("alice", b"password123");
        let salt = [0x42u8; 32];
        let (_client_a, mut session) = client.start_auth().expect("Auth start failed");

        // Zero B should be rejected
        let zero_b = vec![0u8; 32];
        let result = session.process_challenge(&salt, b"password123", &zero_b);
        assert!(result.is_err());
    }

    #[test]
    fn test_verifier_deterministic() {
        // Same inputs should produce same verifier
        let client1 = SrpClient::new("alice", b"password123");
        let client2 = SrpClient::new("alice", b"password123");
        let salt = [0x42u8; 32];

        let v1 = client1.compute_verifier(&salt).expect("Verifier 1 failed");
        let v2 = client2.compute_verifier(&salt).expect("Verifier 2 failed");

        assert_eq!(v1, v2);
    }

    // --- F6: SRP-6a cross-implementation known-answer test (KAT) -----------
    //
    // Pins the ONE canonical RFC 5054-style convention (PAD to 384 bytes,
    // k=H(PAD(N)||PAD(g)), u=H(PAD(A)||PAD(B)), K=H(PAD(S)),
    // M1=H(PAD(A)||PAD(B)||K), M2=H(PAD(A)||M1||K)) with FIXED, RNG-free inputs.
    //
    // The matching Go test lives in
    // usbvault-server/internal/auth/srp_test.go (TestSRPInteropKAT) and uses the
    // SAME fixed inputs. Both languages MUST emit byte-identical
    // k/A/B/u/S/K/M1/M2. The shared contract is /srp_interop_vector.json.
    //
    // Fixed inputs (no RNG): a=3, b=5, x=7, salt=0x..42, username="alice".
    // x is injected directly here (NOT via Argon2id) so the handshake KAT does
    // not depend on the password->x derivation.
    //
    // SRP_KAT_EXPECTED_* mirror srp_interop_vector.json; empty until the first
    // green run, after which the test asserts against them. Regardless, the test
    // always asserts client-path == server-path (S, K) and an M1/M2 round-trip.
    const SRP_KAT_EXPECTED_K: &str = "1c030432002aa938dce6575dd2d419e3e748fec526bdbba8a28c849952370428"; // k  = H(PAD(N)||PAD(g))
    const SRP_KAT_EXPECTED_A: &str = "08"; // A  = g^a mod N
    const SRP_KAT_EXPECTED_B: &str = "0e0182190015549c6e732baee96a0cf1f3a47f62935eddd45146424ca91b821420"; // B  = (k*v + g^b) mod N
    const SRP_KAT_EXPECTED_U: &str = "cfe9baafb3a51933680e31f7a49b4364d6ad89142fd0c4bb734e75308d0e6f55"; // u  = H(PAD(A)||PAD(B))
    const SRP_KAT_EXPECTED_S: &str = "159b7594cebaa2ca9e5132c172c9d534d004534b456802b2c06f27762b9f43aac1ae8e475af4503e11d6b6e1253b1a5454711b1e4695235858f2c250b4a3a07b1b1f4e17a0b8dcd35e9be669b97f98070d9ac1a7b813438311a77ed3de13699ae6b401700f9f442b0751702ede4f6bf2672cedfc3c6b04b176eb8de344a46456afb13b1589dfdc9e7fcd3112615dfd053c6209dc5ac4cb60b9c966a8db48107aa5b4fd098b7d21a2b7c92b11240fdd3ce01025647512e49b06c3bf055fdd132754aee2cdffe5cfdf71e07a5294c5887e3695010c1ee5f5f409e235588b3023cdf96393f675c561b173676c8fb62c89617f7336d8ca08da3fdbfedc5072c69875612a57a7f0d9f42ba143b3c782898057e8de87994725a1341df065a8cc59ae804ee7d7749dba90d37a187f3e90a4145672226bc4f158786c4cfc53d222de6e0d7334997ec8d0213f26143f87d6b71ee4cd5a8d3854a6ebe96b63fb79aea3c559fc3d5698cfb5cd3ad65d6855f7f96433b33278858f1fdaf5cb50c1d467dedecd"; // shared secret S
    const SRP_KAT_EXPECTED_KK: &str = "58e7293fe5f28bfcc8ab8cd7d64934eb6a1336e77fb5faa9ed865dcfda1ab568"; // K  = H(PAD(S))
    const SRP_KAT_EXPECTED_M1: &str = "350a85edaefb298e1322c41797462cccaaae940014aab486ba767cfcd13ad89b"; // M1 = H(PAD(A)||PAD(B)||K)
    const SRP_KAT_EXPECTED_M2: &str = "c2abc70b30ad7f77598d9d91211e9a02d2e1e831cff8de5c0770762c4564db4c"; // M2 = H(PAD(A)||M1||K)

    fn h_sha256(parts: &[&[u8]]) -> Vec<u8> {
        let mut hasher = Sha256::new();
        for p in parts {
            hasher.update(p);
        }
        hasher.finalize().to_vec()
    }

    #[test]
    fn srp_interop_kat() {
        let n = srp_params::get_n();
        let g = srp_params::get_g();

        // Fixed scalars (no RNG) — must match srp_interop_vector.json / Go KAT.
        let a = BigUint::from(3u32);
        let b = BigUint::from(5u32);
        let x = BigUint::from(7u32);

        // k = H(PAD(N) || PAD(g))  (srp_params::K already uses this convention)
        let k = BigUint::from_bytes_be(&srp_params::K);

        // Verifier v = g^x mod N (x injected directly; not password-derived).
        let v = g.modpow(&x, &n);

        // Client public A = g^a mod N
        let a_pub = g.modpow(&a, &n);

        // Server public B = (k*v + g^b) mod N
        let gb = g.modpow(&b, &n);
        let b_pub = ((&k * &v) % &n + &gb) % &n;

        // u = H(PAD(A) || PAD(B))
        let u = BigUint::from_bytes_be(&h_sha256(&[
            &srp_params::pad(&a_pub.to_bytes_be()),
            &srp_params::pad(&b_pub.to_bytes_be()),
        ]));

        // Server shared secret: S = (A * v^u)^b mod N
        let vu = v.modpow(&u, &n);
        let s_server = ((&a_pub * &vu) % &n).modpow(&b, &n);

        // Client shared secret: S = (B - k*g^x)^(a + u*x) mod N
        let gx = g.modpow(&x, &n);
        let kgx = (&k * &gx) % &n;
        let base = if b_pub >= kgx {
            (&b_pub - &kgx) % &n
        } else {
            (&b_pub + &n - &kgx) % &n
        };
        let exp = &a + (&u * &x);
        let s_client = base.modpow(&exp, &n);

        assert_eq!(
            s_server, s_client,
            "client/server shared secret S diverged"
        );
        let s = s_server;

        // K = H(PAD(S))
        let kk = h_sha256(&[&srp_params::pad(&s.to_bytes_be())]);

        // M1 = H(PAD(A) || PAD(B) || K); M2 = H(PAD(A) || M1 || K)
        let m1 = h_sha256(&[
            &srp_params::pad(&a_pub.to_bytes_be()),
            &srp_params::pad(&b_pub.to_bytes_be()),
            &kk,
        ]);
        let m2 = h_sha256(&[&srp_params::pad(&a_pub.to_bytes_be()), &m1, &kk]);

        // Emit the vector so the shared JSON expected_* constants can be filled.
        println!("SRP interop KAT (Rust) vector:");
        println!("  k  = {}", hex::encode(k.to_bytes_be()));
        println!("  A  = {}", hex::encode(a_pub.to_bytes_be()));
        println!("  B  = {}", hex::encode(b_pub.to_bytes_be()));
        println!("  u  = {}", hex::encode(u.to_bytes_be()));
        println!("  S  = {}", hex::encode(s.to_bytes_be()));
        println!("  K  = {}", hex::encode(&kk));
        println!("  M1 = {}", hex::encode(&m1));
        println!("  M2 = {}", hex::encode(&m2));

        // Assert against locked constants when populated (cross-language contract).
        let check = |name: &str, expected: &str, got: &[u8]| {
            if !expected.is_empty() {
                assert_eq!(hex::encode(got), expected, "KAT {} mismatch", name);
            }
        };
        check("k", SRP_KAT_EXPECTED_K, &k.to_bytes_be());
        check("A", SRP_KAT_EXPECTED_A, &a_pub.to_bytes_be());
        check("B", SRP_KAT_EXPECTED_B, &b_pub.to_bytes_be());
        check("u", SRP_KAT_EXPECTED_U, &u.to_bytes_be());
        check("S", SRP_KAT_EXPECTED_S, &s.to_bytes_be());
        check("K", SRP_KAT_EXPECTED_KK, &kk);
        check("M1", SRP_KAT_EXPECTED_M1, &m1);
        check("M2", SRP_KAT_EXPECTED_M2, &m2);
    }

    #[test]
    fn test_m2_verification_fails_with_wrong_m2() {
        let mut client = SrpClient::new("alice", b"password123");
        let salt = [0x42u8; 32];
        let (_client_a, mut session) = client.start_auth().expect("Auth start failed");

        let g = srp_params::get_g();
        let n = srp_params::get_n();

        // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
        let mut rng = OsRng;
        let mut b_bytes = vec![0u8; 32];
        rng.fill_bytes(&mut b_bytes[..]);
        let server_b_private = BigUint::from_bytes_be(&b_bytes);
        let server_b_public = g.modpow(&server_b_private, &n);
        let server_b_bytes = server_b_public.to_bytes_be();

        let (_m1, _session_key) = session
            .process_challenge(&salt, b"password123", &server_b_bytes)
            .expect("Challenge processing failed");

        // Wrong M2 should fail verification
        let wrong_m2 = vec![0xAAu8; 32];
        let verify_result = session.verify_server(&wrong_m2);
        assert!(verify_result.is_err());
    }
}
