import React, { useState, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { webOnly } from '@/utils/webStyle';
import { SecurityRadarMetric } from '../types';
import { webOnlyEdgeLit, webOnlyGlassLuxury, webOnlyTransition } from '../styles';
import { RadarChart } from './RadarChart';

interface SecurityOverviewProps {
  metrics: SecurityRadarMetric[];
  isLight?: boolean;
}

interface RadarTooltipInfo {
  status: string;
  statusColor: string;
  current: string;
  suggestions: string[];
}

function getRadarTooltip(
  metricId: string,
  value: number,
  t: (key: string) => string,
  isLight = false
): RadarTooltipInfo {
  const pct = Math.round(value * 100);
  // Colors that are readable on both dark and light glass
  const statusColor =
    pct >= 80
      ? isLight
        ? '#059669'
        : '#4ADE80' // green: dark emerald for light, bright for dark
      : pct >= 50
        ? isLight
          ? '#D97706'
          : '#FBBF24' // amber: dark amber for light, bright yellow for dark
        : isLight
          ? '#DC2626'
          : '#EF4444'; // red: dark red for light, bright for dark
  const status = pct >= 80 ? 'strong' : pct >= 50 ? 'moderate' : 'needsAttention';

  switch (metricId) {
    case 'files':
      return {
        status,
        statusColor,
        current:
          pct >= 50
            ? `${pct}% — ${t('rightRail.filesEncryptedCurrent')}`
            : `${pct}% — ${t('rightRail.noFilesEncrypted')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.encryptionExcellent')]
            : [
                t('rightRail.suggestEncryptDocs'),
                t('rightRail.suggestPqcEncryption'),
                t('rightRail.suggestAutoEncrypt'),
              ],
      };
    case 'passwords':
      return {
        status,
        statusColor,
        current:
          pct >= 50
            ? `${pct}% — ${t('rightRail.passwordsStoredCurrent')}`
            : `${pct}% — ${t('rightRail.noPasswordsStored')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.passwordsWellPopulated')]
            : [
                t('rightRail.suggestImportPasswords'),
                t('rightRail.suggestPasswordGenerator'),
                t('rightRail.suggestBreachMonitoring'),
              ],
      };
    case 'backups':
      return {
        status,
        statusColor,
        current:
          pct >= 80
            ? `${pct}% — ${t('rightRail.backupSolid')}`
            : `${pct}% — ${t('rightRail.backupCouldImprove')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.backupComprehensive')]
            : [
                t('rightRail.suggestAutoBackup'),
                t('rightRail.suggestRecoveryPhrase'),
                t('rightRail.suggestSecondaryBackup'),
              ],
      };
    case 'sessions':
      return {
        status,
        statusColor,
        current:
          pct >= 50
            ? `${pct}% — ${t('rightRail.sessionMonitoring')}`
            : `${pct}% — ${t('rightRail.limitedSession')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.sessionWellMonitored')]
            : [
                t('rightRail.suggestReviewSessions'),
                t('rightRail.suggestAutoLock'),
                t('rightRail.suggestRememberDevice'),
              ],
      };
    case 'sharing':
      return {
        status,
        statusColor,
        current:
          pct >= 50
            ? `${pct}% — ${t('rightRail.sharingActive')}`
            : `${pct}% — ${t('rightRail.noShares')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.sharingSecure')]
            : [
                t('rightRail.suggestTimeLimited'),
                t('rightRail.suggestPinAccess'),
                t('rightRail.suggestVerifyFingerprints'),
              ],
      };
    case 'privacy':
      return {
        status,
        statusColor,
        current:
          pct >= 60
            ? `${pct}% — ${t('rightRail.privacyConfigured')}`
            : `${pct}% — ${t('rightRail.privacyNeedsAttention')}`,
        suggestions:
          pct >= 80
            ? [t('rightRail.privacyStrong')]
            : [
                t('rightRail.suggestBiometric'),
                t('rightRail.suggestFido2'),
                t('rightRail.suggestGhostMode'),
              ],
      };
    default:
      return { status, statusColor, current: `${pct}%`, suggestions: [] };
  }
}

/**
 * SecurityOverview - Radar chart card showing security metrics across 6 dimensions.
 *
 * Features:
 * - Hexagonal/N-axis radar visualization
 * - Interactive hover/press tooltips on each metric axis
 * - Contextual suggestions based on metric status
 * - Theme-aware tooltip styling
 *
 * @remarks
 * - Metrics are positioned dynamically around the radar circumference
 * - Tooltips appear below the chart and are only visible when hovering a metric
 * - Color scheme adapts to theme (light/dark)
 */
export const SecurityOverview = React.memo(function SecurityOverview({
  metrics,
  isLight,
}: SecurityOverviewProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [hoveredMetric, setHoveredMetric] = useState<number | null>(null);

  return (
    <View style={[styles.card, resolveLayerStyle(theme.L2.base)]}>
      <View style={styles.cardSheen} />
      <View style={styles.cardInnerBorder} />

      <Text style={[styles.cardTitle, { color: theme.L2.base.text.primary }]}>
        {t('rightRail.securityOverview')}
      </Text>

      <View style={styles.radarWrap}>
        <RadarChart metrics={metrics} isLight={isLight} />

        {/* Label overlays — one per axis, placed just outside each axis tip */}
        {/* PL-PERF: Memoize trig-heavy positioning so it only recalculates when metrics change */}
        {useMemo(
          () =>
            metrics.map((metric, idx) => {
              const angle = (Math.PI * 2 * idx) / metrics.length - Math.PI / 2;
              const svgCenter = 246 / 2;
              const scale = 236 / 246;
              const axisRadius = 82;
              const GAP = 6;
              const labelW = 68;
              const labelH = 20;

              const svgOffsetX = (290 - 236) / 2;
              const svgOffsetY = (260 - 236) / 2;

              const axisX = svgOffsetX + (svgCenter + Math.cos(angle) * axisRadius) * scale;
              const axisY = svgOffsetY + (svgCenter + Math.sin(angle) * axisRadius) * scale;

              const cosA = Math.cos(angle);
              const sinA = Math.sin(angle);

              let labelLeft: number;
              let labelTop: number;

              if (cosA >= 0.4) {
                labelLeft = axisX + GAP;
              } else if (cosA <= -0.4) {
                labelLeft = axisX - GAP - labelW;
              } else {
                labelLeft = axisX - labelW / 2;
              }

              if (sinA >= 0.4) {
                labelTop = axisY + GAP;
              } else if (sinA <= -0.4) {
                labelTop = axisY - GAP - labelH;
              } else {
                labelTop = axisY - labelH / 2;
              }

              const textAlign: 'left' | 'right' | 'center' =
                cosA >= 0.4 ? 'left' : cosA <= -0.4 ? 'right' : 'center';

              return (
                <Pressable
                  accessibilityRole="button"
                  key={`hover-${metric.id}`}
                  onHoverIn={() => setHoveredMetric(idx)}
                  onHoverOut={() => setHoveredMetric(null)}
                  onPressIn={() => setHoveredMetric(idx)}
                  onPressOut={() => setHoveredMetric(null)}
                  style={[
                    styles.radarHitZone,
                    {
                      left: labelLeft,
                      top: labelTop,
                      width: labelW,
                      height: labelH,
                    },
                  ]}
                >
                  <Text
                    style={[styles.radarHitLabel, { textAlign, color: theme.L2.base.text.primary }]}
                  >
                    {metric.label}
                  </Text>
                </Pressable>
              );
            }),
          [metrics, theme.L2.base.text.primary]
        )}
      </View>

      {/* Tooltip — appears below the chart when hovering */}
      {hoveredMetric !== null &&
        metrics[hoveredMetric] &&
        (() => {
          const m = metrics[hoveredMetric];
          const tip = getRadarTooltip(m.id, m.value, t, isLight);
          return (
            <View style={[styles.radarTooltip, resolveLayerStyle(theme.L4.base)]}>
              <View style={styles.tooltipHeader}>
                <Text style={[styles.tooltipTitle, { color: theme.L4.base.text.primary }]}>
                  {m.label}
                </Text>
                <View
                  style={[
                    styles.tooltipBadge,
                    {
                      backgroundColor: tip.statusColor + '22',
                      borderColor: tip.statusColor + '55',
                    },
                  ]}
                >
                  <View style={[styles.tooltipDot, { backgroundColor: tip.statusColor }]} />
                  <Text style={[styles.tooltipBadgeText, { color: tip.statusColor }]}>
                    {t(`rightRail.${tip.status}`)}
                  </Text>
                </View>
              </View>
              <Text style={[styles.tooltipCurrent, { color: theme.L4.base.text.secondary }]}>
                {tip.current}
              </Text>
              {tip.suggestions.map((s, i) => (
                <View key={i} style={styles.tooltipSuggestionRow}>
                  <Feather
                    name={
                      tip.statusColor === '#4ADE80' || tip.statusColor === '#059669'
                        ? 'check-circle'
                        : 'arrow-right'
                    }
                    size={11}
                    color={
                      tip.statusColor === '#4ADE80' || tip.statusColor === '#059669'
                        ? tip.statusColor
                        : theme.semantic.purple
                    }
                  />
                  <Text style={[styles.tooltipSuggestion, { color: theme.L4.base.text.primary }]}>
                    {s}
                  </Text>
                </View>
              ))}
            </View>
          );
        })()}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    ...webOnlyGlassLuxury,
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    padding: 16,
    position: 'relative',
    overflow: 'visible',
    minHeight: 296,
  },
  cardSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 62,
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(245,243,255,0.09), rgba(245,243,255,0))',
    }),
    opacity: 0.56,
  },
  cardInnerBorder: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(245,243,255,0.04)',
    pointerEvents: 'none',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  radarWrap: {
    width: 290,
    height: 260,
    marginTop: 6,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  radarHitZone: {
    position: 'absolute',
    zIndex: 10,
    justifyContent: 'center',
    ...webOnly({ cursor: 'pointer' }),
  },
  radarHitLabel: {
    fontSize: 15,
    fontWeight: '500',
    ...webOnly({ userSelect: 'none' }),
  },
  radarTooltip: {
    marginTop: 4,
    padding: 12,
    ...webOnly({
      animation: 'fadeIn 0.15s ease-out',
    }),
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tooltipTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  tooltipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tooltipBadgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  tooltipCurrent: {
    fontSize: 14,
    marginBottom: 6,
  },
  tooltipSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  tooltipSuggestion: {
    fontSize: 13,
    flex: 1,
    lineHeight: 15,
  },
});
