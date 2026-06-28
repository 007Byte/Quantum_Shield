# DOC-005: Quantum_Shield -- Product Specification

| Field | Value |
|-------|-------|
| **Document ID** | DOC-005 |
| **Version** | 2.0 |
| **Date** | 2026-03-18 |
| **Classification** | Internal -- Product |
| **Audience** | Product managers, stakeholders, sales engineers, investors |

---

## Table of Contents

1. [Product Vision and Positioning](#1-product-vision-and-positioning)
2. [Target Market and Personas](#2-target-market-and-personas)
3. [Product Architecture](#3-product-architecture)
4. [Feature Matrix by Tier](#4-feature-matrix-by-tier)
5. [Security Capabilities](#5-security-capabilities)
6. [Platform Support](#6-platform-support)
7. [Encryption at a Glance](#7-encryption-at-a-glance)
8. [Zero-Trace Privacy](#8-zero-trace-privacy)
9. [USB Experience](#9-usb-experience)
10. [Cloud Features](#10-cloud-features)
11. [FIDO2 Hardware Key Support](#11-fido2-hardware-key-support)
12. [Crypto Classroom](#12-crypto-classroom)
13. [Quality and Testing](#13-quality-and-testing)
14. [Roadmap](#14-roadmap)
15. [Competitive Differentiation](#15-competitive-differentiation)

---

## 1. Product Vision and Positioning

### Mission Statement

Carry sensitive files in your pocket, plug into any computer running Windows, macOS, or Linux, access your files with a password, and walk away leaving zero evidence you were ever there.

### Company Promise

USBVault was engineered to the operational standards demanded by intelligence professionals -- and made accessible to everyone who needs that level of protection.

### Guiding Principles

| Principle | Status | Description |
|-----------|--------|-------------|
| **PORTABLE** | TRUE | No installation. Runs from USB via double-click launcher. Portable Node.js bundled. |
| **SECURE** | TRUE | Argon2id (64 MiB) + XChaCha20-Poly1305 / AES-256-GCM-SIV. Rust crypto core. |
| **INVISIBLE** | TRUE | SECURE partition unmounted and hidden. Encrypted filenames in AEAD chunks. |
| **RESILIENT** | TRUE | Dual-index atomic commits. Monotonic commit counter. State version rollback protection. |
| **SIMPLE** | TRUE | Double-click launcher, enter password, done. No technical knowledge required. |
| **ZERO TRACE** | TRUE | 23 forensic artifact cleaners. Auto-clean on eject. Restart advisory. |
| **ZERO TRUST** | PARTIAL | Wrapped MEK architecture. Cloud split-key planned for V3.0. |
| **PQC COMPLIANT** | TRUE | ML-KEM-1024 + X25519 hybrid. Feature-gated in Rust. Quantum-resistant. |

---

## 2. Target Market and Personas

### Primary Segments

| Segment | Use Case | Key Need |
|---------|----------|----------|
| **Intelligence & Defense** | Field agents carrying classified material | Zero-trace, self-destruct, plausible deniability |
| **Government Personnel** | Secure inter-agency file transfer | FIPS compliance, audit trail, hardware key enforcement |
| **Journalists** | Protecting sources and unpublished stories | Privacy, portability, resistance to device inspection |
| **Legal Professionals** | Attorney-client privileged documents | Compliance, sharing, audit trail |
| **Medical Professionals** | HIPAA-compliant patient data transport | Encryption, access controls, audit log |
| **Corporate Executives** | Board documents, M&A materials, IP protection | Team sharing, enterprise management, multi-device sync |
| **Privacy-Conscious Citizens** | Personal documents, financial records, passwords | Ease of use, strong encryption, no account required (USB-only) |

### Persona: The Field Operative

- Uses USB-only mode (air-gapped)
- Requires zero-trace cleanup after every session
- Needs self-destruct on failed password attempts
- Values plausible deniability (hidden partition)
- Future need: steganographic embedding

### Persona: The Corporate IT Admin

- Deploys USBVault across organization
- Needs centralized audit trails
- Requires FIDO2 hardware key enforcement
- Manages bulk USB provisioning
- Values compliance reporting

### Persona: The Individual User

- Wants a simple way to encrypt personal files
- Uses free or individual tier
- Values ease of use over advanced features
- May upgrade for password manager and sharing

---

## 3. Product Architecture

### High-Level Overview

USBVault is built on four subsystems designed for zero-knowledge security:

| Subsystem | Technology | Role |
|-----------|-----------|------|
| **Crypto Core** | Rust | All encryption/decryption (runs on user's device) |
| **Application** | React Native (Expo 54) | Cross-platform UI (iOS, Android, Web) |
| **Server** | Go | Authentication, sync, sharing, billing |
| **USB Companion** | Node.js | Local USB hardware bridge |

### Dual Operating Modes

**USB-Only Mode**: Everything runs locally. No server, no internet, no account. Maximum privacy.

**Cloud-Connected Mode**: Full-featured with sync, sharing, backup, and billing. Server only stores encrypted data.

---

## 4. Feature Matrix by Tier

| Feature | Free | Individual | Team | Enterprise |
|---------|------|-----------|------|-----------|
| **Vaults** | 1 | 5 | 50 | Unlimited |
| **Storage** | 100 MB | 10 GB | 100 GB | 1 TB |
| **Ciphers** | AES-256-GCM | AES-256-GCM-SIV, XChaCha20-Poly1305, ML-KEM-1024 | All | All |
| **USB Encryption** | Yes | Yes | Yes | Yes |
| **Zero-Trace Cleanup** | Yes | Yes | Yes | Yes |
| **Password Manager** | 10 entries | Unlimited | Unlimited | Unlimited |
| **FIDO2 Hardware Key** | No | Yes | Yes | Yes |
| **File Sharing** | No | No | Yes | Yes |
| **Multi-Device Sync** | No | Yes | Yes | Yes |
| **Audit Log** | No | No | Yes | Yes |
| **Compliance Export** | No | No | No | Yes |
| **Anomaly Detection** | No | No | No | Yes |
| **Priority Support** | No | No | No | Yes |
| **RBAC** | No | No | Yes | Yes |
| **Key Rotation** | No | No | No | Yes |
| **Cloud Backup** | No | Yes | Yes | Yes |
| **Biometric Unlock** | Yes | Yes | Yes | Yes |
| **App Password** | Yes | Yes | Yes | Yes |
| **Auto-Lock** | Yes | Yes | Yes | Yes |

---

## 5. Security Capabilities

### 12 Defense Layers

| # | Layer | Description (Plain English) |
|---|-------|----------------------------|
| 1 | **Steganographic Delivery** | (Planned) Hide your vault inside a normal-looking photo or audio file |
| 2 | **Hardware Key** | Require a physical security key (like YubiKey) to unlock |
| 3 | **Cloud Split-Key** | (Planned) Split your key between your device and the cloud -- neither alone can decrypt |
| 4 | **Military-Grade Encryption** | Each file chunk is individually encrypted and authenticated |
| 5 | **Memory-Hard Password** | Your password is processed through 64 MB of memory, making brute-force attacks impractical |
| 6 | **Memory Protection** | Encryption keys are locked in memory and securely erased after use |
| 7 | **Hidden Partition** | Your encrypted files live on a hidden partition that is invisible to casual inspection |
| 8 | **Hidden Files** | Even within the hidden partition, vault files have hidden attributes |
| 9 | **Encrypted Filenames** | File names are encrypted alongside file contents -- no metadata leakage |
| 10 | **Zero-Trace Cleanup** | 23 forensic artifact cleaners remove evidence of your activity |
| 11 | **App Password** | A secondary password protects the app itself before you reach the vault |
| 12 | **Crash-Safe Storage** | Dual-index atomic commits ensure your data survives power failures |

---

## 6. Platform Support

### Cross-Platform Matrix

| Platform | Status | Distribution | Notes |
|----------|--------|-------------|-------|
| **Web** | Production | Expo web export | Full feature set via WebCrypto |
| **macOS** | Production | USB launcher / App Store | Native biometric support (Touch ID, Face ID) |
| **Windows** | Production | USB launcher | FIDO2 via Windows Hello |
| **Linux** | Production | USB launcher | Tested on Ubuntu, Fedora |
| **iOS** | Production | App Store (EAS Build) | Face ID, Keychain storage |
| **Android** | Production | Google Play (EAS Build) | Fingerprint, EncryptedSharedPreferences |

### USB Companion Platform Support

| Operation | macOS | Windows | Linux |
|-----------|-------|---------|-------|
| USB detection | diskutil | PowerShell | lsblk |
| Partitioning | diskutil | PowerShell | parted |
| Mount/Unmount | diskutil | PowerShell | udisksctl |
| Eject | diskutil | PowerShell (10-step) | udisksctl |
| File hiding | chflags | attrib +H +S | Unmount |

---

## 7. Encryption at a Glance

### What Protects Your Files

**Argon2id**: Your password goes through a process that uses 64 MB of memory and takes about a second. This makes it impractical for an attacker to guess your password, even with specialized hardware.

**XChaCha20-Poly1305**: Each piece of your file is encrypted with a unique key and authenticated so that any tampering is detected. This is the same class of algorithm used by Google, Cloudflare, and other security leaders.

**AES-256-GCM-SIV**: An alternative encryption algorithm that is FIPS-certified for organizations with government compliance requirements.

### Post-Quantum Readiness

USBVault combines traditional encryption (X25519) with quantum-resistant encryption (ML-KEM-1024). This hybrid approach means your data is protected even if quantum computers eventually break traditional methods. Your data is secure as long as either algorithm remains unbroken.

---

## 8. Zero-Trace Privacy

### What Gets Cleaned (23 Artifact Types)

**Windows**: Recent Items, Jump Lists, Thumbnail Cache, Shellbags, Registry MRU, Search Index, Recycle Bin, USB Volume Metadata, Session Files, Temp Artifacts, Prefetch (admin), Event Logs (admin)

**macOS**: .DS_Store files, QuickLook cache, USB metadata (.Trashes, .fseventsd, Spotlight), Recent Documents, Session files

**Linux**: recently-used.xbel, Zeitgeist DB, Thumbnail cache, USB Trash directories, Temp files, GNOME Tracker cache

### Automatic Cleanup

Zero-trace cleanup runs automatically when you click Eject. No manual steps required.

### Restart Advisory

After ejecting, USBVault recommends restarting the computer. This clears any in-memory traces that cannot be removed while the system is running.

---

## 9. USB Experience

### Double-Click Simplicity

1. Plug in the USB drive
2. Double-click the launcher on the TOOLS partition
3. Enter your password
4. You are in

No installation. No configuration. No technical knowledge required.

### Invisible Storage

The SECURE partition containing your encrypted files is:
- Unmounted and invisible in the file manager
- Hidden via OS-level file attributes
- Indistinguishable from unused disk space to casual inspection

### Universal Compatibility

The USB uses GPT partitioning with ExFAT file systems, ensuring compatibility across Windows, macOS, and Linux without additional drivers.

---

## 10. Cloud Features

### Multi-Device Sync

Keep your vault in sync across all your devices. Changes propagate in real-time via encrypted WebSocket connections.

### Encrypted File Sharing

Share files with other USBVault users using end-to-end encryption. The recipient's public key ensures only they can decrypt the shared file.

### Cloud Backup

Your encrypted vault is automatically backed up to the cloud. If your USB drive is lost or damaged, restore your vault to a new drive.

### Stripe Billing Integration

Subscription management via Stripe:
- Checkout sessions for new subscriptions
- Customer portal for self-service management
- Webhook-driven tier updates
- Upgrade, downgrade, cancel, and reactivate flows

---

## 11. FIDO2 Hardware Key Support

### Supported Hardware

- YubiKey 5 series
- Google Titan Security Key
- Any FIDO2-compliant security key
- Windows Hello (platform authenticator)
- Apple passkeys (iOS/macOS)

### How It Works

The hardware key provides a second factor through the FIDO2 PRF extension. The key's output is cryptographically bound to the encryption key, so even if your password is compromised, the vault cannot be opened without the physical key.

### Key Management

- Register multiple keys (backup key recommended)
- Remove lost keys via settings
- Recovery blob stored in vault header for emergency access

---

## 12. Crypto Classroom

### Educational Feature

The Crypto Classroom is an interactive educational tool built into USBVault. It teaches users about cryptography through hands-on demonstrations.

### Available Demos

1. **Caesar Cipher**: See how simple substitution works and why it is insecure
2. **Vigenere Cipher**: Understand polyalphabetic substitution
3. **AES Encryption**: Watch real AES encryption in action
4. **Brute-Force Visualization**: See why strong passwords matter (real-time brute-force simulation)

### Purpose

The Classroom helps users understand why strong passwords matter and what happens to their data when it is encrypted. This transparency builds trust and encourages good security practices.

---

## 13. Quality and Testing

### Test Coverage

| Subsystem | Tests | Framework | Focus Areas |
|-----------|-------|-----------|-------------|
| Rust Crypto | 234 | cargo test + proptest | AEAD, KDF, streaming, headers, Shamir, SRP, vault lifecycle |
| TypeScript App | 45 files | Jest + Playwright | Services, components, E2E |
| Go Server | 61 files | go test + testify | Auth, billing, sharing, sync, middleware |

### Total: 340 test files across 3 subsystems

### Property-Based Testing

19 proptest fuzzing tests in the Rust crypto core verify that encryption works correctly for arbitrary inputs, not just hand-picked test cases.

### Security Scanning

- `cargo audit`: Zero known vulnerabilities
- `govulncheck`: Zero known vulnerabilities
- `npm audit`: Zero known vulnerabilities

---

## 14. Roadmap

### Phase 6: V3.0 Cloud Split-Key (~10 days)

**Goal**: True zero-trust -- no single system can decrypt alone.

- Key splitting: `MASTER_KEY = HKDF(LOCAL_KEY || REMOTE_KEY)`
- Server-side key shard storage (encrypted with SRP key)
- Offline grace period with configurable TTL (default 7 days)
- Migration path for existing V4 vaults

### Phase 7: V4.0 Advanced Security (~15 days)

**Goal**: Complete the "Ghost" vision.

- **Steganographic embedding**: Hide VAULT.bin inside normal photos/audio files
- **Security tiers**: SECRET (64 MiB Argon2id), TOP-SECRET (128 MiB + FIDO2 required), PRESIDENTIAL (256 MiB + FIDO2 + split-key)
- **Duress password**: A secondary password that triggers self-destruct while showing plausible decoy data
- **Secure file viewer**: In-app preview with 90-second auto-wipe timer

### Phase 8: Launch Readiness (~5 days)

**Goal**: Ship to paying customers.

- Security audit preparation (pen test package)
- Legal and compliance (GDPR, export control for crypto software)
- USB image packaging (ISO/IMG for direct USB write)
- Support infrastructure (GitHub Issues, knowledge base, Sentry production)

---

## 15. Competitive Differentiation

### What USBVault Does That No Competitor Does

| Capability | USBVault | VeraCrypt | BitLocker | Cryptomator |
|------------|----------|-----------|-----------|-------------|
| **USB-native** (runs from USB, no install) | Yes | No (requires install) | No (Windows only) | No (requires install) |
| **Zero-trace cleanup** | 23 forensic cleaners | No | No | No |
| **Cross-platform** (Win/Mac/Linux/iOS/Android) | Yes | Win/Mac/Linux only | Windows only | Yes |
| **Hidden partition** | Yes (GPT, auto-hidden) | Yes (hidden volume) | No | No |
| **Self-destruct** | Yes (10 failed attempts) | No | No | No |
| **Post-quantum crypto** | Yes (ML-KEM-1024 hybrid) | No | No | No |
| **Zero-knowledge server** | Yes | N/A (no server) | N/A | Optional (WebDAV) |
| **FIDO2 hardware key** | Yes (PRF extension) | No | Yes (TPM) | No |
| **End-to-end sharing** | Yes (X25519 sealed boxes) | No | No | No |
| **Wrapped MEK** (O(1) password change) | Yes | No | No | No |
| **Crash-safe dual-index** | Yes | No | Journal | No |
| **Biometric unlock** | Yes (Face ID, fingerprint) | No | Windows Hello | No |
| **Built-in password manager** | Yes | No | No | No |
| **Audit trail** | Yes (tamper-evident chain) | No | Event viewer | No |

### Key Differentiators

1. **USB-Native**: No installation required. Plug in and go.
2. **Zero-Trace**: Removes forensic artifacts that competitors leave behind.
3. **Intelligence-Grade**: Self-destruct, hidden partition, encrypted filenames.
4. **Post-Quantum Ready**: Protected against future quantum computing threats.
5. **Wrapped MEK**: Change your password in under a second without re-encrypting data.
6. **Cross-Everything**: Works on every platform, every device, with or without internet.

---

## Cross-References

- **DOC-001**: Technical Specification (detailed cryptographic specifications)
- **DOC-002**: Architecture and System Design (system architecture details)
- **DOC-003**: User Manual (end-user documentation)
- **DOC-004**: IT Deployment Guide (enterprise deployment)
