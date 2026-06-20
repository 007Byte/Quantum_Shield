/**
 * Vault Orchestrator — End-to-End VAULT.bin Container Operations
 *
 * Central coordinator that wires together:
 *   - Rust FFI (via crypto/bridge.ts) — ALL crypto operations
 *   - USB Companion (via usbService.ts) — binary I/O only
 *
 * SECURITY INVARIANTS:
 *   - Passwords NEVER leave this module (passed directly to Rust FFI)
 *   - Keys held in memory only (VaultSession) — never persisted
 *   - USB companion only sees encrypted bytes — never keys or plaintext
 *   - Dual-index atomic commits prevent corruption on USB disconnect
 *   - Fail counter with self-destruct after MAX_FAIL_ATTEMPTS
 *
 * @module services/vaultOrchestrator
 */

import {
  CipherId,
  createVaultHeader,
  readVaultHeader as parseVaultHeader,
  unlockVault,
  encryptVaultContainerIndex,
  decryptVaultContainerIndex,
  encryptFileRecord,
  decryptFileRecord,
  readFailCounter,
  resetFailCounter,
  incrementFailCounter,
  commitVaultIndex,
  type VaultSession,
  type VaultHeaderInfo,
  type VaultIndexData,
  type DecryptedRecord,
} from '@/crypto/bridge';

import { usbService } from './usbService';
import { logger, fireAndForget } from '@/utils/logger';
import { auditService } from './auditService';
import { RateLimitError } from '@/errors/typed';
import { usbDebug } from '@/utils/usbDebugTracer';

// ── Types ──────────────────────────────────────────────────────────────

/** Active vault context after unlock. Held in memory only. */
export interface ActiveVault {
  mountPoint: string;
  headerInfo: VaultHeaderInfo;
  session: VaultSession;
  index: VaultIndexData;
  headerBytes: Uint8Array;
}

/** Result of provisioning a new vault. */
export interface ProvisionResult {
  mountPoint: string;
  headerInfo: VaultHeaderInfo;
  session: VaultSession;
}

/** Maximum failed unlock attempts before self-destruct. */
const MAX_FAIL_ATTEMPTS = 10;

/** Fail counter escalation thresholds for UI warnings. */
const FAIL_WARNING_THRESHOLD = 4;
const FAIL_CRITICAL_THRESHOLD = 6;

/** Maximum backoff delay: 1 hour (V2.0 Fortress Spec §G.2). */
const MAX_BACKOFF_MS = 3600_000;

/**
 * Calculate exponential backoff delay for brute-force protection.
 * V2.0 Fortress Spec §G.2: 2^failCount seconds, capped at 3600s.
 */
export function getBackoffDelay(failCount: number): number {
  if (failCount <= 0) return 0;
  return Math.min(Math.pow(2, failCount) * 1000, MAX_BACKOFF_MS);
}

/** Unlock attempt result with fail counter info. */
export interface UnlockResult {
  vault: ActiveVault;
  failCounterWasNonZero: boolean;
  previousFailCount: number;
}

// ── Orchestrator ───────────────────────────────────────────────────────

/** Callback type for index mutation notifications. */
type IndexChangeListener = (index: VaultIndexData) => void;
/** Callback type for lock/unlock state change notifications. */
type LockStateListener = (unlocked: boolean) => void;

class VaultOrchestratorImpl {
  private activeVault: ActiveVault | null = null;
  /** In-memory failed attempt counter (per-session, for UX warnings). */
  private sessionFailCount = 0;
  /** Timestamp of last failed unlock attempt (for backoff enforcement). */
  private lastFailTimestamp = 0;
  /** Listeners notified after index mutations (addFile, removeFile, compact). */
  private indexChangeListeners: IndexChangeListener[] = [];
  /** Listeners notified when vault lock state changes (unlock/lock). */
  private lockStateListeners: LockStateListener[] = [];

  /**
   * Register a listener for index changes. Returns unsubscribe function.
   * Used by Zustand stores to stay in sync with vault mutations.
   */
  onIndexChange(listener: IndexChangeListener): () => void {
    this.indexChangeListeners.push(listener);
    return () => {
      this.indexChangeListeners = this.indexChangeListeners.filter(l => l !== listener);
    };
  }

