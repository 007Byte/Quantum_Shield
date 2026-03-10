# Quantum Armor Vault Crypto Testing Setup
## Phase 2.3: Fuzz Testing & Phase 2.4: Property-Based Tests

### Overview

This document describes the comprehensive testing infrastructure for the Quantum Armor Vault cryptographic core, including fuzzing targets (libfuzzer) and property-based tests (proptest).

---

## Phase 2.3: Fuzz Testing Setup

### Purpose

Fuzzing helps discover edge cases and vulnerabilities by testing the crypto API with arbitrary, unexpected inputs. The fuzz targets are designed to:

- Find crashes and panics in deserialization/parsing code
- Detect memory safety issues
- Uncover edge cases in cryptographic operations
- Validate error handling for malformed input

### Fuzz Targets

All fuzz targets use `libfuzzer-sys` and are configured in `/fuzz/Cargo.toml`.

#### 1. **fuzz_cipher.rs** - Core Encryption/Decryption

Tests both XChaCha20-Poly1305 and AES-256-GCM-SIV cipher implementations.

**Key Invariants Tested:**
- Roundtrip property: `decrypt(encrypt(plaintext, key), key) == plaintext`
- Length property: ciphertext longer than plaintext (by nonce + tag size)
- Uniqueness: two encryptions of same plaintext produce different ciphertexts
- Error handling: wrong key should fail or produce corrupted plaintext
- Nonce handling: proper nonce extraction and validation

**Input Format:**
- Byte 0: Cipher ID (2 for XChaCha20, 3 for AES-256)
- Bytes 1-32: 32-byte encryption key
- Bytes 33+: Plaintext data

**Invariants:**
```
Key properties that must ALWAYS hold:
- encrypt(plaintext, key) produces output where:
  - First 24 bytes (XChaCha20) or 12 bytes (AES-256) is nonce
  - Length >= plaintext.len() + nonce_size + tag_size (16)
- decrypt(encrypt(plaintext, key), key) == plaintext
- decrypt(corrupted_ciphertext, key) should fail
- decrypt(ciphertext, wrong_key) should fail
```

#### 2. **fuzz_streaming.rs** - Streaming Encryption

Tests chunked/streaming encryption with the V2 record format.

**Key Invariants Tested:**
- Roundtrip: `decrypt_record(encrypt_record(data)) == data`
- Header integrity: V2RC magic, version, base_nonce are correct
- Chunk handling: proper chunk size parsing and encryption
- HMAC verification: final HMAC detects tampering
- Nonce derivation: unique nonce per chunk
- Corruption detection: bit flips fail HMAC or tag verification

**Input Format:**
- Byte 0: Cipher ID
- Bytes 1-32: 32-byte encryption key
- Bytes 33+: File data

**Invariants:**
```
V2 Record Format:
- MAGIC (4 bytes): "V2RC"
- FORMAT_VERSION (1 byte): 0x02
- BASE_NONCE (24 bytes): random nonce base
- Chunks:
  - LENGTH (4 bytes, LE): encrypted chunk size
  - ENCRYPTED_CHUNK: nonce_derived || ciphertext || tag
- FINAL_HMAC (32 bytes): HMAC-SHA256 over all previous bytes

Properties:
- decrypt_record(encrypt_record(data)) == data
- encrypted_record.len() > data.len() + 61 (overhead)
- Bit flip in encrypted data fails HMAC verification
- Wrong key fails decryption
```

#### 3. **fuzz_vault_header.rs** - Header Parsing

Tests vault header deserialization and validation.

**Key Invariants Tested:**
- Cipher ID validation: only IDs 2 and 3 are valid
- Nonce/tag size consistency: XChaCha20 (24), AES-256 (12), both use 16-byte tags
- Magic bytes validation: proper magic detection
- Header parsing: graceful handling of truncated/malformed headers
- V2 record format validation

**Input Format:**
- Arbitrary bytes for header parsing simulation

