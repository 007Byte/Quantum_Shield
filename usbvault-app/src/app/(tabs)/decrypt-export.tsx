/**
 * Decrypt & Export — Unified screen for decrypting vault files and exporting them.
 *
 * Merges the former "Decrypt" and "Export File" screens into a single workflow:
 * - Real crypto decryption via useDecrypt hook (Argon2id key derivation + AEAD)
 * - Two modes: "Save to Device" and "View Temporarily"
 * - Export format selection (Original or ZIP Bundle)
 * - Export history tracking
 * - Destination display
 *
 * All 5 extracted Decrypt components are preserved:
 *   DecryptFileList, DecryptProgress, DecryptControls, DecryptTempView, DecryptToolbar
 */
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useEffect, useCallback, useState } from 'react';
import { webOnly } from '@/utils/webStyle';
import { useVaultListStore } from '@/stores/vaultListStore';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import { InAppModal, useInAppModal } from '@/components/common';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { useDecrypt } from '@/hooks/useDecrypt';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { DecryptFileList } from '@/components/decrypt/DecryptFileList';
import { DecryptProgress } from '@/components/decrypt/DecryptProgress';
import { DecryptControls } from '@/components/decrypt/DecryptControls';
import { DecryptTempView } from '@/components/decrypt/DecryptTempView';
import { DecryptToolbar } from '@/components/decrypt/DecryptToolbar';
import { analyticsService } from '@/services/analyticsService';

// ─── Export History (persisted in component state for now) ─────────────────
interface ExportHistoryEntry {
  id: string;
  filename: string;
  date: string;
  size: string;
  format: string;
}

