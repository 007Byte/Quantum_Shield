/**
 * SidebarHeader — logo + branding + top nav items (Dashboard).
 */

import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { NavIcon } from './NavIcon';
import type { DashboardNavItem } from '../types';

const logoAsset = require('../../../../assets/logo.png');

interface Props {
  topItems: DashboardNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  getLabel: (id: string, fallback: string) => string;
}

export const SidebarHeader = React.memo(function SidebarHeader({
  topItems,
  activeId,
  onNavigate,
  getLabel,
}: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [logoError, setLogoError] = useState(false);

  return (
    <View style={styles.topSection}>
      <View style={styles.logoRow}>
        <View style={styles.logoWrap}>
          {!logoError ? (
            <Image
              source={logoAsset}
              style={styles.logoImg}
              resizeMode="contain"
              onError={() => setLogoError(true)}
              accessibilityLabel={t('sidebar.logoAlt') || 'USBVault logo'}
            />
          ) : (
            <Ionicons name="shield-checkmark" size={28} color={theme.L2.base.text.primary} />
          )}
        </View>
        <Text style={[styles.logoText, { color: theme.L2.base.text.primary }]}>USBVault</Text>
      </View>

      {topItems.map(item => {
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
  topSection: { paddingTop: 16 },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
    height: 60,
    ...webOnly({ overflow: 'visible' }),
  },
  logoWrap: {
    width: 100,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -40,
    marginBottom: -40,
    ...webOnly({
      overflow: 'visible',
      filter:
        'drop-shadow(0 0 20px rgba(139,92,246,0.55)) drop-shadow(0 0 40px rgba(34,211,238,0.3))',
    }),
  },
  logoImg: {
    width: 140,
    height: 140,
  },
  logoText: { fontSize: 30, fontWeight: '700', letterSpacing: 0.5 },
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
