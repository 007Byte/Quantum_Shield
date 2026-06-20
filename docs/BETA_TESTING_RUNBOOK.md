# USBVault Enterprise -- Beta Testing Runbook

**App**: USBVault Enterprise v0.1.0
**Bundle ID**: `com.usbvault.enterprise`
**Platforms**: iOS (iPhone + iPad), Android
**Crypto Core**: Rust FFI (Argon2id + XChaCha20-Poly1305 + AES-256-GCM-SIV)
**Framework**: Expo SDK 54 / React Native 0.81 / Hermes
**Last Updated**: 2026-03-18

---

## Table of Contents

1. [Pre-Beta Setup](#1-pre-beta-setup)
2. [Minimum Device Test Matrix](#2-minimum-device-test-matrix)
3. [QA Checklist -- 15 Critical User Flows](#3-qa-checklist----15-critical-user-flows)
4. [Performance Benchmarks](#4-performance-benchmarks)
5. [Security Testing Checklist](#5-security-testing-checklist)
6. [Regression Testing](#6-regression-testing)
7. [Bug Reporting Template](#7-bug-reporting-template)
8. [Go/No-Go Criteria](#8-gono-go-criteria)

---

## 1. Pre-Beta Setup

### 1.1 Prerequisites

- Node.js >= 18 LTS
- EAS CLI >= 5.0.0 (`npm install -g eas-cli`)
- Expo account with project linked (`eas login`)
- Apple Developer Program membership (iOS)
- Google Play Console access with the app created (Android)
- Rust toolchain installed (for building the native crypto library)

### 1.2 Creating EAS Preview Builds for Internal Testing

The `preview` profile in `eas.json` is pre-configured for internal distribution.

```bash
# Navigate to the app directory
cd usbvault-app

# Validate environment variables
npm run validate-env

# Build iOS preview (generates an .ipa for internal distribution via ad-hoc)
eas build --profile preview --platform ios

# Build Android preview (generates an .apk for sideloading)
eas build --profile preview --platform android

# Build both simultaneously
eas build --profile preview --platform all
```

**Key configuration** (already set in `eas.json`):
- `distribution: "internal"` -- restricts to registered devices (iOS) or direct download (Android)
- `channel: "preview"` -- enables OTA updates via `expo-updates` on the preview channel
- iOS builds use ad-hoc provisioning (requires device UDIDs registered in Apple Developer portal)
- Android builds output `.apk` files (not AAB) for easy sideloading

**Registering iOS test devices for ad-hoc builds:**
```bash
# Register a new device interactively
eas device:create

# Or share a registration URL with testers
eas device:create --url
# Testers open the URL on their iPhone/iPad, install the profile, and their UDID is registered automatically.
# After new devices are registered, rebuild with:
eas build --profile preview --platform ios
```

### 1.3 TestFlight Setup (iOS Beta Distribution)

TestFlight is Apple's official beta testing platform. Use it for wider beta distribution beyond the internal ad-hoc builds.

#### Step 1: Configure App Store Connect Credentials

Update `eas.json` submit configuration with real values:
```json
"submit": {
  "production": {
    "ios": {
      "appleId": "your-apple-id@email.com",
      "ascAppId": "1234567890",
      "appleTeamId": "ABCDE12345"
    }
  }
}
```

- `appleId`: Your Apple ID email used for App Store Connect.
- `ascAppId`: The numeric App ID from App Store Connect (App Information > General Information > Apple ID).
- `appleTeamId`: Your 10-character Team ID from the Apple Developer portal (Membership > Team ID).

#### Step 2: Create the App in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com) > My Apps > "+" > New App.
2. Select **iOS** platform.
3. Enter app name: **USBVault Enterprise**.
4. Select your primary language.
5. Bundle ID: select `com.usbvault.enterprise` (must match the provisioning profile).
6. SKU: `usbvault-enterprise`.
7. Click Create.

#### Step 3: Build and Submit to TestFlight

```bash
# Build a production-signed IPA (required for TestFlight)
eas build --profile production --platform ios

# Submit the build to App Store Connect / TestFlight
eas submit --platform ios --latest
```

Alternatively, submit a specific build:
```bash
eas submit --platform ios --id <build-id>
```

#### Step 4: Configure TestFlight in App Store Connect

1. Navigate to **My Apps > USBVault Enterprise > TestFlight**.
2. The uploaded build will appear under **iOS Builds** after processing (typically 10--30 minutes).
3. **Compliance**: Answer the export compliance questionnaire.
   - USBVault uses encryption: **Yes**.
   - Contains or accesses third-party encryption: **Yes** (Argon2id, XChaCha20, AES-256-GCM-SIV, ML-KEM-1024).
   - Available on the French store: answer based on distribution plans.
   - Qualifies for exemption: **No** (primary function is encryption).
   - You will need an ERN (Encryption Registration Number) or an exemption filing with BIS.

#### Step 5: Add Internal Testers

1. Go to **TestFlight > Internal Testing > App Store Connect Users**.
2. Click "+" to add team members (up to 100 internal testers).
3. Internal testers must have an App Store Connect role (Admin, Developer, Marketing, etc.).
4. Builds are available to internal testers immediately after processing (no review required).

#### Step 6: Add External Testers

1. Go to **TestFlight > External Testing**.
2. Click "+" to create a new group (e.g., "Beta Testers").
3. Add testers by email address (up to 10,000 per app).
4. Fill in the **Test Information**:
   - Beta App Description: describe what testers should focus on.
   - Feedback Email: provide a support/feedback email.
   - Privacy Policy URL: link to your privacy policy.
5. Submit the build for **Beta App Review** (required for external testers; first review takes 24--48 hours, subsequent builds are usually auto-approved).
6. Once approved, testers receive an email invitation to install via the TestFlight app.

#### Step 7: Manage TestFlight Builds

- Set **auto-distribute** to push new builds to testers automatically.
- TestFlight builds expire after **90 days** -- plan your beta timeline accordingly.
- Monitor crash reports and tester feedback in App Store Connect.

### 1.4 Google Play Internal Testing Track Setup

#### Step 1: Create a Google Play Service Account

1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create a project (or select existing) > APIs & Services > Enable the **Google Play Android Developer API**.
3. Go to **IAM & Admin > Service Accounts** > Create Service Account.
4. Name it `eas-submit` and grant it no project-level roles.
5. Create a JSON key for this service account and download it.
6. Save the key as `usbvault-app/google-play-key.json` (this path is already configured in `eas.json`).
7. **Never commit this file to version control.** Ensure it is in `.gitignore`.

#### Step 2: Grant Access in Google Play Console

1. Go to [Google Play Console](https://play.google.com/console) > Setup > API Access.
2. Link the Google Cloud project you created.
3. Under Service Accounts, find the `eas-submit` account and click **Manage Play Console Permissions**.
4. Grant these permissions:
   - **Release management**: Create, edit, and roll out releases.
   - **App information**: View app information (read-only is sufficient).
5. Apply permissions to **USBVault Enterprise** specifically (or all apps).

#### Step 3: Create the App in Google Play Console

1. Go to **All Apps > Create App**.
2. App name: **USBVault Enterprise**.
3. Default language: English (United States).
4. App type: App. Category: Tools or Productivity.
5. Free or Paid: set based on your model.
6. Complete the **Content declarations** (privacy policy, data safety, target audience).

#### Step 4: Build and Submit to Internal Testing

```bash
# Build a production AAB (Android App Bundle)
eas build --profile production --platform android

# Submit to the internal testing track (configured in eas.json as track: "internal")
eas submit --platform android --latest
```

The `eas.json` already targets the `internal` track:
```json
"android": {
  "serviceAccountKeyPath": "./google-play-key.json",
  "track": "internal"
}
```

#### Step 5: Configure the Internal Testing Track

1. In Google Play Console, go to **Testing > Internal Testing**.
2. Click **Create new release** (or the EAS submit will have done this).
3. Review the release and click **Start rollout to Internal testing**.

#### Step 6: Add Internal Testers

1. Go to **Testing > Internal Testing > Testers**.
2. Create a new email list (e.g., "USBVault Beta Testers").
3. Add tester email addresses (must be Google accounts).
4. Up to **100 testers** for Internal Testing track.
5. Copy the **opt-in URL** and share it with testers.
6. Testers open the URL, accept the invitation, and install via Google Play.

#### Step 7: Promote to Closed/Open Testing (Optional)

Once internal testing passes:
```bash
# Promote the internal build to closed testing
# In Google Play Console: Testing > Closed Testing > Manage Track > Add from library
```
- **Closed testing**: up to 2,000 testers, requires Beta App Review.
- **Open testing**: unlimited testers, app appears in Play Store with "Early Access" badge.

### 1.5 Adding Beta Testers -- Summary

| Action | iOS (TestFlight) | Android (Internal Track) |
|--------|-------------------|--------------------------|
| Max internal testers | 100 (ASC users) | 100 (email list) |
| Max external testers | 10,000 | 2,000 (closed) / unlimited (open) |
| Add tester | App Store Connect > TestFlight > Add by email | Play Console > Internal Testing > Add email to list |
| Tester installs via | TestFlight app (invite email) | Google Play (opt-in URL) |
| Review required? | No (internal) / Yes (external, first build) | No (internal) / Yes (closed/open) |
| Build expiration | 90 days | No expiration (but can deactivate) |
| OTA updates | Supported via `expo-updates` on `preview` channel | Supported via `expo-updates` on `preview` channel |

---

## 2. Minimum Device Test Matrix

### Required Devices

| # | Device | OS Version | Role | Why Needed |
|---|--------|-----------|------|------------|
| 1 | **iPhone SE (3rd gen)** or **iPhone 12 mini** | iOS 16+ | Older/budget iOS | Small screen (4.7"/5.4"), limited RAM (3-4 GB). Validates that Argon2id KDF completes within acceptable time on A13/A15 with constrained memory. Tests cramped UI layouts. |
| 2 | **iPhone 15 Pro** or **iPhone 16** | iOS 17+ | Flagship iOS | Larger display (6.1"-6.7"), 6-8 GB RAM, A17 Pro / A18 chip. Baseline for performance benchmarks. Tests Face ID integration, ProMotion 120 Hz rendering, and Dynamic Island compatibility. |
| 3 | **iPad Air (5th gen)** or **iPad Pro 11"** | iPadOS 16+ | Tablet | Tests `supportsTabletMode: true` from `app.json`. Validates responsive layout (sidebar + main content), Split View / Slide Over multitasking, and larger vault table rendering. Confirms screen protection works on iPad. |
| 4 | **Samsung Galaxy A14** or **Pixel 6a** | Android 12+ | Budget/midrange Android | 4 GB RAM, midrange SoC (Exynos 850 / Tensor G1). Stress-tests Argon2id memory usage (must stay under 200 MB). Validates Hermes performance on slower hardware. Tests Android permission dialogs and biometric prompt on fingerprint sensors. |
| 5 | **Samsung Galaxy S24** or **Pixel 8 Pro** | Android 14+ | Flagship Android | 8-12 GB RAM, Snapdragon 8 Gen 3 / Tensor G3. Performance ceiling benchmark. Tests Android 14 predictive back gestures, notification channels (`POST_NOTIFICATIONS` permission), and Keystore hardware-backed encryption. |

### Optional but Recommended

| Device | Why |
|--------|-----|
| **iPhone SE (2nd gen)** | A13 chip, 3 GB RAM -- tests absolute minimum viable performance for Argon2id. |
| **Android tablet (Galaxy Tab S9 FE)** | Android tablet layout testing (less common but validates responsive design). |
| **Older Android (Android 10/11)** | Verifies backward compatibility of `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` permissions and Hermes engine. |

### Why Each Category Matters

- **Screen size diversity**: USBVault uses NativeWind/Tailwind CSS for responsive design. The vault table, sidebar, and encryption progress overlays must render correctly from 4.7" to 12.9".
- **Memory constraints**: Argon2id with recommended parameters (64 MB memory cost) can cause OOM on 3-4 GB devices if not tuned. The Rust FFI must handle memory allocation failures gracefully.
- **CPU for Argon2id**: Key derivation time scales inversely with CPU power. A budget Android phone may take 3-5x longer than a flagship. We must verify the UX remains acceptable (progress indicator, no ANR on Android).
- **Biometric hardware**: Face ID (TrueDepth camera) vs. Touch ID vs. Android fingerprint vs. Android face unlock each follow different code paths through `expo-local-authentication`.
- **OS-specific behaviors**: iOS Keychain vs. Android Keystore, different notification handling, different file picker behaviors, different background app snapshot protection mechanisms.

---

## 3. QA Checklist -- 15 Critical User Flows

For each flow, execute the steps manually on at least one iOS and one Android device. Record PASS/FAIL and any observations.

---

### Flow 1: Registration (SRP-6a Zero-Knowledge)

**Route**: `/(auth)/register`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Launch app cold (first install) | Splash screen displays with `#0F0B1E` background, then routes to auth screen. |
| 2 | Tap "Create Account" | Registration form appears with email, password, and confirm password fields. |
| 3 | Enter a weak password (e.g., "abc") | Password strength indicator shows "Weak". Submit button remains disabled or shows validation error. |
| 4 | Enter a strong password (12+ chars, mixed case, number, symbol) | Password strength indicator shows "Strong". |
| 5 | Submit the registration form | Loading overlay appears. SRP-6a client ephemeral is generated via Rust FFI (`srpGenerateClientEphemeral`). Salt and verifier are sent to server. **No plaintext password is ever transmitted.** |
| 6 | Registration succeeds | User is redirected to the dashboard. Auth token is stored in `expo-secure-store`. |
| 7 | Check network traffic (proxy) | Confirm no plaintext password in any request body. Only SRP salt, verifier, and ephemeral values are transmitted. |

**Failure criteria**: Password transmitted in plaintext, registration completes with weak password, crash during SRP computation.

---

### Flow 2: Login + Biometric Unlock

**Route**: `/(auth)/login`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter registered email and password | SRP-6a handshake executes (client ephemeral -> server challenge -> session proof). |
| 2 | Login succeeds | Dashboard loads. JWT token stored in Secure Store. |
| 3 | Enable biometric unlock in Settings | System biometric prompt appears (Face ID / fingerprint). User confirms. |
| 4 | Kill app and relaunch | Biometric prompt appears before dashboard. |
| 5 | Authenticate via biometric | Dashboard loads without requiring password. |
| 6 | Cancel biometric prompt | Falls back to password entry field. |
| 7 | Test with biometrics disabled in system settings | App falls back to password-only login gracefully (no crash). |

**Failure criteria**: Biometric bypass without enrollment, JWT stored outside Secure Store, crash when biometrics unavailable.

---

### Flow 3: FIDO2/WebAuthn Key Registration

**Route**: `/(tabs)/keys` or Settings > Security

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to security key management | FIDO2 key registration UI appears. |
| 2 | Tap "Register Security Key" | WebAuthn `navigator.credentials.create()` fires (or native passkey flow on iOS 16+ / Android 9+). |
| 3 | Authenticate with hardware key or platform authenticator | Registration succeeds. Key fingerprint displayed. Associated domain `webcredentials:api.usbvault.io` is used (configured in `app.json`). |
| 4 | Log out and log back in using FIDO2 | `navigator.credentials.get()` fires. Authentication succeeds with the registered key. |
| 5 | Remove the security key | Key is deregistered. Login falls back to SRP-6a + password. |

**Failure criteria**: FIDO2 challenge replay, key registration without user gesture, crash on devices without platform authenticator.

---

### Flow 4: Encrypt File

**Route**: `/(tabs)/encrypt` or `/(tabs)/encrypt-store`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tap "Encrypt File" or "Add File" | Document picker opens (`expo-document-picker`). |
| 2 | Select a test file (start with a 1 MB file) | File name, size, and type displayed in the UI. |
| 3 | Select encryption algorithm | Options include XChaCha20-Poly1305 (default) and AES-256-GCM-SIV. Cipher ID is set accordingly. |
| 4 | Confirm encryption | Progress indicator shows. Rust FFI `vaultEncryptRecord` is called. For files > 64 KB, streaming mode is used (`streamEncryptInit` -> `streamEncryptChunk` -> `streamFree`). |
| 5 | Encryption completes | Success confirmation with haptic feedback (`expo-haptics`). File appears in vault with `isPQCProtected` flag if PQC was selected. |
| 6 | Verify encrypted file in vault list | File name, size, and modification date appear correctly. `encryptedMetadata` is stored (not plaintext metadata). |
| 7 | Repeat with 10 MB and 100 MB files | No crash, progress bar updates smoothly, memory stays within bounds. |

**Failure criteria**: Plaintext file data persisted to disk unencrypted, crash on large files, incorrect cipher ID stored, progress bar freezes.

---

### Flow 5: Decrypt File

**Route**: `/(tabs)/decrypt` or `/(tabs)/decrypt-export`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select an encrypted file from the vault | File details display (name, size, encryption algorithm, PQC status). |
| 2 | Enter vault password (or use biometric if vault is unlocked) | Key derivation runs via Argon2id (native) or PBKDF2 (web fallback). Vault header verification succeeds (`VERIFY_OK_000000` marker). |
| 3 | Tap "Decrypt" | Progress indicator shows. Rust FFI `vaultDecryptRecord` is called. V2RC record magic `V2RC` is validated, chunks are decrypted. |
| 4 | Decryption completes | Original file content is restored. Temp view shows file preview (`DecryptTempView` component). |
| 5 | Save decrypted file | `expo-sharing` or file system save dialog. File written to user-chosen location. |
| 6 | Verify file integrity | Decrypted file is byte-identical to original (compare SHA-256 hashes). |
| 7 | Test with wrong password | Error message "Incorrect password" displays. Fail counter increments in vault header (`vaultFailCounterIncrement`). |

**Failure criteria**: Decrypted file differs from original, plaintext cached to disk after dismissal, wrong password accepted, fail counter not incremented.

---

### Flow 6: Share File with Another User

**Route**: `/(tabs)/share`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select a file to share | Share UI appears with recipient selection. |
| 2 | Enter recipient email or select contact | Recipient's public key is fetched from the server. |
| 3 | Confirm share | File is sealed to recipient's public key (`sealToPublicKey` via ECDH key exchange on web, X25519 + ML-KEM-1024 `pqcSeal` on native for PQC-protected files). Deep link generated with `pathPrefix: /share` (configured in `app.json` intent filters). |
| 4 | Recipient opens share link | App opens via deep link (`usbvault://` scheme or `https://api.usbvault.io/share/...`). Sealed file is decrypted with recipient's private key. |
| 5 | Recipient views shared file | File content matches original. |
| 6 | Verify share with non-existent user | Error message displayed. No data leaked. |

**Failure criteria**: File shared without encryption, share link works without authentication, PQC seal fails silently on native.

---

### Flow 7: Backup Vault (Create + Verify)

**Route**: `/(tabs)/backup`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Backup screen | Backup history list shows (empty on first use). Auto-backup configuration visible. |
| 2 | Tap "Create Backup" | Backup process begins. All vault data, file metadata, passwords, and settings are serialized. |
| 3 | Enter backup password | Key derived via Argon2id. Data encrypted with AES-256-GCM-SIV (`CipherId` from crypto bridge). |
| 4 | Backup completes | `BackupMetadata` recorded: ID, timestamp, vault count, file count, size, version. Backup appears in history with status `success`. |
| 5 | Verify backup integrity | Tap "Verify" on the backup entry. Backup is decrypted and checksummed without restoring. Verification result displayed. |
| 6 | Export backup file | Encrypted backup file downloadable/shareable via `expo-sharing`. |

**Failure criteria**: Backup stored unencrypted, backup size is 0, verification fails on valid backup, crash during large vault backup.

---

### Flow 8: Restore Vault from Backup

**Route**: `/(tabs)/restore`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Restore screen | Option to select backup file (local or imported). |
| 2 | Select a previously created backup file | Backup metadata displayed (date, vault count, file count). |
| 3 | Enter backup password | Key derivation and decryption execute. |
| 4 | Confirm restore | Vaults, files, passwords, and settings are restored. Progress indicator shows per-item progress. |
| 5 | Verify restored data | All vaults appear in dashboard. Files are present and decryptable. Passwords are accessible. Settings match pre-backup state. |
| 6 | Test with wrong backup password | Error displayed. No partial restore occurs. |
| 7 | Test restore on a different device | Same backup file restores successfully on a second device (validates portability). |

**Failure criteria**: Partial restore without error, data corruption after restore, wrong password accepted, restore overwrites without confirmation.

---

### Flow 9: Password Manager (Add/View/Copy/Delete)

**Route**: `/(tabs)/passwords`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Passwords tab | Password list displays (`PasswordList` component). Search bar visible (`PasswordSearch`). |
| 2 | Tap "Add Password" | `PasswordForm` component appears with fields: title, username, password, URL, notes. |
| 3 | Use password generator | Strong random password generated. Strength indicator updates. |
| 4 | Save the password entry | Entry appears in the list, encrypted in vault index. |
| 5 | Tap an entry to view | Password field initially masked. Tap to reveal. |
| 6 | Copy password to clipboard | Password copied. If Ghost Mode is enabled, clipboard auto-clears after `clipboardCleanDelaySec` (default: 5 seconds). |
| 7 | Search for a password | `PasswordSearch` filters the list in real time. |
| 8 | Delete a password entry | Confirmation dialog appears. Entry removed from list and vault index. |
| 9 | Import passwords (`PasswordImport`) | CSV/JSON import processes correctly. Duplicates detected. |

**Failure criteria**: Passwords stored in plaintext, clipboard not cleared in Ghost Mode, search exposes un-decrypted data, delete without confirmation.

---

### Flow 10: USB Companion Connection (Scan, Pair, Sync)

**Route**: `/(tabs)/setup-usb` and `/(tabs)/find-vault`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Connect a USB device to the host machine running the companion app | USB companion (`usb-companion/`) detects the drive. |
| 2 | Open USBVault app and tap "Scan for USB" | Local network scan initiates (uses `NSLocalNetworkUsageDescription` and `NSBonjourServiceTypes: ["_http._tcp"]` from `app.json`). |
| 3 | USB companion discovered | Device name, IP, and drive info displayed. |
| 4 | Tap "Pair" | Pairing handshake establishes a secure channel. Device appears in `/(tabs)/devices`. |
| 5 | Create or select a vault for USB sync | Vault data pushed to USB device. `mountPoint`, `driveName`, and `fileSystem` fields populated in `VaultInfo`. |
| 6 | Verify vault on USB | Files are accessible from the companion app. VAULT.bin header with magic `USBVLT04` present on drive. |
| 7 | Modify vault on phone, sync again | Changes propagate to USB. Commit counter and state version increment. |
| 8 | Disconnect USB and verify offline behavior | App shows USB disconnected status. Vault remains accessible locally. |

**Failure criteria**: Network scan crashes without local network permission, pairing without authentication, vault data unencrypted on USB drive, sync corrupts vault header.

---

### Flow 11: Premium Upgrade Flow (Paywall, Purchase, Tier Activation)

**Route**: `/(tabs)/premium` and `/(tabs)/billing`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Premium screen | Paywall component displays tier comparison (Free / Pro / Enterprise). |
| 2 | Tap "Upgrade to Pro" | RevenueCat purchase flow initiates (`react-native-purchases`). |
| 3 | Complete purchase (use sandbox/test account) | Receipt validated server-side. Tier updated in auth store. |
| 4 | Verify premium features unlocked | Premium-gated features (PQC encryption, advanced backup, priority support) become accessible. Feature gates (`featureGates.ts`) reflect new tier. |
| 5 | Navigate to Billing screen | Subscription status, renewal date, and management options displayed. |
| 6 | Cancel subscription (sandbox) | Tier reverts to Free at end of billing period. Premium features gracefully degrade (files remain accessible but new premium operations blocked). |
| 7 | Restore purchases on a different device | `react-native-purchases` restore flow. Premium tier reactivated. |

**Failure criteria**: Premium features accessible without purchase, purchase completes but tier not updated, crash on restore, no graceful degradation on downgrade.

---

### Flow 12: Push Notification Receipt

**Route**: N/A (background)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ensure push notifications are enabled | `POST_NOTIFICATIONS` permission granted (Android 13+). iOS notification permission dialog accepted. |
| 2 | Trigger a notification from server (e.g., share invitation, security alert) | Notification appears in system tray/notification center with the app icon (color: `#7C3AED` as configured in `app.json`). |
| 3 | Tap the notification | App opens to the relevant screen (deep link routing via `expo-router`). |
| 4 | Receive notification while app is in foreground | In-app notification banner appears (not just system notification). |
| 5 | Test with notifications disabled | App functions normally. Notification-dependent flows fall back gracefully. |

**Failure criteria**: Notification crash, notification displays sensitive data in preview, tap does not route correctly, app crashes when notification permission denied.

---

### Flow 13: Offline Mode (Airplane Mode, Queue, Reconnect, Sync)

**Route**: All tabs (cross-cutting)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enable airplane mode on device | `OfflineIndicator` component appears. App detects offline state via `@react-native-community/netinfo`. |
| 2 | Perform actions: encrypt a file, add a password, modify settings | All actions complete locally. Operations queued in `offlineQueueService`. |
| 3 | Verify queued actions | Offline store (`offlineStore`) shows pending operations count. |
| 4 | Disable airplane mode | App detects connectivity restored. Sync begins automatically (`syncService`). |
| 5 | Queued operations execute | Files encrypted offline are synced to server. Passwords saved offline appear in synced state. Conflict resolution handles any server-side changes. |
| 6 | Verify data consistency | Local and server data match. No duplicate entries. Version counters (`FileInfo.version`) correctly incremented. |

**Failure criteria**: App crashes in airplane mode, operations lost when reconnecting, sync creates duplicates, offline indicator not shown, data corruption after sync.

---

### Flow 14: Self-Destruct Trigger (10 Failed Password Attempts)

**Route**: `/(auth)/login` and vault unlock

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt login/vault unlock with wrong password (attempt 1-9) | Each attempt increments fail counter in vault header (`vaultFailCounterIncrement`). Warning displayed at attempt 5: "5 attempts remaining". Warning at attempt 8: "2 attempts remaining -- data will be destroyed". |
| 2 | Verify fail counter persistence | Kill and relaunch app. Fail counter reads from header (`vaultFailCounterRead`) and retains count. Counter is HMAC-protected to prevent tampering. |
| 3 | Enter wrong password (attempt 10) | **Self-destruct triggers.** All vault data wiped. Encryption keys zeroed from Secure Store. Vault files deleted. |
| 4 | Verify destruction is complete | App returns to registration screen. No vault data recoverable. Local storage cleared. |
| 5 | Enter correct password on attempt 9 (boundary test) | Login succeeds. Fail counter resets to 0 (`vaultFailCounterReset`). |

**Failure criteria**: Self-destruct does not trigger at threshold, fail counter resets on app restart, partial data survives destruction, correct password rejected after counter reset.

---

### Flow 15: Zero-Trace Wipe

**Route**: `/(tabs)/zero-trace`

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Zero Trace | Wipe options displayed (RAM scrub, clipboard clean, metadata sanitization, journal cleanup, full wipe). |
| 2 | Execute RAM scrub | Ghost Mode `ramScrubOnLock` routine executes. Forensics service clears in-memory sensitive data. |
| 3 | Execute clipboard clean | Clipboard contents cleared. Verified by pasting -- nothing pastes. |
| 4 | Execute metadata sanitization | File metadata (names, timestamps) in local storage sanitized. |
| 5 | Execute full zero-trace wipe | All local data destroyed: vaults, files, passwords, settings, auth tokens, Secure Store entries, AsyncStorage, IndexedDB (web). App returns to first-launch state. |
| 6 | Verify no residual data | Check AsyncStorage, Secure Store, and file system -- all USBVault data removed. |
| 7 | Audit log entry | If audit service was running, wipe action is logged before destruction (for compliance). |

**Failure criteria**: Data survives zero-trace wipe, clipboard not cleared, RAM scrub skips sensitive buffers, no confirmation before destructive wipe.

---

## 4. Performance Benchmarks

### 4.1 Argon2id Key Derivation Time Targets

Argon2id parameters (native/Rust): m=65536 (64 MB), t=3, p=1

| Device Class | Example Device | Target Time | Max Acceptable |
|-------------|----------------|-------------|----------------|
| Flagship iOS | iPhone 15 Pro / 16 | < 500 ms | < 1,000 ms |
| Older iOS | iPhone SE 3rd / 12 mini | < 1,500 ms | < 3,000 ms |
| Flagship Android | Pixel 8 Pro / Galaxy S24 | < 800 ms | < 1,500 ms |
| Budget Android | Pixel 6a / Galaxy A14 | < 2,500 ms | < 5,000 ms |
| iPad | iPad Air 5th / Pro 11" | < 600 ms | < 1,200 ms |

**Measurement method**: Instrument `deriveKey()` in the Rust FFI bridge. Measure wall-clock time from call to return. Run 3 iterations, report median.

**If budget Android exceeds 5 seconds**: Reduce Argon2id memory cost to 32 MB for that device class. Log a security advisory that KDF strength is reduced.

### 4.2 Encryption Throughput

| File Size | Target (Flagship) | Target (Budget) | Max Acceptable |
|-----------|-------------------|-----------------|----------------|
| 1 MB | < 100 ms | < 500 ms | < 1,000 ms |
| 10 MB | < 500 ms | < 2,000 ms | < 5,000 ms |
| 100 MB | < 3,000 ms | < 15,000 ms | < 30,000 ms |

**Measurement method**: Time the full encrypt flow including `streamEncryptInit`, all `streamEncryptChunk` calls, and `streamFree`. Exclude file picker and UI rendering time.

**Note**: 100 MB files use 64 KB streaming chunks (CHUNK_SIZE = 65536). Expect approximately 1,600 chunk operations.

### 4.3 App Cold Start Time

| Metric | Target | Max Acceptable |
|--------|--------|----------------|
| Cold start to splash screen | < 500 ms | < 1,000 ms |
| Cold start to interactive (dashboard loaded) | < 2,000 ms | < 3,000 ms |
| Warm resume from background | < 300 ms | < 500 ms |

**Measurement method**: Use Hermes profiler or manual stopwatch from tap to first interactive frame. On Android, use `adb shell am start -W com.usbvault.enterprise` to measure `TotalTime`.

### 4.4 Memory Usage

| Metric | Target | Max Acceptable | Measurement |
|--------|--------|----------------|-------------|
| Idle on dashboard | < 80 MB | < 120 MB | Xcode Memory Gauge / Android Studio Profiler |
| During Argon2id derivation | < 150 MB | < 200 MB | Peak during KDF (64 MB for Argon2id + app overhead) |
| During 100 MB file encryption | < 180 MB | < 200 MB | Peak during streaming encryption |
| Background (suspended) | < 50 MB | < 80 MB | After 30 seconds in background |

**Hard ceiling**: 200 MB peak. Exceeding this risks OOM kills on 3-4 GB devices where system + other apps consume 2+ GB.

---

## 5. Security Testing Checklist

### 5.1 Certificate Pinning Verification

| # | Test | Method | Expected Result |
|---|------|--------|-----------------|
| 1 | Valid connection to `api.usbvault.io` | Normal app usage | Connection succeeds. |
| 2 | MITM proxy (e.g., Charles/mitmproxy) without pin bypass | Route traffic through proxy with its own CA cert | Connection **fails**. App shows certificate pinning error. |
| 3 | Pin rotation handling | Configure `EXPO_PUBLIC_API_PIN_2` with new pin before rotating server cert | Seamless transition during cert rotation. |
| 4 | Expired pin `expirationDate` | Set a pin expiration to a past date | Pin is ignored; connection falls back to remaining valid pins. |
| 5 | All pins invalid | Clear all pin environment variables | In dev mode: connection allowed with warning logged. In production: connection **blocked**. |

**Tools**: Charles Proxy, mitmproxy, or Burp Suite with CA cert installed on test device.

### 5.2 Jailbreak/Root Detection

| # | Test | Method | Expected Result |
|---|------|--------|-----------------|
| 1 | Clean device | Run on non-jailbroken iPhone / non-rooted Android | `DeviceIntegrityResult.isCompromised = false`. `riskLevel = 'safe'`. |
| 2 | Jailbroken iOS device (or simulator with Cydia paths) | Test on jailbroken device or mock jailbreak file paths | `checks.jailbroken = true`. `riskLevel = 'critical'`. App blocks key generation and decryption. Warning displayed to user. |
| 3 | Rooted Android device | Test on rooted device (Magisk) or emulator | `checks.rooted = true`. App displays root detection warning. Critical crypto operations blocked. |
| 4 | Debugger attached | Attach lldb (iOS) or Android Studio debugger | `checks.debuggerAttached = true`. `riskLevel` escalated. |
| 5 | Frida/hooking framework | Run Frida server on test device | `checks.hookingFramework = true`. |
| 6 | Emulator detection | Run on iOS Simulator / Android Emulator | `checks.emulator = true`. Warning displayed but app remains functional (emulators are acceptable for development). |

### 5.3 Screenshot Protection

| # | Test | Method | Expected Result |
|---|------|--------|-----------------|
| 1 | Screenshot on sensitive screen (vault, passwords, decrypt) | Take screenshot while viewing encrypted file content or passwords | iOS: screenshot is blank or shows splash. Android: screenshot is black (`FLAG_SECURE`). Verified via `expo-screen-capture` `preventScreenCaptureAsync()`. |
| 2 | Screen recording on sensitive screen | Start screen recording, navigate to passwords | Recording shows blank/black for protected screens. |
| 3 | Screenshot on non-sensitive screen (settings, help) | Take screenshot on settings or help screen | Screenshot captures normally (protection disabled on non-sensitive screens). |

### 5.4 Background App Snapshot Protection

| # | Test | Method | Expected Result |
|---|------|--------|-----------------|
| 1 | Swipe to app switcher while on vault screen | Double-tap home (iOS) or recent apps (Android) | App preview in switcher shows splash/blur overlay, NOT vault contents. |
| 2 | Return to app from switcher | Tap the app preview | App resumes normally with biometric/password prompt if auto-lock is configured. |

### 5.5 Keychain/Keystore Secure Storage Verification

| # | Test | Method | Expected Result |
|---|------|--------|-----------------|
| 1 | Auth token storage | Check `expo-secure-store` entries after login | JWT stored in iOS Keychain (with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`) or Android Keystore (hardware-backed). |
| 2 | Encryption key storage | Check storage after vault unlock | Vault encryption keys in Secure Store, NOT in AsyncStorage or localStorage. |
| 3 | Backup of Secure Store data | Create an unencrypted iTunes/Android backup | Secure Store entries are NOT included in the backup (device-only flag set). |
| 4 | Key extraction attempt | Use Keychain dumper (jailbroken iOS) or `adb backup` | Keys are not extractable without device unlock. Hardware-backed keys on Android cannot be extracted even with root. |

### 5.6 Network Traffic Inspection

| # | Test | Method | Expected Result |
|---|------|--------|-----------------|
| 1 | Login flow | Capture traffic with proxy | No plaintext password. Only SRP-6a ephemeral, salt, and proof values transmitted. |
| 2 | File encryption/upload | Capture traffic during file encrypt + sync | File data transmitted as encrypted blob. No plaintext file content in any request. |
| 3 | API calls | Inspect all API requests | All connections use HTTPS (TLS 1.2+). `usesCleartextTraffic: false` enforced on Android. `NSAllowsArbitraryLoads: false` enforced on iOS. |
| 4 | Metadata leakage | Inspect headers and query parameters | No file names, vault names, or user data in URLs or headers. Only opaque IDs. |
| 5 | Error responses | Trigger server errors | Error responses do not leak internal paths, stack traces, or sensitive configuration. |

---

## 6. Regression Testing

### 6.1 Maestro E2E Flows (Native)

Run the full Maestro test suite on each physical device in the test matrix.

```bash
# Run all flows
cd usbvault-app
npm run test:maestro

# Run a single flow
npm run test:maestro:single maestro/flows/login.yaml
```

**Available Maestro flows** (in execution order):
1. `flows/login.yaml` -- Login with test credentials
2. `flows/encrypt-file.yaml` -- End-to-end file encryption
3. `flows/decrypt-file.yaml` -- End-to-end file decryption
4. `flows/share-file.yaml` -- File sharing flow
5. `flows/settings-change.yaml` -- Settings modification
6. `flows/full-cycle.yaml` -- Complete encrypt-decrypt-share cycle

**Maestro test configuration** (`maestro/config.yaml`):
- App ID: `com.usbvault.enterprise`
- Default timeout: 10,000 ms
- Test credentials: `test@usbvault.io` / `TestPassword123!`

**Per-device reporting**: Create a results matrix:

| Flow | iPhone SE | iPhone 15 Pro | iPad Air | Galaxy A14 | Galaxy S24 |
|------|-----------|---------------|----------|------------|------------|
| login | | | | | |
| encrypt-file | | | | | |
| decrypt-file | | | | | |
| share-file | | | | | |
| settings-change | | | | | |
| full-cycle | | | | | |

### 6.2 Playwright Web Tests

Run Playwright tests to validate the web platform (development preview) and capture App Store screenshots.

```bash
# Run all web E2E tests
cd usbvault-app
npm run test:e2e

# Run with UI (for debugging)
npm run test:e2e:ui

# Capture App Store screenshots at required dimensions
npm run screenshots
```

**Playwright projects** (from `playwright.config.ts`):
- `chromium` -- Desktop Chrome
- `webkit` -- Desktop Safari
- `screenshots-iphone-6.7` -- 430x932 @ 3x (iPhone 15 Pro Max)
- `screenshots-iphone-6.5` -- 414x896 @ 3x (iPhone 11 Pro Max)
- `screenshots-ipad-12.9` -- 1024x1366 @ 2x (iPad Pro 12.9")

**Cross-reference**: Any Maestro flow that fails on native should be investigated in the corresponding Playwright test to determine if the issue is platform-specific (native-only Rust FFI) or cross-platform (React/UI logic).

### 6.3 Unit Test Suite

Run the full Jest test suite before and after each beta build:

```bash
# Core unit tests
npm test

# Component tests
npm run test:components
```

Verify all existing test files pass, including:
- `src/crypto/__tests__/native.test.ts`
- `src/services/__tests__/backupService.test.ts`
- `src/services/__tests__/certificatePinning.test.ts`
- `src/services/__tests__/forensicsService.test.ts`
- `src/services/__tests__/tierService.test.ts`
- `src/services/__tests__/messageService.test.ts`
- `src/services/crypto/__tests__/`
- `src/utils/__tests__/cryptoManager.test.ts`
- `src/utils/__tests__/passwordPolicy.test.ts`
- `src/components/dashboard2/__tests__/sidebar.test.ts`

---

## 7. Bug Reporting Template

Beta testers should use the following template when reporting issues. Share this as a form (Google Form, GitHub Issue template, or TestFlight feedback).

---

### Bug Report -- USBVault Enterprise Beta

**Reporter**:
**Date**:
**Build Version**: (e.g., 0.1.0 build 1)
**Platform**: iOS / Android
**Device**: (e.g., iPhone 15 Pro, Pixel 8)
**OS Version**: (e.g., iOS 17.4, Android 14)

**Severity**: Critical / High / Medium / Low
- **Critical**: Data loss, security bypass, complete crash preventing app use.
- **High**: Feature broken, workaround difficult or impossible.
- **Medium**: Feature degraded but usable, UI/UX issue.
- **Low**: Cosmetic issue, minor inconvenience.

**Category**: Encryption / Decryption / Authentication / Sharing / Backup / Restore / USB / Passwords / Notifications / Settings / UI / Performance / Security / Other

**Summary**: (One sentence describing the issue)

**Steps to Reproduce**:
1.
2.
3.

**Expected Result**: (What should have happened)

**Actual Result**: (What actually happened)

**Reproducibility**: Always / Intermittent (X out of Y attempts) / Once

**Screenshots/Screen Recording**: (Attach if possible)

**Crash Log**: (Paste Sentry crash ID if available, or attach native crash log)

**Network Conditions**: WiFi / Cellular / Offline / Switching

**Additional Context**: (Any other information: other apps running, battery level, storage remaining, etc.)

---

## 8. Go/No-Go Criteria

All items below must be satisfied before submitting to the App Store and Google Play for production release.

### 8.1 Mandatory Pass Criteria (ALL must pass)

| # | Criterion | Verified By |
|---|-----------|-------------|
| 1 | **All 15 critical user flows pass** on at least 1 iOS + 1 Android device | QA lead signs off on flow matrix |
| 2 | **Zero critical-severity bugs** open | Bug tracker query: severity=critical, status=open returns 0 |
| 3 | **Argon2id KDF completes within max acceptable time** on all test devices | Performance benchmark results table |
| 4 | **App cold start < 3 seconds** on all test devices | Measured per Section 4.3 |
| 5 | **Memory peak < 200 MB** during all operations on all test devices | Profiler measurements per Section 4.4 |
| 6 | **Certificate pinning blocks MITM** in production configuration | Security test 5.1 #2 passes |
| 7 | **Jailbreak/root detection functional** | Security test 5.2 #2 or #3 passes (on applicable device) |
| 8 | **Screenshot protection active** on sensitive screens | Security test 5.3 #1 passes |
| 9 | **No plaintext secrets in network traffic** | Security test 5.6 #1-#4 all pass |
| 10 | **Self-destruct triggers at threshold** (10 failed attempts) | Flow 14 passes end-to-end |
| 11 | **Zero-trace wipe removes all local data** | Flow 15 passes end-to-end |
| 12 | **All Maestro E2E flows pass** on at least 1 iOS + 1 Android device | Maestro test results per Section 6.1 |
| 13 | **All Jest unit tests pass** with 0 failures | `npm test` exit code 0 |
| 14 | **Encryption/decryption round-trip integrity** verified (SHA-256 match) | Flow 4 + Flow 5, file hash comparison |
| 15 | **Backup/restore round-trip verified** on 2 devices | Flow 7 + Flow 8, cross-device restore |
| 16 | **Export compliance documentation filed** (iOS) | ERN or exemption confirmed with BIS |
| 17 | **Privacy policy and data safety declarations complete** | App Store Connect + Google Play Console reviewed |
| 18 | **Sentry error monitoring configured and receiving events** | Trigger a test error, verify in Sentry dashboard |

### 8.2 Recommended but Non-Blocking

| # | Criterion | Notes |
|---|-----------|-------|
| 1 | All 15 flows pass on all 5 devices in the test matrix | Ideal but not blocking if 1 device has a non-critical issue |
| 2 | Playwright web tests all pass | Web is dev-preview only; not shipping to production users |
| 3 | PQC (ML-KEM-1024) hybrid encryption tested end-to-end | PQC is native-only; may be gated behind premium tier |
| 4 | Accessibility audit (VoiceOver / TalkBack) | Important for compliance but can follow in a patch release |
| 5 | Localization tested in 2+ languages | i18n infrastructure exists (`i18next`); can ship English-only initially |
| 6 | Auto-backup scheduled execution verified | Requires extended testing window (run overnight) |

### 8.3 Decision Process

1. **All 18 mandatory criteria pass** --> Proceed to App Store / Google Play submission.
2. **1-2 mandatory criteria fail with known workarounds** --> Engineering lead + product owner decide: fix or document workaround and ship.
3. **3+ mandatory criteria fail** --> No-go. Fix and re-run beta test cycle.
4. **Any data loss or security bypass bug** --> Absolute no-go regardless of count. Fix, audit, and re-run full security testing before resubmission.

---

## Appendix A: Environment Setup for Testers

### TestFlight (iOS)

1. Download the **TestFlight** app from the App Store on your test device.
2. Open the invitation email from App Store Connect.
3. Tap "View in TestFlight" to install USBVault Enterprise.
4. After installation, open the app and proceed with testing.
5. Provide feedback directly through TestFlight (shake device or go to TestFlight > USBVault Enterprise > Send Beta Feedback).

### Google Play Internal Testing (Android)

1. Open the opt-in URL shared by the development team in Chrome on your test device.
2. Sign in with the Google account that was added to the testers list.
3. Accept the invitation and tap "Install" from the Google Play listing.
4. After installation, open the app and proceed with testing.
5. Report bugs using the template in Section 7 via the designated channel (email, GitHub Issues, or shared form).

### OTA Updates During Beta

Both platforms support over-the-air updates via `expo-updates` on the `preview` channel. When the development team publishes an update:

```bash
# Development team runs:
eas update --branch preview --message "Beta fix: <description>"
```

Testers receive the update automatically on next app launch (configured: `checkAutomatically: "ON_LOAD"`). No reinstall required for JS-only changes. Native module changes (e.g., Rust FFI updates) require a new build via TestFlight / Play Store.
