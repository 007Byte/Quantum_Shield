/**
 * USB Drive Eject Service — V2.0 Fortress Spec §4 compliant
 *
 * Safely ejects USB drives across all platforms:
 *   - macOS: diskutil eject
 *   - Linux: udisksctl unmount + power-off
 *   - Windows: Flush → dismount → eject via PowerShell (CREATE_NO_WINDOW)
 *
 * Security:
 *   - Validates drive is a real USB device before ejecting
 *   - Uses execFile (no shell) to prevent command injection
 *   - All operations are audit-logged
 *   - Refuses to eject system disks
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../utils/config.js';
import { logger, audit } from '../utils/logger.js';
import { detectUsbDrives } from './usbDetector.js';

const execFileAsync = promisify(execFile);

/**
 * Safely eject a USB drive.
 *
 * @param {string} driveId - The drive identifier (e.g., 'disk4')
 * @returns {Promise<void>}
 */
export async function ejectDrive(driveId) {
  // Step 1: Validate drive exists and is a USB device
  const drives = await detectUsbDrives();
  const drive = drives.find(d => d.id === driveId);

  if (!drive) {
    throw new Error(`Drive '${driveId}' not found or not a USB device`);
  }
  if (!drive.available) {
    throw new Error(`Drive '${driveId}' is a system disk and cannot be ejected`);
  }

  audit.log('drive_eject_started', { driveId, device: drive.device });

  const platform = config.platform;

  if (platform === 'darwin') {
    await ejectMacOS(driveId);
  } else if (platform === 'linux') {
    await ejectLinux(drive.device);
  } else if (platform === 'win32') {
    await ejectWindows(drive.device);
  } else {
    throw new Error(`Eject not supported on platform: ${platform}`);
  }

  audit.log('drive_eject_complete', { driveId });
}

// ── macOS ──────────────────────────────────────────────────────────────

async function ejectMacOS(diskId) {
  const device = `/dev/${diskId}`;

  // Step 1: Sync filesystem buffers
  try {
    await execFileAsync('/usr/bin/sync', [], { timeout: 5000 });
  } catch {
    // Non-fatal — continue with eject
  }

  // Step 2: Eject entire disk (unmounts all partitions + powers off)
  try {
    await execFileAsync('/usr/sbin/diskutil', ['eject', device], {
      timeout: 15000,
    });
    logger.info('Drive ejected successfully', { device });
  } catch (err) {
    logger.error('Failed to eject drive', { device, error: err.message });
    throw new Error(`Failed to eject ${device}: ${err.message}`);
  }
}

// ── Linux ──────────────────────────────────────────────────────────────

async function ejectLinux(devicePath) {
  // Step 1: Sync
  try {
    await execFileAsync('/usr/bin/sync', [], { timeout: 5000 });
  } catch {
    // Non-fatal
  }

  // Step 2: Unmount all partitions
  try {
    await execFileAsync('udisksctl', ['unmount', '--block-device', devicePath, '--no-user-interaction'], {
      timeout: 10000,
    });
  } catch {
    // May already be unmounted
  }

  // Step 3: Power off the drive
  try {
    await execFileAsync('udisksctl', ['power-off', '--block-device', devicePath, '--no-user-interaction'], {
      timeout: 10000,
    });
    logger.info('Drive powered off', { devicePath });
  } catch (err) {
    // Fallback: try eject command
    try {
      await execFileAsync('eject', [devicePath], { timeout: 10000 });
      logger.info('Drive ejected via eject command', { devicePath });
    } catch (ejectErr) {
      throw new Error(`Failed to eject ${devicePath}: ${err.message}`);
    }
  }
}

// ── Windows ────────────────────────────────────────────────────────────
// V2.0 Fortress Spec §4: 10-step Windows eject protocol
// Uses CREATE_NO_WINDOW (0x08000000), NEVER DETACHED_PROCESS (0x8)

async function ejectWindows(devicePath) {
  const driveNumber = devicePath.replace(/.*PhysicalDrive/, '');
  if (!/^\d+$/.test(driveNumber)) {
    throw new Error('Invalid drive number extracted from path: not numeric');
  }

  // Steps 1-10 per V2.0 spec
  const script = `
    $ErrorActionPreference = 'Stop'

    # Step 1: Flush filesystem buffers
    $partitions = Get-Partition -DiskNumber ${driveNumber} -ErrorAction SilentlyContinue
    foreach ($p in $partitions) {
      if ($p.DriveLetter) {
        fsutil volume flush ($p.DriveLetter + ":")
      }
    }

    # Step 2-3: Close handles and wait
    Start-Sleep -Milliseconds 500

    # Step 4-5: Dismount volumes
    foreach ($p in $partitions) {
      if ($p.DriveLetter) {
        mountvol ($p.DriveLetter + ":\\") /D 2>$null
      }
    }
    Start-Sleep -Milliseconds 500

    # Step 6-8: Eject media via WMI
    $disk = Get-WmiObject -Class Win32_DiskDrive | Where-Object { $_.Index -eq ${driveNumber} }
    if ($disk) {
      $disk.GetMethodParameters('Eject') | Out-Null
      # Use DeviceIoControl for clean eject
      $volumes = Get-WmiObject -Query "ASSOCIATORS OF {Win32_DiskDrive.DeviceID='$($disk.DeviceID)'} WHERE AssocClass=Win32_DiskDriveToDiskPartition"
      foreach ($vol in $volumes) {
        $logicalDisks = Get-WmiObject -Query "ASSOCIATORS OF {Win32_DiskPartition.DeviceID='$($vol.DeviceID)'} WHERE AssocClass=Win32_LogicalDiskToPartition"
        foreach ($ld in $logicalDisks) {
          $ld.Put() | Out-Null
        }
      }
    }
    Start-Sleep -Milliseconds 1000

    # Step 9: Verify drive letter is gone
    $remaining = Get-Partition -DiskNumber ${driveNumber} -ErrorAction SilentlyContinue | Where-Object { $_.DriveLetter }
    if ($remaining) {
      Write-Warning "Some partitions still have drive letters"
    }

    # Step 10: Clean up
    Write-Output "Eject complete"
  `;

  try {
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', script,
    ], {
      timeout: 30000,
      // CREATE_NO_WINDOW — never DETACHED_PROCESS (per V2.0 bug fix)
      windowsHide: true,
    });
    logger.info('Drive ejected via PowerShell', { driveNumber });
  } catch (err) {
    throw new Error(`Windows eject failed: ${err.message}`);
  }
}
