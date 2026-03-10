import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable, TextInput } from 'react-native';
import { useCallback, useEffect, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import {
  dashboardLayout,
  dashboardSpacing,
  webOnlyTransition,
} from '@/components/dashboard2/styles';
import { usbService, USBDrive } from '@/services/usbService';

const textPrimary = '#F5F3FF';
const textSecondary = '#B8B3D1';
const cyan = '#22D3EE';
const purple = '#8B5CF6';
// green available for future use
const danger = '#EF4444';

type WipeMethod = 'quick' | 'secure';

// No mock data — drives are loaded from the real USB service

export default function ResetUSBScreen() {
  const { modal, showConfirm, showSuccess, showError } = useInAppModal();

  const [drives, setDrives] = useState<USBDrive[]>([]);
  const [loadingDrives, setLoadingDrives] = useState(true);
  const [driveError, setDriveError] = useState<string | null>(null);

  const [selectedDrive, setSelectedDrive] = useState<USBDrive | null>(null);
  const [wipeMethod, setWipeMethod] = useState<WipeMethod>('quick');
  const [passCount, setPassCount] = useState(1);
  const [confirmationText, setConfirmationText] = useState('');
  const [isWiping, setIsWiping] = useState(false);

  // ── Load drives ──────────────────────────────────────────────────────

  const loadDrives = useCallback(async () => {
    setLoadingDrives(true);
    setDriveError(null);
    try {
      const list = await usbService.listDrives();
      setDrives(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to detect USB drives';
      setDriveError(msg);
    } finally {
      setLoadingDrives(false);
    }
  }, []);

  useEffect(() => { loadDrives(); }, [loadDrives]);

  const confirmationMatch = selectedDrive && confirmationText === selectedDrive.name;

  const handleStartWipe = () => {
    if (!selectedDrive || !confirmationMatch) return;

    const message =
      wipeMethod === 'quick'
        ? `Quick erase will remove vault metadata and encryption keys from "${selectedDrive.name}". This action cannot be undone.`
        : `Secure wipe will overwrite "${selectedDrive.name}" with ${passCount} pass${passCount !== 1 ? 'es' : ''} of random data. This action cannot be undone.`;

    showConfirm('Confirm USB Reset', message, async () => {
      setIsWiping(true);
      try {
        await usbService.resetDrive({
          driveId: selectedDrive.id,
          wipeMethod,
          passes: passCount,
        });
        showSuccess('Reset Complete', 'USB drive has been successfully reset.');
        setSelectedDrive(null);
        setConfirmationText('');
        loadDrives();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Reset failed. Please try again.';
        showError('Reset Failed', msg);
      } finally {
        setIsWiping(false);
      }
    });
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentArea}>
            {/* Header with Desktop Only Badge */}
            <View style={styles.headerContainer}>
              <View>
                <Text style={styles.pageTitle}>Reset USB</Text>
                <Text style={styles.pageSubtitle}>
                  Wipe and reset a USB vault drive
                </Text>
              </View>
              <View style={styles.desktopBadge}>
                <Text style={styles.desktopBadgeText}>Desktop Only</Text>
              </View>
            </View>

            {/* Warning Banner */}
            <View style={styles.warningBanner}>
              <Feather
                name="alert-triangle"
                size={20}
                color={danger}
                style={styles.warningIcon}
              />
              <Text style={styles.warningText}>
                This action is irreversible. All data on the selected drive will
                be permanently destroyed.
              </Text>
            </View>

            {/* Select USB Drive Section */}
            <View style={styles.sectionContainer}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Select USB Drive</Text>
                <Pressable style={styles.refreshButton} onPress={loadDrives} disabled={loadingDrives}>
                  {loadingDrives
                    ? <ActivityIndicator size="small" color={cyan} />
                    : <Feather name="refresh-cw" size={16} color={cyan} />}
                </Pressable>
              </View>

              {loadingDrives ? (
                <View style={styles.emptyState}>
                  <ActivityIndicator size="large" color={cyan} />
                  <Text style={styles.emptyStateText}>Scanning for USB drives…</Text>
                </View>
              ) : driveError ? (
                <View style={styles.emptyState}>
                  <Feather name="alert-circle" size={24} color={danger} />
                  <Text style={[styles.emptyStateText, { color: danger }]}>{driveError}</Text>
                  <Pressable style={styles.retryButton} onPress={loadDrives}>
                    <Text style={styles.retryButtonText}>Try Again</Text>
                  </Pressable>
                </View>
              ) : drives.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="hard-drive" size={28} color={textSecondary} />
                  <Text style={styles.emptyStateText}>No USB drives detected</Text>
                  <Text style={styles.emptyStateHint}>Insert a drive and tap refresh</Text>
                </View>
              ) : (
                <View style={styles.driveList}>
                  {drives.map((drive) => (
                    <Pressable
                      key={drive.id}
                      style={[
                        styles.driveCard,
                        selectedDrive?.id === drive.id && styles.driveCardSelected,
                        !drive.available && styles.driveCardDisabled,
                      ]}
                      onPress={() => {
                        if (!drive.available) return;
                        setSelectedDrive(drive);
                        setConfirmationText('');
                      }}
                      disabled={!drive.available}
                    >
                      <View style={styles.radioContainer}>
                        <View style={[styles.radioOuter, !drive.available && styles.radioOuterDisabled]}>
                          {selectedDrive?.id === drive.id && (
                            <View style={styles.radioInner} />
                          )}
                        </View>
                      </View>
                      <View style={styles.driveInfo}>
                        <Text style={[styles.driveName, !drive.available && styles.driveNameDisabled]}>
                          {drive.name}
                        </Text>
                        <View style={styles.driveMetaRow}>
                          <Text style={styles.driveCapacity}>{drive.capacity}</Text>
                          {drive.hasVault && (
                            <View style={styles.driveBadgeVault}>
                              <Text style={styles.driveBadgeText}>Has Vault</Text>
                            </View>
                          )}
                          {!drive.available && (
                            <View style={styles.driveBadgeInUse}>
                              <Text style={styles.driveBadgeText}>In Use</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {/* Wipe Method Section */}
            {selectedDrive && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Wipe Method</Text>

                {/* Quick Erase Card */}
                <Pressable
                  style={[
                    styles.methodCard,
                    wipeMethod === 'quick' && styles.methodCardSelected,
                  ]}
                  onPress={() => setWipeMethod('quick')}
                >
                  <View style={styles.methodHeader}>
                    <Text style={styles.methodTitle}>Quick Erase</Text>
                  </View>
                  <Text style={styles.methodDescription}>
                    Removes vault metadata and encryption keys. Fast but data
                    may be recoverable.
                  </Text>
                </Pressable>

                {/* Secure Wipe Card */}
                <Pressable
                  style={[
                    styles.methodCard,
                    wipeMethod === 'secure' && styles.methodCardSelected,
                  ]}
                  onPress={() => setWipeMethod('secure')}
                >
                  <View style={styles.methodHeader}>
                    <Text style={styles.methodTitle}>Secure Wipe</Text>
                  </View>
                  <Text style={styles.methodDescription}>
                    Overwrites entire drive with random data. Select number of
                    passes:
                  </Text>

                  {wipeMethod === 'secure' && (
                    <View style={styles.passPillsContainer}>
                      {[1, 3, 7].map((passes) => (
                        <Pressable
                          key={passes}
                          style={[
                            styles.passPill,
                            passCount === passes && styles.passPillSelected,
                          ]}
                          onPress={() => setPassCount(passes)}
                        >
                          <Text
                            style={[
                              styles.passPillText,
                              passCount === passes &&
                                styles.passPillTextSelected,
                            ]}
                          >
                            {passes}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </Pressable>
              </View>
            )}

            {/* Confirmation Section */}
            {selectedDrive && (
              <View style={styles.sectionContainer}>
                <Text style={styles.sectionTitle}>Confirmation</Text>
                <Text style={styles.confirmationLabel}>
                  Type the vault name to confirm
                </Text>
                <TextInput
                  style={styles.confirmationInput}
                  placeholder={`Type "${selectedDrive.name}" to confirm`}
                  placeholderTextColor={textSecondary}
                  value={confirmationText}
                  onChangeText={setConfirmationText}
                  editable={!isWiping}
                />
                {confirmationText && !confirmationMatch && (
                  <Text style={styles.mismatchWarning}>
                    Vault name does not match
                  </Text>
                )}
              </View>
            )}

            {/* Reset Button */}
            {selectedDrive && (
              <Pressable
                style={[
                  styles.resetButton,
                  (!confirmationMatch || isWiping) && styles.resetButtonDisabled,
                ]}
                onPress={handleStartWipe}
                disabled={!confirmationMatch || isWiping}
              >
                {isWiping ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Feather
                      name="trash-2"
                      size={18}
                      color="#FFFFFF"
                      style={styles.buttonIcon}
                    />
                    <Text style={styles.resetButtonText}>Reset USB Drive</Text>
                  </>
                )}
              </Pressable>
            )}
            </View>
          </View>
        </View>
      </ScrollView>
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
    alignItems: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: 'center',
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    borderRadius: dashboardLayout.radius2Xl,
    backgroundColor: 'rgba(8,5,20,0.38)',
    ...webOnly({
      overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow: '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute',
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
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: dashboardSpacing.lg,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: textPrimary,
    marginBottom: dashboardSpacing.xs,
  },
  pageSubtitle: {
    fontSize: 14,
    color: textSecondary,
  },
  desktopBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 12,
    paddingVertical: dashboardSpacing.xs,
    paddingHorizontal: dashboardSpacing.sm,
  },
  desktopBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: purple,
  },
  warningBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: danger,
    padding: dashboardSpacing.md,
    marginBottom: dashboardSpacing.lg,
    alignItems: 'center',
  },
  warningIcon: {
    marginRight: dashboardSpacing.md,
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: textPrimary,
    lineHeight: 18,
  },
  sectionContainer: {
    marginBottom: dashboardSpacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: dashboardSpacing.md,
  },
  driveList: {
    gap: dashboardSpacing.sm,
  },
  driveCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
    padding: dashboardSpacing.md,
    alignItems: 'center',
    ...webOnlyTransition,
  },
  driveCardSelected: {
    borderColor: cyan,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  radioContainer: {
    marginRight: dashboardSpacing.md,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: textSecondary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: cyan,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.md,
  },
  refreshButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: dashboardSpacing.xl,
    gap: dashboardSpacing.sm,
  },
  emptyStateText: {
    fontSize: 14,
    color: textSecondary,
    textAlign: 'center',
  },
  emptyStateHint: {
    fontSize: 12,
    color: 'rgba(184,179,209,0.6)',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: dashboardSpacing.xs,
    paddingVertical: dashboardSpacing.xs,
    paddingHorizontal: dashboardSpacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: cyan,
  },
  retryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: cyan,
  },
  driveCardDisabled: {
    opacity: 0.45,
  },
  radioOuterDisabled: {
    borderColor: 'rgba(184,179,209,0.3)',
  },
  driveInfo: {
    flex: 1,
    flexDirection: 'column',
    gap: 4,
  },
  driveName: {
    fontSize: 14,
    fontWeight: '600',
    color: textPrimary,
  },
  driveNameDisabled: {
    color: textSecondary,
  },
  driveMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  driveCapacity: {
    fontSize: 12,
    color: textSecondary,
  },
  driveBadgeVault: {
    backgroundColor: 'rgba(139, 92, 246, 0.25)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  driveBadgeInUse: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  driveBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: textSecondary,
  },
  methodCard: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
    padding: dashboardSpacing.md,
    marginBottom: dashboardSpacing.md,
    ...webOnlyTransition,
  },
  methodCardSelected: {
    borderColor: cyan,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  methodHeader: {
    marginBottom: dashboardSpacing.sm,
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: textPrimary,
  },
  methodDescription: {
    fontSize: 13,
    color: textSecondary,
    lineHeight: 18,
  },
  passPillsContainer: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    marginTop: dashboardSpacing.md,
  },
  passPill: {
    paddingVertical: dashboardSpacing.xs,
    paddingHorizontal: dashboardSpacing.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)',
    backgroundColor: 'rgba(8, 5, 20, 0.5)',
    ...webOnlyTransition,
  },
  passPillSelected: {
    backgroundColor: cyan,
    borderColor: cyan,
  },
  passPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: cyan,
  },
  passPillTextSelected: {
    color: '#000000',
  },
  confirmationLabel: {
    fontSize: 13,
    color: textSecondary,
    marginBottom: dashboardSpacing.sm,
  },
  confirmationInput: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    color: textPrimary,
    fontSize: 14,
    ...webOnlyTransition,
  },
  mismatchWarning: {
    fontSize: 12,
    color: danger,
    marginTop: dashboardSpacing.xs,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: cyan,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: textSecondary,
    marginTop: dashboardSpacing.sm,
    textAlign: 'center',
  },
  resetButton: {
    flexDirection: 'row',
    backgroundColor: danger,
    borderRadius: 12,
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    ...webOnlyTransition,
  },
  resetButtonDisabled: {
    opacity: 0.5,
  },
  buttonIcon: {
    marginRight: dashboardSpacing.xs,
  },
  resetButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
