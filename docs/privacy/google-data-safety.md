# Quantum_Shield -- Google Play Data Safety Declaration

**Package name:** com.usbvault.enterprise
**Last updated:** 2026-03-15
**Prepared by:** USBVault Security Engineering

---

## Overview

This document provides the answers to every question in the Google Play Console
**Data safety** section. USBVault is a zero-knowledge encrypted vault; the
server never receives plaintext user data.

---

## Section 1: Data Collection and Sharing Overview

### Q: Does your app collect or share any of the required user data types?

**Answer: Yes** -- the app collects a limited set of data as described below.

### Q: Is all of the user data collected by your app encrypted in transit?

**Answer: Yes.**
All network communication uses TLS 1.3 with certificate pinning.
Vault contents are encrypted client-side with AES-256-GCM-SIV or
XChaCha20-Poly1305 before any network transmission.

### Q: Do you provide a way for users to request that their data is deleted?

**Answer: Yes.**
Users can delete their account and all associated data from
Settings > Account > Delete Account. Server-side data is purged within
30 days per our data retention policy. Locally encrypted vault data is
wiped immediately.

---

## Section 2: Data Types -- Collected

### 2.1 Personal Info

| Data Type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| Name | No | -- | -- | -- |
| Email address | Yes | No | Account management, authentication (SRP-6a identifier) | Required |
| User IDs | Yes | No | Internal account identifier (UUID) | Required |
| Address | No | -- | -- | -- |
| Phone number | No | -- | -- | -- |

### 2.2 Financial Info

| Data Type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| Purchase history | Yes | No | Subscription tier management | Required |
| Credit card / bank info | No | -- | -- (Stripe handles payment; app never touches card data) | -- |

### 2.3 Location

| Data Type | Collected | Shared |
|-----------|-----------|--------|
| Approximate location | No | -- |
| Precise location | No | -- |

### 2.4 Web Browsing

| Data Type | Collected | Shared |
|-----------|-----------|--------|
| Web browsing history | No | -- |

### 2.5 Photos and Videos

| Data Type | Collected | Shared |
|-----------|-----------|--------|
| Photos | No | -- |
| Videos | No | -- |

### 2.6 Audio

| Data Type | Collected | Shared |
|-----------|-----------|--------|
| Voice or sound recordings | No | -- |
| Music files | No | -- |

### 2.7 Files and Docs

| Data Type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| Files and docs | No* | No | -- | -- |

*Files are encrypted entirely on-device before upload. The server stores
only ciphertext. Google's guidance states that data the app cannot read
(end-to-end encrypted content where the developer has no decryption key)
does not need to be declared as "collected."

### 2.8 Calendar

| Data Type | Collected | Shared |
|-----------|-----------|--------|
| Calendar events | No | -- |

### 2.9 Contacts

| Data Type | Collected | Shared |
|-----------|-----------|--------|
| Contacts | No | -- |

### 2.10 App Activity

| Data Type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| App interactions | Yes | No | Analytics (PostHog, when enabled) | Optional (opt-in) |
| In-app search history | No | -- | -- | -- |
| Installed apps | No | -- | -- | -- |
| Other user-generated content | No | -- | -- | -- |

### 2.11 App Info and Performance

| Data Type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| Crash logs | Yes | No | Stability monitoring (Sentry) | Optional (opt-in) |
| Diagnostics | Yes | No | Performance monitoring (Sentry) | Optional (opt-in) |
| Other app performance data | No | -- | -- | -- |

### 2.12 Device or Other IDs

| Data Type | Collected | Shared | Purpose | Optional |
|-----------|-----------|--------|---------|----------|
| Device ID | No | -- | -- | -- |
| Android advertising ID | No | -- | -- | -- |
| Push notification token (FCM) | Yes | No | Push notifications (when implemented) | Optional |

### 2.13 Health and Fitness

Not collected.

### 2.14 Messages

Not collected.

---

## Section 3: Data Sharing

### Q: Does your app share any user data with third parties?

**Answer: No.** No user data is shared with third parties for advertising,
marketing, analytics tied to identity, or any other purpose.

Crash reports (Sentry) and anonymized analytics (PostHog) are opt-in only
and cannot be linked to a user's identity.

---

## Section 4: Data Handling Practices

### Encryption in Transit
All data is encrypted in transit using TLS 1.3 with certificate pinning.

### Encryption at Rest
Vault contents are encrypted at rest using AES-256-GCM-SIV or
XChaCha20-Poly1305 with 256-bit keys derived via Argon2id.

### Data Deletion
Users can request deletion of their account and all associated data.
Server-side deletion completes within 30 days. Local data is deleted
immediately.

### Data Retention
- Account metadata: retained until account deletion
- Encrypted vault data: retained until account deletion
- Crash reports (if opted in): retained for 90 days
- Analytics events (if opted in): retained for 90 days, anonymized

---

## Section 5: Security Practices

### Q: Is your app a banking, financial, government, or health app?

**Answer: No.** USBVault is a security/encryption utility.

### Q: Does your app use any approved independent security standards?

The cryptographic core uses NIST-approved algorithms:
- AES-256-GCM-SIV (NIST FIPS 197)
- ML-KEM-1024 (NIST FIPS 203, post-quantum)
- Argon2id (OWASP recommended KDF)
- Ed25519 / X25519 (widely reviewed, IETF RFC 8032 / RFC 7748)

---

## Section 6: Families Policy (if applicable)

### Q: Does this app target children?

**Answer: No.** The app is not directed at children under 13. The target
audience is enterprise IT administrators and security-conscious adults.

---

## Section 7: Google Play Console Entry Summary

When filling out the Data Safety form in Google Play Console:

1. **Does your app collect or share any of the required user data types?** -- Yes
2. **Is all of the user data collected by your app encrypted in transit?** -- Yes
3. **Do you provide a way for users to request that their data is deleted?** -- Yes
4. Data types to declare:
   - Personal info > Email address (collected, not shared, required)
   - Personal info > User IDs (collected, not shared, required)
   - Financial info > Purchase history (collected, not shared, required)
   - App activity > App interactions (collected, not shared, optional/opt-in)
   - App info and performance > Crash logs (collected, not shared, optional/opt-in)
   - App info and performance > Diagnostics (collected, not shared, optional/opt-in)
   - Device or other IDs > Other (push token, collected, not shared, optional)
5. **Does your app share user data with third parties?** -- No

---

## Revision History

| Date | Change |
|------|--------|
| 2026-03-15 | Initial data safety declaration |
