import React from 'react';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { heroActions } from './mockData';
import { dashboardColors, textGlowStrong } from './styles';
import { HeroAction } from './types';
import { WebSvg } from './WebSvg';

const shieldSvg = `
<svg width="560" height="360" viewBox="0 0 560 360" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="shieldStroke" x1="106" y1="36" x2="456" y2="300" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F5D0FE"/>
      <stop offset="0.45" stop-color="#A855F7"/>
      <stop offset="1" stop-color="#22D3EE"/>
    </linearGradient>
    <linearGradient id="innerShield" x1="280" y1="34" x2="280" y2="300" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.58"/>
      <stop offset="1" stop-color="#60A5FA" stop-opacity="0.06"/>
    </linearGradient>
    <linearGradient id="driveBody" x1="240" y1="108" x2="320" y2="236" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#A855F7"/>
      <stop offset="1" stop-color="#2563EB"/>
    </linearGradient>
    <radialGradient id="ringA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(280 188) rotate(90) scale(150 230)">
      <stop offset="0.2" stop-color="#A855F7" stop-opacity="0.58"/>
      <stop offset="1" stop-color="#22D3EE" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="trail" x1="24" y1="196" x2="536" y2="196" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#D946EF" stop-opacity="0"/>
      <stop offset="0.24" stop-color="#A855F7" stop-opacity="0.85"/>
      <stop offset="0.72" stop-color="#22D3EE" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#60A5FA" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <ellipse cx="280" cy="188" rx="214" ry="124" stroke="url(#ringA)" stroke-width="3"/>
  <ellipse cx="280" cy="188" rx="184" ry="102" stroke="#D946EF" stroke-opacity="0.48" stroke-width="2"/>
  <path d="M44 204C134 158 418 158 514 204" stroke="url(#trail)" stroke-width="4"/>

  <path d="M280 30L380 68V142C380 214 344 269 280 302C216 269 180 214 180 142V68L280 30Z" fill="url(#innerShield)"/>
  <path d="M280 30L380 68V142C380 214 344 269 280 302C216 269 180 214 180 142V68L280 30Z" stroke="url(#shieldStroke)" stroke-width="10"/>

  <rect x="232" y="106" width="96" height="124" rx="18" fill="url(#driveBody)" stroke="#93C5FD" stroke-opacity="0.9"/>
  <rect x="250" y="84" width="60" height="24" rx="6" fill="#E5E7EB"/>
  <circle cx="280" cy="163" r="13" fill="#F8FAFC"/>
  <rect x="275" y="163" width="10" height="31" rx="5" fill="#F8FAFC"/>
</svg>
`;

function renderActionIcon(action: HeroAction) {
  const color = '#C4B5FD';
  if (action.iconSet === 'Feather') {
    return <Feather name={action.iconName as any} size={19} color={color} />;
  }
  if (action.iconSet === 'Ionicons') {
    return <Ionicons name={action.iconName as any} size={19} color={color} />;
  }
  return <MaterialCommunityIcons name={action.iconName as any} size={19} color={color} />;
}

