import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDriveId,
  validateProvisionParams,
  validateResetParams,
} from '../utils/validation.js';

// ---------------------------------------------------------------------------
// validateDriveId
// ---------------------------------------------------------------------------
describe('validateDriveId', () => {
  it('accepts a simple alphanumeric drive ID', () => {
    const result = validateDriveId('disk2s1');
    assert.equal(result.valid, true);
    assert.equal(result.value, 'disk2s1');
  });

  it('accepts drive IDs with dashes, underscores, dots, colons', () => {
    const result = validateDriveId('USB-Drive_01:v2.0');
    assert.equal(result.valid, true);
  });

  it('rejects non-string input', () => {
    assert.equal(validateDriveId(123).valid, false);
    assert.equal(validateDriveId(null).valid, false);
    assert.equal(validateDriveId(undefined).valid, false);
  });

  it('rejects path traversal sequences', () => {
    assert.equal(validateDriveId('../etc').valid, false);
    assert.equal(validateDriveId('foo/bar').valid, false);
    assert.equal(validateDriveId('foo\\bar').valid, false);
  });

  it('rejects empty string', () => {
    assert.equal(validateDriveId('').valid, false);
  });

  it('rejects IDs longer than 128 characters', () => {
    const longId = 'a'.repeat(129);
    assert.equal(validateDriveId(longId).valid, false);
  });

  it('accepts ID of exactly 128 characters', () => {
    const maxId = 'a'.repeat(128);
    assert.equal(validateDriveId(maxId).valid, true);
  });
});

// ---------------------------------------------------------------------------
// validateProvisionParams
// ---------------------------------------------------------------------------
describe('validateProvisionParams', () => {
  const validBody = {
    drive_id: 'disk2s1',
    format_type: 'quick',
    file_system: 'exfat',
    master_password: 'secureP@ss1',
    confirm: true,
  };

  it('accepts valid provision params', () => {
    const result = validateProvisionParams(validBody);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.deepEqual(result.params, {
      driveId: 'disk2s1',
      formatType: 'quick',
      fileSystem: 'exfat',
      masterPassword: 'secureP@ss1',
      // validateProvisionParams also returns vault/partition naming (defaults).
      vaultName: 'USBVault',
      partitionName: undefined,
    });
  });

  it('rejects missing drive_id', () => {
    const body = { ...validBody, drive_id: undefined };
    const result = validateProvisionParams(body);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /drive id/i.test(e) || /string/i.test(e)));
  });

  it('rejects missing master_password', () => {
    const body = { ...validBody, master_password: undefined };
    const result = validateProvisionParams(body);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /master_password/i.test(e)));
  });

  it('rejects password shorter than 8 characters', () => {
    const body = { ...validBody, master_password: 'short' };
    const result = validateProvisionParams(body);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /8 characters/i.test(e)));
  });

  it('rejects password longer than 256 characters', () => {
    const body = { ...validBody, master_password: 'a'.repeat(257) };
    const result = validateProvisionParams(body);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /256/i.test(e)));
  });

  it('rejects invalid format_type', () => {
    const body = { ...validBody, format_type: 'superfast' };
    const result = validateProvisionParams(body);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /format_type/i.test(e)));
  });

  it('rejects invalid file_system', () => {
    const body = { ...validBody, file_system: 'fat32' };
    const result = validateProvisionParams(body);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /file_system/i.test(e)));
  });

  it('accepts all valid file_system values', () => {
    for (const fs of ['exfat', 'ntfs', 'ext4']) {
      const body = { ...validBody, file_system: fs };
      assert.equal(validateProvisionParams(body).valid, true);
    }
  });

  it('rejects when confirm is not true', () => {
    const body = { ...validBody, confirm: false };
    const result = validateProvisionParams(body);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /confirm/i.test(e)));
  });

  it('rejects when confirm is missing', () => {
    const { confirm: _, ...body } = validBody;
    const result = validateProvisionParams(body);
    assert.equal(result.valid, false);
  });

  it('returns null params on validation failure', () => {
    const result = validateProvisionParams({});
    assert.equal(result.params, null);
  });

  it('collects multiple errors at once', () => {
    const result = validateProvisionParams({});
    assert.ok(result.errors.length > 1);
  });
});

// ---------------------------------------------------------------------------
// validateResetParams
// ---------------------------------------------------------------------------
describe('validateResetParams', () => {
  const validBody = {
    drive_id: 'disk2s1',
    wipe_method: 'quick',
    confirm: true,
  };

  it('accepts valid reset params', () => {
    const result = validateResetParams(validBody);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.deepEqual(result.params, {
      driveId: 'disk2s1',
      wipeMethod: 'quick',
      passes: 1,
    });
  });

  it('rejects missing drive_id', () => {
    const body = { ...validBody, drive_id: undefined };
    const result = validateResetParams(body);
    assert.equal(result.valid, false);
  });

  it('rejects invalid wipe_method', () => {
    const body = { ...validBody, wipe_method: 'nuke' };
    const result = validateResetParams(body);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /wipe_method/i.test(e)));
  });

  it('accepts wipe_method "secure"', () => {
    const body = { ...validBody, wipe_method: 'secure', passes: 3 };
    const result = validateResetParams(body);
    assert.equal(result.valid, true);
    assert.equal(result.params.passes, 3);
  });

  it('rejects passes > 7 for secure wipe', () => {
    const body = { ...validBody, wipe_method: 'secure', passes: 8 };
    const result = validateResetParams(body);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => /passes/i.test(e)));
  });

  it('rejects passes < 1 for secure wipe', () => {
    const body = { ...validBody, wipe_method: 'secure', passes: 0 };
    const result = validateResetParams(body);
    assert.equal(result.valid, false);
  });

  it('rejects non-integer passes for secure wipe', () => {
    const body = { ...validBody, wipe_method: 'secure', passes: 2.5 };
    const result = validateResetParams(body);
    assert.equal(result.valid, false);
  });

  it('defaults passes to 1 when not specified', () => {
    const body = { ...validBody, wipe_method: 'secure' };
    const result = validateResetParams(body);
    assert.equal(result.valid, true);
    assert.equal(result.params.passes, 1);
  });

  it('rejects when confirm is not true', () => {
    const body = { ...validBody, confirm: false };
    const result = validateResetParams(body);
    assert.equal(result.valid, false);
  });

  it('returns null params on validation failure', () => {
    const result = validateResetParams({});
    assert.equal(result.params, null);
  });
});
