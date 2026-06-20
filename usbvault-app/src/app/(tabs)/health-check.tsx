/**
 * Health Check Screen (SCR-15)
 *
 * Diagnostic and vault integrity monitoring interface with real-time
 * system health status, component checks, and recommendations.
 * Implements glassmorphic design with circular progress indicators.
 */

import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { useLanguage } from '@/hooks/useLanguage';
import {
  dashboardLayout,
  dashboardSpacing,
  dashboardColors,
  glassPanelBase,
  webOnlyGlass,
  webOnlyTransition,
} from '@/components/dashboard2/styles';

// ── Types ──────────────────────────────────────────────────────────

interface HealthCheck {
  id: string;
  title: string;
  icon: string;
  status: 'passed' | 'warning' | 'failed';
  statusText: string;
  lastChecked: string;
}

interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

// ── Main Component ─────────────────────────────────────────────────

function HealthCheckScreen() {
  const { t } = useLanguage();
  const [isRunning, setIsRunning] = useState(false);

  const healthChecks: HealthCheck[] = [
    {
      id: 'vault-integrity',
      title: t('healthCheck.vaultIntegrity'),
      icon: 'check-circle',
      status: 'passed',
      statusText: t('healthCheck.passed'),
      lastChecked: t('healthCheck.lastChecked5mins'),
    },
    {
      id: 'encryption-strength',
      title: t('healthCheck.encryptionStrength'),
      icon: 'shield',
      status: 'passed',
      statusText: t('healthCheck.pqcActive'),
      lastChecked: t('healthCheck.lastChecked12mins'),
    },
    {
      id: 'key-health',
      title: t('healthCheck.keyHealth'),
      icon: 'key',
      status: 'passed',
      statusText: t('healthCheck.keysValid'),
      lastChecked: t('healthCheck.lastChecked8mins'),
    },
    {
      id: 'storage-health',
      title: t('healthCheck.storageHealth'),
      icon: 'hard-drive',
      status: 'warning',
      statusText: t('healthCheck.optimal'),
      lastChecked: t('healthCheck.lastChecked2mins'),
    },
    {
      id: 'backup-status',
      title: t('healthCheck.backupStatus'),
      icon: 'save',
      status: 'warning',
      statusText: t('healthCheck.lastBackup'),
      lastChecked: t('healthCheck.lastChecked1min'),
    },
    {
      id: 'file-consistency',
      title: t('healthCheck.fileConsistency'),
      icon: 'file-text',
      status: 'passed',
      statusText: t('healthCheck.allFilesVerified'),
      lastChecked: t('healthCheck.lastChecked3mins'),
    },
  ];

  const recommendations: Recommendation[] = [
    {
      id: 'backup-recommended',
      title: t('healthCheck.scheduleBackups'),
      description: t('healthCheck.scheduleBackupsDesc'),
      priority: 'high',
    },
    {
      id: 'storage-cleanup',
      title: t('healthCheck.optimizeStorage'),
      description: t('healthCheck.optimizeStorageDesc'),
      priority: 'medium',
    },
    {
      id: 'key-rotation',
      title: t('healthCheck.reviewKeyRotation'),
      description: t('healthCheck.reviewKeyRotationDesc'),
      priority: 'low',
    },
  ];

  const overallHealth = 92;

  const handleRunDiagnostic = () => {
    setIsRunning(true);
    setTimeout(() => {
      setIsRunning(false);
    }, 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'passed':
        return dashboardColors.green;
      case 'warning':
        return '#EAB308';
      case 'failed':
        return '#EF4444';
      default:
        return dashboardColors.textSecondary;
    }
  };

  const getIconColor = (status: string) => {
    switch (status) {
      case 'passed':
        return dashboardColors.green;
      case 'warning':
        return '#EAB308';
      case 'failed':
        return '#EF4444';
      default:
        return dashboardColors.cyan;
    }
  };

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

            <View style={styles.contentWrapper}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title} accessibilityRole="header">
                  {t('healthCheck.pageTitle')}
                </Text>
                <Text style={styles.subtitle}>{t('healthCheck.pageSubtitle')}</Text>
              </View>

              {/* Overall Health Score */}
              <View style={[styles.healthScoreCard, glassPanelBase, webOnlyGlass]}>
                <View style={styles.healthScoreContent}>
                  <View style={styles.healthScoreCircle}>
                    <Text style={styles.healthScoreValue}>{overallHealth}%</Text>
                    <Text style={styles.healthScoreLabel}>{t('healthCheck.healthy')}</Text>
                  </View>
                  <View style={styles.healthScoreDetails}>
                    <Text style={styles.healthScoreTitle}>{t('healthCheck.overallHealth')}</Text>
                    <Text style={styles.healthScoreDescription}>
                      {t('healthCheck.operatingOptimally')}
                    </Text>
                    <View style={styles.healthScoreMetrics}>
                      <View style={styles.metric}>
                        <Text style={styles.metricValue}>6/6</Text>
                        <Text style={styles.metricLabel}>{t('healthCheck.checksPassed')}</Text>
                      </View>
                      <View style={styles.metric}>
                        <Text style={styles.metricValue}>0</Text>
                        <Text style={styles.metricLabel}>{t('healthCheck.criticalIssues')}</Text>
                      </View>
                      <View style={styles.metric}>
                        <Text style={styles.metricValue}>2</Text>
                        <Text style={styles.metricLabel}>{t('healthCheck.warnings')}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* Run Diagnostic Button */}
              <Pressable
                accessibilityRole="button"
                onPress={handleRunDiagnostic}
                disabled={isRunning}
                style={(state: any) => [
                  styles.runButton,
                  state.pressed && styles.runButtonPressed,
                  isRunning && styles.runButtonLoading,
                ]}
              >
                <Feather
                  name={isRunning ? 'loader' : 'play-circle'}
                  size={18}
                  color="#FFFFFF"
                  style={isRunning && styles.spinIcon}
                />
                <Text style={styles.runButtonText}>
                  {isRunning ? t('healthCheck.running') : t('healthCheck.runDiagnostic')}
                </Text>
              </Pressable>

              {/* Health Checks Grid */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('healthCheck.systemDiagnostics')}
                </Text>
                <View style={styles.checksGrid}>
                  {healthChecks.map(check => (
                    <View key={check.id} style={[styles.checkCard, glassPanelBase, webOnlyGlass]}>
                      <View style={styles.checkCardHeader}>
                        <View style={styles.checkIconWrapper}>
                          <Feather
                            name={check.icon as any}
                            size={24}
                            color={getIconColor(check.status)}
                          />
                        </View>
                        <View
                          style={[
                            styles.statusIndicator,
                            { backgroundColor: getStatusColor(check.status) },
                          ]}
                        />
                      </View>

                      <View style={styles.checkCardContent}>
                        <Text style={styles.checkTitle}>{check.title}</Text>
                        <Text style={[styles.checkStatus, { color: getStatusColor(check.status) }]}>
                          {check.statusText}
                        </Text>
                      </View>

                      <View style={styles.checkCardFooter}>
                        <Text style={styles.checkTimestamp}>{check.lastChecked}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Recommendations Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('healthCheck.recommendations')}
                </Text>
                <View style={styles.recommendationsContainer}>
                  {recommendations.map(rec => (
                    <Pressable
                      accessibilityRole="button"
                      key={rec.id}
                      style={(state: any) => [
                        styles.recommendationCard,
                        glassPanelBase,
                        webOnlyGlass,
                        state.hovered && styles.recommendationCardHover,
                      ]}
                    >
                      <View style={styles.recContent}>
                        <View style={styles.recHeader}>
                          <Text style={styles.recTitle}>{rec.title}</Text>
                          <View
                            style={[
                              styles.recPriorityBadge,
                              rec.priority === 'high' && styles.recPriorityHigh,
                              rec.priority === 'medium' && styles.recPriorityMedium,
                              rec.priority === 'low' && styles.recPriorityLow,
                            ]}
                          >
                            <Text
                              style={[
                                styles.recPriorityText,
                                rec.priority === 'high' && styles.recPriorityTextHigh,
                                rec.priority === 'medium' && styles.recPriorityTextMedium,
                                rec.priority === 'low' && styles.recPriorityTextLow,
                              ]}
                            >
                              {rec.priority}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.recDescription}>{rec.description}</Text>
                      </View>
                      <Feather name="arrow-right" size={18} color={dashboardColors.cyan} />
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────

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
  contentWrapper: {
    width: '100%',
    gap: dashboardSpacing.lg,
  },
  header: {
    marginBottom: dashboardSpacing.md,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    marginBottom: dashboardSpacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    fontWeight: '400',
  },
  healthScoreCard: {
    padding: dashboardSpacing.lg,
    marginBottom: dashboardSpacing.md,
    ...webOnlyTransition,
  },
  healthScoreContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.xl,
  },
  healthScoreCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderWidth: 2,
    borderColor: 'rgba(34,211,238,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    ...webOnly({
      boxShadow: '0 0 40px rgba(34,211,238,0.2), inset 0 0 30px rgba(34,211,238,0.1)',
    }),
  },
  healthScoreValue: {
    fontSize: 48,
    fontWeight: '700',
    color: dashboardColors.green,
  },
  healthScoreLabel: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    marginTop: dashboardSpacing.xs,
  },
  healthScoreDetails: {
    flex: 1,
    gap: dashboardSpacing.sm,
  },
  healthScoreTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  healthScoreDescription: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    lineHeight: 19,
  },
  healthScoreMetrics: {
    flexDirection: 'row',
    gap: dashboardSpacing.lg,
    marginTop: dashboardSpacing.md,
  },
  metric: {
    gap: dashboardSpacing.xs,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: dashboardColors.cyan,
  },
  metricLabel: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  runButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.lg,
    ...webOnly({
      background: 'linear-gradient(135deg, rgba(139,92,246,0.8) 0%, rgba(34,211,238,0.6) 100%)',
      cursor: 'pointer',
      transition: 'all 0.25s ease',
    }),
    backgroundColor: 'rgba(139,92,246,0.7)',
  },
  runButtonPressed: {
    opacity: 0.8,
  },
  runButtonLoading: {
    opacity: 0.7,
  },
  spinIcon: {
    ...webOnly({
      animation: 'spin 2s linear infinite',
    }),
  },
  runButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  section: {
    gap: dashboardSpacing.md,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  checksGrid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: dashboardSpacing.md,
  },
  checkCard: {
    flex: 1,
    minWidth: '45%',
    padding: dashboardSpacing.md,
    ...webOnlyTransition,
  },
  checkCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: dashboardSpacing.md,
  },
  checkIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  checkCardContent: {
    gap: dashboardSpacing.xs,
    marginBottom: dashboardSpacing.md,
  },
  checkTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  checkStatus: {
    fontSize: 13,
    fontWeight: '500',
  },
  checkCardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.15)',
    paddingTop: dashboardSpacing.sm,
  },
  checkTimestamp: {
    fontSize: 11,
    color: dashboardColors.textSecondary,
    paddingTop: dashboardSpacing.sm,
  },
  recommendationsContainer: {
    gap: dashboardSpacing.md,
  },
  recommendationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: dashboardSpacing.md,
    ...webOnlyTransition,
  },
  recommendationCardHover: {
    ...webOnly({
      background: 'rgba(34,211,238,0.08)',
    }),
  },
  recContent: {
    flex: 1,
    gap: dashboardSpacing.sm,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: dashboardSpacing.sm,
  },
  recTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    flex: 1,
  },
  recPriorityBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  recPriorityHigh: {
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  recPriorityMedium: {
    backgroundColor: 'rgba(234,179,8,0.15)',
  },
  recPriorityLow: {
    backgroundColor: 'rgba(34,211,238,0.15)',
  },
  recPriorityText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(139,92,246,0.8)',
    textTransform: 'capitalize',
  },
  recPriorityTextHigh: {
    color: '#EF4444',
  },
  recPriorityTextMedium: {
    color: '#EAB308',
  },
  recPriorityTextLow: {
    color: dashboardColors.cyan,
  },
  recDescription: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    lineHeight: 18,
  },
});

export default withErrorBoundary(HealthCheckScreen, 'HealthCheck');
