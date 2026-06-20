import React, { useState } from 'react';
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  ViewStyle,
  TextInputProps,
  TouchableOpacity,
} from 'react-native';
import { colors } from '@/theme/colors';
import { typography } from '@/theme/typography';
import { spacing } from '@/theme/spacing';
import { webOnly } from '@/utils/webStyle';

type InputVariant = 'default' | 'search';

interface InputProps extends TextInputProps {
  label?: string;
  placeholder?: string;
  error?: string;
  variant?: InputVariant;
  secureTextEntry?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },

  label: {
    fontSize: typography.sizes.sm,
    fontWeight: '500' as const,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    fontFamily: typography.fontFamily,
  },

  inputWrapper: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
    paddingHorizontal: spacing.md,
  },

  inputWrapperFocused: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.bgSecondary,
    ...webOnly({
      outline: '2px solid #8B5CF6',
      outlineOffset: '2px',
    }),
  },

  inputWrapperError: {
    borderColor: colors.danger,
  },

  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: typography.sizes.base,
    color: colors.textPrimary,
    fontFamily: typography.fontFamily,
  },

  inputPlaceholder: {
    color: colors.textMuted,
  },

  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgSecondary,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },

  searchInput: {
    flex: 1,
    paddingVertical: spacing.md,
  },

  error: {
    fontSize: typography.sizes.xs,
    color: colors.danger,
    marginTop: spacing.xs,
    fontFamily: typography.fontFamily,
  },

  eyeIcon: {
    padding: spacing.sm,
  },

  eyeIconText: {
    fontSize: 18,
  },
});

export const Input: React.FC<InputProps> = ({
  label,
  placeholder = 'Enter text',
  error,
  variant = 'default',
  secureTextEntry = false,
  style,
  testID,
  onFocus,
  onBlur,
  ...props
}) => {
  const [focused, setFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(!secureTextEntry);

  const handleFocus = (e: any) => {
    setFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setFocused(false);
    onBlur?.(e);
  };

  if (variant === 'search') {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.searchWrapper}>
          <Text style={styles.eyeIconText}>🔍</Text>
          <TextInput
            accessibilityLabel={props.accessibilityLabel || label || 'Search input'}
            style={[styles.input, styles.searchInput]}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            testID={testID}
            {...props}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}

      <View
        style={[
          styles.inputWrapper,
          focused ? styles.inputWrapperFocused : undefined,
          error ? styles.inputWrapperError : undefined,
        ]}
      >
        <TextInput
          accessibilityLabel={props.accessibilityLabel || label || 'Text input'}
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureTextEntry && !showPassword}
          onFocus={handleFocus}
          onBlur={handleBlur}
          testID={testID}
          {...props}
        />

        {secureTextEntry && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeIcon}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
            accessibilityRole="button"
          >
            <Text style={styles.eyeIconText}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};
