# Quantum_Shield -- Encryption Export Compliance (ECCN Self-Classification)

**Product:** Quantum_Shield
**Version:** 1.0
**Last updated:** 2026-03-15
**Prepared by:** USBVault Security Engineering

---

## 1. Purpose

This document provides the ECCN (Export Control Classification Number)
self-classification for Quantum_Shield under the U.S. Export
Administration Regulations (EAR), administered by the Bureau of Industry
and Security (BIS). It inventories all cryptographic algorithms used in
the product and identifies the applicable license exception.

---

## 2. Product Description

Quantum_Shield is a consumer/enterprise file encryption application
that allows users to encrypt files on USB storage devices and in cloud
vaults. The product is available to the general public via the Apple App
Store and Google Play Store.

The encryption functionality is integral to the product's primary purpose
(data protection). The product does not perform any government- or
military-specific functions.

---

## 3. Cryptographic Algorithm Inventory

| Algorithm | Standard | Key Length | Purpose | Cipher ID |
|-----------|----------|------------|---------|-----------|
| XChaCha20-Poly1305 | IETF draft-irtf-cfrg-xchacha | 256-bit key, 192-bit nonce | Default symmetric encryption of vault contents | 2 |
| AES-256-GCM-SIV | NIST FIPS 197, RFC 8452 | 256-bit | Alternative symmetric encryption of vault contents | 3 |
| ML-KEM-1024 | NIST FIPS 203 (2024) | 256-bit shared secret | Post-quantum key encapsulation (optional, hybrid mode) | N/A |
| Argon2id | RFC 9106, OWASP recommended | 256-bit derived key | Key derivation from user password (64 MB memory, 3 iterations) | N/A |
| Ed25519 | IETF RFC 8032 | 256-bit | Digital signatures (JWT signing, key attestation) | N/A |
| X25519 | IETF RFC 7748 | 256-bit | Elliptic-curve Diffie-Hellman key exchange (vault sharing) | N/A |
| HMAC-SHA256 | NIST FIPS 198-1 | 256-bit | Message authentication and integrity verification | N/A |
| HKDF-SHA256 | IETF RFC 5869 | 256-bit | Key derivation (sub-key generation from master key) | N/A |
| SRP-6a | RFC 5054 | 2048-bit group | Zero-knowledge password authentication (password never transmitted) | N/A |
| TLS 1.3 | IETF RFC 8446 | Various | Transport encryption (all client-server communication) | N/A |

### Implementation Details

- **Rust crypto core:** All symmetric encryption, KDF, and signing
  operations are implemented in a Rust library (`usbvault-crypto`) compiled
  as a native module. The Rust code calls well-audited crates: `aes-gcm-siv`,
  `chacha20poly1305`, `argon2`, `ed25519-dalek`, `x25519-dalek`, `hkdf`,
  `hmac`, `sha2`.
- **ML-KEM-1024:** Post-quantum key encapsulation via the `ml-kem` crate,
  implementing NIST FIPS 203. Used in optional hybrid mode alongside X25519.
- **TLS 1.3:** Provided by the operating system and/or the `rustls` library.
  Certificate pinning is enforced application-side.
- **No custom cryptography:** All algorithms are standard, published,
  peer-reviewed constructions. No proprietary or novel cryptographic
  algorithms are used.

---

## 4. ECCN Classification

### Self-Classification: ECCN 5D002.c.1

The product is classified under:

- **Category 5, Part 2** -- Information Security
- **5D002.c.1** -- Software employing symmetric algorithms with key lengths
  exceeding 56 bits (AES-256, XChaCha20-256)

### Applicable License Exception: EAR 740.17(b)(1)

Quantum_Shield qualifies for License Exception ENC under
**15 CFR 740.17(b)(1)** -- mass-market encryption software -- for the
following reasons:

1. **Generally available to the public** -- The product is sold or provided
   free of charge via public app stores (Apple App Store, Google Play)
   with no restriction on who may download it.

2. **Cryptographic functionality cannot easily be changed by the user** --
   The encryption algorithms are compiled into a native Rust binary. Users
   cannot modify, replace, or reconfigure the cryptographic implementations.

3. **Not designed for government or military end-use** -- The product is
   a general-purpose consumer/enterprise file encryption tool.

4. **Not a network infrastructure product** -- The product is an end-user
   application, not a router, switch, firewall, or network infrastructure
   component.

5. **Substantial non-cryptographic functionality is not required** under
   740.17(b)(1) for mass-market encryption software, but USBVault also
   provides file management, vault organization, password management,
   and collaboration features.

---

## 5. BIS Notification Requirements

Under EAR 740.17(b)(1), a **self-classification report** must be submitted
to BIS and the ENC Encryption Request Coordinator at NSA. The report is
submitted via email to:

- **BIS:** crypt@bis.doc.gov
- **ENC Encryption Request Coordinator:** enc@nsa.gov

### Required Information for the Report

| Field | Value |
|-------|-------|
| Product name | Quantum_Shield |
| Model/version | 1.0 |
| Manufacturer | USBVault Inc. |
| ECCN | 5D002.c.1 |
| Authorization | 740.17(b)(1) |
| Encryption algorithms | AES-256-GCM-SIV, XChaCha20-Poly1305, ML-KEM-1024, Argon2id, Ed25519, X25519, HMAC-SHA256, HKDF-SHA256 |
| Key lengths | 256-bit (symmetric), 2048-bit (SRP group), 256-bit (ECC) |
| Product type | Mobile/desktop application |
| Product availability | Public app stores, unrestricted download |

### Filing Deadline

The self-classification report must be filed by the **end of the
semi-annual reporting period** (June 30 or December 31) following the
first export (app store availability).

---

## 6. Embargo and Sanctions Compliance

Quantum_Shield must not be made available to persons, entities, or
countries subject to U.S. sanctions. The following controls apply:

- **Denied Persons List (DPL):** Screen against BIS Denied Persons List
- **Entity List:** Screen against BIS Entity List
- **SDN List:** Screen against OFAC Specially Designated Nationals List
- **Embargoed countries (EAR 746):** Cuba, Iran, North Korea, Syria, and
  the Crimea/Donetsk/Luhansk regions of Ukraine

App store distribution inherently restricts availability in most embargoed
countries, as Apple and Google enforce their own embargo controls.

---

## 7. Open Source Considerations

The cryptographic implementations use open-source Rust crates published
on crates.io. Open-source encryption source code that is publicly available
is classified as **ECCN 5D002** but is eligible for the **publicly available
exclusion** under EAR 734.7(a) and 742.15(b). Since USBVault's own source
code is proprietary (not publicly available), the mass-market exception
under 740.17(b)(1) is the appropriate authorization rather than the
publicly available exclusion.

---

## 8. Annual Review

This classification must be reviewed:
- When new cryptographic algorithms are added
- When key lengths change
- When the product's distribution model changes
- At minimum annually

---

## Revision History

| Date | Change |
|------|--------|
| 2026-03-15 | Initial ECCN self-classification |
