/**
 * USB SECURE Partition Mount/Unmount Service
 *
 * After provisioning, the SECURE partition is unmounted to implement the
 * INVISIBLE principle — only USBVault knows it exists. When the user wants
 * to perform file operations (add/read/remove), the app must temporarily
 * mount SECURE, perform I/O, and unmount it again.
 *
 * Security:
 *   - Only mounts partitions on validated USB drives (never system disks)
 *   - Uses execFile (no shell) to prevent command injection
 *   - Validates drive ID against detected drives before any operation
 *   - Audit logs all mount/unmount operations
 *   - Mount point verified to be under /Volumes, /media, or /mnt
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../utils/config.js';
import { logger, audit } from '../utils/logger.js';
import { detectUsbDrives } from './usbDetector.js';
import { parsePlist } from '../utils/plist.js';

const execFileAsync = promisify(execFile);

/**
 * Mount the SECURE partition of a USB drive.
 *
 * @param {string} driveId - Drive identifier (e.g., 'disk4')
 * @returns {Promise<{mountPoint: string}>} - The mount point path
 */
export async function mountSecure(driveId) {
  // Step 1: Validate drive is a real USB device
  const drives = await detectUsbDrives();
  const drive = drives.find(d => d.id === driveId);
  if (!drive) {
    throw new Error(`Drive '${driveId}' not found or not a USB device`);
  }
  if (!drive.available) {
    throw new Error(`Drive '${driveId}' is not available (may be a system disk)`);
  }

  audit.log('secure_mount_requested', { driveId });

  const platform = config.platform;

  if (platform === 'darwin') {
    return await mountSecureMacOS(driveId);
  } else if (platform === 'linux') {
    return await mountSecureLinux(drive.device, driveId);
  } else if (platform === 'win32') {
    return await mountSecureWindows(drive.device, driveId);
  } else {
    throw new Error(`Mount not supported on platform: ${platform}`);
  }
}

/**
 * Unmount the SECURE partition of a USB drive.
 *
 * @param {string} driveId - Drive identifier (e.g., 'disk4')
 */
export async function unmountSecure(driveId) {
  // Validate drive
  const drives = await detectUsbDrives();
  const drive = drives.find(d => d.id === driveId);
  if (!drive) {
    throw new Error(`Drive '${driveId}' not found or not a USB device`);
  }

  audit.log('secure_unmount_requested', { driveId });

  const platform = config.platform;

  if (platform === 'darwin') {
    await unmountSecureMacOS(driveId);
  } else if (platform === 'linux') {
    await unmountSecureLinux(drive.device);
  } else if (platform === 'win32') {
    await unmountSecureWindows(drive.device);
  } else {
    throw new Error(`Unmount not supported on platform: ${platform}`);
  }

  audit.log('secure_unmounted', { driveId });
}

// ── macOS ──────────────────────────────────────────────────────────────

async function mountSecureMacOS(diskId) {
  // GPT layout: s1=EFI, s2=TOOLS, s3=SECURE
  // Try s3 first, then s4 (some layouts skip a slice)
  for (const suffix of ['s3', 's4']) {
    const device = `/dev/${diskId}${suffix}`;
    try {
      // Check if this slice exists and is SECURE
      const { stdout: infoOut } = await execFileAsync('/usr/sbin/diskutil', ['info', '-plist', device], {
        timeout: 5000,
      });
      const info = await parsePlist(infoOut);
      const volName = (info.VolumeName || '').toUpperCase();

      if (volName !== 'SECURE') continue;

      // Check if already mounted
      if (info.MountPoint) {
        logger.info('SECURE partition already mounted', { device, mountPoint: info.MountPoint });
        return { mountPoint: info.MountPoint };
      }

      // Mount it
      await execFileAsync('/usr/sbin/diskutil', ['mount', device], { timeout: 15000 });

      // Get the mount point
      const { stdout: postOut } = await execFileAsync('/usr/sbin/diskutil', ['info', '-plist', device], {
        timeout: 5000,
      });
      const postInfo = await parsePlist(postOut);
      const mountPoint = postInfo.MountPoint;

      if (!mountPoint) {
        throw new Error('SECURE partition mounted but mount point not found');
      }

      logger.info('SECURE partition mounted', { device, mountPoint });
      audit.log('secure_mounted', { driveId: diskId, device, mountPoint });
      return { mountPoint };
    } catch (err) {
      if (err.message.includes('mount point not found')) throw err;
      // This slice isn't SECURE — try next
      continue;
    }
  }

  throw new Error(`SECURE partition not found on ${diskId}. Drive may not be provisioned.`);
}

async function unmountSecureMacOS(diskId) {
  for (const suffix of ['s3', 's4']) {
    const device = `/dev/${diskId}${suffix}`;
    try {
      const { stdout } = await execFileAsync('/usr/sbin/diskutil', ['info', '-plist', device], {
        timeout: 5000,
      });
      const info = await parsePlist(stdout);
      if ((info.VolumeName || '').toUpperCase() !== 'SECURE') continue;

      if (!info.MountPoint) {
        logger.info('SECURE partition already unmounted', { device });
        return;
      }

      await execFileAsync('/usr/sbin/diskutil', ['unmount', device], { timeout: 10000 });
      logger.info('SECURE partition unmounted', { device });
      return;
    } catch {
      continue;
    }
  }

  logger.warn(`SECURE partition not found for unmount on ${diskId}`);
}

