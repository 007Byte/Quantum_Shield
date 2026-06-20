import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVaultId,
  validateFileId,
  validateFileName,
  MAX_FILE_SIZE,
} from '../utils/fileValidation.js';

// ---------------------------------------------------------------------------
// validateVaultId
// ---------------------------------------------------------------------------
describe('validateVaultId', () => {
  it('accepts a valid UUID v4', () => {
    const result = validateVaultId('550e8400-e29b-41d4-a716-446655440000');
    assert.equal(result.valid, true);
    assert.equal(result.value, '550e8400-e29b-41d4-a716-446655440000');
  });

  it('accepts uppercase UUID', () => {
    const result = validateVaultId('550E8400-E29B-41D4-A716-446655440000');
    assert.equal(result.valid, true);
  });

  it('rejects non-UUID string', () => {
    assert.equal(validateVaultId('not-a-uuid').valid, false);
    assert.equal(validateVaultId('12345').valid, false);
  });

  it('rejects empty string', () => {
    const result = validateVaultId('');
    assert.equal(result.valid, false);
  });

  it('rejects non-string input', () => {
    assert.equal(validateVaultId(123).valid, false);
    assert.equal(validateVaultId(null).valid, false);
    assert.equal(validateVaultId(undefined).valid, false);
  });

  it('returns an error message on failure', () => {
    const result = validateVaultId('bad');
    assert.equal(result.valid, false);
    assert.ok(typeof result.error === 'string');
    assert.ok(result.error.length > 0);
  });
});

// ---------------------------------------------------------------------------
// validateFileId
// ---------------------------------------------------------------------------
describe('validateFileId', () => {
  it('accepts a valid UUID', () => {
    const result = validateFileId('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  });

  it('rejects non-UUID string', () => {
    assert.equal(validateFileId('file-123').valid, false);
  });

  it('rejects non-string input', () => {
    assert.equal(validateFileId(null).valid, false);
    assert.equal(validateFileId(42).valid, false);
  });

  it('rejects empty string', () => {
    assert.equal(validateFileId('').valid, false);
  });
});

// ---------------------------------------------------------------------------
// validateFileName
// ---------------------------------------------------------------------------
describe('validateFileName', () => {
  it('accepts a simple file name', () => {
    const result = validateFileName('report.pdf');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'report.pdf');
  });

  it('accepts names with spaces, dashes, underscores', () => {
    const result = validateFileName('My File-backup_2024.txt');
    assert.equal(result.valid, true);
  });

  it('strips ../ path traversal and validates basename', () => {
    // "../etc/passwd" -> basename "passwd" which is a valid filename
    const result = validateFileName('../etc/passwd');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'passwd');
  });

  it('strips ..\\ path traversal and validates basename', () => {
    // "..\\windows\\system32" -> basename "system32" which is valid
    const result = validateFileName('..\\windows\\system32');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'system32');
  });

  it('strips leading path components and validates basename', () => {
    // "/some/path/safe-file.txt" -> basename "safe-file.txt" should pass
    const result = validateFileName('/some/path/safe-file.txt');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'safe-file.txt');
  });

  it('rejects empty string', () => {
    const result = validateFileName('');
    assert.equal(result.valid, false);
  });

  it('rejects non-string input', () => {
    assert.equal(validateFileName(null).valid, false);
    assert.equal(validateFileName(123).valid, false);
    assert.equal(validateFileName(undefined).valid, false);
  });

  it('rejects names longer than 255 characters', () => {
    const longName = 'a'.repeat(256);
    assert.equal(validateFileName(longName).valid, false);
  });

  it('accepts name of exactly 255 characters', () => {
    const maxName = 'a'.repeat(255);
    assert.equal(validateFileName(maxName).valid, true);
  });

  it('rejects dotfiles (names starting with .)', () => {
    const result = validateFileName('.hidden');
    assert.equal(result.valid, false);
  });

  it('rejects names with null bytes via pattern check', () => {
    const result = validateFileName('file\x00.txt');
    assert.equal(result.valid, false);
  });

  it('rejects names with control characters', () => {
    const result = validateFileName('file\nname.txt');
    assert.equal(result.valid, false);
  });

  it('rejects names with special shell characters', () => {
    assert.equal(validateFileName('file;rm -rf /.txt').valid, false);
    assert.equal(validateFileName('$(whoami).txt').valid, false);
    assert.equal(validateFileName('file|cat.txt').valid, false);
  });
});

// ---------------------------------------------------------------------------
// MAX_FILE_SIZE constant
// ---------------------------------------------------------------------------
describe('MAX_FILE_SIZE', () => {
  it('is 100 MB', () => {
    assert.equal(MAX_FILE_SIZE, 100 * 1024 * 1024);
  });
});
