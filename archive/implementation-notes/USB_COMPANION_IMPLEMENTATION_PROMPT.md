# USBVault Enterprise — USB Companion Service: Full Implementation Prompt

## Context

You are working on **USBVault Enterprise**, a React Native (Expo SDK 54) web application that manages encrypted USB vault devices. The app runs via `npx expo start --web` on **macOS** and opens in Chrome at `http://localhost:8081`.

The app needs a **local USB Companion Service** that runs on the same Mac, detects physically connected USB drives, and exposes REST endpoints the frontend calls. There are **3 USB drives physically connected** to this Mac that must all be detected.

## Current State

### What exists and works:
- **Frontend pages**: `src/app/(tabs)/setup-usb.tsx` (743 lines) and `src/app/(tabs)/reset-usb.tsx` (682 lines) — fully built UI with 4-step wizard (Detect → Format Options → Master Password → Initialize)
- **Frontend service**: `src/services/usbService.ts` (205 lines) — axios client that calls `GET /usb/drives`, `POST /usb/provision`, `POST /usb/reset` on `http://localhost:3001`
- **Companion service scaffold**: `usb-companion/` directory with Express server, routes, detection, provisioning, and reset services (all ESM, Node 22)
- **Metro middleware**: `usb-dev-middleware.js` + `metro.config.js` integration — serves USB API from same origin as Expo dev server (alternative to standalone companion)

### What does NOT work:
- The companion service was built and tested inside a Linux VM, not on the Mac host. The Mac's browser cannot reach the VM's network.
- The macOS USB detection code (`detectMacOS()` in `usbDetector.js`) has never been tested on an actual Mac with real USB drives.
- Vault provisioning and reset have never been end-to-end tested with real hardware.
- The `parsePlistBasic()` regex-based plist parser is fragile — it should be replaced with the `plist` npm package or a more robust parser.
- File operations on vaults (add files, list files, etc.) are not implemented.

## Your Task

**Make USB detection, vault creation, and file operations work end-to-end on macOS with all 3 connected USB drives.** Run everything from the Mac's terminal (not a VM). Follow security-first principles throughout.

## Step-by-Step Plan

### Phase 1: Environment Setup (Mac Terminal)

1. Open a terminal on the Mac, `cd` to the `Enterprise_Version/usb-companion` directory.
2. Run `npm install` to install dependencies.
3. **Verify USB visibility FIRST** before touching any code:
   ```bash
   # See all external disks
   diskutil list external

   # Get detailed info on each
   diskutil info disk2   # (adjust disk numbers)

   # See USB device tree
   system_profiler SPUSBDataType -json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
   ```
4. Confirm you can see all 3 USB drives. Note their disk identifiers (e.g., `disk2`, `disk3`, `disk4`), names, sizes, and serial numbers.

### Phase 2: Fix macOS USB Detection

The `usbDetector.js` has a `detectMacOS()` function that needs to work reliably. Key issues to fix:

1. **Replace `parsePlistBasic()` with proper plist parsing.** Options:
   - Add `plist` npm package: `npm install plist` — then `import plist from 'plist'; const parsed = plist.parse(stdout);`
   - Or use `plutil -convert json -o -` to convert plist to JSON: `execFileAsync('plutil', ['-convert', 'json', '-o', '-', '-'], { input: stdout })`
   - The regex parser WILL break on nested dicts, arrays of dicts, and boolean values inside arrays.

2. **Test the detection function in isolation:**
   ```bash
   # Create a quick test script
   node -e "
     import('./src/services/usbDetector.js').then(m =>
       m.detectUsbDrives().then(d => console.log(JSON.stringify(d, null, 2)))
     ).catch(e => console.error(e))
   "
   ```
   This must return all 3 USB drives with correct names, sizes, and device paths.

