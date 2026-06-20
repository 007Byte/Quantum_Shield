/**
 * vaultListStore — canonical vault collection.
 *
 * Owns: vaults (normalized byId + ids), isLoading, error
 * Actions: loadVaults, createVault, deleteVault, renameVault, exportVault
 *
 * Normalized storage: O(1) lookup/update/delete by ID.
 */

import { create } from 'zustand';
import * as api from '@/services/api';
import { storageService } from '@/services/storageService';
import { auditService } from '@/services/auditService';
import { createKeyHierarchy } from '@/services/crypto/keyHierarchy';
import { encryptFileIndex, decryptFileIndex } from '@/services/crypto';
import { generateId } from '@/utils/generateId';
import { usbService, type USBDrive, type USBPartition } from '@/services/usbService';
import { toStoredFileInfo, fromStoredFileInfo, type StoredFileInfo } from '@/types/domain';
import { logger, fireAndForget } from '@/utils/logger';
import { markVaultLoadTime, setPollingCallbacks } from './vaultPolling';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { useActiveVaultStore } from './activeVaultStore';
import { useVaultSessionStore } from './vaultSessionStore';
import { scheduleIndexReEncrypt } from './vaultIndexSync';
import type { VaultInfo, FileInfo } from '@/types/domain';
import i18n from '@/i18n';

// PL-001: Re-export canonical types from shared domain module
export type { FileInfo, VaultInfo } from '@/types/domain';

const isWeb = true;
const generateVaultId = () => generateId('vault');

// ── Offline-aware remote sync helper ─────────────────────────────
async function tryRemoteSync<T>(operation: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const isNetworkError = err instanceof Error && (
      err.message.includes('Network Error') ||
      err.message.includes('ECONNREFUSED') ||
      err.message.includes('timeout')
    );
    if (isOffline || isNetworkError) {
      logger.info(`[vaultListStore] Offline — ${operation} queued for sync`);
      return null;
    }
    throw err; // Re-throw non-network errors
  }
}

// PERFORMANCE FIX (M-5): Cap vaults held in memory to prevent degraded
// performance for users with hundreds of vaults. Server-side pagination
// should be implemented for full-scale support.
const MAX_VAULTS_IN_MEMORY = 500;

// ── One-time migration: tag local vaults, purge stale USB entries ────
// Vaults created by the app have IDs like "1710000000000-abc123xyz".
// USB-discovered vaults have UUIDs or filesystem paths as IDs.
const LOCAL_VAULT_ID_RE = /^\d{13,}-[a-z0-9]+$/;
const MIGRATION_KEY = 'usbvault:vault_source_migration_v1';

async function migrateVaultSources(): Promise<void> {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(MIGRATION_KEY)) return; // already migrated

  try {
    const vaults = await storageService.loadVaults();
    if (vaults.length === 0) {
      localStorage.setItem(MIGRATION_KEY, 'done');
      return;
    }
    // Keep only vaults that were created locally (match timestamp-random ID pattern)
    // or already have source: 'local'. Everything else is a stale USB entry.
    const localVaults = vaults.filter(v => v.source === 'local' || LOCAL_VAULT_ID_RE.test(v.id));
    // Re-save with source tag
    await storageService.saveVaults(
      localVaults.map(v => ({
        ...v,
        source: 'local' as const,
      }))
    );
    localStorage.setItem(MIGRATION_KEY, 'done');
    logger.info(
      `[vaultListStore] Migration: kept ${localVaults.length} local vault(s), purged ${vaults.length - localVaults.length} stale USB entry/entries`
    );
  } catch (e) {
    logger.warn('[vaultListStore] Vault source migration failed, will retry next load', e);
  }
}

// ── Normalized vault collection ────────────────────────────────────
export interface NormalizedVaults {
  ids: string[];
  byId: Record<string, VaultInfo>;
}

function normalize(vaults: VaultInfo[]): NormalizedVaults {
  const byId: Record<string, VaultInfo> = {};
  const ids: string[] = [];
  for (const v of vaults) {
    byId[v.id] = v;
    ids.push(v.id);
  }
  return { ids, byId };
}

function denormalize(n: NormalizedVaults): VaultInfo[] {
  return n.ids.map(id => n.byId[id]).filter(Boolean);
}

// ── Store ──────────────────────────────────────────────────────────

export interface VaultListState {
  vaultIds: string[];
  vaultsById: Record<string, VaultInfo>;
  /** Denormalized cache — updated alongside vaultIds/vaultsById for selector compatibility */
  vaults: VaultInfo[];
  /** Files for the currently-loaded vault (ephemeral, per-session) */
  files: FileInfo[];
  isLoading: boolean;
  error: string | null;

  // Derived (convenience)
  getVaults: () => VaultInfo[];
  getVault: (id: string) => VaultInfo | undefined;