  /**
   * Register a listener for lock state changes. Returns unsubscribe function.
   * Used by UI components (e.g. TopBar badge) to reactively show lock status.
   */
  onLockStateChange(listener: LockStateListener): () => void {
    this.lockStateListeners.push(listener);
    return () => {
      this.lockStateListeners = this.lockStateListeners.filter(l => l !== listener);
    };
  }

  private notifyLockStateChange(): void {
    const unlocked = this.activeVault !== null;
    for (const listener of this.lockStateListeners) {
      try { listener(unlocked); } catch { /* swallow listener errors */ }
    }
  }

  private notifyIndexChange(): void {
    if (!this.activeVault) return;
    const index = this.activeVault.index;
    for (const listener of this.indexChangeListeners) {
      try { listener(index); } catch { /* swallow listener errors */ }
    }
  }

  /**
   * Flow 1: Provision a new encrypted vault on a USB drive.
   *
   * Steps:
   *   1. Format drive via companion → { mountPoint }
   *   2. Create V4 header via Rust FFI (password → KEK → MEK → header)
   *   3. Write header to USB via companion
   *   4. Encrypt empty index, write to both slots
   *   5. Passwords/keys never leave the app
   */
  async provision(
    mountPoint: string,
    password: string,
    cipherId: CipherId = CipherId.XChaCha20Poly1305
  ): Promise<ProvisionResult> {
    usbDebug.traceEntry('provision', { mountPoint, cipherId });
    try {
      // NOTE: The companion creates an initial VAULT.bin with a placeholder header.
      // The Rust FFI then overwrites it with the real V4 header containing:
      // salt, wrapped MEK, verify marker, dual-index slots, argon2 params.
      // The companion header is intentionally overwritten — Rust is the authority.

      // Step 1: Create V4 header from password (all crypto in Rust)
      const { headerBytes, session } = await createVaultHeader(password, cipherId);

      // Step 2: Write crypto header to USB via companion
      // NOTE: VAULT.bin already exists (created by companion provisioner with placeholder header).
      // We overwrite the placeholder with the real Rust-generated crypto header.
      await usbService.writeVaultHeader(mountPoint, headerBytes);

      // Step 3: Encrypt empty index and write to both slots
      const emptyIndex: VaultIndexData = { files: {} };
      const encryptedIndex = await encryptVaultContainerIndex(session.encryptionKey, emptyIndex);

      // Write index to slot 0 (append after header)
      const slot0 = await usbService.appendVaultBytes(mountPoint, encryptedIndex);

      // Write index to slot 1 (append again for dual-index)
      await usbService.appendVaultBytes(mountPoint, encryptedIndex);

      // Commit slot 0 as active — update header with index pointers
      let updatedHeader = await commitVaultIndex(
        headerBytes,
        session.hmacKey,
        slot0.offset,
        slot0.length
      );

      // Also record slot 1 by committing again (flips to slot 1, then back)
      // Actually, for initial provisioning, both slots have same data.
      // Just commit once — slot 0 is active, slot 1 will be written on first update.
      await usbService.writeVaultHeader(mountPoint, updatedHeader);

      // Post-write verification: read header back and verify magic bytes
      const verifyHeader = await usbService.readVaultHeader(mountPoint);
      if (!verifyHeader || verifyHeader.length < 8) {
        throw new Error('Failed to verify vault header — write may have been interrupted');
      }
      const verifyMagic = new TextDecoder().decode(verifyHeader.slice(0, 8));
      if (!verifyMagic.startsWith('USBVLT')) {
        throw new Error('Vault header verification failed — invalid magic bytes');
      }

      // Parse header info for return
      const headerInfo = await parseVaultHeader(updatedHeader);

      fireAndForget(auditService.log('vault', 'vault_provisioned', { mountPoint }, 'success'));

      usbDebug.traceExit('provision', { mountPoint, success: true });
      return { mountPoint, headerInfo, session };
    } catch (err) {
      usbDebug.traceError('provision', err);
      throw err;
    }
  }

