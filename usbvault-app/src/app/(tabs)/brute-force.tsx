import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
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
import type { JSONValue } from '@/types/utilities';
import { useLanguage } from '@/hooks/useLanguage';

const COLORS = {
  textPrimary: '#F5F3FF',
  textSecondary: '#B8B3D1',
  cyan: '#22D3EE',
  purple: '#8B5CF6',
  green: '#10B981',
  red: '#EF4444',
  darkBg: 'rgba(8, 5, 20, 0.55)',
  borderColor: 'rgba(34, 211, 238, 0.1)',
};

export default function BruteForcePage() {
  const { t } = useLanguage();
  const { modal, showSuccess } = useInAppModal();
  const [maxAttempts, setMaxAttempts] = useState<3 | 5 | 10>(5);
  const [lockoutDuration, setLockoutDuration] = useState<'1min' | '5min' | '30min' | 'permanent'>(
    '5min'
  );
  const [failedAttempts] = useState<{ id: number; timestamp: string; ip: string; status: string }[]>([]);
  const [wipeEnabled, setWipeEnabled] = useState(false);
  const [progressiveDelayEnabled, setProgressiveDelayEnabled] = useState(true);

  const handleSaveSettings = () => {
    showSuccess(t('bruteForce.settingsSaved'), t('bruteForce.settingsUpdated'));
  };

  // PH4-FIX: Replaced any with JSONValue type for button values
  const PillButton = ({
    label,
    selected,
    onPress,
  }: {
    label: string;
    value?: JSONValue;
    selected: boolean;
    onPress: () => void;
  }) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.pillButton, selected && styles.pillButtonSelected, { ...webOnlyTransition }]}
    >
      <Text style={[styles.pillButtonText, selected && styles.pillButtonTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );

  const ToggleSwitch = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <Pressable
      accessibilityRole="button"
      onPress={onToggle}
      style={[styles.toggleSwitch, enabled && styles.toggleSwitchEnabled, { ...webOnlyTransition }]}
    >
      <View style={[styles.toggleThumb, enabled && styles.toggleThumbEnabled]} />
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator
      >
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />
          <Sidebar />
          <View style={styles.mainCol}>
            <TopBar />
            <View style={styles.contentArea}>
              {/* Page Header */}
              <View style={styles.header}>
                <Text style={styles.pageTitle} accessibilityRole="header">
                  {t('bruteForce.pageTitle')}
                </Text>
                <Text style={styles.pageSubtitle}>
                  {t('bruteForce.pageSubtitle')}
                </Text>
              </View>

              {/* Status Card */}
              <View style={[styles.card, styles.statusCard]}>
                <View style={styles.statusHeader}>
                  <View style={styles.statusIndicator}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusTitle}>{t('bruteForce.protectionActive')}</Text>
                  </View>
                  <Feather name="shield" size={24} color={COLORS.green} />
                </View>
                <Text style={styles.statusDetail}>{t('bruteForce.failedAttemptsRemaining')}</Text>
              </View>

              {/* Max Failed Attempts Section */}
              <View style={[styles.card, styles.settingsCard]}>
                <View style={styles.sectionHeader}>
                  <Feather name="alert-circle" size={20} color={COLORS.cyan} />
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('bruteForce.maxFailedAttempts')}
                  </Text>
                </View>
                <View style={styles.pillContainer}>
                  <PillButton
                    label="3"
                    value={3}
                    selected={maxAttempts === 3}
                    onPress={() => setMaxAttempts(3)}
                  />
                  <PillButton
                    label="5"
                    value={5}
                    selected={maxAttempts === 5}
                    onPress={() => setMaxAttempts(5)}
                  />
                  <PillButton
                    label="10"
                    value={10}
                    selected={maxAttempts === 10}
                    onPress={() => setMaxAttempts(10)}
                  />
                </View>
              </View>

              {/* Lockout Duration Section */}
              <View style={[styles.card, styles.settingsCard]}>
                <View style={styles.sectionHeader}>
                  <Feather name="clock" size={20} color={COLORS.cyan} />
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('bruteForce.lockoutDuration')}
                  </Text>
                </View>
                <View style={styles.pillContainer}>
                  <PillButton
                    label={t('bruteForce.1min')}
                    value="1min"
                    selected={lockoutDuration === '1min'}
                    onPress={() => setLockoutDuration('1min')}
                  />
                  <PillButton
                    label={t('bruteForce.5min')}
                    value="5min"
                    selected={lockoutDuration === '5min'}
                    onPress={() => setLockoutDuration('5min')}
                  />
                  <PillButton
                    label={t('bruteForce.30min')}
                    value="30min"
                    selected={lockoutDuration === '30min'}
                    onPress={() => setLockoutDuration('30min')}
                  />
                  <PillButton
                    label={t('bruteForce.permanent')}
                    value="permanent"
                    selected={lockoutDuration === 'permanent'}
                    onPress={() => setLockoutDuration('permanent')}
                  />
                </View>
              </View>

              {/* Wipe After Failed Attempts Section */}
              <View style={[styles.card, styles.settingsCard]}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLabel}>
                    <Feather name="trash-2" size={20} color={COLORS.red} />
                    <Text style={styles.toggleLabelText}>{t('bruteForce.wipeAfterFailed')}</Text>
                  </View>
                  <ToggleSwitch
                    enabled={wipeEnabled}
                    onToggle={() => setWipeEnabled(!wipeEnabled)}
                  />
                </View>
                <Text style={styles.warningText}>
                  {t('bruteForce.wipeAfterFailedDesc')}
                </Text>
              </View>

              {/* Progressive Delay Section */}
              <View style={[styles.card, styles.settingsCard]}>
                <View style={styles.toggleRow}>
                  <View style={styles.toggleLabel}>
                    <Feather name="zap" size={20} color={COLORS.cyan} />
                    <Text style={styles.toggleLabelText}>{t('bruteForce.progressiveDelay')}</Text>
                  </View>
                  <ToggleSwitch
                    enabled={progressiveDelayEnabled}
                    onToggle={() => setProgressiveDelayEnabled(!progressiveDelayEnabled)}
                  />
                </View>
                <Text style={styles.descriptionText}>
                  {t('bruteForce.progressiveDelayDesc')}
                </Text>
              </View>

              {/* Failed Attempt Log Section */}
              <View style={[styles.card, styles.logCard]}>
                <View style={styles.sectionHeader}>
                  <Feather name="activity" size={20} color={COLORS.cyan} />
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('bruteForce.failedAttemptLog')}
                  </Text>
                </View>
                <View style={styles.logTable}>
                  <View style={[styles.logRow, styles.logHeaderRow]}>
                    <Text style={[styles.logCell, styles.logHeaderCell]}>{t('bruteForce.timestamp')}</Text>
                    <Text style={[styles.logCell, styles.logHeaderCell]}>{t('bruteForce.ip')}</Text>
                    <Text style={[styles.logCell, styles.logHeaderCell]}>{t('bruteForce.status')}</Text>
                  </View>
                  {failedAttempts.length === 0 ? (
                    <View style={[styles.logRow, { justifyContent: 'center' }]}>
                      <Text style={styles.logCell}>No failed attempts detected</Text>
                    </View>
                  ) : failedAttempts.map(attempt => (
                    <View key={attempt.id} style={styles.logRow}>
                      <Text style={styles.logCell}>{attempt.timestamp}</Text>
                      <Text style={styles.logCell}>{attempt.ip}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          attempt.status === 'Blocked'
                            ? styles.statusBadgeBlocked
                            : styles.statusBadgeDelayed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusBadgeText,
                            attempt.status === 'Blocked'
                              ? styles.statusBadgeTextBlocked
                              : styles.statusBadgeTextDelayed,
                          ]}
                        >
                          {attempt.status}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Save Settings Button */}
              <Pressable
                accessibilityRole="button"
                onPress={handleSaveSettings}
                style={[styles.saveButton, { ...webOnlyTransition }]}
              >
                <Text style={styles.saveButtonText}>{t('bruteForce.save')}</Text>
              </Pressable>
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
      background:
        'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
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
  header: {
    marginBottom: dashboardSpacing.md,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: dashboardSpacing.xs,
  },
  pageSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.darkBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.borderColor,
    padding: dashboardSpacing.md,
  },
  statusCard: {
    marginBottom: dashboardSpacing.md,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.sm,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.green,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.green,
  },
  statusDetail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  settingsCard: {
    gap: dashboardSpacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  pillContainer: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    flexWrap: 'wrap',
  },
  pillButton: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: 20,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: COLORS.purple,
  },
  pillButtonSelected: {
    backgroundColor: COLORS.purple,
  },
  pillButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.purple,
  },
  pillButtonTextSelected: {
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: dashboardSpacing.sm,
  },
  toggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    flex: 1,
  },
  toggleLabelText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(184, 179, 209, 0.2)',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchEnabled: {
    backgroundColor: COLORS.green,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.textSecondary,
    alignSelf: 'flex-start',
  },
  toggleThumbEnabled: {
    alignSelf: 'flex-end',
    backgroundColor: '#fff',
  },
  warningText: {
    fontSize: 13,
    color: COLORS.red,
    lineHeight: 18,
    paddingHorizontal: dashboardSpacing.xs,
  },
  descriptionText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    paddingHorizontal: dashboardSpacing.xs,
  },
  logCard: {
    marginBottom: dashboardSpacing.md,
  },
  logTable: {
    marginTop: dashboardSpacing.sm,
  },
  logRow: {
    flexDirection: 'row',
    paddingVertical: dashboardSpacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34, 211, 238, 0.05)',
    alignItems: 'center',
  },
  logHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34, 211, 238, 0.15)',
    paddingBottom: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.sm,
  },
  logCell: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  logHeaderCell: {
    color: COLORS.cyan,
    fontWeight: '600',
  },
  statusBadge: {
    paddingHorizontal: dashboardSpacing.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeBlocked: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  statusBadgeDelayed: {
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusBadgeTextBlocked: {
    color: COLORS.red,
  },
  statusBadgeTextDelayed: {
    color: COLORS.cyan,
  },
  saveButton: {
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    backgroundColor: COLORS.purple,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: dashboardSpacing.lg,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