  // Actions
  loadVaults: () => Promise<void>;
  createVault: (name: string, metadata: Uint8Array) => Promise<string>;
  createVaultWithKeyHierarchy: (
    name: string,
    metadata: Uint8Array,
    password: string
  ) => Promise<{ vaultId: string; mek: Uint8Array }>;
  deleteVault: (vaultId: string) => Promise<void>;
  renameVault: (vaultId: string, newName: string) => Promise<void>;
  exportVault: (vaultId: string) => Promise<void>;
  clearError: () => void;

  // File operations (migrated from compat layer)
  loadFiles: (vaultId: string) => Promise<void>;
  addFile: (file: FileInfo) => void;
  deleteFile: (vaultId: string, fileId: string) => Promise<void>;

  // Internal: used to update vault metadata (fileCount, etc.)
  _updateVault: (vaultId: string, patch: Partial<VaultInfo>) => void;
  _insertVault: (vault: VaultInfo) => void;
}

function persistVaults(state: { vaultIds: string[]; vaultsById: Record<string, VaultInfo> }): void {
  // Only persist non-USB vaults (no mountPoint). USB vaults are discovered live
  // from connected drives and should not be saved to localStorage.
  const vaults = state.vaultIds
    .map(id => state.vaultsById[id])
    .filter(Boolean)
    .filter(v => !(v as VaultInfo & { mountPoint?: string }).mountPoint);
  fireAndForget(
    storageService.saveVaults(
      vaults.map(v => ({
        id: v.id,
        name: v.name,
        encryptedMetadata: v.encryptedMetadata,
        fileCount: v.fileCount,
        lastModified: v.lastModified,
        securityLevel: v.securityLevel,
        wrappedMekB64: v.wrappedMekB64,
        kekSaltHex: v.kekSaltHex,
        hasRecoveryCodes: v.hasRecoveryCodes,
        // Tag locally-created vaults so we can distinguish them from stale USB entries
        // that may have been persisted before the mountPoint filter was added.
        source: 'local' as const,
      }))
    )
  );
}

