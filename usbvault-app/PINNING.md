# F8 — Native TLS Certificate Pinning (api.usbvault.io)

This document describes the **native SPKI public-key pinning scaffold** for the
Quantum_Shield app and how to safely turn it on.

> **STATUS: SCAFFOLDED & DISABLED (INERT).**
> The wiring is in place on both platforms, but the pin-sets ship with clearly
> marked **placeholder** values (`AAAA…=` / `BBBB…=`) and are **commented out /
> disabled**. Native pinning is **fail-closed**: an active pin-set that matches
> none of the presented certificates rejects *every* TLS handshake. Enabling
> with placeholder pins would break all HTTPS to `api.usbvault.io`.
>
> **Do NOT enable in production until real primary + backup pins are filled in
> and device-tested.** See the gating checklist at the bottom.

We pin the **SPKI (Subject Public Key Info) SHA-256 hash, base64-encoded**, not
the certificate fingerprint. SPKI pins survive certificate renewals as long as
the key pair is reused, which makes rotation far safer.

---

## What was wired (scaffold)

### Android
- `android/app/src/main/res/xml/network_security_config.xml`
  - Active: HTTPS-only base-config, system CA trust anchors, dev cleartext for
    `localhost` / `10.0.2.2`.
  - A `<domain-config>` for `api.usbvault.io` whose `<pin-set>` (two
    `<pin digest="SHA-256">` entries + `expiration`) is **commented out**.
- `android/app/src/main/AndroidManifest.xml`
  - `<application android:networkSecurityConfig="@xml/network_security_config" …>`
    is now set, so the secure base config is enforced immediately; only the
    pin-set itself is staged.
- `native/android/app/src/main/res/xml/network_security_config.xml`
  - The Expo-prebuild source copy (referenced by `app.json`
    `expo.android.networkSecurityConfig`), kept in sync with the native copy.

### iOS
- `ios/USBVaultEnterprise/Info.plist`
  - Under `NSAppTransportSecurity`, an `NSPinnedDomains` block for
    `api.usbvault.io` (`NSPinnedLeafIdentities` with two `SPKI-SHA256-BASE64`
    entries) is staged as an **XML comment** (inert).
- `app.json`
  - `expo.ios.infoPlist.NSAppTransportSecurity` carries the same scaffold as a
    disabled `_F8_NSPinnedDomains_DISABLED` key (a no-op iOS ignores) plus an
    `_F8_PINNING_README` note, so the scaffold survives `expo prebuild`.

This is a **bare / prebuild** Expo project (the `android/` and `ios/` native
projects are committed). When you regenerate native code with `expo prebuild`,
re-apply the enable steps below if they were only made in the native files.

---

## Step 1 — Generate the PRIMARY pin (current live leaf cert)

Run against the live host and copy the resulting base64 string:

```sh
openssl s_client -servername api.usbvault.io -connect api.usbvault.io:443 \
  </dev/null 2>/dev/null \
  | openssl x509 -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl base64
```

The output (e.g. `k3Xj…=`) is the **primary** pin. It is the SPKI SHA-256 of the
**leaf** certificate's public key.

## Step 2 — Generate a BACKUP pin (required)

A second, independent pin is **mandatory** so you can rotate certificates without
shipping an app update. Pick ONE strategy and pin a key you control and will
actually use next:

- **Preferred — next/rotation key pair:** generate the SPKI hash from the CSR or
  certificate of the *not-yet-deployed* renewal key. From a local cert/CSR:
  ```sh
  openssl x509 -in next-cert.pem -pubkey -noout \
    | openssl pkey -pubin -outform der \
    | openssl dgst -sha256 -binary | openssl base64
  # for a CSR, swap `openssl x509 -in next-cert.pem` for `openssl req -in next.csr`
  ```
- **Alternative — pin an intermediate CA** from the live chain (longer-lived,
  but pins trust to the issuing CA). List the chain and hash the chosen
  intermediate's public key:
  ```sh
  openssl s_client -servername api.usbvault.io -connect api.usbvault.io:443 \
    -showcerts </dev/null 2>/dev/null \
    | openssl x509 -pubkey -noout \
    | openssl pkey -pubin -outform der \
    | openssl dgst -sha256 -binary | openssl base64
  # (extract the intermediate cert from the -showcerts output and feed it to
  #  `openssl x509 -pubkey -noout` instead of the leaf)
  ```

Store the backup key/cert securely offline; the pin is only useful if you can
actually deploy that key when the primary cert is rotated.

## Step 3 — Fill in the pins

Replace **both** placeholders (`AAAA…=` primary, `BBBB…=` backup) with the real
base64 values in:

- `android/app/src/main/res/xml/network_security_config.xml`
- `native/android/app/src/main/res/xml/network_security_config.xml`
- `ios/USBVaultEnterprise/Info.plist`
- `app.json` (`expo.ios.infoPlist.NSAppTransportSecurity`)

