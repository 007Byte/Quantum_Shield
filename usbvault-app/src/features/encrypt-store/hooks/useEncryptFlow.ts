/**
 * useEncryptFlow — encryption workflow state machine hook.
 *
 * Owns: file selection, algorithm/security state, encryption orchestration,
 * vault unlock, file listing. The screen becomes a pure view.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import type { FileInfo } from '@/types/domain';
import { useInAppModal } from '@/components/common';
import { CipherId } from '@/crypto/bridge';
import { encryptFile, uint8ArrayToBase64 } from '@/utils/cryptoManager';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { formatFileSize } from '@/utils/fileHelpers';
import { auditService } from '@/services/auditService';
import { analyticsService } from '@/services/analyticsService';
import { usbService, type VaultFile } from '@/services/usbService';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { useLanguage } from '@/hooks/useLanguage';
import { useVaultUnlock } from '@/hooks/useVaultUnlock';
import { generateId } from '@/utils/generateId';
import { sanitizeFileName } from '../domain/encrypt.data';
import type { SelectedFile, RecentFileDisplay } from '../domain/encrypt.types';

export function useEncryptFlow() {
  const { t } = useLanguage();
  const { modal, showSuccess, showError } = useInAppModal();

  // ── Store selectors ─────────────────────────────────────────────
  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const currentVault = useVaultListStore(s => (activeVaultId ? s.vaultsById[activeVaultId] : null));
  const vaults = useVaultListStore(s => s.vaults);
  const selectVault = useActiveVaultStore(s => s.selectVault);
  const files = useVaultListStore(s => s.files);
  const addFile = useVaultListStore(s => s.addFile);
  const loadVaults = useVaultListStore(s => s.loadVaults);

  // ── State: file selection ───────────────────────────────────────
  const [isDragHover, setIsDragHover] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [customName, setCustomName] = useState('');
  const [_isEditingName, setIsEditingName] = useState(false);

  // ── State: encryption options ───────────────────────────────────
  const [algorithm, setAlgorithm] = useState('AES-256-GCM-SIV');
  const [securityLevel, setSecurityLevel] = useState('Standard');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [encryptionProgress, setEncryptionProgress] = useState(0);

  // ── State: USB upload + vault files ─────────────────────────────
  const [isUploading, setIsUploading] = useState(false);
  const [vaultFiles, setVaultFiles] = useState<VaultFile[]>([]);

  // ── Vault unlock (delegated to shared hook) ───────────────────
  // FIX: Vault unlock logic was duplicated here AND only available on
  // the encrypt-store tab. Now delegated to useVaultUnlock which is
  // also used at the Tabs layout level for global unlock support.
  const vaultUnlockHook = useVaultUnlock({ showSuccess, showError });
  const {
    vaultUnlocked,
    showUnlockModal,
    unlockPassword,
    isUnlocking,
    unlockError,
    setUnlockPassword,
    handleVaultUnlock,
    dismissUnlockModal,
    requestUnlock,
  } = vaultUnlockHook;

  const activeVault = currentVault || vaults[0];

  // ── Effects ─────────────────────────────────────────────────────
  useEffect(() => {
    if (vaults.length === 0) loadVaults();
  }, []);

  useEffect(() => {
    if (vaults.length > 0 && !currentVault) selectVault(vaults[0].id);
  }, [vaults, currentVault]);

  const loadFiles = useCallback(async () => {
    if (!activeVault) return;

    // Strategy 1: Orchestrator index (unlocked V4 vault)
    const index = vaultOrchestrator.getIndex();
    if (index && Object.keys(index.files).length > 0) {
      const storeState = useVaultListStore.getState();
      const mapped = Object.entries(index.files).map(([fileId, entry]) => {
        const storeFile = storeState.files.find(f => f.id === fileId);
        const size = storeFile?.size || entry.length || 0;
        // FIX: The vault index entry stores the original filename (entry.name).
        // The V2RC record does NOT store the filename, so record.metadata.filename
        // is always ''. Previously this fell back to fileId (random ID like
        // "file-1774364933890-xi0xgj") when storeFile was missing after reload.
        const displayName = entry.name || storeFile?.name || fileId;
        return {
          id: fileId,
          name: displayName,
          size,
          encryptedSize: size,
          createdAt: storeFile?.modifiedAt || new Date().toISOString(),
          modifiedAt: storeFile?.modifiedAt || new Date().toISOString(),
          contentHash: '',
        };
      });
      setVaultFiles(mapped);
      return;
    }

    // Strategy 2: Zustand store
    const storeFiles = useVaultListStore.getState().files.filter(f => f.vaultId === activeVault.id);
    if (storeFiles.length > 0) {
      setVaultFiles(
        storeFiles.map(f => ({
          id: f.id,
          name: f.name,
          size: f.size || 0,
          encryptedSize: f.size || 0,
          createdAt: f.modifiedAt || new Date().toISOString(),
          modifiedAt: f.modifiedAt || new Date().toISOString(),
          contentHash: '',
        }))
      );
      return;
    }

    // Strategy 3: USB API fallback
    try {
      const usbFiles = await usbService.listVaultFiles(activeVault.id);
      setVaultFiles(usbFiles);
    } catch {
      setVaultFiles([]);
    }
  }, [activeVault]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Reload files after vault unlock (shared hook syncs index → Zustand,
  // but loadFiles needs to re-read from orchestrator to update vaultFiles state).
  useEffect(() => {
    if (vaultUnlocked) {
      loadFiles();
    }
  }, [vaultUnlocked, loadFiles]);

  // Auto-prompt and vault unlock are now handled by useVaultUnlock (shared hook).
  // The hook is also active at the Tabs layout level, so unlock works from any tab.
  const isUsbVault = vaultUnlockHook.isUsbVault;

  // ── File selection handler ──────────────────────────────────────
  const handleSelectFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        const sanitized = sanitizeFileName(asset.name);
        setSelectedFile({
          name: asset.name,
          size: asset.size || 0,
          uri: asset.uri,
          mimeType: asset.mimeType || 'application/octet-stream',
        });
        setCustomName(sanitized);
        setIsEditingName(false);
      }
    } catch {
      showError(t('common.error'), t('encrypt.failedToSelect'));
    }
  }, [showError, t]);

  const effectiveFileName = useMemo(() => {
    if (customName.trim()) return sanitizeFileName(customName);
    if (selectedFile) return sanitizeFileName(selectedFile.name);
    return '';
  }, [customName, selectedFile]);

  const handleCustomNameChange = useCallback((text: string) => {
    setCustomName(text);
  }, []);

  const handleCustomNameBlur = useCallback(() => {
    setIsEditingName(false);
    if (customName.trim()) {
      const originalExt = selectedFile?.name.split('.').pop()?.toLowerCase() || '';
      const currentExt = customName.split('.').pop()?.toLowerCase() || '';
      if (originalExt && currentExt !== originalExt && !customName.includes('.')) {
        setCustomName(sanitizeFileName(`${customName}.${originalExt}`));
      } else {
        setCustomName(sanitizeFileName(customName));
      }
    }
  }, [customName, selectedFile]);

  // ── Encrypt & Store handler ─────────────────────────────────────
  const handleEncryptAndStore = useCallback(async () => {
    if (!selectedFile) {
      showError(t('common.error'), t('encrypt.selectFileFirst'));
      return;
    }
    if (!activeVault) {
      showError(t('common.error'), t('encrypt.noVaultSelected'));
      return;
    }

    // Guard: USB vaults MUST be unlocked before encryption.
    // Path B (Zustand-only) uses a weak session password and files
    // would be stranded in memory, never reaching VAULT.bin on USB.
    if (isUsbVault && !vaultOrchestrator.isUnlocked()) {
      requestUnlock();
      return;
    }

    setIsEncrypting(true);
    setEncryptionProgress(0);

    try {
      const storedName = effectiveFileName || sanitizeFileName(selectedFile.name);
      const fileId = generateId('file');

      setEncryptionProgress(0.1);
      const originalSize = selectedFile.size;

      if (vaultOrchestrator.isUnlocked()) {
        setEncryptionProgress(0.3);
        setIsUploading(true);
        // Read raw file data for orchestrator
        let fileData: Uint8Array;
        if (Platform.OS === 'web') {
          const response = await fetch(selectedFile.uri);
          const arrayBuffer = await response.arrayBuffer();
          fileData = new Uint8Array(arrayBuffer);
        } else {
          const base64 = await FileSystem.readAsStringAsync(selectedFile.uri, {
            encoding: 'base64' as const,
          });
          fileData = new Uint8Array(Buffer.from(base64, 'base64'));
        }
        await vaultOrchestrator.addFile(fileId, storedName, fileData);
        setEncryptionProgress(0.9);

        const newFile: FileInfo = {
          id: fileId,
          vaultId: activeVault.id,
          name: storedName,
          size: selectedFile.size,
          type: selectedFile.mimeType,
          modifiedAt: new Date().toISOString(),
          encryptedMetadata: '',
          isPQCProtected: securityLevel === 'Maximum',
          uri: selectedFile.uri,
          originalSize,
        };
        addFile(newFile);
        setEncryptionProgress(1.0);
        setIsUploading(false);
      } else {
        const cipherMap: Record<string, CipherId> = {
          'AES-256-GCM-SIV': CipherId.Aes256GcmSiv,
          'XChaCha20-Poly1305': CipherId.XChaCha20Poly1305,
          'ML-KEM-1024 Hybrid': CipherId.Aes256GcmSiv,
        };
        const cipherId = cipherMap[algorithm] ?? CipherId.Aes256GcmSiv;
        const vaultPassword = `vault-${activeVault.id}-session`;

        const result = await encryptFile(selectedFile.uri, vaultPassword, cipherId, progress =>
          setEncryptionProgress(progress * 0.7)
        );

        const newFile: FileInfo = {
          id: fileId,
          vaultId: activeVault.id,
          name: storedName,
          size: selectedFile.size,
          type: selectedFile.mimeType,
          modifiedAt: new Date().toISOString(),
          encryptedMetadata: uint8ArrayToBase64(result.salt),
          isPQCProtected: securityLevel === 'Maximum',
          uri: selectedFile.uri,
          encryptedBlob: result.encryptedData,
          saltHex: Array.from(result.salt)
            .map(b => b.toString(16).padStart(2, '0'))
            .join(''),
          cipherId: result.cipherId,
          isStreamed: result.isStreamed,
          originalSize: result.originalSize,
        };
        addFile(newFile);
        setEncryptionProgress(1.0);
      }

      await auditService.log('encrypt', storedName, {
        algorithm,
        securityLevel,
        vaultId: activeVault.id,
        originalSize,
        orchestratorUsed: vaultOrchestrator.isUnlocked(),
        originalName: selectedFile.name !== storedName ? selectedFile.name : undefined,
      });

      analyticsService.track('file_encrypted', { algorithm, security_level: securityLevel });

      showSuccess(
        t('encrypt.encryptedSuccess'),
        t('encrypt.encryptedWith', {
          name: storedName,
          algorithm,
          size: formatFileSize(originalSize),
        })
      );
      setSelectedFile(null);
      setCustomName('');
    } catch (error) {
      const message = error instanceof Error ? error.message : t('encrypt.unknownError');
      await auditService.log(
        'encrypt',
        selectedFile?.name || 'unknown',
        { error: message },
        'error'
      );
      showError(t('encrypt.encryptionFailed'), message);
    } finally {
      setIsEncrypting(false);
      setEncryptionProgress(0);
    }
  }, [
    selectedFile,
    activeVault,
    algorithm,
    securityLevel,
    addFile,
    showSuccess,
    showError,
    t,
    effectiveFileName,
  ]);

  // ── Recent files display ────────────────────────────────────────
  const hasRealFiles = files.length > 0;
  const recentFiles: RecentFileDisplay[] = useMemo(() => {
    if (!hasRealFiles) return [];
    return files.slice(0, 4).map(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      // File-type icon colors — semantic, not theme-dependent
      const iconMap: Record<string, { iconName: string; iconTint: string; iconBg: string }> = {
        pdf: { iconName: 'file-text', iconTint: '#FFFFFF', iconBg: '#E11D48' },
        doc: { iconName: 'file-text', iconTint: '#E9D5FF', iconBg: '#7E22CE' },
        docx: { iconName: 'file-text', iconTint: '#E9D5FF', iconBg: '#7E22CE' },
        xlsx: { iconName: 'grid', iconTint: '#6EE7B7', iconBg: '#0F766E' },
        csv: { iconName: 'grid', iconTint: '#6EE7B7', iconBg: '#0F766E' },
        zip: { iconName: 'archive', iconTint: '#F8E16C', iconBg: '#7C3AED' },
        png: { iconName: 'image', iconTint: '#7DD3FC', iconBg: '#2563EB' },
        jpg: { iconName: 'image', iconTint: '#7DD3FC', iconBg: '#2563EB' },
      };
      const info = iconMap[ext] || { iconName: 'file', iconTint: '#93C5FD', iconBg: '#1E40AF' };
      const diffMs = Date.now() - new Date(f.modifiedAt || Date.now()).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      let modifiedLabel = t('common.justNow');
      if (diffMins >= 1 && diffMins < 60)
        modifiedLabel = t('common.minutesAgo', { count: diffMins });
      else if (diffMins >= 60 && diffMins < 1440)
        modifiedLabel = t('common.hoursAgo', { count: Math.floor(diffMins / 60) });
      else if (diffMins >= 1440)
        modifiedLabel = t('common.daysAgo', { count: Math.floor(diffMins / 1440) });
      return {
        id: f.id,
        name: f.name,
        iconName: info.iconName,
        iconTint: info.iconTint,
        iconBg: info.iconBg,
        modifiedLabel,
        securityLabel: f.isPQCProtected ? 'PQC' : t('encrypt.standard'),
      };
    });
  }, [files, hasRealFiles, t]);

  // ── Progress label ──────────────────────────────────────────────
  const progressLabel = isEncrypting
    ? isUploading
      ? t('encryptStore.uploadingToVault')
      : `${t('encrypt.encrypting')} ${Math.round(encryptionProgress * 100)}%`
    : t('encryptStore.encryptAndStore');

  return {
    // Modal
    modal,
    // Vault
    activeVault,
    vaultFiles,
    hasRealFiles,
    recentFiles,
    // File selection
    selectedFile,
    customName,
    effectiveFileName,
    isDragHover,
    setIsDragHover,
    handleSelectFile,
    handleCustomNameChange,
    handleCustomNameBlur,
    setIsEditingName,
    setCustomName,
    // Encryption
    algorithm,
    setAlgorithm,
    securityLevel,
    setSecurityLevel,
    isEncrypting,
    isUploading,
    encryptionProgress,
    progressLabel,
    handleEncryptAndStore,
    // Vault unlock (delegated to shared useVaultUnlock hook)
    showUnlockModal,
    setShowUnlockModal: (v: boolean) => (v ? requestUnlock() : dismissUnlockModal()),
    unlockPassword,
    setUnlockPassword,
    isUnlocking,
    unlockError,
    setUnlockError: (_v: string | null) => {}, // Error managed by shared hook
    handleVaultUnlock,
  };
}
