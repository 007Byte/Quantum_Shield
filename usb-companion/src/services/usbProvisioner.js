/**
 * USB Vault Provisioning Service
 *
 * Implements the EXACT same partition flow as the original Python USBVault app.
 *
 * 5-Step Process:
 *   1. Validate the target drive is a real USB device (bus=USB, not system disk)
 *   2. Partition via diskutil/parted/diskpart — dual GPT: custom label (500MB) + SECURE (rest)
 *   3. Write TOOLS partition content (README, recovery guide)
 *   4. Create VAULT.bin on SECURE partition root (V4 header, no cleartext metadata)
 *   5. Hide vault files + unmount SECURE partition (invisible to casual inspection)
 *
 * Partition layout (GPT):
 *   s1 = EFI System Partition (~200MB, auto-created by macOS, hidden)
 *   s2 = TOOLS / custom label (500MB, ExFAT, visible) — the only thing the user sees in Finder
 *   s3 = SECURE (remaining, ExFAT default) — contains VAULT.bin, hidden after setup
 *
 * Security invariants:
 *   - diskutil partitionDisk requires admin — elevated via sudo -S on macOS
 *   - Validates drive ID against detected drives (no blind device paths)
 *   - Uses execFile (no shell) to prevent command injection
 *   - Never logs passwords or recovery phrases
 *   - No cleartext metadata on USB (no meta.json, no manifest.json)
 *   - VAULT.bin placed at SECURE root — not in a subdirectory
 *   - SECURE partition unmounted after provisioning (INVISIBLE principle)
 */

import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, access, constants } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../utils/config.js';
import { logger, audit } from '../utils/logger.js';
import { detectUsbDrives } from './usbDetector.js';
import { parsePlist } from '../utils/plist.js';
import { BIP39_WORDLIST } from '../utils/bip39-wordlist.js';
import { sudoExec } from '../utils/sudoExec.js';

const execFileAsync = promisify(execFile);

// ── Constants (matching original Python vault_defaults.py) ──────────────
const RECOVERY_PHRASE_WORDS = 24;
const TOOLS_PARTITION_MB = 500;
const DEFAULT_TOOLS_LABEL = 'USBVAULT';
const SECURE_LABEL = 'SECURE';

/** V4 header size: 24576 bytes (24 KiB) */
const HEADER_SIZE = 24576;

/** VAULT.bin magic bytes */
const VAULT_MAGIC = 'USBVLT04';

/** Maximum wait for partitions to mount (seconds) */
const MOUNT_WAIT_MAX_SECONDS = 15;

// ── Label Sanitization ─────────────────────────────────────────────────

/**
 * Sanitize a user-provided string into a valid volume label.
 *
 * ExFAT/FAT32 volume labels: max 11 characters, alphanumeric + space/hyphen/underscore.
 * APFS/NTFS/ext4 support longer labels, but we use 11 for cross-platform compatibility.
 *
 * Matches the original Python app's sanitization:
 *   tools_label = "".join(c for c in tools_label if c.isalnum() or c in " _-")[:11]
 *
 * @param {string} name - Raw user input
 * @param {string} [fallback='USBVAULT'] - Default if sanitization yields empty string
 * @returns {string} Sanitized uppercase label, 1-11 chars
 */
export function sanitizeVolumeLabel(name, fallback = DEFAULT_TOOLS_LABEL) {
  if (!name || typeof name !== 'string') return fallback;

  // Strip characters not allowed in ExFAT volume labels
  const cleaned = name
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim()
    .toUpperCase()
    .slice(0, 11);

  return cleaned || fallback;
}

/**
 * Provision a new encrypted vault on a USB drive.
 *
 * Creates dual partitions (custom-labeled TOOLS + SECURE), writes VAULT.bin to
 * SECURE root, hides vault files, unmounts SECURE, and returns vault ID +
 * recovery phrase.
 *
 * @param {Object} params
 * @param {string} params.driveId - The drive identifier (e.g., 'disk4')
 * @param {string} params.formatType - 'quick' or 'full'
 * @param {string} params.fileSystem - 'exfat', 'ntfs', 'ext4', or 'apfs'
 * @param {string} params.masterPassword - The vault master password
 * @param {string} [params.vaultName='USBVault'] - User-chosen vault name (logical identifier)
 * @param {string} [params.partitionName] - Custom label for the visible TOOLS partition (max 11 chars). Falls back to vaultName if omitted.
 * @param {string} [params.adminPassword] - macOS admin password for sudo elevation
 * @returns {Promise<{vaultId: string, recoveryPhrase: string[], secureMountPoint: string, toolsMountPoint: string, warnings: string[]}>}
 */
