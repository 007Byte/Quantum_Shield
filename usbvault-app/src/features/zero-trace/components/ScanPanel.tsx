/**
 * ScanPanel — Scan trigger + full-cleanup button + cleanup summary
 * @module features/zero-trace/components/ScanPanel
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { ztColors } from '../domain/zero-trace.data';
import type { ScanPanelProps } from '../domain/zero-trace.types';

export const ScanPanel = ({
  companionAvailable,
  cleaning,
  scanning: _scanning,
  cleanupSummary,
  onFullCleanup,
  onDismissSummary,
  t,
}: ScanPanelProps) => (
  <View style={styles.pageHeader}>
    <View style={styles.pageHeaderTop}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageTitle} accessibilityRole="header">
          {t('zeroTrace.pageTitle') || 'Zero-Trace Mode'}
        </Text>
        <Text style={styles.pageSubtitle}>
          {t('zeroTrace.pageSubtitle') ||
            'Eliminate forensic evidence across three tiers of cleanup'}
        </Text>
      </View>
      {/* Companion status pill */}
      <View
        style={[
          styles.companionPill,
          {
            backgroundColor: companionAvailable
              ? `${ztColors.green}20`
              : 'rgba(107, 114, 128, 0.15)',
            borderColor: companionAvailable ? ztColors.green : ztColors.gray,
          },
        ]}
      >
        <View
          style={[
            styles.companionDot,
            {
              backgroundColor: companionAvailable ? ztColors.green : ztColors.gray,
            },
          ]}
        />
        <Text
          style={[
            styles.companionText,
            { color: companionAvailable ? ztColors.green : ztColors.gray },
          ]}
        >
          {companionAvailable
            ? t('zeroTrace.companionConnected') || 'USB Companion Connected'
            : t('zeroTrace.companionDisconnected') || 'Not Connected'}
        </Text>
      </View>
    </View>

    {/* Full Cleanup button */}
    <Pressable
      accessibilityRole="button"
      style={[styles.fullCleanupButton, cleaning && { opacity: 0.6 }]}
      onPress={onFullCleanup}
      disabled={cleaning}
    >
      {cleaning ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Feather name="zap" size={18} color="#FFFFFF" />
      )}
      <Text style={styles.fullCleanupText}>
        {cleaning
          ? t('zeroTrace.cleaningAll') || 'Running Full Cleanup...'
          : t('zeroTrace.fullCleanup') || 'Full Cleanup'}
      </Text>
    </Pressable>

    {/* Cleanup summary */}
    {cleanupSummary && (
      <View style={styles.cleanupSummaryBox}>
        <Feather
          name={
            cleanupSummary.tiersCompleted === cleanupSummary.tiersAttempted
              ? 'check-circle'
              : 'alert-triangle'
          }
          size={16}
          color={
            cleanupSummary.tiersCompleted === cleanupSummary.tiersAttempted
              ? ztColors.green
              : ztColors.warning
          }
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.cleanupSummaryTitle}>
            {t('zeroTrace.cleanupSummary', {
              completed: cleanupSummary.tiersCompleted,
              total: cleanupSummary.tiersAttempted,
              plural: cleanupSummary.tiersAttempted !== 1 ? 's' : '',
            })}
          </Text>
          {cleanupSummary.details.map((detail, idx) => (
            <Text key={idx} style={styles.cleanupSummaryDetail}>
              {detail}
            </Text>
          ))}
        </View>
        <Pressable onPress={onDismissSummary} accessibilityRole="button">
          <Feather name="x" size={16} color={ztColors.textSecondary} />
        </Pressable>
      </View>
    )}
  </View>
);

const styles = StyleSheet.create({
  pageHeader: {
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
  },
  pageHeaderTop: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    gap: dashboardSpacing.md,
    marginBottom: dashboardSpacing.md,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: ztColors.textPrimary,
    marginBottom: dashboardSpacing.xs,
  },
  pageSubtitle: {
    fontSize: 14,
    color: ztColors.textSecondary,
    fontWeight: '400',
  },
  companionPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  companionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  companionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  fullCleanupButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: ztColors.purple,
    marginBottom: dashboardSpacing.md,
    ...webOnly({
      boxShadow: '0 0 20px rgba(139, 92, 246, 0.3)',
    }),
  },
  fullCleanupText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cleanupSummaryBox: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: dashboardSpacing.sm,
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 12,
    padding: dashboardSpacing.md,
  },
  cleanupSummaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ztColors.textPrimary,
    marginBottom: 4,
  },
  cleanupSummaryDetail: {
    fontSize: 11,
    color: ztColors.textSecondary,
    lineHeight: 16,
  },
});
