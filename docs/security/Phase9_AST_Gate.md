# Phase 9 AST Gate: Mobile Security & Platform Hardening

**Date:** 2026-03-12
**Status:** PASS
**Phase:** 9 -- Mobile Security & Platform Hardening

---

## Security Controls Verified

### 1. Device Integrity: Jailbreak/Root Detection with 43 Indicators

- **File:** `usbvault-app/src/services/security/deviceIntegrity.ts`
- **File:** `usbvault-app/src/services/deviceIntegrity.ts`
- **Control:** The application MUST detect compromised device environments (jailbroken iOS, rooted Android) before granting access to vault data.
- **Implementation:**
  - 28 iOS jailbreak indicators: Cydia/Sileo/Zebra app detection, checkra1n/unc0ver artifacts, symlink validation (`/Applications`, `/Library`), sandbox escape tests (write outside sandbox), suspicious dylib injection (`MobileSubstrate`, `SubstituteLoader`), fork() availability check
  - 15 Android root indicators: `su` binary path scan, Magisk Manager detection, SuperSU artifacts, `/system` partition write test, SELinux permissive mode check, test-keys build fingerprint, root management apps
  - Detection results aggregated into a threat score with configurable response: warn user, lock vault, or trigger self-destruct
  - Checks run at app launch, app foreground, and before any decrypt operation
- **Test coverage:** `deviceIntegrity.test.ts` -- `TestJailbreakDetection28Indicators`, `TestRootDetection15Indicators`, `TestThreatScoreAggregation`, `TestDetectionRunsOnForeground`

### 2. Certificate Pinning: SPKI Hash Pinning with Rotation Support

- **File:** `usbvault-app/src/services/security/certificatePinning.ts`
- **Control:** All HTTPS connections to USBVault API endpoints MUST validate the server certificate against pinned SPKI hashes, preventing MITM attacks even with a compromised CA.
- **Implementation:**
  - SPKI (Subject Public Key Info) SHA-256 hash pinning for API domain
  - Primary pin plus backup pin to enable certificate rotation without app updates
  - Pin format validated at startup: must be valid base64-encoded SHA-256 (44 characters)
  - Placeholder/development pins (`AAAA...`) rejected in production builds
  - Pin failure aborts the connection before any application data is transmitted
  - User-facing alert displayed on pin mismatch for transparency
- **Test coverage:** `certificatePinning.test.ts` -- `TestValidPinAccepted`, `TestInvalidPinRejected`, `TestPlaceholderPinBlockedInProduction`, `TestBackupPinRotation`, `TestPinFormatValidation`

### 3. Auto-Lock and Session Timeout: Configurable Inactivity Lock

- **File:** `usbvault-app/src/services/security/autoLock.ts`
- **File:** `usbvault-app/src/services/sessionService.ts`
- **Control:** The vault MUST automatically lock after a configurable period of user inactivity, requiring re-authentication to resume access.
- **Implementation:**
  - Configurable timeout options: 1, 5, 15, or 30 minutes
  - Inactivity tracked via touch/interaction events; timer resets on user activity
  - Lock action zeros the decryption key from memory (not just UI lock)
  - App background transition immediately starts the lock countdown
  - Re-authentication requires password or biometric verification
  - JWT access tokens have independent 15-minute TTL; refresh tokens are one-time-use with replay detection
- **Test coverage:** `autoLock.test.ts` -- `TestLockAfterTimeout`, `TestTimerResetOnActivity`, `TestKeyZeroedOnLock`, `TestBackgroundTransitionStartsTimer`

### 4. App Protection: Screenshot Prevention and Clipboard Security

- **File:** `usbvault-app/src/services/security/appProtection.ts`
- **File:** `usbvault-app/src/services/appProtection.ts`
- **Control:** The application MUST prevent sensitive data leakage through screenshots, screen recording, clipboard persistence, and keyboard caches.
- **Implementation:**
  - Screenshot/screen recording prevention via `FLAG_SECURE` (Android) and `UIScreen.captured` observer (iOS)
  - Clipboard auto-clear: 30-second timer after copying passwords, TOTP codes, or recovery keys
  - All password inputs use `secureTextEntry={true}`, disabling autocomplete and keyboard cache
  - Biometric gating via `expo-local-authentication` for Face ID / Touch ID / BiometricPrompt
  - App blur overlay on task switcher to prevent thumbnail data exposure
- **Test coverage:** `appProtection.test.ts` -- `TestScreenshotPrevention`, `TestClipboardAutoClear30s`, `TestSecureTextEntryEnforced`, `TestBiometricGating`

### 5. Anti-Tampering: Runtime Threat Detection and Response

- **File:** `usbvault-app/src/services/security/antiThreat.ts`
- **File:** `usbvault-app/src/services/security/deviceIntegrity.ts`
- **Control:** The application MUST detect active runtime tampering attempts (debugger attachment, code injection, instrumentation frameworks) and respond according to the configured security policy.
- **Implementation:**
  - Frida detection: TCP port scanning (default 27042), named pipe detection, Frida gadget library scanning
  - Debugger detection: `ptrace(PT_DENY_ATTACH)` on iOS, `Debug.isDebuggerConnected()` on Android, `sysctl` P_TRACED flag check
  - Code injection detection: unexpected dynamic library enumeration, method swizzling indicators
  - Configurable response policies: log-only, warn user, lock vault, wipe vault
  - Threat signals aggregated into composite risk score; response escalates with severity
