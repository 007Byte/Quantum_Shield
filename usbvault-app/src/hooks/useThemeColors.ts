/**
 * Legacy theme hook — now wraps the centralized useTheme().
 *
 * All 40+ consuming files continue to work unchanged.
 * Migrate to: import { useTheme } from '@/theme'
 */

import { useTheme } from '@/theme/engine';

export function useThemeColors() {
  const { colorScheme, toggleTheme } = useTheme();
  return { colorScheme, toggleTheme };
}