## Step 4 — Enable

- **Android:** uncomment the `<pin-set>` block in *both* network-security-config
  files. Set `expiration` to a date **before the backup cert expires** so a
  missed rotation soft-fails (pinning is skipped) instead of bricking clients.
- **iOS:** uncomment the `NSPinnedDomains` block in `Info.plist`, and in
  `app.json` rename `_F8_NSPinnedDomains_DISABLED` → `NSPinnedDomains` (and drop
  the `_F8_PINNING_README` note). Then run `expo prebuild` to regenerate native
  iOS config.

## Step 5 — Device-test (do not skip)

1. Connect to staging **and** production through the real app on **physical**
   Android and iOS devices — confirm normal traffic still works.
2. Verify pinning actually rejects a wrong cert (e.g. via a MITM proxy such as
   mitmproxy/Charles): the connection MUST fail with the proxy's cert.
3. Verify the backup pin works by simulating rotation to the backup key.
4. Only then ship to production.

---

## Enablement gating / flags

- **Disabled by default.** Pin-sets are commented out (Android, iOS Info.plist)
  or behind a no-op `_F8_…_DISABLED` key (app.json). No fake-active pins ship.
- **Non-breaking placeholder state.** Today only system-CA TLS enforcement is
  active; pinning adds nothing until enabled, so HTTPS to `api.usbvault.io`
  keeps working.
- **Real pins required.** Both a primary and a backup SPKI pin must be filled in
  before enabling. Single-pin configs are not allowed (no rotation safety).
- **Device testing required.** Must be validated on real Android + iOS hardware
  against staging and production, including a wrong-cert rejection test, before
  production release.
- **Prebuild caveat.** Native files can be overwritten by `expo prebuild`; the
  `app.json` / `native/android/**` sources are the prebuild-durable place to
  keep the configuration.
- **CI footgun guard.** `usbvault-app/scripts/check-pin-placeholders.mjs` runs in
  the `usbvault-app` CI job and **fails the build** if either the iOS
  `NSPinnedDomains` key or an Android `<pin-set>` is *enabled* while still holding
  a placeholder pin (`AAAA…=` / `BBBB…=`). A disabled scaffold and a real-pin
  config both pass; only "enabled + placeholder" — the brick-the-app mistake —
  fails. Run it locally with `node scripts/check-pin-placeholders.mjs`.

---

## Two pinning layers (native vs. JavaScript runtime)

This app enforces pinning at **two independent layers**. F8 (above) is the
native OS layer. There is also a JavaScript runtime layer:

| Layer | Where | Driven by | Enable without native rebuild? |
| --- | --- | --- | --- |
| **Native (F8)** | Android `network_security_config.xml`, iOS `Info.plist` / `app.json` `NSPinnedDomains` | hardcoded SPKI pins | No — requires `expo prebuild` + store release |
| **JS runtime** | `src/services/security/certificatePinning.ts` (used by `src/services/api.ts`) | `EXPO_PUBLIC_PIN_*` env vars at build time | Yes — set env vars and rebuild the JS bundle |

The JS layer is **fail-closed**: `arePinsConfigured()` returns `false` for empty
or placeholder values, and in production (`!__DEV__`) the client refuses to make
pinned HTTPS requests rather than silently falling back to unpinned TLS. It is
configured via environment variables (see `.env.example`):

```sh
EXPO_PUBLIC_PIN_PRIMARY="sha256/<primary SPKI pin>"
EXPO_PUBLIC_PIN_BACKUP="sha256/<backup SPKI pin>"
EXPO_PUBLIC_PIN_EXPIRATION="2027-06-01"   # soft-fail-open date
```

Use the same SPKI pins for both layers. The helper
`usbvault-app/scripts/extract-pins.sh [host] [port]` prints the
`sha256/<pin>` values for the whole presented chain — handy for filling both the
`EXPO_PUBLIC_PIN_*` env vars (JS layer) and the native placeholders (F8).

**Order of operations to fully enable pinning in production:**

1. Deploy `api.usbvault.io` with its production leaf certificate.
2. `./scripts/extract-pins.sh api.usbvault.io 443` → record the primary pin;
   compute a backup pin from your rotation key/CSR (Step 2 above).
3. Set `EXPO_PUBLIC_PIN_PRIMARY` / `EXPO_PUBLIC_PIN_BACKUP` / `EXPO_PUBLIC_PIN_EXPIRATION`
   for the JS layer (ships with the next JS build).
4. Fill the native placeholders and enable the F8 scaffold (Steps 3–4 above),
   `expo prebuild`, then device-test (Step 5). The CI guard will block a build
   that enables native pinning while placeholders remain.
