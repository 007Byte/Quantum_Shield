# App Transport Security (iOS) & Network Security Config (Android) — Verification

## iOS — App Transport Security (ATS)

**Status: ENABLED (enforced by default in Expo/iOS 9+)**

Configured in `app.json` under `expo.ios.infoPlist.NSAppTransportSecurity`:

- `NSAllowsArbitraryLoads`: **false** (only TLS connections allowed)
- Exception: `localhost` for development only (`NSExceptionAllowsInsecureHTTPLoads: true`, subdomains excluded)
- No other exception domains configured
- Minimum TLS version: **1.2** (iOS default when ATS is enforced)
- Forward secrecy: required (ATS default)
- Certificate: must be SHA-256+ with RSA 2048+ or ECC 256+ (ATS default)

### Production checklist

- [ ] Remove `localhost` exception before App Store submission (or accept it for debug builds only)
- [x] No `NSAllowsArbitraryLoads: true`
- [x] No `NSAllowsArbitraryLoadsInWebContent`
- [x] No `NSAllowsLocalNetworking` (except for USB device discovery)

## Android — Network Security Config

**Status: CLEARTEXT DISABLED**

Configured in `app.json` under `expo.android`:

- `usesCleartextTraffic`: **false** — all HTTP plaintext connections are blocked
- `networkSecurityConfig`: points to `native/android/app/src/main/res/xml/network_security_config.xml`
- `android.permission.INTERNET` is explicitly declared (required for HTTPS)

### Permissions hardening

Blocked permissions (cannot be requested by libraries):
- `READ_PHONE_STATE`
- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`
- `CAMERA`
- `RECORD_AUDIO`

Allowed:
- `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` (USB vault files)
- `USE_BIOMETRIC` (biometric auth)
- `INTERNET` (encrypted API communication)

## Certificate Pinning

Handled by `src/services/security/certificatePinning.ts` — pins the API server's
public key (SHA-256 SPKI hash) and rejects connections with mismatched certificates.

## Summary

| Platform | TLS Minimum | Cleartext Blocked | ATS/NSC Enforced | Cert Pinning |
|----------|-------------|-------------------|-------------------|--------------|
| iOS      | 1.2         | Yes               | Yes               | Yes          |
| Android  | 1.2         | Yes               | Yes               | Yes          |
| Web      | Browser     | N/A (HTTPS only)  | N/A               | N/A          |
