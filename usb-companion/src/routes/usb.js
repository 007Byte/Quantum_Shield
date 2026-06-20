/**
 * USB API Routes
 *
 * Implements the endpoints that the frontend's usbService.ts expects:
 *   GET  /usb/drives                       — List connected USB drives
 *   POST /usb/provision                     — Provision an encrypted vault on a drive
 *   POST /usb/reset                         — Reset/wipe a drive
 *   GET  /usb/vault/:vaultId/files          — List files in a vault
 *   POST /usb/vault/:vaultId/files          — Upload a file to a vault
 *   DELETE /usb/vault/:vaultId/files/:fileId — Remove a file from a vault
 */

import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { detectUsbDrives } from '../services/usbDetector.js';
import { provisionVault } from '../services/usbProvisioner.js';
import { resetDrive } from '../services/usbResetter.js';
import { ejectDrive } from '../services/usbEjector.js';
import { runZeroTrace, scanArtifacts } from '../services/zeroTraceService.js';
import { discoverVaults, listVaultFiles, addVaultFile, removeVaultFile } from '../services/vaultFileService.js';
import {
  readVaultHeader, writeVaultHeader, readBytes, appendBytes,
  getVaultSize, hasVaultBin, readVaultIdentity, compactVault, checkCapacity,
} from '../services/vaultContainerService.js';
import { mountSecure, unmountSecure } from '../services/usbMounter.js';
import { validateProvisionParams, validateResetParams } from '../utils/validation.js';
import { validateVaultId, validateFileId, validateFileName, MAX_FILE_SIZE } from '../utils/fileValidation.js';
import { logger, audit } from '../utils/logger.js';
import { config } from '../utils/config.js';

/**
 * Sanitize error messages before sending to clients.
 * OS-level errors from diskutil/dd/parted can leak filesystem paths,
 * device names, and permission structures.
 */
function sanitizeError(err, fallbackMessage) {
  // Known application error codes are safe to pass through
  const safeErrorCodes = [
    'ADMIN_REQUIRED', 'ADMIN_AUTH_FAILED', 'NO_USB', 'EJECT_FAILED',
    'PROVISION_FAILED', 'MOUNT_FAILED', 'DISK_FULL',
  ];
  if (err.code && safeErrorCodes.includes(err.code)) {
    return err.message;
  }
  // Never expose raw OS error messages to the client
  return fallbackMessage;
}