- **Test coverage:** `antiThreat.test.ts` -- `TestFridaPortDetection`, `TestDebuggerAttachDetection`, `TestCodeInjectionDetection`, `TestThreatResponseEscalation`

### 6. Binary Protection: Compiled Rust Core and Bytecode Compilation

- **File:** `usbvault-crypto/src/ffi/ios.rs`
- **File:** `usbvault-crypto/src/ffi/android.rs`
- **Control:** Critical application logic MUST be protected against reverse engineering through compilation to native code and bytecode, rather than shipping as readable source.
- **Implementation:**
  - All cryptographic operations reside in Rust native libraries (`.dylib` iOS, `.so` Android) compiled from `usbvault-crypto`
  - React Native JavaScript compiled to Hermes bytecode (binary format, not readable JS)
  - Terser minification with `console.*` stripping in production builds
  - Symbol stripping applied to release native binaries
  - FFI boundary validates all inputs before crossing into Rust (null checks, length validation, format checks)
- **Test coverage:** Rust unit tests in `usbvault-crypto/tests/`, FFI integration tests for each platform

### 7. Privacy Controls: Zero-Knowledge Architecture and Metadata Reduction

- **File:** `usbvault-app/src/services/security/metadataReductionService.ts`
- **File:** `usbvault-app/src/services/security/privacyModes.ts`
- **File:** `usbvault-app/src/services/security/forensics.ts`
- **Control:** The application MUST minimize collection and exposure of user PII and metadata, supporting configurable privacy tiers up to full anonymity.
- **Implementation:**
  - Zero-knowledge architecture: server processes only encrypted blobs, never plaintext
  - Metadata reduction: timestamps truncated to hour granularity, client version strings removed from sync payloads, device identifiers anonymized
  - Privacy modes: Standard (default telemetry), Enhanced (reduced metadata), Ghost (zero telemetry, Tor-compatible)
  - Forensics cleanup: secure memory wiping, file shredding (multi-pass overwrite), temporary file cleanup
  - Self-destruct capability via `selfDestructService.ts` for emergency vault destruction
- **Test coverage:** `metadataReductionService.test.ts` -- `TestTimestampTruncation`, `TestDeviceIdAnonymization`; `privacyModes.test.ts` -- `TestGhostModeDisablesAllTelemetry`; `forensics.test.ts` -- `TestSecureMemoryWipe`, `TestMultiPassFileShred`

### 8. Network Transport: TLS Enforcement with ATS and NSC

- **File:** `usbvault-server/internal/middleware/security.go`
- **File:** `usbvault-app/src/services/security/certificatePinning.ts`
- **Control:** All network communication MUST use TLS 1.2+ with forward secrecy. Cleartext HTTP MUST be blocked at the platform level.
- **Implementation:**
  - iOS: App Transport Security (ATS) enabled with no exceptions -- enforces TLS 1.2+, forward secrecy, and certificate validity
  - Android: Network Security Config (NSC) sets `cleartextTrafficPermitted="false"` for all domains
  - Server: HTTPS redirect middleware, `Strict-Transport-Security` header (1 year, includeSubDomains)
  - Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy`
  - End-to-end encryption: all vault data encrypted client-side before any network transmission
- **Test coverage:** `security_test.go` -- `TestHTTPSRedirect`, `TestHSTSHeader`, `TestSecurityHeadersPresent`

---

## Additional Security Properties

### SRP-6a Zero-Knowledge Authentication

- **Files:** `usbvault-server/internal/auth/srp.go`, `usbvault-crypto/src/srp_client.rs`
- **Control:** User passwords are never transmitted over the network. The SRP-6a protocol proves knowledge of the password without revealing it, using 3072-bit group parameters per RFC 5054.
- **Security:** Eliminates the password-in-transit attack vector entirely. The server stores only the SRP verifier, not a password hash.

### FIDO2/WebAuthn Multi-Factor Authentication

- **Files:** `usbvault-app/src/services/fido2Service.ts`, `usbvault-server/internal/auth/fido2.go`
- **Control:** Hardware security key authentication (WebAuthn Level 2) with origin binding, challenge-response, and attestation verification.
- **Security:** Phishing-resistant second factor. Multiple authenticators supported per account for redundancy.

### Key Hierarchy and Cryptographic Architecture

- **Files:** `usbvault-app/src/services/keyHierarchy.ts`, `usbvault-crypto/src/kdf.rs`, `usbvault-crypto/src/cipher.rs`
- **Control:** Master key derived from user password via Argon2id. Per-vault keys derived from master key. XChaCha20-Poly1305 for symmetric encryption. X25519 for key exchange. ML-KEM for post-quantum hybrid encapsulation.
- **Security:** Compromise of a single vault key does not expose other vaults. Post-quantum readiness via ML-KEM hybrid scheme.

---

## Gate Verdict

All eight security controls pass verification. Phase 9 mobile security and platform hardening is approved for merge.
