# DOC-007: Quantum_Shield -- Recovery Procedures

| Field | Value |
|-------|-------|
| **Document ID** | DOC-007 |
| **Version** | 2.0 |
| **Date** | 2026-03-18 |
| **Classification** | Confidential -- Operations |
| **Audience** | End users, IT support staff |

---

## Table of Contents

1. [Overview](#1-overview)
2. [Recovery Phrase](#2-recovery-phrase)
3. [Forgotten Master Password](#3-forgotten-master-password)
4. [Lost FIDO2 Hardware Key](#4-lost-fido2-hardware-key)
5. [Corrupted Vault (Dual-Index Recovery)](#5-corrupted-vault-dual-index-recovery)
6. [Key Hierarchy Recovery](#6-key-hierarchy-recovery)
7. [Self-Destruct Recovery](#7-self-destruct-recovery)
8. [Wrong Password Lockout](#8-wrong-password-lockout)
9. [USB Drive Failure](#9-usb-drive-failure)
10. [Vault Not Detected](#10-vault-not-detected)
11. [Companion Service Issues](#11-companion-service-issues)
12. [Cross-Platform Issues](#12-cross-platform-issues)
13. [Server Infrastructure Recovery](#13-server-infrastructure-recovery)
14. [Data Loss Scenarios and Mitigations](#14-data-loss-scenarios-and-mitigations)
15. [Emergency Contacts and Escalation](#15-emergency-contacts-and-escalation)

---

## 1. Overview

This document covers all recovery procedures for Quantum_Shield, from individual user recovery to server infrastructure disaster recovery. Recovery procedures are organized from most common to least common scenarios.

### Recovery Hierarchy

```
Level 1: Self-Service Recovery (user can resolve independently)
  - Wrong password lockout (wait for backoff timer)
  - Vault not detected (re-mount partition)
  - Companion service issues (restart service)

Level 2: Recovery Phrase Required
  - Forgotten master password
  - Self-destruct triggered

Level 3: IT Support Required
  - Corrupted vault (dual-index recovery)
  - Lost FIDO2 hardware key
  - USB drive failure

Level 4: Infrastructure Recovery (admin/DevOps)
  - Database failure
  - S3 outage
  - Complete cluster failure
```

---

## 2. Recovery Phrase

### What It Is

The recovery phrase is a set of 24 words generated during vault provisioning. It encodes the Master Encryption Key (MEK) using Shamir's Secret Sharing, allowing vault recovery when the password is lost.

### How It Works

During vault provisioning, the 64-byte MEK is split into 5 shares using a 3-of-5 threshold Shamir's Secret Sharing scheme over GF(256). The recovery phrase encodes 3 of these shares -- the minimum needed for reconstruction.

### Critical Rules

1. **Write it down on paper** -- never store it digitally
2. **Store it in a secure location** -- safe, safety deposit box, or with a trusted person
3. **Never share it** -- anyone with the recovery phrase can reconstruct your MEK
4. **It is shown only once** -- the app does not store or display it again
5. **Keep it separate from your USB drive** -- if your USB is stolen, the phrase should not be with it

### What Happens If You Lose It

If you lose both your password and your recovery phrase, your vault data is **permanently inaccessible**. This is a fundamental security property, not a bug. The system is designed so that no one -- not even USBVault -- can recover your data without these credentials.

### Recovery Phrase Format

The phrase consists of 24 words from a standardized word list. Each word maps to a specific byte value, encoding the 3 Shamir shares needed for MEK reconstruction.

---

## 3. Forgotten Master Password

### Prerequisites

- You have your 24-word recovery phrase
- Your USB drive with VAULT.bin is accessible
- The vault has not been self-destructed

### Recovery Steps

1. Open USBVault and navigate to the recovery screen
2. Select "Forgot Password" or "Recover Vault"
3. Enter your 24-word recovery phrase
4. The system reconstructs the MEK from the Shamir shares
5. You are prompted to set a new master password (minimum 15 characters)
6. The system:
   a. Derives a new KEK from the new password (Argon2id, 64 MiB)
   b. Re-wraps the MEK with the new KEK (XChaCha20-Poly1305)
   c. Updates the vault header with the new wrapped MEK and new salt
   d. Increments the state version counter
   e. Recomputes the header HMAC
7. Your vault is accessible with the new password
8. **A new recovery phrase is generated** -- write it down and store it securely

### What This Does NOT Require

- Re-encrypting any file data (MEK remains the same; only the wrapper changes)
- Server connectivity (recovery works fully offline)
- FIDO2 hardware key (recovery bypasses 2FA)

### Time Required

Less than 5 seconds. The operation is O(1) because only the MEK wrapper is updated, not the encrypted data.

---

## 4. Lost FIDO2 Hardware Key

### Recovery Path 1: Recovery Blob (Preferred)

The vault header's TFA block contains an encrypted recovery blob that allows access without the hardware key.

**Steps**:
1. Enter your master password when prompted
2. When the hardware key prompt appears, select "Lost Key" or "Use Recovery"
3. The system uses the AES-GCM-SIV encrypted recovery blob from the vault header
4. Vault unlocks without the hardware key
5. Navigate to Settings > Security > FIDO2 Keys
6. Remove the lost key credential
7. Register a new hardware key (recommended)

### Recovery Path 2: Recovery Phrase

If the recovery blob is not available:
1. Follow the forgotten password recovery procedure (Section 3)
2. The recovery phrase bypasses all authentication factors including FIDO2
3. Set a new password and optionally register a new hardware key

### Recovery Path 3: Recovery Codes (Server-Side)

If using cloud-connected mode with recovery codes:
1. Navigate to the login screen
2. Select "Use Recovery Code"
3. Enter one of your 10 recovery codes
4. The code is verified against stored SHA-256 hashes using constant-time comparison
5. The used code is marked as consumed (single-use)
6. Access is granted; register a new FIDO2 key

### Prevention

- Always register at least two hardware keys (primary + backup)
- Store backup key in a separate secure location
- Generate and save recovery codes when setting up FIDO2

---

## 5. Corrupted Vault (Dual-Index Recovery)

### How Dual-Index Works

USBVault maintains two copies of the vault index in the header:

```
VAULT.bin Layout:
+------------------+
| V4 Header (24KB) |
|  - Index 1 ptr   |  <-- Active slot (e.g., slot 0)
|  - Index 2 ptr   |  <-- Backup slot (e.g., slot 1)
|  - Commit counter|
|  - State version |
+------------------+
| Encrypted Records|
| (append-only)    |
+------------------+
| Index Slot 1     |
+------------------+
| Index Slot 2     |
+------------------+
```

### Automatic Recovery

When opening a vault:
1. The system reads the `active_index_slot` from the header
2. It attempts to decrypt and parse the active index
3. If the active index is corrupted:
   a. The system tries the backup index slot
   b. If the backup is valid, it becomes the active slot
   c. The commit counter determines which slot is newer
4. If both indexes are valid, the one with the higher commit counter is used

### Manual Recovery (IT Support)

If automatic recovery fails:

1. **Read the raw header**:
   ```
   GET /usb/vault/container/header
   ```

2. **Check both index slots**:
   - Index 1: offset at header bytes (after commit counter area), length from header
   - Index 2: offset and length from header

3. **Attempt decryption of each slot** with the MEK encryption key

4. **If both indexes are corrupted but data records exist**:
   - The encrypted data records are intact (append-only, never overwritten)
   - A recovery tool can scan VAULT.bin for V2RC magic bytes (`"V2RC"`) to find record boundaries
   - Each record's metadata chunk contains the filename and data length
   - Records can be individually decrypted if the MEK is available

### Prevention

- Vault compaction creates fresh indexes from live data
- Always use "Eject" (never pull the USB without ejecting)
- The `fsync` call after every write ensures data reaches the USB's flash storage

---

## 6. Key Hierarchy Recovery

### Understanding the Key Hierarchy

```
                    Recovery Phrase (24 words)
                           |
                    Shamir Reconstruct (3-of-5)
                           |
                           v
Password ----> Argon2id ----> KEK ----> unwrap ----> MEK (64 bytes)
                                                      |
                                              enc_key + hmac_key
                                                      |
                                              Per-file keys (HKDF)
```

### Scenario: Wrapped MEK Damaged

If the `wrapped_mek` field in the header is corrupted:

1. Use the recovery phrase to reconstruct the MEK directly
2. Generate a new KEK from a new password
3. Re-wrap the MEK and write a new header
4. All encrypted data remains accessible (per-file keys derive from the same MEK)

### Scenario: Header Salt Damaged

If the Argon2id salt is corrupted:

1. The KEK cannot be derived from the password (salt is required)
2. Use the recovery phrase to reconstruct the MEK directly
3. Generate a new salt, derive a new KEK, re-wrap the MEK
4. Write the new header with the new salt and wrapped MEK

### Scenario: Server Key Hierarchy Record Lost

If the server's `key_hierarchy` table record is lost (cloud-connected mode):

1. The client can re-upload the wrapped MEK and KEK salt from the vault header
2. `POST /api/v1/vaults/{vaultID}/key-hierarchy` with the wrapped MEK and salt
3. No data loss -- the master copy of the wrapped MEK is in VAULT.bin on the USB

### Key Rotation Recovery

If a key rotation job fails mid-way:

1. Check rotation status: `GET /api/v1/vaults/{vaultID}/rotation-status`
2. Possible statuses: `pending`, `in_progress`, `completed`, `failed`, `rolled_back`
3. If `failed`: some files may use the old key, some the new key
4. The rotation job tracks `total_files`, `processed_files`, and `failed_files`
5. A new rotation can be initiated to complete the process

---

## 7. Self-Destruct Recovery

### What Happens During Self-Destruct

When `fail_count >= 10` (MAX_FAIL_ATTEMPTS):

1. The `wrapped_mek` field in the header is overwritten 3 times:
   - Pass 1: Fill with OsRng random bytes
   - Pass 2: Fill with zeros
   - Pass 3: Fill with OsRng random bytes
2. State version is incremented
3. Header HMAC is recomputed
4. Header is written to VAULT.bin

After self-destruct, the MEK is permanently destroyed. The encrypted data records remain in VAULT.bin but cannot be decrypted.

### Recovery Options

**Option 1: Cloud Backup** (cloud-connected mode only)
1. Log in to your USBVault account on a new device
2. Navigate to Restore
3. Select the most recent backup
4. Create a new vault with a new password
5. Encrypted blobs are downloaded from S3 and re-keyed

**Option 2: Manual Backup Copy**
If you previously copied VAULT.bin to another location:
1. Copy the backup VAULT.bin to a new USB drive's SECURE partition
2. Open the vault with the original password
3. The backup copy's wrapped MEK is intact (pre-self-destruct)

**Option 3: Recovery Phrase** (only if you have the phrase AND a backup of the encrypted data)
1. The recovery phrase reconstructs the MEK
2. But the encrypted data records in the self-destructed VAULT.bin are still accessible (the records are not overwritten, only the MEK wrapper)
3. Use the reconstructed MEK to decrypt the existing records
4. Create a new vault header with a new wrapped MEK

**Important**: If you have neither a backup nor the recovery phrase, the vault is permanently and irrecoverably destroyed. This is the intended behavior for protecting against brute-force attacks.

---

## 8. Wrong Password Lockout

### Exponential Backoff Schedule

| Failed Attempts | Wait Time |
|-----------------|-----------|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4 | 8 seconds |
| 5 | 16 seconds |
| 6 | 32 seconds |
| 7 | 64 seconds (~1 minute) |
| 8 | 128 seconds (~2 minutes) |
| 9 | 256 seconds (~4 minutes) |
| 10 | **SELF-DESTRUCT** |

Formula: `min(2^failCount * 1000ms, 3,600,000ms)` (capped at 1 hour)

### Resolution

- **Wait**: The backoff timer is enforced by the client. Wait for the timer to expire.
- **Different session**: Open the vault on a different device or browser session. The fail counter is stored in the vault header, so it applies regardless of session.
- **Correct password**: Successfully entering the correct password resets the fail counter to 0.
- **Recovery phrase**: If you cannot remember the password, use the recovery phrase (Section 3).

### Fail Counter Integrity

The fail counter is protected by a domain-separated HMAC:
```
HMAC-SHA256(hmac_key, "USBVault-FailCounter-v1:" || counter_le_bytes)
```

If the HMAC does not match (e.g., someone manually edited the counter), the vault rejects the unlock attempt with `ERR_FAIL_COUNTER_TAMPERED`.

---

## 9. USB Drive Failure

### Symptoms

- USB drive not recognized by the operating system
- Read/write errors when accessing VAULT.bin
- SECURE partition cannot be mounted

### Recovery Options

**Cloud-Connected Mode**:
1. Log in to your USBVault account
2. Navigate to Restore > Cloud Backup
3. Select the latest backup
4. Provision a new USB drive
5. Restore the vault to the new drive

**USB-Only Mode**:
1. If you have a manual backup copy of VAULT.bin, copy it to a new USB drive
2. Provision a new USB drive with the same password
3. Replace the empty VAULT.bin with your backup copy
4. If no backup exists, data is **permanently lost**

### Prevention

- Use cloud-connected mode for automatic backups
- Periodically copy VAULT.bin to a secure backup location
- Use quality USB drives from reputable manufacturers
- Avoid removing the USB drive without proper ejection

### Data Recovery Services

Standard data recovery services cannot help because:
- VAULT.bin content is encrypted
- Even if the flash memory is recovered, the data cannot be decrypted without the password or recovery phrase

---

## 10. Vault Not Detected

### Common Causes and Solutions

| Cause | Solution |
|-------|---------|
| SECURE partition not mounted | Navigate to Find Vault; the companion will attempt to mount |
| VAULT.bin moved or deleted | Check SECURE partition root for VAULT.bin |
| Wrong USB drive | Verify the correct drive is selected in the app |
| File system corruption | Run file system check (`fsck.exfat` on Linux, `chkdsk` on Windows) |
| Companion not running | Start the companion service (Section 11) |

### Manual Mount Procedure

**macOS**:
```bash
diskutil list external  # Find the SECURE partition identifier
diskutil mount diskXsY  # Mount the SECURE partition
```

**Linux**:
```bash
lsblk                              # Find the SECURE partition
udisksctl mount -b /dev/sdX2       # Mount the partition
```

**Windows** (PowerShell as Administrator):
```powershell
Get-Partition -DiskNumber X        # Find the SECURE partition
Add-PartitionAccessPath -DiskNumber X -PartitionNumber 2 -AccessPath "S:\"
```

### Verifying VAULT.bin

Once the SECURE partition is mounted, verify:
1. VAULT.bin exists in the partition root
2. File size is at least 24,576 bytes (V4 header minimum)
3. First 8 bytes are `USBVLT04` (or `USBVLT02`/`USBVLT03` for older vaults)

---

## 11. Companion Service Issues

### Service Will Not Start

| Symptom | Cause | Resolution |
|---------|-------|-----------|
| `EADDRINUSE` | Port 3001 occupied | Find and stop the conflicting process: `lsof -i :3001` (macOS/Linux) or `netstat -ano \| findstr 3001` (Windows) |
| `MODULE_NOT_FOUND` | Node.js modules missing | Run `npm install` in the companion directory |
| `EACCES` | Permission denied | Run with elevated privileges or configure udev rules (Linux) |
| Node.js not found | Missing from PATH | Use the portable Node.js bundled on the TOOLS partition |

### Service Starts But USB Not Detected

1. Verify the USB drive appears in the OS (Disk Management, diskutil, lsblk)
2. Check companion logs for detection errors
3. Try unplugging and re-inserting the USB drive
4. On Linux: ensure the user is in the `disk` or `plugdev` group

### Service Starts But Vault Operations Fail

1. Check that the SECURE partition is mounted
2. Verify VAULT.bin permissions (read/write for the companion user)
3. Check available disk space on the SECURE partition
4. Review companion logs for specific error messages

---

## 12. Cross-Platform Issues

### Vault Created on Windows, Opened on macOS/Linux

This should work seamlessly because:
- VAULT.bin uses a platform-independent binary format
- ExFAT is universally supported
- Byte ordering is always little-endian (defined in the V4 spec)

### Known Cross-Platform Considerations

| Issue | Cause | Resolution |
|-------|-------|-----------|
| File attributes lost | macOS `chflags` vs Windows `attrib` | Re-apply hiding on the new platform |
| Line endings in scripts | Windows CRLF vs Unix LF | Launchers are platform-specific |
| USB device naming | `/dev/diskX` vs `/dev/sdX` vs `\\.\PhysicalDriveX` | Companion handles per-platform detection |
| ExFAT permissions | Different mount options per OS | Companion normalizes file access |

---

## 13. Server Infrastructure Recovery

### Database Failure

**Symptoms**: API returns 503, health check shows `database: false`

**Recovery Steps**:
1. Check PostgreSQL status and logs
2. If PostgreSQL is down, restart the service
3. If data is corrupted, restore from backup:
   ```bash
   # List available backups
   curl https://api.usbvault.io/api/v1/admin/backups \
     -H "Authorization: Bearer $ADMIN_TOKEN"

   # Restore
   curl -X POST https://api.usbvault.io/api/v1/admin/backups/{id}/restore \
     -H "Authorization: Bearer $ADMIN_TOKEN"
   ```
4. Run migrations after restore to ensure schema is current
5. Verify data integrity

**RTO**: < 5 minutes (with backup) | **RPO**: Last backup timestamp

### Redis Failure

**Symptoms**: Rate limiting disabled, sessions lost, sync interrupted

**Recovery Steps**:
1. Check Redis status
2. If using Sentinel: failover should be automatic
3. If single instance: restart Redis
4. Sessions will be regenerated (users need to re-login)
5. Rate limit counters reset (temporary increase in allowed requests)

**RTO**: < 1 minute | **RPO**: Session data (regenerated)

### S3 Outage

**Symptoms**: File uploads/downloads fail, circuit breaker opens

**Recovery Steps**:
1. Check S3 endpoint status
2. Circuit breaker automatically retries after 30-second timeout
3. If S3 is unavailable for extended period:
   - File operations are queued client-side (offline queue)
   - Users can continue working with locally cached files
4. When S3 recovers, queued operations are automatically retried

**RTO**: Automatic (circuit breaker) | **RPO**: 0 (data already written before outage)

### Complete Cluster Failure

**Recovery Steps**:
1. Rebuild Kubernetes cluster
2. Apply secrets:
   ```bash
   kubectl create secret generic usbvault-secrets --namespace usbvault ...
   ```
3. Apply deployment manifests:
   ```bash
   kubectl apply -f deploy/k8s/deployment.yaml
   ```
4. Restore database from S3 backup
5. Verify all health checks pass
6. DNS cutover to new cluster

**RTO**: < 1 hour | **RPO**: Last database backup

---

## 14. Data Loss Scenarios and Mitigations

### Scenario Matrix

| Scenario | Data at Risk | Recovery Path | Prevention |
|----------|-------------|---------------|-----------|
| Forgotten password | All vault data | Recovery phrase | Write down and store phrase securely |
| Lost recovery phrase + forgotten password | All vault data | **NONE** -- permanent loss | Store phrase in separate secure location |
| Self-destruct triggered | All vault data | Cloud backup or manual backup copy | Use strong password; do not share USB |
| USB drive physical failure | Local vault data | Cloud backup (if cloud-connected) | Use cloud mode; periodic manual backups |
| Database corruption | Server metadata | Database backup restore | Automated backups to S3 |
| S3 data loss | Cloud-stored encrypted blobs | S3 replication/backup | Cross-region replication |
| Account deletion | Server data (not USB data) | **NONE** -- intentional | Confirm before deleting |
| Key rotation failure | In-progress files | Retry rotation | Rotation jobs track per-file progress |
| Vault header corruption | Index and metadata | Dual-index fallback | Always eject properly; fsync |
| Both index slots corrupted | File listing | Raw record scanning | Vault compaction; proper ejection |

### Unrecoverable Scenarios

The following scenarios result in permanent, irrecoverable data loss by design:

1. **Forgotten password + lost recovery phrase**: No entity (including USBVault) can recover the data
2. **Self-destruct + no backup + no recovery phrase**: MEK is destroyed; data is cryptographically inaccessible
3. **USB drive destroyed + USB-only mode**: No backup exists outside the physical device

These are features, not bugs. They ensure that even under legal compulsion or physical seizure, data cannot be accessed without the user's credentials.

---

## 15. Emergency Contacts and Escalation

### User Support

- **Self-service**: In-app Help section, FAQ (DOC-003 Section 19)
- **Knowledge base**: Available at support.usbvault.io
- **Email support**: support@usbvault.io

### Security Incidents

- **Email**: security@usbvault.io
- **Response time**: 48-hour acknowledgment
- **PGP key**: Available at `https://usbvault.io/.well-known/pgp-key.txt`

### IT Administrator Escalation

| Severity | Response Time | Channel |
|----------|--------------|---------|
| Critical (data loss, security breach) | 1 hour | security@usbvault.io |
| High (service outage) | 4 hours | support@usbvault.io |
| Medium (degraded performance) | 24 hours | support@usbvault.io |
| Low (feature request, question) | 72 hours | support@usbvault.io |

---

## Cross-References

- **DOC-001**: Technical Specification (V4 header format, Shamir implementation, fail counter protocol)
- **DOC-002**: Architecture and System Design (disaster recovery architecture, backup strategy)
- **DOC-003**: User Manual (user-facing recovery instructions, FAQ)
- **DOC-004**: IT Deployment Guide (backup procedures, database configuration)
- **DOC-006**: Security Audit Package (self-destruct mechanism, key lifecycle)