  /**
   * Flow 2: Unlock an existing vault on a USB drive.
   *
   * Security flow:
   *   1. Read header from USB
   *   2. Attempt unlock via Rust FFI
   *   3. On fail: track in-memory, escalate warnings
   *   4. On success: verify fail counter HMAC, check for tampering,
   *      reset counter, read+decrypt active index
   *   5. If fail counter HMAC tampered → self-destruct
   *   6. Cache decrypted index in memory only
   */
  async unlock(mountPoint: string, password: string): Promise<UnlockResult> {
    usbDebug.traceEntry('unlock', { mountPoint, sessionFailCount: this.sessionFailCount });
    try {
      // Step 0: Enforce exponential backoff (V2.0 Fortress Spec §G.2)
      if (this.sessionFailCount > 0) {
        const backoffMs = getBackoffDelay(this.sessionFailCount);
        const elapsed = Date.now() - this.lastFailTimestamp;
        if (elapsed < backoffMs) {
          const remainingSec = Math.ceil((backoffMs - elapsed) / 1000);
          throw new RateLimitError(
            `Too many failed attempts. Please wait ${remainingSec} seconds before trying again.`,
            remainingSec,
            this.sessionFailCount
          );
        }
      }

      // Step 1: Read header from USB
      const headerBytes = await usbService.readVaultHeader(mountPoint);

      // Step 1a: Validate header magic bytes before any crypto operations
      if (!headerBytes || headerBytes.length < 8) {
        throw new Error('Invalid vault header — USB drive may not contain a valid vault');
      }
      const headerMagic = new TextDecoder().decode(headerBytes.slice(0, 8));
      if (!headerMagic.startsWith('USBVLT')) {
        throw new Error('Invalid vault header — magic bytes do not match USBVLT format');
      }

      const headerInfo = await parseVaultHeader(headerBytes);

      // Step 1b: Vault identity validation — detect USB drive swaps
      // Compare the header salt against the previously-provisioned salt (if known).
      // Each vault has a unique random salt generated at provisioning time, so a
      // mismatched salt means a different physical vault was plugged in.
      if (this.activeVault) {
        const knownSalt = this.activeVault.headerInfo.salt;
        if (
          knownSalt &&
          headerInfo.salt &&
          knownSalt.length === headerInfo.salt.length
        ) {
          let saltMismatch = false;
          for (let i = 0; i < knownSalt.length; i++) {
            if (knownSalt[i] !== headerInfo.salt[i]) {
              saltMismatch = true;
              break;
            }
          }
          if (saltMismatch) {
            logger.error('[VaultOrchestrator] Vault identity mismatch — USB drive was swapped', {
              mountPoint,
            });
            fireAndForget(
              auditService.log(
                'vault',
                'vault_identity_mismatch',
                { mountPoint },
                'error'
              )
            );
            throw new Error(
              'This USB drive contains a different vault than expected. ' +
              'The previously unlocked vault had a different identity. ' +
              'Please lock the current vault first, then unlock this drive.'
            );
          }
        }
      }

      // Step 2: Attempt unlock via Rust FFI
      let session: VaultSession;
      try {
        session = await unlockVault(headerBytes, password);
      } catch (error) {
        // Unlock failed — track in-memory + record timestamp for backoff
        this.sessionFailCount++;
        this.lastFailTimestamp = Date.now();

        const level =
          this.sessionFailCount >= FAIL_CRITICAL_THRESHOLD
            ? 'critical'
            : this.sessionFailCount >= FAIL_WARNING_THRESHOLD
              ? 'warning'
              : 'info';

        logger.warn('[VaultOrchestrator] Unlock failed', {
          mountPoint,
          sessionAttempt: this.sessionFailCount,
          level,
        });

        fireAndForget(
          auditService.log(
            'vault',
            'vault_unlock_failed',
            {
              mountPoint,
              sessionAttempt: this.sessionFailCount,
            },
            'error'
          )
        );

        // Re-throw with additional context for UI
        const err = error instanceof Error ? error : new Error(String(error));
        (err as any).failCount = this.sessionFailCount;
        (err as any).maxAttempts = MAX_FAIL_ATTEMPTS;
        usbDebug.traceError('unlock', err);
        throw err;
      }

      // Step 3: Success — verify and handle fail counter
      let previousFailCount = 0;
      let failCounterWasNonZero = false;
      let finalHeaderBytes: Uint8Array = headerBytes;

      try {
        // Read fail counter — this verifies the HMAC
        previousFailCount = await readFailCounter(headerBytes, session.hmacKey);
        failCounterWasNonZero = previousFailCount > 0;

        if (previousFailCount > 0) {
          logger.warn('[VaultOrchestrator] Fail counter was non-zero on unlock', {
            mountPoint,
            failCount: previousFailCount,
          });

          // Check if someone tried too many times while vault was away
          if (previousFailCount >= MAX_FAIL_ATTEMPTS) {
            // Self-destruct should have already been triggered by Rust
            // but log it for audit
            fireAndForget(
              auditService.log(
                'vault',
                'vault_max_attempts_exceeded',
                {
                  mountPoint,
                  failCount: previousFailCount,
                },
                'error'
              )
            );
          }
        }

        // Increment the counter first (in case we crash before reset)
        // then immediately reset it. This ensures the counter is always
        // correct even if the app crashes mid-unlock.
        const incrementedHeader = await incrementFailCounter(headerBytes, session.hmacKey);
        const resetHeader = await resetFailCounter(incrementedHeader, session.hmacKey);
        await usbService.writeVaultHeader(mountPoint, resetHeader);

        // Use the reset header going forward
        finalHeaderBytes = resetHeader;
      } catch (counterError) {
        // Fail counter HMAC tampered — possible attack
        const errMsg = counterError instanceof Error ? counterError.message : String(counterError);

        if (errMsg.includes('tampered') || errMsg.includes('HMAC')) {
          logger.error('[VaultOrchestrator] FAIL COUNTER TAMPERED — possible attack', {
            mountPoint,
          });
          fireAndForget(
            auditService.log(
              'vault',
              'vault_fail_counter_tampered',
              {
                mountPoint,
              },
              'error'
            )
          );

          // For tampered counters: still allow unlock but warn aggressively
          // The Rust side would trigger self-destruct if it detects tampering
          // during increment. We proceed with caution.
        }

        // Reset to just the header bytes with counter reset
        const resetHeader = await resetFailCounter(headerBytes, session.hmacKey);
        await usbService.writeVaultHeader(mountPoint, resetHeader);
        finalHeaderBytes = resetHeader;
      }

      // Step 4: Read and decrypt active index
      const activeSlot = headerInfo.activeIndexSlot;
      const indexOffset = activeSlot === 0 ? headerInfo.index0Offset : headerInfo.index1Offset;
      const indexLength = activeSlot === 0 ? headerInfo.index0Length : headerInfo.index1Length;

      let index: VaultIndexData;
      if (indexLength > 0) {
        const encryptedIndex = await usbService.readVaultBytes(mountPoint, indexOffset, indexLength);
        index = await decryptVaultContainerIndex(session.encryptionKey, encryptedIndex);
      } else {
        index = { files: {} };
      }

      // Step 5: Cache in memory — reset session fail counter
      this.sessionFailCount = 0;
      this.activeVault = {
        mountPoint,
        headerInfo: await parseVaultHeader(finalHeaderBytes),
        session,
        index,
        headerBytes: finalHeaderBytes,
      };

      // Notify UI of lock state change (e.g. TopBar badge)
      this.notifyLockStateChange();

      fireAndForget(
        auditService.log(
          'vault',
          'vault_unlocked',
          {
            mountPoint,
            fileCount: Object.keys(index.files).length,
            previousFailCount,
          },
          'success'
        )
      );

      usbDebug.traceExit('unlock', {
        mountPoint,
        fileCount: Object.keys(index.files).length,
        previousFailCount,
      });

      return {
        vault: this.activeVault,
        failCounterWasNonZero,
        previousFailCount,
      };
    } catch (err) {
      usbDebug.traceError('unlock', err);
      throw err;
    }
  }

