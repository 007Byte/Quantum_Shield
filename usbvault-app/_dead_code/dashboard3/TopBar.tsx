import React from 'react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { topBarProfile } from './mockData';
import { dashboardColors } from './styles';

export function TopBar() {
  return (
    <View style={styles.wrap}>
      <Pressable style={styles.controlPill}>
        <Feather name="globe" size={15} color={dashboardColors.textPrimary} />
        <Text style={styles.controlText}>EN 1</Text>
        <Feather name="chevron-down" size={15} color={dashboardColors.textSecondary} />
      </Pressable>

      <Pressable style={styles.notificationBtn}>
        <Feather name="bell" size={16} color={dashboardColors.textPrimary} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>9</Text>
        </View>
      </Pressable>

      <Pressable style={styles.profilePill}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{topBarProfile.initials}</Text>
        </View>
        <Text style={styles.profileName}>{topBarProfile.name}</Text>
        <Ionicons name="chevron-down" size={14} color={dashboardColors.textSecondary} />
      </Pressable>
    </View>
  );
}

const baseControl = {
  minHeight: 42,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(168,85,247,0.4)',
  backgroundColor: 'rgba(19,13,42,0.78)',
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
};

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    paddingBottom: 10,
    paddingRight: 2,
  },
  controlPill: {
    ...baseControl,
    paddingHorizontal: 12,
    gap: 8,
    // @ts-ignore RN Web-only styling for compact neon controls.
    boxShadow: '0 0 20px rgba(96,165,250,0.14), inset 0 0 14px rgba(168,85,247,0.2)',
  },
  controlText: {
    color: dashboardColors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  notificationBtn: {
    ...baseControl,
    width: 44,
    justifyContent: 'center',
    position: 'relative',
    // @ts-ignore RN Web-only button glow.
    boxShadow: '0 0 20px rgba(96,165,250,0.14), inset 0 0 14px rgba(168,85,247,0.2)',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F43F5E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    // @ts-ignore RN Web-only red glow for alert count.
    boxShadow: '0 0 12px rgba(244,63,94,0.85)',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  profilePill: {
    ...baseControl,
    paddingHorizontal: 9,
    gap: 8,
    // @ts-ignore RN Web-only profile glow.
    boxShadow: '0 0 20px rgba(96,165,250,0.14), inset 0 0 14px rgba(168,85,247,0.2)',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(96,165,250,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: dashboardColors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  profileName: {
    color: dashboardColors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