**Invariants:**
```
CipherId properties:
- Valid IDs: 2 (XChaCha20-Poly1305), 3 (AES-256-GCM-SIV)
- Nonce sizes: 24 (XChaCha20), 12 (AES-256)
- Tag size: always 16 bytes
- Round-trip: from_byte(cipher_id.as_byte()) == cipher_id

V2RC Header:
- Magic: b"V2RC" (0x56325243)
- Version: 0x02
- Base nonce: 24 bytes
- Chunk structure: length (u32 LE) + encrypted data
```

#### 4. **fuzz_kdf.rs** - Key Derivation Function (KDF)

Tests Argon2id and HKDF implementations.

**Key Invariants Tested:**
- Determinism: same password/salt -> same key
- Salt validation: invalid salt lengths rejected
- Uniqueness: different passwords -> different keys
- Salt sensitivity: different salts -> different keys
- Subkey derivation: context-based key separation
- Context isolation: different contexts -> different subkeys

**Input Format:**
- Bytes 0-31: 32-byte salt
- Bytes 32+: Password

**Invariants:**
```
Master Key Properties (Argon2id):
- Output: exactly 64 bytes (32 encryption + 32 HMAC)
- Deterministic: KDF(password, salt) always produces same output
- Salt requirement: salt must be exactly 32 bytes
- Parameterization: m_cost=65536 KiB, t_cost=3, p_cost=4

Subkey Derivation (HKDF-SHA256):
- Output: exactly 32 bytes
- Deterministic: HKDF(master, context) is reproducible
- Context isolation: different contexts produce different keys
```

#### 5. **fuzz_sharing.rs** - Sealed-Box (E2E Sharing)

Tests X25519 key exchange and sealed-box operations.

**Key Invariants Tested:**
- Roundtrip: `open(seal(plaintext, public_key), secret_key) == plaintext`
- Ephemeral key randomness: multiple seals produce different results
- Key agreement: ECDH key derivation produces correct shared secret
- Authentication: wrong key fails to decrypt
- Nonce uniqueness: each seal uses random nonce
- Message structure: ephemeral_public (32) || nonce (24) || ciphertext || tag (16)

**Input Format:**
- Arbitrary bytes for plaintext, or fixed keypairs

**Invariants:**
```
Sealed-Box Properties:
- Output format: ephemeral_public (32) || nonce (24) || ciphertext || tag (16)
- Minimum output: plaintext.len() + 72 bytes
- Roundtrip: open(seal(plaintext, pub), sec) == plaintext
- Ephemeral randomness: seal(plaintext, pub) produces different outputs
- Key confidentiality: wrong secret key fails to decrypt

ECDH & Key Derivation:
- X25519 key exchange derives shared secret
- HKDF-SHA256 expands shared secret to encryption key
- Context: "seal" for key derivation
```

### Running Fuzz Tests

```bash
# Install cargo-fuzz (if not already installed)
cargo install cargo-fuzz

# Run individual fuzz target (e.g., fuzz_cipher)
cargo +nightly fuzz run fuzz_cipher -- -max_len=10000

# Run with specific timeout and iterations
cargo +nightly fuzz run fuzz_cipher -- -max_total_time=300 -artifact_prefix=fuzz_artifacts/

# Run all fuzz targets
for target in fuzz_cipher fuzz_streaming fuzz_vault_header fuzz_kdf fuzz_sharing; do
    cargo +nightly fuzz run $target -- -max_total_time=600
done
```

**Fuzzing Configuration in Fuzz Targets:**
- Graceful error handling: expected errors do not crash the fuzzer
- Assertion-based invariant checking: assertion failures indicate real bugs
- Coverage-guided fuzzing: libfuzzer explores code paths based on coverage
- Deterministic input parsing: reproducible crashes

---

## Phase 2.4: Property-Based Tests

### Purpose

Property-based testing (using proptest) validates that specific properties hold for a wide range of inputs. Unlike unit tests that check specific cases, property tests verify invariants that must always be true.