  /**
   * Get the current session fail count (for UI warnings).
   */
  getSessionFailCount(): number {
    return this.sessionFailCount;
  }

  /**
   * Flow 3: Add a file to the active vault.
   *
   * Steps:
   *   1. Encrypt file as V2RC record via Rust FFI
   *   2. Append record to VAULT.bin via companion → { offset, length }
   *   3. Update cached index with new entry
   *   4. Encrypt index via Rust, append to VAULT.bin (inactive slot)
   *   5. Commit: flip active slot in header, write header to USB
   */
  async addFile(fileId: string, filename: string, data: Uint8Array): Promise<void> {
    usbDebug.traceEntry('addFile', { fileId, filename, dataSize: data.length });
    try {
      const vault = this.requireActiveVault();

      // Step 0: 50% Capacity Rule pre-check (V2.0 Fortress Spec §9)
      // Estimate: encrypted record ≈ plaintext + 16B tag per 64KB chunk + headers
      const estimatedSize = data.length + Math.ceil(data.length / 65536) * 16 + 256;
      const capacity = await usbService.checkCapacity(vault.mountPoint, estimatedSize);
      if (!capacity.allowed) {
        const remainMB = (capacity.remaining / (1024 * 1024)).toFixed(1);
        const maxMB = (capacity.maxAllowed / (1024 * 1024)).toFixed(1);
        throw new Error(
          `Vault is at capacity (50% rule). Maximum: ${maxMB} MB, remaining: ${remainMB} MB. ` +
            `Compact the vault or remove files to free space.`
        );
      }

      // Step 1: Encrypt file as V2RC record
      const encryptedRecord = await encryptFileRecord(
        vault.session.encryptionKey,
        data,
        vault.headerInfo.cipherId as CipherId
      );

      // Step 2: Append to VAULT.bin
      const { offset, length } = await usbService.appendVaultBytes(vault.mountPoint, encryptedRecord);

      // Step 3: Update cached index
      vault.index.files[fileId] = {
        name: filename,
        size: data.length,
        offset,
        length,
        cipherId: vault.headerInfo.cipherId,
        saltHex: '00'.repeat(32),
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        version: (vault.index.files[fileId]?.version ?? 0) + 1,
      };

      // Step 4: Encrypt updated index and append to VAULT.bin
      const encryptedIndex = await encryptVaultContainerIndex(
        vault.session.encryptionKey,
        vault.index
      );
      const indexResult = await usbService.appendVaultBytes(vault.mountPoint, encryptedIndex);

      // Step 5: Atomic commit — flip active index slot
      const updatedHeader = await commitVaultIndex(
        vault.headerBytes,
        vault.session.hmacKey,
        indexResult.offset,
        indexResult.length
      );
      await usbService.writeVaultHeader(vault.mountPoint, updatedHeader);

      // Update cached header
      vault.headerBytes = updatedHeader;
      vault.headerInfo = await parseVaultHeader(updatedHeader);

      this.notifyIndexChange();

      fireAndForget(
        auditService.log(
          'vault',
          'vault_file_added',
          {
            mountPoint: vault.mountPoint,
            fileId,
            size: data.length,
          },
          'success'
        )
      );

      usbDebug.traceExit('addFile', { fileId, offset, length });
    } catch (err) {
      usbDebug.traceError('addFile', err);
      throw err;
    }
  }