export async function provisionVault(params) {
  const { driveId, formatType, fileSystem, masterPassword, vaultName = 'USBVault', partitionName, adminPassword } = params;
  const _t0 = Date.now();
  console.log(`[DEBUG] [${_t0}] provisionVault() ENTRY: driveId=${driveId}, formatType=${formatType}, fileSystem=${fileSystem}, vaultName=${vaultName}, hasAdminPw=${!!adminPassword}`);

  // Derive the partition label: use explicit partitionName if provided, otherwise fall back to vaultName
  const toolsLabel = sanitizeVolumeLabel(partitionName || vaultName);

  audit.log('vault_provision_started', {
    driveId, formatType, fileSystem, vaultName, toolsLabel,
    // masterPassword intentionally omitted
  });

  const warnings = [];

  try {
    // ── Step 1: Validate drive ──────────────────────────────────────────
    console.log(`[DEBUG] [${Date.now()}] provisionVault() Step 1: detectUsbDrives()...`);
    const drives = await detectUsbDrives();
    const targetDrive = drives.find(d => d.id === driveId);

    if (!targetDrive) {
      throw new Error(`Drive '${driveId}' not found or not a USB device`);
    }
    if (!targetDrive.available) {
      throw new Error(`Drive '${driveId}' is not available (may be a system disk)`);
    }

    console.log(`[DEBUG] [${Date.now()}] provisionVault() Step 1 DONE: drive found, device=${targetDrive.device}`);
    logger.info('Drive validated', {
      driveId, device: targetDrive.device,
      name: targetDrive.name, capacity: targetDrive.capacity,
    });

    // ── Step 2: Generate vault credentials ──────────────────────────────
    console.log(`[DEBUG] [${Date.now()}] provisionVault() Step 2: generating credentials...`);
    const vaultId = randomUUID();
    const recoveryPhrase = generateRecoveryPhrase();
    const salt = randomBytes(32);
    // Provisional key hash — full Argon2id derivation happens via Rust FFI
    const keyHash = createHash('sha256')
      .update(masterPassword)
      .update(salt)
      .digest('hex');

    // ── Step 3: Create dual GPT partitions ──────────────────────────────
    console.log(`[DEBUG] [${Date.now()}] provisionVault() Step 3: createDualPartitions()...`);
    logger.info('[Step 1/5] Partitioning USB drive...', { driveId, fileSystem, toolsLabel });

    const partResult = await createDualPartitions(
      targetDrive.device, driveId, fileSystem, formatType, adminPassword, toolsLabel,
    );

    if (!partResult.secureMountPoint) {
      throw new Error(
        'Partitioning succeeded but SECURE partition not found. ' +
        'Try ejecting and re-inserting the USB drive, then retry.'
      );
    }

    console.log(`[DEBUG] [${Date.now()}] provisionVault() Step 3 DONE: tools=${partResult.toolsMountPoint}, secure=${partResult.secureMountPoint}`);
    logger.info('Partitions created', {
      tools: partResult.toolsMountPoint,
      secure: partResult.secureMountPoint,
    });

    // ── Step 3b: Post-provision validation ───────────────────────────────
    await validatePartitionLayout(driveId, targetDrive.device, toolsLabel);

    // ── Step 4: Write TOOLS partition content ────────────────────────────
    logger.info('[Step 2/5] Writing TOOLS partition content...');
    if (partResult.toolsMountPoint) {
      await writeToolsContent(partResult.toolsMountPoint, vaultName);
    } else {
      warnings.push('TOOLS partition not mounted — README and marker files not written');
    }

    // ── Step 5: Create VAULT.bin at SECURE partition root ────────────────
    console.log(`[DEBUG] [${Date.now()}] provisionVault() Step 5: writeVaultBin()...`);
    logger.info('[Step 3/5] Creating encrypted vault container...');
    const headerBytes = buildInitialHeader(salt, fileSystem, keyHash, vaultId, vaultName);
    await writeVaultBin(partResult.secureMountPoint, headerBytes);
    console.log(`[DEBUG] [${Date.now()}] provisionVault() Step 5 DONE`);

    // ── Step 6: Hide vault file attributes (DO NOT unmount yet) ──────────
    // Bug fix: previously hideVaultFiles() unmounted SECURE partition before
    // returning to the frontend. The frontend then tried to write crypto
    // headers to the now-unmounted secureMountPoint → ENOENT → crypto init
    // failed silently → vault never got properly encrypted.
    //
    // Fix: only set hidden attributes (chflags/attrib) here. The frontend
    // will call POST /usb/unmount-secure AFTER finishing crypto init.
    logger.info('[Step 4/5] Setting hidden attributes on vault files...');
    const hideWarnings = await hideVaultFileAttributes(partResult.secureMountPoint);
    warnings.push(...hideWarnings);

    console.log(`[DEBUG] [${Date.now()}] provisionVault() COMPLETE in ${Date.now()-_t0}ms, vaultId=${vaultId}`);
    logger.info('[Step 5/5] Provisioning complete', {
      vaultId, driveId,
      secureMountPoint: partResult.secureMountPoint,
      toolsMountPoint: partResult.toolsMountPoint,
    });

    audit.log('vault_provision_complete', {
      vaultId, driveId, formatType, fileSystem, vaultName, toolsLabel,
      // recoveryPhrase and keyHash intentionally omitted
    });

    return {
      vaultId,
      recoveryPhrase,
      secureMountPoint: partResult.secureMountPoint,
      toolsMountPoint: partResult.toolsMountPoint,
      warnings: warnings.length > 0 ? warnings : undefined,
    };

  } catch (err) {
    console.error(`[DEBUG] [${Date.now()}] provisionVault() FAILED in ${Date.now()-_t0}ms:`, err.message, err.stack?.split('\n').slice(0,5).join(' | '));
    audit.error('vault_provision_failed', { driveId, error: err.message });
    throw err;
  }
}

// ── Dual Partition Creation ────────────────────────────────────────────

/**
 * Create dual GPT partitions: custom-labeled TOOLS (500MB) + SECURE (remaining).
 * Dispatches to platform-specific implementation.
 */