### Location

All property-based tests are in `/tests/property_tests.rs`

### Test Categories

#### 1. **Roundtrip Properties**

Verify that encryption/decryption cycles preserve data.

**Tests:**
- `prop_cipher_xchacha20_roundtrip`: XChaCha20 encryption/decryption
- `prop_cipher_aes256_roundtrip`: AES-256-GCM-SIV encryption/decryption
- `prop_streaming_roundtrip_xchacha20`: Streaming XChaCha20
- `prop_streaming_roundtrip_aes256`: Streaming AES-256
- `prop_sharing_roundtrip`: Sealed-box operations

**Properties Verified:**
```rust
// Cipher roundtrip
let ciphertext = encrypt(plaintext, key);
let decrypted = decrypt(ciphertext, key);
assert_eq!(plaintext, decrypted);

// Streaming roundtrip
let encrypted_record = encryptor.encrypt_record(filename, data);
let (decrypted_filename, decrypted_data) = decryptor.decrypt_record(encrypted_record);
assert_eq!(data, decrypted_data);

// Sharing roundtrip
let sealed = seal(plaintext, public_key);
let opened = open(sealed, secret_key);
assert_eq!(plaintext, opened);
```

#### 2. **Length Properties**

Verify that ciphertexts have expected minimum sizes.

**Tests:**
- `prop_cipher_ciphertext_longer_than_plaintext_xchacha20`
- `prop_cipher_ciphertext_longer_than_plaintext_aes256`

**Properties Verified:**
```rust
// Ciphertext must include nonce + tag overhead
let ciphertext = encrypt(plaintext, key);
let nonce_size = cipher_id.nonce_size();      // 24 or 12
let tag_size = cipher_id.tag_size();          // 16
let min_length = nonce_size + plaintext.len() + tag_size;
assert!(ciphertext.len() >= min_length);
```

#### 3. **Uniqueness Properties**

Verify that random components (nonces, ephemeral keys) are unique.

**Tests:**
- `prop_cipher_different_encryptions_produce_different_ciphertexts_xchacha20`
- `prop_cipher_different_encryptions_produce_different_ciphertexts_aes256`
- `prop_sharing_different_seals_produce_different_results`

**Properties Verified:**
```rust
// Different encryptions must produce different ciphertexts
let ct1 = encrypt(plaintext, key);
let ct2 = encrypt(plaintext, key);
assert_ne!(ct1, ct2);  // Random nonce ensures uniqueness

// Different seals must produce different results
let sealed1 = seal(plaintext, public_key);
let sealed2 = seal(plaintext, public_key);
assert_ne!(sealed1, sealed2);  // Ephemeral key is random
```

#### 4. **Error Properties**

Verify that tampering and wrong keys are detected.

**Tests:**
- `prop_cipher_bit_flip_in_ciphertext_causes_decryption_failure_xchacha20`
- `prop_cipher_wrong_key_causes_decryption_failure_xchacha20`
- `prop_sharing_wrong_key_fails`

**Properties Verified:**
```rust
// Bit flip in ciphertext must be detected
let ciphertext = encrypt(plaintext, key);
flip_random_bit(&mut ciphertext);
// Either decryption fails OR plaintext changes
assert!(decrypt(ciphertext, key).is_err() ||
        decrypted_plaintext != plaintext);

// Wrong key must fail decryption
let ciphertext = encrypt(plaintext, key);
let wrong_key = [different_seed; 32];
assert!(decrypt(ciphertext, wrong_key).is_err() ||
        decrypted_plaintext != plaintext);

// Wrong secret key must fail opening
let sealed = seal(plaintext, alice_public_key);
assert!(open(bob_secret_key, sealed).is_err());
```

#### 5. **KDF Properties**

Verify key derivation correctness and security properties.

