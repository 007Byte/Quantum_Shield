import { ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import { dashboardLayout, dashboardSpacing } from '@/components/dashboard2/styles';
import { useLanguage } from '@/hooks/useLanguage';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { usbService } from '@/services/usbService';
import { useActiveVaultStore } from '@/stores/activeVaultStore';
import { useVaultListStore } from '@/stores/vaultListStore';
import { formatFileSize } from '@/utils/formatters';
import type { PressableState } from '@/types/utilities';

// ── Category configuration ─────────────────────────────────────────────
const FILE_CATEGORIES: Record<string, { label: string; icon: string; color: string; extensions: string[] }> = {
  documents: {
    label: 'Documents',
    icon: 'file-text',
    color: '#8B5CF6',
    extensions: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'csv', 'xls', 'xlsx', 'pptx', 'ppt'],
  },
  images: {
    label: 'Images',
    icon: 'image',
    color: '#06B6D4',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tiff', 'heic'],
  },
  archives: {
    label: 'Archives',
    icon: 'archive',
    color: '#F59E0B',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'dmg', 'iso'],
  },
  media: {
    label: 'Media',
    icon: 'film',
    color: '#EC4899',
    extensions: ['mp4', 'mp3', 'wav', 'avi', 'mkv', 'mov', 'flac', 'ogg', 'aac', 'wmv'],
  },
  other: {
    label: 'Other',
    icon: 'file',
    color: '#6B7280',
    extensions: [],
  },
};

function categorizeFile(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  for (const [category, config] of Object.entries(FILE_CATEGORIES)) {
    if (category === 'other') continue;
    if (config.extensions.includes(ext)) return category;
  }
  return 'other';
}

// ── Types ──────────────────────────────────────────────────────────────

interface StorageData {
  used: number;          // vault container size on disk (bytes)
  total: number;         // partition total capacity (bytes)
  maxAllowed: number;    // 50% rule max vault size (bytes)
  remaining: number;     // remaining space for vault growth (bytes)
  percentage: number;    // vault size as % of partition total
  fileCount: number;
  totalFileBytes: number; // sum of encrypted file record lengths
}

interface UsageBreakdownItem {
  label: string;
  size: number;
  count: number;
  icon: string;
  color: string;
}

interface VaultFileInfo {
  name: string;
  size: number;
  createdAt: string;
}

// ── Main screen ────────────────────────────────────────────────────────

