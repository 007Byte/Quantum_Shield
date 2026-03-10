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

    /// k = H(N || g) used in SRP-6a
    pub static K: Lazy<Vec<u8>> = Lazy::new(|| {
        use sha2::{Digest, Sha256};
        let n_bytes = hex::decode(N_HEX).expect("Valid N_HEX");
        let g_bytes = vec![G as u8];

        let mut hasher = Sha256::new();
        // RFC 5054: k = H(pad(N) || pad(g))
        hasher.update(&n_bytes);
        hasher.update(&g_bytes);
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

        // Compute A = g^a mod N
        let public_a = g.modpow(&a, &n);
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

        // Compute u = H(PAD(A) || PAD(B))
        let mut hasher = Sha256::new();
        hasher.update(self.public_key_a.to_bytes_be());
        hasher.update(&server_b);
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

        // Compute K = H(S)
        let s_bytes = s.to_bytes_be();
        let mut hasher = Sha256::new();
        hasher.update(&s_bytes);
        let k_session = hasher.finalize();
        let k_bytes = k_session.to_vec();

        // Compute M1 = H(A, B, K)
        let mut hasher = Sha256::new();
        hasher.update(self.public_key_a.to_bytes_be());
        hasher.update(server_b);
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
        // Compute expected M2 = H(A, M1, K)
        let mut hasher = Sha256::new();
        hasher.update(self.public_key_a.to_bytes_be());
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
        assert!(verifier.len() > 0);
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
        // This is an integration test showing the full SRP flow
        let mut client = SrpClient::new("alice", b"password123");
        let salt = [0x42u8; 32];

        // Registration: compute verifier
        let verifier = client
            .compute_verifier(&salt)
            .expect("Verifier computation failed");
        assert!(!verifier.is_empty());

        // Authentication: start
        let (client_a, mut session) = client.start_auth().expect("Auth start failed");
        assert!(!client_a.is_empty());

        // In a real scenario, the server would:
        // 1. Look up the user
        // 2. Retrieve their salt and verifier
        // 3. Generate server ephemeral key B and send it
        // For this test, we'll create a minimal server B
        let g = srp_params::get_g();
        let n = srp_params::get_n();

        // Server generates random b and computes B = k*v + g^b mod N
        // PH1-FIX: Ensure CSPRNG (OsRng) for all cryptographic random generation
        let mut rng = OsRng;
        let mut b_bytes = vec![0u8; 32];
        rng.fill_bytes(&mut b_bytes[..]);
        let server_b_private = BigUint::from_bytes_be(&b_bytes);

        // For simplicity, just compute B = g^b mod N (real server would add k*v)
        let server_b_public = g.modpow(&server_b_private, &n);
        let server_b_bytes = server_b_public.to_bytes_be();

        // Client processes challenge
        let (m1, session_key) = session
            .process_challenge(&salt, b"password123", &server_b_bytes)
            .expect("Challenge processing failed");

        assert!(!m1.is_empty());
        assert!(!session_key.is_empty());
        assert_eq!(session_key.len(), 32); // SHA256 output

        // Verify M2 (simulated)
        let mut hasher = Sha256::new();
        hasher.update(server_b_public.to_bytes_be());
        hasher.update(&m1);
        hasher.update(&session_key);
        let simulated_m2 = hasher.finalize();

        let verify_result = session.verify_server(&simulated_m2.as_ref());
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