3. **Validate the returned data matches the frontend's `USBDrive` interface:**
   ```typescript
   interface USBDrive {
     id: string;          // e.g. "disk2"
     name: string;        // e.g. "SanDisk Cruzer"
     capacity: string;    // e.g. "32 GB"
     device: string;      // e.g. "/dev/disk2"
     available: boolean;  // true if not a system disk
     hasVault: boolean;   // true if has USBVault partition label
     vendor?: string;
     model?: string;
     serial?: string;
     removable?: boolean;
     hotplug?: boolean;
     partitions?: Array<{ name, size, fstype, label, mountpoint }>;
   }
   ```

### Phase 3: Start and Test the Companion Service

1. Start the companion: `npm start` (or `npm run dev` for auto-reload)
2. Test the API:
   ```bash
   # Health check
   curl http://localhost:3001/health

   # List drives — must show all 3 USBs
   curl http://localhost:3001/usb/drives | python3 -m json.tool

   # Verify CORS headers
   curl -i -H "Origin: http://localhost:8081" http://localhost:3001/usb/drives
   ```
3. All 3 drives must appear in the response. If any are missing, debug `detectMacOS()`.

### Phase 4: Frontend Integration

1. Ensure `usbService.ts` points to `http://localhost:3001` (it currently does via the `??` operator).
2. Start/restart the Expo dev server: `npx expo start --web` (restart is needed to load the Metro middleware from `metro.config.js`).
3. Open `http://localhost:8081/setup-usb` in Chrome.
4. **All 3 USB drives must appear** in the "Detect USB Drives" step.
5. Test the full wizard flow:
   - Select a USB drive → Next
   - Choose format options (quick/full, exFAT/NTFS/ext4) → Next
   - Set master password → Next
   - Initialize (provisions the vault)
6. After provisioning, verify the drive has a USBVault vault marker.

### Phase 5: Vault Provisioning (Real Implementation)

The `usbProvisioner.js` needs to actually work on macOS:

1. **Format the drive:**
   ```bash
   # macOS uses diskutil for formatting
   diskutil eraseDisk ExFAT "USBVAULT" GPT /dev/diskN
   ```
2. **Create vault structure on the formatted drive:**
   - Mount point: use `diskutil info diskN` to find the mount path
   - Create directory structure: `.usbvault/`, `.usbvault/meta.json`, `.usbvault/vault/`
   - `meta.json` contains: `{ vaultId, createdAt, version, encryptionMethod }`
3. **Generate recovery phrase:** Use crypto.randomBytes to generate 24-word BIP39 mnemonic (or use the `bip39` npm package).
4. **Return `{ vaultId, recoveryPhrase }` to the frontend.**

### Phase 6: File Operations

The app needs to support adding files to a vault. This requires:

1. A new endpoint: `POST /usb/vault/:vaultId/files` — upload files to the vault directory on the USB
2. A new endpoint: `GET /usb/vault/:vaultId/files` — list files in the vault
3. A new endpoint: `DELETE /usb/vault/:vaultId/files/:fileId` — remove a file
4. Update `usbService.ts` with corresponding methods
5. Update or create a UI page for file management

### Phase 7: Reset USB (Real Implementation)

The `usbResetter.js` needs to work on macOS:

1. **Quick erase:** `diskutil eraseDisk free "" GPT /dev/diskN` — wipes partition table
2. **Secure wipe:** `diskutil secureErase 1 /dev/diskN` — single-pass random overwrite
3. Verify the drive is wiped and no longer contains vault markers.

## Security Requirements (Non-Negotiable)

