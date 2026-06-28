/**
 * Vault Container Service — Pure binary I/O for VAULT.bin
 *
 * This service handles ONLY binary read/write operations on the VAULT.bin
 * encrypted container. ALL crypto operations happen in the app via Rust FFI.
 *
 * IMPORTANT: VAULT.bin lives at the ROOT of the partition, matching the
 * original Python USBVault app:
 *   vault_file = os.path.join(secure_mount, "VAULT.bin")
 *
 * SECURITY INVARIANTS:
 *   - No key material, passwords, or plaintext ever touch this service
 *   - The companion is a dumb I/O proxy — it cannot decrypt anything
 *   - All I/O uses exclusive file handles to prevent corruption
 *   - fsync() after every write for USB durability
 *   - Mount point validated against known USB paths
 */

import { open, stat, access, constants, rename, statfs } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { logger, audit } from '../utils/logger.js';

/** VAULT.bin magic bytes: "USBVLT04" */
const VAULT_MAGIC = Buffer.from('USBVLT04', 'ascii');

/** Also accept V2/V3 magic for discovery (backward compat) */
const VAULT_MAGIC_V2 = Buffer.from('USBVLT02', 'ascii');
const VAULT_MAGIC_V3 = Buffer.from('USBVLT03', 'ascii');

/** V4 header size: 24576 bytes (24 KiB) */
const HEADER_SIZE = 24576;

/** Maximum single read/write: 64 MiB (prevents OOM on malicious requests) */
const MAX_IO_SIZE = 64 * 1024 * 1024;

/**
 * 50% Capacity Rule — V2.0 Fortress Spec §9 (VAULT_SIZE_LIMIT_PERCENT)
 *
 * USBVault enforces that VAULT.bin never exceeds 50% of the SECURE partition.
 * During compaction, both old and new vault files exist simultaneously — the
 * 50% rule guarantees compaction always has room to complete.
 *
 * Secondary benefits:
 * - Write amplification buffer for flash wear leveling
 * - Crash recovery margin (partial writes don't fill partition)
 * - Filesystem operating headroom
 * - Flash drive translation layer buffer
 */
const VAULT_SIZE_LIMIT_PERCENT = 0.50;

// ---------------------------------------------------------------------------
// Per-mountPoint write serialization
//
// VAULT.bin mutations (header write, append, compact) are read-modify-write on a
// single shared file. Two concurrent mutators corrupt the container — e.g. two
// appends both read the same end offset and overwrite each other, or an append
// races a compact's read-all/rewrite/rename. The companion serves concurrent HTTP
// requests, so serialize ALL mutators per resolved mount path: each runs only after
// the previous one for that mount has settled.
// ---------------------------------------------------------------------------
const _vaultWriteChains = new Map();
function withVaultWriteLock(mountPoint, fn) {
  const key = resolve(mountPoint);
  const prev = _vaultWriteChains.get(key) || Promise.resolve();
  const result = prev.then(fn, fn); // run after prev settles, regardless of outcome
  // Keep a non-rejecting tail so a failed mutation does not break the chain.
  _vaultWriteChains.set(key, result.then(() => {}, () => {}));
  return result;
}

export function writeVaultHeader(mountPoint, headerBytes) {
  return withVaultWriteLock(mountPoint, () => _writeVaultHeaderImpl(mountPoint, headerBytes));
}
export function appendBytes(mountPoint, data) {
  return withVaultWriteLock(mountPoint, () => _appendBytesImpl(mountPoint, data));
}
export function compactVault(mountPoint, activeFiles) {
  return withVaultWriteLock(mountPoint, () => _compactVaultImpl(mountPoint, activeFiles));
}

/**
 * Validate that a mount point is under a known USB mount directory.
 * Prevents arbitrary filesystem access via path traversal.
 */
function validateMountPoint(mountPoint) {
  const resolved = resolve(mountPoint);
  // Windows drive letters (e.g., E:\) are also valid
  const isWindowsDrive = /^[A-Z]:\\/.test(resolved);
  const allowed = ['/Volumes/', '/media/', '/mnt/', '/run/media/'];
  const isAllowed = isWindowsDrive || allowed.some(prefix => resolved.startsWith(prefix));
  if (!isAllowed) {
    throw new Error('Mount point is not under a known USB mount directory');
  }
  return resolved;
}

/**
 * Get the path to VAULT.bin at the ROOT of the mount point.
 *
 * VAULT.bin is at the partition root — NOT in a subdirectory.
 * This matches the original Python USBVault app exactly.
 */
