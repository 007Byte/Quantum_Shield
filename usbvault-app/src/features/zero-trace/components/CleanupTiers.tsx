/**
 * CleanupTiers — Tier selection cards (App / OS / Admin)
 * @module features/zero-trace/components/CleanupTiers
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { ztColors } from '../domain/zero-trace.data';
import type { FeatherIconName, CleanupTiersProps } from '../domain/zero-trace.types';
import { GhostModePanel } from './GhostModePanel';
import { AppArtifactList, OsArtifactList } from './ArtifactList';

// ── Reusable CleanupTierCard ────────────────────────────────────────

interface CleanupTierCardProps {
  title: string;
  icon: FeatherIconName;
  badge: string;
  badgeColor: string;
  description: string;
  enabled: boolean;
  children: React.ReactNode;
}

const CleanupTierCard = ({
  title,
  icon,
  badge,
  badgeColor,
  description,
  enabled,
  children,
}: CleanupTierCardProps) => {
  const { theme: t } = useTheme();
  return (
    <View style={[styles.card, resolveLayerStyle(t.L2.base), !enabled && styles.cardDisabled]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleRow}>
          <Feather name={icon} size={20} color={enabled ? ztColors.cyan : ztColors.gray} />
          <Text style={[styles.cardTitle, !enabled && { color: ztColors.gray }]}>{title}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor: `${badgeColor}20`,
              borderColor: badgeColor,
            },
          ]}
        >
          <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{badge}</Text>
        </View>
      </View>
      <Text style={[styles.cardDescription, !enabled && { color: ztColors.gray }]}>
        {description}
      </Text>
      {children}
    </View>
  );
};

// ── Action Buttons Row ──────────────────────────────────────────────

interface ActionButtonsProps {
  scanning: boolean;
  cleaning: boolean;
  onScan: () => void;
  onClean: () => void;
  scanLabel: string;
  cleanLabel: string;
  scanningLabel: string;
  cleaningLabel: string;
}

const ActionButtons = ({
  scanning,
  cleaning,
  onScan,
  onClean,
  scanLabel,
  cleanLabel,
  scanningLabel,
  cleaningLabel,
}: ActionButtonsProps) => (
  <View style={styles.buttonsRow}>
    <Pressable
      accessibilityRole="button"
      style={[styles.actionButton, styles.scanButton, scanning && { opacity: 0.6 }]}
      onPress={onScan}
      disabled={scanning || cleaning}
    >
      {scanning ? (
        <ActivityIndicator size="small" color={ztColors.cyan} />
      ) : (
        <Feather name="search" size={16} color={ztColors.cyan} />
      )}
      <Text style={styles.scanButtonText}>{scanning ? scanningLabel : scanLabel}</Text>
    </Pressable>

    <Pressable
      accessibilityRole="button"
      style={[styles.actionButton, styles.cleanButton, cleaning && { opacity: 0.6 }]}
      onPress={onClean}
      disabled={scanning || cleaning}
    >
      {cleaning ? (
        <ActivityIndicator size="small" color={ztColors.danger} />
      ) : (
        <Feather name="trash-2" size={16} color={ztColors.danger} />
      )}
      <Text style={styles.cleanButtonText}>{cleaning ? cleaningLabel : cleanLabel}</Text>
    </Pressable>
  </View>
);

// ── CleanupTiers (main export) ──────────────────────────────────────

export const CleanupTiers = ({
  companionAvailable,
  scanning,
  cleaning,
  settings,
  appScanResults,
  osScanResults,
  osCleaners,
  adminCleaners,
  adminState,
  onGhostModeToggle,
  onUpdateSetting,
  onAppScan,
  onAppClean,
  onOsScan,
  onOsClean,
  onAdminClean,
  t,
}: CleanupTiersProps) => (
  <>
    {/* ── Card 1: App-Level Protection ────────────────────────── */}
    <CleanupTierCard
      title={t('zeroTrace.appLevelTitle') || 'App-Level Protection'}
      icon="shield"
      badge={t('zeroTrace.alwaysActive') || 'Always Active'}
      badgeColor={ztColors.green}
      description={
        t('zeroTrace.appLevelDesc') ||
        'In-app forensic cleanup: clipboard, cache, session data, and memory scrubbing. No companion required.'
      }
      enabled={true}
    >
      <GhostModePanel
        settings={settings}
        onToggle={onGhostModeToggle}
        onUpdateSetting={onUpdateSetting}
        t={t}
      />

      {/* App scan results */}
      {appScanResults && (
        <AppArtifactList
          appScanResults={appScanResults}
          cleaning={cleaning}
          onAppClean={onAppClean}
          t={t}
        />
      )}

      {/* Scan / Clean buttons */}
      <ActionButtons
        scanning={scanning}
        cleaning={cleaning}
        onScan={onAppScan}
        onClean={onAppClean}
        scanLabel={t('zeroTrace.scanAppTraces') || 'Scan App Traces'}
        cleanLabel={t('zeroTrace.cleanAppTraces') || 'Clean App Traces'}
        scanningLabel={t('zeroTrace.scanning') || 'Scanning...'}
        cleaningLabel={t('zeroTrace.cleaning') || 'Cleaning...'}
      />
    </CleanupTierCard>

    {/* ── Card 2: OS-Level Cleanup ────────────────────────────── */}
    <CleanupTierCard
      title={t('zeroTrace.osLevelTitle') || 'OS-Level Cleanup'}
      icon="monitor"
      badge={
        companionAvailable
          ? t('zeroTrace.companionReady') || 'Companion Ready'
          : t('zeroTrace.companionRequired') || 'Companion Required'
      }
      badgeColor={companionAvailable ? ztColors.cyan : ztColors.gray}
      description={
        companionAvailable
          ? t('zeroTrace.osLevelDesc') ||
            'Clean OS-level forensic artifacts left on the host machine.'
          : t('zeroTrace.osLevelDisabledDesc') ||
            'Connect the USB Companion to enable OS-level artifact cleanup.'
      }
      enabled={companionAvailable}
    >
      {!companionAvailable ? (
        <View style={styles.disabledOverlay}>
          <Feather name="link-2" size={24} color={ztColors.gray} />
          <Text style={styles.disabledText}>
            {t('zeroTrace.companionRequiredMsg') ||
              'USB Companion Required. Start the USBVault Companion app to enable OS-level cleanup.'}
          </Text>
        </View>
      ) : (
        <>
          {/* OS cleaner item list */}
          <View style={styles.osCleanerList}>
            {osCleaners.map((item, idx) => (
              <View key={idx} style={styles.osCleanerItem}>
                <Feather name={item.icon as FeatherIconName} size={14} color={ztColors.cyan} />
                <Text style={styles.osCleanerLabel}>{item.label}</Text>
              </View>
            ))}
          </View>

          {/* OS scan results */}
          {osScanResults && <OsArtifactList osScanResults={osScanResults} t={t} />}

          {/* Scan / Clean OS buttons */}
          <ActionButtons
            scanning={scanning}
            cleaning={cleaning}
            onScan={onOsScan}
            onClean={onOsClean}
            scanLabel={t('zeroTrace.scanOsTraces') || 'Scan OS Traces'}
            cleanLabel={t('zeroTrace.cleanOsTraces') || 'Clean OS Traces'}
            scanningLabel={t('zeroTrace.scanning') || 'Scanning...'}
            cleaningLabel={t('zeroTrace.cleaning') || 'Cleaning...'}
          />
        </>
      )}
    </CleanupTierCard>

    {/* ── Card 3: Admin-Level Cleanup ─────────────────────────── */}
    {companionAvailable && (
      <CleanupTierCard
        title={t('zeroTrace.adminLevelTitle') || 'Admin-Level Cleanup'}
        icon="lock"
        badge={t('zeroTrace.requiresPassword') || 'Requires Password'}
        badgeColor={ztColors.purple}
        description={
          t('zeroTrace.adminLevelDesc') ||
          'Elevated operations requiring administrator privileges on the host machine.'
        }
        enabled={true}
      >
        {/* Admin cleanup items */}
        <View style={styles.adminCleanerList}>
          {adminCleaners.map((item, idx) => (
            <View key={idx} style={styles.adminCleanerItem}>
              <Feather name="shield" size={14} color={ztColors.purple} />
              <Text style={styles.adminCleanerLabel}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Feather name="info" size={14} color={ztColors.purple} />
          <Text style={styles.infoText}>
            {t('zeroTrace.adminInfoText') ||
              'Admin cleanup requires your system password. The password is only used locally and is never stored.'}
          </Text>
        </View>

        <View style={styles.buttonsRow}>
          <Pressable
            accessibilityRole="button"
            style={[
              styles.actionButton,
              styles.adminButton,
              (cleaning || adminState.elevating) && { opacity: 0.6 },
            ]}
            onPress={onAdminClean}
            disabled={scanning || cleaning || adminState.elevating}
          >
            {adminState.elevating ? (
              <ActivityIndicator size="small" color={ztColors.purple} />
            ) : (
              <Feather name="lock" size={16} color={ztColors.purple} />
            )}
            <Text style={styles.adminButtonText}>
              {adminState.elevating
                ? t('zeroTrace.elevating') || 'Authorizing...'
                : t('zeroTrace.cleanWithAdmin') || 'Clean with Admin'}
            </Text>
          </Pressable>
        </View>
      </CleanupTierCard>
    )}
  </>
);

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Card
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
  cardDisabled: {
    opacity: 0.55,
  },
  cardHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: dashboardSpacing.md,
  },
  cardTitleRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: dashboardSpacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: ztColors.textPrimary,
  },
  cardDescription: {
    fontSize: 13,
    color: ztColors.textSecondary,
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
    color: ztColors.textPrimary,
  },

  // Buttons
  buttonsRow: {
    flexDirection: 'row' as const,
    gap: dashboardSpacing.md,
    marginTop: dashboardSpacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: dashboardSpacing.sm,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    borderRadius: 10,
    borderWidth: 2,
  },
  scanButton: {
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
    borderColor: ztColors.cyan,
  },
  scanButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: ztColors.cyan,
  },
  cleanButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: ztColors.danger,
  },
  cleanButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: ztColors.danger,
  },
  adminButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderColor: ztColors.purple,
  },
  adminButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: ztColors.purple,
  },

  // OS Cleaner List
  osCleanerList: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.md,
  },
  osCleanerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    backgroundColor: 'rgba(34, 211, 238, 0.06)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.12)',
  },
  osCleanerLabel: {
    fontSize: 11,
    color: ztColors.textSecondary,
    fontWeight: '500',
  },

  // Admin Cleaner List
  adminCleanerList: {
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.md,
  },
  adminCleanerItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 6,
  },
  adminCleanerLabel: {
    fontSize: 13,
    color: ztColors.textSecondary,
  },

  // Disabled Overlay
  disabledOverlay: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: dashboardSpacing.xl,
    gap: dashboardSpacing.md,
  },
  disabledText: {
    fontSize: 13,
    color: ztColors.gray,
    textAlign: 'center' as const,
    maxWidth: 300,
    lineHeight: 18,
  },

  // Info Box
  infoBox: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: dashboardSpacing.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 10,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.md,
  },
  infoText: {
    fontSize: 11,
    color: ztColors.textSecondary,
    flex: 1,
    lineHeight: 16,
  },
});