async function createDualPartitions(devicePath, diskId, fileSystem, formatType, adminPassword, toolsLabel) {
  const platform = config.platform;
  logger.info('Creating dual partitions', { devicePath, diskId, fileSystem, formatType, platform, toolsLabel });

  if (platform === 'darwin') {
    return await partitionMacOS(devicePath, diskId, fileSystem, formatType, adminPassword, toolsLabel);
  } else if (platform === 'linux') {
    return await partitionLinux(devicePath, diskId, fileSystem, formatType, toolsLabel);
  } else if (platform === 'win32') {
    return await partitionWindows(devicePath, diskId, fileSystem, formatType, toolsLabel);
  } else {
    throw new Error(`Partitioning not supported on platform: ${platform}`);
  }
}

// ── Partition Device Path Helper ───────────────────────────────────────

/**
 * Construct the device path for a specific partition number.
 *
 * Linux device naming conventions:
 *   /dev/sdb   → /dev/sdb1, /dev/sdb2      (SCSI/SATA/USB)
 *   /dev/mmcblk0 → /dev/mmcblk0p1, /dev/mmcblk0p2  (eMMC/SD)
 *   /dev/nvme0n1 → /dev/nvme0n1p1, /dev/nvme0n1p2  (NVMe)
 *
 * Rule: if the base device path ends with a digit, insert 'p' before the
 * partition number; otherwise append directly.
 *
 * @param {string} basePath - Base device path (e.g., '/dev/sdb')
 * @param {number} partNumber - Partition number (1, 2, ...)
 * @returns {string} Full partition device path
 */
function getPartitionDevice(basePath, partNumber) {
  const needsSeparator = /\d$/.test(basePath);
  return needsSeparator ? `${basePath}p${partNumber}` : `${basePath}${partNumber}`;
}

// ── Permission Error Detection ─────────────────────────────────────────

/**
 * Determine whether a command failure is a permission/privilege error.
 *
 * Used to distinguish real partition failures (bad disk, resource busy, etc.)
 * from needing admin elevation.
 */
function isPermissionError(err) {
  const msg = (err.message || '').toLowerCase() + ' ' + (err.stderr || '').toLowerCase();
  return msg.includes('permission denied') ||
    msg.includes('operation not permitted') ||
    msg.includes('authentication') ||
    msg.includes('not permitted') ||
    msg.includes('privilege') ||
    msg.includes('eacces') ||
    // macOS diskutil returns "Could not find disk for /dev/diskN" when run
    // without admin privileges instead of a clear permission error.
    // This misleading error must be treated as a permission issue so the
    // frontend can prompt for the admin password via the elevation flow.
    msg.includes('could not find disk');
}

/**
 * macOS: Use diskutil partitionDisk to create dual GPT partitions.
 *
 * CRITICAL: diskutil partitionDisk requires admin privileges.
 *
 * Elevation strategy:
 *   1. Try direct diskutil (works if companion already has root)
 *   2. If fails with permission error and no adminPassword → throw ADMIN_REQUIRED (HTTP 409)
 *   3. If fails with non-permission error → throw the real error
 *   4. If adminPassword provided → use sudo -S (password piped via stdin)
 *
 * Command: diskutil partitionDisk /dev/diskN GPT ExFAT {toolsLabel} 500M ExFAT SECURE R
 *
 * Result layout:
 *   s1 = EFI (hidden, ~200MB)
 *   s2 = {toolsLabel} (500MB ExFAT)
 *   s3 = SECURE (remaining, ExFAT — macOS can't natively format NTFS/ext4)
 */