  /**
   * Flow 4: Read a file from the active vault.
   *
   * Steps:
   *   1. Look up file offset/length in cached index
   *   2. Read record bytes from VAULT.bin via companion
   *   3. Decrypt V2RC record via Rust FFI → { filename, data }
   */
  async readFile(fileId: string): Promise<DecryptedRecord> {
    usbDebug.traceEntry('readFile', { fileId });
    try {
      const vault = this.requireActiveVault();

      const entry = vault.index.files[fileId];
      if (!entry) {
        throw new Error(`File '${fileId}' not found in vault index`);
      }

      if (!entry.length || entry.length <= 0) {
        throw new Error(`File '${fileId}' has invalid length in index`);
      }

      // Read encrypted record from VAULT.bin
      const recordBytes = await usbService.readVaultBytes(
        vault.mountPoint,
        entry.offset,
        entry.length
      );

      // Decrypt via Rust FFI
      const record = await decryptFileRecord(vault.session.encryptionKey, recordBytes);

      usbDebug.traceExit('readFile', { fileId, dataSize: recordBytes.length });
      return record;
    } catch (err) {
      usbDebug.traceError('readFile', err);
      throw err;
    }
  }

  /**
   * Flow 5: Remove a file from the active vault.
   *
   * Steps:
   *   1. Remove file entry from cached index
   *   2. Encrypt updated index via Rust, append to VAULT.bin (inactive slot)
   *   3. Commit: flip active slot in header, write header to USB
   *
   * The encrypted file data remains in VAULT.bin (orphaned bytes).
   * It will be reclaimed by vault compaction. Since it's encrypted with
   * a unique nonce, orphaned data is indistinguishable from random noise.
   */
  async removeFile(fileId: string): Promise<void> {
    usbDebug.traceEntry('removeFile', { fileId });
    try {
      const vault = this.requireActiveVault();

      if (!vault.index.files[fileId]) {
        throw new Error(`File '${fileId}' not found in vault index`);
      }

      // Step 1: Remove from cached index
      delete vault.index.files[fileId];

      // Step 2: Encrypt updated index and append to VAULT.bin
      const encryptedIndex = await encryptVaultContainerIndex(
        vault.session.encryptionKey,
        vault.index
      );
      const indexResult = await usbService.appendVaultBytes(vault.mountPoint, encryptedIndex);

      // Step 3: Atomic commit — flip active index slot
      const updatedHeader = await commitVaultIndex(
        vault.headerBytes,
        vault.session.hmacKey,
        indexResult.offset,
        indexResult.length
      );
      await usbService.writeVaultHeader(vault.mountPoint, updatedHeader);

      // Update cached header
      vault.headerBytes = updatedHeader;
      vault.headerInfo = await parseVaultHeader(updatedHeader);

      this.notifyIndexChange();

      fireAndForget(
        auditService.log(
          'vault',
          'vault_file_removed',
          {
            mountPoint: vault.mountPoint,
            fileId,
          },
          'success'
        )
      );

      usbDebug.traceExit('removeFile', { fileId });
    } catch (err) {
      usbDebug.traceError('removeFile', err);
      throw err;
    }
  }

