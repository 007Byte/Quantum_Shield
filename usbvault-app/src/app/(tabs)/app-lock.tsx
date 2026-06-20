import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { useLanguage } from '@/hooks/useLanguage';
import {
  dashboardLayout,
  dashboardSpacing,
  webOnlyTransition,
} from '@/components/dashboard2/styles';

const textPrimary = '#F5F3FF';
const textSecondary = '#B8B3D1';
const cyan = '#22D3EE';
const purple = '#8B5CF6';
// green available for future use
const glassmorphicBg = 'rgba(8, 5, 20, 0.55)';
const glassmorphicBorder = 'rgba(34, 211, 238, 0.1)';

type LockOption = 'immediate' | '1min' | '5min' | '15min' | 'never';

export default function AppLock() {
  const { t } = useLanguage();
  const { modal, showSuccess } = useInAppModal();
  const [selectedTimer, setSelectedTimer] = useState<LockOption>('5min');
  const [lockOnMinimize, setLockOnMinimize] = useState(true);
  const [lockOnScreenSleep, setLockOnScreenSleep] = useState(true);
  const [lockOnUsbRemoval, setLockOnUsbRemoval] = useState(true);
  const [requireBiometric, setRequireBiometric] = useState(false);

  const timerOptions: Array<{ id: LockOption; label: string; description: string }> = [
    { id: 'immediate', label: t('appLock.immediately'), description: t('appLock.lockInstantly') },
    { id: '1min', label: t('appLock.after1min'), description: t('appLock.lockAfter1Min') },
    { id: '5min', label: t('appLock.after5min'), description: t('appLock.lockAfter5Min') },
    { id: '15min', label: t('appLock.after15min'), description: t('appLock.lockAfter15Min') },
    { id: 'never', label: t('appLock.never'), description: t('appLock.manualLocking') },
  ];

  const handleSaveSettings = () => {
    showSuccess(t('appLock.settingsSaved'), t('appLock.lockConfigUpdated'));
  };

  const ToggleSwitch = ({ value, onToggle }: { value: boolean; onToggle: () => void }) => (
    <Pressable
      accessibilityRole="button"
      style={[styles.toggleSwitch, { backgroundColor: value ? cyan : 'rgba(184, 179, 209, 0.2)' }]}
      onPress={onToggle}
    >
      <View
        style={[
          styles.toggleThumb,
          {
            transform: [{ translateX: value ? 22 : 2 }],
            backgroundColor: '#FFFFFF',
          },
        ]}
      />
    </Pressable>
  );

  const RadioIndicator = ({ selected }: { selected: boolean }) => (
    <View style={[styles.radioOuter, { borderColor: selected ? cyan : textSecondary }]}>
      {selected && <View style={[styles.radioInner, { backgroundColor: cyan }]} />}
    </View>
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
              <View style={styles.pageHeader}>
                <Text style={styles.pageTitle} accessibilityRole="header">
                  {t('appLock.pageTitle')}
                </Text>
                <Text style={styles.pageSubtitle}>{t('appLock.pageSubtitle')}</Text>
              </View>

              {/* Auto-Lock Timer Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('appLock.autoLock')}
                </Text>
                <View style={styles.glassmorphicCard}>
                  {timerOptions.map(option => (
                    <Pressable
                      accessibilityRole="button"
                      key={option.id}
                      style={styles.timerOptionRow}
                      onPress={() => setSelectedTimer(option.id)}
                    >
                      <RadioIndicator selected={selectedTimer === option.id} />
                      <View style={styles.timerOptionContent}>
                        <Text style={styles.timerOptionLabel}>{option.label}</Text>
                        <Text style={styles.timerOptionDescription}>{option.description}</Text>
                      </View>
                      {selectedTimer === option.id && <View style={styles.selectedBorder} />}
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Lock Triggers Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('appLock.lockTriggers')}
                </Text>
                <View style={styles.glassmorphicCard}>
                  {/* Lock on Minimize */}
                  <View style={styles.toggleRow}>
                    <Feather name="minimize-2" size={20} color={cyan} />
                    <View style={styles.toggleContent}>
                      <Text style={styles.toggleLabel}>{t('appLock.lockOnBackground')}</Text>
                      <Text style={styles.toggleDescription}>{t('appLock.lockOnBackgroundDesc')}</Text>
                    </View>
                    <ToggleSwitch
                      value={lockOnMinimize}
                      onToggle={() => setLockOnMinimize(!lockOnMinimize)}
                    />
                  </View>

                  {/* Lock on Screen Sleep */}
                  <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                    <Feather name="moon" size={20} color={cyan} />
                    <View style={styles.toggleContent}>
                      <Text style={styles.toggleLabel}>{t('appLock.lockOnScreenSleep')}</Text>
                      <Text style={styles.toggleDescription}>
                        {t('appLock.lockOnScreenSleepDesc')}
                      </Text>
                    </View>
                    <ToggleSwitch
                      value={lockOnScreenSleep}
                      onToggle={() => setLockOnScreenSleep(!lockOnScreenSleep)}
                    />
                  </View>

                  {/* Lock on USB Removal */}
                  <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                    <Feather name="disc" size={20} color={cyan} />
                    <View style={styles.toggleContent}>
                      <Text style={styles.toggleLabel}>{t('appLock.lockOnUsbRemoval')}</Text>
                      <Text style={styles.toggleDescription}>
                        {t('appLock.lockOnUsbRemovalDesc')}
                      </Text>
                    </View>
                    <ToggleSwitch
                      value={lockOnUsbRemoval}
                      onToggle={() => setLockOnUsbRemoval(!lockOnUsbRemoval)}
                    />
                  </View>

                  {/* Require Biometric */}
                  <View style={[styles.toggleRow, styles.toggleRowBorder]}>
                    <Feather name="lock" size={20} color={cyan} />
                    <View style={styles.toggleContent}>
                      <Text style={styles.toggleLabel}>{t('appLock.biometric')}</Text>
                      <Text style={styles.toggleDescription}>
                        {t('appLock.biometricDesc')}
                      </Text>
                    </View>
                    <ToggleSwitch
                      value={requireBiometric}
                      onToggle={() => setRequireBiometric(!requireBiometric)}
                    />
                  </View>
                </View>
              </View>

              {/* Save Button */}
              <Pressable
                accessibilityRole="button"
                style={styles.saveButton}
                onPress={handleSaveSettings}
              >
                <Text style={styles.saveButtonText}>{t('appLock.save')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Modal */}
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
  pageHeader: {
    marginBottom: dashboardSpacing.xl,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: textPrimary,
    marginBottom: dashboardSpacing.sm,
  },
  pageSubtitle: {
    fontSize: 16,
    color: textSecondary,
    fontWeight: '400',
  },
  section: {
    marginBottom: dashboardSpacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: dashboardSpacing.md,
  },
  glassmorphicCard: {
    backgroundColor: glassmorphicBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: glassmorphicBorder,
    overflow: 'hidden',
    ...webOnlyTransition,
  },
  timerOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34, 211, 238, 0.05)',
  },
  timerOptionContent: {
    flex: 1,
    marginLeft: dashboardSpacing.md,
  },
  timerOptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: dashboardSpacing.xs,
  },
  timerOptionDescription: {
    fontSize: 14,
    color: textSecondary,
    fontWeight: '400',
  },
  selectedBorder: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: cyan,
    borderRadius: 8,
    pointerEvents: 'none',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: dashboardSpacing.md,
  },
  toggleRowBorder: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(34, 211, 238, 0.05)',
  },
  toggleContent: {
    flex: 1,
    marginLeft: dashboardSpacing.md,
    marginRight: dashboardSpacing.md,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: textPrimary,
    marginBottom: dashboardSpacing.xs,
  },
  toggleDescription: {
    fontSize: 14,
    color: textSecondary,
    fontWeight: '400',
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  saveButton: {
    backgroundColor: purple,
    borderRadius: 12,
    paddingVertical: dashboardSpacing.md,
    paddingHorizontal: dashboardSpacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: dashboardSpacing.xl,
    marginBottom: dashboardSpacing.xl,
    ...webOnlyTransition,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: textPrimary,
  },
});