export function usbRouter(destructiveLimiter) {
  const router = Router();

  /**
   * GET /usb/drives
   * Returns all connected USB block devices.
   */
  router.get('/drives', async (req, res, next) => {
    try {
      const drives = await detectUsbDrives();
      res.json({ drives });
    } catch (err) {
      logger.error('Failed to detect USB drives', { error: err.message });
      res.status(500).json({
        error: 'Failed to detect USB drives',
      });
    }
  });

  /**
   * GET /usb/provision/preflight
   * Pre-flight check: tells the frontend whether admin elevation is required
   * for provisioning on this platform. This avoids the fragile "try → fail →
   * detect permission error → prompt" pattern. The frontend can ask for the
   * admin password UPFRONT when needed.
   *
   * Returns: { needsAdmin: boolean, platform: string }
   */
  router.get('/provision/preflight', (req, res) => {
    const platform = config.platform;
    const isRoot = process.getuid ? process.getuid() === 0 : false;
    const needsAdmin = (platform === 'darwin' && !isRoot) || (platform === 'linux' && !isRoot);
    res.json({ needsAdmin, platform });
  });

  /**
   * POST /usb/provision
   * Provision a new encrypted vault on a USB drive.
   * Rate-limited (destructive operation).
   */
  router.post('/provision', destructiveLimiter, async (req, res, next) => {
    const validation = validateProvisionParams(req.body);
    if (!validation.valid) {
      audit.warn('provision_validation_failed', { errors: validation.errors });
      return res.status(400).json({
        error: 'Invalid parameters',
        details: validation.errors,
      });
    }

    try {
      const result = await provisionVault(validation.params);
      res.json(result);
    } catch (err) {
      if (err.code === 'ADMIN_REQUIRED') {
        return res.status(409).json({
          error: 'Administrator privileges required',
          code: 'ADMIN_REQUIRED',
        });
      }
      if (err.code === 'ADMIN_AUTH_FAILED') {
        return res.status(401).json({
          error: 'Incorrect administrator password',
          code: 'ADMIN_AUTH_FAILED',
        });
      }
      logger.error('Provisioning failed', { error: err.message });
      res.status(500).json({
        error: 'Failed to provision vault',
      });
    }
  });

  /**
   * POST /usb/provision/elevate
   * Same as /provision, but includes the admin password for sudo elevation.
   * Rate-limited to 2/minute (separate from normal destructive ops).
   *
   * Security:
   *   - admin_password never logged or stored
   *   - Only travels over localhost loopback (127.0.0.1)
   *   - Same trust boundary as user typing `sudo` in Terminal
   */
  const elevateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5, // Bug fix: was 2, too restrictive — users couldn't retry after a typo
    message: { error: 'Too many admin password attempts. Please wait before retrying.' },
    keyGenerator: () => 'localhost-elevate',
  });

  router.post('/provision/elevate', elevateLimiter, async (req, res, next) => {
    const validation = validateProvisionParams(req.body);
    if (!validation.valid) {
      audit.warn('provision_elevate_validation_failed', { errors: validation.errors });
      return res.status(400).json({
        error: 'Invalid parameters',
        details: validation.errors,
      });
    }

    const adminPassword = req.body.admin_password;
    if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.length < 1) {
      return res.status(400).json({
        error: 'admin_password is required for elevated provisioning',
      });
    }

    try {
      validation.params.adminPassword = adminPassword;
      const result = await provisionVault(validation.params);
      res.json(result);
    } catch (err) {
      if (err.code === 'ADMIN_AUTH_FAILED') {
        return res.status(401).json({
          error: 'Incorrect administrator password',
          code: 'ADMIN_AUTH_FAILED',
        });
      }
      logger.error('Elevated provisioning failed', { error: err.message });
      res.status(500).json({
        error: 'Failed to provision vault',
      });
    }
  });

  /**
   * POST /usb/reset
   * Reset/wipe a USB drive.
   * Rate-limited (destructive operation).
   */
  router.post('/reset', destructiveLimiter, async (req, res, next) => {
    // Validate input
    const validation = validateResetParams(req.body);
    if (!validation.valid) {
      audit.warn('reset_validation_failed', { errors: validation.errors });
      return res.status(400).json({
        error: 'Invalid parameters',
        details: validation.errors,
      });
    }

    try {
      await resetDrive(validation.params);
      res.json({ success: true, message: 'Drive reset completed successfully' });
    } catch (err) {
      logger.error('Drive reset failed', { error: err.message });
      res.status(500).json({
        error: 'Failed to reset drive',
      });
    }
  });

  /**
   * POST /usb/mount-secure
   * Mount the SECURE partition of a USB drive for file operations.
   * Returns the mount point path for use with VAULT.bin binary I/O routes.
   */
  router.post('/mount-secure', async (req, res) => {
    const driveId = req.body?.drive_id;
    if (!driveId || typeof driveId !== 'string') {
      return res.status(400).json({ error: 'drive_id is required' });
    }

    try {
      const result = await mountSecure(driveId);
      res.json(result);
    } catch (err) {
      logger.error('Failed to mount SECURE partition', { error: err.message });
      res.status(500).json({
        error: 'Failed to mount SECURE partition',
      });
    }
  });

  /**
   * POST /usb/unmount-secure
   * Unmount the SECURE partition after file operations are complete.
   * Re-hides the partition from casual inspection.
   */
  router.post('/unmount-secure', async (req, res) => {
    const driveId = req.body?.drive_id;
    if (!driveId || typeof driveId !== 'string') {
      return res.status(400).json({ error: 'drive_id is required' });
    }

    try {
      await unmountSecure(driveId);
      res.json({ success: true });
    } catch (err) {
      logger.error('Failed to unmount SECURE partition', { error: err.message });
      res.status(500).json({
        error: 'Failed to unmount SECURE partition',
      });
    }
  });

  /**
   * POST /usb/eject
   * Safely eject a USB drive (unmount all partitions + power off).
   * V2.0 Fortress Spec §4 compliant.
   * Rate-limited (destructive operation).
   */
  router.post('/eject', destructiveLimiter, async (req, res) => {
    const driveId = req.body?.drive_id;
    if (!driveId || typeof driveId !== 'string') {
      return res.status(400).json({ error_code: 'INVALID_INPUT', message: 'drive_id is required' });
    }

    try {
      await ejectDrive(driveId);
      res.json({ success: true, message: 'Drive ejected safely' });
    } catch (err) {
      logger.error('Failed to eject drive', { driveId, error: err.message });
      res.status(500).json({
        error_code: 'EJECT_FAILED',
        error: 'Failed to eject drive safely',
      });
    }
  });

  /**
   * POST /usb/zero-trace
   * Run full zero-trace cleanup for the current platform.
   * V2.0 Fortress Spec §13: 23+ forensic artifact classes cleaned.
   * Body: { volume_paths?: string[], drive_letter?: string, include_admin?: boolean }
   */
  router.post('/zero-trace', destructiveLimiter, async (req, res) => {
    const volumePaths = req.body?.volume_paths || [];
    const driveLetter = req.body?.drive_letter;
    const includeAdmin = req.body?.include_admin || false;

    try {
      const result = await runZeroTrace({ volumePaths, driveLetter, includeAdmin });
      res.json(result);
    } catch (err) {
      logger.error('Zero-trace cleanup failed', { error: err.message });
      res.status(500).json({ error: 'Zero-trace cleanup failed' });
    }
  });

  /**
   * POST /usb/zero-trace/elevate
   * Same as /zero-trace, but with admin password for elevated cleanup operations.
   * Uses sudoExec to run admin-only cleaners (e.g., Spotlight re-index, journal vacuum).
   * Rate-limited to 5/minute (reuses elevateLimiter from /provision/elevate).
   *
   * Security:
   *   - admin_password never logged or stored
   *   - Only travels over localhost loopback (127.0.0.1)
   *   - Same trust boundary as user typing `sudo` in Terminal
   *
   * Body: { volume_paths?: string[], drive_letter?: string, admin_password: string }
   */
  router.post('/zero-trace/elevate', elevateLimiter, async (req, res) => {
    const adminPassword = req.body?.admin_password;
    if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.length < 1) {
      return res.status(400).json({
        error: 'admin_password is required for elevated zero-trace cleanup',
      });
    }

    const volumePaths = req.body?.volume_paths || [];
    const driveLetter = req.body?.drive_letter;

    try {
      const result = await runZeroTrace({
        volumePaths,
        driveLetter,
        includeAdmin: true,
        adminPassword,
      });
      res.json(result);
    } catch (err) {
      if (err.code === 'ADMIN_AUTH_FAILED') {
        return res.status(401).json({
          error: 'Incorrect administrator password',
          code: 'ADMIN_AUTH_FAILED',
        });
      }
      logger.error('Elevated zero-trace cleanup failed', { error: err.message });
      res.status(500).json({ error: 'Elevated zero-trace cleanup failed' });
    }
  });

  /**
   * POST /usb/zero-trace/scan
   * Scan for detectable forensic artifacts (dry run — no deletion).
   * Body: { volume_paths?: string[] }
   */
  router.post('/zero-trace/scan', async (req, res) => {
    const volumePaths = req.body?.volume_paths || [];

    try {
      const detected = await scanArtifacts(volumePaths);
      res.json({ artifacts: detected, count: detected.length });
    } catch (err) {
      logger.error('Zero-trace scan failed', { error: err.message });
      res.status(500).json({ error: 'Zero-trace scan failed' });
    }
  });

  /**
   * GET /usb/vaults
   * Discover all provisioned vaults across mounted USB drives.
   */
  router.get('/vaults', async (req, res) => {
    try {
      const vaults = await discoverVaults();
      res.json({ vaults });
    } catch (err) {
      logger.error('Failed to discover vaults', { error: err.message });
      res.status(500).json({
        error: 'Failed to discover vaults',
      });
    }
  });

  /**
   * GET /usb/discover
   * Discover all provisioned vaults across connected USB drives.
   * Combines drive detection with vault detection — returns only drives
   * that contain a VAULT.bin file.
   */
  router.get('/discover', async (req, res) => {
    try {
      const drives = await detectUsbDrives();

      // DEBUG: Log full partition data so we can trace hasVault propagation
      for (const d of drives) {
        console.log(`[DEBUG /usb/discover] Drive ${d.id}: hasVault=${d.hasVault}, partitions:`,
          (d.partitions || []).map(p => ({ name: p.name, label: p.label, mountpoint: p.mountpoint, hasVault: p.hasVault }))
        );
      }

      const vaultsFound = drives
        .filter(d => d.hasVault || (d.partitions && d.partitions.some(p => p.hasVault)))
        .map(d => {
          // FIX: Return partitions that have hasVault=true.
          // If none have hasVault but drive does (legacy), return all mounted partitions
          // so the frontend can find a mountpoint.
          let vaultPartitions = (d.partitions || []).filter(p => p.hasVault);
          if (vaultPartitions.length === 0 && d.hasVault) {
            // Fallback: return all partitions with mountpoints
            vaultPartitions = (d.partitions || []).filter(p => p.mountpoint);
          }
          return {
            driveId: d.id,
            driveName: d.name,
            device: d.device,
            capacity: d.capacity,
            partitions: vaultPartitions,
          };
        });

      console.log(`[DEBUG /usb/discover] Returning ${vaultsFound.length} vaults:`,
        JSON.stringify(vaultsFound, null, 2));

      res.json({ vaults: vaultsFound, totalDrives: drives.length });
    } catch (err) {
      logger.error('Failed to discover vaults', { error: err.message });
      res.status(500).json({ error: 'Failed to discover vaults' });
    }
  });

  // ── Vault File Operations ──────────────────────────────────────────────

  /**
   * GET /usb/vault/:vaultId/files
   * List all files in a provisioned vault.
   */
  router.get('/vault/:vaultId/files', async (req, res) => {
    const vaultCheck = validateVaultId(req.params.vaultId);
    if (!vaultCheck.valid) {
      return res.status(400).json({ error: vaultCheck.error });
    }

    try {
      const files = await listVaultFiles(vaultCheck.value);
      res.json({ files });
    } catch (err) {
      logger.error('Failed to list vault files', { error: err.message });
      res.status(500).json({
        error: 'Failed to list vault files',
      });
    }
  });

  /**
   * POST /usb/vault/:vaultId/files
   * Upload a file to a vault.
   * File content sent as raw body (application/octet-stream).
   * File name sent in X-File-Name header.
   */
  router.post('/vault/:vaultId/files',
    express.raw({ limit: '100mb', type: 'application/octet-stream' }),
    async (req, res) => {
      const vaultCheck = validateVaultId(req.params.vaultId);
      if (!vaultCheck.valid) {
        return res.status(400).json({ error: vaultCheck.error });
      }

      const fileName = req.headers['x-file-name'];
      const nameCheck = validateFileName(fileName);
      if (!nameCheck.valid) {
        return res.status(400).json({ error: nameCheck.error });
      }

      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: 'File content cannot be empty' });
      }

      if (req.body.length > MAX_FILE_SIZE) {
        return res.status(413).json({ error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024} MB` });
      }

      try {
        const fileMeta = await addVaultFile(vaultCheck.value, nameCheck.value, req.body);
        res.status(201).json(fileMeta);
      } catch (err) {
        logger.error('Failed to upload file to vault', { error: err.message });
        res.status(500).json({
          error: 'Failed to upload file',
        });
      }
    }
  );

  /**
   * DELETE /usb/vault/:vaultId/files/:fileId
   * Remove a file from a vault.
   * Requires confirm: true in body (destructive operation).
   */
  router.delete('/vault/:vaultId/files/:fileId', destructiveLimiter, async (req, res) => {
    const vaultCheck = validateVaultId(req.params.vaultId);
    if (!vaultCheck.valid) {
      return res.status(400).json({ error: vaultCheck.error });
    }

    const fileCheck = validateFileId(req.params.fileId);
    if (!fileCheck.valid) {
      return res.status(400).json({ error: fileCheck.error });
    }

    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: 'confirm must be true to execute destructive operations' });
    }

    try {
      await removeVaultFile(vaultCheck.value, fileCheck.value);
      res.json({ success: true, message: 'File removed successfully' });
    } catch (err) {
      logger.error('Failed to remove file from vault', { error: err.message });
      res.status(500).json({
        error: 'Failed to remove file',
      });
    }
  });

  // ── VAULT.bin Binary Container Routes ────────────────────────────────
  // These routes provide raw binary I/O on VAULT.bin. ALL crypto happens
  // in the app via Rust FFI — the companion never sees keys or plaintext.

  /**
   * POST /usb/vault/init
   * Create a new VAULT.bin at the root of a mounted USB partition.
   * Body: raw header bytes (24576 bytes, application/octet-stream).
   * Query: mountPoint (required).
   *
   * NOTE: During normal provisioning, the provisioner creates VAULT.bin directly.
   * This endpoint is for manual/API-driven vault creation.
   */
  router.post('/vault/init',
    destructiveLimiter,
    express.raw({ limit: '32kb', type: 'application/octet-stream' }),
    async (req, res) => {
      const mountPoint = req.query.mountPoint;
      if (!mountPoint || typeof mountPoint !== 'string') {
        return res.status(400).json({ error: 'mountPoint query parameter required' });
      }

      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: 'Header bytes required in request body' });
      }

      if (req.body.length !== 24576) {
        return res.status(400).json({ error: 'Header must be exactly 24576 bytes' });
      }

      // Verify magic bytes
      const magic = req.body.subarray(0, 8).toString('ascii');
      if (magic !== 'USBVLT04') {
        return res.status(400).json({ error: 'Invalid header: magic bytes must be USBVLT04' });
      }

      try {
        // Write VAULT.bin at partition root (matching original Python app)
        const { open: fsOpen } = await import('node:fs/promises');
        const { join: pathJoin, resolve: pathResolve } = await import('node:path');

        const resolved = pathResolve(mountPoint);
        const allowed = ['/Volumes/', '/media/', '/mnt/', '/run/media/'];
        const isAllowed = allowed.some(prefix => resolved.startsWith(prefix));
        if (!isAllowed) {
          return res.status(400).json({ error: 'Mount point is not under a known USB mount directory' });
        }

        const vaultPath = pathJoin(resolved, 'VAULT.bin');
        const fd = await fsOpen(vaultPath, 'wx'); // fail if exists
        try {
          await fd.write(req.body, 0, req.body.length, 0);
          await fd.datasync();
        } finally {
          await fd.close();
        }

        audit.log('vault_init_created', { mountPoint: resolved });
        res.status(201).json({ success: true });
      } catch (err) {
        logger.error('Failed to create VAULT.bin', { error: err.message });
        res.status(500).json({ error: 'Failed to create vault container' });
      }
    }
  );

  /**
   * GET /usb/vault/container/header
   * Read the 24576-byte header from VAULT.bin.
   * Query: mountPoint (required).
   */
  router.get('/vault/container/header', async (req, res) => {
    const mountPoint = req.query.mountPoint;
    if (!mountPoint || typeof mountPoint !== 'string') {
      return res.status(400).json({ error: 'mountPoint query parameter required' });
    }

    try {
      const header = await readVaultHeader(mountPoint);
      res.set('Content-Type', 'application/octet-stream');
      res.send(header);
    } catch (err) {
      logger.error('Failed to read vault header', { error: err.message });
      res.status(500).json({ error: 'Failed to read vault header' });
    }
  });

  /**
   * PUT /usb/vault/container/header
   * Overwrite the 24576-byte header in VAULT.bin.
   * Body: raw header bytes (application/octet-stream).
   * Query: mountPoint (required).
   */
  router.put('/vault/container/header',
    express.raw({ limit: '32kb', type: 'application/octet-stream' }),
    async (req, res) => {
      const mountPoint = req.query.mountPoint;
      if (!mountPoint || typeof mountPoint !== 'string') {
        return res.status(400).json({ error: 'mountPoint query parameter required' });
      }

      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: 'Header bytes required in request body' });
      }

      try {
        await writeVaultHeader(mountPoint, req.body);
        res.json({ success: true });
      } catch (err) {
        logger.error('Failed to write vault header', { error: err.message });
        res.status(500).json({ error: 'Failed to write vault header' });
      }
    }
  );

  /**
   * GET /usb/vault/container/bytes
   * Read an arbitrary byte range from VAULT.bin.
   * Query: mountPoint, offset, length (all required).
   */
  router.get('/vault/container/bytes', async (req, res) => {
    const mountPoint = req.query.mountPoint;
    const offset = parseInt(req.query.offset, 10);
    const length = parseInt(req.query.length, 10);

    if (!mountPoint || typeof mountPoint !== 'string') {
      return res.status(400).json({ error: 'mountPoint query parameter required' });
    }
    if (isNaN(offset) || isNaN(length) || offset < 0 || length <= 0) {
      return res.status(400).json({ error: 'Valid offset and length query parameters required' });
    }

    try {
      const data = await readBytes(mountPoint, offset, length);
      res.set('Content-Type', 'application/octet-stream');
      res.send(data);
    } catch (err) {
      logger.error('Failed to read vault bytes', { error: err.message });
      res.status(500).json({ error: 'Failed to read vault bytes' });
    }
  });

  /**
   * POST /usb/vault/container/append
   * Append bytes to the end of VAULT.bin.
   * Body: raw bytes (application/octet-stream).
   * Query: mountPoint (required).
   * Returns: { offset, length } of the appended data.
   */
  router.post('/vault/container/append',
    express.raw({ limit: '100mb', type: 'application/octet-stream' }),
    async (req, res) => {
      const mountPoint = req.query.mountPoint;
      if (!mountPoint || typeof mountPoint !== 'string') {
        return res.status(400).json({ error: 'mountPoint query parameter required' });
      }

      if (!req.body || req.body.length === 0) {
        return res.status(400).json({ error: 'Data required in request body' });
      }

      try {
        const result = await appendBytes(mountPoint, req.body);
        res.status(201).json(result);
      } catch (err) {
        logger.error('Failed to append vault bytes', { error: err.message });
        res.status(500).json({ error: 'Failed to append vault bytes' });
      }
    }
  );

  /**
   * GET /usb/vault/container/size
   * Get the current size of VAULT.bin.
   * Query: mountPoint (required).
   */
  router.get('/vault/container/size', async (req, res) => {
    const mountPoint = req.query.mountPoint;
    if (!mountPoint || typeof mountPoint !== 'string') {
      return res.status(400).json({ error: 'mountPoint query parameter required' });
    }

    try {
      const size = await getVaultSize(mountPoint);
      res.json({ size });
    } catch (err) {
      logger.error('Failed to get vault size', { error: err.message });
      res.status(500).json({ error: 'Failed to get vault size' });
    }
  });

  /**
   * GET /usb/vault/container/capacity
   * Check vault capacity against the 50% rule.
   * Query: mountPoint (required), bytes (optional — bytes about to be written).
   * Returns: { allowed, vaultSize, partitionTotal, maxAllowed, remaining }
   */
  router.get('/vault/container/capacity', async (req, res) => {
    const mountPoint = req.query.mountPoint;
    if (!mountPoint || typeof mountPoint !== 'string') {
      return res.status(400).json({ error: 'mountPoint query parameter required' });
    }
    const additionalBytes = parseInt(req.query.bytes || '0', 10) || 0;

    try {
      const result = await checkCapacity(mountPoint, additionalBytes);
      res.json(result);
    } catch (err) {
      logger.error('Failed to check capacity', { error: err.message });
      res.status(500).json({ error: 'Failed to check capacity' });
    }
  });

  /**
   * POST /usb/vault/container/compact
   * Compact VAULT.bin by rewriting it with only active file records.
   * Body: { mountPoint: string, activeFiles: { [fileId]: { offset, length } } }
   * Returns: { newOffsets, oldSize, newSize, spaceSaved }
   */
  router.post('/vault/container/compact', async (req, res) => {
    const { mountPoint, activeFiles } = req.body || {};
    if (!mountPoint || typeof mountPoint !== 'string') {
      return res.status(400).json({ error: 'mountPoint required' });
    }
    if (!activeFiles || typeof activeFiles !== 'object') {
      return res.status(400).json({ error: 'activeFiles map required' });
    }

    try {
      const result = await compactVault(mountPoint, activeFiles);
      res.json({
        newOffsets: result.newOffsets,
        oldSize: result.oldSize,
        newSize: result.newSize,
        spaceSaved: result.oldSize - result.newSize,
      });
    } catch (err) {
      logger.error('Vault compaction failed', { error: err.message, mountPoint });
      res.status(500).json({ error: 'Vault compaction failed' });
    }
  });

  return router;
}
