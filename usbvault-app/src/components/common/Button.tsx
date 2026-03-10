import React, { ReactNode } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from 'react-native';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'hero'
  | 'magenta'
  | 'link';

interface ButtonProps {
  variant?: ButtonVariant;
  onPress: () => void;
  children: string | ReactNode;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },

  // Variants
  primary: {
    backgroundColor: colors.accentPrimary,
  },
  primaryPressed: {
    backgroundColor: colors.accentPrimaryPressed,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  secondaryPressed: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.bgHover,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  dangerPressed: {
    backgroundColor: '#DC2626',
  },
  hero: {
    backgroundColor: colors.textPrimary,
  },
  heroPressed: {
    backgroundColor: '#E5E7EB',
  },
  magenta: {
    backgroundColor: colors.accentSecondary,
  },
  magentaPressed: {
    backgroundColor: colors.accentSecondaryHover,
  },
  link: {
    backgroundColor: 'transparent',
  },
  linkPressed: {
    opacity: 0.8,
  },

  // Size modifiers
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },

  // Text styles
  text: {
    fontWeight: '600' as const,
    fontSize: typography.sizes.base,
    fontFamily: typography.fontFamily,
  },
  primaryText: {
    color: colors.textOnAccent,
  },
  secondaryText: {
    color: colors.textPrimary,
  },
  dangerText: {
    color: colors.textOnAccent,
  },
  heroText: {
    color: '#000000',
  },
  magentaText: {
    color: colors.textOnAccent,
  },
  linkText: {
    color: colors.accentPrimary,
  },
});

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  onPress,
  children,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  testID,
}) => {
  const isDisabled = disabled || loading;

  const getButtonStyle = (): (ViewStyle | undefined)[] => {
    const baseStyle: (ViewStyle | undefined)[] = [styles.button];

    switch (variant) {
      case 'primary':
        baseStyle.push(styles.primary);
        break;
      case 'secondary':
        baseStyle.push(styles.secondary);
        break;
      case 'danger':
        baseStyle.push(styles.danger);
        break;
      case 'hero':
        baseStyle.push(styles.hero);
        break;
      case 'magenta':
        baseStyle.push(styles.magenta);
        break;
      case 'link':
        baseStyle.push(styles.link);
        break;
    }

    if (fullWidth) {
      baseStyle.push(styles.fullWidth);
    }

    if (isDisabled) {
      baseStyle.push(styles.disabled);
    }

    return baseStyle;
  };

  const getTextStyle = (): (TextStyle | undefined)[] => {
    const baseStyle: (TextStyle | undefined)[] = [styles.text];

    switch (variant) {
      case 'primary':
        baseStyle.push(styles.primaryText);
        break;
      case 'secondary':
        baseStyle.push(styles.secondaryText);
        break;
      case 'danger':
        baseStyle.push(styles.dangerText);
        break;
      case 'hero':
        baseStyle.push(styles.heroText);
        break;
      case 'magenta':
        baseStyle.push(styles.magentaText);
        break;
      case 'link':
        baseStyle.push(styles.linkText);
        break;
    }

    return baseStyle;
  };

  return (
    <TouchableOpacity
      style={[getButtonStyle(), style] as ViewStyle[]}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
      testID={testID}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={
            variant === 'hero' ? '#000000' : colors.textOnAccent
          }
        />
      )}
      <Text style={getTextStyle()}>{children}</Text>
    </TouchableOpacity>
  );
};
