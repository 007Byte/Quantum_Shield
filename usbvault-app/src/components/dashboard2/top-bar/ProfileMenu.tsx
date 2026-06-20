import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage } from '@/hooks/useLanguage';
import { useInAppModal } from '@/components/common';
import { webOnly } from '@/utils/webStyle';
import { DropdownItem } from './DropdownItem';
import { baseControl, sharedStyles } from './shared';
import type { PressableState } from '@/types/utilities';

interface ProfileMenuProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const styles = StyleSheet.create({
  profilePill: {
    ...baseControl,
    paddingHorizontal: 9,
    gap: 8,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(96,165,250,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '600',
  },
  dropdown: {
    ...sharedStyles.dropdown,
    minWidth: 240,
  },
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
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileHeaderAvatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  profileHeaderName: {
    fontSize: 14,
    fontWeight: '600',
  },
  profileHeaderEmail: {
    fontSize: 14,
    marginTop: 1,
  },
});

/**
 * ProfileMenu: User profile dropdown menu
 *
 * Features:
 * - Displays user initials avatar and display name
 * - Shows profile header with tier information
 * - Access to profile settings
 * - Account switching (coming soon)
 * - Sign out functionality
 * - Derives display name and initials from email
 * - Theme-aware styling
 */
export const ProfileMenu = React.memo(function ProfileMenu({
  isOpen,
  onToggle,
  onClose,
}: ProfileMenuProps) {
  const router = useRouter();
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { showError } = useInAppModal();

  // PL-011: Use individual selectors to avoid re-renders on unrelated auth state changes
  const logout = useAuthStore((s: any) => s.logout);
  const email = useAuthStore((s: any) => s.email);
  const subscriptionTier = useAuthStore((s: any) => s.subscriptionTier);

  /**
   * Derive display name from email
   */
  const displayName = useMemo(() => {
    if (!email) return t('topBar.user') || 'User';
    const parts = email.split('@')[0].split(/[._-]/);
    return parts.map((p: any) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  }, [email, t]);

  /**
   * Derive initials from email
   */
  const initials = useMemo(() => {
    if (!email) return 'U';
    const parts = email.split('@')[0].split(/[._-]/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].substring(0, 2).toUpperCase();
  }, [email]);

  /**
   * Derive tier label from subscription tier
   */
  const tierLabel = useMemo(() => {
    switch (subscriptionTier) {
      case 'enterprise':
        return t('topBar.enterprisePlan');
      case 'pro':
        return t('topBar.proPlan');
      default:
        return t('topBar.freePlan');
    }
  }, [subscriptionTier, t]);

  const handleProfileAction = useCallback(
    async (action: string) => {
      onClose();
      switch (action) {
        case 'profile':
          router.navigate('/(tabs)/settings');
          break;
        case 'switch':
          // Navigate to settings where user can log out and log into a different account
          router.navigate('/(tabs)/settings');
          break;
        case 'signout':
          try {
            await logout();
            router.replace('/(auth)/login');
          } catch {
            showError(t('common.error'), t('topBar.signOutError'));
          }
          break;
      }
    },
    [logout, router, showError, t, onClose]
  );

  return (
    <View style={[sharedStyles.controlContainer, isOpen && sharedStyles.controlContainerOpen]}>
      {/* Toggle button */}
      <Pressable
        onPress={onToggle}
        style={(state: PressableState) =>
          [
            styles.profilePill,
            resolveLayerStyle(theme.L3.base),
            state.hovered && resolveLayerStyle(theme.L3.hover),
          ] as any
        }
        accessibilityRole="button"
        accessibilityLabel={(t('topBar.profileMenu') || 'Profile menu') + ': ' + displayName}
        accessibilityState={{ expanded: isOpen }}
      >
        <View style={styles.avatar}>
          <Text style={[styles.avatarText, { color: theme.L2.base.text.primary }]}>{initials}</Text>
        </View>
        <Text style={[styles.profileName, { color: theme.L2.base.text.primary }]}>
          {displayName}
        </Text>
        <Ionicons name="chevron-down" size={14} color={theme.L2.base.text.secondary} />
      </Pressable>

      {/* Dropdown menu */}
      {isOpen && (
        <View
          nativeID="dropdown-profile"
          style={[styles.dropdown, resolveLayerStyle(theme.L4.base)]}
          accessibilityRole="menu"
        >
          {/* Profile header */}
          <View style={styles.profileHeader}>
            <View style={styles.profileHeaderAvatar}>
              <Text style={[styles.profileHeaderAvatarText, { color: theme.L2.base.text.primary }]}>
                {initials}
              </Text>
            </View>
            <View>
              <Text style={[styles.profileHeaderName, { color: theme.L2.base.text.primary }]}>
                {displayName}
              </Text>
              <Text style={[styles.profileHeaderEmail, { color: theme.semantic.accentPrimary }]}>
                {tierLabel}
              </Text>
            </View>
          </View>

          <View
            style={[sharedStyles.dropdownDivider, { backgroundColor: theme.special.divider }]}
          />

          <DropdownItem onPress={() => handleProfileAction('profile')}>
            <Feather name="user" size={15} color={theme.L2.base.text.secondary} />
            <Text style={[sharedStyles.dropdownItemText, { color: theme.L2.base.text.primary }]}>
              {t('topBar.profileSettings')}
            </Text>
          </DropdownItem>

          <DropdownItem onPress={() => handleProfileAction('switch')}>
            <Feather name="refresh-cw" size={15} color={theme.L2.base.text.secondary} />
            <Text style={[sharedStyles.dropdownItemText, { color: theme.L2.base.text.primary }]}>
              {t('topBar.switchAccount')}
            </Text>
          </DropdownItem>

          <View
            style={[sharedStyles.dropdownDivider, { backgroundColor: theme.special.divider }]}
          />

          <DropdownItem onPress={() => handleProfileAction('signout')}>
            <Feather name="log-out" size={15} color={theme.semantic.danger} />
            <Text style={[sharedStyles.dropdownItemText, { color: theme.semantic.danger }]}>
              {t('topBar.signOut')}
            </Text>
          </DropdownItem>
        </View>
      )}
    </View>
  );
});