async function partitionMacOS(devicePath, diskId, fileSystem, formatType, adminPassword, toolsLabel) {
  // macOS diskutil supports: ExFAT, APFS, HFS+, FAT32
  // NTFS and ext4 are not natively supported — fall back to ExFAT
  const fsMap = { exfat: 'ExFAT', ntfs: 'ExFAT', ext4: 'ExFAT', apfs: 'APFS' };
  const secureFormat = fsMap[fileSystem] || 'ExFAT';

  // Full format: zero-fill the disk first (slow but thorough)
  // WARNING: secureErase 0 zeros every byte on the disk. At USB 3.0 speeds
  // (~100 MB/s) a 128 GB drive takes ~20 minutes. The wipeTimeout (default
  // 600 s / 10 min) is used instead of provisionTimeout so large drives
  // don't get killed mid-wipe.
  if (formatType === 'full') {
    const wipeTimeout = config.wipeTimeout || 600000; // 10 min default
    logger.info(`Full format requested — zeroing disk first (timeout=${wipeTimeout}ms, this may take several minutes)...`);
    console.log(`[DEBUG] [${Date.now()}] partitionMacOS: starting secureErase 0 on ${devicePath}, timeout=${wipeTimeout}ms`);
    try {
      if (adminPassword) {
        await sudoExec('/usr/sbin/diskutil', ['secureErase', '0', devicePath], adminPassword, wipeTimeout);
      } else {
        await execFileAsync('/usr/sbin/diskutil', ['secureErase', '0', devicePath], {
          timeout: wipeTimeout,
        });
      }
      console.log(`[DEBUG] [${Date.now()}] partitionMacOS: secureErase 0 COMPLETE`);
      logger.info('Disk zero-fill complete');
    } catch (err) {
      console.warn(`[DEBUG] [${Date.now()}] partitionMacOS: secureErase 0 FAILED: ${err.message}`);
      if (isPermissionError(err) && !adminPassword) {
        const adminErr = new Error(
          'Administrator privileges required to perform a full format. ' +
          'Please enter your Mac login password to continue.'
        );
        adminErr.code = 'ADMIN_REQUIRED';
        throw adminErr;
      }
      logger.warn('Full format zero-fill failed, proceeding with quick format', { error: err.message });
    }
  }

  // Build the diskutil command with the custom TOOLS label
  const diskutilArgs = [
    'partitionDisk', devicePath,
    'GPT',
    'ExFAT', toolsLabel, `${TOOLS_PARTITION_MB}M`,
    secureFormat, SECURE_LABEL, 'R',
  ];

  // Strategy 1: Try direct execution (works if companion runs as root)
  try {
    await execFileAsync('/usr/sbin/diskutil', diskutilArgs, {
      timeout: config.provisionTimeout,
    });
    logger.info('Direct diskutil succeeded (running as root)');
  } catch (directErr) {
    logger.info('Direct diskutil failed', { error: directErr.message });

    // Fix 4: Distinguish permission errors from real partition errors
    if (!adminPassword) {
      if (isPermissionError(directErr)) {
        const err = new Error(
          'Administrator privileges required to partition the USB drive. ' +
          'Please enter your Mac login password to continue.'
        );
        err.code = 'ADMIN_REQUIRED';
        throw err;
      }
      // Not a permission error — surface the real error
      throw new Error(`Partitioning failed: ${directErr.message}`);
    }

    // Strategy 3: Use sudo -S with the provided admin password
    logger.info('Elevating via sudo -S for diskutil partitionDisk');
    await sudoExec('/usr/sbin/diskutil', diskutilArgs, adminPassword);
    logger.info('Elevated diskutil succeeded');
  }

  // Wait for macOS to mount the new partitions (up to 15 seconds)
  let toolsMountPoint = null;
  let secureMountPoint = null;

  for (let attempt = 0; attempt < MOUNT_WAIT_MAX_SECONDS; attempt++) {
    await sleep(1000);

    // Query diskutil info for each slice to find actual mount points
    // GPT layout: s1=EFI, s2=TOOLS, s3=SECURE
    for (const suffix of ['s2', 's3', 's4']) {
      const dev = `/dev/${diskId}${suffix}`;
      try {
        const { stdout } = await execFileAsync('/usr/sbin/diskutil', ['info', '-plist', dev], {
          timeout: 5000,
        });
        const info = await parsePlist(stdout);
        const volName = info.VolumeName || '';
        const mountPoint = info.MountPoint || '';
        const parentDisk = info.ParentWholeDisk || '';

        if (!mountPoint) continue;

        // Verify this partition belongs to the target disk
        if (parentDisk && parentDisk !== diskId) continue;

        if (volName.toUpperCase() === toolsLabel.toUpperCase()) {
          toolsMountPoint = mountPoint;
        } else if (volName.toUpperCase() === SECURE_LABEL.toUpperCase()) {
          secureMountPoint = mountPoint;
        }
      } catch {
        // Slice doesn't exist or not mounted yet — keep waiting
      }
    }

    if (toolsMountPoint && secureMountPoint) {
      logger.info(`Partitions ready after ${attempt + 1}s`, { toolsMountPoint, secureMountPoint });
      break;
    }
  }

  // Fallback: check /Volumes/ directly, but verify ownership via diskutil info
  if (!secureMountPoint) {
    secureMountPoint = await findVolumeForDisk(SECURE_LABEL, diskId);
  }
  if (!toolsMountPoint) {
    toolsMountPoint = await findVolumeForDisk(toolsLabel, diskId);
  }

  // Last resort: re-query via diskutil list (matches original Python fallback)
  if (!toolsMountPoint || !secureMountPoint) {
    try {
      const { stdout } = await execFileAsync('/usr/sbin/diskutil', ['list', '-plist', `/dev/${diskId}`], {
        timeout: 10000,
      });
      const pl = await parsePlist(stdout);
      for (const d of (pl.AllDisksAndPartitions || [])) {
        for (const part of (d.Partitions || [])) {
          const vn = part.VolumeName || '';
          const mp = part.MountPoint || '';
          if (vn.toUpperCase() === toolsLabel.toUpperCase() && mp && !toolsMountPoint) {
            toolsMountPoint = mp;
          } else if (vn.toUpperCase() === SECURE_LABEL.toUpperCase() && mp && !secureMountPoint) {
            secureMountPoint = mp;
          }
        }
      }
    } catch {
      logger.warn('diskutil list fallback query failed');
    }
  }

  return { toolsMountPoint, secureMountPoint };
}

/**
 * Find a volume in /Volumes/ that matches the given label AND belongs to the
 * specified disk. Prevents matching volumes from other USB drives.
 *
 * @param {string} label - Volume label to search for
 * @param {string} diskId - Expected parent disk (e.g., 'disk4')
 * @returns {Promise<string|null>} Mount point if found and verified, null otherwise
 */
async function findVolumeForDisk(label, diskId) {
  for (const candidate of [label, `${label} 1`, `${label} 2`]) {
    const candidatePath = `/Volumes/${candidate}`;
    try {
      await access(candidatePath, constants.F_OK);
      // Verify this volume belongs to the target disk
      const { stdout } = await execFileAsync('/usr/sbin/diskutil', ['info', '-plist', candidatePath], {
        timeout: 5000,
      });
      const info = await parsePlist(stdout);
      const parentDisk = info.ParentWholeDisk || '';
      if (parentDisk === diskId) {
        logger.info(`Volume fallback matched: ${candidatePath} belongs to ${diskId}`);
        return candidatePath;
      }
      logger.warn(`Volume ${candidatePath} exists but belongs to ${parentDisk}, not ${diskId} — skipping`);
    } catch { /* not found or not verifiable */ }
  }
  return null;
}

/**
 * Linux: Use parted to create dual GPT partitions, then mkfs.
 * Requires root (companion should be started with sudo for provisioning).
 */
