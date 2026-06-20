import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';

interface HamburgerButtonProps {
  onPress: () => void;
  isOpen?: boolean;
}

const styles = StyleSheet.create({
  hamburgerBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * HamburgerButton: Mobile navigation menu toggle
 *
 * Features:
 * - Shows hamburger menu icon
 * - Indicates menu open/closed state
 * - Full accessibility support
 * - Theme-aware styling
 */
export const HamburgerButton = React.memo(function HamburgerButton({
  onPress,
  isOpen,
}: HamburgerButtonProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <Pressable
      onPress={onPress}
      style={styles.hamburgerBtn}
      accessibilityRole="button"
      accessibilityLabel={t('topBar.openNavMenu') || 'Open navigation menu'}
      accessibilityState={{ expanded: !!isOpen }}
    >
      <Feather name="menu" size={20} color={theme.L2.base.text.primary} />
    </Pressable>
  );
});
