import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { InAppModal, useInAppModal } from '@/components/common';
import {
  auditService,
  AuditLogEntry,
  AuditAction,
  getActionLabel as getAuditLabel,
  getActionIcon as getAuditIcon,
  getActionColor,
} from '@/services/auditService';

import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import {
  dashboardSpacing,
  dashboardColors,
  glassPanelBase,
  webOnlyGlass,
  webOnlyTransition,
  webOnlyGlowTier3,
} from '@/components/dashboard2/styles';

const filterChips = ['All', 'Encrypt', 'Decrypt', 'Share', 'Login', 'System'];

const getActionIconForUI = (action: AuditAction): { iconName: keyof typeof Feather.glyphMap; color: string } => {
  const iconName = getAuditIcon(action) as keyof typeof Feather.glyphMap;
  const color = getActionColor(action);
  return { iconName, color };
};

const getStatusDot = (status: string) => {
  switch (status) {
    case 'success':
      return dashboardColors.green;
    case 'warning':
      return '#FBBF24';
    case 'error':
      return '#EF4444';
    default:
      return dashboardColors.textSecondary;
  }
};

const filterAction = (action: AuditAction, filter: string): boolean => {
  if (filter === 'All') return true;
  if (filter === 'Encrypt' && action === 'encrypt') return true;
  if (filter === 'Decrypt' && action === 'decrypt') return true;
  if (filter === 'Share' && ['share', 'share_accept', 'share_reject', 'share_revoke'].includes(action)) return true;
  if (filter === 'Login' && ['login', 'logout', 'failed_login'].includes(action)) return true;
  if (filter === 'System' && ['key_rotation', 'vault_backup', 'policy_update', 'settings_change', 'system', 'vault_create', 'vault_delete', 'password_change', 'fido2_register', 'fido2_revoke'].includes(action)) return true;
  return false;
};

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
};

export default function ActivityScreen() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const { modal, showSuccess, showConfirm } = useInAppModal();

  const loadEntries = useCallback(async () => {
    // We load all and filter client-side for chip matching (multiple actions per chip)
    const logs = await auditService.getEntries({ limit: 500 });
    setEntries(logs);
  }, []);

  useEffect(() => {
    loadEntries();
    // Refresh every 5 seconds to pick up new entries
    const interval = setInterval(loadEntries, 5000);
    return () => clearInterval(interval);
  }, [loadEntries]);

  const filteredEntries = entries.filter((entry) => filterAction(entry.action, activeFilter));

  const handleExportLogs = async () => {
    await auditService.exportLogs();
    showSuccess('Exported', 'Audit log downloaded as JSON');
  };

  const handleClearLogs = () => {
    showConfirm(
      'Clear All Logs',
      'This will permanently delete all audit log entries. This cannot be undone.',
      async () => {
        await auditService.clear();
        setEntries([]);
        showSuccess('Cleared', 'All audit log entries have been removed');
      },
      'Clear All',
      'destructive',
    );
  };

  return (
    <ShellLayout>
            <View style={styles.contentWrapper}>
              {/* Header with Title + Actions */}
              <View style={styles.header}>
                <View style={styles.headerRow}>
                  <Text style={styles.title}>Activity Log</Text>
                  <View style={styles.headerActions}>
                    <Pressable
                      style={(state: any) => [styles.headerBtn, webOnlyTransition, state.hovered && styles.headerBtnHover]}
                      onPress={handleExportLogs}
                    >
                      <Feather name="download" size={14} color={dashboardColors.cyan} />
                      <Text style={styles.headerBtnText}>Export</Text>
                    </Pressable>
                    <Pressable
                      style={(state: any) => [styles.headerBtn, styles.headerBtnDanger, webOnlyTransition, state.hovered && styles.headerBtnDangerHover]}
                      onPress={handleClearLogs}
                    >
                      <Feather name="trash-2" size={14} color="#EF4444" />
                      <Text style={styles.headerBtnDangerText}>Clear</Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              {/* Filter Chips */}
              <View style={styles.filterBar}>
                {filterChips.map((chip) => (
                  <Pressable
                    key={chip}
                    style={(state: any) => [
                      styles.filterChip,
                      activeFilter === chip && styles.filterChipActive,
                      webOnlyTransition,
                      state.hovered && styles.filterChipHover,
                    ]}
                    onPress={() => setActiveFilter(chip)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        activeFilter === chip && styles.filterChipTextActive,
                      ]}
                    >
                      {chip}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Activity Timeline */}
              <View style={styles.timelineContainer}>
                {filteredEntries.map((entry) => {
                  const { iconName, color } = getActionIconForUI(entry.action);
                  const statusDotColor = getStatusDot(entry.status);
                  const actionLabel = getAuditLabel(entry.action);
                  const resource = entry.resource && entry.resource !== 'system' ? ` — ${entry.resource}` : '';

                  return (
                    <Pressable key={entry.id} style={(state: any) => [styles.timelineEntry, glassPanelBase, webOnlyGlass, webOnlyGlowTier3, state.hovered && styles.timelineEntryHover]}>
                      {/* Icon */}
                      <View style={styles.iconWrapper}>
                        <View style={[styles.iconBg]}>
                          <Feather name={iconName} size={20} color={color} />
                        </View>
                      </View>

                      {/* Content */}
                      <View style={styles.entryContent}>
                        <Text style={styles.actionLabel}>{actionLabel}{resource}</Text>
                        <View style={styles.entryMeta}>
                          <Text style={styles.metaUser}>{entry.userId}</Text>
                          <Text style={styles.metaSeparator}>•</Text>
                          <Text style={styles.metaTime}>{formatTimestamp(entry.timestamp)}</Text>
                        </View>
                      </View>

                      {/* Status Dot */}
                      <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
                    </Pressable>
                  );
                })}
              </View>

              {/* Empty State */}
              {filteredEntries.length === 0 && (
                <View style={styles.emptyState}>
                  <Feather name="inbox" size={48} color={dashboardColors.textSecondary} />
                  <Text style={styles.emptyText}>No activity found for this filter</Text>
                </View>
              )}
            </View>
      <InAppModal config={modal} />
    </ShellLayout>
  );
}