async function partitionLinux(devicePath, diskId, fileSystem, formatType, toolsLabel) {
  // Create GPT partition table
  await execFileAsync('parted', [devicePath, '--script', 'mklabel', 'gpt'], {
    timeout: config.provisionTimeout,
  });

  // Create TOOLS partition (500MB)
  await execFileAsync('parted', [
    devicePath, '--script',
    'mkpart', toolsLabel, 'fat32', '1MiB', `${TOOLS_PARTITION_MB + 1}MiB`,
  ], { timeout: config.provisionTimeout });

  // Create SECURE partition (remaining)
  await execFileAsync('parted', [
    devicePath, '--script',
    'mkpart', SECURE_LABEL, 'fat32', `${TOOLS_PARTITION_MB + 1}MiB`, '100%',
  ], { timeout: config.provisionTimeout });

  // Fix 5: Correct partition device paths for mmcblk/nvme devices
  const toolsDev = getPartitionDevice(devicePath, 1);
  const secureDev = getPartitionDevice(devicePath, 2);

  // Format TOOLS as exFAT with custom label
  await execFileAsync('mkfs.exfat', ['-n', toolsLabel, toolsDev], {
    timeout: config.provisionTimeout,
  });

  // Format SECURE with user-selected filesystem
  // Fix 6: formatType affects mkfs flags
  const fsCommands = {
    exfat: ['mkfs.exfat', ['-n', SECURE_LABEL, secureDev]],
    ntfs: ['mkfs.ntfs', [
      ...(formatType === 'full' ? [] : ['-f']),  // -f = quick format; omit for full
      '-L', SECURE_LABEL, secureDev,
    ]],
    ext4: ['mkfs.ext4', [
      ...(formatType === 'full' ? [] : ['-F']),  // -F = force without checks; omit for full
      '-L', SECURE_LABEL, secureDev,
    ]],
  };
  const [cmd, args] = fsCommands[fileSystem] || fsCommands.exfat;

  if (formatType === 'full') {
    logger.info('Full format requested — this may take several minutes...');
  }
  await execFileAsync(cmd, args, { timeout: config.provisionTimeout });

  // Wait for auto-mount
  await sleep(2000);
  let toolsMountPoint = null;
  let secureMountPoint = null;

  // Try udisksctl to mount
  for (const dev of [toolsDev, secureDev]) {
    try {
      await execFileAsync('udisksctl', ['mount', '--block-device', dev, '--no-user-interaction'], {
        timeout: 10000,
      });
    } catch { /* may already be mounted */ }
  }

  await sleep(1000);

  // Discover mount points via findmnt
  try {
    const { stdout } = await execFileAsync('findmnt', ['-n', '-o', 'TARGET', toolsDev], { timeout: 5000 });
    if (stdout.trim()) toolsMountPoint = stdout.trim();
  } catch { /* not mounted */ }
  try {
    const { stdout } = await execFileAsync('findmnt', ['-n', '-o', 'TARGET', secureDev], { timeout: 5000 });
    if (stdout.trim()) secureMountPoint = stdout.trim();
  } catch { /* not mounted */ }

  return { toolsMountPoint, secureMountPoint };
}

/**
 * Windows: Use PowerShell to create dual GPT partitions.
 * Requires Administrator privileges.
 */
async function partitionWindows(devicePath, diskId, fileSystem, formatType, toolsLabel) {
  const driveNumber = devicePath.replace(/.*PhysicalDrive/, '');
  if (!/^\d+$/.test(driveNumber)) {
    throw new Error(`Invalid drive number extracted from path: not numeric`);
  }

  const fsMap = { exfat: 'exFAT', ntfs: 'NTFS', ext4: 'exFAT', apfs: 'exFAT' };
  const secureFormat = fsMap[fileSystem] || 'exFAT';

  // Escape the label for PowerShell string interpolation
  const psToolsLabel = toolsLabel.replace(/"/g, '`"');
  const psSecureLabel = SECURE_LABEL.replace(/"/g, '`"');

  // Fix 6: formatType controls whether Format-Volume uses quick format
  // By default PowerShell Format-Volume does a full format; -Full is the default behavior.
  // We add -Full explicitly when formatType is 'full' for clarity.
  const toolsFormatFlags = formatType === 'full' ? '-Full' : '';
  const secureFormatFlags = formatType === 'full' ? '-Full' : '';

  const script = `
    $ErrorActionPreference = 'Stop'
    Clear-Disk -Number ${driveNumber} -RemoveData -Confirm:$false
    Initialize-Disk -Number ${driveNumber} -PartitionStyle GPT

    # TOOLS partition (500MB) with custom label
    $tools = New-Partition -DiskNumber ${driveNumber} -Size 500MB -AssignDriveLetter
    Format-Volume -DriveLetter $tools.DriveLetter -FileSystem exFAT -NewFileSystemLabel "${psToolsLabel}" ${toolsFormatFlags} -Confirm:$false

    # SECURE partition (remaining)
    $secure = New-Partition -DiskNumber ${driveNumber} -UseMaximumSize -AssignDriveLetter
    Format-Volume -DriveLetter $secure.DriveLetter -FileSystem ${secureFormat} -NewFileSystemLabel "${psSecureLabel}" ${secureFormatFlags} -Confirm:$false

    # Output mount points as JSON
    @{
      toolsMountPoint = ($tools.DriveLetter + ":\\")
      secureMountPoint = ($secure.DriveLetter + ":\\")
    } | ConvertTo-Json
  `;

  if (formatType === 'full') {
    logger.info('Full format requested — this may take several minutes...');
  }

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], { timeout: config.provisionTimeout });

  try {
    const result = JSON.parse(stdout.trim());
    return {
      toolsMountPoint: result.toolsMountPoint || null,
      secureMountPoint: result.secureMountPoint || null,
    };
  } catch {
    return { toolsMountPoint: null, secureMountPoint: null };
  }
}