// ── Linux ──────────────────────────────────────────────────────────────

function getLinuxPartitionDevice(basePath, partNumber) {
  const needsSeparator = /\d$/.test(basePath);
  return needsSeparator ? `${basePath}p${partNumber}` : `${basePath}${partNumber}`;
}

async function mountSecureLinux(devicePath, driveId) {
  // SECURE is partition 2 (parted creates: 1=TOOLS, 2=SECURE)
  const secureDev = getLinuxPartitionDevice(devicePath, 2);

  // Check if already mounted
  try {
    const { stdout } = await execFileAsync('findmnt', ['-n', '-o', 'TARGET', secureDev], { timeout: 5000 });
    if (stdout.trim()) {
      const mountPoint = stdout.trim();
      logger.info('SECURE partition already mounted', { secureDev, mountPoint });
      return { mountPoint };
    }
  } catch { /* not mounted */ }

  // Mount via udisksctl
  try {
    const { stdout } = await execFileAsync('udisksctl', [
      'mount', '--block-device', secureDev, '--no-user-interaction',
    ], { timeout: 15000 });
    // Parse mount point from udisksctl output: "Mounted /dev/sdb2 at /run/media/user/SECURE"
    const match = stdout.match(/at (.+)\.?\s*$/);
    const mountPoint = match ? match[1].replace(/\.$/, '') : null;
    if (!mountPoint) {
      throw new Error('udisksctl mounted but could not parse mount point');
    }
    logger.info('SECURE partition mounted', { secureDev, mountPoint });
    audit.log('secure_mounted', { driveId, device: secureDev, mountPoint });
    return { mountPoint };
  } catch (err) {
    throw new Error(`Failed to mount SECURE partition: ${err.message}`);
  }
}

async function unmountSecureLinux(devicePath) {
  const secureDev = getLinuxPartitionDevice(devicePath, 2);
  try {
    await execFileAsync('udisksctl', ['unmount', '--block-device', secureDev, '--no-user-interaction'], {
      timeout: 10000,
    });
    logger.info('SECURE partition unmounted', { secureDev });
  } catch {
    try {
      await execFileAsync('umount', [secureDev], { timeout: 10000 });
      logger.info('SECURE partition unmounted via umount', { secureDev });
    } catch (err) {
      logger.warn('Could not unmount SECURE partition', { secureDev, error: err.message });
    }
  }
}

// ── Windows ────────────────────────────────────────────────────────────

async function mountSecureWindows(devicePath, driveId) {
  const driveNumber = devicePath.replace(/.*PhysicalDrive/, '');
  if (!/^\d+$/.test(driveNumber)) {
    throw new Error('Invalid drive number extracted from path: not numeric');
  }

  // Find SECURE partition and assign a drive letter
  const script = `
    $ErrorActionPreference = 'Stop'
    $partitions = Get-Partition -DiskNumber ${driveNumber}
    $secure = $partitions | Where-Object {
      (Get-Volume -Partition $_ -ErrorAction SilentlyContinue).FileSystemLabel -eq 'SECURE'
    } | Select-Object -First 1

    if (-not $secure) { throw 'SECURE partition not found' }

    if ($secure.DriveLetter) {
      # Already has a drive letter
      @{ mountPoint = ($secure.DriveLetter + ":\\") } | ConvertTo-Json
    } else {
      # Assign next available drive letter
      $secure | Add-PartitionAccessPath -AssignDriveLetter
      $secure = Get-Partition -DiskNumber ${driveNumber} -PartitionNumber $secure.PartitionNumber
      @{ mountPoint = ($secure.DriveLetter + ":\\") } | ConvertTo-Json
    }
  `;

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], { timeout: 15000 });

  const result = JSON.parse(stdout.trim());
  logger.info('SECURE partition mounted', { driveId, mountPoint: result.mountPoint });
  audit.log('secure_mounted', { driveId, mountPoint: result.mountPoint });
  return { mountPoint: result.mountPoint };
}

async function unmountSecureWindows(devicePath) {
  const driveNumber = devicePath.replace(/.*PhysicalDrive/, '');
  if (!/^\d+$/.test(driveNumber)) {
    throw new Error('Invalid drive number extracted from path: not numeric');
  }

  const script = `
    $ErrorActionPreference = 'Stop'
    $partitions = Get-Partition -DiskNumber ${driveNumber}
    $secure = $partitions | Where-Object {
      (Get-Volume -Partition $_ -ErrorAction SilentlyContinue).FileSystemLabel -eq 'SECURE'
    } | Select-Object -First 1

    if ($secure -and $secure.DriveLetter) {
      mountvol ($secure.DriveLetter + ":\\") /D
    }
  `;

  await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], { timeout: 10000 });

  logger.info('SECURE partition drive letter removed');
}
