import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { webOnly } from '@/utils/webStyle';
import {
  auditService,
  type AuditLogEntry,
  getActionIcon,
  getActionLabel,
} from '@/services/auditService';
import { activityHighlightStore } from '@/stores/activityHighlightStore';
import { DropdownItem } from './DropdownItem';
import { baseControl, sharedStyles, PressableWithClick } from './shared';
import type { PressableState } from '@/types/utilities';

interface NotificationBellProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

interface NotificationItem {
  key: string;
  entryId: string;
  message: string;
  time: string;
  icon: string;
  isUnread: boolean;
}

const styles = StyleSheet.create({
  notificationBtn: {
    ...baseControl,
    paddingHorizontal: 12,
    gap: 8,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F43F5E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    ...webOnly({ boxShadow: '0 0 12px rgba(244,63,94,0.85)' }),
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  dropdown: {
    ...sharedStyles.dropdown,
    minWidth: 260,
  },
  notifHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    ...webOnly({ cursor: 'pointer', transition: 'background 0.12s ease' }),
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: '600',
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 4,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 10,
    flexShrink: 0,
    ...webOnly({ boxShadow: '0 0 6px rgba(34,211,238,0.7)' }),
  },
  unreadDotSpacer: {
    width: 10,
    marginLeft: 10,
    flexShrink: 0,
  },
  notifItemPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 8,
    ...webOnly({ cursor: 'pointer', transition: 'all 0.12s ease' }),
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    ...webOnly({ cursor: 'pointer', transition: 'background 0.12s ease' }),
  },
  notifEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  notifEmptyText: {
    fontSize: 14,
    fontWeight: '500',
  },
  notifIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: {
    flex: 1,
  },
  notifMessage: {
    fontSize: 15,
    fontWeight: '500',
  },
  notifMessageUnread: {
    fontWeight: '700',
  },
  notifTime: {
    fontSize: 13,
    marginTop: 2,
  },
  controlText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

/**
 * NotificationBell: Notification dropdown with audit log entries
 *
 * Features:
 * - Shows unread count badge on bell icon
 * - Displays recent activity from audit log
 * - Dismiss individual notifications
 * - Clear all notifications at once
 * - Filters out noise from audit log (errors, system events)
 * - Persists read/dismissed state to localStorage
 * - Polls audit service with visibility-aware optimization
 * - Theme-aware styling
 */
export const NotificationBell = React.memo(function NotificationBell({
  isOpen,
  onToggle,
  onClose,
}: NotificationBellProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { theme } = useTheme();

  // Notification read/dismiss tracking — persisted to localStorage
  const NOTIF_READ_KEY = 'usbvault:notif_last_read';
  const NOTIF_DISMISSED_KEY = 'usbvault:notif_dismissed';

  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);
  const [lastReadTimestamp, setLastReadTimestamp] = useState<string>(() => {
    try {
      return localStorage.getItem(NOTIF_READ_KEY) || new Date(0).toISOString();
    } catch {
      return new Date(0).toISOString();
    }
  });
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(NOTIF_DISMISSED_KEY);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  });

  /**
   * Format notification timestamp relative to now
   */
  const formatNotifTime = useCallback(
    (ts: string) => {
      const diff = Date.now() - new Date(ts).getTime();
      const mins = Math.floor(diff / 60000);
      if (mins < 1) return t('topBar.justNow');
      if (mins < 60) return t('topBar.minsAgo', { mins });
      const hours = Math.floor(mins / 60);
      if (hours < 24) return t('topBar.hoursAgo', { hours });
      const days = Math.floor(hours / 24);
      return t('topBar.daysAgo', { days });
    },
    [t]
  );

  /**
   * Stable key for each notification — used for dismiss tracking
   */
  const notifKey = useCallback(
    (entry: AuditLogEntry) => `${entry.timestamp}_${entry.action}_${entry.resource || ''}`,
    []
  );

  // PL-015: Load recent audit entries with visibility-aware polling
  // Pauses polling when tab is hidden to save CPU/battery
  useEffect(() => {
    const loadNotifications = async () => {
      try {
        // Fetch more than 5 so we still have enough after filtering out errors
        const entries = await auditService.getEntries({ limit: 20 });
        // Filter out noise — internal failures and low-value system events
        const NOISE_ACTIONS = new Set(['usb_list_drives_failed', 'usb_discover_vaults_failed']);
        const NOISE_RESOURCES = new Set([
          'boot_hardening_complete',
          'usb_list_drives_failed',
          'usb_discover_vaults_failed',
        ]);
        const meaningful = entries
          .filter(
            e =>
              e.status !== 'error' &&
              !NOISE_ACTIONS.has(e.action) &&
              !NOISE_RESOURCES.has(e.resource)
          )
          .slice(0, 5);
        setRecentActivity(meaningful);
      } catch {
        /* ignore */
      }
    };

    loadNotifications();

    // Poll at 30s — auditService reads are now O(1) from cache, but
    // no need to poll aggressively since audit data changes infrequently
    const POLL_MS = 30_000;
    let interval: ReturnType<typeof setInterval> | null = setInterval(loadNotifications, POLL_MS);

    const handleVisibility = () => {
      if (document.hidden) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        loadNotifications();
        if (!interval) {
          interval = setInterval(loadNotifications, POLL_MS);
        }
      }
    };

    if (Platform.OS === 'web') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (Platform.OS === 'web') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, []);

  /**
   * Transform audit entries into notification items
   */
  const notifications = useMemo((): NotificationItem[] => {
    return recentActivity
      .filter(entry => !dismissedKeys.has(notifKey(entry)))
      .map(entry => ({
        key: notifKey(entry),
        entryId: entry.id,
        message: `${getActionLabel(entry.action)}${
          entry.resource && entry.resource !== 'system' ? ` — ${entry.resource}` : ''
        }`,
        time: formatNotifTime(entry.timestamp),
        icon: getActionIcon(entry.action) as any,
        isUnread: new Date(entry.timestamp).getTime() > new Date(lastReadTimestamp).getTime(),
      }));
  }, [recentActivity, dismissedKeys, lastReadTimestamp, notifKey, formatNotifTime]);

  const unreadCount = useMemo(() => {
    return notifications.filter(n => n.isUnread).length;
  }, [notifications]);

  /**
   * Dismiss a single notification
   */
  const dismissNotification = useCallback((key: string) => {
    setDismissedKeys(prev => {
      const next = new Set(prev);
      next.add(key);
      try {
        localStorage.setItem(NOTIF_DISMISSED_KEY, JSON.stringify([...next]));
      } catch (_) {
        /* localStorage may be unavailable in private browsing */
      }
      return next;
    });
  }, []);

  /**
   * Clear all — mark current time as read, dismiss all visible
   */
  const clearAllNotifications = useCallback(() => {
    const now = new Date().toISOString();
    setLastReadTimestamp(now);
    try {
      localStorage.setItem(NOTIF_READ_KEY, now);
    } catch (_) {
      /* localStorage may be unavailable in private browsing */
    }
    setDismissedKeys(prev => {
      const next = new Set(prev);
      notifications.forEach(n => next.add(n.key));
      try {
        localStorage.setItem(NOTIF_DISMISSED_KEY, JSON.stringify([...next]));
      } catch (_) {
        /* localStorage may be unavailable in private browsing */
      }
      return next;
    });
  }, [notifications]);

  return (
    <View style={[sharedStyles.controlContainer, isOpen && sharedStyles.controlContainerOpen]}>
      {/* Toggle button */}
      <Pressable
        onPress={onToggle}
        style={(state: PressableState) =>
          [
            styles.notificationBtn,
            resolveLayerStyle(theme.L3.base),
            state.hovered && resolveLayerStyle(theme.L3.hover),
          ] as any
        }
        accessibilityRole="button"
        accessibilityLabel={
          unreadCount > 0
            ? t('topBar.notificationsWithCount', { count: unreadCount }) ||
              `Notifications, ${unreadCount} unread`
            : t('topBar.notifications') || 'Notifications'
        }
        accessibilityState={{ expanded: isOpen }}
      >
        <Feather name="bell" size={16} color={theme.L2.base.text.primary} />
        {unreadCount > 0 && (
          <View style={styles.badge} accessibilityLiveRegion="polite">
            <Text
              style={styles.badgeText}
              accessibilityLabel={`${unreadCount} unread notifications`}
            >
              {unreadCount}
            </Text>
          </View>
        )}
      </Pressable>

      {/* Dropdown menu */}
      {isOpen && (
        <View
          nativeID="dropdown-notifications"
          style={[styles.dropdown, resolveLayerStyle(theme.L4.base)]}
          accessibilityRole="menu"
        >
          {/* Header row with title + Clear All */}
          <View style={styles.notifHeader}>
            <Text
              style={[
                sharedStyles.dropdownTitle,
                { color: theme.L2.base.text.secondary, paddingVertical: 0 },
              ]}
            >
              {t('topBar.notifications')}
            </Text>
            {notifications.length > 0 && (
              <Pressable
                onPress={clearAllNotifications}
                {...(Platform.OS === 'web' &&
                  ({
                    onClick: clearAllNotifications,
                  } as PressableWithClick))}
                style={(state: PressableState) => [
                  styles.clearAllBtn,
                  state.hovered && { backgroundColor: 'rgba(139,92,246,0.12)' },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('topBar.clearAll') || 'Clear all notifications'}
              >
                <Feather name="check-circle" size={12} color={theme.semantic.accentPrimary} />
                <Text style={[styles.clearAllText, { color: theme.semantic.accentPrimary }]}>
                  {t('topBar.clearAll') || 'Clear All'}
                </Text>
              </Pressable>
            )}
          </View>

          {notifications.length === 0 && (
            <View style={styles.notifEmptyState}>
              <Feather name="bell-off" size={20} color={theme.L2.base.text.muted} />
              <Text style={[styles.notifEmptyText, { color: theme.L2.base.text.muted }]}>
                {t('topBar.noNotifications') || 'No notifications'}
              </Text>
            </View>
          )}

          {notifications.map(notif => (
            <View key={notif.key} style={styles.notifRow}>
              {/* Unread dot */}
              {notif.isUnread && (
                <View style={[styles.unreadDot, { backgroundColor: theme.semantic.cyan }]} />
              )}
              {!notif.isUnread && <View style={styles.unreadDotSpacer} />}

              {/* Clickable notification content */}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  activityHighlightStore.setHighlight(notif.entryId);
                  dismissNotification(notif.key);
                  onClose();
                  router.navigate('/(tabs)/activity');
                }}
                {...(Platform.OS === 'web' &&
                  ({
                    onClick: () => {
                      activityHighlightStore.setHighlight(notif.entryId);
                      dismissNotification(notif.key);
                      onClose();
                      router.navigate('/(tabs)/activity');
                    },
                  } as PressableWithClick))}
                style={(state: PressableState) => [
                  styles.notifItemPressable,
                  state.hovered && sharedStyles.dropdownItemHover,
                ]}
              >
                <View style={styles.notifIcon}>
                  <Feather
                    name={notif.icon as React.ComponentProps<typeof Feather>['name']}
                    size={14}
                    color={theme.semantic.purple}
                  />
                </View>
                <View style={styles.notifContent}>
                  <Text
                    style={[
                      styles.notifMessage,
                      notif.isUnread && styles.notifMessageUnread,
                      { color: theme.L2.base.text.primary },
                    ]}
                  >
                    {notif.message}
                  </Text>
                  <Text style={[styles.notifTime, { color: theme.L2.base.text.secondary }]}>
                    {notif.time}
                  </Text>
                </View>
              </Pressable>

              {/* Dismiss X button */}
              <Pressable
                onPress={() => dismissNotification(notif.key)}
                {...(Platform.OS === 'web' &&
                  ({
                    onClick: (e: React.MouseEvent) => {
                      e.stopPropagation();
                      dismissNotification(notif.key);
                    },
                  } as PressableWithClick))}
                style={(state: PressableState) => [
                  styles.dismissBtn,
                  state.hovered && { backgroundColor: 'rgba(239,68,68,0.15)' },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('topBar.dismissNotification') || 'Dismiss notification'}
              >
                <Feather name="x" size={12} color={theme.L2.base.text.muted} />
              </Pressable>
            </View>
          ))}

          <View
            style={[sharedStyles.dropdownDivider, { backgroundColor: theme.special.divider }]}
          />
          <DropdownItem
            onPress={() => {
              onClose();
              router.navigate('/(tabs)/activity');
            }}
          >
            <Text style={[sharedStyles.dropdownItemText, { color: theme.semantic.accentPrimary }]}>
              {t('topBar.viewAll')}
            </Text>
          </DropdownItem>
        </View>
      )}
    </View>
  );
});
