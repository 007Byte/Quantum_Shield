import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { useLanguage } from '@/hooks/useLanguage';

interface ContactListItemProps {
  id: string;
  name: string;
  email: string;
  status?: 'shared' | 'pending' | 'accepted';
  initials?: string;
  avatarColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },

  avatarText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFFFFF',
    fontFamily: typography.fontFamily,
  },

  content: {
    flex: 1,
  },

  name: {
    fontSize: typography.sizes.base,
    fontWeight: '600' as const,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    fontFamily: typography.fontFamily,
  },

  email: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    fontFamily: typography.fontFamily,
  },

  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 6,
  },

  statusText: {
    fontSize: typography.sizes.xs,
    fontWeight: '500' as const,
    fontFamily: typography.fontFamily,
  },

  arrow: {
    fontSize: 18,
    color: colors.textMuted,
    marginLeft: spacing.md,
  },
});

const getStatusColor = (status: string): { bg: string; text: string } => {
  switch (status) {
    case 'shared':
      return { bg: 'rgba(124, 58, 237, 0.1)', text: colors.accentPrimary };
    case 'accepted':
      return { bg: 'rgba(16, 185, 129, 0.1)', text: colors.success };
    case 'pending':
      return { bg: 'rgba(245, 158, 11, 0.1)', text: colors.warning };
    default:
      return { bg: colors.bgTertiary, text: colors.textSecondary };
  }
};

const getStatusLabel = (status?: string, t?: (key: string) => string): string => {
  if (!t) return 'Unknown';
  switch (status) {
    case 'shared':
      return t('share.statusShared');
    case 'accepted':
      return t('share.statusAccepted');
    case 'pending':
      return t('share.statusPending');
    default:
      return t('share.statusUnknown');
  }
};

// Available for future use
export const ContactListItem: React.FC<ContactListItemProps> = ({
  id: _id,
  name,
  email,
  status = 'shared',
  initials,
  avatarColor = colors.accentPrimary,
  onPress,
  style,
  testID,
}) => {
  const { t } = useLanguage();

  const displayInitials =
    initials ||
    name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase();

  const statusColor = getStatusColor(status);
  const statusLabel = getStatusLabel(status, t);

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={onPress}
      activeOpacity={0.7}
      testID={testID}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
        <Text style={styles.avatarText}>{displayInitials}</Text>
      </View>

      {/* Contact Info */}
      <View style={styles.content}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.email}>{email}</Text>
      </View>

      {/* Status Badge */}
      <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
        <Text style={[styles.statusText, { color: statusColor.text }]}>{statusLabel}</Text>
      </View>

      {/* Arrow */}
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
};
