/**
 * File validation utilities for vault file operations.
 * Security-first: prevents path traversal, validates UUIDs, restricts file names.
 */

import { basename as pathBasename } from 'node:path';

// UUID v4 format
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Safe file name: alphanumeric, dots, dashes, underscores, spaces
// No path separators, no control chars, no null bytes
const FILE_NAME_PATTERN = /^[a-zA-Z0-9._\- ]{1,255}$/;

// Maximum file size: 100 MB
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Validate a vault ID (must be UUID format).
 */
export function validateVaultId(vaultId) {
  if (typeof vaultId !== 'string') {
    return { valid: false, error: 'Vault ID must be a string' };
  }
  if (!UUID_PATTERN.test(vaultId)) {
    return { valid: false, error: 'Vault ID must be a valid UUID' };
  }
  return { valid: true, value: vaultId };
}

/**
 * Validate a file ID (must be UUID format).
 */
export function validateFileId(fileId) {
  if (typeof fileId !== 'string') {
    return { valid: false, error: 'File ID must be a string' };
  }
  if (!UUID_PATTERN.test(fileId)) {
    return { valid: false, error: 'File ID must be a valid UUID' };
  }
  return { valid: true, value: fileId };
}

/**
 * Validate and sanitize a file name.
 * Prevents path traversal and other injection attacks.
 */
export function validateFileName(name) {
  if (typeof name !== 'string') {
    return { valid: false, error: 'File name must be a string' };
  }

  // Reject encoded path separators and null bytes before any processing
  if (name.includes('%2f') || name.includes('%2F') || name.includes('%5c') || name.includes('%5C') || name.includes('\0')) {
    return { valid: false, error: 'File name contains encoded path separators or null bytes' };
  }

  // Normalize Windows backslashes to '/' first so path.basename strips them on
  // POSIX hosts too (path.basename only treats '\' as a separator on win32),
  // then take the basename for robust cross-platform path stripping.
  const safeName = pathBasename(name.replace(/\\/g, '/'));

  if (!safeName || safeName.length === 0) {
    return { valid: false, error: 'File name cannot be empty' };
  }

  // Block path traversal and hidden files
  if (safeName.includes('..') || safeName.startsWith('.')) {
    return { valid: false, error: 'File name cannot contain path traversal sequences' };
  }

  if (!FILE_NAME_PATTERN.test(safeName)) {
    return { valid: false, error: 'File name contains invalid characters (use alphanumeric, dots, dashes, underscores, spaces)' };
  }

  return { valid: true, value: safeName };
}
