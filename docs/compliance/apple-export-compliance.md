# Quantum_Shield -- Apple Export Compliance Questionnaire Answers

**Bundle ID:** com.usbvault.enterprise
**Last updated:** 2026-03-15
**Prepared by:** USBVault Security Engineering

---

## Overview

When submitting an app to App Store Connect, Apple presents an export
compliance questionnaire under **"Manage App Encryption"** in the app's
build metadata. This document records the correct answers for
Quantum_Shield.

These answers must be reviewed each time the app's cryptographic
capabilities change.

---

## Questionnaire Answers

### Question 1

**"Does your app use encryption, or does it contain or incorporate
cryptographic functionality?"**

**Answer: YES**

USBVault uses the following encryption:
- AES-256-GCM-SIV (file encryption)
- XChaCha20-Poly1305 (file encryption, default)
- ML-KEM-1024 (post-quantum key encapsulation, optional)
- Argon2id (key derivation)
- Ed25519 (digital signatures)
- X25519 (key exchange)
- HMAC-SHA256 (integrity verification)
- HKDF-SHA256 (key derivation)
- TLS 1.3 (transport security)

---

### Question 2

**"Does your app qualify for any of the exemptions provided in
Category 5, Part 2 of the U.S. Export Administration Regulations?"**

**Answer: YES**

Quantum_Shield qualifies for the exemption under
**EAR 740.17(b)(1)** -- mass-market encryption software.

Justification:
- The app is available to the general public via the App Store without
  restriction on who may download it.
- The encryption is standard (AES-256, XChaCha20) and uses published,
  peer-reviewed algorithms.
- Users cannot modify the cryptographic implementations (compiled
  native Rust binary).
- The product is not designed for government or military end-use.

---

### Question 3

**"Does your app implement or call any encryption that is proprietary
or not accepted as standard by an international standard body
(IEEE, IETF, ITU, etc.)?"**

**Answer: NO**

All cryptographic algorithms used are published international standards:
- AES: NIST FIPS 197
- GCM-SIV: RFC 8452
- XChaCha20-Poly1305: IETF draft (widely adopted, based on RFC 8439)
- ML-KEM: NIST FIPS 203
- Argon2id: RFC 9106
- Ed25519: RFC 8032
- X25519: RFC 7748
- HMAC-SHA256: NIST FIPS 198-1
- HKDF: RFC 5869
- TLS 1.3: RFC 8446

No proprietary or custom cryptographic algorithms are used.

---

### Question 4

**"Does your app implement or call any standard encryption algorithms
instead of, or in addition to, using or accessing the encryption in
Apple's operating system?"**

**Answer: YES**

USBVault includes its own cryptographic implementation via a compiled
Rust native library (`usbvault-crypto`). This library implements
AES-256-GCM-SIV, XChaCha20-Poly1305, Argon2id, Ed25519, X25519,
HMAC-SHA256, and HKDF-SHA256 using well-audited open-source Rust crates.

The app also uses Apple's operating system encryption for:
- TLS 1.3 (via URLSession / system networking stack)
- Keychain Services (for secure token storage)
- LocalAuthentication (Face ID / Touch ID, Secure Enclave)

---

### Question 5

**"Is your app going to be available on the French App Store?"**

**Answer: YES**

France requires declaration to ANSSI for products using encryption.
USBVault uses standard algorithms (AES-256, XChaCha20) that are
widely available and do not require specific ANSSI authorization
for mass-market consumer products under EU Regulation 2021/821
(Dual-Use Regulation), which aligns with the U.S. mass-market
exemption.

Note: If distributing directly to French government entities, a
separate ANSSI declaration may be required.

---

## App Store Connect Submission Steps

1. Navigate to **App Store Connect > Your App > Build > Export Compliance**
2. For the question "Does your app use encryption?": Select **Yes**
3. For the exemption question: Select **Yes** (mass-market / 740.17(b)(1))
4. For proprietary encryption: Select **No**
5. For standard encryption beyond OS-provided: Select **Yes**
6. For French App Store availability: Select **Yes**
7. Confirm and save

### Automation (Info.plist)

To skip the questionnaire on each submission, add the following to
`Info.plist`:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<true/>
<key>ITSEncryptionExportComplianceCode</key>
<string></string>
```

Note: `ITSAppUsesNonExemptEncryption` is `true` because USBVault uses
its own encryption beyond the OS-provided APIs. However, the app
qualifies for the mass-market exemption, so no ERN (Encryption
Registration Number) is needed in `ITSEncryptionExportComplianceCode`
after the BIS self-classification filing is complete.

Alternatively, once the BIS self-classification is filed, you may set:

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

This tells App Store Connect that the encryption is exempt and suppresses
the questionnaire entirely. Apple's documentation permits this when the
app qualifies under an EAR exemption.

---

## Annual Review Checklist

- [ ] Verify algorithm inventory matches current `usbvault-crypto` crate
- [ ] Confirm BIS semi-annual self-classification report is filed
- [ ] Check for changes in EAR regulations
- [ ] Review ANSSI requirements if French distribution changes
- [ ] Update this document if any answers change

---

## Revision History

| Date | Change |
|------|--------|
| 2026-03-15 | Initial export compliance questionnaire answers |
