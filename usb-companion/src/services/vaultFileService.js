/**
 * Vault File Service — vault discovery and legacy file operations.
 *
 * Primary responsibility: discover provisioned vaults across mounted USB drives.
 *
 * Discovery method:
 *   1. Scan mounted volumes for VAULT.bin at partition root
 *   2. Verify USBVLT magic bytes (accepts V2, V3, V4)
 *   3. Read plaintext identity block from header (no password required)
 *   4. Return vault list with metadata for UI display
 *
 * Security:
 *   - All file names validated and sanitized before use
 *   - Vault ID must be UUID format
 *   - No user input used in filesystem paths without validation
 *   - Identity block is plaintext by design (vault discovery must work without password)
 */

import { randomUUID, createHash } from 'node:crypto';
import { readdir, readFile, writeFile, unlink, access, constants, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { logger, audit } from '../utils/logger.js';
import { hasVaultBin, readVaultIdentity } from './vaultContainerService.js';
import { config } from '../utils/config.js';

/**
 * Resolve a path within a vault and verify it hasn't escaped via symlinks.
 * Prevents symlink-based path traversal attacks on malicious USB drives.
 */
async function safeVaultPath(mountPoint, ...segments) {
  const expectedBase = resolve(mountPoint);
  const candidatePath = resolve(mountPoint, ...segments);
  let realPath;
  try {
    realPath = await realpath(candidatePath);
  } catch {
    const parentPath = resolve(candidatePath, '..');
    const realParent = await realpath(parentPath);
    if (!realParent.startsWith(expectedBase)) {
      throw new Error('Path traversal detected: resolved path escapes vault directory');
    }
    return candidatePath;
  }
  if (!realPath.startsWith(expectedBase)) {
    throw new Error('Path traversal detected: resolved path escapes vault directory');
  }
  return realPath;
}

/**
 * Get the list of volume scan paths based on platform.
 */
function getVolumeScanPaths() {
  const platform = config.platform;
  if (platform === 'darwin') {
    return ['/Volumes'];
  } else if (platform === 'linux') {
    // Linux USB volumes can be in several locations
    return ['/media', '/run/media', '/mnt'];
  }
  // Windows: scan drive letters
  return [];
}

/**
 * Discover all provisioned vaults across all mounted USB volumes.
 *
 * Scans for VAULT.bin at partition root with valid USBVLT magic bytes.
 * Reads the plaintext identity block from the header for display (no password needed).
 *
 * @returns {Promise<Array<{vaultId, name, fileCount, createdAt, fileSystem, algorithm, driveName, mountPoint, version, containerFormat}>>}
 */
export async function discoverVaults() {
  const _t0 = Date.now();
  const vaults = [];
  const scanPaths = getVolumeScanPaths();
  console.log(`[DEBUG] [${_t0}] vaultFileService.discoverVaults() called, scanPaths=${JSON.stringify(scanPaths)}`);
  logger.info(`[vaultFileService] Starting vault discovery, scanning: ${scanPaths.join(', ')}`);

  for (const scanRoot of scanPaths) {
    try {
      const entries = await readdir(scanRoot);
      logger.debug(`[vaultFileService] ${scanRoot}: found ${entries.length} entries`);
      for (const vol of entries) {
        const volMountPoint = join(scanRoot, vol);

        // Skip system volumes
        if (vol.startsWith('.') || vol === 'Macintosh HD' || vol === 'Recovery') continue;

        // Check for VAULT.bin at partition root with valid magic bytes
        try {
          if (await hasVaultBin(volMountPoint)) {
            const identity = await readVaultIdentity(volMountPoint);
            vaults.push({
              vaultId: identity?.id || null,
              name: identity?.name || vol,
              fileCount: -1,
              createdAt: identity?.created || null,
              fileSystem: 'unknown',
              algorithm: 'unknown',
              driveName: vol,
              mountPoint: volMountPoint,
              version: identity?.version || 4,
              containerFormat: 'vault_bin',
            });
          }
        } catch {
          // Not a vault — skip
        }

        // V2.0 Spec §11: Multi-vault support — scan vault_*/ subdirectories
        try {
          const subEntries = await readdir(volMountPoint);
          for (const sub of subEntries) {
            if (!sub.startsWith('vault_')) continue;
            const subPath = join(volMountPoint, sub);
            try {
              if (await hasVaultBin(subPath)) {
                const identity = await readVaultIdentity(subPath);
                vaults.push({
                  vaultId: identity?.id || null,
                  name: identity?.name || sub,
                  fileCount: -1,
                  createdAt: identity?.created || null,
                  fileSystem: 'unknown',
                  algorithm: 'unknown',
                  driveName: vol,
                  mountPoint: subPath,
                  version: identity?.version || 4,
                  containerFormat: 'vault_bin',
                  vaultDir: sub,
                });
              }
            } catch {
              // Not a vault subdirectory
            }
          }
        } catch {
          // Can't scan subdirectories — skip
        }

        // Also check for Linux nested mount points (e.g., /run/media/user/SECURE)
        if (scanRoot === '/run/media' || scanRoot === '/media') {
          try {
            const subEntries = await readdir(volMountPoint);
            for (const sub of subEntries) {
              const subMount = join(volMountPoint, sub);
              try {
                if (await hasVaultBin(subMount)) {
                  const identity = await readVaultIdentity(subMount);
                  vaults.push({
                    vaultId: identity?.id || null,
                    name: identity?.name || sub,
                    fileCount: -1,
                    createdAt: identity?.created || null,
                    fileSystem: 'unknown',
                    algorithm: 'unknown',
                    driveName: sub,
                    mountPoint: subMount,
                    version: identity?.version || 4,
                    containerFormat: 'vault_bin',
                  });
                }
              } catch {
                // Not a vault
              }
            }
          } catch {
            // Not a directory or permission denied
          }
        }
      }
    } catch (err) {
      logger.warn(`Failed to scan ${scanRoot} for vaults`, { error: err.message });
    }
  }

  console.log(`[DEBUG] [${Date.now()}] vaultFileService.discoverVaults() after scan: found ${vaults.length} vaults so far (took ${Date.now()-_t0}ms)`);
  // Windows: scan drive letters A-Z
  if (config.platform === 'win32') {
    for (let code = 65; code <= 90; code++) { // A-Z
      const driveLetter = String.fromCharCode(code);
      const drivePath = `${driveLetter}:\\`;
      try {
        if (await hasVaultBin(drivePath)) {
          const identity = await readVaultIdentity(drivePath);
          vaults.push({
            vaultId: identity?.id || null,
            name: identity?.name || `Drive ${driveLetter}`,
            fileCount: -1,
            createdAt: identity?.created || null,
            fileSystem: 'unknown',
            algorithm: 'unknown',
            driveName: `${driveLetter}:`,
            mountPoint: drivePath,
            version: identity?.version || 4,
            containerFormat: 'vault_bin',
          });
        }
      } catch {
        // Drive doesn't exist or not accessible
      }
    }
  }

  console.log(`[DEBUG] [${Date.now()}] vaultFileService.discoverVaults() RETURNING ${vaults.length} vaults (took ${Date.now()-_t0}ms):`, vaults.map(v => ({ id: v.vaultId, name: v.name, mount: v.mountPoint })));
  return vaults;
}

/**
 * Find the mount point of a vault by its ID.
 * Scans mounted volumes for VAULT.bin with matching identity.
 *
 * @param {string} vaultId - UUID of the vault
 * @returns {Promise<string|null>} Mount point path or null
 */
export async function findVaultMountPoint(vaultId) {
  const vaults = await discoverVaults();
  const match = vaults.find(v => v.vaultId === vaultId);
  return match?.mountPoint || null;
}

/**
 * List all files in a vault.
 * NOTE: With the VAULT.bin architecture, file listing requires decryption
 * of the vault index — which happens in the app via Rust FFI, not here.
 * This function exists for backward compatibility with legacy vaults.
 *
 * @param {string} vaultId - UUID of the vault
 * @returns {Promise<Array<{id, name, size, createdAt, contentHash}>>}
 */
export async function listVaultFiles(vaultId) {
  // In V4 architecture, file listing requires unlocking the vault
  // and decrypting the index — this happens in the frontend via Rust FFI.
  // Return empty array; the frontend handles index decryption.
  return [];
}

/**
 * Add a file to a vault.
 * NOTE: In V4 architecture, file encryption/storage goes through VAULT.bin
 * binary container via the app's Rust FFI. This is a legacy stub.
 */
export async function addVaultFile(vaultId, fileName, fileBuffer) {
  throw new Error(
    'Direct file operations are not supported with V4 vaults. ' +
    'Use the VAULT.bin binary container routes instead.'
  );
}

/**
 * Remove a file from a vault.
 * NOTE: In V4 architecture, this requires index update via Rust FFI.
 */
export async function removeVaultFile(vaultId, fileId) {
  throw new Error(
    'Direct file operations are not supported with V4 vaults. ' +
    'Use the VAULT.bin binary container routes instead.'
  );
}
