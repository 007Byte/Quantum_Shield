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
} from '@/components/dashboard2/styles';

const StorageScreen = () => {
  const [cleanupInProgress, setCleanupInProgress] = useState<string | null>(null);
  const { modal, showSuccess } = useInAppModal();

  const storageData = {
    used: 4.2,
    total: 16,
    percentage: 26.25,
  };

  const usageBreakdown = [
    { label: 'Documents', size: 1.8, icon: 'file-text', color: '#b844ff' },
    { label: 'Archives', size: 1.2, icon: 'archive', color: '#00d9ff' },
    { label: 'Images', size: 0.6, icon: 'image', color: '#10b981' },
    { label: 'Passwords', size: 0.2, icon: 'lock', color: '#f59e0b' },
    { label: 'Other', size: 0.4, icon: 'folder', color: '#6b7280' },
  ];

  const recommendations = [
    {
      id: 'backup-cleanup',
      title: 'Remove 2 expired backups',
      description: 'Delete outdated backup files to free 800 MB of space',
      freeSpace: '800 MB',
      icon: 'trash-2',
    },
    {
      id: 'vault-compact',
      title: 'Compact vault structure',
      description: 'Optimize vault storage layout to recover unused space',
      freeSpace: '120 MB',
      icon: 'zap',
    },
    {
      id: 'temp-clean',
      title: 'Clear temporary files',
      description: 'Remove cache and temporary data from previous operations',
      freeSpace: '45 MB',
      icon: 'wind',
    },
  ];

  const handleCleanup = (recommendationId: string) => {
    setCleanupInProgress(recommendationId);
    setTimeout(() => {
      setCleanupInProgress(null);
      showSuccess('Cleanup Complete', 'Storage optimization completed successfully.');
    }, 2000);
  };

  const usagePercentages = usageBreakdown.map((item) => (item.size / storageData.total) * 100);

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
              <Text style={styles.pageTitle}>Storage</Text>
              <Text style={styles.pageSubtitle}>Monitor vault capacity and usage</Text>
            </View>

            {/* Storage Overview Card */}
            <View style={[styles.card, styles.storageOverviewCard]}>
              <View style={styles.overviewHeader}>
                <Text style={styles.overviewTitle}>Vault Capacity</Text>
                <Text style={styles.capacityText}>
                  {storageData.used} GB / {storageData.total} GB
                </Text>
              </View>

              {/* Capacity Progress Bar */}
              <View style={styles.capacityBarContainer}>
                <View style={styles.capacityBarBackground}>
                  <View
                    style={[
                      styles.capacityBarFill,
                      { width: `${storageData.percentage}%` },
                    ]}
                  />
                </View>
                <Text style={styles.percentageText}>{storageData.percentage.toFixed(1)}%</Text>
              </View>

              <Text style={styles.capacitySubtext}>
                {(storageData.total - storageData.used).toFixed(1)} GB available
              </Text>
            </View>

            {/* Usage Breakdown Section */}
            <View style={styles.breakdownSection}>
              <Text style={styles.sectionTitle}>Usage Breakdown</Text>

              <View style={styles.breakdownContainer}>
                {/* Stacked horizontal bar */}
                <View style={styles.stackedBarContainer}>
                  {usageBreakdown.map((item, index) => (
                    <View
                      key={item.label}
                      style={[
                        styles.stackedBarSegment,
                        { width: `${usagePercentages[index]}%`, backgroundColor: item.color },
                      ]}
                    />
                  ))}
                </View>

                {/* Breakdown list */}
                <View style={styles.breakdownList}>
                  {usageBreakdown.map((item) => (
                    <View key={item.label} style={styles.breakdownItem}>
                      <View style={styles.breakdownItemLeft}>
                        <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
                        <View style={styles.breakdownItemText}>
                          <Text style={styles.breakdownLabel}>{item.label}</Text>
                          <Text style={styles.breakdownSize}>{item.size} GB</Text>
                        </View>
                      </View>
                      <Feather name={item.icon as any} size={18} color={item.color} />
                    </View>
                  ))}
                </View>
              </View>
            </View>

            {/* Duplicate Detection Card */}
            <View style={[styles.card, styles.duplicateCard]}>
              <View style={styles.duplicateHeader}>
                <View style={styles.duplicateIconContainer}>
                  <Feather name="copy" size={24} color="#ff6b9d" />
                </View>
                <View style={styles.duplicateContent}>
                  <Text style={styles.duplicateTitle}>Duplicate Files Detected</Text>
                  <Text style={styles.duplicateCount}>3 potential duplicates found</Text>
                </View>
              </View>
              <Pressable style={styles.reviewButton}>
                <Text style={styles.reviewButtonText}>Review</Text>
                <Feather name="arrow-right" size={16} color="#fff" />
              </Pressable>
            </View>

            {/* Cleanup Recommendations */}
            <View style={styles.recommendationsSection}>
              <Text style={styles.sectionTitle}>Cleanup Recommendations</Text>

              {recommendations.map((rec) => (
                <View key={rec.id} style={[styles.card, styles.recommendationCard]}>
                  <View style={styles.recommendationHeader}>
                    <View style={styles.recommendationIconContainer}>
                      <Feather name={rec.icon as any} size={20} color="#00d9ff" />
                    </View>
                    <View style={styles.recommendationContent}>
                      <Text style={styles.recommendationTitle}>{rec.title}</Text>
                      <Text style={styles.recommendationDescription}>{rec.description}</Text>
                    </View>
                  </View>

                  <View style={styles.recommendationFooter}>
                    <Text style={styles.freeSpaceText}>Recover {rec.freeSpace}</Text>
                    <Pressable
                      style={[
                        styles.cleanupButton,
                        cleanupInProgress === rec.id && styles.cleanupButtonActive,
                      ]}
                      onPress={() => handleCleanup(rec.id)}
                      disabled={cleanupInProgress !== null}
                    >
                      <Text style={styles.cleanupButtonText}>
                        {cleanupInProgress === rec.id ? 'Cleaning...' : 'Clean Up'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>

            {/* Spacing */}
            <View style={{ height: 40 }} />
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

  /* Header Section */
  headerSection: {
    marginBottom: dashboardSpacing.lg,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '400',
  },

  /* Storage Overview Card */
  card: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 16,
    padding: dashboardSpacing.lg,
    marginBottom: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    ...webOnly({ backdropFilter: 'blur(12px)' }),
  },
  storageOverviewCard: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
  },
  overviewHeader: {
    marginBottom: dashboardSpacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  capacityText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00d9ff',
  },
  capacityBarContainer: {
    marginBottom: dashboardSpacing.md,
  },
  capacityBarBackground: {
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: dashboardSpacing.sm,
  },
  capacityBarFill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: '#b844ff',
    ...webOnly({
      background: 'linear-gradient(90deg, #b844ff 0%, #00d9ff 100%)',
    }),
  },
  percentageText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.75)',
    textAlign: 'right',
  },
  capacitySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
  },

  /* Usage Breakdown */
  breakdownSection: {
    marginBottom: dashboardSpacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: dashboardSpacing.md,
  },
  breakdownContainer: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 16,
    padding: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    ...webOnly({ backdropFilter: 'blur(12px)' }),
  },
  stackedBarContainer: {
    height: 20,
    borderRadius: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: dashboardSpacing.lg,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  stackedBarSegment: {
    height: '100%',
  },
  breakdownList: {
    gap: dashboardSpacing.md,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: dashboardSpacing.sm,
  },
  breakdownItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: dashboardSpacing.md,
  },
  colorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  breakdownItemText: {
    flex: 1,
  },
  breakdownLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 2,
  },
  breakdownSize: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
  },

  /* Duplicate Detection Card */
  duplicateCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: dashboardSpacing.lg,
  },
  duplicateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: dashboardSpacing.md,
  },
  duplicateIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 107, 157, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  duplicateContent: {
    flex: 1,
  },
  duplicateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
  },
  duplicateCount: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '400',
  },
  reviewButton: {
    flexDirection: 'row',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 217, 255, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.4)',
    alignItems: 'center',
    gap: 6,
  },
  reviewButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00d9ff',
  },

  /* Cleanup Recommendations */
  recommendationsSection: {
    gap: dashboardSpacing.md,
  },
  recommendationCard: {
    gap: dashboardSpacing.md,
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dashboardSpacing.md,
  },
  recommendationIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 217, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  recommendationContent: {
    flex: 1,
  },
  recommendationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
  },
  recommendationDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
    lineHeight: 18,
  },
  recommendationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 60,
  },
  freeSpaceText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(0, 217, 255, 0.8)',
  },
  cleanupButton: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(0, 217, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 217, 255, 0.3)',
  },
  cleanupButtonActive: {
    backgroundColor: 'rgba(0, 217, 255, 0.25)',
    borderColor: 'rgba(0, 217, 255, 0.5)',
  },
  cleanupButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#00d9ff',
  },
});

export default StorageScreen;
