/**
 * SidebarNavGroup — collapsible navigation section.
 * Reusable: takes items, group label, collapsed state as props.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { NavIcon } from './NavIcon';
import type { DashboardNavItem } from '../types';

interface Props {
  groupLabel: string;
  items: DashboardNavItem[];
  isCollapsed: boolean;
  onToggle: () => void;
  activeId: string;
  onNavigate: (id: string) => void;
  getLabel: (id: string, fallback: string) => string;
  sectionA11yLabel: string;
}

export const SidebarNavGroup = React.memo(function SidebarNavGroup({
  groupLabel,
  items,
  isCollapsed,
  onToggle,
  activeId,
  onNavigate,
  getLabel,
  sectionA11yLabel,
}: Props) {
  const { theme } = useTheme();

  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={(state: any) => [
          styles.sectionHeaderRow,
          state.hovered && styles.sectionHeaderHover,
        ]}
        accessibilityRole="button"
        accessibilityLabel={sectionA11yLabel}
        accessibilityState={{ expanded: !isCollapsed }}
      >
        <Text style={styles.sectionHeader}>{groupLabel}</Text>
        <Feather
          name={isCollapsed ? 'chevron-right' : 'chevron-down'}
          size={16}
          color={isCollapsed ? theme.L2.base.text.secondary : theme.L2.base.text.muted}
        />
      </Pressable>
      {!isCollapsed &&
        items.map(item => {
          const active = activeId === item.id;
          const label = getLabel(item.id, item.label);
          return (
            <Pressable
              key={item.id}
              onPress={() => onNavigate(item.id)}
              style={(state: any) => [
                styles.navItem,
                state.hovered && resolveLayerStyle(theme.L3.hover),
                active && resolveLayerStyle(theme.L3.active),
              ]}
              accessibilityRole="link"
              accessibilityLabel={label}
              accessibilityState={{ selected: active }}
            >
              {active ? (
                <View
                  style={[
                    styles.activeBeam,
                    {
                      backgroundColor: theme.special.activeBeam.bg,
                      ...webOnly({ boxShadow: theme.special.activeBeam.glow }),
                    },
                  ]}
                />
              ) : null}
              <NavIcon
                item={item}
                color={active ? theme.L3.active.text.primary : theme.L2.base.text.primary}
              />
              <Text
                style={[
                  styles.navLabel,
                  { color: theme.L2.base.text.primary },
                  active && styles.navLabelActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
    </View>
  );
});

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    borderRadius: 8,
    ...webOnly({ cursor: 'pointer', transition: 'background-color 0.15s ease' }),
  },
  sectionHeaderHover: { backgroundColor: 'rgba(139,92,246,0.08)' },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: 'rgba(200,196,222,0.88)',
    textTransform: 'uppercase',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
    borderRadius: 14,
    position: 'relative',
    minHeight: 42,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.08)',
    ...webOnly({ transition: 'all 0.18s ease', cursor: 'pointer' }),
  },
  activeBeam: {
    position: 'absolute',
    right: 6,
    top: 10,
    bottom: 10,
    width: 2,
    borderRadius: 4,
  },
  navLabel: { fontSize: 16, fontWeight: '500' },
  navLabelActive: { fontWeight: '700' },
});