export function HeroSection() {
  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View style={styles.copyCol}>
          <Text style={[styles.title, textGlowStrong]}>Ultimate Data Security.</Text>
          <Text style={styles.subtitle}>Protected by Post-Quantum Cryptography</Text>

          <Pressable style={styles.statusPill}>
            <View style={styles.statusDotWrap}>
              <Ionicons name="checkmark-circle" size={16} color={dashboardColors.green} />
            </View>
            <Text style={styles.statusLabel}>PQC Protected</Text>
            <Feather name="chevron-down" size={16} color={dashboardColors.textSecondary} />
          </Pressable>

          <Pressable style={styles.primaryCta}>
            <Feather name="plus" size={22} color="#111827" />
            <Text style={styles.primaryCtaText}>Encrypt New</Text>
          </Pressable>
        </View>

        <View style={styles.visualCol}>
          <View style={styles.visualGlowLarge} />
          <View style={styles.visualGlowSmall} />
          <View style={styles.visualFloor} />
          <View style={styles.orbitRingA} />
          <View style={styles.orbitRingB} />
          <WebSvg svg={shieldSvg} style={styles.shieldSvg} fallbackColor="rgba(96,165,250,0.12)" />
        </View>
      </View>

      <View style={styles.actionRow}>
        {heroActions.map((action) => (
          <Pressable key={action.id} style={styles.actionCard}>
            <View style={styles.actionIconWrap}>{renderActionIcon(action)}</View>
            <Text style={styles.actionText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 14,
  },
  headerRow: {
    minHeight: 336,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 22,
  },
  copyCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 14,
    minWidth: 0,
    paddingTop: 8,
    paddingRight: 0,
  },
  title: {
    color: dashboardColors.textPrimary,
    fontSize: 62,
    fontWeight: '700',
    lineHeight: 68,
    letterSpacing: -1.2,
  },
  subtitle: {
    color: dashboardColors.textSecondary,
    fontSize: 18,
    fontWeight: '500',
  },
  statusPill: {
    marginTop: 8,
    alignSelf: 'flex-start',
    minHeight: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.58)',
    backgroundColor: 'rgba(10,18,34,0.74)',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // @ts-ignore RN Web-only gradient for luminous status chip.
    background: 'linear-gradient(90deg, rgba(8,24,28,0.86) 0%, rgba(31,19,56,0.95) 100%)',
    // @ts-ignore RN Web-only neon edge treatment.
    boxShadow:
      '0 0 0 1px rgba(34,211,238,0.26), 0 0 22px rgba(34,211,238,0.42), inset 0 0 32px rgba(168,85,247,0.42)',
  },
  statusDotWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,197,94,0.17)',
  },
  statusLabel: {
    color: dashboardColors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  primaryCta: {
    marginTop: 6,
    alignSelf: 'flex-start',
    minHeight: 54,
    borderRadius: 18,
    minWidth: 230,
    paddingHorizontal: 26,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.42)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // @ts-ignore RN Web-only CTA glow.
    boxShadow: '0 0 26px rgba(168,85,247,0.38), inset 0 0 10px rgba(255,255,255,0.45)',
  },
  primaryCtaText: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },
  visualCol: {
    width: 500,
    height: 336,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: -12,
  },
  visualGlowLarge: {
    position: 'absolute',
    width: 420,
    height: 260,
    borderRadius: 210,
    backgroundColor: 'rgba(168,85,247,0.44)',
    top: 40,
    // @ts-ignore RN Web-only blur for hero aura.
    filter: 'blur(52px)',
  },
  visualGlowSmall: {
    position: 'absolute',
    width: 300,
    height: 148,
    borderRadius: 120,
    backgroundColor: 'rgba(34,211,238,0.3)',
    bottom: 48,
    // @ts-ignore RN Web-only blur for hero aura.
    filter: 'blur(42px)',
  },
  visualFloor: {
    position: 'absolute',
    bottom: 22,
    width: 330,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.5)',
    backgroundColor: 'rgba(168,85,247,0.24)',
    // @ts-ignore RN Web-only floor glow.
    filter: 'blur(0.5px)',
    // @ts-ignore RN Web-only floor glow.
    boxShadow: '0 0 18px rgba(34,211,238,0.48)',
  },
  orbitRingA: {
    position: 'absolute',
    width: 430,
    height: 210,
    borderRadius: 220,
    borderWidth: 2,
    borderColor: 'rgba(217,70,239,0.45)',
    transform: [{ rotate: '8deg' }],
  },
  orbitRingB: {
    position: 'absolute',
    width: 390,
    height: 180,
    borderRadius: 210,
    borderWidth: 2,
    borderColor: 'rgba(34,211,238,0.38)',
    transform: [{ rotate: '-18deg' }],
  },
  shieldSvg: {
    width: 500,
    height: 336,
  },
  actionRow: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 10,
  },
  actionCard: {
    flex: 1,
    minHeight: 62,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.32)',
    backgroundColor: 'rgba(20,14,44,0.74)',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    // @ts-ignore RN Web-only action card glow.
    background: 'linear-gradient(95deg, rgba(37,99,235,0.24) 0%, rgba(217,70,239,0.3) 100%)',
    // @ts-ignore RN Web-only action card lighting.
    boxShadow:
      'inset 0 0 22px rgba(168,85,247,0.25), 0 0 14px rgba(96,165,250,0.22), 0 0 0 1px rgba(34,211,238,0.08)',
  },
  actionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.25)',
  },
  actionText: {
    color: dashboardColors.textPrimary,
    fontSize: 20,
    fontWeight: '600',
  },
});