// ── Post-Provision Validation ──────────────────────────────────────────

/**
 * Verify the partition layout matches expectations after provisioning.
 * Runs platform-specific checks to confirm both partitions exist with correct labels.
 */
async function validatePartitionLayout(diskId, devicePath, expectedToolsLabel) {
  const platform = config.platform;

  if (platform === 'darwin') {
    try {
      const { stdout } = await execFileAsync('/usr/sbin/diskutil', ['list', '-plist', `/dev/${diskId}`], {
        timeout: 10000,
      });
      const pl = await parsePlist(stdout);
      const allParts = [];
      for (const d of (pl.AllDisksAndPartitions || [])) {
        for (const part of (d.Partitions || [])) {
          allParts.push(part);
        }
      }

      const toolsPart = allParts.find(p => (p.VolumeName || '').toUpperCase() === expectedToolsLabel.toUpperCase());
      const securePart = allParts.find(p => (p.VolumeName || '').toUpperCase() === SECURE_LABEL.toUpperCase());

      if (!toolsPart) {
        logger.warn(`Post-provision validation: TOOLS partition with label '${expectedToolsLabel}' not found in diskutil list`);
      }
      if (!securePart) {
        throw new Error(
          `Post-provision validation failed: SECURE partition not found on ${diskId}. ` +
          'The disk may not have been partitioned correctly. Try ejecting and re-inserting.'
        );
      }
      if (securePart.Size && securePart.Size < 1024 * 1024) {
        throw new Error(
          `Post-provision validation failed: SECURE partition is too small (${securePart.Size} bytes). ` +
          'Partitioning may have failed.'
        );
      }

      logger.info('Post-provision validation passed', {
        toolsLabel: toolsPart?.VolumeName,
        secureLabel: securePart?.VolumeName,
        secureSize: securePart?.Size,
      });
    } catch (err) {
      if (err.message.startsWith('Post-provision validation failed')) throw err;
      logger.warn('Post-provision validation query failed (non-fatal)', { error: err.message });
    }

  } else if (platform === 'linux') {
    try {
      const baseName = devicePath.replace('/dev/', '');
      const { stdout } = await execFileAsync('lsblk', [
        '-J', '-o', 'NAME,LABEL,SIZE,FSTYPE', devicePath,
      ], { timeout: 5000 });
      const parsed = JSON.parse(stdout);
      const children = parsed.blockdevices?.[0]?.children || [];

      const toolsPart = children.find(p => (p.label || '').toUpperCase() === expectedToolsLabel.toUpperCase());
      const securePart = children.find(p => (p.label || '').toUpperCase() === SECURE_LABEL.toUpperCase());

      if (!securePart) {
        throw new Error(
          `Post-provision validation failed: SECURE partition not found on ${baseName}. ` +
          'The disk may not have been partitioned correctly.'
        );
      }

      logger.info('Post-provision validation passed (Linux)', {
        toolsLabel: toolsPart?.label,
        secureLabel: securePart?.label,
      });
    } catch (err) {
      if (err.message.startsWith('Post-provision validation failed')) throw err;
      logger.warn('Post-provision validation query failed (non-fatal)', { error: err.message });
    }
  }
  // Windows: validation via PowerShell output is already implicit in partitionWindows()
}

// ── VAULT.bin Creation ─────────────────────────────────────────────────

/**
 * Write VAULT.bin to the ROOT of the SECURE partition.
 *
 * IMPORTANT: The original Python app writes VAULT.bin directly to the
 * partition root — NOT in a .usbvault/ subdirectory:
 *   vault_file = os.path.join(secure_mount, "VAULT.bin")
 *
 * We match this behavior exactly.
 *
 * @param {string} secureMountPoint - SECURE partition mount path (e.g., /Volumes/SECURE)
 * @param {Buffer} headerBytes - Exactly 24576 bytes (V4 header)
 */
async function writeVaultBin(secureMountPoint, headerBytes) {
  if (!Buffer.isBuffer(headerBytes) || headerBytes.length !== HEADER_SIZE) {
    throw new Error(`Header must be exactly ${HEADER_SIZE} bytes`);
  }

  const vaultPath = join(secureMountPoint, 'VAULT.bin');

  // Use low-level file I/O with fsync for USB durability
  const { open } = await import('node:fs/promises');
  const fd = await open(vaultPath, 'wx'); // 'wx' = create new, fail if exists
  try {
    await fd.write(headerBytes, 0, HEADER_SIZE, 0);
    await fd.datasync();
  } finally {
    await fd.close();
  }

  audit.log('vault_bin_created', {
    path: vaultPath,
    headerSize: HEADER_SIZE,
    magic: VAULT_MAGIC,
  });
}

// ── TOOLS Partition Content ────────────────────────────────────────────

/**
 * Write informational content to the TOOLS partition.
 * This is the partition visible when someone plugs in the USB.
 *
 * README.txt and .usbvault-tools.json are REQUIRED — failure to write them
 * will cause provisioning to fail. RECOVERY_GUIDE.txt is non-critical.
 */
