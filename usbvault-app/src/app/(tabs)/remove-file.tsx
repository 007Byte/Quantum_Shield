import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal } from '@/components/common';
import { VaultUnlockModal } from '@/components/common/VaultUnlockModal';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useLanguage } from '@/hooks/useLanguage';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import { useRemoveFile } from '@/features/remove-file/hooks/useRemoveFile';
import { FileSelectionList } from '@/features/remove-file/components/FileSelectionList';
import { WipeOptions } from '@/features/remove-file/components/WipeOptions';
import { DeleteHistory } from '@/features/remove-file/components/DeleteHistory';

function RemoveFileScreen() {
  const { t } = useLanguage();
  const {
    realFiles,
    selectedFiles,
    allFilesSelected,
    secureWipeEnabled,
    deleteHistory,
    activeVault,
    modal,
    unlock,
    toggleFileSelection,
    selectAllFiles,
    setSecureWipeEnabled,
    handleDeleteClick,
  } = useRemoveFile();

  const panelStyle = styles.panel;

  return (
    <ShellLayout>
      <View style={styles.contentArea}>
        {/* Header */}
        <View style={styles.headerSection}>
          <Text style={styles.screenTitle}>
            {t('removeFile.title', { defaultValue: 'Remove File' })}
          </Text>
          <Text style={styles.screenSubtitle}>
            {t('removeFile.subtitle', { defaultValue: 'Securely delete files from your vault' })}
          </Text>
        </View>

        {/* Empty state when no vault or no files */}
        {!activeVault ? (
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color="rgba(167,139,250,0.3)" />
            <Text style={styles.emptyStateText}>
              {t('removeFile.noVault', { defaultValue: 'No vault selected. Open a vault first.' })}
            </Text>
          </View>
        ) : realFiles.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="check-circle" size={48} color="rgba(16,185,129,0.4)" />
            <Text style={styles.emptyStateText}>
              {t('removeFile.noFiles', { defaultValue: 'No files in vault. Vault is empty.' })}
            </Text>
          </View>
        ) : (
          <>
            {/* File Selection */}
            <FileSelectionList
              files={realFiles}
              selectedFiles={selectedFiles}
              allFilesSelected={allFilesSelected}
              onToggleFile={toggleFileSelection}
              onSelectAll={selectAllFiles}
              panelStyle={panelStyle}
              labels={{
                selectFiles: t('removeFile.selectFiles', { defaultValue: 'Select Files to Delete' }),
                selectAll: t('removeFile.selectAll', { defaultValue: 'Select All' }),
                deselectAll: t('removeFile.deselectAll', { defaultValue: 'Deselect All' }),
              }}
            />

            {/* Wipe Options (only when files selected) */}
            {selectedFiles.size > 0 && (
              <WipeOptions
                secureWipeEnabled={secureWipeEnabled}
                onToggleSecureWipe={setSecureWipeEnabled}
                panelStyle={panelStyle}
                labels={{
                  deletionOptions: t('removeFile.deletionOptions', { defaultValue: 'Deletion Options' }),
                  quickDelete: t('removeFile.quickDelete', { defaultValue: 'Quick Delete' }),
                  quickDeleteDesc: t('removeFile.quickDeleteDesc', { defaultValue: 'Remove from vault immediately' }),
                  secureWipe: t('removeFile.secureWipe', { defaultValue: 'Secure Wipe' }),
                  secureWipeLabel: t('removeFile.secureWipeLabel', { defaultValue: 'Overwrite data with 3-pass DOD standard' }),
                  irreversible: t('removeFile.irreversible', { defaultValue: 'This action is irreversible. Deleted files cannot be recovered.' }),
                }}
              />
            )}

            {/* Delete Button */}
            <Pressable
              accessibilityRole="button"
              style={[
                styles.deleteButton,
                selectedFiles.size === 0 && styles.deleteButtonDisabled,
              ]}
              onPress={handleDeleteClick}
              disabled={selectedFiles.size === 0}
            >
              <Feather name="trash-2" size={20} color="#fff" />
              <Text style={styles.deleteButtonText}>
                {t('removeFile.deleteSelected', { defaultValue: 'Delete Selected' })} ({selectedFiles.size})
              </Text>
            </Pressable>
          </>
        )}

        {/* Deletion History (always shown — starts empty, populated by real deletions) */}
        <DeleteHistory
          history={deleteHistory}
          panelStyle={panelStyle}
          labels={{
            deletionHistory: t('removeFile.deletionHistory', { defaultValue: 'Deletion History' }),
            secureWipeLabel: t('removeFile.secureWipe3Pass', { defaultValue: 'Secure Wipe (3-pass)' }),
            quickDelete: t('removeFile.quickDeleteMethod', { defaultValue: 'Quick Delete' }),
            noHistory: t('removeFile.noHistory', { defaultValue: 'No deletion history yet' }),
          }}
        />
      </View>

      {/* Vault Unlock Modal */}
      <VaultUnlockModal
        visible={unlock.showUnlockModal}
        vaultName={activeVault?.name ?? 'Vault'}
        password={unlock.unlockPassword}
        onPasswordChange={unlock.setUnlockPassword}
        error={unlock.unlockError}
        onErrorClear={() => unlock.setUnlockPassword(unlock.unlockPassword)}
        isUnlocking={unlock.isUnlocking}
        onUnlock={unlock.handleVaultUnlock}
        onClose={unlock.dismissUnlockModal}
      />

      <InAppModal config={modal} />
    </ShellLayout>
  );
}

export default withErrorBoundary(RemoveFileScreen);

const styles = StyleSheet.create({
  contentArea: {
    paddingRight: 10,
  },
  headerSection: {
    marginBottom: dashboardSpacing.lg,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  screenSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  panel: {
    backgroundColor: 'transparent',
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 16,
  },
  emptyStateText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    borderRadius: 10,
    marginBottom: dashboardSpacing.lg,
    ...webOnly({ cursor: 'pointer' }),
  },
  deleteButtonDisabled: {
    opacity: 0.4,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