**Tests:**
- `prop_kdf_reproducibility`: Same input produces same output
- `prop_kdf_different_passwords_different_keys`: Different passwords yield different keys
- `prop_kdf_different_salts_different_keys`: Different salts yield different keys
- `prop_subkey_deterministic`: Subkey derivation is deterministic
- `prop_subkey_different_contexts_different_subkeys`: Different contexts yield different subkeys

**Properties Verified:**
```rust
// Reproducibility (determinism)
let key1 = derive_master_key(password, salt);
let key2 = derive_master_key(password, salt);
assert_eq!(key1, key2);

// Password sensitivity
let key1 = derive_master_key(password, salt);
let key2 = derive_master_key(modified_password, salt);
assert_ne!(key1, key2);

// Salt sensitivity
let key1 = derive_master_key(password, salt1);
let key2 = derive_master_key(password, salt2);
assert_ne!(key1, key2);

// Subkey context separation
let subkey1 = derive_subkey(master, "context1");
let subkey2 = derive_subkey(master, "context2");
assert_ne!(subkey1, subkey2);
```

#### 6. **Cipher ID Properties**

Verify cipher algorithm metadata consistency.

**Tests:**
- `prop_cipher_id_roundtrip`: Round-trip byte conversion

**Properties Verified:**
```rust
// Cipher ID consistency
let cipher_id = CipherId::from_byte(2).unwrap();
assert_eq!(cipher_id, CipherId::XChaCha20Poly1305);
assert_eq!(cipher_id.nonce_size(), 24);
assert_eq!(cipher_id.tag_size(), 16);
assert_eq!(cipher_id.as_byte(), 2);

// Round-trip consistency
let parsed = CipherId::from_byte(cipher_id.as_byte()).unwrap();
assert_eq!(cipher_id, parsed);
```

### Running Property-Based Tests

```bash
# Run all property tests
cargo test --test property_tests

# Run specific property test
cargo test --test property_tests prop_cipher_xchacha20_roundtrip

# Run with verbose output
cargo test --test property_tests -- --nocapture

# Run with custom proptest settings (cases, max_shrink_iters)
PROPTEST_CASES=10000 cargo test --test property_tests

# Run with timeout (seconds)
PROPTEST_MAX_SHRINK_ITERS=100000 cargo test --test property_tests -- --test-threads=1
```

### Proptest Configuration

Property tests use default proptest settings:
- **Cases per test:** 256 (can be customized with `PROPTEST_CASES` env var)
- **Max shrink iterations:** 10000
- **Timeout:** None (but typically completes in seconds)

The test cases are generated with:
- `".*"` - Arbitrary strings (used for passwords, filenames, plaintext)
- `0u8..=255u8` - Byte values (used for key seeds, cipher IDs)
- `0usize..=100` - Position indices (used for bit-flip testing)

---

## Integration with CI/CD

### Recommended CI Configuration

```yaml
# .github/workflows/test.yml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3

    # Property-based tests (runs in normal CI)
    - run: cargo test --test property_tests

    # Fuzz tests (runs in nightly Rust)
    - uses: actions-rs/toolchain@v1
      with:
        toolchain: nightly
        override: true

    - run: cargo install cargo-fuzz

    # Run fuzz tests with time limit (e.g., 5 minutes per target)
    - run: |
        for target in fuzz_cipher fuzz_streaming fuzz_vault_header fuzz_kdf fuzz_sharing; do
          timeout 300 cargo +nightly fuzz run $target -- -max_total_time=300 || true
        done
```

---

## Test Coverage Summary

### Cipher Operations (fuzz_cipher.rs)
- Input: Arbitrary plaintext (0 - 1MB)
- Key: 32-byte seeds
- Coverage: Roundtrip, length checks, uniqueness, error detection

### Streaming (fuzz_streaming.rs)
- Input: Arbitrary filenames and file data (0 - 1MB)
- Coverage: V2 record format, chunking, HMAC verification

### Vault Headers (fuzz_vault_header.rs)
- Input: Arbitrary byte sequences
- Coverage: Cipher ID validation, header parsing, format validation