function vaultBinPath(mountPoint) {
  return join(validateMountPoint(mountPoint), 'VAULT.bin');
}

/**
 * Check if adding `additionalBytes` to VAULT.bin would exceed the 50% capacity rule.
 *
 * @param {string} mountPoint - SECURE partition mount path
 * @param {number} additionalBytes - Bytes about to be written
 * @returns {Promise<{allowed: boolean, vaultSize: number, partitionTotal: number, maxAllowed: number, remaining: number}>}
 */
export async function checkCapacity(mountPoint, additionalBytes = 0) {
  const resolved = validateMountPoint(mountPoint);

  // Get partition total size via statfs
  let partitionTotal;
  try {
    const fsStats = await statfs(resolved);
    partitionTotal = fsStats.blocks * fsStats.bsize;
  } catch {
    // statfs may not work on all platforms — fallback to large value (no limit)
    logger.warn('[capacity] statfs failed, skipping 50% check', { mountPoint });
    return { allowed: true, vaultSize: 0, partitionTotal: 0, maxAllowed: 0, remaining: 0 };
  }

  // Get current VAULT.bin size
  let vaultSize = 0;
  try {
    const path = vaultBinPath(mountPoint);
    const fileStat = await stat(path);
    vaultSize = fileStat.size;
  } catch {
    // VAULT.bin doesn't exist yet — size is 0
  }

  const maxAllowed = Math.floor(partitionTotal * VAULT_SIZE_LIMIT_PERCENT);
  const projectedSize = vaultSize + additionalBytes;
  const remaining = Math.max(0, maxAllowed - vaultSize);
  const allowed = projectedSize <= maxAllowed;

  if (!allowed) {
    logger.warn('[capacity] 50% rule would be exceeded', {
      mountPoint,
      vaultSize,
      additionalBytes,
      projectedSize,
      maxAllowed,
      partitionTotal,
    });
  }

  return { allowed, vaultSize, partitionTotal, maxAllowed, remaining };
}

/**
 * Read the vault header (first 24576 bytes of VAULT.bin).
 *
 * @param {string} mountPoint - USB drive mount path
 * @returns {Promise<Buffer>} - Raw header bytes (24576 bytes)
 */
export async function readVaultHeader(mountPoint) {
  const path = vaultBinPath(mountPoint);
  const fd = await open(path, 'r');
  try {
    const buf = Buffer.alloc(HEADER_SIZE);
    const { bytesRead } = await fd.read(buf, 0, HEADER_SIZE, 0);
    if (bytesRead < HEADER_SIZE) {
      throw new Error(`VAULT.bin header truncated: expected ${HEADER_SIZE}, got ${bytesRead}`);
    }
    // Verify magic bytes
    if (!buf.subarray(0, 8).equals(VAULT_MAGIC)) {
      throw new Error('Invalid VAULT.bin: magic bytes mismatch');
    }

    return buf;
  } finally {
    await fd.close();
  }
}

/**
 * Write (overwrite) the vault header (first 24576 bytes of VAULT.bin).
 * Uses fsync for USB durability.
 *
 * @param {string} mountPoint - USB drive mount path
 * @param {Buffer} headerBytes - Exactly 24576 bytes
 */
async function _writeVaultHeaderImpl(mountPoint, headerBytes) {
  if (!Buffer.isBuffer(headerBytes) || headerBytes.length !== HEADER_SIZE) {
    throw new Error(`Header must be exactly ${HEADER_SIZE} bytes`);
  }
  // HIGH-1: refuse to overwrite the header region with bytes that do not carry the
  // VAULT magic. The read path already enforces the magic; without the same check
  // here an unauthenticated raw write could clobber VAULT.bin's header with
  // arbitrary data.
  if (!headerBytes.subarray(0, 8).equals(VAULT_MAGIC)) {
    throw new Error('Refusing to write header: VAULT magic bytes mismatch');
  }

  const path = vaultBinPath(mountPoint);
  const fd = await open(path, 'r+');
  try {
    await fd.write(headerBytes, 0, HEADER_SIZE, 0);
    await fd.datasync();
  } finally {
    await fd.close();
  }

  // Post-write integrity verification (USB durability). MED-1: this deliberately
  // does NOT log salt / wrapped-MEK / KDF bytes — the previous DIAG logging leaked
  // key material at info level.
  const verifyFd = await open(path, 'r');
  try {
    const verifyBuf = Buffer.alloc(HEADER_SIZE);
    await verifyFd.read(verifyBuf, 0, HEADER_SIZE, 0);
    if (!headerBytes.equals(verifyBuf)) {
      logger.error('[writeVaultHeader] post-write verification failed: on-disk header differs from what was written', { mountPoint });
    }
  } finally {
    await verifyFd.close();
  }

  audit.log('vault_header_written', { mountPoint });
}

