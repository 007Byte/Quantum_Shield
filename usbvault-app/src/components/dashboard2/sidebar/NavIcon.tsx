/**
 * NavIcon — renders the correct icon set for a nav item.
 */

import React from 'react';
import { Feather, Ionicons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import type { DashboardNavItem } from '../types';

interface Props {
  item: DashboardNavItem;
  color: string;
}

export const NavIcon = React.memo(function NavIcon({ item, color }: Props) {
  const size = 19;
  if (item.iconSet === 'Feather') {
    return <Feather name={item.iconName as any} size={size} color={color} />;
  }
  if (item.iconSet === 'Ionicons') {
    return <Ionicons name={item.iconName as any} size={size} color={color} />;
  }
  if (item.iconSet === 'Octicons') {
    return <Octicons name={item.iconName as any} size={size} color={color} />;
  }
  return <MaterialCommunityIcons name={item.iconName as any} size={size} color={color} />;
});
