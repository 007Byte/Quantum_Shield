import React from 'react';
import { Pressable, Platform } from 'react-native';
import { sharedStyles, PressableWithClick } from './shared';
import type { PressableState } from '@/types/utilities';

interface DropdownItemProps {
  onPress: () => void;
  active?: boolean;
  children: React.ReactNode;
  accessibilityLabel?: string;
}

/**
 * DropdownItem: A reusable dropdown menu item that works on both web and native
 *
 * Features:
 * - Proper web onClick handler compatibility
 * - Active/hovered state styling
 * - Full accessibility support
 */
export const DropdownItem = React.memo(function DropdownItem({
  onPress,
  active,
  children,
  accessibilityLabel,
}: DropdownItemProps) {
  return (
    <Pressable
      onPress={onPress}
      // PH4-FIX: Proper type cast for web onClick handler
      {...(Platform.OS === 'web' && ({ onClick: onPress } as PressableWithClick))}
      style={(state: PressableState) => [
        sharedStyles.dropdownItem,
        active && sharedStyles.dropdownItemActive,
        state.hovered && sharedStyles.dropdownItemHover,
      ]}
      accessibilityRole="menuitem"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={active != null ? { selected: active } : undefined}
    >
      {children}
    </Pressable>
  );
});
