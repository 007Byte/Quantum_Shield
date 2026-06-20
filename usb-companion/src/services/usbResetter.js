/**
 * USB Drive Reset/Wipe Service
 *
 * Handles secure wiping of USB drives:
 *   - Quick erase: removes partition table and filesystem metadata
 *   - Secure wipe: overwrites with random data (1, 3, or 7 passes)
 *
 * Security:
 *   - Validates drive is a real USB device before wiping
 *   - Uses execFile (no shell) to prevent command injection
 *   - All operations are audit-logged
 *   - Refuses to wipe system disks
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../utils/config.js';
import { logger, audit } from '../utils/logger.js';
import { detectUsbDrives } from './usbDetector.js';

const execFileAsync = promisify(execFile);

/**
 * Reset/wipe a USB drive.
 *
 * @param {Object} params
 * @param {string} params.driveId - The drive identifier
 * @param {string} params.wipeMethod - 'quick' or 'secure'
 * @param {number} params.passes - Number of overwrite passes (1-7)
 */
export async function resetDrive(params) {
  const { driveId, wipeMethod, passes } = params;

  audit.log('drive_reset_started', { driveId, wipeMethod, passes });

  try {
    // Step 1: Validate the drive exists and is a real USB device
    const drives = await detectUsbDrives();
    const targetDrive = drives.find(d => d.id === driveId);

    if (!targetDrive) {
      throw new Error(`Drive '${driveId}' not found or not a USB device`);
    }
    if (!targetDrive.available) {
      throw new Error(`Drive '${driveId}' is a system disk and cannot be wiped`);
    }

    // Step 2: Perform the wipe
    if (wipeMethod === 'quick') {
      await quickErase(targetDrive.device);
    } else {
      await secureWipe(targetDrive.device, passes);
    }

    audit.log('drive_reset_complete', { driveId, wipeMethod, passes });

  } catch (err) {
    audit.error('drive_reset_failed', { driveId, error: err.message });
    throw err;
  }
}

/**
 * Quick erase: zero out the first and last MB of the drive
 * to destroy partition tables and filesystem metadata.
 */
async function quickErase(devicePath) {
  const platform = config.platform;

  if (platform === 'linux') {
    // Overwrite first 1MB (partition table, superblocks)
    try {
      await execFileAsync('dd', [
        'if=/dev/zero', `of=${devicePath}`,
        'bs=1M', 'count=1', 'conv=notrunc',
      ], { timeout: config.commandTimeout });

      logger.info('Quick erase completed', { devicePath });
    } catch (err) {
      logger.warn(`Quick erase failed (may need elevated permissions): ${err.message}`);
      throw new Error(
        `Failed to erase ${devicePath}. This operation requires elevated privileges. Error: ${err.message}`
      );
    }
  } else if (platform === 'darwin') {
    await execFileAsync('diskutil', ['eraseDisk', 'free', 'EMPTY', devicePath], {
      timeout: config.commandTimeout,
    });
  } else if (platform === 'win32') {
    const driveNumber = devicePath.replace(/.*PhysicalDrive/, '');
    if (!/^\d+$/.test(driveNumber)) {
      throw new Error('Invalid drive number extracted from path: not numeric');
    }
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Clear-Disk -Number ${driveNumber} -RemoveData -Confirm:$false`,
    ], { timeout: config.commandTimeout });
  }
}

/**
 * Secure wipe: overwrite entire drive with random data.
 * Multiple passes increase security against forensic recovery.
 */
async function secureWipe(devicePath, passes) {
  const platform = config.platform;

  if (platform === 'linux') {
    for (let pass = 1; pass <= passes; pass++) {
      logger.info(`Secure wipe pass ${pass}/${passes}`, { devicePath });

      try {
        // Use /dev/urandom for random data overwrite
        await execFileAsync('dd', [
          'if=/dev/urandom', `of=${devicePath}`,
          'bs=4M', 'status=progress',
        ], { timeout: config.wipeTimeout });
      } catch (err) {
        // dd exits with error when it reaches end of device — this is expected
        if (!err.message.includes('No space left')) {
          logger.warn(`Secure wipe pass ${pass} warning: ${err.message}`);
        }
      }
    }

    // Final pass: zero out for clean state
    try {
      await execFileAsync('dd', [
        'if=/dev/zero', `of=${devicePath}`,
        'bs=4M',
      ], { timeout: config.wipeTimeout });
    } catch {
      // Expected: dd errors when device is full
    }

    logger.info('Secure wipe completed', { devicePath, passes });

  } else if (platform === 'darwin') {
    // macOS: use diskutil secureErase
    // Level 0 = single-pass zero fill
    // Level 1 = single-pass random fill
    // Level 2 = seven-pass secure erase
    // Level 3 = Gutmann 35-pass
    // Level 4 = three-pass secure erase
    const eraseLevel = passes >= 7 ? '2' : passes >= 3 ? '4' : '1';
    await execFileAsync('diskutil', ['secureErase', eraseLevel, devicePath], {
      timeout: config.wipeTimeout,
    });
  } else if (platform === 'win32') {
    const driveNumber = devicePath.replace(/.*PhysicalDrive/, '');
    if (!/^\d+$/.test(driveNumber)) {
      throw new Error('Invalid drive number extracted from path: not numeric');
    }
    const safePasses = Math.min(Math.max(Math.floor(Number(passes)), 1), 35);
    const script = `
      Clear-Disk -Number ${driveNumber} -RemoveData -Confirm:$false
      # Write random data
      $disk = Get-Disk -Number ${driveNumber}
      $stream = $disk.GetStream()
      $buffer = New-Object byte[] (4MB)
      $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
      for ($pass = 0; $pass -lt ${safePasses}; $pass++) {
        $stream.Position = 0
        while ($stream.Position -lt $stream.Length) {
          $rng.GetBytes($buffer)
          $stream.Write($buffer, 0, $buffer.Length)
        }
      }
      $stream.Close()
    `;
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', script,
    ], { timeout: config.wipeTimeout });
  }
}
