import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardSpacing, dashboardLayout } from '@/components/dashboard2/styles';

interface ScanResults {
  count: number;
  artifacts: string[];
}

const colors = {
  textPrimary: '#F5F3FF',
  textSecondary: '#B8B3D1',
  cyan: '#22D3EE',
  purple: '#8B5CF6',
  green: '#10B981',
  danger: '#EF4444',
  warning: '#EAB308',
};

const ZeroTraceScreen = () => {
  const [ghostModeEnabled, setGhostModeEnabled] = useState(false);
  const [disableLogging, setDisableLogging] = useState(false);
  const [clearClipboard, setClearClipboard] = useState(false);
  const [noRecentFiles, setNoRecentFiles] = useState(false);
  const [onFailedLogin, setOnFailedLogin] = useState(false);
  const [onTamper, setOnTamper] = useState(false);
  const [onDuressPassword, setOnDuressPassword] = useState(false);
  const [lastScanResults, setLastScanResults] = useState<ScanResults | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  const { modal, showConfirm, showSuccess } = useInAppModal();

  const handleRunScan = () => {
    setScanLoading(true);
    setTimeout(() => {
      setLastScanResults({
        count: 3,
        artifacts: [
          'Clipboard remnant (30 bytes)',
          'Temp file in system directory',
          'Registry entry in Windows',
        ],
      });
      setScanLoading(false);
      showSuccess('Scan Complete', 'Found 3 artifacts on your system');
    }, 2000);
  };

  const handleCleanAll = () => {
    showConfirm(
      'Clean All Traces?',
      'This will permanently delete all detected artifacts. This action cannot be undone.',
      () => {
        setLastScanResults(null);
        showSuccess('Traces Cleaned', 'All artifacts have been successfully removed');
      }
    );
  };

  const handleGhostModeToggle = () => {
    if (!ghostModeEnabled) {
      showConfirm(
        'Enable Ghost Mode?',
        'When enabled, no logs, history, or traces of vault activity will be recorded.',
        () => setGhostModeEnabled(true)
      );
    } else {
      setGhostModeEnabled(false);
    }
  };

  const handleEditDuressPassword = () => {
    showConfirm(
      'Edit Duress Password',
      'Set a password that triggers data self-destruction when entered.',
      () => {
        showSuccess('Duress Password', 'Duress password has been updated');
      }
    );
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
              <View style={styles.pageHeader}>
                <Text style={styles.pageTitle}>Zero-Trace</Text>
                <Text style={styles.pageSubtitle}>
                  Ghost mode, self-destruct triggers, and forensic scanning
                </Text>
              </View>

                {/* Ghost Mode Card */}
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleRow}>
                      <Feather name="eye-off" size={20} color={colors.cyan} />
                      <Text style={styles.cardTitle}>Ghost Mode</Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      {
                        backgroundColor: ghostModeEnabled ? `${colors.green}20` : 'rgba(184, 179, 209, 0.1)',
                        borderColor: ghostModeEnabled ? colors.green : colors.textSecondary,
                      }
                    ]}>
                      <Text style={styles.statusBadgeText}>
                        {ghostModeEnabled ? 'ACTIVE' : 'INACTIVE'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.cardDescription}>
                    When enabled, no logs, history, or traces of vault activity are recorded
                  </Text>

                  <Pressable
                    style={styles.toggleContainer}
                    onPress={handleGhostModeToggle}
                  >
                    <Text style={styles.toggleLabel}>Ghost Mode</Text>
                    <View style={[
                      styles.toggleBase,
                      {
                        backgroundColor: ghostModeEnabled ? colors.cyan : 'rgba(184, 179, 209, 0.2)',
                      }
                    ]}>
                      <View style={[
                        styles.toggleCircle,
                        {
                          alignSelf: ghostModeEnabled ? 'flex-end' : 'flex-start',
                        }
                      ]} />
                    </View>
                  </Pressable>

                  {ghostModeEnabled && (
                    <View style={styles.subOptionsContainer}>
                      <Pressable
                        style={styles.toggleContainer}
                        onPress={() => setDisableLogging(!disableLogging)}
                      >
                        <Text style={styles.toggleLabel}>Disable Activity Logging</Text>
                        <View style={[
                          styles.toggleBase,
                          {
                            backgroundColor: disableLogging ? colors.cyan : 'rgba(184, 179, 209, 0.2)',
                          }
                        ]}>
                          <View style={[
                            styles.toggleCircle,
                            {
                              alignSelf: disableLogging ? 'flex-end' : 'flex-start',
                            }
                          ]} />
                        </View>
                      </Pressable>

                      <Pressable
                        style={styles.toggleContainer}
                        onPress={() => setClearClipboard(!clearClipboard)}
                      >
                        <Text style={styles.toggleLabel}>Clear Clipboard on Lock</Text>
                        <View style={[
                          styles.toggleBase,
                          {
                            backgroundColor: clearClipboard ? colors.cyan : 'rgba(184, 179, 209, 0.2)',
                          }
                        ]}>
                          <View style={[
                            styles.toggleCircle,
                            {
                              alignSelf: clearClipboard ? 'flex-end' : 'flex-start',
                            }
                          ]} />
                        </View>
                      </Pressable>

                      <Pressable
                        style={styles.toggleContainer}
                        onPress={() => setNoRecentFiles(!noRecentFiles)}
                      >
                        <Text style={styles.toggleLabel}>No Recent Files</Text>
                        <View style={[
                          styles.toggleBase,
                          {
                            backgroundColor: noRecentFiles ? colors.cyan : 'rgba(184, 179, 209, 0.2)',
                          }
                        ]}>
                          <View style={[
                            styles.toggleCircle,
                            {
                              alignSelf: noRecentFiles ? 'flex-end' : 'flex-start',
                            }
                          ]} />
                        </View>
                      </Pressable>
                    </View>
                  )}
                </View>

                {/* Self-Destruct Card */}
                <View style={[styles.card, styles.cardDanger]}>
                  <View style={styles.cardHeaderDanger}>
                    <View style={styles.cardTitleRow}>
                      <Feather name="zap" size={20} color={colors.danger} />
                      <Text style={[styles.cardTitle, { color: colors.danger }]}>
                        Self-Destruct Triggers
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.cardDescription}>
                    Automatically destroy vault data when critical security events are detected
                  </Text>

                  <View style={styles.warningBox}>
                    <Feather name="alert-triangle" size={16} color={colors.warning} />
                    <Text style={styles.warningText}>
                      Triggered actions will permanently delete all vault data
                    </Text>
                  </View>

                  <Pressable
                    style={styles.toggleContainer}
                    onPress={() => setOnFailedLogin(!onFailedLogin)}
                  >
                    <Text style={styles.toggleLabel}>On failed login threshold</Text>
                    <View style={[
                      styles.toggleBase,
                      {
                        backgroundColor: onFailedLogin ? colors.cyan : 'rgba(184, 179, 209, 0.2)',
                      }
                    ]}>
                      <View style={[
                        styles.toggleCircle,
                        {
                          alignSelf: onFailedLogin ? 'flex-end' : 'flex-start',
                        }
                      ]} />
                    </View>
                  </Pressable>

                  <Pressable
                    style={styles.toggleContainer}
                    onPress={() => setOnTamper(!onTamper)}
                  >
                    <Text style={styles.toggleLabel}>On tamper detection</Text>
                    <View style={[
                      styles.toggleBase,
                      {
                        backgroundColor: onTamper ? colors.cyan : 'rgba(184, 179, 209, 0.2)',
                      }
                    ]}>
                      <View style={[
                        styles.toggleCircle,
                        {
                          alignSelf: onTamper ? 'flex-end' : 'flex-start',
                        }
                      ]} />
                    </View>
                  </Pressable>

                  <Pressable
                    style={styles.toggleContainer}
                    onPress={() => setOnDuressPassword(!onDuressPassword)}
                  >
                    <Text style={styles.toggleLabel}>On duress password entry</Text>
                    <View style={[
                      styles.toggleBase,
                      {
                        backgroundColor: onDuressPassword ? colors.cyan : 'rgba(184, 179, 209, 0.2)',
                      }
                    ]}>
                      <View style={[
                        styles.toggleCircle,
                        {
                          alignSelf: onDuressPassword ? 'flex-end' : 'flex-start',
                        }
                      ]} />
                    </View>
                  </Pressable>

                  <View style={styles.duressPasswordContainer}>
                    <View>
                      <Text style={styles.duressLabel}>Duress Password</Text>
                      <Text style={styles.duressValue}>••••••••</Text>
                    </View>
                    <Pressable style={styles.editButton} onPress={handleEditDuressPassword}>
                      <Feather name="edit-2" size={16} color={colors.cyan} />
                      <Text style={styles.editButtonText}>Edit</Text>
                    </Pressable>
                  </View>
                </View>

                {/* Forensic Scanner Card */}
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <View style={styles.cardTitleRow}>
                      <Feather name="search" size={20} color={colors.cyan} />
                      <Text style={styles.cardTitle}>Forensic Scanner</Text>
                    </View>
                  </View>

                  <Text style={styles.cardDescription}>
                    Scan your system for trace artifacts left by vault operations
                  </Text>

                  {lastScanResults ? (
                    <View style={styles.scanResultsContainer}>
                      <View style={styles.resultsHeader}>
                        <Feather name="check-circle" size={18} color={colors.green} />
                        <Text style={styles.resultsTitle}>
                          {lastScanResults.count} artifacts found
                        </Text>
                      </View>
                      <View style={styles.artifactsList}>
                        {lastScanResults.artifacts.map((artifact, idx) => (
                          <View key={idx} style={styles.artifactItem}>
                            <Feather name="alert-triangle" size={14} color={colors.warning} />
                            <Text style={styles.artifactText}>{artifact}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.noScansText}>No recent scans</Text>
                  )}

                  <View style={styles.buttonsRow}>
                    <Pressable
                      style={[styles.actionButton, styles.scanButton]}
                      onPress={handleRunScan}
                      disabled={scanLoading}
                    >
                      <Feather name="search" size={16} color={colors.cyan} />
                      <Text style={styles.scanButtonText}>
                        {scanLoading ? 'Scanning...' : 'Run Forensic Scan'}
                      </Text>
                    </Pressable>

                    {lastScanResults && (
                      <Pressable
                        style={[styles.actionButton, styles.cleanButton]}
                        onPress={handleCleanAll}
                      >
                        <Feather name="trash-2" size={16} color={colors.danger} />
                        <Text style={styles.cleanButtonText}>Clean All Traces</Text>
                      </Pressable>
                    )}
                  </View>
                </View>

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
  pageHeader: {
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: dashboardSpacing.xs,
  },
  pageSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  card: {
    marginHorizontal: dashboardSpacing.lg,
    marginVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.lg,
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.1)',
  },
  cardDanger: {
    borderColor: 'rgba(239, 68, 68, 0.15)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.md,
  },
  cardHeaderDanger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.md,
    paddingBottom: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.2)',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  cardDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: dashboardSpacing.md,
    lineHeight: 18,
  },
  statusBadge: {
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184, 179, 209, 0.1)',
  },
  toggleLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  toggleBase: {
    width: 48,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#0A0612',
  },
  subOptionsContainer: {
    marginTop: dashboardSpacing.md,
    marginLeft: dashboardSpacing.md,
    paddingLeft: dashboardSpacing.md,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(34, 211, 238, 0.3)',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    backgroundColor: 'rgba(234, 179, 8, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.3)',
    borderRadius: 12,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.md,
  },
  warningText: {
    fontSize: 12,
    color: colors.warning,
    flex: 1,
  },
  duressPasswordContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  duressLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  duressValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
    letterSpacing: 2,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.xs,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    backgroundColor: 'rgba(34, 211, 238, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.4)',
  },
  editButtonText: {
    fontSize: 12,
    color: colors.cyan,
    fontWeight: '600',
  },
  scanResultsContainer: {
    marginVertical: dashboardSpacing.md,
    padding: dashboardSpacing.md,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.md,
  },
  resultsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.green,
  },
  artifactsList: {
    gap: dashboardSpacing.sm,
  },
  artifactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  artifactText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  noScansText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginVertical: dashboardSpacing.md,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: dashboardSpacing.md,
    marginTop: dashboardSpacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    borderRadius: 10,
    borderWidth: 2,
  },
  scanButton: {
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
    borderColor: colors.cyan,
  },
  scanButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.cyan,
  },
  cleanButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.danger,
  },
  cleanButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.danger,
  },
  bottomSpacing: {
    height: dashboardSpacing.xl,
  },
});

export default ZeroTraceScreen;
