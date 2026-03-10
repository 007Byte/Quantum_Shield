import React from 'react';
import { Feather, Ionicons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { navItems } from './mockData';
import {
  dashboardColors,
  dashboardLayout,
  glassPanelBase,
  webOnlyGlass,
} from './styles';
import { DashboardNavItem } from './types';
import { WebSvg } from './WebSvg';

const brandShieldSvg = `
<svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="brandShieldStroke" x1="4" y1="2" x2="24" y2="25" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F5D0FE"/>
      <stop offset="0.55" stop-color="#A855F7"/>
      <stop offset="1" stop-color="#22D3EE"/>
    </linearGradient>
    <linearGradient id="brandShieldFill" x1="14" y1="3" x2="14" y2="24" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.64"/>
      <stop offset="1" stop-color="#60A5FA" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <path d="M14 2.5L21.5 5.5V11.5C21.5 16.7 18.7 21.1 14 23.5C9.3 21.1 6.5 16.7 6.5 11.5V5.5L14 2.5Z" fill="url(#brandShieldFill)" stroke="url(#brandShieldStroke)" stroke-width="1.7"/>
  <path d="M14 7L11.8 11H13.6V15H14.4V11H16.2L14 7Z" fill="#EEF2FF"/>
</svg>
`;

function NavIcon({ item, color }: { item: DashboardNavItem; color: string }) {
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
}

export function Sidebar() {
  const mainItems = navItems.filter((item) => item.section !== 'bottom');
  const bottomItems = navItems.filter((item) => item.section === 'bottom');

  return (
    <View style={[styles.container, glassPanelBase, webOnlyGlass]}>
      <View style={styles.logoRow}>
        <View style={styles.logoOrb}>
          <WebSvg svg={brandShieldSvg} style={styles.brandShield} fallbackColor="rgba(96,165,250,0.2)" />
          <Ionicons
            name="shield-checkmark"
            size={16}
            color="rgba(245,243,255,0.5)"
            style={styles.brandShieldFallback}
          />
        </View>
        <Text style={styles.logoText}>Quantum Armor Vault</Text>
      </View>

      <View style={styles.navList}>
        {mainItems.map((item) => {
          const active = Boolean(item.active);
          return (
            <Pressable key={item.id} style={[styles.navItem, active && styles.navItemActive]}>
              {active ? <View style={styles.activeBeam} /> : null}
              <NavIcon item={item} color={active ? '#F8FAFF' : dashboardColors.textPrimary} />
              <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.bottomArea}>
        {bottomItems.map((item) => (
          <Pressable key={item.id} style={styles.navItem}>
            <NavIcon item={item} color={dashboardColors.textPrimary} />
            <Text style={styles.navLabel}>{item.label}</Text>
          </Pressable>
        ))}

        <Pressable style={styles.premiumCta}>
          <View style={styles.premiumGem}>
            <Ionicons name="diamond" size={14} color={dashboardColors.cyan} />
          </View>
          <Text style={styles.premiumText}>Go Premium</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: dashboardLayout.sidebarWidth,
    paddingHorizontal: 14,
    paddingTop: 20,
    paddingBottom: 16,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightColor: 'rgba(168,85,247,0.34)',
    // @ts-ignore RN Web-only sidebar glass depth.
    background:
      'linear-gradient(165deg, rgba(33,24,58,0.56) 0%, rgba(14,11,32,0.7) 50%, rgba(8,8,18,0.84) 100%)',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 11,
    paddingHorizontal: 8,
  },
  logoOrb: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(96,165,250,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.48)',
    // @ts-ignore RN Web-only effect for neon badge.
    boxShadow: '0 0 26px rgba(168,85,247,0.72), inset 0 0 14px rgba(147,197,253,0.3)',
  },
  brandShield: {
    width: 24,
    height: 24,
  },
  brandShieldFallback: {
    position: 'absolute',
    top: 11,
    left: 11,
  },
  logoText: {
    fontSize: 32,
    color: dashboardColors.textPrimary,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  navList: {
    gap: 6,
    flex: 1,
  },
  navItem: {
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    position: 'relative',
  },
  navItemActive: {
    borderColor: 'rgba(34,211,238,0.64)',
    backgroundColor: 'rgba(89,59,212,0.38)',
    // @ts-ignore RN Web-only effect for glowing active navigation.
    background:
      'linear-gradient(98deg, rgba(168,85,247,0.8) 0%, rgba(96,165,250,0.26) 60%, rgba(34,211,238,0.2) 100%)',
    // @ts-ignore RN Web-only effect for neon edge highlight.
    boxShadow:
      '0 0 0 1px rgba(34,211,238,0.32), 0 0 28px rgba(34,211,238,0.52), inset 0 0 24px rgba(168,85,247,0.45)',
  },
  activeBeam: {
    position: 'absolute',
    right: 6,
    top: 10,
    bottom: 10,
    width: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(34,211,238,0.88)',
    // @ts-ignore RN Web-only active edge glow.
    boxShadow: '0 0 14px rgba(34,211,238,0.85)',
  },
  navLabel: {
    color: dashboardColors.textPrimary,
    fontSize: 17,
    fontWeight: '500',
  },
  navLabelActive: {
    fontWeight: '700',
  },
  bottomArea: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,179,209,0.17)',
    paddingTop: 12,
    gap: 12,
  },
  premiumCta: {
    marginTop: 'auto',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.35)',
    borderRadius: 16,
    minHeight: 60,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(22,17,44,0.86)',
    // @ts-ignore RN Web-only glass glow.
    boxShadow:
      'inset 0 0 20px rgba(168,85,247,0.3), 0 0 18px rgba(168,85,247,0.22), 0 0 0 1px rgba(34,211,238,0.12)',
  },
  premiumGem: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(96,165,250,0.2)',
  },
  premiumText: {
    color: dashboardColors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
});
