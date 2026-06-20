import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { webOnly } from '@/utils/webStyle';
import { baseControl } from './shared';
import type { PressableState } from '@/types/utilities';

interface ThemeToggleProps {
  // Optional: can pass toggleTheme callback, or derive from useTheme hook
  onToggle?: () => void;
}

const styles = StyleSheet.create({
  themeToggleBtn: {
    ...baseControl,
    paddingHorizontal: 12,
    gap: 8,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  controlText: {
    fontSize: 14,
    fontWeight: '600',
  },
});

/**
 * ThemeToggle: Dark/light mode toggle button
 *
 * Features:
 * - Displays current theme (Dark/Light) with icon
 * - Toggle between light and dark modes
 * - Uses useTheme hook for theme state
 * - Animated transitions
 * - Full accessibility support
 */
export const ThemeToggle = React.memo(function ThemeToggle({ onToggle }: ThemeToggleProps) {
  const { theme, colorScheme, toggleTheme: defaultToggleTheme } = useTheme();
  const { t } = useLanguage();

  const handleToggle = useCallback(() => {
    if (onToggle) {
      onToggle();
    } else {
      defaultToggleTheme();
    }
  }, [onToggle, defaultToggleTheme]);

  return (
    <Pressable
      onPress={handleToggle}
      style={(state: PressableState) =>
        [
          styles.themeToggleBtn,
          resolveLayerStyle(theme.L3.base),
          state.hovered && resolveLayerStyle(theme.L3.hover),
        ] as any
      }
      accessibilityRole="button"
      accessibilityLabel={
        colorScheme === 'dark'
          ? t('topBar.switchToLight') || 'Switch to light theme'
          : t('topBar.switchToDark') || 'Switch to dark theme'
      }
    >
      <Feather
        name={colorScheme === 'dark' ? 'moon' : 'sun'}
        size={15}
        color={theme.L2.base.text.primary}
      />
      <Text style={[styles.controlText, { color: theme.L2.base.text.primary }]}>
        {colorScheme === 'dark' ? t('topBar.dark') : t('topBar.light')}
      </Text>
    </Pressable>
  );
});
