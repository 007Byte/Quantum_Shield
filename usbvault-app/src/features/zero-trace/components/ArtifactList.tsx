/**
 * ArtifactList — Categorized artifact display for app and OS scan results
 * @module features/zero-trace/components/ArtifactList
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import {
  ztColors,
  getSeverityIcon,
  getSeverityColor,
  getStatusIcon,
  getStatusColor,
} from '../domain/zero-trace.data';
import type { ScanResults, OsScanResults } from '../domain/zero-trace.types';

// ── App Scan Results Sub-component ──────────────────────────────────

interface AppArtifactListProps {
  appScanResults: ScanResults;
  cleaning: boolean;
  onAppClean: () => void;
  t: (key: string) => string | undefined;
}

export const AppArtifactList = ({
  appScanResults,
  cleaning,
  onAppClean,
  t,
}: AppArtifactListProps) => (
  <View>
    {appScanResults.count > 0 ? (
      <View style={styles.scanResultsContainer}>
        <View style={styles.resultsHeader}>
          <Feather name="alert-triangle" size={18} color={ztColors.warning} />
          <Text style={[styles.resultsTitle, { color: ztColors.warning }]}>
            {appScanResults.count} trace
            {appScanResults.count !== 1 ? 's' : ''} detected
          </Text>
        </View>
        <View style={styles.artifactsList}>
          {appScanResults.artifacts.map((finding, idx) => (
            <View key={idx} style={styles.artifactItem}>
              <Feather
                name={getSeverityIcon(finding.severity)}
                size={14}
                color={getSeverityColor(finding.severity)}
              />
              <Text style={styles.artifactText}>{finding.description}</Text>
              {finding.canRemediate && (
                <Text style={{ fontSize: 10, color: ztColors.green, marginLeft: 4 }}>
                  Can clean
                </Text>
              )}
            </View>
          ))}
        </View>
        {/* Inline clean action when traces are found */}
        <Pressable
          accessibilityRole="button"
          style={[styles.inlineCleanButton, cleaning && { opacity: 0.6 }]}
          onPress={onAppClean}
          disabled={cleaning}
        >
          <Feather name="trash-2" size={14} color="#FFFFFF" />
          <Text style={styles.inlineCleanText}>
            {cleaning
              ? 'Cleaning...'
              : `Clean ${appScanResults.count} trace${appScanResults.count !== 1 ? 's' : ''}`}
          </Text>
        </Pressable>
      </View>
    ) : (
      <View style={[styles.scanResultsContainer, { borderColor: `${ztColors.green}40` }]}>
        <View style={styles.resultsHeader}>
          <Feather name="check-circle" size={18} color={ztColors.green} />
          <Text style={styles.resultsTitle}>
            {t('zeroTrace.noTraces') || 'No forensic traces detected'}
          </Text>
        </View>
      </View>
    )}

    {/* Category statuses */}
    <View style={styles.categoryGrid}>
      <Text style={styles.categoryGridTitle}>
        {t('zeroTrace.cleanupCapabilities') || 'Cleanup Capabilities'}
      </Text>
      {appScanResults.categoryStatuses.map(cat => (
        <View key={cat.category} style={styles.categoryRow}>
          <Feather name={getStatusIcon(cat.status)} size={14} color={getStatusColor(cat.status)} />
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryLabel}>{cat.label}</Text>
            <Text style={styles.categoryDesc}>{cat.description}</Text>
          </View>
          <Text style={[styles.categoryStatusText, { color: getStatusColor(cat.status) }]}>
            {cat.status === 'requires_desktop'
              ? 'Desktop'
              : cat.canClean
                ? cat.status === 'clean'
                  ? 'Clean'
                  : 'Dirty'
                : 'N/A'}
          </Text>
        </View>
      ))}
    </View>
  </View>
);

// ── OS Scan Results Sub-component ───────────────────────────────────

interface OsArtifactListProps {
  osScanResults: OsScanResults;
  t: (key: string) => string | undefined;
}

export const OsArtifactList = ({ osScanResults, t }: OsArtifactListProps) => (
  <View
    style={[
      styles.scanResultsContainer,
      {
        borderColor: osScanResults.count > 0 ? 'rgba(234, 179, 8, 0.25)' : `${ztColors.green}40`,
      },
    ]}
  >
    <View style={styles.resultsHeader}>
      <Feather
        name={osScanResults.count > 0 ? 'alert-triangle' : 'check-circle'}
        size={18}
        color={osScanResults.count > 0 ? ztColors.warning : ztColors.green}
      />
      <Text
        style={[
          styles.resultsTitle,
          {
            color: osScanResults.count > 0 ? ztColors.warning : ztColors.green,
          },
        ]}
      >
        {osScanResults.count > 0
          ? `${osScanResults.count} OS artifact${osScanResults.count !== 1 ? 's' : ''} found`
          : t('zeroTrace.noOsTraces') || 'No OS artifacts detected'}
      </Text>
    </View>
    {osScanResults.count > 0 && (
      <View>
        <View style={styles.artifactsList}>
          {osScanResults.artifacts.map((artifact: string, idx: number) => (
            <View key={idx} style={styles.artifactItem}>
              <Feather name="file" size={14} color={ztColors.textSecondary} />
              <Text style={styles.artifactText}>{artifact}</Text>
            </View>
          ))}
        </View>
        <Text
          style={{
            fontSize: 10,
            color: ztColors.textSecondary,
            marginTop: 6,
            fontStyle: 'italic',
          }}
        >
          These are OS metadata traces — not your vault files. Your encrypted data is safe. Some
          traces (like Spotlight indexes) are recreated by macOS while the drive is mounted. They
          will be permanently removed when you eject the USB.
        </Text>
      </View>
    )}
  </View>
);

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scanResultsContainer: {
    marginVertical: dashboardSpacing.md,
    padding: dashboardSpacing.md,
    backgroundColor: 'rgba(234, 179, 8, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(234, 179, 8, 0.25)',
  },
  resultsHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.sm,
  },
  resultsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: ztColors.green,
  },
  artifactsList: {
    gap: dashboardSpacing.sm,
  },
  artifactItem: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: dashboardSpacing.sm,
  },
  artifactText: {
    fontSize: 12,
    color: ztColors.textSecondary,
    flex: 1,
  },
  inlineCleanButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    marginTop: dashboardSpacing.sm,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: ztColors.danger,
  },
  inlineCleanText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  categoryGrid: {
    marginTop: dashboardSpacing.md,
    padding: dashboardSpacing.md,
    backgroundColor: 'rgba(139, 92, 246, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.15)',
  },
  categoryGridTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: ztColors.textSecondary,
    marginBottom: dashboardSpacing.sm,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  categoryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: dashboardSpacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(184, 179, 209, 0.06)',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: ztColors.textPrimary,
  },
  categoryDesc: {
    fontSize: 10,
    color: ztColors.textSecondary,
    marginTop: 1,
  },
  categoryStatusText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