const StorageScreen = () => {
  const { t } = useLanguage();
  const { modal } = useInAppModal();

  const activeVaultId = useActiveVaultStore(s => s.activeVaultId);
  const currentVault = useVaultListStore(s => activeVaultId ? s.vaultsById[activeVaultId] : null);

  // State
  const [storageData, setStorageData] = useState<StorageData | null>(null);
  const [usageBreakdown, setUsageBreakdown] = useState<UsageBreakdownItem[]>([]);
  const [vaultFiles, setVaultFiles] = useState<VaultFileInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [vaultUnlocked, setVaultUnlocked] = useState(() => vaultOrchestrator.isUnlocked());
  const [largestFile, setLargestFile] = useState<{ name: string; size: number } | null>(null);

  // ── Load real data from vault index + USB companion ──────────────────
  const loadStorageData = useCallback(async () => {
    const index = vaultOrchestrator.getIndex();
    const activeVault = vaultOrchestrator.getActiveVault();
    if (!index || !activeVault) {
      setStorageData(null);
      setUsageBreakdown([]);
      setVaultFiles([]);
      setLargestFile(null);
      return;
    }

    setIsLoading(true);
    try {
      // ── 1. Analyze vault index for file-level stats ──────────────────
      const files = Object.entries(index.files);
      const fileCount = files.length;

      const categoryMap: Record<string, { size: number; count: number }> = {};
      let totalFileBytes = 0;
      let biggest: { name: string; size: number } | null = null;
      const fileInfos: VaultFileInfo[] = [];

      for (const [, entry] of files) {
        const cat = categorizeFile(entry.name);
        if (!categoryMap[cat]) categoryMap[cat] = { size: 0, count: 0 };
        categoryMap[cat].size += entry.length;
        categoryMap[cat].count += 1;
        totalFileBytes += entry.length;

        if (!biggest || entry.length > biggest.size) {
          biggest = { name: entry.name, size: entry.length };
        }

        fileInfos.push({
          name: entry.name,
          size: entry.length,
          createdAt: entry.createdAt,
        });
      }

      setLargestFile(biggest);
      setVaultFiles(fileInfos.sort((a, b) => b.size - a.size));

      // Build breakdown from real categories
      const breakdown: UsageBreakdownItem[] = Object.entries(FILE_CATEGORIES)
        .map(([key, config]) => {
          const translated = t(`storage.${key}`);
          const label = translated && !translated.startsWith('storage.') ? translated : config.label;
          return {
            label,
            size: categoryMap[key]?.size || 0,
            count: categoryMap[key]?.count || 0,
            icon: config.icon,
            color: config.color,
          };
        })
        .filter(item => item.size > 0)
        .sort((a, b) => b.size - a.size);

      setUsageBreakdown(breakdown);

      // ── 2. Fetch real drive capacity from USB companion ──────────────
      let driveTotal = 0;
      let vaultSize = 0;
      let maxAllowed = 0;
      let remaining = 0;

      try {
        const capacity = await usbService.checkCapacity(activeVault.mountPoint);
        driveTotal = capacity.partitionTotal;
        vaultSize = capacity.vaultSize;
        maxAllowed = capacity.maxAllowed;
        remaining = capacity.remaining;
      } catch {
        // Fallback: estimate from file data if companion is unreachable
        vaultSize = totalFileBytes;
        driveTotal = totalFileBytes * 4;
        maxAllowed = driveTotal / 2;
        remaining = maxAllowed - vaultSize;
      }

      const percentage = driveTotal > 0 ? (vaultSize / driveTotal) * 100 : 0;

      setStorageData({
        used: vaultSize,
        total: driveTotal,
        maxAllowed,
        remaining,
        percentage,
        fileCount,
        totalFileBytes,
      });
    } catch {
      setStorageData(null);
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // ── Subscribe to vault lock/unlock ───────────────────────────────────
  useEffect(() => {
    setVaultUnlocked(vaultOrchestrator.isUnlocked());
    const unsub = vaultOrchestrator.onLockStateChange((unlocked: boolean) => {
      setVaultUnlocked(unlocked);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (vaultUnlocked) {
      loadStorageData();
    } else {
      setStorageData(null);
      setUsageBreakdown([]);
      setVaultFiles([]);
      setLargestFile(null);
    }
  }, [vaultUnlocked, loadStorageData]);

  // ── Computed values ──────────────────────────────────────────────────
  const usagePercentages = useMemo(() => {
    if (!storageData || storageData.totalFileBytes === 0) return [];
    return usageBreakdown.map(item => (item.size / storageData.totalFileBytes) * 100);
  }, [storageData, usageBreakdown]);

  const capacityPercent = storageData ? Math.min(storageData.percentage, 100) : 0;
  const capacityBarWidth = capacityPercent > 0 && capacityPercent < 1 ? 1 : capacityPercent;
  const capacityColor = capacityPercent > 90 ? '#EF4444' : capacityPercent > 75 ? '#F59E0B' : '#8B5CF6';

  const formattedPercent = capacityPercent === 0
    ? '0%'
    : capacityPercent < 0.1
      ? '< 0.1%'
      : capacityPercent < 1
        ? `${capacityPercent.toFixed(2)}%`
        : `${capacityPercent.toFixed(1)}%`;

  // Vault overhead = vault container size minus actual file data
  const overhead = storageData ? Math.max(0, storageData.used - storageData.totalFileBytes) : 0;

  // ── Empty state ──────────────────────────────────────────────────────
  if (!vaultUnlocked || !storageData) {
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
                <View style={styles.headerSection}>
                  <Text style={styles.pageTitle} accessibilityRole="header">
                    {t('storage.pageTitle')}
                  </Text>
                  <Text style={styles.pageSubtitle}>
                    {t('storage.pageSubtitle')}
                  </Text>
                </View>
                <View style={[styles.card, styles.emptyStateCard]}>
                  {isLoading ? (
                    <>
                      <ActivityIndicator size="large" color="#8B5CF6" />
                      <Text style={styles.emptyStateText}>
                        {t('storage.loading')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Feather name="hard-drive" size={40} color="rgba(255,255,255,0.4)" />
                      <Text style={styles.emptyStateText}>
                        {t('storage.unlockToView')}
                      </Text>
                    </>
                  )}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>
        <InAppModal config={modal} />
      </View>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────
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
              {/* Header */}
              <View style={styles.headerSection}>
                <Text style={styles.pageTitle} accessibilityRole="header">
                  {t('storage.pageTitle')}
                </Text>
                <Text style={styles.pageSubtitle}>
                  {t('storage.pageSubtitle')}
                  {currentVault ? ` — ${currentVault.name}` : ''}
                </Text>
              </View>

              {/* ── Storage Overview Card ────────────────────────────── */}
              <View style={[styles.card, styles.storageOverviewCard]}>
                <View style={styles.overviewHeader}>
                  <View>
                    <Text style={styles.overviewTitle}>
                      {t('storage.vaultCapacity')}
                    </Text>
                    <Text style={styles.overviewSubtitle}>
                      {storageData.fileCount} {storageData.fileCount === 1 ? t('storage.file') : t('storage.files')} encrypted
                    </Text>
                  </View>
                  <Text style={styles.capacityText}>
                    {formatFileSize(storageData.used)} / {formatFileSize(storageData.total)}
                  </Text>
                </View>

                {/* Capacity bar */}
                <View style={styles.capacityBarContainer}>
                  <View style={styles.capacityBarBackground}>
                    <View
                      style={[
                        styles.capacityBarFill,
                        { width: `${capacityBarWidth}%` },
                        webOnly({
                          background: capacityPercent > 90
                            ? 'linear-gradient(90deg, #EF4444 0%, #DC2626 100%)'
                            : capacityPercent > 75
                              ? 'linear-gradient(90deg, #F59E0B 0%, #D97706 100%)'
                              : 'linear-gradient(90deg, #8B5CF6 0%, #06B6D4 100%)',
                        }),
                        { backgroundColor: capacityColor },
                      ]}
                    />
                  </View>
                  <View style={styles.capacityBarLabels}>
                    <Text style={styles.percentageText}>{formattedPercent} {t('storage.used')}</Text>
                    <Text style={styles.capacitySubtext}>
                      {formatFileSize(storageData.remaining)} {t('storage.remaining')}
                    </Text>
                  </View>
                </View>

                {/* Stats row */}
                <View style={styles.quotaRow}>
                  <View style={styles.quotaStat}>
                    <Text style={styles.quotaLabel}>{t('storage.vaultSize')}</Text>
                    <Text style={styles.quotaValue}>{formatFileSize(storageData.used)}</Text>
                  </View>
                  <View style={styles.quotaDivider} />
                  <View style={styles.quotaStat}>
                    <Text style={styles.quotaLabel}>{t('storage.maxAllowed')}</Text>
                    <Text style={styles.quotaValue}>{formatFileSize(storageData.maxAllowed)}</Text>
                  </View>
                  <View style={styles.quotaDivider} />
                  <View style={styles.quotaStat}>
                    <Text style={styles.quotaLabel}>{t('storage.fileData')}</Text>
                    <Text style={styles.quotaValue}>{formatFileSize(storageData.totalFileBytes)}</Text>
                  </View>
                </View>
              </View>

              {/* ── Usage Breakdown ──────────────────────────────────── */}
              {usageBreakdown.length > 0 && (
                <View style={styles.breakdownSection}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('storage.usageBreakdown')}
                  </Text>

                  <View style={styles.breakdownContainer}>
                    {/* Stacked bar */}
                    <View style={styles.stackedBarContainer}>
                      {usageBreakdown.map((item, index) => (
                        <View
                          key={item.label}
                          style={[
                            styles.stackedBarSegment,
                            {
                              width: `${usagePercentages[index]}%`,
                              backgroundColor: item.color,
                            },
                            index === 0 && { borderTopLeftRadius: 10, borderBottomLeftRadius: 10 },
                            index === usageBreakdown.length - 1 && { borderTopRightRadius: 10, borderBottomRightRadius: 10 },
                          ]}
                        />
                      ))}
                    </View>

                    {/* Category list */}
                    <View style={styles.breakdownList}>
                      {usageBreakdown.map(item => (
                        <View key={item.label} style={styles.breakdownItem}>
                          <View style={styles.breakdownItemLeft}>
                            <View style={[styles.colorIndicator, { backgroundColor: item.color }]} />
                            <View style={styles.breakdownItemTextWrap}>
                              <Text style={styles.breakdownLabel}>{item.label}</Text>
                              <Text style={styles.breakdownSize}>
                                {formatFileSize(item.size)} · {item.count} {item.count === 1 ? t('storage.file') : t('storage.files')}
                              </Text>
                            </View>
                          </View>
                          <Feather name={item.icon as any} size={18} color={item.color} />
                        </View>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* ── Vault File List ──────────────────────────────────── */}
              {vaultFiles.length > 0 && (
                <View style={styles.breakdownSection}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('storage.filesInVault')}
                  </Text>

                  <View style={styles.breakdownContainer}>
                    {vaultFiles.map((file, idx) => (
                      <View
                        key={`${file.name}-${idx}`}
                        style={[
                          styles.fileRow,
                          idx < vaultFiles.length - 1 && styles.fileRowBorder,
                        ]}
                      >
                        <View style={styles.fileIconWrap}>
                          <Feather
                            name={getFileIcon(file.name) as any}
                            size={16}
                            color="rgba(139,92,246,0.8)"
                          />
                        </View>
                        <View style={styles.fileInfo}>
                          <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                          <Text style={styles.fileMeta}>{formatFileSize(file.size)}</Text>
                        </View>
                        {largestFile && file.name === largestFile.name && (
                          <View style={styles.largestBadge}>
                            <Text style={styles.largestBadgeText}>Largest</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* ── Vault Overhead Card ──────────────────────────────── */}
              {overhead > 0 && (
                <View style={[styles.card, styles.overheadCard]}>
                  <View style={styles.overheadRow}>
                    <View style={styles.overheadIconWrap}>
                      <Feather name="layers" size={20} color="#F59E0B" />
                    </View>
                    <View style={styles.overheadContent}>
                      <Text style={styles.overheadTitle}>
                        {t('storage.vaultOverhead')}
                      </Text>
                      <Text style={styles.overheadDescription}>
                        {formatFileSize(overhead)} used by vault container structure (headers, index, encryption padding)
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Refresh button */}
              <View style={styles.refreshRow}>
                <Pressable
                  onPress={loadStorageData}
                  disabled={isLoading}
                  style={(state: PressableState) => [
                    styles.refreshButton,
                    state.hovered && styles.refreshButtonHover,
                  ] as any}
                  accessibilityRole="button"
                  accessibilityLabel={t('storage.refresh')}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#8B5CF6" />
                  ) : (
                    <Feather name="refresh-cw" size={14} color="#8B5CF6" />
                  )}
                  <Text style={styles.refreshButtonText}>
                    {isLoading ? t('storage.refreshing') : t('storage.refresh')}
                  </Text>
                </Pressable>
              </View>

              <View style={{ height: 40 }} />
            </View>
          </View>
        </View>
      </ScrollView>
      <InAppModal config={modal} />
    </View>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────

function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'file-text';
  if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'mp3', 'wav', 'avi', 'mkv', 'mov'].includes(ext)) return 'film';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return 'file-text';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'grid';
  if (['pptx', 'ppt'].includes(ext)) return 'monitor';
  return 'file';
}

// ── Styles ─────────────────────────────────────────────────────────────

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

  /* Header */
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

  /* Card base */
  card: {
    backgroundColor: 'rgba(8, 5, 20, 0.55)',
    borderRadius: 16,
    padding: dashboardSpacing.lg,
    marginBottom: dashboardSpacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    ...webOnly({ backdropFilter: 'blur(12px)' }),
  },

  /* Empty state */
  emptyStateCard: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 16,
  },
  emptyStateText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },

  /* Storage Overview */
  storageOverviewCard: {},
  overviewHeader: {
    marginBottom: dashboardSpacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  overviewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  overviewSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
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
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  capacityBarFill: {
    height: '100%',
    borderRadius: 7,
    backgroundColor: '#8B5CF6',
    ...webOnly({
      background: 'linear-gradient(90deg, #8B5CF6 0%, #06B6D4 100%)',
    }),
  },
  capacityBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  percentageText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.75)',
  },
  capacitySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '400',
  },

  /* Quota row */
  quotaRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: dashboardSpacing.md,
    paddingTop: dashboardSpacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  quotaStat: {
    alignItems: 'center',
    flex: 1,
  },
  quotaLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.45)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  quotaValue: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  quotaDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
  breakdownItemTextWrap: {
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

  /* File list */
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  fileRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  fileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileInfo: {
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 2,
  },
  fileMeta: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  largestBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  largestBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* Overhead card */
  overheadCard: {},
  overheadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dashboardSpacing.md,
  },
  overheadIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  overheadContent: {
    flex: 1,
  },
  overheadTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 4,
  },
  overheadDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
    lineHeight: 18,
  },

  /* Refresh button */
  refreshRow: {
    alignItems: 'center',
    marginTop: dashboardSpacing.lg,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
    backgroundColor: 'rgba(139, 92, 246, 0.08)',
    ...webOnly({ cursor: 'pointer', transition: 'all 0.15s ease' }),
  },
  refreshButtonHover: {
    backgroundColor: 'rgba(139, 92, 246, 0.18)',
    borderColor: 'rgba(139, 92, 246, 0.5)',
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8B5CF6',
  },
});

export default withErrorBoundary(StorageScreen, 'Storage');