1. **No shell=true** — Always use `execFile`, never `exec`. Arguments must never include user input.
2. **Input validation** — All drive IDs must match `/^[a-zA-Z0-9_-]+$/`. All passwords ≤ 256 chars. All enum values (formatType, fileSystem, wipeMethod) must be whitelisted.
3. **Localhost-only binding** — The companion binds to `127.0.0.1`, never `0.0.0.0`.
4. **CORS restricted** — Only allow `http://localhost:8081` and other known Expo dev origins.
5. **Rate limiting** — 60 req/min general, 5 req/min for destructive operations (provision, reset).
6. **No secrets in logs** — Never log passwords, recovery phrases, or encryption keys. Use audit logger for security events.
7. **Confirm before destructive ops** — The frontend must show a confirmation dialog before provisioning or resetting. The backend should require a `confirm: true` field in destructive POST bodies.
8. **Drive validation** — Before any format/wipe, verify the target drive is: (a) USB/external, (b) not a system disk, (c) not mounted at /, /System, /Users, etc.
9. **Timeout all subprocesses** — 10s for detection, 300s for provisioning, 600s for secure wipe.
10. **Helmet headers** — Content-Security-Policy, X-Content-Type-Options, etc.

## Key Files Reference

| File | Purpose |
|------|---------|
| `usb-companion/src/server.js` | Express server with security middleware |
| `usb-companion/src/services/usbDetector.js` | Platform-adaptive USB detection |
| `usb-companion/src/services/usbProvisioner.js` | Vault creation and drive formatting |
| `usb-companion/src/services/usbResetter.js` | Drive wipe/reset |
| `usb-companion/src/routes/usb.js` | API routes (GET /usb/drives, POST /usb/provision, POST /usb/reset) |
| `usb-companion/src/utils/config.js` | All configuration in one place |
| `usb-companion/src/utils/validation.js` | Input validation and sanitization |
| `usb-companion/src/utils/logger.js` | Winston structured + audit logging |
| `usbvault-app/src/services/usbService.ts` | Frontend HTTP client for companion |
| `usbvault-app/src/app/(tabs)/setup-usb.tsx` | Setup USB wizard UI |
| `usbvault-app/src/app/(tabs)/reset-usb.tsx` | Reset USB UI |
| `usbvault-app/metro.config.js` | Metro config with USB middleware hook |
| `usbvault-app/usb-dev-middleware.js` | Alternative: USB API as Metro middleware |

## Frontend API Contract (usbService.ts)

```
GET  /usb/drives        → { drives: USBDrive[] }
POST /usb/provision      → { vaultId: string, recoveryPhrase: string[] }
     Body: { drive_id, format_type, file_system, master_password }
POST /usb/reset           → { success: true, message: string }
     Body: { drive_id, wipe_method, passes? }
GET  /health              → { status, platform, arch, uptime }
```

## Acceptance Criteria

- [ ] `npm start` in `usb-companion/` launches the service on `localhost:3001` without errors
- [ ] `curl localhost:3001/usb/drives` returns all 3 physically connected USB drives with correct names, sizes, and device paths
- [ ] Opening `localhost:8081/setup-usb` in Chrome shows all 3 USB drives in the detection step
- [ ] Selecting a drive and completing the 4-step wizard successfully provisions a vault
- [ ] The provisioned drive contains a `.usbvault/` directory with `meta.json`
- [ ] Opening `localhost:8081/reset-usb` shows all 3 drives and can reset a selected one
- [ ] After reset, the drive no longer contains vault markers
- [ ] All operations work in both light and dark mode
- [ ] No security violations: no shell injection vectors, no secrets in logs, no unvalidated input
- [ ] Error states are handled gracefully with user-friendly messages

## How to Verify

After implementing, run this verification sequence:

```bash
# 1. Start companion
cd Enterprise_Version/usb-companion && npm start

# 2. In another terminal, verify detection
curl -s localhost:3001/usb/drives | python3 -m json.tool
# → Must show 3 drives

# 3. In another terminal, start Expo
cd Enterprise_Version/usbvault-app && npx expo start --web

# 4. Open Chrome to localhost:8081/setup-usb
# → Must show 3 drives in UI

# 5. Complete the setup wizard on one drive
# → Must show recovery phrase, vault created

# 6. Navigate to localhost:8081/reset-usb
# → Must show 3 drives, can reset the provisioned one
```