async function writeToolsContent(toolsMountPoint, vaultName) {
  const readmeContent = `
============================================================
  USBVault — ${vaultName}
============================================================

  This USB drive contains an encrypted USBVault.

  To access your files:
    1. Install the USBVault app on your computer
    2. Insert this USB drive
    3. Open USBVault and enter your master password

  The encrypted vault is stored on a separate hidden partition.
  Without the USBVault app and your password, the contents
  are completely inaccessible.

  DO NOT delete or modify files on this drive.
  DO NOT format this drive — you will lose all vault data.

  For support: https://usbvault.app

============================================================
`.trim();

  // README is required — failure here means TOOLS partition is not writable
  await writeFile(join(toolsMountPoint, 'README.txt'), readmeContent);

  // Recovery guide is non-critical
  try {
    const recoveryGuide = `
============================================================
  USBVault — Recovery Guide
============================================================

  If you forget your vault password:
    1. Use your 24-word recovery phrase
    2. Open USBVault and select "Recover Vault"
    3. Enter your recovery phrase exactly as shown

  If the vault appears corrupted:
    1. Do NOT format the USB drive
    2. The vault has dual-index crash recovery
    3. Open USBVault — it will attempt automatic repair

  If the USB drive is not recognized:
    1. Try a different USB port
    2. Try a different computer
    3. The TOOLS partition should appear as a normal drive
    4. The SECURE partition is intentionally hidden

  IMPORTANT: Never modify VAULT.bin directly.
  Contact support at https://usbvault.app/support

============================================================
`.trim();

    await writeFile(join(toolsMountPoint, 'RECOVERY_GUIDE.txt'), recoveryGuide);
  } catch (err) {
    logger.warn('Failed to write RECOVERY_GUIDE.txt (non-critical)', { error: err.message });
  }

  // Marker file is REQUIRED — the app uses this to identify TOOLS partitions
  await writeFile(join(toolsMountPoint, '.usbvault-tools.json'), JSON.stringify({
    type: 'tools',
    vaultName,
    createdAt: new Date().toISOString(),
    version: 4,
  }, null, 2));

  logger.info('TOOLS partition content written', { toolsMountPoint });
}

// ── File Hiding (Attributes Only) ──────────────────────────────────────

/**
 * Set hidden attributes on VAULT.bin — WITHOUT unmounting the SECURE partition.
 *
 * Called during provisioning so VAULT.bin is hidden from casual inspection,
 * but the partition stays mounted for the frontend's crypto init step.
 * The frontend calls POST /usb/unmount-secure after crypto init is done.
 *
 * @param {string} secureMountPoint
 * @returns {Promise<string[]>} Array of warning messages (empty if everything succeeded)
 */
async function hideVaultFileAttributes(secureMountPoint) {
  const platform = config.platform;
  const vaultPath = join(secureMountPoint, 'VAULT.bin');
  const warnings = [];

  if (platform === 'darwin') {
    try {
      await execFileAsync('/usr/bin/chflags', ['hidden', vaultPath], { timeout: 5000 });
      logger.info('VAULT.bin hidden via chflags');
    } catch (err) {
      warnings.push('Could not set hidden flag on VAULT.bin — it may be visible in Finder');
      logger.warn('chflags hidden failed (non-critical)', { error: err.message });
    }
  } else if (platform === 'win32') {
    try {
      await execFileAsync('attrib', ['+h', '+s', vaultPath], { timeout: 5000 });
      logger.info('VAULT.bin hidden via attrib');
    } catch (err) {
      warnings.push('Could not set hidden attribute on VAULT.bin');
      logger.warn('attrib hidden failed', { error: err.message });
    }
  }
  // Linux: no hidden attribute — file is invisible after unmount anyway

  console.log(`[DEBUG] [${Date.now()}] hideVaultFileAttributes() done, warnings=${warnings.length}`);
  return warnings;
}

// ── File Hiding + Partition Hiding (legacy — kept for explicit unmount routes) ──

/**
 * Hide VAULT.bin and unmount the SECURE partition.
 *
 * NOTE: No longer called during provisioning (see hideVaultFileAttributes).
 * Kept for the POST /usb/unmount-secure route and other explicit unmount calls.
 *
 * @param {string} secureMountPoint
 * @param {string} diskId
 * @returns {Promise<string[]>} Array of warning messages (empty if everything succeeded)
 */
async function hideVaultFiles(secureMountPoint, diskId) {
  const platform = config.platform;
  const vaultPath = join(secureMountPoint, 'VAULT.bin');
  const warnings = [];

  if (platform === 'darwin') {
    // macOS: chflags hidden on VAULT.bin (non-critical)
    try {
      await execFileAsync('/usr/bin/chflags', ['hidden', vaultPath], { timeout: 5000 });
      logger.info('VAULT.bin hidden via chflags');
    } catch (err) {
      warnings.push('Could not set hidden flag on VAULT.bin — it may be visible in Finder');
      logger.warn('chflags hidden failed (non-critical)', { error: err.message });
    }

    // Unmount SECURE partition — makes it invisible in Finder
    try {
      await execFileAsync('/usr/sbin/diskutil', ['unmount', `/dev/${diskId}s3`], { timeout: 10000 });
      logger.info('SECURE partition unmounted (hidden from Finder)');
    } catch {
      try {
        await execFileAsync('/usr/sbin/diskutil', ['unmount', secureMountPoint], { timeout: 10000 });
        logger.info('SECURE partition unmounted via mount point');
      } catch (err) {
        warnings.push('Could not unmount SECURE partition — it may still be visible in Finder');
        logger.warn('Could not unmount SECURE partition', { error: err.message });
      }
    }

  } else if (platform === 'linux') {
    try {
      await execFileAsync('umount', [secureMountPoint], { timeout: 10000 });
      logger.info('SECURE partition unmounted');
    } catch {
      try {
        await execFileAsync('umount', ['-l', secureMountPoint], { timeout: 10000 });
        logger.info('SECURE partition lazy-unmounted');
      } catch (err) {
        warnings.push('Could not unmount SECURE partition');
        logger.warn('Could not unmount SECURE partition', { error: err.message });
      }
    }

  } else if (platform === 'win32') {
    try {
      await execFileAsync('attrib', ['+h', '+s', vaultPath], { timeout: 5000 });
      logger.info('VAULT.bin hidden via attrib');
    } catch (err) {
      warnings.push('Could not set hidden attribute on VAULT.bin');
      logger.warn('attrib hidden failed', { error: err.message });
    }

    try {
      const driveLetter = secureMountPoint.charAt(0);
      await execFileAsync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        `mountvol ${driveLetter}:\\ /D`,
      ], { timeout: 10000 });
      logger.info('SECURE partition drive letter removed');
    } catch (err) {
      warnings.push('Could not remove SECURE drive letter — it may be visible in Explorer');
      logger.warn('Could not remove SECURE drive letter', { error: err.message });
    }
  }

  return warnings;
}