function DecryptExportScreen() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { modal, showAlert, showSuccess, showError, showConfirm, showPrompt } = useInAppModal();
  const vaults = useVaultListStore(s => s.vaults);
  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const currentVault = useVaultListStore(s => (activeVaultId ? s.vaultsById[activeVaultId] : null));
  const selectVault = useActiveVaultStore(s => s.selectVault);
  const loadVaults = useVaultListStore(s => s.loadVaults);
  const files = useVaultListStore(s => s.files);

  const {
    selectedFiles,
    setSelectedFiles,
    decryptMode,
    setDecryptMode,
    isDecrypting,
    setIsDecrypting,
    tempViewFile,
    setTempViewFile,
    searchQuery,
    setSearchQuery,
    decryptionProgress,
    setDecryptionProgress,
    vaultFiles,
    filteredFiles,
    toggleFileSelection,
    selectAll,
    closeTempView: closeViewInternal,
    performDecryption,
  } = useDecrypt();

  // ── Export-specific state ──
  const [formatSelection, setFormatSelection] = useState<'original' | 'zip'>('original');
  const [exportHistory, setExportHistory] = useState<ExportHistoryEntry[]>([]);

  // Initialize vaults
  useEffect(() => {
    if (vaults.length === 0) {
      loadVaults();
    }
  }, []);

  useEffect(() => {
    if (vaults.length > 0 && !currentVault) {
      selectVault(vaults[0].id);
    }
  }, [vaults, currentVault]);

  const closeTempView = useCallback(() => {
    showConfirm(
      t('decrypt.closeTempView'),
      t('decrypt.closeTempViewMsg'),
      closeViewInternal,
      t('decrypt.closeAndClear'),
      'destructive'
    );
  }, [showConfirm, closeViewInternal, t]);

  // Add to export history after successful decrypt+save
  const addExportHistoryEntry = useCallback(
    (fileNames: string[], fileCount: number) => {
      const now = new Date();
      const dateStr =
        now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ', ' +
        now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const format =
        formatSelection === 'zip'
          ? t('decryptExport.zipBundle')
          : t('decryptExport.originalFormat');

      const entry: ExportHistoryEntry = {
        id: `exp-${Date.now()}`,
        filename:
          fileCount > 1
            ? `${fileNames[0]} +${fileCount - 1} ${t('decryptExport.moreFiles')}`
            : fileNames[0],
        date: dateStr,
        size: '',
        format,
      };

      setExportHistory(prev => [entry, ...prev].slice(0, 20));
    },
    [formatSelection, t]
  );

  const handleDecrypt = useCallback(async () => {
    if (selectedFiles.size === 0) {
      showAlert(t('decrypt.noFilesSelected'), t('decrypt.selectAtLeastOne'));
      return;
    }

    if (decryptMode === 'view' && selectedFiles.size > 1) {
      showAlert(t('decrypt.viewTemporarily'), t('decrypt.viewTempOnlyOne'));
      return;
    }

    const fileNames = filteredFiles.filter(f => selectedFiles.has(f.id)).map(f => f.name);
    const selectedStoreFiles = files.filter(f => selectedFiles.has(f.id));
    const hasEncryptedData = selectedStoreFiles.some(f => f.encryptedBlob || f.saltHex);
    const isUsbVaultUnlocked = vaultOrchestrator.isUnlocked();

    // Demo/mock files — no real encrypted data available AND vault not unlocked.
    // FIX: USB vault files don't have encryptedBlob or saltHex (their data
    // lives in VAULT.bin on the USB drive). Must check orchestrator status
    // before falling through to the demo path.
    if (selectedStoreFiles.length === 0 || (!hasEncryptedData && !isUsbVaultUnlocked)) {
      if (decryptMode === 'save') {
        showConfirm(
          t('decrypt.saveDecryptedFiles'),
          t('decrypt.confirmDecrypt', { count: selectedFiles.size }),
          async () => {
            setIsDecrypting(true);
            try {
              await new Promise(resolve => setTimeout(resolve, 800));
              showSuccess(
                t('decrypt.demoMode'),
                t('decrypt.simulatedDecrypt', { files: fileNames.join(', ') })
              );
              addExportHistoryEntry(fileNames, selectedFiles.size);
              setSelectedFiles(new Set());
            } finally {
              setIsDecrypting(false);
            }
          },
          t('decrypt.saveToDevice')
        );
      } else {
        const file = filteredFiles.find(f => selectedFiles.has(f.id));
        if (!file) return;
        setIsDecrypting(true);
        try {
          await new Promise(resolve => setTimeout(resolve, 500));
          const matchedStoreFile = files.find(f => f.id === file.id);
          setTempViewFile(
            matchedStoreFile || {
              id: file.id,
              vaultId: currentVault?.id || '',
              name: file.name,
              size: file.sizeBytes,
              type: file.type,
              modifiedAt: new Date().toISOString(),
              encryptedMetadata: '',
              isPQCProtected: file.isPQC,
            }
          );
          setSelectedFiles(new Set());
        } finally {
          setIsDecrypting(false);
        }
      }
      return;
    }

    // FIX: USB vault files are already unlocked — skip password prompt.
    // The orchestrator uses the in-memory encryption key, not a password.
    if (isUsbVaultUnlocked) {
      setIsDecrypting(true);
      setDecryptionProgress(0);
      try {
        const result = await performDecryption(''); // Password unused for USB vault path
        if (result.success) {
          analyticsService.track('file_decrypted', {
            mode: decryptMode,
            file_count: selectedFiles.size,
          });
          if (decryptMode === 'save') {
            showSuccess(
              t('decrypt.filesSaved'),
              t('decrypt.decryptedSaved', {
                files: result.fileNames?.join(', '),
                verb: selectedFiles.size > 1 ? t('decrypt.have') : t('decrypt.has'),
              })
            );
            addExportHistoryEntry(result.fileNames || fileNames, selectedFiles.size);
          }
          setSelectedFiles(new Set());
        } else {
          showError(t('decrypt.decryptionFailed'), result.error || t('decrypt.unknownError'));
        }
      } finally {
        setIsDecrypting(false);
        setDecryptionProgress(0);
      }
      return;
    }

    // Non-USB decryption — prompt for vault password
    showPrompt(
      t('decrypt.enterVaultPassword'),
      [
        {
          key: 'password',
          label: t('decrypt.password'),
          placeholder: t('decrypt.enterPassword'),
          secure: true,
        },
      ],
      async values => {
        const password = values.password;
        if (!password) {
          showError(t('common.error'), t('decrypt.passwordRequired'));
          return;
        }

        setIsDecrypting(true);
        setDecryptionProgress(0);
        try {
          const result = await performDecryption(password);

          if (result.success) {
            analyticsService.track('file_decrypted', {
              mode: decryptMode,
              file_count: selectedFiles.size,
            });
            if (decryptMode === 'save') {
              showSuccess(
                t('decrypt.filesSaved'),
                t('decrypt.decryptedSaved', {
                  files: result.fileNames?.join(', '),
                  verb: selectedFiles.size > 1 ? t('decrypt.have') : t('decrypt.has'),
                })
              );
              addExportHistoryEntry(result.fileNames || fileNames, selectedFiles.size);
            }
            setSelectedFiles(new Set());
          } else {
            showError(t('decrypt.decryptionFailed'), result.error || t('decrypt.unknownError'));
          }
        } finally {
          setIsDecrypting(false);
          setDecryptionProgress(0);
        }
      },
      t('decrypt.decryptBtn')
    );
  }, [
    selectedFiles,
    filteredFiles,
    files,
    decryptMode,
    currentVault,
    showAlert,
    showConfirm,
    showPrompt,
    showSuccess,
    showError,
    performDecryption,
    setSelectedFiles,
    setIsDecrypting,
    setDecryptionProgress,
    setTempViewFile,
    addExportHistoryEntry,
    t,
  ]);

  const handleQuickView = useCallback(
    (fileId: string) => {
      setSelectedFiles(new Set([fileId]));
      setDecryptMode('view');
      const updatedFiles = new Set([fileId]);
      if (updatedFiles.size === 1) {
        setTimeout(() => {
          setSelectedFiles(updatedFiles);
          setDecryptMode('view');
        }, 0);
      }
    },
    [setSelectedFiles, setDecryptMode]
  );

  const handleQuickSave = useCallback(
    (fileId: string) => {
      setSelectedFiles(new Set([fileId]));
      setDecryptMode('save');
    },
    [setSelectedFiles, setDecryptMode]
  );

  return (
    <ShellLayout>
      <View style={[styles.contentArea, resolveLayerStyle(theme.L2.base)]}>
        {/* Header */}
        <View style={[styles.headerSection, resolveLayerStyle(theme.L2.base)]}>
          <Text
            style={[styles.pageTitle, { color: theme.L2.base.text.primary }]}
            accessibilityRole="header"
          >
            {t('decryptExport.pageTitle')}
          </Text>
          <Text style={[styles.pageSubtitle, { color: theme.L2.base.text.secondary }]}>
            {currentVault
              ? t('decrypt.browseVault', { vault: currentVault.name })
              : t('decrypt.selectVault')}
          </Text>
        </View>

        {/* Temp view banner with file preview */}
        <DecryptTempView file={tempViewFile} onClose={closeTempView} />

        {/* Controls — mode selector + action bar */}
        <DecryptControls
          mode={decryptMode}
          onModeChange={setDecryptMode}
          selectedCount={selectedFiles.size}
          onDecrypt={handleDecrypt}
          isDecrypting={isDecrypting}
          progress={decryptionProgress}
        />

        {/* Export Options — format + destination (visible when in save mode) */}
        {decryptMode === 'save' && (
          <View style={[styles.exportOptionsSection, resolveLayerStyle(theme.L2.base)]}>
            <View style={styles.exportOptionsRow}>
              {/* Format Toggle */}
              <View style={styles.optionGroup}>
                <Text style={[styles.optionLabel, { color: theme.L2.base.text.secondary }]}>
                  {t('decryptExport.format')}
                </Text>
                <View style={styles.formatToggle}>
                  <Pressable
                    accessibilityRole="button"
                    style={(state: any) => [
                      styles.formatButton,
                      formatSelection === 'original' && styles.formatButtonActive,
                      state.hovered && styles.formatButtonHover,
                    ]}
                    onPress={() => setFormatSelection('original')}
                  >
                    <Feather
                      name="file"
                      size={14}
                      color={
                        formatSelection === 'original'
                          ? theme.L2.base.text.primary
                          : theme.L2.base.text.secondary
                      }
                    />
                    <Text
                      style={[
                        styles.formatButtonText,
                        formatSelection === 'original' && styles.formatButtonTextActive,
                        {
                          color:
                            formatSelection === 'original'
                              ? theme.L2.base.text.primary
                              : theme.L2.base.text.secondary,
                        },
                      ]}
                    >
                      {t('decryptExport.originalFormat')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    style={(state: any) => [
                      styles.formatButton,
                      formatSelection === 'zip' && styles.formatButtonActive,
                      state.hovered && styles.formatButtonHover,
                    ]}
                    onPress={() => setFormatSelection('zip')}
                  >
                    <Feather
                      name="package"
                      size={14}
                      color={
                        formatSelection === 'zip'
                          ? theme.L2.base.text.primary
                          : theme.L2.base.text.secondary
                      }
                    />
                    <Text
                      style={[
                        styles.formatButtonText,
                        formatSelection === 'zip' && styles.formatButtonTextActive,
                        {
                          color:
                            formatSelection === 'zip'
                              ? theme.L2.base.text.primary
                              : theme.L2.base.text.secondary,
                        },
                      ]}
                    >
                      {t('decryptExport.zipBundle')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Destination */}
              <View style={styles.optionGroup}>
                <Text style={[styles.optionLabel, { color: theme.L2.base.text.secondary }]}>
                  {t('decryptExport.destination')}
                </Text>
                <View style={styles.destinationInfo}>
                  <Feather name="hard-drive" size={18} color={theme.semantic.cyan} />
                  <View style={styles.destinationDetails}>
                    <Text style={[styles.destinationPath, { color: theme.semantic.cyan }]}>
                      {t('decryptExport.localStorage')}
                    </Text>
                    <Text style={[styles.destinationDesc, { color: theme.L2.base.text.secondary }]}>
                      {t('decryptExport.localStorageDesc')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Progress indicator */}
        <DecryptProgress isDecrypting={isDecrypting} progress={decryptionProgress} />

        {/* Search + select all bar */}
        <DecryptToolbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          filteredCount={filteredFiles.length}
          totalCount={vaultFiles.length}
          allSelected={selectedFiles.size === filteredFiles.length && filteredFiles.length > 0}
          onSelectAll={selectAll}
        />

        {/* File list */}
        {filteredFiles.length === 0 && vaultFiles.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Feather name="unlock" size={48} color={theme.L2.base.text.secondary} />
            <Text style={[styles.emptyStateText, { color: theme.L2.base.text.primary }]}>
              {t('decrypt.noFiles')}
            </Text>
            <Text style={[styles.emptyStateHint, { color: theme.L2.base.text.secondary }]}>
              {t('decrypt.addFilesHint')}
            </Text>
            <Pressable
              accessibilityRole="button"
              style={(state: any) => [styles.addFilesBtn, state.hovered && styles.addFilesBtnHover]}
              onPress={() => showAlert(t('decrypt.addFiles'), t('decrypt.encryptFirst'))}
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addFilesBtnText}>{t('decrypt.addFiles')}</Text>
            </Pressable>
          </View>
        ) : filteredFiles.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Feather name="inbox" size={40} color={theme.L2.base.text.secondary} />
            <Text style={[styles.emptyStateText, { color: theme.L2.base.text.primary }]}>
              {t('decrypt.noMatch')}
            </Text>
            <Text style={[styles.emptyStateHint, { color: theme.L2.base.text.secondary }]}>
              {t('decrypt.tryDifferent')}
            </Text>
          </View>
        ) : (
          <DecryptFileList
            files={filteredFiles}
            selectedFiles={selectedFiles}
            onToggleSelection={toggleFileSelection}
            onQuickView={handleQuickView}
            onQuickSave={handleQuickSave}
          />
        )}

        {/* Export History */}
        {exportHistory.length > 0 && (
          <View style={[styles.historySection, resolveLayerStyle(theme.L2.base)]}>
            <View style={styles.historySectionHeader}>
              <Feather name="clock" size={18} color="#8B5CF6" />
              <Text style={[styles.historySectionTitle, { color: theme.L2.base.text.primary }]}>
                {t('decryptExport.exportHistory')}
              </Text>
            </View>
            {exportHistory.map(item => (
              <View key={item.id} style={styles.historyItem}>
                <View style={styles.historyIconContainer}>
                  <Feather name="download" size={16} color={theme.semantic.cyan} />
                </View>
                <View style={styles.historyDetailsContainer}>
                  <Text
                    style={[styles.historyFilename, { color: theme.L2.base.text.primary }]}
                    numberOfLines={1}
                  >
                    {item.filename}
                  </Text>
                  <View style={styles.historyMetaRow}>
                    <Text style={[styles.historyDate, { color: theme.L2.base.text.secondary }]}>
                      {item.date}
                    </Text>
                    <Text style={styles.historyDot}>&bull;</Text>
                    <Text style={[styles.historyFormat, { color: theme.L2.base.text.secondary }]}>
                      {item.format}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
      <InAppModal config={modal} />
    </ShellLayout>
  );
}

const styles = StyleSheet.create({
  contentArea: {
    paddingRight: 10,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  headerSection: {
    marginBottom: dashboardSpacing.lg,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 15,
  },

  // ── Export Options ──
  exportOptionsSection: {
    marginBottom: dashboardSpacing.md,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  exportOptionsRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.lg,
    flexWrap: 'wrap',
  },
  optionGroup: {
    flex: 1,
    minWidth: 200,
    gap: dashboardSpacing.sm,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formatToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  formatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    ...webOnly({ cursor: 'pointer', transition: 'all 0.2s ease' }),
  },
  formatButtonActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: '#8B5CF6',
    ...webOnly({ boxShadow: '0 0 12px rgba(139,92,246,0.3)' }),
  },
  formatButtonHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
  },
  formatButtonText: {
    fontSize: 12,
    fontWeight: '500',
  },
  formatButtonTextActive: {
    fontWeight: '600',
  },
  destinationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
  },
  destinationDetails: {
    flex: 1,
  },
  destinationPath: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 2,
  },
  destinationDesc: {
    fontSize: 11,
  },

  // ── Empty state ──
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg * 3,
    gap: dashboardSpacing.sm,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '500',
  },
  emptyStateHint: {
    fontSize: 13,
  },
  addFilesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    ...webOnly({
      background: 'linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)',
      boxShadow: '0 0 16px rgba(139,92,246,0.3)',
      transition: 'all 0.2s ease',
      cursor: 'pointer',
    }),
  },
  addFilesBtnHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 0 24px rgba(139,92,246,0.5), 0 0 40px rgba(34,211,238,0.3)',
    }),
  },
  addFilesBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ── Export History ──
  historySection: {
    marginTop: dashboardSpacing.lg,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  historySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: dashboardSpacing.md,
  },
  historySectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    marginBottom: 8,
  },
  historyIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.2)',
  },
  historyDetailsContainer: {
    flex: 1,
  },
  historyFilename: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 3,
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyDate: {
    fontSize: 11,
  },
  historyDot: {
    fontSize: 11,
    color: 'rgba(184,179,209,0.4)',
  },
  historyFormat: {
    fontSize: 11,
  },
});

export default withErrorBoundary(DecryptExportScreen, 'DecryptExport');
