# USBVault USB Companion Service

A security-first local HTTP service that bridges the OS USB subsystem to the USBVault frontend application. It runs exclusively on `127.0.0.1` (localhost) and provides REST endpoints for USB drive detection, vault provisioning, file operations on encrypted VAULT.bin containers, drive reset/wipe, and forensic artifact cleanup.

```
Frontend (Expo/RNW) ──HTTP──> USB Companion (this) ──OS──> lsblk / diskutil / WMI
```

## Architecture

The companion service sits between the USBVault web/Electron frontend and the host operating system. It translates high-level vault operations into platform-specific OS commands (macOS `diskutil`, Linux `lsblk`/`parted`, Windows `wmic`/PowerShell).

Key architectural constraints:

- **Localhost only** -- never binds to a network interface. All traffic stays on the loopback adapter.
- **Zero-knowledge** -- the companion never sees encryption keys or plaintext file data. All cryptographic operations happen in the frontend via Rust FFI. The companion performs raw binary I/O on the VAULT.bin container.
- **Standalone mode** -- when a `static/` directory is present (from an Expo web export), the companion serves the full web app directly. This enables the portable USB experience: double-click a launcher, browser opens, full app runs with no installation.

## Setup

### Requirements

- **Node.js >= 20.0.0** (bundled portable binary or system-installed)
- npm dependencies: `express`, `cors`, `helmet`, `express-rate-limit`, `uuid`, `winston`

### Installation

```bash
cd usb-companion
npm install
```

### Running

```bash
# Production
npm start

# Development (auto-reload on file changes)
npm run dev

# Run tests
npm test
```

### Portable / USB Mode

The `launchers/` directory contains platform-specific scripts that start the companion from a USB drive without requiring any installation:

| File              | Platform      |
|-------------------|---------------|
| `launch.sh`       | Linux         |
| `launch.command`   | macOS         |
| `launch.bat`       | Windows       |

Each launcher:
1. Locates Node.js (bundled `node/` directory first, then system PATH)
2. Verifies Node.js >= 20
3. Finds an available port in the range 3001-3005
4. Starts the companion with a watchdog (auto-restart on crash, up to 5 attempts)
5. Opens the browser to `http://127.0.0.1:<port>`
6. Writes the active port to `.companion-port` for frontend discovery

### Configuration

All configuration is via environment variables with sensible defaults:

| Variable                          | Default       | Description                                      |
|-----------------------------------|---------------|--------------------------------------------------|
| `USB_COMPANION_HOST`              | `127.0.0.1`   | Bind address (always localhost for security)      |
| `USB_COMPANION_PORT`              | `3001`        | HTTP listen port                                  |
| `USB_COMPANION_ORIGINS`           | see below     | Comma-separated CORS allowed origins              |
| `USB_COMPANION_LOG_LEVEL`         | `info`        | Winston log level                                 |
| `USB_COMPANION_CMD_TIMEOUT`       | `10000`       | OS command timeout in ms                          |
| `USB_COMPANION_PROVISION_TIMEOUT` | `300000`      | Provisioning timeout in ms (5 minutes)            |
| `USB_COMPANION_WIPE_TIMEOUT`      | `600000`      | Secure wipe timeout in ms (10 minutes)            |
| `USB_STANDALONE_MODE`             | (auto)        | Force standalone mode even without `static/` dir  |

Default CORS origins: `http://localhost:8081`, `http://localhost:8082`, `http://localhost:8083`, `http://localhost:19006`, `http://localhost:3000`, `https://app.usbvault.io`

## API Reference

All endpoints return JSON unless otherwise noted. Error responses follow the format `{ "error": "..." }`. Every response includes an `X-Request-ID` header for tracing.

### Rate Limits

- **General**: 60 requests per minute (all endpoints)
- **Destructive operations**: 5 per minute (provision, reset, eject, delete, zero-trace, compact)
- **Admin elevation**: 5 per minute (provision/elevate, zero-trace/elevate)

---

### Health

#### `GET /health`

Returns service status, version, and platform info. Used by the frontend to verify the companion is running and API-compatible.

**Response:**
```json
{
  "status": "ok",
  "service": "usb-companion",
  "version": "1.0.0",
  "apiVersion": 1,
  "platform": "darwin",
  "arch": "arm64",
  "uptime": 3600,
  "timestamp": "2026-03-23T12:00:00.000Z"
}
```

The `apiVersion` field enables frontend compatibility checks. It is incremented only on breaking API changes.

---

### USB Drive Operations

#### `GET /usb/drives`

List all connected USB block devices.

**Response:**
```json
{
  "drives": [
    {
      "id": "disk4",
      "name": "USB_DRIVE",
      "size": 32000000000,
      "mountPoint": "/Volumes/USB_DRIVE",
      "partitions": [...]
    }
  ]
}
```

