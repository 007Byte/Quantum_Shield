# Quantum_Shield — Frequently Asked Questions

## General

### What is USBVault?
Quantum_Shield is a portable encrypted file storage system. It encrypts files on a USB drive using military-grade cryptography (XChaCha20-Poly1305 or AES-256-GCM-SIV) so that your data remains secure even if the USB drive is lost, stolen, or seized.

### Who is USBVault for?
USBVault is designed for security-conscious professionals, government agencies, intelligence operatives, journalists, and anyone who needs untraceable encrypted storage that resists physical seizure, forensic analysis, and future quantum computing attacks.

### What platforms does USBVault support?
- **Web**: Any modern browser (Chrome, Firefox, Safari, Edge)
- **Desktop**: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+, Fedora 35+, Arch)
- **Mobile**: iOS 15+ and Android 12+ (coming in V4.0)

### Is USBVault open source?
The cryptographic engine (Rust) is open for audit. The application and server components are proprietary.

---

## Security

### What encryption does USBVault use?
- **Default cipher**: XChaCha20-Poly1305 (256-bit key, 24-byte nonce)
- **FIPS option**: AES-256-GCM-SIV (for compliance environments)
- **Key derivation**: Argon2id (64 MiB memory, 3 iterations, 4 lanes)
- **Post-quantum**: ML-KEM-1024 hybrid key encapsulation (FIPS 203)
- **Integrity**: HMAC-SHA256 on vault headers and index

### Can USBVault protect against quantum computers?
Yes. USBVault uses a hybrid encryption scheme combining classical X25519 with post-quantum ML-KEM-1024 (FIPS 203). Your data is protected as long as either scheme remains unbroken.

### What happens if I forget my password?
USBVault uses zero-knowledge architecture — we never see your password. If you generated recovery codes during vault creation, you can use one to regain access. Without recovery codes, a forgotten password means permanent data loss. This is by design — it ensures no one (including us) can access your data.

### Does USBVault store my password?
No. USBVault uses SRP-6a (Secure Remote Password) for authentication. Your password never leaves your device — not even a hash is transmitted. The server stores only a mathematical verifier that cannot be reversed into your password.

### What is Zero-Trace mode?
Zero-Trace cleans 23+ categories of forensic artifacts from the host computer after you use your vault. This includes temp files, thumbnail caches, recent file lists, clipboard contents, and more. It ensures no evidence of your vault usage remains on the host machine.

### Can law enforcement access my data?
USBVault is designed so that no one — including USBVault Inc. — can decrypt your data. We have no master keys, no backdoors, and no access to your password. If compelled, we can only provide encrypted data that is computationally infeasible to decrypt.

---

## Usage

### How do I set up a new USB drive?
1. Insert a USB drive (8 GB minimum recommended)
2. Open USBVault and go to **Setup USB**
3. Select the drive and security level
4. Set a strong master password
5. Save your recovery codes in a secure location
6. The drive will be provisioned with the dual-partition layout

### How do I add files to my vault?
1. Unlock your vault with your password
2. Go to **Encrypt & Store**
3. Drag and drop files or click to browse
4. Files are encrypted and stored in the vault automatically

### How do I access encrypted files?
1. Unlock your vault
2. Go to **Decrypt & Export**
3. Select files to decrypt
4. Files are decrypted to a temporary secure viewer (auto-wipes after 90 seconds)

### Can I share encrypted files?
Yes. USBVault supports secure file sharing with end-to-end encryption. The recipient must also have USBVault. Files are shared using public-key cryptography — only the intended recipient can decrypt.

### What is the Password Manager?
USBVault includes a built-in encrypted password manager. Passwords are stored inside your vault using the same encryption as files. Supports import from CSV, 1Password, LastPass, Bitwarden, and KeePass formats.

---

## Billing & Plans

### What plans are available?
- **Free**: 1 GB encrypted storage, 1 vault, basic features
- **Pro**: 50 GB storage, unlimited vaults, priority support
- **Enterprise**: 500 GB storage, team management, admin controls, compliance reporting

### Can I change plans?
Yes. Upgrade or downgrade at any time from **Settings → Billing**. Upgrades take effect immediately. Downgrades are scheduled for the end of the current billing period.

### What payment methods are accepted?
We accept all major credit and debit cards via Stripe. Enterprise customers can arrange invoice billing.

---

## Troubleshooting

### My vault won't unlock
- Verify you're entering the correct password (check caps lock)
- If FIDO2 is required, ensure your security key is connected
- Try recovery codes if available
- Check that the USB drive is properly connected and the SECURE partition is mounted

### The app says "Offline"
USBVault works offline for basic vault operations. Cloud sync, billing, and sharing features require an internet connection. The app will automatically reconnect when connectivity is restored.

### USB drive not detected
- Try a different USB port
- On macOS: check System Information → USB
- On Windows: check Device Manager → Disk drives
- On Linux: run `lsblk` to see connected drives
- Ensure the USB Companion service is running

### How do I report a security issue?
Email security@usbvault.io with details. We follow responsible disclosure with a 48-hour acknowledgment SLA. See SECURITY.md for our full vulnerability disclosure policy and bug bounty program.