const styles = StyleSheet.create({
  // PL-010: Shell styles now in <ShellLayout />
  contentWrapper: {
    paddingTop: dashboardSpacing.lg,
    backgroundColor: 'rgba(8,5,20,0.55)',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    ...webOnly({ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }),
  },
  header: {
    marginBottom: dashboardSpacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
  },
  headerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.3)',
    backgroundColor: 'rgba(34,211,238,0.1)',
    ...webOnly({ cursor: 'pointer' }),
  },
  headerBtnHover: {
    borderColor: 'rgba(34,211,238,0.5)',
    backgroundColor: 'rgba(34,211,238,0.2)',
    ...webOnly({ boxShadow: '0 0 12px rgba(34,211,238,0.3)' }),
  },
  headerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: dashboardColors.cyan,
  },
  headerBtnDanger: {
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  headerBtnDangerHover: {
    borderColor: 'rgba(239,68,68,0.5)',
    backgroundColor: 'rgba(239,68,68,0.2)',
    ...webOnly({ boxShadow: '0 0 12px rgba(239,68,68,0.3)' }),
  },
  headerBtnDangerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    letterSpacing: -0.5,
  },
  filterBar: {
    flexDirection: 'row',
    gap: dashboardSpacing.sm,
    marginBottom: dashboardSpacing.lg,
    paddingRight: dashboardSpacing.md,
    ...webOnly({ overflowX: 'auto' }),
  },
  filterChip: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.sm,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: dashboardColors.borderPurple,
    backgroundColor: 'transparent',
    ...webOnly({ cursor: 'pointer' }),
  },
  filterChipActive: {
    backgroundColor: dashboardColors.purple,
    borderColor: dashboardColors.purple,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: dashboardColors.textSecondary,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  filterChipHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  timelineContainer: {
    gap: dashboardSpacing.md,
  },
  timelineEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    gap: dashboardSpacing.md,
    minHeight: 80,
  },
  timelineEntryHover: {
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.12)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.25), 0 0 24px rgba(34,211,238,0.08)',
    }),
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
  },
  entryContent: {
    flex: 1,
    gap: 6,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.xs,
  },
  metaUser: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  metaSeparator: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  metaTime: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: dashboardSpacing.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: dashboardSpacing.md,
  },
  emptyText: {
    fontSize: 16,
    color: dashboardColors.textSecondary,
  },
});
