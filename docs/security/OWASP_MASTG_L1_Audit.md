# OWASP MASTG L1 (MASVS v2) Audit - Quantum_Shield

**Audit Date:** 2026-03-12
**Auditor:** Automated + Manual Review
**Standard:** OWASP Mobile Application Security Verification Standard (MASVS) v2 -- Level 1
**Scope:** usbvault-app (React Native/TypeScript), usbvault-crypto (Rust FFI), usbvault-server (Go)

---

## MSTG-STORAGE: Platform Data Storage

### MSTG-STORAGE-1 -- Sensitive Data in Device Storage

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/sessionService.ts`, `usbvault-app/src/stores/authStore.ts` |
| **Implementation** | JWT tokens and session credentials are stored exclusively via `expo-secure-store`, which maps to iOS Keychain and Android Keystore. The `authStore` uses encrypted localStorage for non-credential state. No sensitive data is written to `AsyncStorage`, `SharedPreferences`, or plaintext files. Vault data is always stored as encrypted blobs via `usbvault-crypto/src/vault/mod.rs`. |

### MSTG-STORAGE-2 -- No Sensitive Data in Logs

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/utils/logger.ts`, `usbvault-app/src/utils/sentry.ts` |
| **Implementation** | The logger utility redacts fields matching sensitive patterns (password, token, key, secret, authorization). Sentry integration uses `beforeSend` and `beforeBreadcrumb` hooks to scrub PII -- email addresses, IP addresses, and authentication headers are stripped before transmission. Production builds strip `console.*` calls via Terser. |

### MSTG-STORAGE-3 -- No Sensitive Data Shared with Third Parties

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/utils/sentry.ts`, `usbvault-app/src/services/security/privacyModes.ts` |
| **Implementation** | Sentry is the only third-party telemetry SDK integrated. Its `beforeBreadcrumb` callback strips user identifiers and request payloads. No analytics SDK (Firebase Analytics, Mixpanel, Amplitude) is included. Privacy modes allow users to disable all telemetry. Ghost Mode prevents any external data transmission. |

### MSTG-STORAGE-4 -- No Sensitive Data in Clipboard

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/security/appProtection.ts` |
| **Implementation** | Clipboard auto-clear is enforced with a 30-second timer after any copy operation involving sensitive data (passwords, TOTP codes, recovery keys). The `appProtection` service registers a clipboard watcher that overwrites clipboard contents with an empty string after the timeout expires. |

### MSTG-STORAGE-5 -- No Sensitive Data in Keyboard Cache

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/security/appProtection.ts` |
| **Implementation** | All password and secret input fields use `secureTextEntry={true}` which disables keyboard autocomplete, autocorrect, and caching on both iOS and Android. Custom `TextInput` components enforce this prop for any field marked as sensitive in the form schema. |

### MSTG-STORAGE-7 -- No Sensitive Data in Backups

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/vault/backup.ts` |
| **Implementation** | Device backups contain only encrypted vault blobs. The backup service encrypts all exported data using the user's vault key before writing to the backup payload. Plaintext secrets, derived keys, and session tokens are excluded from the backup manifest. iOS `NSURLIsExcludedFromBackupKey` is set on temporary decryption buffers. |

### MSTG-STORAGE-12 -- PII Minimization

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/security/metadataReductionService.ts`, `usbvault-app/src/services/security/privacyModes.ts` |
| **Implementation** | Zero-knowledge architecture ensures the server never processes plaintext user data. The metadata reduction service strips timestamps to hour granularity, removes client version strings from sync payloads, and anonymizes device identifiers. Privacy modes provide user-configurable PII reduction tiers. |

---

## MSTG-CRYPTO: Cryptography

### MSTG-CRYPTO-1 -- No Hardcoded Cryptographic Keys

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `scripts/generate-secrets.sh`, `scripts/validate-env.sh` |
| **Implementation** | All cryptographic keys are derived at runtime. `generate-secrets.sh` produces environment-specific keys for deployment. `validate-env.sh` rejects placeholder values and empty strings. Gitleaks CI job scans for accidentally committed secrets. The key hierarchy derives all encryption keys from the user's password via Argon2id -- no static keys exist in the codebase. |

### MSTG-CRYPTO-2 -- Proven Cryptographic Implementations

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-crypto/src/cipher.rs`, `usbvault-crypto/src/kdf.rs` |
| **Implementation** | XChaCha20-Poly1305 (IETF AEAD) for vault encryption. Argon2id for password-based key derivation (memory: 64 MiB, iterations: 3, parallelism: 4). All implementations use the `ring` and `chacha20poly1305` crates -- peer-reviewed, widely-audited Rust cryptographic libraries. No custom cryptographic primitives. |

