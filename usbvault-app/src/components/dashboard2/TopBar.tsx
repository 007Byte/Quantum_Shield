import { Feather, Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View, Platform, type PressableProps } from 'react-native';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';

import { dashboardColors, dashboardSpacing, webOnlyEdgeLit, webOnlyGlassLuxury } from './styles';
import { webOnly } from '@/utils/webStyle';
import { useAuthStore } from '@/stores/authStore';
import { InAppModal, useInAppModal } from '@/components/common';
import { auditService, AuditLogEntry, getActionIcon } from '@/services/auditService';
import type { PressableState } from '@/types/utilities';

type DropdownMenu = 'language' | 'notifications' | 'profile' | null;

// PH4-FIX: Extended PressableProps with onClick for web compatibility
type PressableWithClick = PressableProps & {
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
};

// ─── Simple dropdown item that works on both web and native ──────────
function DropdownItem({
  onPress,
  active,
  children,
}: {
  onPress: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      // PH4-FIX: Proper type cast for web onClick handler
      {...(Platform.OS === 'web' && { onClick: onPress } as PressableWithClick)}
      style={(state: PressableState) => [
        styles.dropdownItem,
        active && styles.dropdownItemActive,
        state.hovered && styles.dropdownItemHover,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function TopBar() {
  const [selectedLanguage, setSelectedLanguage] = useState('English');
  const [openMenu, setOpenMenu] = useState<DropdownMenu>(null);
  const router = useRouter();
  // PL-011: Use individual selectors to avoid re-renders on unrelated auth state changes
  const logout = useAuthStore((s) => s.logout);
  const email = useAuthStore((s) => s.email);
  const subscriptionTier = useAuthStore((s) => s.subscriptionTier);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { modal, showAlert, showError } = useInAppModal();
  const vaultLocked = !isAuthenticated;
  const [darkMode, setDarkMode] = useState(true);
  const [recentActivity, setRecentActivity] = useState<AuditLogEntry[]>([]);

  // Derive display name and initials from auth store
  const displayName = useMemo(() => {
    if (!email) return 'User';
    const parts = email.split('@')[0].split(/[._-]/);
    return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }, [email]);

  const initials = useMemo(() => {
    if (!email) return 'U';
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }, [email]);

  const tierLabel = useMemo(() => {
    switch (subscriptionTier) {
      case 'enterprise': return 'Enterprise Plan';
      case 'pro': return 'Pro Plan';
      default: return 'Free Plan';
    }
  }, [subscriptionTier]);

  // PL-015: Load recent audit entries with visibility-aware polling
  // Pauses polling when tab is hidden to save CPU/battery
  useEffect(() => {
    const loadNotifications = async () => {
      try {
        const entries = await auditService.getEntries({ limit: 5 });
        setRecentActivity(entries);
      } catch { /* ignore */ }
    };
    loadNotifications();

    let interval: ReturnType<typeof setInterval> | null = setInterval(loadNotifications, 10000);

    const handleVisibility = () => {
      if (document.hidden) {
        if (interval) { clearInterval(interval); interval = null; }
      } else {
        loadNotifications();
        if (!interval) { interval = setInterval(loadNotifications, 10000); }
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

  // PL-018: Memoize utility function
  const formatNotifTime = useCallback((ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }, []);

  const notifications = useMemo(() => {
    return recentActivity.map((entry, i) => ({
      id: i,
      message: `${entry.action.replace(/_/g, ' ')}${entry.resource ? `: ${entry.resource}` : ''}`,
      time: formatNotifTime(entry.timestamp),
      icon: getActionIcon(entry.action) as any,
    }));
  }, [recentActivity]);

  const languages = ['English', 'Spanish', 'French', 'German'];

  // ─── Click-outside handler (web) ──────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || !openMenu) return;

    const handleClickOutside = (e: MouseEvent) => {
      const wrapEl = document.getElementById('topbar-wrap');
      if (wrapEl && wrapEl.contains(e.target as Node)) {
        return;
      }
      setOpenMenu(null);
    };

    // Use requestAnimationFrame to avoid the same click closing the menu
    let rafId = requestAnimationFrame(() => {
      document.addEventListener('click', handleClickOutside);
    });

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openMenu]);

  const toggleMenu = useCallback((menu: DropdownMenu) => {
    setOpenMenu((prev) => (prev === menu ? null : menu));
  }, []);

  const closeMenu = useCallback(() => {
    setOpenMenu(null);
  }, []);

  const handleSelectLanguage = useCallback((lang: string) => {
    setSelectedLanguage(lang);
    setOpenMenu(null);
  }, []);

  const handleProfileAction = useCallback(async (action: string) => {
    setOpenMenu(null);
    switch (action) {
      case 'profile':
        router.push('/(tabs)/settings');
        break;
      case 'switch':
        showAlert('Switch Account', 'This feature is coming soon.');
        break;
      case 'signout':
        try {
          await logout();
          router.replace('/(auth)/login');
        } catch {
          showError('Error', 'Failed to sign out. Please try again.');
        }
        break;
    }
  }, [logout, router, showAlert, showError]);

  const languageCode = selectedLanguage === 'English' ? 'EN' : selectedLanguage.substring(0, 2).toUpperCase();

  return (
    <View nativeID="topbar-wrap" style={styles.wrap}>
      {/* Vault Lock Status */}
      <View style={[styles.vaultStatusBadge, vaultLocked ? styles.vaultStatusLocked : styles.vaultStatusUnlocked]}>
        <View style={[styles.vaultStatusDot, { backgroundColor: vaultLocked ? '#EF4444' : '#22C55E' }]} />
        <Text style={[styles.vaultStatusText, { color: vaultLocked ? '#EF4444' : '#22C55E' }]}>
          {vaultLocked ? 'LOCKED' : 'UNLOCKED'}
        </Text>
      </View>

      {/* Dark/Light Mode Toggle */}
      <Pressable
        onPress={() => setDarkMode(!darkMode)}
        style={(state: PressableState) => [styles.themeToggleBtn, state.hovered && styles.controlPillHover] as any}
      >
        <Feather name={darkMode ? 'moon' : 'sun'} size={15} color={dashboardColors.textPrimary} />
        <Text style={styles.controlText}>{darkMode ? 'Dark' : 'Light'}</Text>
      </Pressable>

      {/* Language selector */}
      <View style={[styles.controlContainer, openMenu === 'language' && styles.controlContainerOpen]}>
        <Pressable
          onPress={() => toggleMenu('language')}
          style={(state: PressableState) => [styles.controlPill, state.hovered && styles.controlPillHover] as any}
        >
          <Feather name="globe" size={15} color={dashboardColors.textPrimary} />
          <Text style={styles.controlText}>{languageCode}</Text>
          <Feather name="chevron-down" size={15} color={dashboardColors.textSecondary} />
        </Pressable>

        {openMenu === 'language' && (
          <View nativeID="dropdown-language" style={[styles.dropdown, styles.dropdownLanguage]}>
            <Text style={styles.dropdownTitle}>LANGUAGE</Text>
            {languages.map((lang) => (
              <DropdownItem
                key={lang}
                onPress={() => handleSelectLanguage(lang)}
                active={selectedLanguage === lang}
              >
                <Text style={[
                  styles.dropdownItemText,
                  selectedLanguage === lang && styles.dropdownItemTextActive,
                ]}>
                  {lang}
                </Text>
                {selectedLanguage === lang && (
                  <Feather name="check" size={14} color={dashboardColors.cyan} />
                )}
              </DropdownItem>
            ))}
          </View>
        )}
      </View>

      {/* Notifications */}
      <View style={[styles.controlContainer, openMenu === 'notifications' && styles.controlContainerOpen]}>
        <Pressable
          onPress={() => toggleMenu('notifications')}
          style={(state: PressableState) => [styles.notificationBtn, state.hovered && styles.controlPillHover] as any}
        >
          <Feather name="bell" size={16} color={dashboardColors.textPrimary} />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notifications.length}</Text>
          </View>
        </Pressable>

        {openMenu === 'notifications' && (
          <View nativeID="dropdown-notifications" style={[styles.dropdown, styles.dropdownNotifications]}>
            <Text style={styles.dropdownTitle}>NOTIFICATIONS</Text>
            {notifications.map((notif) => (
              <DropdownItem key={notif.id} onPress={closeMenu}>
                <View style={styles.notifIcon}>
                  <Feather name={notif.icon} size={14} color={dashboardColors.cyan} />
                </View>
                <View style={styles.notifContent}>
                  <Text style={styles.notifMessage}>{notif.message}</Text>
                  <Text style={styles.notifTime}>{notif.time}</Text>
                </View>
              </DropdownItem>
            ))}
            <View style={styles.dropdownDivider} />
            <DropdownItem onPress={() => { closeMenu(); router.push('/(tabs)/activity'); }}>
              <Text style={[styles.dropdownItemText, { color: dashboardColors.cyan }]}>
                View All Notifications
              </Text>
            </DropdownItem>
          </View>
        )}
      </View>

      {/* Profile */}
      <View style={[styles.controlContainer, openMenu === 'profile' && styles.controlContainerOpen]}>
        <Pressable
          onPress={() => toggleMenu('profile')}
          style={(state: PressableState) => [styles.profilePill, state.hovered && styles.controlPillHover] as any}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.profileName}>{displayName}</Text>
          <Ionicons name="chevron-down" size={14} color={dashboardColors.textSecondary} />
        </Pressable>

        {openMenu === 'profile' && (
          <View nativeID="dropdown-profile" style={[styles.dropdown, styles.dropdownProfile]}>
            {/* Profile header */}
            <View style={styles.profileHeader}>
              <View style={styles.profileHeaderAvatar}>
                <Text style={styles.profileHeaderAvatarText}>{initials}</Text>
              </View>
              <View>
                <Text style={styles.profileHeaderName}>{displayName}</Text>
                <Text style={styles.profileHeaderEmail}>{tierLabel}</Text>
              </View>
            </View>

            <View style={styles.dropdownDivider} />

            <DropdownItem onPress={() => handleProfileAction('profile')}>
              <Feather name="user" size={15} color={dashboardColors.textSecondary} />
              <Text style={styles.dropdownItemText}>Profile Settings</Text>
            </DropdownItem>

            <DropdownItem onPress={() => handleProfileAction('switch')}>
              <Feather name="refresh-cw" size={15} color={dashboardColors.textSecondary} />
              <Text style={styles.dropdownItemText}>Switch Account</Text>
            </DropdownItem>

            <View style={styles.dropdownDivider} />

            <DropdownItem onPress={() => handleProfileAction('signout')}>
              <Feather name="log-out" size={15} color="#EF4444" />
              <Text style={[styles.dropdownItemText, { color: '#EF4444' }]}>Sign Out</Text>
            </DropdownItem>
          </View>
        )}
      </View>

      <InAppModal config={modal} />
    </View>
  );
}

const baseControl = {
  minHeight: 42,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(139,92,246,0.35)',
  backgroundColor: 'rgba(18,12,40,0.72)',
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
};

const styles = StyleSheet.create({
  vaultStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 'auto',
  },
  vaultStatusLocked: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderColor: 'rgba(239,68,68,0.3)',
  },
  vaultStatusUnlocked: {
    backgroundColor: 'rgba(34,197,94,0.1)',
    borderColor: 'rgba(34,197,94,0.3)',
  },
  vaultStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  vaultStatusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  wrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
    paddingTop: dashboardSpacing.sm,
    paddingBottom: 10,
    paddingRight: 2,
    ...webOnly({ position: 'relative', zIndex: 1000, overflow: 'visible' }),
  },

  controlContainer: {
    position: 'relative',
    ...webOnly({ zIndex: 1, overflow: 'visible' }),
  },
  controlContainerOpen: {
    ...webOnly({ zIndex: 1001 }),
  },

  themeToggleBtn: {
    ...baseControl,
    paddingHorizontal: 12,
    gap: 8,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.24), 0 0 16px rgba(139,92,246,0.36), 0 0 32px rgba(34,211,238,0.16), inset 0 1px 0 rgba(245,243,255,0.09), inset 0 0 14px rgba(139,92,246,0.22)',
      background: 'linear-gradient(145deg, rgba(139,92,246,0.2), rgba(34,211,238,0.08))',
    }),
  },
  controlPill: {
    ...baseControl,
    ...webOnlyEdgeLit,
    ...webOnlyGlassLuxury,
    paddingHorizontal: 12,
    gap: 8,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.24), 0 0 16px rgba(139,92,246,0.36), 0 0 32px rgba(34,211,238,0.16), inset 0 1px 0 rgba(245,243,255,0.09), inset 0 0 14px rgba(139,92,246,0.22)',
      background: 'linear-gradient(145deg, rgba(139,92,246,0.2), rgba(34,211,238,0.08))',
    }),
  },
  controlPillHover: {
    borderColor: 'rgba(34,211,238,0.5)',
    ...webOnly({
      boxShadow:
        '0 0 0 1px rgba(34,211,238,0.3), 0 0 20px rgba(34,211,238,0.35), 0 0 40px rgba(139,92,246,0.25), inset 0 1px 0 rgba(245,243,255,0.12), inset 0 0 14px rgba(34,211,238,0.15)',
      background: 'linear-gradient(145deg, rgba(139,92,246,0.28), rgba(34,211,238,0.16))',
    }),
  },
  controlText: {
    color: dashboardColors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  notificationBtn: {
    ...baseControl,
    ...webOnlyEdgeLit,
    ...webOnlyGlassLuxury,
    width: 44,
    justifyContent: 'center',
    position: 'relative',
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.24), 0 0 16px rgba(139,92,246,0.36), 0 0 32px rgba(34,211,238,0.16), inset 0 1px 0 rgba(245,243,255,0.09), inset 0 0 14px rgba(139,92,246,0.22)',
      background: 'linear-gradient(145deg, rgba(139,92,246,0.2), rgba(34,211,238,0.08))',
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
    fontSize: 10,
    fontWeight: '700',
  },
  profilePill: {
    ...baseControl,
    ...webOnlyEdgeLit,
    ...webOnlyGlassLuxury,
    paddingHorizontal: 9,
    gap: 8,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.24), 0 0 16px rgba(139,92,246,0.36), 0 0 32px rgba(34,211,238,0.16), inset 0 1px 0 rgba(245,243,255,0.09), inset 0 0 14px rgba(139,92,246,0.22)',
      background: 'linear-gradient(145deg, rgba(139,92,246,0.2), rgba(34,211,238,0.08))',
    }),
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(96,165,250,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: dashboardColors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  profileName: {
    color: dashboardColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },

  // ─── Dropdown menu ────────────────────────────────────
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(15,10,30,0.97)',
    paddingVertical: 6,
    minWidth: 200,
    ...webOnly({
      zIndex: 2000,
      boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(139,92,246,0.25), 0 0 1px rgba(139,92,246,0.5)',
      backdropFilter: 'blur(24px)',
      overflow: 'visible',
    }),
  },
  dropdownLanguage: {
    minWidth: 180,
  },
  dropdownNotifications: {
    minWidth: 300,
  },
  dropdownProfile: {
    minWidth: 240,
  },

  dropdownTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: dashboardColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: 'rgba(139,92,246,0.2)',
    marginVertical: 4,
    marginHorizontal: 10,
  },

  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    marginHorizontal: 6,
    ...webOnly({ cursor: 'pointer', transition: 'all 0.12s ease' }),
  },
  dropdownItemHover: {
    backgroundColor: 'rgba(139,92,246,0.18)',
    ...webOnly({
      boxShadow: '0 0 12px rgba(139,92,246,0.15)',
    }),
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  dropdownItemText: {
    fontSize: 14,
    color: dashboardColors.textPrimary,
    fontWeight: '500',
    flex: 1,
  },
  dropdownItemTextActive: {
    color: dashboardColors.cyan,
    fontWeight: '600',
  },

  // Notification items
  notifItem: {
    gap: 10,
  },
  notifIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(6,182,212,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(6,182,212,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifContent: {
    flex: 1,
  },
  notifMessage: {
    fontSize: 13,
    color: dashboardColors.textPrimary,
    fontWeight: '500',
  },
  notifTime: {
    fontSize: 11,
    color: dashboardColors.textSecondary,
    marginTop: 2,
  },

  // Profile header in dropdown
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  profileHeaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(96,165,250,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderAvatarText: {
    color: dashboardColors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  profileHeaderName: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  profileHeaderEmail: {
    fontSize: 12,
    color: dashboardColors.cyan,
    marginTop: 1,
  },
});
