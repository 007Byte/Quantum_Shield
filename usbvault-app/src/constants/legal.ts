/**
 * Legal constants — Privacy Policy and Terms of Service for in-app display.
 *
 * These are condensed, readable versions of the full legal documents
 * found in /docs/legal/. Keeping them as string constants avoids the
 * need for a markdown parser at runtime.
 */

export const PRIVACY_POLICY_VERSION = '1.0.0';
export const PRIVACY_POLICY_DATE = '2026-03-12';
export const TERMS_VERSION = '1.0.0';
export const TERMS_DATE = '2026-03-12';

export const PRIVACY_POLICY_TEXT = `PRIVACY POLICY
Effective: March 12, 2026 | Version 1.0.0

1. INTRODUCTION
USBVault operates a zero-knowledge encrypted vault application. This Privacy Policy explains how we collect, use, and safeguard your information. Our zero-knowledge architecture means we CANNOT access, read, or decrypt your vault contents at any time.

2. INFORMATION WE COLLECT

Account Information
- Email address for account creation and authentication
- Hashed authentication verifier via SRP-6a (your password is never transmitted)

Encrypted Vault Data
- All vault data is encrypted client-side using XChaCha20-Poly1305 or AES-256-GCM-SIV
- We store only encrypted blobs and cannot read your data
- Encryption keys never leave your device

Billing Information
- Payments are processed by Stripe. We do not store your full credit card number.

Crash Reports (Optional)
- If you opt in, anonymous crash reports are collected via Sentry
- Crash reporting is disabled by default and can be toggled at any time
- Crash reports never contain vault contents, passwords, or encryption keys

Analytics (Optional)
- Analytics are disabled by default
- If enabled, only anonymized usage patterns are collected

3. HOW WE USE INFORMATION
- Provide, maintain, and improve the Service
- Process subscriptions and billing
- Send essential account communications
- Diagnose technical issues (if crash reporting is enabled)
- Comply with legal obligations

We do NOT sell, rent, or share your information for advertising.

4. DATA RETENTION
- Account data: retained until you delete your account
- Encrypted vault data: retained until you delete the files or your account
- Audit logs: 90 days, then automatically purged
- Crash reports: 90 days
- Billing records: as required by law

Upon account deletion, all data is permanently erased within 30 days.

5. YOUR RIGHTS

GDPR Rights (EEA):
- Access, rectification, erasure, data portability, object, restrict processing, withdraw consent

CCPA Rights (California):
- Know, delete, opt-out of sale (we do not sell data), non-discrimination

To exercise your rights, contact privacy@usbvault.io. You may also delete your account from the Settings screen.

6. THIRD-PARTY SERVICES
- Stripe: payment processing
- Sentry: crash reporting (opt-in only)

We do not use advertising networks or tracking pixels.

7. SECURITY
- Zero-knowledge architecture: we never possess your decryption keys
- SRP-6a authentication: password never transmitted
- Argon2id key derivation for brute-force resistance
- XChaCha20-Poly1305 / AES-256-GCM-SIV authenticated encryption
- Optional post-quantum cryptography (ML-KEM-1024)
- TLS 1.3 for all network communications

We cannot access your vault contents even if compelled by court order.

8. CHILDREN'S PRIVACY
USBVault is not intended for children under 13. We do not knowingly collect information from children under 13.

9. INTERNATIONAL DATA TRANSFERS
Data may be transferred internationally with appropriate safeguards including Standard Contractual Clauses.

10. CHANGES TO THIS POLICY
Material changes will be communicated via in-app notification and/or email. Continued use after changes constitutes acceptance.

11. CONTACT
Email: privacy@usbvault.io`;

export const TERMS_OF_SERVICE_TEXT = `TERMS OF SERVICE
Effective: March 12, 2026 | Version 1.0.0

1. ACCEPTANCE OF TERMS
By using USBVault, you agree to these Terms of Service. If you do not agree, you may not use the Service.

2. ACCOUNT TERMS
- One account per individual (except Enterprise team features)
- You must provide accurate information
- You are solely responsible for your master password
- We use SRP-6a zero-knowledge authentication — we NEVER have access to your password and CANNOT reset or recover it
- You are responsible for all activity under your account

3. SUBSCRIPTION TIERS

Free: 1 GB storage, 1 vault, core encryption features
Pro: 50 GB storage, unlimited vaults, priority support, advanced sharing, auto backups
Enterprise: 500 GB storage, unlimited vaults, team management, SSO, compliance, live chat

Paid subscriptions are billed via Stripe. Cancel anytime; cancellation takes effect at end of billing period.

4. ACCEPTABLE USE
You agree NOT to:
- Store illegal content in your vault
- Use the Service for illegal activities
- Circumvent or interfere with security features
- Reverse-engineer or decompile the Service
- Distribute malware or harmful code
- Interfere with Service performance
- Use automated scripts without authorization
- Resell or redistribute the Service

5. INTELLECTUAL PROPERTY
- USBVault owns the Service, its design, code, and branding
- You retain full ownership of your vault data
- We cannot access, view, or use your data due to zero-knowledge architecture

6. LIMITATION OF LIABILITY

Zero-Knowledge Limitations:
- We CANNOT recover lost master passwords
- We CANNOT decrypt your vault data under any circumstances
- We CANNOT reverse self-destruct actions
- Data loss from lost passwords is your responsibility

Our total liability shall not exceed amounts paid in the preceding 12 months. We are not liable for indirect, incidental, special, consequential, or punitive damages.

7. TERMINATION
- You may delete your account at any time via Settings
- We may terminate accounts for Terms violations
- Inactive free accounts may be terminated after 12 months with 30 days notice
- Export your data before deletion

8. DISCLAIMER OF WARRANTIES
THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

9. GOVERNING LAW
These Terms are governed by the laws of the State of Delaware, USA. Disputes shall be resolved through binding arbitration.

10. CHANGES TO TERMS
Material changes will be communicated at least 30 days in advance. Continued use constitutes acceptance. Re-acceptance may be required for significant changes.

11. CONTACT
Email: legal@usbvault.io`;
