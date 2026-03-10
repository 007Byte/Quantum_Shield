import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardLayout, dashboardSpacing, webOnlyTransition } from '@/components/dashboard2/styles';

type BackupFrequency = 'daily' | 'weekly' | 'monthly';
type BackupStatus = 'success' | 'failed';

interface BackupHistoryItem {
  id: string;
  date: string;
  size: string;
  status: BackupStatus;
  duration: string;
}

const BackupScreen = () => {
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [frequency, setFrequency] = useState<BackupFrequency>('daily');
  const { modal, showConfirm } = useInAppModal();

  const backupHistory: BackupHistoryItem[] = [
    {
      id: '1',
      date: 'March 7, 2026 at 2:15 PM',
      size: '4.1 GB',
      status: 'success',
      duration: '2m 34s',
    },
    {
      id: '2',
      date: 'March 5, 2026 at 3:00 AM',
      size: '4.0 GB',
      status: 'success',
      duration: '2m 28s',
    },
    {
      id: '3',
      date: 'March 3, 2026 at 3:00 AM',
      size: '3.9 GB',
      status: 'success',
      duration: '2m 15s',
    },
    {
      id: '4',
      date: 'February 28, 2026 at 3:00 AM',
      size: '3.8 GB',
      status: 'failed',
      duration: '—',
    },
    {
      id: '5',
      date: 'February 25, 2026 at 3:00 AM',
      size: '3.7 GB',
      status: 'success',
      duration: '2m 12s',
    },
  ];

  const currentBackupPath = '/Volumes/QAV/backups/enterprise_vault_2026';

  const frequencyOptions: { label: string; value: BackupFrequency }[] = [
    { label: 'Daily', value: 'daily' },
    { label: 'Weekly', value: 'weekly' },
    { label: 'Monthly', value: 'monthly' },
  ];

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />

          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentArea}>
              {/* Header Section */}
              <View style={styles.headerSection}>
                  <Text style={styles.pageTitle}>Backup</Text>
                  <Text style={styles.pageSubtitle}>
                    Protect your vault with encrypted backups
                  </Text>
                </View>

                {/* Create Backup Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.createBackupButton,
                    pressed && styles.createBackupButtonPressed,
                  ]}
                  onPress={() => showConfirm('Backup', 'Creating backup now...', () => {})}
                >
                  <Feather name="save" size={18} color="#000" />
                  <Text style={styles.createBackupButtonText}>Create Backup Now</Text>
                </Pressable>

                {/* Last Backup Status Card */}
                <View style={styles.lastBackupCard}>
                  <View style={styles.lastBackupHeader}>
                    <View style={styles.lastBackupTitleRow}>
                      <Feather name="check-circle" size={20} color="#10B981" />
                      <Text style={styles.lastBackupTitle}>Last backup: March 7, 2026 at 2:15 PM</Text>
                    </View>
                  </View>

                  <View style={styles.lastBackupStats}>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Size</Text>
                      <Text style={styles.statValue}>4.1 GB</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Duration</Text>
                      <Text style={styles.statValue}>2m 34s</Text>
                    </View>
                  </View>
                </View>

                {/* Scheduled Backups Section */}
                <View style={styles.scheduledSection}>
                  <Text style={styles.sectionTitle}>Scheduled Backups</Text>

                  {/* Auto-Backup Toggle */}
                  <View style={styles.autoBackupToggle}>
                    <View style={styles.toggleLabelSection}>
                      <Feather name="clock" size={18} color="#22D3EE" />
                      <Text style={styles.toggleLabel}>Automatic backups</Text>
                    </View>
                    <Pressable
                      style={[
                        styles.toggleSwitch,
                        autoBackupEnabled && styles.toggleSwitchActive,
                      ]}
                      onPress={() => setAutoBackupEnabled(!autoBackupEnabled)}
                    >
                      <View
                        style={[
                          styles.toggleThumb,
                          autoBackupEnabled && styles.toggleThumbActive,
                        ]}
                      />
                    </Pressable>
                  </View>

                  {/* Frequency Selector */}
                  {autoBackupEnabled && (
                    <>
                      <View style={styles.frequencySection}>
                        <Text style={styles.frequencyLabel}>Frequency</Text>
                        <View style={styles.frequencyPills}>
                          {frequencyOptions.map((option) => (
                            <Pressable
                              key={option.value}
                              style={[
                                styles.frequencyPill,
                                frequency === option.value && styles.frequencyPillActive,
                              ]}
                              onPress={() => setFrequency(option.value)}
                            >
                              <Text
                                style={[
                                  styles.frequencyPillText,
                                  frequency === option.value && styles.frequencyPillTextActive,
                                ]}
                              >
                                {option.label}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>

                      {/* Next Backup Time */}
                      <View style={styles.nextBackupInfo}>
                        <Feather name="calendar" size={16} color="#22D3EE" />
                        <Text style={styles.nextBackupText}>Next backup: Tomorrow at 3:00 AM</Text>
                      </View>
                    </>
                  )}
                </View>

                {/* Backup History Section */}
                <View style={styles.historySection}>
                  <Text style={styles.sectionTitle}>Backup History</Text>

                  {backupHistory.map((item) => (
                    <View key={item.id} style={styles.historyRow}>
                      <View style={styles.historyRowContent}>
                        <View style={styles.historyRowMain}>
                          <View style={styles.historyInfo}>
                            <View style={styles.historyDateRow}>
                              <Feather
                                name={item.status === 'success' ? 'check-circle' : 'alert-circle'}
                                size={16}
                                color={item.status === 'success' ? '#10B981' : '#EF4444'}
                              />
                              <Text style={styles.historyDate}>{item.date}</Text>
                            </View>
                            <View style={styles.historyMetaRow}>
                              <Text style={styles.historyMeta}>{item.size}</Text>
                              <Text style={styles.historyMetaDot}>•</Text>
                              <Text style={styles.historyMeta}>{item.duration}</Text>
                            </View>
                          </View>
                        </View>

                        <Pressable
                          style={({ pressed }) => [
                            styles.restoreButton,
                            pressed && styles.restoreButtonPressed,
                          ]}
                          onPress={() => showConfirm('Restore', 'Restoring from backup...', () => {})}
                        >
                          <Feather name="download" size={16} color="#22D3EE" />
                          <Text style={styles.restoreButtonText}>Restore</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Backup Location Card */}
                <View style={styles.locationCard}>
                  <View style={styles.locationHeader}>
                    <Feather name="folder" size={20} color="#8B5CF6" />
                    <View style={styles.locationInfo}>
                      <Text style={styles.locationTitle}>Backup Location</Text>
                      <Text style={styles.locationPath} numberOfLines={1}>
                        {currentBackupPath}
                      </Text>
                    </View>
                  </View>

                  <Pressable
                    style={({ pressed }) => [
                      styles.changeLocationButton,
                      pressed && styles.changeLocationButtonPressed,
                    ]}
                    onPress={() => showConfirm('Change Location', 'Select new backup location...', () => {})}
                  >
                    <Text style={styles.changeLocationButtonText}>Change Location</Text>
                    <Feather name="chevron-right" size={16} color="#22D3EE" />
                  </Pressable>
                </View>

                {/* Bottom Spacing */}
                <View style={styles.bottomSpacing} />
            </View>
          </View>
        </View>
      </ScrollView>

      <InAppModal config={modal} />
    </View>
  );
};

const styles = StyleSheet.create({
  // Layout
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

  // Header
  headerSection: {
    marginBottom: dashboardSpacing.xl,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F5F3FF',
    marginBottom: dashboardSpacing.sm,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 14,
    color: '#B8B3D1',
    lineHeight: 20,
  },

  // Create Backup Button
  createBackupButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.xl,
    ...webOnlyTransition,
  },
  createBackupButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  createBackupButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },

  // Last Backup Card
  lastBackupCard: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 16,
    padding: dashboardSpacing.lg,
    marginBottom: dashboardSpacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
    ...webOnlyTransition,
  },
  lastBackupHeader: {
    marginBottom: dashboardSpacing.md,
  },
  lastBackupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  lastBackupTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F5F3FF',
    flex: 1,
  },
  lastBackupStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    gap: dashboardSpacing.xs,
  },
  statLabel: {
    fontSize: 12,
    color: '#B8B3D1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F5F3FF',
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(184, 179, 209, 0.2)',
    marginHorizontal: dashboardSpacing.md,
  },

  // Scheduled Backups Section
  scheduledSection: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 16,
    padding: dashboardSpacing.lg,
    marginBottom: dashboardSpacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F5F3FF',
    marginBottom: dashboardSpacing.lg,
  },

  // Auto-Backup Toggle
  autoBackupToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.lg,
    paddingBottom: dashboardSpacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184, 179, 209, 0.1)',
  },
  toggleLabelSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F5F3FF',
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(184, 179, 209, 0.2)',
    justifyContent: 'center',
    paddingHorizontal: 2,
    ...webOnlyTransition,
  },
  toggleSwitchActive: {
    backgroundColor: '#22D3EE',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#B8B3D1',
    ...webOnlyTransition,
  },
  toggleThumbActive: {
    backgroundColor: '#000',
    alignSelf: 'flex-end',
  },

  // Frequency Section
  frequencySection: {
    marginBottom: dashboardSpacing.lg,
  },
  frequencyLabel: {
    fontSize: 13,
    color: '#B8B3D1',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: dashboardSpacing.sm,
  },
  frequencyPills: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
  },
  frequencyPill: {
    paddingVertical: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    borderRadius: 8,
    backgroundColor: 'rgba(184, 179, 209, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(184, 179, 209, 0.2)',
    ...webOnlyTransition,
  },
  frequencyPillActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  frequencyPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B8B3D1',
  },
  frequencyPillTextActive: {
    color: '#F5F3FF',
  },

  // Next Backup Info
  nextBackupInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    paddingTop: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    backgroundColor: 'rgba(34, 211, 238, 0.05)',
    borderRadius: 8,
  },
  nextBackupText: {
    fontSize: 14,
    color: '#22D3EE',
    fontWeight: '500',
  },

  // History Section
  historySection: {
    marginBottom: dashboardSpacing.xl,
  },
  historyRow: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 12,
    padding: dashboardSpacing.md,
    marginBottom: dashboardSpacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
    ...webOnlyTransition,
  },
  historyRowContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: dashboardSpacing.md,
  },
  historyRowMain: {
    flex: 1,
    minWidth: 0,
  },
  historyInfo: {
    gap: dashboardSpacing.xs,
  },
  historyDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  historyDate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F5F3FF',
  },
  historyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.xs,
  },
  historyMeta: {
    fontSize: 12,
    color: '#B8B3D1',
  },
  historyMetaDot: {
    color: '#B8B3D1',
    marginHorizontal: dashboardSpacing.xs,
  },

  // Restore Button
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.xs,
    paddingVertical: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.2)',
    ...webOnlyTransition,
  },
  restoreButtonPressed: {
    backgroundColor: 'rgba(34, 211, 238, 0.2)',
  },
  restoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22D3EE',
  },

  // Location Card
  locationCard: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 16,
    padding: dashboardSpacing.lg,
    marginBottom: dashboardSpacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dashboardSpacing.md,
    marginBottom: dashboardSpacing.lg,
  },
  locationInfo: {
    flex: 1,
    gap: dashboardSpacing.xs,
  },
  locationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F5F3FF',
  },
  locationPath: {
    fontSize: 13,
    color: '#B8B3D1',
    fontFamily: 'monospace',
  },

  // Change Location Button
  changeLocationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    ...webOnlyTransition,
  },
  changeLocationButtonPressed: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
  },
  changeLocationButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8B5CF6',
  },

  // Bottom Spacing
  bottomSpacing: {
    height: dashboardSpacing.xl,
  },

  // Modal
  modalContent: {
    backgroundColor: 'rgba(8, 5, 20, 0.95)',
    borderRadius: 16,
    padding: dashboardSpacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.2)',
    gap: dashboardSpacing.lg,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F5F3FF',
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    color: '#B8B3D1',
    textAlign: 'center',
    lineHeight: 20,
  },
  modalButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    ...webOnlyTransition,
  },
  modalButtonPressed: {
    opacity: 0.9,
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
});

export default BackupScreen;
