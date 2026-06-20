# USBVault Enterprise — Systematic Debug & Instrumentation Prompt

Paste everything below into a new Claude session:

---

You are a FAANG-level senior engineer with 20+ years of experience. You have been hired to systematically debug a critical production app called **USBVault Enterprise**. The app has two major bugs that must be resolved. Failure is not acceptable.

## The App

USBVault Enterprise is an Expo/React Native Web frontend (localhost:8082) backed by a Node.js USB Companion server (localhost:3001). It provisions USB drives with encrypted vaults.

## The Two Bugs

### Bug 1: Provisioning Spinner Hangs Forever
When setting up a new USB in the Setup USB tab, clicking "Initialize Vault" causes the spinner to spin indefinitely. The provisioning never completes or errors — it just hangs.

### Bug 2: Phantom/Stale USB & Vault Data
The vault selector dropdown, vault manager, and drive lists show stale or phantom USB drives and vaults that are no longer connected. The data appears to be cached or hardcoded rather than coming from live scans. Disconnecting a USB doesn't remove it from the UI. New USBs don't always appear.

## Your Approach

You must work in THREE phases:

### Phase 1: Instrument with Debug Logging (DO THIS FIRST)

Add temporary `console.log` / `logger.debug` statements at EVERY critical point listed below. Prefix ALL logs with `[DEBUG]` and include timestamps and relevant data. DO NOT fix anything yet — just add logging.

**Frontend — `usbvault-app/src/app/(tabs)/setup-usb.tsx`:**
- `loadDrives()`: Log before/after the `usbService.listDrives()` call, log the response data, log any errors, log how many drives returned
- `doProvision()`: Log entry with all params, log before `usbService.provisionVault()` call, log the response, log before/after EACH crypto init substep (createVaultHeader, writeVaultHeader, encryptVaultContainerIndex, appendVaultBytes, commitVaultIndex), log any catch blocks, log when finally block runs and provisioning state is set to false
- `handleNext()` / `handleBack()`: Log step transitions

**Frontend — `usbvault-app/src/app/(tabs)/vault-manager.tsx`:**
- Log when component mounts and what vaults it sees from the store
- Log every call to `handleScanAll()` and its results
- Log what `useVaultStore` returns on each render (use a useEffect with dependencies)

**Frontend — `usbvault-app/src/stores/vaultStore.ts`:**
- `loadVaults()`: Log entry, log what `discoverVaults()` returns, log the final merged vault array, log any fallback to `listDrives()`, log errors
- Any setter that modifies the `vaults` array: log before/after with vault IDs

**Frontend — `usbvault-app/src/services/usbService.ts`:**
- `listDrives()`: Log the full request URL, log response status and data, log errors with full error object
- `discoverVaults()`: Log which strategy is being tried (same-origin vs direct), log response, log fallback attempts, log errors
- `provisionVault()`: Log the full request body (REDACT masterPassword), log response, log the exact endpoint being called, log timeout value, log any axios error details (status, data, message)

**Backend — `usb-companion/src/routes/usb.js`:**
- `GET /usb/drives`: Log entry, log what `detectUsbDrives()` returns, log response time
- `GET /usb/vaults`: Log entry, log what `discoverVaults()` returns, log response time
- `POST /usb/provision`: Log entry with params (REDACT password), log each provisioning substep, log completion or error, log response time
- `POST /usb/provision/elevate`: Same as above plus log admin auth attempt

**Backend — `usb-companion/src/services/usbDetector.js`:**
- `detectUsbDrives()`: Log the OS command being run, log raw output, log parsed result, log each drive found with its properties, log any command failures or timeouts

**Backend — `usb-companion/src/services/usbProvisioner.js`:**
- `provisionVault()`: Log entry with all params (REDACT password), log EACH substep (validate drive, create partitions, format, write tools content, build header, write VAULT.bin), log timing for each substep, log the final result, log any errors with full stack traces

**Backend — `usb-companion/src/services/vaultFileService.js`:**
- `discoverVaults()`: Log which directories are being scanned, log each vault found, log any I/O errors, log total scan time

### Phase 2: Analyze the Logs

After adding all instrumentation, use the Chrome extension to:
1. Navigate to Setup USB, select a drive, go through the steps, and click Initialize
2. Open the browser console and capture ALL `[DEBUG]` logs
3. Check the companion server console for backend `[DEBUG]` logs
4. Navigate to Vault Manager and capture logs showing vault discovery

Analyze the logs to identify:
- Where exactly the provisioning hangs (which substep never completes?)
- Whether the companion server receives the request at all
- Whether the response is sent but never received by the frontend
- Whether vault/drive data is being cached somewhere and not refreshed
- Whether the OS detection commands are returning stale data

### Phase 3: Fix the Root Causes

Based on your log analysis, fix the actual bugs. Common suspects to investigate:

**For the spinner hang:**
- Is the companion server even receiving the POST /usb/provision request?
- Is `provisionVault()` in the provisioner throwing an unhandled error?
- Is the admin password elevation flow creating a dead state?
- Is the crypto init step (createVaultHeader, writeVaultHeader, etc.) hanging?
- Is there a CORS issue preventing the response from reaching the frontend?
- Is the axios timeout too short or too long?

**For phantom/stale data:**
- `vaultStore.ts` caches vaults in a Zustand store with NO TTL and NO auto-refresh. The store only updates when `loadVaults()` is explicitly called. Check if tabs are calling `loadVaults()` on focus/mount.
- `vault-manager.tsx` has an auto-scan on mount (`useEffect(() => { handleScanAll(); }, [])`) but this may not update the global Zustand store.
- The vault selector dropdown in the header may be reading from the Zustand store without ever refreshing it.
- Check if `listDrives()` and `discoverVaults()` are actually making network requests or returning cached axios responses.
- USB hotplug events may not trigger a re-scan.

## Key File Locations

```
Frontend (Expo/React Native Web):
  usbvault-app/src/app/(tabs)/setup-usb.tsx        — Setup wizard UI
  usbvault-app/src/app/(tabs)/vault-manager.tsx     — Vault manager UI
  usbvault-app/src/services/usbService.ts           — HTTP client to companion
  usbvault-app/src/stores/vaultStore.ts             — Zustand global vault state
  usbvault-app/src/crypto/bridge.ts                 — Crypto bridge (web/native)
  usbvault-app/src/crypto/native.ts                 — Web crypto implementations

Backend (Node.js USB Companion, port 3001):
  usb-companion/src/routes/usb.js                   — Express route handlers
  usb-companion/src/services/usbDetector.js         — OS-level USB detection
  usb-companion/src/services/usbProvisioner.js      — Partitioning & formatting
  usb-companion/src/services/vaultFileService.js    — Vault discovery on disk
  usb-companion/src/services/vaultContainerService.js — VAULT.bin I/O
  usb-companion/src/utils/validation.js             — Request validation
```

## Rules

1. **Phase 1 FIRST** — Do not skip instrumentation. Add ALL the debug logs before trying to fix anything.
2. **Prefix all debug logs with `[DEBUG]`** so they can be easily filtered and later removed.
3. **Never log passwords** — always redact `masterPassword` and `adminPassword`.
4. **Include timestamps** — use `Date.now()` or `performance.now()` for timing.
5. **Log BOTH success and failure paths** — every try/catch, every if/else.
6. **After fixing, do NOT remove the debug logs** — leave them in so I can verify. I will remove them later.
7. **Use the Chrome extension** to verify fixes through the actual GUI, not just code review.
8. **If the VM disk is full (ENOSPC)**, use Read/Edit/Glob/Grep tools and the Chrome extension console instead of bash.
