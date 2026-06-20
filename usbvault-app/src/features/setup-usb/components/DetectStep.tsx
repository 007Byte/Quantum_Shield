/**
 * Step 1 — USB detection + drive list.
 * Pure presentational component; all data arrives via props.
 *
 * Three visual states based on companion health:
 * 1. Companion disconnected → dedicated connection guidance panel with auto-retry indicator
 * 2. Companion connected, loading/error/empty/drives → existing flow
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { dashboardSpacing, webOnlyTransition } from '@/components/dashboard2/styles';
import type { DetectStepProps } from '../domain/setup-usb.types';

export function DetectStep({
  drives,
  loadingDrives,
  driveError,
  selectedDriveId,
  companionStatus,
  companionVersionMismatch,
  companionVersion,
  onSelectDrive,
  onRefresh,
  t,
}: DetectStepProps) {
  const { theme } = useTheme();
  const styles = getDetectStepStyles(theme);

  return (
    <View style={styles.stepContent}>
      <View style={[styles.card, resolveLayerStyle(theme.L2.base)]}>
        <View style={styles.cardHeader}>
          <Feather name="disc" size={24} color={theme.semantic.cyan} />
          <Text style={[styles.cardTitle, { color: theme.L2.base.text.primary }]}>
            {t('setupUsb.detectUsbDrives')}
          </Text>
          <Pressable
            style={styles.refreshBtn}
            onPress={onRefresh}
            disabled={loadingDrives}
            accessibilityRole="button"
          >
            {loadingDrives ? (
              <ActivityIndicator size="small" color={theme.semantic.cyan} />
            ) : (
              <Feather name="refresh-cw" size={16} color={theme.semantic.cyan} />
            )}
          </Pressable>
        </View>
        <Text style={[styles.cardDescription, { color: theme.L2.base.text.secondary }]}>
          {t('setupUsb.detectUsbDesc')}
        </Text>

        {/* ── Companion disconnected state ─────────────────────────────── */}
        {companionStatus === 'disconnected' ? (
          <View style={styles.companionDisconnected}>
            {/* Pulsing status indicator */}
            <View style={styles.companionIconRow}>
              <View style={styles.pulseOuter}>
                <View style={styles.pulseDot} />
              </View>
              <Text style={[styles.companionStatusLabel, { color: theme.semantic.warning }]}>
                {t('setupUsb.companionDisconnected')}
              </Text>
            </View>

            <Text style={[styles.companionTitle, { color: theme.L2.base.text.primary }]}>
              {t('setupUsb.companionNeeded')}
            </Text>
            <Text style={[styles.companionDesc, { color: theme.L2.base.text.secondary }]}>
              {t('setupUsb.companionNeededDesc')}
            </Text>

            {/* Connection steps */}
            <View style={styles.companionSteps}>
              {[
                { icon: 'terminal' as const, text: t('setupUsb.companionStep1') },
                { icon: 'check-circle' as const, text: t('setupUsb.companionStep2') },
                { icon: 'wifi' as const, text: t('setupUsb.companionStep3') },
              ].map((step, idx) => (
                <View key={idx} style={styles.companionStepRow}>
                  <View
                    style={[
                      styles.companionStepIcon,
                      { backgroundColor: `${theme.semantic.cyan}14` },
                    ]}
                  >
                    <Feather name={step.icon} size={14} color={theme.semantic.cyan} />
                  </View>
                  <Text style={[styles.companionStepText, { color: theme.L2.base.text.secondary }]}>
                    {step.text}
                  </Text>
                </View>
              ))}
            </View>

            {/* Auto-retry indicator + manual override */}
            <View style={styles.companionRetryRow}>
              <View style={styles.autoRetryIndicator}>
                <ActivityIndicator size="small" color={theme.semantic.cyan} />
                <Text style={[styles.autoRetryText, { color: theme.L2.base.text.muted }]}>
                  {t('setupUsb.autoRetrying')}
                </Text>
              </View>
              <Pressable style={styles.retryBtn} onPress={onRefresh} accessibilityRole="button">
                <Feather name="refresh-cw" size={14} color={theme.semantic.cyan} />
                <Text style={styles.retryBtnText}>{t('setupUsb.retryNow')}</Text>
              </Pressable>
            </View>
          </View>
        ) : /* ── Companion checking (initial load) ────────────────────────── */
        companionStatus === 'checking' ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="large" color={theme.semantic.cyan} />
            <Text style={[styles.stateLabel, { color: theme.L2.base.text.secondary }]}>
              {t('setupUsb.checkingCompanion')}
            </Text>
          </View>
        ) : (
          /* ── Connected — standard drive states ────────────────────────── */
          <>
            {/* Version mismatch warning banner */}
            {companionVersionMismatch && (
              <View style={styles.versionWarning}>
                <Feather name="alert-triangle" size={16} color={theme.semantic.warning} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.versionWarningTitle, { color: theme.semantic.warning }]}>
                    {t('setupUsb.versionMismatch')}
                  </Text>
                  <Text
                    style={[styles.versionWarningText, { color: theme.L2.base.text.secondary }]}
                  >
                    {t('setupUsb.versionMismatchDesc')}
                    {companionVersion ? ` (v${companionVersion})` : ''}
                  </Text>
                </View>
              </View>
            )}

            {/* Drive states */}
            {loadingDrives ? (
              <View style={styles.centerState}>
                <ActivityIndicator size="large" color={theme.semantic.cyan} />
                <Text style={[styles.stateLabel, { color: theme.L2.base.text.secondary }]}>
                  {t('setupUsb.scanning')}
                </Text>
              </View>
            ) : driveError ? (
              <View style={styles.errorState}>
                <Feather name="alert-circle" size={32} color={theme.semantic.danger} />
                <Text style={styles.errorStateText}>{driveError}</Text>
                <Pressable style={styles.retryBtn} onPress={onRefresh} accessibilityRole="button">
                  <Text style={styles.retryBtnText}>{t('setupUsb.tryAgain')}</Text>
                </Pressable>
              </View>
            ) : drives.length === 0 ? (
              <View style={styles.centerState}>
                <Feather name="hard-drive" size={36} color={`${theme.semantic.cyan}4d`} />
                <Text style={[styles.stateLabel, { color: theme.L2.base.text.secondary }]}>
                  {t('setupUsb.noUsb')}
                </Text>
                <Text style={[styles.stateHint, { color: theme.L2.base.text.muted }]}>
                  {t('setupUsb.insertUsb')}
                </Text>
                <Pressable style={styles.retryBtn} onPress={onRefresh} accessibilityRole="button">
                  <Feather name="refresh-cw" size={14} color={theme.semantic.cyan} />
                  <Text style={styles.retryBtnText}>{t('setupUsb.refresh')}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.driveList}>
                {drives.map(drive => (
                  <Pressable
                    accessibilityRole="button"
                    key={drive.id}
                    style={[
                      styles.driveItem,
                      selectedDriveId === drive.id && styles.driveItemSelected,
                      !drive.available && styles.driveItemDisabled,
                    ]}
                    onPress={() => drive.available && onSelectDrive(drive.id)}
                    disabled={!drive.available}
                  >
                    <View
                      style={[
                        styles.driveRadio,
                        selectedDriveId === drive.id && styles.driveRadioSelected,
                      ]}
                    >
                      {selectedDriveId === drive.id && <View style={styles.driveRadioDot} />}
                    </View>
                    <View style={styles.driveInfo}>
                      <View style={styles.driveNameRow}>
                        <Text
                          style={[
                            styles.driveName,
                            {
                              color: drive.available
                                ? theme.L2.base.text.primary
                                : theme.L2.base.text.muted,
                            },
                          ]}
                        >
                          {drive.name}
                        </Text>
                        {drive.hasVault && (
                          <View style={styles.vaultBadge}>
                            <Text style={styles.vaultBadgeText}>{t('setupUsb.hasVault')}</Text>
                          </View>
                        )}
                        {!drive.available && (
                          <View style={styles.unavailableBadge}>
                            <Text style={styles.unavailableBadgeText}>{t('setupUsb.inUse')}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.driveDevice, { color: theme.L2.base.text.secondary }]}>
                        {drive.device} · {drive.capacity}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────
export function getDetectStepStyles(theme: any) {
  return StyleSheet.create({
    stepContent: { marginBottom: dashboardSpacing.lg },
    card: {
      padding: dashboardSpacing.lg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: `${theme.semantic.cyan}1a`,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: dashboardSpacing.md,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginLeft: dashboardSpacing.md,
      flex: 1,
    },
    cardDescription: {
      fontSize: 13,
      marginBottom: dashboardSpacing.lg,
    },
    refreshBtn: { padding: 6 },

    // ── Version mismatch warning ──────────────────────────────────────
    versionWarning: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: 'rgba(245,158,11,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(245,158,11,0.25)',
      marginBottom: dashboardSpacing.md,
    },
    versionWarningTitle: {
      fontSize: 12,
      fontWeight: '700',
    },
    versionWarningText: {
      fontSize: 12,
      marginTop: 2,
      lineHeight: 17,
    },

    centerState: { alignItems: 'center', paddingVertical: 32, gap: 10 },
    stateLabel: { fontSize: 14, fontWeight: '500' },
    stateHint: { fontSize: 12 },
    errorState: { alignItems: 'center', paddingVertical: 28, gap: 10 },
    errorStateText: {
      fontSize: 13,
      color: theme.semantic.danger,
      textAlign: 'center',
      maxWidth: 300,
    },
    retryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${theme.semantic.cyan}66`,
      marginTop: 4,
    },
    retryBtnText: { fontSize: 13, fontWeight: '600', color: theme.semantic.cyan },

    // ── Companion disconnected state ──────────────────────────────────
    companionDisconnected: {
      alignItems: 'center',
      paddingVertical: 24,
      paddingHorizontal: dashboardSpacing.md,
      gap: 12,
    },
    companionIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    pulseOuter: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: 'rgba(245,158,11,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    pulseDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#F59E0B',
    },
    companionStatusLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    companionTitle: {
      fontSize: 16,
      fontWeight: '600',
      textAlign: 'center',
    },
    companionDesc: {
      fontSize: 13,
      textAlign: 'center',
      maxWidth: 400,
      lineHeight: 19,
    },
    companionSteps: {
      gap: 10,
      marginTop: 8,
      width: '100%',
      maxWidth: 380,
    },
    companionStepRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: 'rgba(34,211,238,0.05)',
      borderWidth: 1,
      borderColor: 'rgba(34,211,238,0.12)',
    },
    companionStepIcon: {
      width: 28,
      height: 28,
      borderRadius: 7,
      justifyContent: 'center',
      alignItems: 'center',
    },
    companionStepText: {
      fontSize: 13,
      flex: 1,
    },
    companionRetryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      maxWidth: 380,
      marginTop: 8,
    },
    autoRetryIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    autoRetryText: {
      fontSize: 12,
      fontStyle: 'italic',
    },

    // ── Drive list ────────────────────────────────────────────────────
    driveList: { gap: dashboardSpacing.md },
    driveItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: dashboardSpacing.md,
      paddingVertical: dashboardSpacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: `${theme.semantic.cyan}26`,
      ...webOnlyTransition,
    },
    driveItemSelected: {
      borderColor: theme.semantic.cyan,
      backgroundColor: `${theme.semantic.cyan}14`,
    },
    driveItemDisabled: { opacity: 0.45 },
    driveRadio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: theme.L2.base.text.muted,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: dashboardSpacing.md,
    },
    driveRadioSelected: { borderColor: theme.semantic.cyan },
    driveRadioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: theme.semantic.cyan,
    },
    driveInfo: { flex: 1 },
    driveNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 3,
    },
    driveName: { fontSize: 14, fontWeight: '600' },
    driveDevice: { fontSize: 12 },
    vaultBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: `${theme.semantic.purple}33`,
    },
    vaultBadgeText: { fontSize: 10, fontWeight: '600', color: theme.semantic.purple },
    unavailableBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: `${theme.semantic.danger}26`,
    },
    unavailableBadgeText: { fontSize: 10, fontWeight: '600', color: theme.semantic.danger },
  });
}