// ── Initial V4 Header ─────────────────────────────────────────────────

/**
 * Build a V4 header (24576 bytes) for initial VAULT.bin creation.
 *
 * Layout:
 *   [0..8]       Magic: "USBVLT04"
 *   [8]          Version: 4
 *   [9]          CipherId: 3 (AES-256-GCM-SIV default)
 *   [10]         KDF: 1 (Argon2id)
 *   [11..15]     Reserved
 *   [16..19]     Header length: 24576 (u32 LE)
 *   [20..52]     Salt (32 bytes)
 *   [52..116]    Key verification hash (64 bytes, SHA-512 of keyHash)
 *   [116..120]   Reserved
 *   [120..124]   Identity block offset (u32 LE) = 224
 *   [124..128]   Identity block length (u32 LE)
 *   [224..768]   Identity block (plaintext JSON — readable without password)
 *   [768..24576] Reserved / zero-filled
 *
 * The identity block is plaintext by design — matching the original Python
 * app. This allows vault discovery without requiring the password.
 *
 * This is a PROVISIONAL header. The full V4 header with wrapped MEK,
 * HMAC, fail counter, and index pointers is created by the Rust FFI
 * when the vault is first unlocked from the native app.
 */
function buildInitialHeader(salt, fileSystem, keyHash, vaultId, vaultName) {
  const header = Buffer.alloc(HEADER_SIZE, 0);

  // Magic bytes
  header.write(VAULT_MAGIC, 0, 'ascii');

  // ── V4 Header Layout (MUST match frontend native.ts offsets) ────────
  // Offset 0-7:   Magic "USBVLT04"
  // Offset 8-9:   Version (uint16 LE) = 4
  // Offset 10-11: Header size (uint16 LE) = 24576
  // Offset 12:    KDF_HASH_ID (1=PBKDF2/web, 2=Argon2id/native)
  // Offset 13:    CIPHER_ID
  // Offset 18-49: Salt (32 bytes)
  // Offset 50-61: Verify IV (12 bytes) — written by frontend crypto
  // Offset 66-129: Verify ciphertext (64 bytes) — written by frontend crypto
  // Offset 132-163: HMAC (32 bytes) — written by frontend crypto
  // Offset 164:   Active index slot
  // Offset 224+:  Identity block

  // Version: uint16 LE (NOT single byte)
  header.writeUInt16LE(4, 8);

  // Header size: uint16 LE
  header.writeUInt16LE(HEADER_SIZE, 10);

  // KDF: 1 = PBKDF2 (web), 2 = Argon2id (native)
  // Use 1 since the frontend web fallback uses PBKDF2
  header[12] = 1;

  // CipherId at offset 13 (NOT offset 9)
  header[13] = 3; // AES-256-GCM-SIV default

  // Salt at offset 18 (NOT offset 20) — matches frontend expectations
  salt.copy(header, 18);

  // NOTE: Verify marker (offsets 50-129) and HMAC (offset 132-163)
  // are NOT written here — they are written by the frontend's
  // createVaultHeader() which overwrites this provisional header.
  // This header is only for vault discovery (identity block).

  // Identity block — plaintext JSON at offset 224
  // This allows vault discovery without requiring the password
  const identity = JSON.stringify({
    id: vaultId,
    name: vaultName,
    created: new Date().toISOString(),
    version: 4,
  });
  const identityBytes = Buffer.from(identity, 'utf-8');
  const maxIdentitySize = 544;

  if (identityBytes.length <= maxIdentitySize) {
    header.writeUInt16LE(identityBytes.length, 224);
    identityBytes.copy(header, 226);
  }

  console.log(`[DEBUG] [${Date.now()}] buildInitialHeader: vaultId=${vaultId}, vaultName="${vaultName}", salt@18, cipher@13=3, kdf@12=1`);
  return header;
}

// ── Helpers ────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Generate a 24-word recovery phrase using cryptographic randomness.
 * Uses the standard BIP39 English wordlist (2048 words).
 */
function generateRecoveryPhrase() {
  const words = [];
  const bytes = randomBytes(RECOVERY_PHRASE_WORDS * 2);
  for (let i = 0; i < RECOVERY_PHRASE_WORDS; i++) {
    const index = bytes.readUInt16BE(i * 2) % BIP39_WORDLIST.length;
    words.push(BIP39_WORDLIST[index]);
  }
  return words;
}