#### `POST /usb/eject`

Safely eject a USB drive (unmount all partitions and power off).

**Request:**
```json
{ "drive_id": "disk4" }
```

**Response:**
```json
{ "success": true, "message": "Drive ejected safely" }
```

**Errors:** `400` if `drive_id` missing, `500` with `error_code: "EJECT_FAILED"`.

---

### Provisioning

#### `GET /usb/provision/preflight`

Check whether admin elevation is required for provisioning on this platform.

**Response:**
```json
{ "needsAdmin": true, "platform": "darwin" }
```

On macOS and Linux, admin privileges are required unless the process is already running as root. Windows does not require elevation.

#### `POST /usb/provision`

Provision a new encrypted vault on a USB drive. Creates the partition layout and initializes the VAULT.bin container. Rate-limited as a destructive operation.

**Request body:** Provision parameters (validated by `validateProvisionParams`).

**Response:** Provision result object on success.

**Errors:**
- `400` -- invalid parameters (with `details` array)
- `409` with `code: "ADMIN_REQUIRED"` -- needs admin elevation; use `/provision/elevate` instead
- `401` with `code: "ADMIN_AUTH_FAILED"` -- incorrect admin password
- `500` -- provisioning failed

#### `POST /usb/provision/elevate`

Same as `/provision`, but accepts an `admin_password` field for sudo elevation. The password is never logged or stored, and only travels over the localhost loopback interface.

**Request body:** Same as `/provision` plus:
```json
{ "admin_password": "..." }
```

**Errors:** Same as `/provision`, plus `400` if `admin_password` is missing.

---

### Drive Reset

#### `POST /usb/reset`

Reset/wipe a USB drive. Rate-limited as a destructive operation.

**Request body:** Reset parameters (validated by `validateResetParams`).

**Response:**
```json
{ "success": true, "message": "Drive reset completed successfully" }
```

---

### Secure Partition Mount/Unmount

#### `POST /usb/mount-secure`

Mount the SECURE partition of a provisioned USB drive for file operations. Returns the mount point path for use with VAULT.bin binary I/O routes.

**Request:**
```json
{ "drive_id": "disk4" }
```

**Response:** Mount result object (includes mount point path).

#### `POST /usb/unmount-secure`

Unmount the SECURE partition after file operations are complete. Re-hides the partition from casual inspection.

**Request:**
```json
{ "drive_id": "disk4" }
```

**Response:**
```json
{ "success": true }
```

---

### Vault Discovery and File Operations

#### `GET /usb/vaults`

Discover all provisioned vaults across all currently mounted USB drives.

**Response:**
```json
{
  "vaults": [
    {
      "vaultId": "a1b2c3d4",
      "driveName": "USB_DRIVE",
      "mountPoint": "/Volumes/USB_DRIVE"
    }
  ]
}
```

#### `GET /usb/vault/:vaultId/files`

List all files in a provisioned vault.

**Response:**
```json
{
  "files": [
    {
      "id": "file-uuid",
      "name": "document.pdf",
      "size": 1048576,
      "createdAt": "2026-03-23T12:00:00.000Z"
    }
  ]
}
```

#### `POST /usb/vault/:vaultId/files`

Upload a file to a vault. File content is sent as a raw `application/octet-stream` body. The file name is provided in the `X-File-Name` header.

**Headers:**
- `Content-Type: application/octet-stream`
- `X-File-Name: document.pdf`

**Body:** Raw file bytes (max 100 MB).

**Response (201):** File metadata object.

**Errors:** `400` for invalid vault ID, invalid file name, or empty body. `413` if file exceeds the size limit.

#### `DELETE /usb/vault/:vaultId/files/:fileId`

Remove a file from a vault. Requires explicit confirmation. Rate-limited as a destructive operation.

**Request body:**
```json
{ "confirm": true }
```

**Response:**
```json
{ "success": true, "message": "File removed successfully" }
```

---

### VAULT.bin Binary Container Operations

These routes provide raw binary I/O on the VAULT.bin container file. All cryptographic operations happen in the app via Rust FFI -- the companion never sees keys or plaintext.

#### `POST /usb/vault/init`

Create a new VAULT.bin at the root of a mounted USB partition.

**Query:** `mountPoint` (required) -- must be under `/Volumes/`, `/media/`, `/mnt/`, or `/run/media/`.

**Body:** Raw 24576-byte header (`application/octet-stream`). Must start with magic bytes `USBVLT04`.

**Response (201):**
```json
{ "success": true }
```

**Errors:** `400` if mount point is invalid, header is wrong size, or magic bytes are incorrect. Fails if VAULT.bin already exists.

#### `GET /usb/vault/container/header`

Read the 24576-byte header from VAULT.bin.

**Query:** `mountPoint` (required).