/**
 * Read an arbitrary byte range from VAULT.bin.
 *
 * @param {string} mountPoint - USB drive mount path
 * @param {number} offset - Byte offset to start reading
 * @param {number} length - Number of bytes to read
 * @returns {Promise<Buffer>} - Read bytes
 */
export async function readBytes(mountPoint, offset, length) {
  if (offset < 0 || length <= 0) {
    throw new Error('Invalid offset or length');
  }
  if (length > MAX_IO_SIZE) {
    throw new Error(`Read size ${length} exceeds maximum ${MAX_IO_SIZE}`);
  }

  const path = vaultBinPath(mountPoint);
  const fd = await open(path, 'r');
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fd.read(buf, 0, length, offset);
    if (bytesRead < length) {
      throw new Error(`Short read: expected ${length}, got ${bytesRead}`);
    }
    return buf;
  } finally {
    await fd.close();
  }
}

/**
 * Append bytes to the end of VAULT.bin.
 * Returns the offset and length of the appended data.
 * Uses fsync for USB durability.
 *
 * @param {string} mountPoint - USB drive mount path
 * @param {Buffer} data - Bytes to append
 * @returns {Promise<{offset: number, length: number}>}
 */
async function _appendBytesImpl(mountPoint, data) {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    throw new Error('Data must be a non-empty Buffer');
  }
  if (data.length > MAX_IO_SIZE) {
    throw new Error(`Write size ${data.length} exceeds maximum ${MAX_IO_SIZE}`);
  }

  // 50% Capacity Rule: reject writes that would exceed the limit
  const capacity = await checkCapacity(mountPoint, data.length);
  if (!capacity.allowed) {
    const maxMB = (capacity.maxAllowed / (1024 * 1024)).toFixed(1);
    const remainMB = (capacity.remaining / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Vault capacity limit reached (50% rule). ` +
      `Maximum vault size: ${maxMB} MB, remaining: ${remainMB} MB. ` +
      `Compact the vault or use a larger USB drive.`
    );
  }

  const path = vaultBinPath(mountPoint);
  const fd = await open(path, 'r+');
  try {
    const fileStat = await fd.stat();
    const offset = fileStat.size;
    await fd.write(data, 0, data.length, offset);
    await fd.datasync();
    return { offset, length: data.length };
  } finally {
    await fd.close();
  }
}

/**
 * Get the current size of VAULT.bin.
 *
 * @param {string} mountPoint - USB drive mount path
 * @returns {Promise<number>} - File size in bytes
 */
export async function getVaultSize(mountPoint) {
  const path = vaultBinPath(mountPoint);
  const fileStat = await stat(path);
  return fileStat.size;
}

/**
 * Compact VAULT.bin by rewriting it with only the referenced file records.
 *
 * The frontend provides the active index (file IDs → { offset, length }) from
 * the decrypted in-memory index. This function:
 *   1. Reads the existing header (24 KiB)
 *   2. Copies only the referenced byte ranges (active file records)
 *   3. Rewrites VAULT.bin = header + active records (no orphaned data)
 *   4. Returns the new offsets so the frontend can rebuild the encrypted index
 *
 * SECURITY: No crypto here — the companion just moves encrypted byte ranges.
 * The frontend will re-encrypt the index with updated offsets afterward.
 *
 * @param {string} mountPoint - USB drive mount path
 * @param {{ [fileId: string]: { offset: number, length: number } }} activeFiles - Active file records from index
 * @returns {Promise<{ newOffsets: { [fileId: string]: { offset: number, length: number } }, oldSize: number, newSize: number }>}
 */
async function _compactVaultImpl(mountPoint, activeFiles) {
  const path = vaultBinPath(mountPoint);

  // Step 1: Read original file size
  const fileStat = await stat(path);
  const oldSize = fileStat.size;

  // Step 2: Read header
  const fd = await open(path, 'r');
  let header;
  try {
    header = Buffer.alloc(HEADER_SIZE);
    await fd.read(header, 0, HEADER_SIZE, 0);
  } finally {
    await fd.close();
  }

  // Step 3: Read each active file record
  const newOffsets = {};
  const records = [];
  let writeOffset = HEADER_SIZE;

  const readFd = await open(path, 'r');
  try {
    for (const [fileId, entry] of Object.entries(activeFiles)) {
      if (!entry.offset || !entry.length || entry.length <= 0) {
        logger.warn(`[compact] Skipping file ${fileId}: invalid offset/length`, entry);
        continue;
      }
      if (entry.length > MAX_IO_SIZE) {
        logger.warn(`[compact] Skipping file ${fileId}: too large (${entry.length})`);
        continue;
      }
      const buf = Buffer.alloc(entry.length);
      const { bytesRead } = await readFd.read(buf, 0, entry.length, entry.offset);
      if (bytesRead < entry.length) {
        logger.warn(`[compact] Short read for file ${fileId}: expected ${entry.length}, got ${bytesRead}`);
        continue;
      }
      records.push({ fileId, buf });
      newOffsets[fileId] = { offset: writeOffset, length: entry.length };
      writeOffset += entry.length;
    }
  } finally {
    await readFd.close();
  }

  // Step 4: Write compacted VAULT.bin (header + active records only)
  // Use a write-then-rename pattern for atomicity
  const tmpPath = path + '.compact';
  const writeFd = await open(tmpPath, 'w');
  try {
    // Write header
    await writeFd.write(header, 0, HEADER_SIZE, 0);
    // Write each record at its new offset
    for (const { buf } of records) {
      await writeFd.write(buf, 0, buf.length, null); // sequential writes
    }
    await writeFd.datasync();
  } finally {
    await writeFd.close();
  }

  // Step 5: Atomic rename (replace old VAULT.bin with compacted version)
  await rename(tmpPath, path);

  const newSize = writeOffset;
  logger.info(`[compact] Vault compacted: ${oldSize} → ${newSize} bytes (saved ${oldSize - newSize})`, {
    mountPoint,
    fileCount: Object.keys(newOffsets).length,
    spaceSaved: oldSize - newSize,
  });

  // MED-9: `audit` is an object with a `.log` method (see utils/logger.js); calling
  // it as a function threw a TypeError, silently losing the compaction audit record
  // (and surfacing as a 500 to the caller). Use audit.log, matching every other site.
  audit.log('vault_compacted', { mountPoint, oldSize, newSize, spaceSaved: oldSize - newSize });

  return { newOffsets, oldSize, newSize };
}

/**
 * Check if a mount point contains a valid VAULT.bin at its root.
 * Accepts V2, V3, and V4 magic bytes for backward compatibility.
 *
 * @param {string} mountPoint - USB drive mount path
 * @returns {Promise<boolean>}
 */
export async function hasVaultBin(mountPoint) {
  try {
    const path = vaultBinPath(mountPoint);
    await access(path, constants.F_OK);
    // Check magic bytes
    const fd = await open(path, 'r');
    try {
      const magic = Buffer.alloc(8);
      await fd.read(magic, 0, 8, 0);
      return magic.equals(VAULT_MAGIC)
        || magic.equals(VAULT_MAGIC_V2)
        || magic.equals(VAULT_MAGIC_V3);
    } finally {
      await fd.close();
    }
  } catch {
    return false;
  }
}

/**
 * Read the plaintext identity block from a VAULT.bin header.
 * The identity block is at offset 224 in the header, preceded by
 * a 2-byte LE length prefix.
 *
 * This is readable WITHOUT the password — used for vault discovery.
 * Matches the original Python app's vault_identity.py behavior.
 *
 * @param {string} mountPoint - USB drive mount path
 * @returns {Promise<{id: string, name: string, created: string, version: number} | null>}
 */
export async function readVaultIdentity(mountPoint) {
  try {
    const path = vaultBinPath(mountPoint);
    const fd = await open(path, 'r');
    try {
      // Read enough for magic + identity region
      const buf = Buffer.alloc(768);
      const { bytesRead } = await fd.read(buf, 0, 768, 0);
      if (bytesRead < 228) return null;

      // Verify magic (any version)
      const magic = buf.subarray(0, 8);
      if (!magic.equals(VAULT_MAGIC) && !magic.equals(VAULT_MAGIC_V2) && !magic.equals(VAULT_MAGIC_V3)) {
        return null;
      }

      // Read identity length at offset 224 (2 bytes LE)
      const idLen = buf.readUInt16LE(224);
      if (idLen === 0 || idLen > 544) return null;

      // Read identity JSON at offset 226
      const idJson = buf.subarray(226, 226 + idLen).toString('utf-8');
      return JSON.parse(idJson);
    } finally {
      await fd.close();
    }
  } catch {
    return null;
  }
}