export const useVaultListStore = create<VaultListState>((set, get) => ({
  vaultIds: [],
  vaultsById: {},
  vaults: [],
  files: [],
  isLoading: false,
  error: null,

  getVaults: () => denormalize({ ids: get().vaultIds, byId: get().vaultsById }),
  getVault: (id: string) => get().vaultsById[id],

  loadVaults: async () => {
    markVaultLoadTime();
    if (isWeb) {
      set({ isLoading: true, error: null });
      // Run one-time migration to tag local vaults and purge stale USB entries
      await migrateVaultSources();
      try {
        let drives: USBDrive[] = [];
        try {
          drives = await usbService.listDrives();
        } catch {
          logger.warn('[vaultListStore] USB companion unreachable, skipping drive detection');
        }

        const realVaults: VaultInfo[] = [];

        try {
          const discoveredDrives = await usbService.discoverVaults();
          logger.info(`[vaultListStore] discoverVaults found ${discoveredDrives.length} vault drive(s)`);

          for (const d of discoveredDrives) {
            // Each discovered drive may have vault partitions
            const vaultPartitions = d.partitions?.filter(p => p.hasVault) ?? [];
            for (const p of vaultPartitions) {
              const mountPoint = p.mountPoint ?? p.mountpoint ?? '';
              realVaults.push({
                id: d.driveId,
                name: p.label || d.driveName,
                encryptedMetadata: '',
                fileCount: 0,
                lastModified: new Date().toISOString(),
                securityLevel: 'maximum' as const,
                mountPoint,
                driveName: d.driveName,
                fileSystem: p.fileSystem || p.fstype || '',
                algorithm: '',
              });
            }
            // If no vault partitions but drive-level hasVault flag
            if (vaultPartitions.length === 0) {
              realVaults.push({
                id: d.driveId,
                name: d.driveName,
                encryptedMetadata: '',
                fileCount: 0,
                lastModified: new Date().toISOString(),
                securityLevel: 'maximum' as const,
                mountPoint: '',
                driveName: d.driveName,
                fileSystem: '',
                algorithm: '',
              });
            }
          }
        } catch {
          logger.warn('[vaultListStore] discoverVaults failed');
        }

        const vaultDrives = drives.filter(d => d.hasVault);
        for (const drive of vaultDrives) {
          const mountPoint =
            drive.partitions?.find((p: USBPartition) => p.mountpoint)?.mountpoint ?? '';
          const driveMountPoints = (drive.partitions ?? [])
            .map((p: USBPartition) => p.mountpoint)
            .filter(Boolean) as string[];
          const alreadyFound = realVaults.some(
            rv =>
              driveMountPoints.includes(rv.mountPoint!) ||
              rv.driveName === drive.name ||
              rv.name === drive.name ||
              (rv.driveName &&
                drive.name &&
                (rv.driveName.includes(drive.name) || drive.name.includes(rv.driveName))) ||
              (drive.id &&
                realVaults.some(
                  rv =>
                    rv.driveName === drive.name ||
                    driveMountPoints.some(
                      (mp: string) =>
                        mp &&
                        rv.mountPoint &&
                        mp.split('/').slice(0, -1).join('/') ===
                          rv.mountPoint!.split('/').slice(0, -1).join('/')
                    )
                ))
          );
          if (!alreadyFound && mountPoint) {
            realVaults.push({
              id: `usb-${drive.id}`,
              name: `Vault on ${drive.name}`,
              encryptedMetadata: '',
              fileCount: 0,
              lastModified: new Date().toISOString(),
              securityLevel: 'maximum' as const,
              mountPoint,
              driveName: drive.name,
              fileSystem: drive.partitions?.find((p: USBPartition) => p.mountpoint)?.fstype ?? '',
            });
          }
        }

        const localVaults = await storageService.loadVaults();
        // Only include locally-created vaults (tagged with source: 'local').
        // USB vaults should only appear when their drive is physically connected and
        // discovered via usbService. Stale USB entries from prior sessions won't have
        // the 'source' tag, so they are automatically excluded.
        const localOnly = localVaults.filter(
          lv => !realVaults.some(rv => rv.id === lv.id) && lv.source === 'local'
        );

        const allVaults = [...realVaults, ...localOnly];
        const { ids, byId } = normalize(allVaults);
        set({
          vaultIds: ids,
          vaultsById: byId,
          vaults: ids.map(id => byId[id]).filter(Boolean),
          isLoading: false,
          error: null,
        });
        logger.info(
          `[vaultListStore] Loaded ${realVaults.length} USB vault(s), ${localOnly.length} local vault(s)`
        );

        // FIX: After vault discovery, sync files from orchestrator (if already
        // unlocked in this session) or restore cached metadata (after reload).
        // Without this, the dashboard VaultTable shows empty after loadVaults.
        const filesToRestore: FileInfo[] = [];

        if (vaultOrchestrator.isUnlocked()) {
          // Orchestrator is live — sync its decrypted index to Zustand.
          // FIX: Use entry.name (the user-defined filename from the vault index)
          // instead of fileId (random ID like "file-1774364933890-xi0xgj").
          // Also preserve existing store files that already have correct metadata.
          const index = vaultOrchestrator.getIndex();
          const activeV = vaultOrchestrator.getActiveVault();
          if (index && activeV) {
            const vaultId = realVaults.find(
              rv => rv.mountPoint === activeV.mountPoint
            )?.id;
            if (vaultId) {
              const currentFiles = get().files;
              for (const [fileId, entry] of Object.entries(index.files)) {
                // Prefer existing store entry if it has a real name (not the fileId)
                const existing = currentFiles.find(f => f.id === fileId);
                const indexName = (entry as any).name || '';
                const resolvedName = existing?.name && existing.name !== fileId
                  ? existing.name
                  : indexName || fileId;
                const resolvedType = resolvedName.includes('.')
                  ? resolvedName.split('.').pop() || 'unknown'
                  : existing?.type || 'unknown';
                filesToRestore.push({
                  id: fileId,
                  vaultId,
                  name: resolvedName,
                  size: existing?.size || (entry as any).length || 0,
                  type: resolvedType,
                  modifiedAt: existing?.modifiedAt || new Date().toISOString(),
                  encryptedMetadata: existing?.encryptedMetadata || '',
                  isPQCProtected: existing?.isPQCProtected || false,
                  originalSize: existing?.originalSize,
                });
              }
              logger.info(
                `[vaultListStore] Synced ${filesToRestore.length} files from unlocked orchestrator`
              );
            }
          }
        } else {
          // Orchestrator is locked — try restoring cached file metadata
          // so the dashboard shows file counts even before unlock.
          try {
            const cacheRaw = localStorage.getItem('usbvault:usb_file_cache');
            if (cacheRaw) {
              const cache = JSON.parse(cacheRaw) as Array<{
                vaultId: string;
                files: FileInfo[];
              }>;
              for (const rv of realVaults) {
                const cached = cache.find(c => c.vaultId === rv.id);
                if (cached && cached.files.length > 0) {
                  filesToRestore.push(...cached.files);
                  logger.info(
                    `[vaultListStore] Restored ${cached.files.length} cached files for vault ${rv.id}`
                  );
                }
              }
            }
          } catch {
            // Non-fatal — cache may be corrupt
          }
        }

        if (filesToRestore.length > 0) {
          set({ files: filesToRestore });
        }
      } catch {
        try {
          const stored = await storageService.loadVaults();
          // Fallback: only include locally-created vaults (tagged with source: 'local').
          // Stale USB entries from prior sessions won't have the tag.
          const nonUsb = stored.filter(v => v.source === 'local');
          const { ids, byId } = normalize(nonUsb);
          set({
            vaultIds: ids,
            vaultsById: byId,
            vaults: ids.map(id => byId[id]).filter(Boolean),
            isLoading: false,
            error: null,
          });
        } catch {
          set({ vaultIds: [], vaultsById: {}, vaults: [], isLoading: false, error: null });
        }
      }
      return;
    }
    // Native path: local-first with background sync
    set({ isLoading: true, error: null });
    try {
      // 1. Load from local cache first
      const localVaults = await storageService.loadVaults();
      const localOnly = localVaults.filter(v => v.source === 'local');
      if (localOnly.length > 0) {
        const { ids, byId } = normalize(localOnly);
        set({
          vaultIds: ids,
          vaultsById: byId,
          vaults: ids.map(id => byId[id]).filter(Boolean),
          isLoading: false,
          error: null,
        });
        logger.info(`[vaultListStore] Loaded ${localOnly.length} vault(s) from local cache`);
      }

      // 2. Background sync from remote API (fire-and-forget)
      fireAndForget((async () => {
        const remoteVaults = await tryRemoteSync('loadVaults', () => api.listVaults());
        if (remoteVaults === null) return; // offline, keep local cache

        let vaults = remoteVaults;
        if (vaults.length > MAX_VAULTS_IN_MEMORY) {
          logger.warn(`[vaultListStore] Truncating ${vaults.length} vaults to ${MAX_VAULTS_IN_MEMORY}`);
          vaults = vaults.slice(0, MAX_VAULTS_IN_MEMORY);
        }
        const { ids, byId } = normalize(vaults);
        set({
          vaultIds: ids,
          vaultsById: byId,
          vaults: ids.map(id => byId[id]).filter(Boolean),
          isLoading: false,
        });
        // Update local cache with remote data
        persistVaults({ vaultIds: ids, vaultsById: byId });
        logger.info(`[vaultListStore] Synced ${vaults.length} vault(s) from remote`);
      })(), { context: 'vaultList.loadVaults.remoteSync', severity: 'warn' });

      // If no local vaults were found, keep loading state until remote resolves
      if (localOnly.length === 0) {
        const remoteVaults = await tryRemoteSync('loadVaults', () => api.listVaults());
        if (remoteVaults !== null) {
          let vaults = remoteVaults;
          if (vaults.length > MAX_VAULTS_IN_MEMORY) {
            vaults = vaults.slice(0, MAX_VAULTS_IN_MEMORY);
          }
          const { ids, byId } = normalize(vaults);
          set({
            vaultIds: ids,
            vaultsById: byId,
            vaults: ids.map(id => byId[id]).filter(Boolean),
            isLoading: false,
          });
          persistVaults({ vaultIds: ids, vaultsById: byId });
        } else {
          set({ vaultIds: [], vaultsById: {}, vaults: [], isLoading: false, error: null });
        }
      }
    } catch (error) {
      // If everything fails, show empty state without throwing
      set({ vaultIds: [], vaultsById: {}, vaults: [], isLoading: false, error: null });
      logger.warn('[vaultListStore] loadVaults failed completely', error);
    }
  },

  createVault: async (name: string, metadata: Uint8Array) => {
    if (isWeb) {
      set({ isLoading: true, error: null });
      try {
        const newVaultId = generateVaultId();
        const newVault: VaultInfo = {
          id: newVaultId,
          name,
          encryptedMetadata: '',
          fileCount: 0,
          lastModified: new Date().toISOString(),
          securityLevel: 'standard',
        };
        set(state => {
          const vaultsById = { ...state.vaultsById, [newVaultId]: newVault };
          const vaultIds = [...state.vaultIds, newVaultId];
          const next = {
            vaultIds,
            vaultsById,
            vaults: vaultIds.map(id => vaultsById[id]).filter(Boolean),
            isLoading: false,
          };
          persistVaults(next);
          return next;
        });
        fireAndForget(auditService.log('vault_create', name, { vaultId: newVaultId }), {
          context: 'vaultList.createVault',
          severity: 'error',
        });
        return newVaultId;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : i18n.t('vaultErrors.failedToCreateVault');
        set({ error: message, isLoading: false });
        throw error;
      }
    }
    // Native path: local-first create with background sync
    set({ isLoading: true, error: null });
    try {
      const newVaultId = generateVaultId();
      const metadataBase64 = Buffer.from(metadata).toString('base64');
      const newVault: VaultInfo = {
        id: newVaultId,
        name,
        encryptedMetadata: metadataBase64,
        fileCount: 0,
        lastModified: new Date().toISOString(),
        securityLevel: 'standard',
        source: 'local' as const,
      };
      set(state => {
        const vaultsById = { ...state.vaultsById, [newVaultId]: newVault };
        const vaultIds = [...state.vaultIds, newVaultId];
        const next = {
          vaultIds,
          vaultsById,
          vaults: vaultIds.map(id => vaultsById[id]).filter(Boolean),
          isLoading: false,
        };
        persistVaults(next);
        return next;
      });
      fireAndForget(auditService.log('vault_create', name, { vaultId: newVaultId }), {
        context: 'vaultList.createVault',
        severity: 'error',
      });
      // Background sync to remote
      fireAndForget((async () => {
        const remoteId = await tryRemoteSync('createVault', () =>
          api.createVault({ name, encryptedMetadata: metadataBase64 })
        );
        if (remoteId !== null) {
          logger.info(`[vaultListStore] Synced vault ${newVaultId} to remote (remoteId: ${remoteId})`);
        }
      })(), { context: 'vaultList.createVault.remoteSync', severity: 'warn' });
      return newVaultId;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : i18n.t('vaultErrors.failedToCreateVault');
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  createVaultWithKeyHierarchy: async (name: string, metadata: Uint8Array, password: string) => {
    if (isWeb) {
      set({ isLoading: true, error: null });
      try {
        const { mek, wrappedMek, kekSalt } = await createKeyHierarchy(password);
        const newVaultId = generateVaultId();
        const newVault: VaultInfo = {
          id: newVaultId,
          name,
          encryptedMetadata: '',
          fileCount: 0,
          lastModified: new Date().toISOString(),
          securityLevel: 'maximum',
          wrappedMekB64: Buffer.from(wrappedMek).toString('base64'),
          kekSaltHex: Buffer.from(kekSalt).toString('hex'),
          hasRecoveryCodes: false,
        };
        set(state => {
          const vaultsById = { ...state.vaultsById, [newVaultId]: newVault };
          const vaultIds = [...state.vaultIds, newVaultId];
          const next = {
            vaultIds,
            vaultsById,
            vaults: vaultIds.map(id => vaultsById[id]).filter(Boolean),
            isLoading: false,
          };
          persistVaults(next);
          return next;
        });
        fireAndForget(
          auditService.log('vault_create', name, {
            vaultId: newVaultId,
            keyHierarchy: 'v2-kek-mek',
          }),
          { context: 'vaultList.createVaultV2', severity: 'error' }
        );
        logger.info(`[vaultListStore] Created vault ${newVaultId} with SG-004 key hierarchy`);
        return { vaultId: newVaultId, mek };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : i18n.t('vaultErrors.failedToCreateVault');
        set({ error: message, isLoading: false });
        throw error;
      }
    }
    // Native path: local-first create with key hierarchy + background sync
    set({ isLoading: true, error: null });
    try {
      const hierarchy = await createKeyHierarchy(password);
      const metadataBase64 = Buffer.from(metadata).toString('base64');
      const wrappedMekB64 = Buffer.from(hierarchy.wrappedMek).toString('base64');
      const kekSaltHex = Buffer.from(hierarchy.kekSalt).toString('hex');
      const newVaultId = generateVaultId();
      const newVault: VaultInfo = {
        id: newVaultId,
        name,
        encryptedMetadata: metadataBase64,
        fileCount: 0,
        lastModified: new Date().toISOString(),
        securityLevel: 'maximum',
        wrappedMekB64,
        kekSaltHex,
        hasRecoveryCodes: false,
        source: 'local' as const,
      };
      set(state => {
        const vaultsById = { ...state.vaultsById, [newVaultId]: newVault };
        const vaultIds = [...state.vaultIds, newVaultId];
        const next = {
          vaultIds,
          vaultsById,
          vaults: vaultIds.map(id => vaultsById[id]).filter(Boolean),
          isLoading: false,
        };
        persistVaults(next);
        return next;
      });
      fireAndForget(
        auditService.log('vault_create', name, {
          vaultId: newVaultId,
          keyHierarchy: 'v2-kek-mek',
        }),
        { context: 'vaultList.createVaultV2', severity: 'error' }
      );
      logger.info(`[vaultListStore] Created vault ${newVaultId} with SG-004 key hierarchy`);
      // Background sync to remote
      fireAndForget((async () => {
        const remoteId = await tryRemoteSync('createVaultWithKeyHierarchy', () =>
          api.createVault({ name, encryptedMetadata: metadataBase64, wrappedMek: wrappedMekB64, kekSaltHex })
        );
        if (remoteId !== null) {
          logger.info(`[vaultListStore] Synced vault ${newVaultId} to remote (remoteId: ${remoteId})`);
        }
      })(), { context: 'vaultList.createVaultV2.remoteSync', severity: 'warn' });
      return { vaultId: newVaultId, mek: hierarchy.mek };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : i18n.t('vaultErrors.failedToCreateVault');
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  deleteVault: async (vaultId: string) => {
    if (isWeb) {
      set({ isLoading: true, error: null });
      try {
        set(state => {
          const { [vaultId]: _removed, ...restById } = state.vaultsById;
          const vaultIds = state.vaultIds.filter(id => id !== vaultId);
          fireAndForget(storageService.deleteVault(vaultId), {
            context: 'vaultList.deleteVault.storage',
            severity: 'error',
          });
          fireAndForget(auditService.log('vault_delete', vaultId), {
            context: 'vaultList.deleteVault.audit',
            severity: 'error',
          });
          const next = {
            vaultIds,
            vaultsById: restById,
            vaults: vaultIds.map(id => restById[id]).filter(Boolean),
            isLoading: false,
          };
          persistVaults(next);
          return next;
        });
        // Clear active vault if it was the deleted one
        const active = useActiveVaultStore.getState();
        if (active.activeVaultId === vaultId) {
          active.selectVault(null);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : i18n.t('vaultErrors.failedToDeleteVault');
        set({ error: message, isLoading: false });
        throw error;
      }
      return;
    }
    // Native path: local-first delete with background sync
    set({ isLoading: true, error: null });
    try {
      // 1. Delete from local storage first
      set(state => {
        const { [vaultId]: _removed, ...restById } = state.vaultsById;
        const vaultIds = state.vaultIds.filter(id => id !== vaultId);
        const next = {
          vaultIds,
          vaultsById: restById,
          vaults: vaultIds.map(id => restById[id]).filter(Boolean),
          isLoading: false,
        };
        persistVaults(next);
        return next;
      });
      fireAndForget(storageService.deleteVault(vaultId), {
        context: 'vaultList.deleteVault.storage',
        severity: 'error',
      });
      fireAndForget(auditService.log('vault_delete', vaultId), {
        context: 'vaultList.deleteVault.audit',
        severity: 'error',
      });
      const active = useActiveVaultStore.getState();
      if (active.activeVaultId === vaultId) active.selectVault(null);
      // 2. Background sync to remote
      fireAndForget((async () => {
        const result = await tryRemoteSync('deleteVault', () => api.deleteVault(vaultId));
        if (result !== null) {
          logger.info(`[vaultListStore] Synced vault deletion ${vaultId} to remote`);
        }
      })(), { context: 'vaultList.deleteVault.remoteSync', severity: 'warn' });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : i18n.t('vaultErrors.failedToDeleteVault');
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  renameVault: async (vaultId: string, newName: string) => {
    if (isWeb) {
      set({ isLoading: true, error: null });
      try {
        set(state => {
          const vault = state.vaultsById[vaultId];
          if (!vault) return { isLoading: false };
          const updated = { ...vault, name: newName, lastModified: new Date().toISOString() };
          const vaultsById = { ...state.vaultsById, [vaultId]: updated };
          const next = { ...state, vaultsById, isLoading: false };
          persistVaults(next);
          return {
            vaultsById,
            vaults: state.vaultIds.map(id => vaultsById[id]).filter(Boolean),
            isLoading: false,
          };
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : i18n.t('vaultErrors.failedToRenameVault');
        set({ error: message, isLoading: false });
        throw error;
      }
      return;
    }
    set({ isLoading: true, error: null });
    try {
      set(state => {
        const vault = state.vaultsById[vaultId];
        if (!vault) return { isLoading: false };
        const updated = { ...vault, name: newName, lastModified: new Date().toISOString() };
        const vaultsById = { ...state.vaultsById, [vaultId]: updated };
        return {
          vaultsById,
          vaults: state.vaultIds.map(id => vaultsById[id]).filter(Boolean),
          isLoading: false,
        };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : i18n.t('vaultErrors.failedToRenameVault');
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  exportVault: async (vaultId: string) => {
    set({ isLoading: true, error: null });
    try {
      const vault = get().vaultsById[vaultId];
      if (!vault) throw new Error('Vault not found');

      // 1. Load all file records for this vault
      const storedFiles = await storageService.loadFiles(vaultId);

      // 2. Build the export manifest — contains vault metadata and
      //    file records (with encrypted blobs base64-encoded).
      const fileEntries = storedFiles.map(sf => ({
        id: sf.id,
        name: sf.name,
        size: sf.size,
        type: sf.type,
        modifiedAt: sf.modifiedAt,
        encryptedMetadata: sf.encryptedMetadata,
        isPQCProtected: sf.isPQCProtected ?? false,
        saltHex: sf.saltHex ?? null,
        cipherId: sf.cipherId ?? null,
        hasBlobStored: sf.hasBlobStored ?? false,
      }));

      const manifest = {
        version: '1.0',
        format: 'usbvault-export',
        exportedAt: new Date().toISOString(),
        vault: {
          id: vault.id,
          name: vault.name,
          encryptedMetadata: vault.encryptedMetadata,
          securityLevel: vault.securityLevel,
          fileCount: vault.fileCount,
          lastModified: vault.lastModified,
          wrappedMekB64: vault.wrappedMekB64 ?? null,
          kekSaltHex: vault.kekSaltHex ?? null,
        },
        files: fileEntries,
        integrity: '', // placeholder, filled after serialization
      };

      // 3. Compute integrity hash (SHA-256 of the manifest without the hash field)
      const payloadForHash = JSON.stringify({ ...manifest, integrity: '' });
      const hashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(payloadForHash)
      );
      manifest.integrity = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // 4. Serialize and create downloadable file
      const exportJson = JSON.stringify(manifest, null, 2);
      const blob = new Blob([exportJson], { type: 'application/json' });

      // 5. Trigger browser download
      const safeName = vault.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      const date = new Date().toISOString().slice(0, 10);
      const filename = `${safeName}_${date}.uvx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      // Cleanup after a short delay to ensure download starts.
      // requestIdleCallback (or setTimeout fallback) ensures cleanup doesn't
      // interfere with the download trigger and avoids orphaned timers.
      const cleanup = () => {
        URL.revokeObjectURL(url);
        if (a.parentNode) a.remove();
      };
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(cleanup, { timeout: 2000 });
      } else {
        setTimeout(cleanup, 1000);
      }

      fireAndForget(
        auditService.log('vault_export', vaultId, {
          fileCount: fileEntries.length,
          filename,
        }),
        { context: 'vaultList.exportVault', severity: 'error' }
      );

      logger.info(
        `[vaultListStore] Exported vault "${vault.name}" (${fileEntries.length} files) as ${filename}`
      );
      set({ isLoading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : i18n.t('vaultErrors.failedToExportVault');
      logger.error('[vaultListStore] Export vault failed:', error);
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  clearError: () => set({ error: null }),

  // ── File operations ─────────────────────────────────────────────

  loadFiles: async (vaultId: string) => {
    if (isWeb) {
      try {
        const { vaultKey } = useVaultSessionStore.getState();
        const vault = get().vaultsById[vaultId];
        const isUsbVault = vault && (vault as VaultInfo & { mountPoint?: string }).mountPoint;

        if (isUsbVault) {
          try {
            const usbFiles = await usbService.listVaultFiles(vaultId);
            const files: FileInfo[] = usbFiles.map(f => ({
              id: f.id,
              vaultId,
              name: f.name,
              size: f.size,
              type: f.name.split('.').pop() || 'unknown',
              modifiedAt: f.createdAt,
              encryptedMetadata: '',
              isPQCProtected: false,
              contentHash: f.contentHash,
            }));
            set({ files, isLoading: false, error: null });
            logger.info(
              `[vaultListStore] Loaded ${files.length} file(s) from USB vault ${vaultId}`
            );
            return;
          } catch (err) {
            logger.warn(
              `[vaultListStore] Failed to load USB files for ${vaultId}, trying local`,
              err
            );
          }
        }

        if (vaultKey) {
          const encryptedBlob = await storageService.loadEncryptedIndex(vaultId);
          if (encryptedBlob !== null) {
            const decrypted = await decryptFileIndex(vaultKey, encryptedBlob);
            if (decrypted !== null) {
              const restored: FileInfo[] = (decrypted as StoredFileInfo[]).map(fromStoredFileInfo);
              set({ files: restored, isLoading: false, error: null });
              return;
            }
            logger.warn('[vaultListStore] Encrypted index decryption failed, trying legacy path');
          }
        }

        const storedFiles = await storageService.loadFiles(vaultId);
        if (storedFiles.length > 0) {
          const restored: FileInfo[] = storedFiles.map(fromStoredFileInfo);
          set({ files: restored, isLoading: false, error: null });
          if (vaultKey) {
            const encrypted = await encryptFileIndex(vaultKey, storedFiles);
            if (encrypted !== null) {
              await storageService.saveEncryptedIndex(vaultId, encrypted);
              logger.info(`[vaultListStore] Migrated vault ${vaultId} index to encrypted storage`);
            }
          }
        } else {
          set({ files: [], isLoading: false, error: null });
        }
      } catch {
        set({ files: [], isLoading: false, error: null });
      }
      return;
    }
    set({ isLoading: true, error: null });
    try {
      set({ files: [], isLoading: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : i18n.t('vaultErrors.failedToLoadFiles');
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  addFile: (file: FileInfo) => {
    if (isWeb) {
      const blob = file.encryptedBlob;
      fireAndForget(storageService.saveFile(toStoredFileInfo(file, !!blob), blob));
    }

    set(state => {
      const updatedFiles = [...state.files, file];
      const vault = state.vaultsById[file.vaultId];
      const newFileCount = (vault?.fileCount ?? 0) + 1;
      const now = new Date().toISOString();

      // Update vault metadata inline
      let vaultsById = state.vaultsById;
      if (vault) {
        vaultsById = {
          ...state.vaultsById,
          [file.vaultId]: { ...vault, fileCount: newFileCount, lastModified: now },
        };
      }
      const vaults = state.vaultIds.map(id => vaultsById[id]).filter(Boolean);

      if (isWeb) {
        persistVaults({ vaultIds: state.vaultIds, vaultsById });
        scheduleIndexReEncrypt(file.vaultId, () => ({
          files: updatedFiles,
          vaultKey: useVaultSessionStore.getState().vaultKey,
        }));
      }

      // FIX: Cache USB vault file metadata so it survives page reloads.
      // Without this, USB vault files disappear from the dashboard after refresh.
      const isUsbVault = vault && (vault as any).mountPoint;
      if (isUsbVault) {
        try {
          const vaultFiles = updatedFiles.filter(f => f.vaultId === file.vaultId);
          const cacheKey = 'usbvault:usb_file_cache';
          const raw = localStorage.getItem(cacheKey);
          const entries: Array<{ vaultId: string; files: FileInfo[]; cachedAt: string }> =
            raw ? JSON.parse(raw) : [];
          const filtered = entries.filter(e => e.vaultId !== file.vaultId);
          filtered.push({
            vaultId: file.vaultId,
            files: vaultFiles.map(f => ({
              ...f,
              encryptedBlob: undefined, // Don't cache binary data
            })),
            cachedAt: now,
          });
          while (filtered.length > 10) filtered.shift();
          localStorage.setItem(cacheKey, JSON.stringify(filtered));
        } catch {
          // Non-fatal — cache write failure doesn't affect operations
        }
      }

      return { files: updatedFiles, vaultsById, vaults };
    });
  },

  deleteFile: async (vaultId: string, fileId: string) => {
    if (isWeb) {
      set({ isLoading: true, error: null });
      try {
        await storageService.deleteFile(vaultId, fileId);
        fireAndForget(auditService.log('file_delete', `vault:${vaultId}/file:${fileId}`));

        set(state => {
          const updatedFiles = state.files.filter(f => f.id !== fileId);
          const vault = state.vaultsById[vaultId];
          const newFileCount = Math.max(0, (vault?.fileCount ?? 1) - 1);
          const now = new Date().toISOString();

          let vaultsById = state.vaultsById;
          if (vault) {
            vaultsById = {
              ...state.vaultsById,
              [vaultId]: { ...vault, fileCount: newFileCount, lastModified: now },
            };
          }
          const vaults = state.vaultIds.map(id => vaultsById[id]).filter(Boolean);

          persistVaults({ vaultIds: state.vaultIds, vaultsById });

          scheduleIndexReEncrypt(vaultId, () => ({
            files: updatedFiles,
            vaultKey: useVaultSessionStore.getState().vaultKey,
          }));

          return { files: updatedFiles, vaultsById, vaults, isLoading: false };
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : i18n.t('vaultErrors.failedToDeleteFile');
        set({ error: message, isLoading: false });
        throw error;
      }
      return;
    }
    set({ isLoading: true, error: null });
    try {
      fireAndForget(auditService.log('file_delete', `vault:${vaultId}/file:${fileId}`));
      set(state => {
        const updatedFiles = state.files.filter(f => f.id !== fileId);
        const vault = state.vaultsById[vaultId];
        let vaultsById = state.vaultsById;
        if (vault) {
          vaultsById = {
            ...state.vaultsById,
            [vaultId]: { ...vault, fileCount: Math.max(0, vault.fileCount - 1) },
          };
        }
        const vaults = state.vaultIds.map(id => vaultsById[id]).filter(Boolean);
        return { files: updatedFiles, vaultsById, vaults, isLoading: false };
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : i18n.t('vaultErrors.failedToDeleteFile');
      set({ error: message, isLoading: false });
      throw error;
    }
  },

  _updateVault: (vaultId: string, patch: Partial<VaultInfo>) => {
    set(state => {
      const vault = state.vaultsById[vaultId];
      if (!vault) return {};
      const vaultsById = { ...state.vaultsById, [vaultId]: { ...vault, ...patch } };
      return { vaultsById, vaults: state.vaultIds.map(id => vaultsById[id]).filter(Boolean) };
    });
  },

  _insertVault: (vault: VaultInfo) => {
    set(state => {
      const vaultIds = state.vaultIds.includes(vault.id)
        ? state.vaultIds
        : [...state.vaultIds, vault.id];
      const vaultsById = { ...state.vaultsById, [vault.id]: vault };
      return { vaultIds, vaultsById, vaults: vaultIds.map(id => vaultsById[id]).filter(Boolean) };
    });
  },
}));

// Register polling callbacks
setPollingCallbacks(
  () => useVaultListStore.getState().loadVaults(),
  () => useVaultListStore.getState().isLoading
);
