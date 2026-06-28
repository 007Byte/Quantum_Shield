# Quantum_Shield — Release Notes Template

Use this template for "What's New" text on both Apple App Store and Google Play Store.
Apple allows 4000 characters. Google Play allows 500 characters.

---

## Template Structure

```
[CATEGORY EMOJI] [Category Header]
- Specific change or improvement
- Specific change or improvement

[CATEGORY EMOJI] [Category Header]
- Specific change or improvement
```

### Category Headers

Use these standard categories (include only those relevant to the release):

- **New** — Net-new features and capabilities
- **Improved** — Enhancements to existing features
- **Fixed** — Bug fixes
- **Security** — Security patches, encryption updates, vulnerability fixes
- **Performance** — Speed, memory, and efficiency improvements

---

## Example: v1.0.0 — Initial Release

### App Store (What's New)

```
Welcome to Quantum_Shield v1.0.0 — portable encrypted file storage with intelligence-grade security.

NEW
- XChaCha20-Poly1305 + AES-256-GCM-SIV dual-layer encryption
- Post-Quantum Cryptography (ML-KEM-1024) protection
- Argon2id key derivation with 64 MB memory hardening
- FIDO2/WebAuthn hardware security key support
- 23 zero-trace forensic cleaners
- Built-in encrypted password manager
- End-to-end encrypted messaging
- Shamir's Secret Sharing vault recovery
- Multi-language support: English, Spanish, French, German

AVAILABLE PLANS
- Free: 1 vault, 100 MB — full encryption, no ads
- Individual: 5 vaults, 10 GB
- Team: 50 vaults, 100 GB
- Enterprise: Unlimited vaults, 1 TB

Your files. Your key. Zero trace.
```

### Google Play (What's New — 500 char limit)

```
Quantum_Shield v1.0.0 — Initial Release

- Dual-layer encryption: XChaCha20-Poly1305 + AES-256-GCM-SIV
- Post-Quantum Cryptography (ML-KEM-1024)
- FIDO2/WebAuthn hardware key support
- 23 zero-trace forensic cleaners
- Encrypted password manager
- End-to-end encrypted messaging
- Shamir's Secret Sharing recovery
- 4 languages: EN, ES, FR, DE
- Free tier: 1 vault, 100 MB, no ads
```

---

## Example: v1.1.0 — Feature Update

### App Store (What's New)

```
Quantum_Shield v1.1.0

NEW
- Biometric unlock: Use Face ID or Touch ID to open your vault
- Vault health dashboard: See encryption strength, storage usage, and key rotation status at a glance

IMPROVED
- File browser now supports grid and list view toggle
- Faster vault mounting on USB 3.0+ drives
- Password manager search is now instant for vaults with 1000+ entries

FIXED
- Resolved an issue where clipboard clearing could be delayed on certain macOS versions
- Fixed a rare crash when disconnecting during an active file transfer

SECURITY
- Updated Argon2id parameters to align with latest OWASP recommendations
- Patched a low-severity timing side-channel in key comparison routines
```

### Google Play (What's New — 500 char limit)

```
Quantum_Shield v1.1.0

New: Biometric unlock (fingerprint/face), Vault health dashboard
Improved: Grid/list view toggle, faster USB 3.0+ mounting, instant password search
Fixed: Clipboard clearing delay, rare disconnect crash
Security: Updated Argon2id parameters, patched timing side-channel
```

---

## Guidelines

1. Lead with the most impactful change — the thing users will care about most.
2. Keep language concrete. Say what changed, not that "various improvements" were made.
3. For security updates, state what was fixed without providing exploitation details.
4. Never include internal ticket numbers, code references, or developer jargon.
5. Google Play limit is strict at 500 characters — prioritize ruthlessly.
6. Test character counts before submission. Overlength text is silently truncated.
