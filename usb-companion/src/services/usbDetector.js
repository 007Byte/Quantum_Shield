/**
 * USB Drive Detection Service — Platform-Adaptive
 *
 * Detects USB block devices using OS-native tools:
 *   - Linux:   lsblk (JSON output)
 *   - macOS:   diskutil list -plist + system_profiler
 *   - Windows: PowerShell Get-Disk / Get-Volume
 *
 * Security:
 *   - No shell=true in child_process (prevents injection)
 *   - Command arguments are never user-supplied
 *   - Timeout on all subprocess calls
 *   - Filters out system disks (mounted at /, /boot, etc.)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, constants } from 'node:fs/promises';
import { config } from '../utils/config.js';
import { logger, audit } from '../utils/logger.js';
import { parsePlist } from '../utils/plist.js';
import { hasVaultBin } from './vaultContainerService.js';

const execFileAsync = promisify(execFile);

// System mount points that should NEVER be presented as available USB drives
const SYSTEM_MOUNTS = new Set(['/', '/boot', '/boot/efi', '/home', '/var', '/tmp', '/sessions']);

/**
 * Detect all connected USB drives.
 * Returns an array of USBDrive objects matching the frontend contract.
 */
export async function detectUsbDrives() {
  const platform = config.platform;
  const _t0 = Date.now();
  console.log(`[DEBUG] [${_t0}] detectUsbDrives() called, platform=${platform}`);

  audit.log('usb_detection_started', { platform });

  try {
    let drives;
    switch (platform) {
      case 'linux':
        drives = await detectLinux();
        break;
      case 'darwin':
        drives = await detectMacOS();
        break;
      case 'win32':
        drives = await detectWindows();
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    console.log(`[DEBUG] [${Date.now()}] detectUsbDrives() completed in ${Date.now()-_t0}ms, found ${drives.length} drives:`, drives.map(d => ({ id: d.id, name: d.name, available: d.available, hasVault: d.hasVault, partitions: d.partitions?.length })));
    audit.log('usb_detection_complete', { platform, driveCount: drives.length });
    return drives;

  } catch (err) {
    console.error(`[DEBUG] [${Date.now()}] detectUsbDrives() ERROR in ${Date.now()-_t0}ms:`, err.message);
    audit.error('usb_detection_failed', { platform, error: err.message });
    throw err;
  }
}

// ── Linux Detection (lsblk) ────────────────────────────────────────────

async function detectLinux() {
  // lsblk -J: JSON output; -b: bytes; -o: specific columns
  // SECURITY: No user input in arguments; execFile prevents shell injection
  const { stdout } = await execFileAsync('lsblk', [
    '-J', '-b',
    '-o', 'NAME,SIZE,TYPE,MOUNTPOINT,TRAN,VENDOR,MODEL,SERIAL,RM,HOTPLUG,FSTYPE,LABEL',
  ], { timeout: config.commandTimeout });

  const parsed = JSON.parse(stdout);
  const devices = parsed.blockdevices || [];

  return devices
    .filter(dev => {
      // Only USB-connected disk devices
      if (dev.type !== 'disk') return false;
      if (dev.tran !== 'usb') return false;
      return true;
    })
    .map(dev => {
      const isSystemDisk = isSystemMount(dev);
      const hasVault = checkForVaultMarker(dev);

      return {
        id: dev.name,
        name: formatDriveName(dev),
        capacity: formatBytes(parseInt(dev.size, 10) || 0),
        device: `/dev/${dev.name}`,
        available: !isSystemDisk,
        hasVault,
        vendor: (dev.vendor || '').trim(),
        model: (dev.model || '').trim(),
        serial: dev.serial || '',
        removable: dev.rm || false,
        hotplug: dev.hotplug || false,
        partitions: (dev.children || []).map(p => ({
          name: p.name,
          size: formatBytes(parseInt(p.size, 10) || 0),
          fstype: p.fstype || 'unknown',
          label: p.label || '',
          mountpoint: p.mountpoint || null,
        })),
      };
    });
}

// ── macOS Detection (diskutil + system_profiler) ─────────────────────────
//
// Strategy:
//   1. Use `diskutil list -plist external` to enumerate external disks.
//      plutil converts XML plist → JSON for reliable nested structure parsing.
//   2. For each external disk, run `diskutil info -plist <disk>` to get
//      vendor, model, serial, bus type, sizes, and partition info.
//   3. Optionally enrich with `system_profiler SPUSBDataType -json` for
//      USB-specific metadata (manufacturer, serial, etc.).

async function detectMacOS() {
  const drives = [];

  // ── Step 1: Enumerate external disks via diskutil ─────────────────────
  let diskList;
  try {
    const { stdout } = await execFileAsync('diskutil', ['list', '-plist', 'external'], {
      timeout: config.commandTimeout,
    });
    diskList = await parsePlist(stdout);
  } catch (err) {
    // `diskutil list external` may fail on older macOS; fall back to all disks
    logger.warn('diskutil list external failed, falling back to full list', { error: err.message });
    try {
      const { stdout } = await execFileAsync('diskutil', ['list', '-plist'], {
        timeout: config.commandTimeout,
      });
      diskList = await parsePlist(stdout);
    } catch (err2) {
      logger.error('diskutil list failed entirely', { error: err2.message });
      return [];
    }
  }

  // Extract whole-disk identifiers (e.g. ["disk4", "disk5", "disk6"])
  const diskIds = diskList.WholeDisks || [];

  // ── Step 2: Get info for each disk ────────────────────────────────────
  for (const diskId of diskIds) {
    try {
      const { stdout } = await execFileAsync('diskutil', ['info', '-plist', diskId], {
        timeout: config.commandTimeout,
      });
      const info = await parsePlist(stdout);

      // Filter: only USB / external bus types
      const busProtocol = (info.BusProtocol || '').toLowerCase();
      const isExternal = info.Ejectable === true || info.Removable === true ||
                         info.RemovableMedia === true || info.Internal === false ||
                         busProtocol === 'usb' ||
                         (info.DeviceTreePath || '').toLowerCase().includes('usb');

      if (!isExternal) continue;

      // Parse size
      const sizeBytes = info.TotalSize || info.Size || info.DiskSize || 0;

      // Get partitions from diskutil list for this specific disk
      let partitions = [];
      try {
        const { stdout: partOut } = await execFileAsync('diskutil', ['list', '-plist', diskId], {
          timeout: config.commandTimeout,
        });
        const partInfo = await parsePlist(partOut);
        const allDisks = partInfo.AllDisksAndPartitions || [];
        // AllDisksAndPartitions is an array of disk entries; find the one
        // matching this diskId, or use the first entry
        let diskEntry = allDisks.find(d => d.DeviceIdentifier === diskId) || allDisks[0] || {};
        const parts = diskEntry.Partitions || [];
        logger.debug(`[usbDetector] ${diskId}: AllDisksAndPartitions has ${allDisks.length} entries, ${parts.length} partitions`);

        partitions = parts.map(p => ({
          name: p.DeviceIdentifier || '',
          size: formatBytes(p.Size || 0),
          fstype: p.Content || 'unknown',
          label: p.VolumeName || '',
          mountpoint: p.MountPoint || null,
        }));

        // Try to mount unmounted partitions (SECURE may be hidden/unmounted)
        for (const p of partitions) {
          if (!p.mountpoint && p.name) {
            try {
              const { stdout: mountOut } = await execFileAsync('diskutil', ['mount', p.name], {
                timeout: config.commandTimeout,
              });
              // Extract mount point from output like "Volume SECURE on /dev/disk4s2 mounted"
              const mountMatch = mountOut.match(/mounted? (?:at|on) (\/\S+)/i) ||
                                 mountOut.match(/(\/Volumes\/\S+)/);
              if (mountMatch) {
                p.mountpoint = mountMatch[1];
                logger.info(`[usbDetector] Mounted ${p.name} at ${p.mountpoint}`);
              }
            } catch (mountErr) {
              logger.debug(`[usbDetector] Could not mount ${p.name}: ${mountErr.message}`);
            }
          }
        }
      } catch (partErr) {
        logger.warn(`[usbDetector] Failed to get partitions for ${diskId}: ${partErr.message}`);
      }

      // Check for vault marker: VAULT.bin at partition root with valid magic bytes
      // Also checks SECURE partition label (dual-partition layout)
      // FIX: Set hasVault on INDIVIDUAL partitions so /usb/discover can filter them
      // and return their mountpoints to the frontend.
      let driveHasVault = false;
      for (const p of partitions) {
        // Check SECURE label
        if ((p.label || '').toUpperCase() === 'SECURE') {
          p.hasVault = true;
          driveHasVault = true;
          logger.info(`[usbDetector] Partition ${p.name} has SECURE label → hasVault=true`);
        }
        // Check for VAULT.bin with valid magic bytes
        if (p.mountpoint && !p.hasVault) {
          try {
            if (await hasVaultBin(p.mountpoint)) {
              p.hasVault = true;
              driveHasVault = true;
              logger.info(`[usbDetector] Found valid VAULT.bin on ${p.mountpoint} → hasVault=true`);
            }
          } catch {
            // Not a vault partition
          }
        }
      }
      // Drive-level flag for backward compatibility
      const hasVault = driveHasVault;
      logger.debug(`[usbDetector] ${diskId}: ${partitions.length} partitions, driveHasVault=${driveHasVault}, partitionsWithVault=${partitions.filter(p=>p.hasVault).length}`);

      drives.push({
        id: diskId,
        name: info.MediaName || info.IORegistryEntryName || `USB Drive (${diskId})`,
        capacity: formatBytes(sizeBytes),
        device: `/dev/${diskId}`,
        available: true,
        hasVault,
        vendor: info.DeviceVendor || info.VendorSpecificInfo || '',
        model: info.DeviceModel || info.MediaName || '',
        serial: info.DeviceSerialNumber || info.DiskUUID || '',
        removable: info.Removable || info.RemovableMedia || true,
        hotplug: true,
        partitions,
      });

    } catch (err) {
      logger.warn(`Failed to get info for ${diskId}`, { error: err.message });
    }
  }

  // ── Step 3: Enrich with system_profiler (optional) ────────────────────
  try {
    const { stdout: profilerOut } = await execFileAsync('system_profiler', [
      'SPUSBDataType', '-json',
    ], { timeout: config.commandTimeout });
    const profilerData = JSON.parse(profilerOut);
    const usbDevices = extractMacUsbDevices(profilerData);

    // Match by BSD name and enrich
    for (const usb of usbDevices) {
      const match = drives.find(d => d.device === usb.device || d.id === usb.bsdName);
      if (match) {
        if (usb.vendor && !match.vendor) match.vendor = usb.vendor;
        if (usb.serial && !match.serial) match.serial = usb.serial;
        if (usb.name && match.name.startsWith('USB Drive')) match.name = usb.name;
      } else if (usb.device) {
        // Device found by system_profiler but not by diskutil list external
        // (might happen with certain USB enclosures)
        drives.push({
          id: usb.bsdName || usb.id,
          name: usb.name || 'USB Drive',
          capacity: usb.capacity || 'Unknown',
          device: usb.device,
          available: true,
          hasVault: false,
          vendor: usb.vendor || '',
          model: usb.model || '',
          serial: usb.serial || '',
          removable: true,
          hotplug: true,
          partitions: [],
        });
      }
    }
  } catch {
    logger.warn('system_profiler enrichment failed (non-critical)');
  }

  return drives;
}

/**
 * Walk the SPUSBDataType tree to find USB mass storage devices.
 * The tree can be deeply nested (Bus > Hub > Hub > Device > Media).
 */
function extractMacUsbDevices(profilerData) {
  const devices = [];
  const items = profilerData?.SPUSBDataType || [];

  function walk(nodes) {
    for (const node of nodes) {
      // Recurse into child items first (hubs, controllers)
      if (node._items) walk(node._items);

      // A mass storage USB device has Media array or volumes
      if (node.Media || node.volumes) {
        // Extract BSD name from Media entries
        let bsdName = '';
        if (Array.isArray(node.Media)) {
          for (const media of node.Media) {
            if (media.bsd_name) { bsdName = media.bsd_name; break; }
            // Check volumes inside media
            if (media.volumes) {
              for (const vol of media.volumes) {
                if (vol.bsd_name) { bsdName = vol.bsd_name.replace(/s\d+$/, ''); break; }
              }
            }
          }
        }

        // Parse size string (e.g. "32.37 GB" or "16 GB (16,042,983,424 bytes)")
        let capacity = 'Unknown';
        if (node.size) {
          capacity = node.size.replace(/\s*\(.*\)/, '').trim();
        }

        devices.push({
          id: node.serial_num || node._name || 'unknown',
          name: node._name || 'USB Drive',
          vendor: node.manufacturer || '',
          model: node._name || '',
          serial: node.serial_num || '',
          capacity,
          device: bsdName ? `/dev/${bsdName}` : '',
          bsdName: bsdName || '',
        });
      }
    }
  }

  walk(items);
  return devices;
}

// ── Windows Detection (PowerShell) ──────────────────────────────────────

async function detectWindows() {
  // Use PowerShell to get USB disk information
  // SECURITY: No user input interpolated; execFile prevents injection
  const script = `
    Get-Disk | Where-Object { $_.BusType -eq 'USB' } | ForEach-Object {
      $disk = $_
      $partitions = Get-Partition -DiskNumber $disk.Number -ErrorAction SilentlyContinue
      $volumes = $partitions | Get-Volume -ErrorAction SilentlyContinue
      [PSCustomObject]@{
        Number = $disk.Number
        FriendlyName = $disk.FriendlyName
        Size = $disk.Size
        SerialNumber = $disk.SerialNumber
        Model = $disk.Model
        IsSystem = $disk.IsSystem
        Partitions = ($partitions | ForEach-Object {
          [PSCustomObject]@{
            Letter = ($_ | Get-Volume -ErrorAction SilentlyContinue).DriveLetter
            Size = $_.Size
            Type = $_.Type
          }
        })
      }
    } | ConvertTo-Json -Depth 3
  `;

  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', script,
  ], { timeout: config.commandTimeout });

  const disks = JSON.parse(stdout || '[]');
  const diskArray = Array.isArray(disks) ? disks : [disks];

  const results = [];
  for (const disk of diskArray) {
    const partitions = (disk.Partitions || []).map(p => ({
      name: p.Letter ? `${p.Letter}:` : 'Unassigned',
      size: formatBytes(p.Size || 0),
      fstype: p.Type || 'unknown',
      label: '',
      mountpoint: p.Letter ? `${p.Letter}:\\` : null,
    }));

    // Check for vault marker: VAULT.bin at partition root or SECURE label
    let hasVault = false;
    for (const p of partitions) {
      if (p.mountpoint) {
        try {
          await access(`${p.mountpoint}VAULT.bin`, constants.F_OK);
          hasVault = true;
          break;
        } catch {
          // Not a vault partition
        }
      }
    }

    results.push({
      id: `disk${disk.Number}`,
      name: disk.FriendlyName || 'USB Drive',
      capacity: formatBytes(disk.Size || 0),
      device: `\\\\.\\PhysicalDrive${disk.Number}`,
      available: !disk.IsSystem,
      hasVault,
      vendor: '',
      model: disk.Model || '',
      serial: disk.SerialNumber || '',
      removable: true,
      hotplug: true,
      partitions,
    });
  }
  return results;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function isSystemMount(dev) {
  // Check if the device or any of its partitions are mounted at system paths
  if (dev.mountpoint && SYSTEM_MOUNTS.has(dev.mountpoint)) return true;

  for (const child of dev.children || []) {
    if (child.mountpoint && SYSTEM_MOUNTS.has(child.mountpoint)) return true;
    // Also check if mounted under /sessions (this VM's workspace)
    if (child.mountpoint && child.mountpoint.startsWith('/sessions')) return true;
  }

  return false;
}

function checkForVaultMarker(dev) {
  // Check for SECURE partition label (dual-partition layout)
  for (const child of dev.children || []) {
    if (child.label && child.label.toUpperCase() === 'SECURE') return true;
  }
  return false;
}

function formatDriveName(dev) {
  const vendor = (dev.vendor || '').trim();
  const model = (dev.model || '').trim();

  if (vendor && model) return `${vendor} ${model}`;
  if (model) return model;
  if (vendor) return vendor;
  return `USB Drive (${dev.name})`;
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(value < 10 ? 1 : 0)} ${sizes[i]}`;
}