**Response:** Raw bytes (`application/octet-stream`), 24576 bytes.

#### `PUT /usb/vault/container/header`

Overwrite the 24576-byte header in VAULT.bin.

**Query:** `mountPoint` (required).

**Body:** Raw header bytes (`application/octet-stream`).

**Response:**
```json
{ "success": true }
```

#### `GET /usb/vault/container/bytes`

Read an arbitrary byte range from VAULT.bin.

**Query:** `mountPoint` (required), `offset` (integer, >= 0), `length` (integer, > 0).

**Response:** Raw bytes (`application/octet-stream`).

#### `POST /usb/vault/container/append`

Append bytes to the end of VAULT.bin.

**Query:** `mountPoint` (required).

**Body:** Raw bytes (`application/octet-stream`, max 100 MB).

**Response (201):**
```json
{ "offset": 24576, "length": 1048576 }
```

#### `GET /usb/vault/container/size`

Get the current size of VAULT.bin in bytes.

**Query:** `mountPoint` (required).

**Response:**
```json
{ "size": 25624576 }
```

#### `GET /usb/vault/container/capacity`

Check vault capacity against the 50% partition usage rule.

**Query:** `mountPoint` (required), `bytes` (optional -- additional bytes about to be written).

**Response:**
```json
{
  "allowed": true,
  "vaultSize": 25624576,
  "partitionTotal": 32000000000,
  "maxAllowed": 16000000000,
  "remaining": 15974375424
}
```

#### `POST /usb/vault/container/compact`

Compact VAULT.bin by rewriting it with only active file records. Reclaims space from deleted files.

**Request body:**
```json
{
  "mountPoint": "/Volumes/USB_DRIVE",
  "activeFiles": {
    "file-uuid-1": { "offset": 24576, "length": 1048576 },
    "file-uuid-2": { "offset": 1073152, "length": 512000 }
  }
}
```

**Response:**
```json
{
  "newOffsets": { "file-uuid-1": 24576, "file-uuid-2": 1073152 },
  "oldSize": 5000000,
  "newSize": 1585152,
  "spaceSaved": 3414848
}
```

---

### Zero-Trace Forensic Cleanup

#### `POST /usb/zero-trace`

Run full zero-trace cleanup for the current platform. Cleans 23+ forensic artifact classes (recent files, thumbnails, shell history, Spotlight indexes, etc.).

**Request body:**
```json
{
  "volume_paths": ["/Volumes/USB_DRIVE"],
  "drive_letter": "E",
  "include_admin": false
}
```

All fields are optional. `drive_letter` is used on Windows. `include_admin` triggers elevated cleanup operations.

**Response:** Cleanup result object with details of artifacts cleaned.

#### `POST /usb/zero-trace/elevate`

Same as `/zero-trace` with admin password for elevated cleanup operations (e.g., Spotlight re-index, journal vacuum).

**Request body:**
```json
{
  "volume_paths": ["/Volumes/USB_DRIVE"],
  "admin_password": "..."
}
```

**Errors:** `401` with `code: "ADMIN_AUTH_FAILED"` for incorrect password.

#### `POST /usb/zero-trace/scan`

Scan for detectable forensic artifacts without deleting them (dry run).

**Request body:**
```json
{
  "volume_paths": ["/Volumes/USB_DRIVE"]
}
```

**Response:**
```json
{
  "artifacts": [
    { "type": "recent_file", "path": "~/.local/share/recently-used.xbel" }
  ],
  "count": 12
}
```

---

## Communication Protocol

The frontend (Expo React Native Web or Electron) communicates with the companion over HTTP on localhost. The typical flow is:

1. **Discovery** -- the frontend reads `.companion-port` or probes ports 3001-3005 with `GET /health` to find a running companion.
2. **API version check** -- the frontend compares `apiVersion` from the health response against its expected version. If incompatible, it shows an upgrade prompt.
3. **Drive detection** -- `GET /usb/drives` polls for connected USB drives.
4. **Vault operations** -- provisioning, file upload/download, and compaction use the routes above. All file data passes through as opaque encrypted bytes.
5. **Forensic cleanup** -- before ejecting, the frontend calls zero-trace endpoints to clean OS-level artifacts that could reveal the drive was accessed.
6. **Safe eject** -- `POST /usb/eject` unmounts all partitions and powers down the drive.

### Security Model

- All traffic is on the localhost loopback interface (`127.0.0.1`). It never leaves the machine.
- CORS restricts access to known frontend origins.
- Helmet sets strict security headers (CSP, HSTS, X-Content-Type-Options).
- Rate limiting prevents abuse even from local processes.
- Admin passwords for elevation are never logged or stored. They follow the same trust boundary as the user typing `sudo` in a terminal.
- OS error messages are sanitized before being returned to the client to prevent filesystem path and device name leakage.
