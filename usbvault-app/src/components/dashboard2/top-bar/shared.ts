import { StyleSheet } from 'react-native';
import { webOnly } from '@/utils/webStyle';

/**
 * Shared styles, types, and utilities for TopBar sub-components
 */

export type DropdownMenu = 'language' | 'notifications' | 'profile' | 'vault' | null;

export type PressableWithClick = {
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
};

export const baseControl = {
  minHeight: 44,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(139,92,246,0.35)',
  backgroundColor: 'transparent',
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
};

export const sharedStyles = StyleSheet.create({
  // Dropdown item base
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
    fontWeight: '500',
    flex: 1,
  },
  dropdownItemTextActive: {
    fontWeight: '600',
  },

  // Dropdown container base
  dropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 8,
    paddingVertical: 6,
    minWidth: 200,
    ...webOnly({
      zIndex: 2000,
      overflow: 'visible',
    }),
  },
  dropdownTitle: {
    fontSize: 13,
    fontWeight: '700',
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

  // Control container
  controlContainer: {
    position: 'relative',
    ...webOnly({ zIndex: 1, overflow: 'visible' }),
  },
  controlContainerOpen: {
    ...webOnly({ zIndex: 1001 }),
  },
});
