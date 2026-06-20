# USBVault Enterprise — USB Provisioning & Packaging Guide

## Overview

USBVault USB drives have a dual-partition layout:
1. **TOOLS** — FAT32 partition with platform launchers (visible on all OSes)
2. **SECURE** — Encrypted partition containing VAULT.bin (hidden until mounted)

---

## Partition Layout

```
USB Drive (e.g. 64 GB)
├── Partition 1: TOOLS (FAT32, 2 GB)
│   ├── USBVault.exe          (Windows launcher)
│   ├── USBVault.app/         (macOS launcher)
│   ├── usbvault.AppImage     (Linux launcher)
│   ├── autorun.inf           (Windows auto-launch, optional)
│   ├── .autorun              (Linux auto-launch, optional)
│   └── README.txt            (Quick start guide)
│
└── Partition 2: SECURE (exFAT, remaining space)
    └── VAULT.bin             (24 KB header + encrypted index + file blobs)
```

---

## Single Drive Provisioning

### Via the App (Recommended)
1. Insert USB drive
2. Open USBVault → **Setup USB** tab
3. Select the target drive
4. Choose security level (Standard / High / Maximum)
5. Set master password
6. Click **Provision**

The app calls the USB Companion service which:
- Wipes the drive
- Creates the dual-partition layout
- Copies platform launchers to TOOLS
- Creates and initializes VAULT.bin on SECURE
- Verifies integrity

### Via USB Companion API
```bash
# 1. Discover drives
curl http://127.0.0.1:19876/usb/drives

# 2. Check provisioning prerequisites
curl http://127.0.0.1:19876/usb/provision/preflight

# 3. Provision (requires admin on some platforms)
curl -X POST http://127.0.0.1:19876/usb/provision \
  -H "Content-Type: application/json" \
  -d '{"driveId": "/dev/disk2", "label": "USBVAULT", "securityLevel": "high"}'
```

---

## Bulk Provisioning (Enterprise)

For deploying multiple USBVault drives (e.g. for a team or organization):

### Method 1: Script-Based

```bash
#!/bin/bash
# bulk-provision.sh — Provision multiple USB drives sequentially
# Requires: USB Companion running, drives connected via USB hub

COMPANION="http://127.0.0.1:19876"
SECURITY_LEVEL="high"

# Get all connected drives
DRIVES=$(curl -s "$COMPANION/usb/drives" | jq -r '.[].id')

for DRIVE in $DRIVES; do
  echo "Provisioning $DRIVE..."
  curl -s -X POST "$COMPANION/usb/provision" \
    -H "Content-Type: application/json" \
    -d "{\"driveId\": \"$DRIVE\", \"label\": \"USBVAULT\", \"securityLevel\": \"$SECURITY_LEVEL\"}"
  echo "Done: $DRIVE"
done
```

### Method 2: Image-Based (ISO/IMG)

For high-volume deployment, create a master image and clone it:

#### Create Master Image

1. Provision a single USB drive via the app (full setup)
2. Create a raw disk image:
   ```bash
   # macOS
   sudo dd if=/dev/rdiskN of=usbvault-master.img bs=4m status=progress

   # Linux
   sudo dd if=/dev/sdX of=usbvault-master.img bs=4M status=progress
   ```
3. Compress the image:
   ```bash
   xz -9 usbvault-master.img  # → usbvault-master.img.xz
   ```

#### Clone to Multiple Drives

```bash
# Decompress and write to target drive
xz -d -c usbvault-master.img.xz | sudo dd of=/dev/sdX bs=4M status=progress

# macOS equivalent
xz -d -c usbvault-master.img.xz | sudo dd of=/dev/rdiskN bs=4m
```

**Important**: After cloning, each drive will have the same vault. For unique vaults per drive, use the script-based method or re-provision the SECURE partition after cloning the TOOLS partition.

#### TOOLS-Only Image

To clone just the launcher partition (and provision SECURE individually):

1. Create the TOOLS partition image only:
   ```bash
   # Identify the TOOLS partition (e.g. /dev/disk2s1 on macOS, /dev/sdX1 on Linux)
   sudo dd if=/dev/disk2s1 of=usbvault-tools.img bs=4m status=progress
   ```

2. Write TOOLS to each drive's first partition, then provision SECURE via the app.

---

## Platform Launcher Details

### Windows (USBVault.exe)
- Electron-packaged app (NSIS installer or portable .exe)
- Starts USB Companion service automatically
- Requires: Windows 10+, no admin required for basic operation
- Admin required for: drive provisioning, zero-trace cleanup

### macOS (USBVault.app)
- Electron-packaged app (DMG or .app bundle)
- Code-signed and notarized for Gatekeeper
- Starts USB Companion service automatically
- Admin required for: drive provisioning

### Linux (usbvault.AppImage)
- Electron-packaged AppImage (runs on most distros)
- Self-contained, no installation required
- `chmod +x usbvault.AppImage && ./usbvault.AppImage`
- Supports: Ubuntu 20.04+, Fedora 35+, Arch (current)

---

## Vault Container Format

The `VAULT.bin` file on the SECURE partition:

```
Offset     Size        Content
0x0000     8 bytes     Magic: "USBVLT04" (V4 format)
0x0008     24568 bytes V4 Header (encrypted metadata, key hierarchy, TFA block)
0x6000     variable    Encrypted Index (file catalog)
...        variable    Encrypted File Blobs (chunked, 64 KiB AEAD)
```

Header size: 24,576 bytes (24 KB)
Maximum files: limited by index size and partition capacity
50% rule: VAULT.bin cannot exceed 50% of SECURE partition capacity

---

## Security Considerations

- **Never copy VAULT.bin to an unencrypted location** — it contains encrypted data but the header structure reveals metadata
- **Zero-trace cleanup**: After using a vault on a host, run zero-trace to clean 23+ artifact classes (temp files, thumbnails, recent file lists, etc.)
- **Drive labels**: The TOOLS partition label is customizable; SECURE partition label is hidden
- **Tamper detection**: HMAC-SHA256 integrity verification on vault header prevents silent modification
