// PH4-FIX: Refactored Decrypt Screen - thin orchestrator with extracted components
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useEffect, useCallback } from 'react';
import { webOnly } from '@/utils/webStyle';
import { useVaultStore } from '@/stores/vaultStore';
import { InAppModal, useInAppModal } from '@/components/common';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import {
  dashboardSpacing,
  dashboardColors,
} from '@/components/dashboard2/styles';
import { useDecrypt } from '@/hooks/useDecrypt';
import { DecryptFileList } from '@/components/decrypt/DecryptFileList';
import { DecryptProgress } from '@/components/decrypt/DecryptProgress';
import { DecryptControls } from '@/components/decrypt/DecryptControls';
import { DecryptTempView } from '@/components/decrypt/DecryptTempView';
import { DecryptToolbar } from '@/components/decrypt/DecryptToolbar';

export default function DecryptScreen() {
  const { modal, showAlert, showSuccess, showError, showConfirm, showPrompt } = useInAppModal();
  const vaults = useVaultStore((s) => s.vaults);
  const currentVault = useVaultStore((s) => s.currentVault);
  const selectVault = useVaultStore((s) => s.selectVault);
  const loadVaults = useVaultStore((s) => s.loadVaults);
  const files = useVaultStore((s) => s.files);

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
      'Close Temporary View',
      'The decrypted file will be cleared from memory. Are you sure?',
      closeViewInternal,
      'Close & Clear',
      'destructive',
    );
  }, [showConfirm, closeViewInternal]);

  const handleDecrypt = useCallback(async () => {
    if (selectedFiles.size === 0) {
      showAlert('No Files Selected', 'Please select at least one file from your vault to decrypt.');
      return;
    }

    if (decryptMode === 'view' && selectedFiles.size > 1) {
      showAlert('View Temporarily', 'Temporary view only supports one file at a time. Please select a single file.');
      return;
    }

    const fileNames = filteredFiles.filter((f) => selectedFiles.has(f.id)).map((f) => f.name);
    const selectedStoreFiles = files.filter((f) => selectedFiles.has(f.id));
    const hasEncryptedData = selectedStoreFiles.some((f) => f.encryptedBlob || f.saltHex);

    // Demo/mock files — no real encrypted data available
    if (selectedStoreFiles.length === 0 || !hasEncryptedData) {
      if (decryptMode === 'save') {
        showConfirm(
          'Save Decrypted Files',
          `Decrypt and save ${selectedFiles.size} file${selectedFiles.size > 1 ? 's' : ''} to your device?\n\nNote: These are demo files — encrypt a real file first to test actual decryption.`,
          async () => {
            setIsDecrypting(true);
            try {
              await new Promise((resolve) => setTimeout(resolve, 800));
              showSuccess(
                'Demo Mode',
                `${fileNames.join(', ')} — simulated decryption. Encrypt a real file to test the full pipeline.`,
              );
              setSelectedFiles(new Set());
            } finally {
              setIsDecrypting(false);
            }
          },
          'Save to Device',
        );
      } else {
        const file = filteredFiles.find((f) => selectedFiles.has(f.id));
        if (!file) return;
        setIsDecrypting(true);
        try {
          await new Promise((resolve) => setTimeout(resolve, 500));
          const matchedStoreFile = files.find((f) => f.id === file.id);
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
            },
          );
          setSelectedFiles(new Set());
        } finally {
          setIsDecrypting(false);
        }
      }
      return;
    }

    // Real decryption — prompt for vault password
    showPrompt(
      'Enter Vault Password',
      [
        {
          key: 'password',
          label: 'Password',
          placeholder: 'Enter your vault password to decrypt',
          secure: true,
        },
      ],
      async (values) => {
        const password = values.password;
        if (!password) {
          showError('Error', 'Password is required to decrypt files.');
          return;
        }

        setIsDecrypting(true);
        setDecryptionProgress(0);
        try {
          const result = await performDecryption(password);

          if (result.success) {
            if (decryptMode === 'save') {
              showSuccess(
                'Files Saved',
                `${result.fileNames?.join(', ')} ${selectedFiles.size > 1 ? 'have' : 'has'} been decrypted and saved to Downloads.`,
              );
            }
            setSelectedFiles(new Set());
          } else {
            showError('Decryption Failed', result.error || 'Unknown error occurred');
          }
        } finally {
          setIsDecrypting(false);
          setDecryptionProgress(0);
        }
      },
      'Decrypt',
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
  ]);

  const handleQuickView = useCallback(
    (fileId: string) => {
      setSelectedFiles(new Set([fileId]));
      setDecryptMode('view');
      // Trigger decrypt with view mode
      const updatedFiles = new Set([fileId]);
      if (updatedFiles.size === 1) {
        // Call handleDecrypt after state update
        setTimeout(() => {
          setSelectedFiles(updatedFiles);
          setDecryptMode('view');
        }, 0);
      }
    },
    [setSelectedFiles, setDecryptMode],
  );

  const handleQuickSave = useCallback(
    (fileId: string) => {
      setSelectedFiles(new Set([fileId]));
      setDecryptMode('save');
    },
    [setSelectedFiles, setDecryptMode],
  );

  return (
    <ShellLayout>
      <View style={styles.contentArea}>
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={styles.pageTitle}>Decrypt & Access</Text>
          <Text style={styles.pageSubtitle}>
            {currentVault
              ? `Browse files in "${currentVault.name}" — select to decrypt`
              : 'Select a vault to browse encrypted files'}
          </Text>
        </View>

        {/* Temp view banner with file preview */}
        <DecryptTempView file={tempViewFile} onClose={closeTempView} />

        {/* Controls */}
        <DecryptControls
          mode={decryptMode}
          onModeChange={setDecryptMode}
          selectedCount={selectedFiles.size}
          onDecrypt={handleDecrypt}
          isDecrypting={isDecrypting}
          progress={decryptionProgress}
        />

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
            <Feather name="unlock" size={48} color={dashboardColors.textSecondary} />
            <Text style={styles.emptyStateText}>No files to decrypt</Text>
            <Text style={styles.emptyStateHint}>Add files to your vault to get started</Text>
            <Pressable
              style={(state: any) => [styles.addFilesBtn, state.hovered && styles.addFilesBtnHover]}
              onPress={() => showAlert('Add Files', 'Encrypt files first to decrypt them')}
            >
              <Feather name="plus" size={16} color="#FFFFFF" />
              <Text style={styles.addFilesBtnText}>Add Files</Text>
            </Pressable>
          </View>
        ) : filteredFiles.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Feather name="inbox" size={40} color={dashboardColors.textSecondary} />
            <Text style={styles.emptyStateText}>No files match your search</Text>
            <Text style={styles.emptyStateHint}>Try a different search term</Text>
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
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 15,
    color: dashboardColors.textSecondary,
  },
  emptyStateContainer: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg * 3,
    gap: dashboardSpacing.sm,
  },
  emptyStateText: {
    fontSize: 15,
    color: dashboardColors.textPrimary,
    fontWeight: '500',
  },
  emptyStateHint: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
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
});