### MSTG-CRYPTO-3 -- Cryptography Appropriate for Use Case

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-server/internal/auth/jwt.go`, `usbvault-crypto/src/kdf.rs`, `usbvault-crypto/src/sharing.rs` |
| **Implementation** | Ed25519 for JWT signing (asymmetric, non-repudiation). Argon2id with tuned parameters for password hashing. X25519 for ephemeral key exchange in vault sharing. XChaCha20-Poly1305 for symmetric encryption (24-byte nonce eliminates nonce-reuse risk). ML-KEM hybrid encapsulation for post-quantum forward secrecy. Each algorithm is matched to its specific security requirement. |

### MSTG-CRYPTO-4 -- No Deprecated Cryptographic Algorithms

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-crypto/src/cipher.rs`, `.github/workflows/security.yml` |
| **Implementation** | No usage of MD5, SHA-1, DES, 3DES, RC4, or RSA-PKCS1v1.5 anywhere in the codebase. Semgrep rules in the CI pipeline flag any introduction of deprecated algorithms. The Rust crypto crate dependencies do not include legacy algorithm implementations. |

### MSTG-CRYPTO-6 -- Secure Random Number Generation

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-crypto/src/cipher.rs`, `usbvault-crypto/src/kdf.rs` |
| **Implementation** | Rust side uses `ring::rand::SystemRandom` and `getrandom` crate which maps to `/dev/urandom` (Linux), `SecRandomCopyBytes` (iOS), and `BCryptGenRandom` (Windows). Web/JS side uses `crypto.getRandomValues()`. No use of `Math.random()` or other non-cryptographic PRNGs for security-sensitive operations. |

---

## MSTG-AUTH: Authentication and Session Management

### MSTG-AUTH-1 -- Proper Authentication Enforcement

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-server/internal/auth/srp.go`, `usbvault-crypto/src/srp_client.rs` |
| **Implementation** | SRP-6a (Secure Remote Password) zero-knowledge proof protocol. The user's password is never transmitted -- only the SRP verifier is stored server-side. Authentication produces a shared session key without the server ever learning the password. Server-side SRP implementation uses 3072-bit group parameters per RFC 5054. |

### MSTG-AUTH-2 -- Proper Session Management

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-server/internal/auth/jwt.go`, `usbvault-app/src/services/sessionService.ts` |
| **Implementation** | JWTs signed with Ed25519 (asymmetric). Access tokens have a 15-minute TTL. Refresh tokens are rotated on each use (one-time-use) and bound to the originating device. Refresh token reuse triggers automatic session revocation (replay detection). Tokens stored in platform secure storage via `sessionService.ts`. |

### MSTG-AUTH-3 -- Session Timeout

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/security/autoLock.ts` |
| **Implementation** | Configurable auto-lock timeout: 1, 5, 15, or 30 minutes of inactivity. When triggered, the vault is locked and the decryption key is zeroed from memory. Re-authentication (password or biometric) is required to unlock. Background app transition also triggers the lock timer. |

### MSTG-AUTH-8 -- Biometric Authentication

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/security/appProtection.ts` |
| **Implementation** | Biometric authentication via `expo-local-authentication` which maps to Face ID / Touch ID (iOS) and BiometricPrompt (Android). Biometric enrollment is optional and supplements (does not replace) password authentication. The biometric check gates access to the secure-stored vault key, not the password itself. |

### MSTG-AUTH-12 -- Multi-Factor Authentication

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/fido2Service.ts`, `usbvault-server/internal/auth/fido2.go` |
| **Implementation** | FIDO2/WebAuthn support for hardware security keys (YubiKey, platform authenticators). Server-side implements credential creation and assertion verification per the WebAuthn L2 specification. Challenge-response with origin binding prevents phishing. Multiple authenticators can be registered per account. |