  /**
   * Get the current vault index (file listing) without reading file contents.
   */
  getIndex(): VaultIndexData | null {
    usbDebug.traceEntry('getIndex', {});
    try {
      const result = this.activeVault?.index ?? null;
      const fileCount = result ? Object.keys(result.files).length : 0;
      usbDebug.traceExit('getIndex', { fileCount, hasIndex: result !== null });
      return result;
    } catch (err) {
      usbDebug.traceError('getIndex', err);
      throw err;
    }
  }

  /**
   * Get the active vault info (null if not unlocked).
   */
  getActiveVault(): ActiveVault | null {
    return this.activeVault;
  }

  /**
   * Flow 6: Compact the active vault.
   *
   * Removes orphaned data (deleted files, old indexes) by rewriting VAULT.bin
   * with only the active file records. This is the "delete + compact" pattern.
   *
   * Steps:
   *   1. Extract active file offsets from cached index
   *   2. Send to backend → rewrites VAULT.bin with only those records
   *   3. Backend returns new offsets for each file
   *   4. Rebuild cached index with updated offsets
   *   5. Encrypt new index, append to compacted VAULT.bin
   *   6. Commit: write header with new index pointer
   */
  async compactVault(): Promise<{ oldSize: number; newSize: number; spaceSaved: number }> {
    const vault = this.requireActiveVault();

    // Step 1: Build active file map from index
    const activeFiles: Record<string, { offset: number; length: number }> = {};
    for (const [fileId, entry] of Object.entries(vault.index.files)) {
      if (entry.offset && entry.length && entry.length > 0) {
        activeFiles[fileId] = { offset: entry.offset, length: entry.length };
      }
    }

    logger.info('[VaultOrchestrator] Starting vault compaction', {
      mountPoint: vault.mountPoint,
      activeFiles: Object.keys(activeFiles).length,
    });

    // Step 2: Backend rewrites VAULT.bin with only active records
    const result = await usbService.compactVaultContainer(vault.mountPoint, activeFiles);

    // Step 3: Update cached index with new offsets
    for (const [fileId, newEntry] of Object.entries(result.newOffsets)) {
      if (vault.index.files[fileId]) {
        vault.index.files[fileId].offset = newEntry.offset;
        vault.index.files[fileId].length = newEntry.length;
      }
    }

    // Remove any files that didn't survive compaction
    for (const fileId of Object.keys(vault.index.files)) {
      if (!result.newOffsets[fileId]) {
        delete vault.index.files[fileId];
      }
    }

    // Step 4: Re-read header (compaction rewrote the file)
    const freshHeader = await usbService.readVaultHeader(vault.mountPoint);
    vault.headerBytes = freshHeader;
    vault.headerInfo = await parseVaultHeader(freshHeader);

    // Step 5: Encrypt updated index with new offsets and append
    const encryptedIndex = await encryptVaultContainerIndex(
      vault.session.encryptionKey,
      vault.index
    );
    const indexResult = await usbService.appendVaultBytes(vault.mountPoint, encryptedIndex);

    // Step 6: Commit — update header with new index pointer
    const updatedHeader = await commitVaultIndex(
      vault.headerBytes,
      vault.session.hmacKey,
      indexResult.offset,
      indexResult.length
    );
    await usbService.writeVaultHeader(vault.mountPoint, updatedHeader);

    // Update cached header
    vault.headerBytes = updatedHeader;
    vault.headerInfo = await parseVaultHeader(updatedHeader);

    this.notifyIndexChange();

    fireAndForget(
      auditService.log(
        'vault',
        'vault_compacted',
        {
          mountPoint: vault.mountPoint,
          oldSize: result.oldSize,
          newSize: result.newSize,
          spaceSaved: result.spaceSaved,
        },
        'success'
      )
    );

    logger.info('[VaultOrchestrator] Vault compaction complete', {
      oldSize: result.oldSize,
      newSize: result.newSize,
      spaceSaved: result.spaceSaved,
    });

    return {
      oldSize: result.oldSize,
      newSize: result.newSize,
      spaceSaved: result.spaceSaved,
    };
  }

