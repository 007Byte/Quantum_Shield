# Quantum_Shield -- Apple Privacy Nutrition Labels

**Bundle ID:** com.usbvault.enterprise
**Last updated:** 2026-03-15
**Prepared by:** USBVault Security Engineering

---

## Overview

This document provides the exact selections to make in App Store Connect under
**App Privacy > Privacy Nutrition Labels**. Apple requires developers to
self-declare every data type their app collects and how it is used.

USBVault is a zero-knowledge encrypted vault. The server never receives
plaintext user data. Authentication uses SRP-6a (zero-knowledge proof) so
passwords are never transmitted.

---

## 1. Data Used to Track You

**Declaration: No data is used to track you.**

USBVault does not participate in cross-app or cross-site tracking.
No advertising identifiers (IDFA) are read or transmitted.
No data is shared with data brokers or advertising networks.

---

## 2. Data Linked to You

The following data types are collected and can be linked to your identity.

### 2a. Contact Info

| Data Type | Purpose | Required |
|-----------|---------|----------|
| Email Address | Account creation and authentication (SRP-6a identifier) | Yes |

- **Not** used for marketing or advertising.
- **Not** shared with third parties.

### 2b. Identifiers

| Data Type | Purpose | Required |
|-----------|---------|----------|
| User ID (internal UUID) | Associate encrypted vaults with account | Yes |

### 2c. Purchases

| Data Type | Purpose | Required |
|-----------|---------|----------|
| Purchase History | Manage subscription tier (Free/Pro/Enterprise) | Yes |

- Payment processing is handled entirely by Stripe. The app never
  collects, stores, or transmits credit card numbers or bank details.
- Apple handles in-app purchase receipts; the app validates subscription
  status only.

---

## 3. Data Not Linked to You

The following data types may be collected but are not linked to your identity.

### 3a. Diagnostics

| Data Type | Purpose | Required |
|-----------|---------|----------|
| Crash Data | Stability monitoring via Sentry | No (opt-in) |
| Performance Data | App performance metrics via Sentry | No (opt-in) |

- Crash reporting is **disabled by default** and requires explicit user
  opt-in in Settings > Privacy > Crash Reporting.
- When enabled, reports are sent to a self-hosted or Sentry.io instance.
  Reports are stripped of personally identifiable information before
  transmission.

### 3b. Usage Data

| Data Type | Purpose | Required |
|-----------|---------|----------|
| Product Interaction | Feature usage analytics via PostHog | No (opt-in) |

- Analytics are **disabled by default** and require explicit user opt-in
  in Settings > Privacy > Analytics.
- When enabled, events are anonymized and cannot be linked back to the user.

---

## 4. Data Not Collected

The following data types are **never** collected by USBVault:

| Category | Data Types Not Collected |
|----------|--------------------------|
| Health & Fitness | Health, Fitness |
| Financial Info | Credit card numbers, bank accounts, other payment info (Stripe handles all payment data) |
| Location | Precise Location, Coarse Location |
| Sensitive Info | Racial/ethnic data, political opinions, religious beliefs, sexual orientation, biometric data sent off-device, genetics |
| Contacts | Contacts, Phone Number (address book is never accessed) |
| User Content | Photos, Videos, Audio, Gameplay Content, Customer Support correspondence (handled externally) |
| Browsing History | Web browsing history |
| Search History | In-app or web search history |
| Advertising Data | Advertising identifiers, ad interaction data |
| Camera / Microphone | No camera or microphone permissions requested |
| Other Data Types | Files stored in the vault are encrypted client-side; the server stores only ciphertext and never accesses plaintext content |

### Biometric Authentication (Special Note)

USBVault supports Face ID and Touch ID for local app unlock. Apple's
LocalAuthentication framework is used exclusively. **Biometric data never
leaves the device's Secure Enclave** and is never collected, transmitted,
or stored by USBVault. Per Apple's guidance, on-device-only biometric
usage does not need to be declared as "collected."

---

## 5. App Store Connect Entry Checklist

When submitting in App Store Connect, select exactly these options:

1. **"Does your app collect any of the data types listed?"** -- Yes
2. Add the following data types:
   - Contact Info > Email Address
     - Purpose: App Functionality
     - Linked to User: Yes
     - Used for Tracking: No
   - Identifiers > User ID
     - Purpose: App Functionality
     - Linked to User: Yes
     - Used for Tracking: No
   - Purchases > Purchase History
     - Purpose: App Functionality
     - Linked to User: Yes
     - Used for Tracking: No
   - Diagnostics > Crash Data
     - Purpose: App Functionality
     - Linked to User: No
     - Used for Tracking: No
   - Diagnostics > Performance Data
     - Purpose: App Functionality
     - Linked to User: No
     - Used for Tracking: No
   - Usage Data > Product Interaction
     - Purpose: Analytics
     - Linked to User: No
     - Used for Tracking: No

3. **"Does your app or third-party SDK use data for tracking?"** -- No

---

## 6. Third-Party SDKs

| SDK | Data Collected | Linked | Tracking |
|-----|---------------|--------|----------|
| Sentry | Crash logs, performance traces | No | No |
| PostHog | Anonymized feature-usage events | No | No |
| Stripe (server-side) | Payment tokens (never on-device) | N/A | No |
| Expo / React Native | None beyond app runtime | No | No |

---

## 7. Revision History

| Date | Change |
|------|--------|
| 2026-03-15 | Initial privacy label declaration |