---

## MSTG-NETWORK: Network Communication

### MSTG-NETWORK-1 -- TLS Enforcement

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-server/internal/middleware/security.go` |
| **Implementation** | iOS App Transport Security (ATS) enforces HTTPS-only connections with TLS 1.2+ and forward secrecy. Android Network Security Config (NSC) disables cleartext traffic. Server-side middleware redirects HTTP to HTTPS and sets `Strict-Transport-Security` header with a 1-year max-age and `includeSubDomains`. |

### MSTG-NETWORK-2 -- Certificate Pinning

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/security/certificatePinning.ts` |
| **Implementation** | SPKI (Subject Public Key Info) hash pinning for all API endpoints. Primary and backup pins are configured to allow certificate rotation without app updates. Pin validation occurs before any application data is transmitted. Pin failure triggers connection abort and alerts the user. |

### MSTG-NETWORK-3 -- Custom Certificate Validation

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/security/certificatePinning.ts` |
| **Implementation** | Pin format is validated at startup (must be base64-encoded SHA-256 hash). Placeholder/development pins are rejected in production builds. Pin rotation is supported via backup pins, allowing seamless certificate renewal. Certificate chain verification delegates to the platform TLS stack; only the leaf/intermediate SPKI hash is additionally verified. |

---

## MSTG-RESILIENCE: Anti-Tampering and Reverse Engineering

### MSTG-RESILIENCE-1 -- Application Signature Verification

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | App Store / Play Store distribution |
| **Implementation** | iOS builds are code-signed with Apple Distribution certificates and distributed exclusively via App Store (mandatory code signature verification). Android builds use APK Signing Scheme v2/v3 for full-APK signature verification. No sideloading channel is provided for production builds. |

### MSTG-RESILIENCE-2 -- Jailbreak and Root Detection

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/security/deviceIntegrity.ts` |
| **Implementation** | Comprehensive device integrity checks: 28 iOS jailbreak indicators (Cydia, Sileo, checkra1n artifacts, symlink checks, sandbox escape tests, suspicious dylibs) and 15 Android root indicators (su binary, Magisk, SuperSU, system partition write test, SELinux status). Detection triggers a user warning and can optionally block vault access based on security policy. |

### MSTG-RESILIENCE-3 -- Debugging and Instrumentation Detection

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-app/src/services/security/deviceIntegrity.ts`, `usbvault-app/src/services/security/antiThreat.ts` |
| **Implementation** | Runtime detection of: Frida (port scanning, named pipe detection), debugger attachment (`ptrace` / `sysctl` checks on iOS, `Debug.isDebuggerConnected()` on Android), code injection (unexpected dylib/so loading). The anti-threat service aggregates signals and responds with configurable policies (warn, lock vault, or wipe). |

### MSTG-RESILIENCE-4 -- Reverse Engineering Protection

| Field | Detail |
|-------|--------|
| **Status** | PASS |
| **Evidence** | `usbvault-crypto/src/ffi/ios.rs`, `usbvault-crypto/src/ffi/android.rs` |
| **Implementation** | React Native JavaScript is compiled to Hermes bytecode (binary format, not readable JS). Production builds use Terser minification with `console.*` stripping. Critical cryptographic logic resides in compiled Rust native libraries (`.dylib` / `.so`), which are significantly harder to reverse-engineer than interpreted code. Symbol stripping is applied to release builds. |

---

## Summary

| Control Category | Controls Assessed | PASS | PARTIAL | FAIL | N/A |
|-----------------|-------------------|------|---------|------|-----|
| MSTG-STORAGE | 7 | 7 | 0 | 0 | 0 |
| MSTG-CRYPTO | 5 | 5 | 0 | 0 | 0 |
| MSTG-AUTH | 5 | 5 | 0 | 0 | 0 |
| MSTG-NETWORK | 3 | 3 | 0 | 0 | 0 |
| MSTG-RESILIENCE | 4 | 4 | 0 | 0 | 0 |
| **Total** | **24** | **24** | **0** | **0** | **0** |

**Overall MASVS L1 Verdict: PASS**

All 24 MASVS Level 1 controls assessed. Zero gaps identified. Quantum_Shield meets the OWASP MASVS L1 baseline for mobile application security.