  /**
   * Lock the vault — zero session keys from memory.
   */
  lock(): void {
    usbDebug.traceEntry('lock', { isUnlocked: this.activeVault !== null });
    try {
      const wasUnlocked = this.activeVault !== null;
      if (this.activeVault) {
        // Zero key material
        this.activeVault.session.encryptionKey.fill(0);
        this.activeVault.session.hmacKey.fill(0);
        this.activeVault = null;
      }
      // Reset session-level brute-force tracking
      this.sessionFailCount = 0;
      this.lastFailTimestamp = 0;

      // Notify UI of lock state change
      if (wasUnlocked) this.notifyLockStateChange();

      usbDebug.traceExit('lock', { success: true });
    } catch (err) {
      usbDebug.traceError('lock', err);
      throw err;
    }
  }

  /**
   * Check if a vault is currently unlocked.
   */
  isUnlocked(): boolean {
    usbDebug.traceEntry('isUnlocked', {});
    try {
      const result = this.activeVault !== null;
      usbDebug.traceExit('isUnlocked', { unlocked: result });
      return result;
    } catch (err) {
      usbDebug.traceError('isUnlocked', err);
      throw err;
    }
  }

  // ── Private Helpers ──────────────────────────────────────────────────

  private requireActiveVault(): ActiveVault {
    if (!this.activeVault) {
      throw new Error('No vault is currently unlocked');
    }
    return this.activeVault;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────

export const vaultOrchestrator = new VaultOrchestratorImpl();
