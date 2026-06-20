# EAS Build Configuration Guide

This document explains each placeholder in `eas.json` and how to fill them when Apple Developer and Google Play accounts are available.

## iOS Configuration

### Required from Apple Developer Account ($99/year)

| Placeholder | Where to Find | Example |
|-------------|---------------|---------|
| `APPLE_ID` | Your Apple ID email used for developer enrollment | `developer@usbvault.io` |
| `ASC_APP_ID` | App Store Connect → App → General → App Information → Apple ID | `1234567890` |
| `APPLE_TEAM_ID` | Developer Portal → Membership → Team ID | `ABC123DEF4` |

### Steps
1. Enroll at https://developer.apple.com/programs/
2. Create app in App Store Connect
3. Create a provisioning profile (EAS handles this automatically with `--auto-submit`)
4. Update `eas.json` → `build.production.ios` section

## Android Configuration

### Required from Google Play Console ($25 one-time)

| Placeholder | Where to Find | Example |
|-------------|---------------|---------|
| `package` | Already set in `app.json` as `android.package` | `io.usbvault.app` |

### Steps
1. Register at https://play.google.com/console/
2. Create new application
3. Upload signing key or let Google manage it (App Signing)
4. EAS will handle the rest with `eas build --platform android --profile production`

## Building

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Build iOS
eas build --platform ios --profile production

# Build Android
eas build --platform android --profile production

# Submit to stores
eas submit --platform ios
eas submit --platform android
```
