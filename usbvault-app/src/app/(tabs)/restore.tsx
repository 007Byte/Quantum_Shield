import { ScrollView, StyleSheet, Text, View, Pressable, Switch } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardLayout, dashboardSpacing, dashboardColors } from '@/components/dashboard2/styles';
import { useLanguage } from '@/hooks/useLanguage';

interface Backup {
  id: string;
  date: string;
  size: string;
  fileCount: number;
  integrity: 'verified' | 'unverified';
  timestamp: number;
}

function RestoreScreen() {
  const { t } = useLanguage();
  const [backups] = useState<Backup[]>([]);
  const [fullRestore, setFullRestore] = useState(true);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [verifyBeforeRestore, setVerifyBeforeRestore] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [selectedBackupId, setSelectedBackupId] = useState<string | null>(null);
  const { modal } = useInAppModal();

  const handleRestoreStart = () => {
    if (selectedBackupId) {
      setIsRestoring(true);
      setRestoreProgress(0);
      simulateRestoreProgress();
    }
  };

  const simulateRestoreProgress = () => {
    const interval = setInterval(() => {
      setRestoreProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsRestoring(false);
            setRestoreProgress(0);
          }, 2000);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 500);
  };

  const handlePreview = (backupId: string) => {
    setSelectedBackupId(backupId);
  };

  const currentBackup = backups.find(b => b.id === selectedBackupId);
  const totalFiles = currentBackup ? currentBackup.fileCount : 267;
  const restoredFiles = Math.floor((restoreProgress / 100) * totalFiles);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentArea}>
              {/* Header Section */}
              <View style={styles.headerSection}>
                <Text style={styles.pageTitle} accessibilityRole="header">
                  {t('restore.pageTitle')}
                </Text>
                <Text style={styles.pageSubtitle}>{t('restore.pageSubtitle')}</Text>
              </View>

              {/* Available Backups List */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('restore.availableBackups')}
                </Text>
                <View style={styles.backupsList}>
                  {backups.length === 0 ? (
                    <View style={styles.backupItem}>
                      <View style={{ alignItems: 'center', paddingVertical: 24, width: '100%' }}>
                        <Feather name="archive" size={32} color={dashboardColors.textSecondary} />
                        <Text style={[styles.metaText, { marginTop: 12, fontSize: 15 }]}>
                          No backup history found
                        </Text>
                      </View>
                    </View>
                  ) : (
                    backups.map(backup => (
                      <View
                        key={backup.id}
                        style={[
                          styles.backupItem,
                          selectedBackupId === backup.id && styles.backupItemSelected,
                        ]}
                      >
                        <Pressable
                          accessibilityRole="button"
                          style={styles.backupItemContent}
                          onPress={() => setSelectedBackupId(backup.id)}
                        >
                          <View style={styles.backupInfo}>
                            <View style={styles.backupHeader}>
                              <Feather name="archive" size={18} color="#10B981" />
                              <Text style={styles.backupDate}>{backup.date}</Text>
                            </View>
                            <View style={styles.backupMeta}>
                              <View style={styles.metaItem}>
                                <Feather
                                  name="database"
                                  size={14}
                                  color={dashboardColors.textSecondary}
                                />
                                <Text style={styles.metaText}>{backup.size}</Text>
                              </View>
                              <View style={styles.metaItem}>
                                <Feather
                                  name="file"
                                  size={14}
                                  color={dashboardColors.textSecondary}
                                />
                                <Text style={styles.metaText}>{backup.fileCount} files</Text>
                              </View>
                              <View
                                style={[
                                  styles.integrityBadge,
                                  {
                                    backgroundColor:
                                      backup.integrity === 'verified'
                                        ? 'rgba(34, 197, 94, 0.2)'
                                        : 'rgba(168, 85, 247, 0.2)',
                                  },
                                ]}
                              >
                                <Feather
                                  name={
                                    backup.integrity === 'verified'
                                      ? 'check-circle'
                                      : 'alert-circle'
                                  }
                                  size={12}
                                  color={backup.integrity === 'verified' ? '#22c55e' : '#a855f7'}
                                />
                                <Text
                                  style={[
                                    styles.integrityText,
                                    {
                                      color:
                                        backup.integrity === 'verified' ? '#22c55e' : '#a855f7',
                                    },
                                  ]}
                                >
                                  {backup.integrity === 'verified'
                                    ? t('restore.verified')
                                    : t('restore.unverified')}
                                </Text>
                              </View>
                            </View>
                          </View>
                        </Pressable>
                        <View style={styles.backupActions}>
                          <Pressable
                            accessibilityRole="button"
                            style={[styles.button, styles.secondaryButton]}
                            onPress={() => handlePreview(backup.id)}
                          >
                            <Feather name="eye" size={14} color={dashboardColors.textPrimary} />
                            <Text style={styles.secondaryButtonText}>{t('restore.preview')}</Text>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            style={[styles.button, styles.primaryButton]}
                            onPress={() => {
                              setSelectedBackupId(backup.id);
                              handleRestoreStart();
                            }}
                            disabled={isRestoring}
                          >
                            <Feather name="download" size={14} color="#ffffff" />
                            <Text style={styles.primaryButtonText}>{t('restore.restore')}</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </View>

              {/* Restore Options Panel */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('restore.restoreOptions')}
                </Text>
                <View style={styles.optionsPanel}>
                  {/* Restore Type Toggle */}
                  <View style={styles.optionRow}>
                    <View style={styles.optionLabel}>
                      <Text style={styles.optionTitle}>{t('restore.restoreType')}</Text>
                      <Text style={styles.optionDescription}>{t('restore.chooseRestoreType')}</Text>
                    </View>
                    <View style={styles.toggleGroup}>
                      <Pressable
                        accessibilityRole="button"
                        style={[styles.toggleButton, fullRestore && styles.toggleButtonActive]}
                        onPress={() => setFullRestore(true)}
                      >
                        <Text
                          style={[
                            styles.toggleButtonText,
                            fullRestore && styles.toggleButtonTextActive,
                          ]}
                        >
                          {t('restore.fullRestore')}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        style={[styles.toggleButton, !fullRestore && styles.toggleButtonActive]}
                        onPress={() => setFullRestore(false)}
                      >
                        <Text
                          style={[
                            styles.toggleButtonText,
                            !fullRestore && styles.toggleButtonTextActive,
                          ]}
                        >
                          {t('restore.selectiveRestore')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Overwrite Existing Files Checkbox */}
                  <View style={styles.checkboxRow}>
                    <View style={styles.optionLabel}>
                      <Text style={styles.optionTitle}>{t('restore.overwriteFiles')}</Text>
                      <Text style={styles.optionDescription}>
                        {t('restore.replaceFilesDescription')}
                      </Text>
                    </View>
                    <Switch
                      value={overwriteExisting}
                      onValueChange={setOverwriteExisting}
                      trackColor={{
                        false: 'rgba(255, 255, 255, 0.1)',
                        true: 'rgba(34, 197, 94, 0.4)',
                      }}
                      thumbColor={overwriteExisting ? '#22c55e' : '#666666'}
                    />
                  </View>

                  {/* Warning Banner */}
                  <View
                    style={[styles.warningBanner, { backgroundColor: 'rgba(217, 119, 6, 0.15)' }]}
                  >
                    <Feather name="alert-triangle" size={16} color="#f59e0b" />
                    <View style={styles.warningContent}>
                      <Text style={styles.warningTitle}>{t('restore.warning')}</Text>
                      <Text style={styles.warningText}>{t('restore.restoringWarning')}</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Integrity Verification Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('restore.integrityVerification')}
                </Text>
                <View style={styles.verificationPanel}>
                  <View style={styles.checkboxRow}>
                    <View style={styles.optionLabel}>
                      <Text style={styles.optionTitle}>{t('restore.verifyBeforeRestore')}</Text>
                      <Text style={styles.optionDescription}>{t('restore.verifyRecommended')}</Text>
                    </View>
                    <Switch
                      value={verifyBeforeRestore}
                      onValueChange={setVerifyBeforeRestore}
                      trackColor={{
                        false: 'rgba(255, 255, 255, 0.1)',
                        true: 'rgba(34, 197, 94, 0.4)',
                      }}
                      thumbColor={verifyBeforeRestore ? '#22c55e' : '#666666'}
                    />
                  </View>

                  {verifyBeforeRestore && (
                    <View style={styles.checksumInfo}>
                      <Text style={styles.checksumLabel}>{t('restore.checksumInformation')}</Text>
                      <View style={styles.checksumRow}>
                        <Text style={styles.checksumType}>SHA-256:</Text>
                        <Text style={styles.checksumValue}>a1b2c3d4e5f6...7x8y9z0a</Text>
                      </View>
                      <View style={styles.checksumRow}>
                        <Text style={styles.checksumType}>File Count:</Text>
                        <Text style={styles.checksumValue}>
                          {currentBackup?.fileCount || 'Select backup'}
                        </Text>
                      </View>
                      <View style={styles.checksumRow}>
                        <Text style={styles.checksumType}>Total Size:</Text>
                        <Text style={styles.checksumValue}>
                          {currentBackup?.size || 'Select backup'}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Browse for Backup Button */}
              <View style={styles.section}>
                <Pressable style={[styles.button, styles.secondaryButton]}>
                  <Feather name="folder" size={16} color={dashboardColors.textPrimary} />
                  <Text style={styles.secondaryButtonText}>{t('restore.importBackupFile')}</Text>
                </Pressable>
              </View>

              {/* Restore Progress Area */}
              {isRestoring && (
                <View style={styles.section}>
                  <View style={styles.progressPanel}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.progressTitle}>{t('restore.restoringBackup')}</Text>
                      <Text style={styles.progressPercentage}>{Math.floor(restoreProgress)}%</Text>
                    </View>
                    <View style={styles.progressBarContainer}>
                      <View style={[styles.progressBar, { width: `${restoreProgress}%` }]} />
                    </View>
                    <View style={styles.progressStatus}>
                      <Feather name="activity" size={14} color="#10B981" />
                      <Text style={styles.progressStatusText}>
                        Restoring {restoredFiles} of {totalFiles} files...
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Preview Modal */}
      <InAppModal config={modal} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    ...webOnly({ overflow: 'hidden' }),
  },
  pageScroll: {
    flex: 1,
    width: '100%',
    ...webOnly({ overflowY: 'auto' }),
  },
  pageContent: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    alignItems: 'center' as const,
  },
  shell: {
    width: '100%',
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: 'center' as const,
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    borderRadius: dashboardLayout.radius2Xl,
    backgroundColor: 'rgba(8,5,20,0.38)',
    ...webOnly({
      overflow: 'hidden',
      background:
        'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(217,70,239,0.55)',
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  contentArea: {
    paddingRight: 10,
  },
  headerSection: {
    marginBottom: dashboardSpacing.md,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 16,
    color: dashboardColors.textSecondary,
    fontWeight: '500',
  },
  section: {
    gap: dashboardSpacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  backupsList: {
    gap: dashboardSpacing.md,
  },
  backupItem: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 12,
    padding: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: dashboardSpacing.lg,
  },
  backupItemSelected: {
    borderColor: 'rgba(34, 197, 94, 0.3)',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  backupItemContent: {
    flex: 1,
  },
  backupInfo: {
    gap: dashboardSpacing.sm,
  },
  backupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  backupDate: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  backupMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  integrityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  integrityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  backupActions: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
  },
  optionsPanel: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 12,
    padding: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: dashboardSpacing.lg,
  },
  optionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: dashboardSpacing.lg,
  },
  optionLabel: {
    flex: 1,
    gap: 6,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  optionDescription: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  toggleButtonActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  toggleButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
  },
  toggleButtonTextActive: {
    color: '#22c55e',
  },
  checkboxRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: dashboardSpacing.lg,
  },
  warningBanner: {
    flexDirection: 'row',
    gap: dashboardSpacing.md,
    padding: dashboardSpacing.lg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.2)',
    alignItems: 'flex-start',
  },
  warningContent: {
    flex: 1,
    gap: 4,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#f59e0b',
  },
  warningText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  verificationPanel: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 12,
    padding: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: dashboardSpacing.lg,
  },
  checksumInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    padding: dashboardSpacing.lg,
    gap: dashboardSpacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  checksumLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checksumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  checksumType: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
  },
  checksumValue: {
    fontSize: 13,
    color: '#10B981',
    fontFamily: 'monospace',
  },
  button: {
    borderRadius: 8,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
  },
  primaryButton: {
    backgroundColor: '#10B981',
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
  },
  progressPanel: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 12,
    padding: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: dashboardSpacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  progressPercentage: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  progressStatusText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  modalContent: {
    gap: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
  },
  modalSection: {
    gap: dashboardSpacing.md,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInfoGrid: {
    gap: dashboardSpacing.md,
  },
  modalInfoItem: {
    gap: 4,
  },
  modalInfoLabel: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalInfoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  contentsPreview: {
    gap: dashboardSpacing.md,
  },
  contentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
  },
  contentItemText: {
    flex: 1,
    gap: 2,
  },
  contentItemName: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  contentItemCount: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
});

export default withErrorBoundary(RestoreScreen, 'Restore');
