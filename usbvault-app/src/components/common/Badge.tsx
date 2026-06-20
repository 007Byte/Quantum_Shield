import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';

type BadgeVariant = 'pqc' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  icon?: string;
  style?: ViewStyle;
  testID?: string;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },

  // Variants
  pqc: {
    backgroundColor: colors.pqcBadgeBg,
  },
  success: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  warning: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  danger: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  info: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },

  text: {
    fontSize: typography.sizes.xs,
    fontWeight: '500' as const,
    fontFamily: typography.fontFamily,
  },

  pqcText: {
    color: colors.pqcBadgeText,
  },
  successText: {
    color: colors.success,
  },
  warningText: {
    color: colors.warning,
  },
  dangerText: {
    color: colors.danger,
  },
  infoText: {
    color: '#3B82F6',
  },

  icon: {
    fontSize: 12,
  },
});

export const Badge: React.FC<BadgeProps> = ({ label, variant = 'info', icon, style, testID }) => {
  const getBackgroundStyle = (): ViewStyle => {
    switch (variant) {
      case 'pqc':
        return styles.pqc;
      case 'success':
        return styles.success;
      case 'warning':
        return styles.warning;
      case 'danger':
        return styles.danger;
      case 'info':
        return styles.info;
      default:
        return styles.info;
    }
  };

  const getTextStyle = (): TextStyle => {
    switch (variant) {
      case 'pqc':
        return styles.pqcText;
      case 'success':
        return styles.successText;
      case 'warning':
        return styles.warningText;
      case 'danger':
        return styles.dangerText;
      case 'info':
        return styles.infoText;
      default:
        return styles.infoText;
    }
  };

  return (
    <View style={[styles.badge, getBackgroundStyle(), style]} testID={testID}>
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={[styles.text, getTextStyle()]}>{label}</Text>
    </View>
  );
};
