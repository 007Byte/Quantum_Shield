/**
 * Input validation utilities — security-first approach.
 * All user input must pass validation before processing.
 */

// Strict allowlist for drive IDs — only alphanumeric, dashes, underscores
const DRIVE_ID_PATTERN = /^[a-zA-Z0-9_\-.:]{1,128}$/;

// Allowed file system types
const ALLOWED_FILESYSTEMS = new Set(['exfat', 'ntfs', 'ext4', 'apfs']);

// Allowed format types
const ALLOWED_FORMAT_TYPES = new Set(['quick', 'full']);

// Allowed wipe methods
const ALLOWED_WIPE_METHODS = new Set(['quick', 'secure']);

// Maximum wipe passes
const MAX_WIPE_PASSES = 7;

/**
 * Validate and sanitize a drive ID.
 * Prevents path traversal and command injection.
 */
export function validateDriveId(driveId) {
  if (typeof driveId !== 'string') {
    return { valid: false, error: 'Drive ID must be a string' };
  }
  if (!DRIVE_ID_PATTERN.test(driveId)) {
    return { valid: false, error: 'Drive ID contains invalid characters' };
  }
  // Block obvious path traversal attempts
  if (driveId.includes('..') || driveId.includes('/') || driveId.includes('\\')) {
    return { valid: false, error: 'Drive ID contains forbidden path characters' };
  }
  return { valid: true, value: driveId };
}

/**
 * Validate provision parameters.
 */
export function validateProvisionParams(body) {
  const errors = [];

  const driveCheck = validateDriveId(body?.drive_id);
  if (!driveCheck.valid) errors.push(driveCheck.error);

  if (!ALLOWED_FORMAT_TYPES.has(body?.format_type)) {
    errors.push(`format_type must be one of: ${[...ALLOWED_FORMAT_TYPES].join(', ')}`);
  }

  if (!ALLOWED_FILESYSTEMS.has(body?.file_system)) {
    errors.push(`file_system must be one of: ${[...ALLOWED_FILESYSTEMS].join(', ')}`);
  }

  if (typeof body?.master_password !== 'string' || body.master_password.length < 8) {
    errors.push('master_password must be at least 8 characters');
  }

  if (body?.master_password && body.master_password.length > 256) {
    errors.push('master_password must be at most 256 characters');
  }

  if (body?.confirm !== true) {
    errors.push('confirm must be true to execute destructive operations');
  }

  return {
    valid: errors.length === 0,
    errors,
    params: errors.length === 0 ? {
      driveId: body.drive_id,
      formatType: body.format_type,
      fileSystem: body.file_system,
      masterPassword: body.master_password,
      vaultName: typeof body.vault_name === 'string' && body.vault_name.trim()
        ? body.vault_name.trim().slice(0, 32)
        : 'USBVault',
      partitionName: typeof body.partition_name === 'string' && body.partition_name.trim()
        ? body.partition_name.trim().slice(0, 11)
        : undefined,
    } : null,
  };
}

/**
 * Validate reset/wipe parameters.
 */
export function validateResetParams(body) {
  const errors = [];

  const driveCheck = validateDriveId(body?.drive_id);
  if (!driveCheck.valid) errors.push(driveCheck.error);

  if (!ALLOWED_WIPE_METHODS.has(body?.wipe_method)) {
    errors.push(`wipe_method must be one of: ${[...ALLOWED_WIPE_METHODS].join(', ')}`);
  }

  if (body?.wipe_method === 'secure') {
    const passes = body?.passes ?? 1;
    if (!Number.isInteger(passes) || passes < 1 || passes > MAX_WIPE_PASSES) {
      errors.push(`passes must be an integer between 1 and ${MAX_WIPE_PASSES}`);
    }
  }

  if (body?.confirm !== true) {
    errors.push('confirm must be true to execute destructive operations');
  }

  return {
    valid: errors.length === 0,
    errors,
    params: errors.length === 0 ? {
      driveId: body.drive_id,
      wipeMethod: body.wipe_method,
      passes: body?.passes ?? 1,
    } : null,
  };
}