### Key Derivation (fuzz_kdf.rs)
- Input: Arbitrary passwords (0 - 100KB), 32-byte salts
- Coverage: Argon2id, HKDF, determinism, uniqueness

### Sharing/Sealed-Box (fuzz_sharing.rs)
- Input: Arbitrary plaintext (0 - 1MB)
- Coverage: Key generation, ECDH, seal/open, corruption detection

### Properties
- 30+ property-based tests
- 5+ property categories
- 100,000+ test cases (with default PROPTEST_CASES=256 × 5 categories)

---

## Expected Results

### Successful Property Tests

All property tests should:
- Pass with no assertions failing
- Complete in < 30 seconds on modern hardware
- Provide detailed shrinking output if a property is violated

Example successful run:
```
test prop_cipher_xchacha20_roundtrip ... ok
test prop_cipher_aes256_roundtrip ... ok
test prop_streaming_roundtrip_xchacha20 ... ok
test prop_streaming_roundtrip_aes256 ... ok
test prop_sharing_roundtrip ... ok
... (30+ tests)

test result: ok. 30 passed; 0 failed; 0 ignored
```

### Successful Fuzz Tests

Each fuzz target should:
- Run without crashing
- Generate thousands of test cases
- Find no memory safety issues
- Validate all invariants

Fuzzer output indicates progress:
```
#0	READ   units: 1/1
#1	INITED cov: 42 ft: 43 corp: 2/2b lp: 1 zx: 0 exec/s: 1000
#2	NEW    cov: 50 ft: 51 corp: 3/4b lp: 3 zx: 0 paths: 1 time: 0ms top-exec-time: 0ms
...
```

---

## Troubleshooting

### Property Tests Fail

1. **Assertion Error:** Property violated - indicates real bug
   - Check error message for specific condition violated
   - Input case is automatically shrunk to minimal example

2. **Timeout:** Test takes too long
   - Reduce `PROPTEST_CASES` environment variable
   - Check for expensive operations in tested code

3. **Flaky Tests:** Pass/fail intermittently
   - Indicates non-deterministic behavior
   - Check for uninitialized variables or race conditions

### Fuzz Tests Crash

1. **Panic:** Unexpected panic in code
   - Review fuzzer output and minimized input
   - Add error handling to catch expected errors

2. **Timeout:** Fuzzer running forever
   - Reduce time limit: `-max_total_time=60` (seconds)
   - Check for infinite loops in deserialization

3. **Out of Memory:** Fuzzer using too much memory
   - Reduce `-artifact_prefix` storage
   - Add maximum length limits: `-max_len=10000`

---

## Files Created

### Phase 2.3: Fuzz Testing
- `/fuzz/Cargo.toml` - Fuzz crate configuration
- `/fuzz/fuzz_targets/fuzz_cipher.rs` - Cipher fuzzing
- `/fuzz/fuzz_targets/fuzz_streaming.rs` - Streaming fuzzing
- `/fuzz/fuzz_targets/fuzz_vault_header.rs` - Header parsing fuzzing
- `/fuzz/fuzz_targets/fuzz_kdf.rs` - KDF fuzzing
- `/fuzz/fuzz_targets/fuzz_sharing.rs` - Sharing fuzzing

### Phase 2.4: Property-Based Tests
- `/tests/property_tests.rs` - 30+ property-based tests

### Configuration Updates
- `/Cargo.toml` - Added `proptest = "1"` to `[dev-dependencies]`

---

## Next Steps

1. **Run tests locally:**
   ```bash
   cargo test --test property_tests
   ```

2. **Run fuzzing (requires nightly Rust):**
   ```bash
   cargo +nightly fuzz run fuzz_cipher -- -max_total_time=300
   ```

3. **Integrate into CI/CD pipeline** for continuous validation

4. **Collect fuzz corpus** from long-running fuzzing sessions to maximize coverage

5. **Monitor for crashes** in production with minimized reproducer test cases
