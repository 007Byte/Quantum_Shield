# USBVault Privacy Policy

**Effective Date:** March 12, 2026
**Version:** 1.0.0

---

## 1. Introduction

USBVault ("we," "us," or "our") operates a zero-knowledge encrypted vault application ("Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service across iOS, Android, and Web platforms.

We are committed to protecting your privacy. Our zero-knowledge architecture means we **cannot** access, read, or decrypt your vault contents at any time.

---

## 2. Information We Collect

### 2.1 Account Information
- **Email address** — used for account creation, authentication, and essential communications.
- **Hashed authentication verifier** — generated via SRP-6a zero-knowledge protocol. Your password is **never transmitted** to our servers.

### 2.2 Encrypted Vault Data
- All files and data you store in USBVault are encrypted client-side using **XChaCha20-Poly1305** or **AES-256-GCM-SIV** with keys derived via **Argon2id**.
- We store only encrypted blobs. We **cannot** read, access, or decrypt your vault contents.
- Encryption keys never leave your device.

### 2.3 Subscription and Billing Information
- If you subscribe to a paid plan (Pro or Enterprise), payment processing is handled by **Stripe, Inc.**
- We do **not** store your full credit card number. Stripe provides us with a tokenized reference, your card's last four digits, and expiration date for display purposes only.

### 2.4 Crash Reports and Diagnostics (Optional)
- If you opt in, we collect anonymous crash reports and diagnostic data via **Sentry**.
- Crash reporting is **disabled by default** and can be toggled on or off at any time in your privacy settings.
- Crash reports do not contain vault contents, passwords, or encryption keys.

### 2.5 Usage Analytics (Optional)
- Analytics are **disabled by default**.
- If enabled, we collect anonymized usage patterns (e.g., feature usage frequency) to improve the Service.
- Analytics data is never linked to your vault contents.

### 2.6 Audit Logs
- The Service generates local audit logs of security-relevant events (e.g., login, encrypt, decrypt, share actions).
- Audit logs are stored locally on your device and optionally synced in encrypted form.

### 2.7 Information We Do NOT Collect
- Your master password (never transmitted or stored thanks to SRP-6a)
- Your decrypted vault contents
- Your encryption keys
- Biometric data (processed locally on-device only)

---

## 3. How We Use Information

We use the information we collect to:
- Provide, maintain, and improve the Service
- Process your subscription and billing
- Send essential account-related communications (e.g., password reset, security alerts)
- Diagnose and fix technical issues (if crash reporting is enabled)
- Comply with legal obligations
- Protect against fraud and abuse

We do **not** sell, rent, or share your personal information with third parties for advertising purposes.

---

## 4. Data Retention

| Data Type | Retention Period |
|---|---|
| Account information (email, auth verifier) | Until you delete your account |
| Encrypted vault blobs | Until you delete the files or your account |
| Audit logs | 90 days, then automatically purged |
| Crash reports (if opted in) | 90 days |
| Billing records | As required by law (typically 7 years for tax purposes) |

Upon account deletion, we permanently erase your account information and all associated encrypted vault data within 30 days.

---

## 5. Your Rights

### 5.1 Under GDPR (European Economic Area)
You have the right to:
- **Access** — Request a copy of your personal data
- **Rectification** — Correct inaccurate personal data
- **Erasure** — Request deletion of your personal data ("right to be forgotten")
- **Data Portability** — Receive your data in a structured, machine-readable format
- **Object** — Object to processing of your personal data
- **Restrict Processing** — Request restriction of processing your personal data
- **Withdraw Consent** — Withdraw consent for optional data processing (e.g., crash reports, analytics)

### 5.2 Under CCPA (California)
You have the right to:
- **Know** — Know what personal information is collected, used, shared, or sold
- **Delete** — Request deletion of personal information
- **Opt-Out** — Opt out of the sale of personal information (we do not sell personal information)
- **Non-Discrimination** — Not be discriminated against for exercising your privacy rights

### 5.3 Exercising Your Rights
To exercise any of these rights, contact us at **privacy@usbvault.io**. We will respond within 30 days (or sooner if required by applicable law).

You may also delete your account and all associated data directly from the Settings screen within the app.

---

## 6. Third-Party Services

We use the following third-party services:

| Service | Purpose | Data Shared | Privacy Policy |
|---|---|---|---|
| **Stripe, Inc.** | Payment processing | Email, billing address, payment method | [stripe.com/privacy](https://stripe.com/privacy) |
| **Sentry** | Crash reporting (opt-in only) | Anonymous crash data, device info | [sentry.io/privacy](https://sentry.io/privacy) |

We do not use third-party advertising networks, tracking pixels, or social media analytics.

---

## 7. Security

USBVault employs a **zero-knowledge architecture**:

- **End-to-end encryption**: All vault data is encrypted on your device before transmission. We never possess your decryption keys.
- **SRP-6a authentication**: Your password is never transmitted to our servers. Authentication uses a zero-knowledge proof.
- **Argon2id key derivation**: Your master password is strengthened against brute-force attacks using Argon2id.
- **XChaCha20-Poly1305 / AES-256-GCM-SIV**: Industry-leading authenticated encryption algorithms protect your data.
- **Digital signatures**: Vault and identity operations are signed with **Ed25519**.
- **Post-Quantum Cryptography**: Optional ML-KEM-1024 key encapsulation provides resistance to future quantum computing threats. Post-quantum digital signatures (ML-DSA-87) are on our roadmap and are not yet active.
- **TLS 1.3**: All network communications are encrypted in transit.

Because of our zero-knowledge design, **we cannot access your vault contents even if compelled by a court order**. We can only provide encrypted blobs that are cryptographically unusable without your master password.

---

## 8. Children's Privacy

USBVault is not intended for use by children under the age of 13 (or the applicable age of digital consent in your jurisdiction). We do not knowingly collect personal information from children under 13.

If we learn that we have collected personal information from a child under 13, we will promptly delete that information. If you believe a child under 13 has provided us with personal information, please contact us at **privacy@usbvault.io**.

---

## 9. International Data Transfers

Your information may be transferred to and processed in countries other than your country of residence. When we transfer data internationally, we ensure appropriate safeguards are in place, including:

- **Standard Contractual Clauses (SCCs)** approved by the European Commission
- Compliance with applicable data protection laws

By using the Service, you consent to the transfer of your information as described in this Privacy Policy.

---

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. When we make material changes:

- We will update the "Effective Date" at the top of this policy
- We will notify you via in-app notification and/or email
- We will increment the policy version number
- Continued use of the Service after changes constitutes acceptance of the updated policy

We encourage you to review this Privacy Policy periodically.

---

## 11. Contact Us

If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, contact us at:

**Email:** privacy@usbvault.io

**Data Protection Officer:**
USBVault Privacy Team
privacy@usbvault.io

---

*This Privacy Policy is effective as of March 12, 2026.*
