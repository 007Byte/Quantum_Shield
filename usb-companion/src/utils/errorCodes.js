/**
 * USBVault Error Codes — V2.0 Fortress Spec §11 compliant
 *
 * Centralized error code constants for consistent JSON error responses.
 * All companion endpoints return { error_code, message, details? }.
 */

// ── USB Operation Errors ──
export const NO_USB = 'NO_USB';
export const EJECT_FAILED = 'EJECT_FAILED';
export const PROVISION_FAILED = 'PROVISION_FAILED';
export const MOUNT_FAILED = 'MOUNT_FAILED';
export const ADMIN_REQUIRED = 'ADMIN_REQUIRED';
export const ADMIN_AUTH_FAILED = 'ADMIN_AUTH_FAILED';
export const DISK_FULL = 'DISK_FULL';

// ── Vault Errors ──
export const BAD_MAGIC = 'BAD_MAGIC';
export const BAD_VERSION = 'BAD_VERSION';
export const BAD_HMAC = 'BAD_HMAC';
export const BAD_INDEX = 'BAD_INDEX';
export const FILE_NOT_FOUND = 'FILE_NOT_FOUND_IN_VAULT';

// ── Validation Errors ──
export const VALIDATION_ERROR = 'VALIDATION_ERROR';
export const INVALID_INPUT = 'INVALID_INPUT';

// ── General ──
export const INTERNAL_ERROR = 'INTERNAL_ERROR';
export const RATE_LIMITED = 'RATE_LIMITED';

/**
 * Create a structured error response body.
 * @param {string} errorCode - One of the constants above
 * @param {string} message - Human-readable message
 * @param {object} [details] - Additional context
 * @returns {{ error_code: string, message: string, details?: object }}
 */
export function errorResponse(errorCode, message, details) {
  const body = { error_code: errorCode, message };
  if (details) body.details = details;
  return body;
}
