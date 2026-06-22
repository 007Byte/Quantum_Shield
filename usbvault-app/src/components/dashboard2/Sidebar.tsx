import { Feather, Ionicons, MaterialCommunityIcons, Octicons } from '@expo/vector-icons';
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useMemo, useEffect } from 'react';
import { InAppModal, useInAppModal } from '@/components/common';

import { webOnly } from '@/utils/webStyle';
import { useAuthStore } from '@/stores/authStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/theme/engine';
import { navItems } from './navigationConfig';
import { NavSection } from './types';
import {
  dashboardColors,
  dashboardLayout,
  dashboardSpacing,
  glassPanelBase,
  webOnlyEdgeLit,
  webOnlyEdgeLitLight,
  webOnlyGlassLuxury,
  webOnlyGlassLuxuryLight,
  webOnlyGlassLight,
  webOnlyGlowTier2,
  webOnlyGlowTier2Light,
  webOnlyTransition,
  webOnlyGlass,
} from './styles';
import { DashboardNavItem } from './types';

const logoAsset = require('../../../assets/logo.png');

// PL-016: Static route map moved to module scope — no longer recreated on every render
const ROUTE_MAP: Record<string, string> = {
  dashboard: '/(tabs)/dashboard',
  // FILES — consolidated
  'encrypt-store': '/(tabs)/encrypt-store',
  'decrypt-export': '/(tabs)/decrypt-export',
  'remove-file': '/(tabs)/remove-file',
  // VAULT — consolidated
  'vault-manager': '/(tabs)/vault-manager',
  'health-check': '/(tabs)/health-check',
  storage: '/(tabs)/storage',
  backup: '/(tabs)/backup',
  restore: '/(tabs)/restore',
  // USB
  'setup-usb': '/(tabs)/setup-usb',
  'reset-usb': '/(tabs)/reset-usb',
  // SECURITY
  passwords: '/(tabs)/passwords',
  keys: '/(tabs)/keys',
  defense: '/(tabs)/defense',
  'brute-force': '/(tabs)/brute-force',
  'app-lock': '/(tabs)/app-lock',
  'zero-trace': '/(tabs)/zero-trace',
  // COMMUNICATION
  messages: '/(tabs)/messages',
  'secure-share': '/(tabs)/share',
  // BOTTOM
  activity: '/(tabs)/activity',
  tools: '/(tabs)/tools',
  classroom: '/(tabs)/classroom',
  help: '/(tabs)/help',
  premium: '/(tabs)/premium',
  billing: '/(tabs)/billing',
  settings: '/(tabs)/settings',
};

/**
 * Sidebar - Main navigation panel for dashboard application.
 *
 * Displays the USBVault logo, navigation menu items, and a premium upgrade CTA.
 * Uses glassmorphism styling with neon accents. Automatically detects active route
 * and highlights the corresponding nav item with a cyan accent beam.
 *
 * @remarks
 * - Responsive design adapts to all screen sizes
 * - Active nav item indicated by right-side accent beam
 * - Premium upgrade button with diamond icon in bottom area
 * - Includes both main and bottom navigation sections
 */
// Maps nav item IDs to sidebar i18n keys
const NAV_LABEL_KEY: Record<string, string> = {
  dashboard: 'sidebar.dashboard',
  'encrypt-store': 'sidebar.encryptStore',
  'decrypt-export': 'sidebar.decryptExport',
  'remove-file': 'sidebar.removeFile',
  'vault-manager': 'sidebar.vaultManager',
  'health-check': 'sidebar.healthCheck',
  storage: 'sidebar.storage',
  backup: 'sidebar.backup',
  restore: 'sidebar.restore',
  'setup-usb': 'sidebar.setupUsb',
  'reset-usb': 'sidebar.resetUsb',
  passwords: 'sidebar.passwords',
  keys: 'sidebar.keys',
  defense: 'sidebar.defenseInDepth',
  'brute-force': 'sidebar.bruteForce',
  'app-lock': 'sidebar.appLock',
  'zero-trace': 'sidebar.zeroTrace',
  messages: 'sidebar.messages',
  'secure-share': 'sidebar.secureShare',
  activity: 'sidebar.activity',
  'lock-vault': 'sidebar.lockVault',
  tools: 'sidebar.tools',
  classroom: 'sidebar.classroom',
  help: 'sidebar.help',
  settings: 'sidebar.settings',
  exit: 'sidebar.exit',
};

// Maps group header names to sidebar i18n keys
const GROUP_LABEL_KEY: Record<string, string> = {
  FILES: 'sidebar.files',
  VAULT: 'sidebar.vaultGroup',
  USB: 'sidebar.usb',
  SECURITY: 'sidebar.security',
  COMMUNICATION: 'sidebar.communication',
};

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { modal } = useInAppModal();
  const { t } = useLanguage();
  const { colorScheme, theme } = useTheme();
  const isLight = colorScheme === 'light';

  const activeId = useMemo(() => {
    for (const [id, route] of Object.entries(ROUTE_MAP)) {
      if (pathname === route || pathname === route.replace('/(tabs)', '')) return id;
    }
    return 'dashboard';
  }, [pathname]);

  const handleGoPremium = () => {
    router.navigate('/(tabs)/premium' as any);
  };

  const { modal: exitModal, showConfirm } = useInAppModal();
  // PL-009: Use NavSection enum for compile-time validated filtering
  const topItems = navItems.filter(item => item.section === NavSection.Top);
  const mainItems = navItems.filter(item => item.section === NavSection.Main);
  const bottomItems = navItems.filter(item => item.section === NavSection.Bottom);

  // Group main items by their group property for section headers
  const groupedMain: { group: string; items: typeof mainItems }[] = [];
  let currentGroup = '';
  for (const item of mainItems) {
    if (item.group && item.group !== currentGroup) {
      currentGroup = item.group;
      groupedMain.push({ group: currentGroup, items: [] });
    }
    if (groupedMain.length > 0) {
      groupedMain[groupedMain.length - 1].items.push(item);
    }
  }

  // Zustand store — persists collapsed/expanded state reliably across navigations
  const { collapsedSections, toggleSection, initGroups } = useSidebarStore();

  // Initialize group defaults once (all collapsed)
  useEffect(() => {
    const groups = groupedMain.map(s => s.group);
    initGroups(groups);
  }, []);

  return (
    <>
      <InAppModal config={modal} />
      <InAppModal config={exitModal} />
      <View
        style={[
          styles.container,
          glassPanelBase,
          webOnlyGlass,
          webOnlyGlassLuxury,
          webOnlyEdgeLit,
          isLight && styles.containerLight,
          isLight && webOnlyGlassLight,
          isLight && webOnlyGlassLuxuryLight,
          isLight && webOnlyEdgeLitLight,
        ]}
      >
        <View style={[styles.sidebarSheen, isLight && styles.sidebarSheenLight]} />

        {/* ── Fixed top: Logo + Dashboard ── */}
        <View style={styles.topSection}>
          <View style={styles.logoRow}>
            <View style={[styles.logoWrap, isLight && styles.logoWrapLight]}>
              <Image source={logoAsset} style={styles.logoImg} resizeMode="contain" />
              <Ionicons
                name="shield-checkmark"
                size={14}
                color="rgba(245,243,255,0.45)"
                style={styles.logoFallback}
              />
            </View>
            <Text style={[styles.logoText, isLight && styles.logoTextLight]}>USBVault</Text>
          </View>

          {/* Dashboard — always visible, outside any category */}
          {topItems.map(item => {
            const active = activeId === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  const route = ROUTE_MAP[item.id];
                  if (route) router.navigate(route as any);
                }}
                style={(state: any) => [
                  styles.navItem,
                  state.hovered && [styles.navItemHover, isLight && styles.navItemHoverLight],
                  active && [styles.navItemActive, isLight && styles.navItemActiveLight],
                ]}
              >
                {active ? (
                  <View style={[styles.activeBeam, isLight && styles.activeBeamLight]} />
                ) : null}
                <NavIcon item={item} color={active ? '#F8FAFF' : dashboardColors.textPrimary} />
                <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                  {t(NAV_LABEL_KEY[item.id]) || item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Scrollable middle: category groups ── */}
        <ScrollView
          style={styles.navScrollArea}
          contentContainerStyle={styles.navScrollContent}
          showsVerticalScrollIndicator={true}
          persistentScrollbar={true}
        >
          <View style={styles.navList}>
            {groupedMain.map(section => {
              const isCollapsed = collapsedSections[section.group] === true;
              return (
                <View key={section.group}>
                  <Pressable
                    onPress={() => toggleSection(section.group)}
                    style={(state: any) => [
                      styles.sectionHeaderRow,
                      state.hovered && styles.sectionHeaderHover,
                    ]}
                  >
                    <Text
                      style={[styles.sectionHeader, isLight && { color: 'rgba(80,70,120,0.75)' }]}
                    >
                      {t(GROUP_LABEL_KEY[section.group]) || section.group}
                    </Text>
                    <Feather
                      name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                      size={16}
                      color={
                        isCollapsed
                          ? isLight
                            ? 'rgba(80,70,120,0.65)'
                            : 'rgba(184,179,209,0.85)'
                          : isLight
                            ? 'rgba(80,70,120,0.50)'
                            : 'rgba(184,179,209,0.65)'
                      }
                    />
                  </Pressable>
                  {!isCollapsed &&
                    section.items.map(item => {
                      const active = activeId === item.id;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            const route = ROUTE_MAP[item.id];
                            if (route) router.navigate(route as any);
                          }}
                          style={(state: any) => [
                            styles.navItem,
                            state.hovered && [
                              styles.navItemHover,
                              isLight && styles.navItemHoverLight,
                            ],
                            active && [styles.navItemActive, isLight && styles.navItemActiveLight],
                          ]}
                        >
                          {active ? (
                            <View style={[styles.activeBeam, isLight && styles.activeBeamLight]} />
                          ) : null}
                          <NavIcon
                            item={item}
                            color={active ? '#F8FAFF' : dashboardColors.textPrimary}
                          />
                          <Text
                            style={[
                              styles.navLabel,
                              active && styles.navLabelActive,
                              active && isLight && { color: theme.L2.base.text.primary },
                            ]}
                          >
                            {t(NAV_LABEL_KEY[item.id]) || item.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* ── Fixed bottom: utility items + premium ── */}
        <View style={styles.bottomArea}>
          {bottomItems.map(item => {
            const isLockVault = item.id === 'lock-vault';
            const isExit = item.id === 'exit';
            const isDanger = isLockVault || isExit;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (isLockVault) {
                    const { logout } = useAuthStore.getState();
                    logout();
                    router.replace('/(auth)/login' as any);
                    return;
                  }
                  if (isExit) {
                    showConfirm(t('sidebar.exitTitle'), t('sidebar.exitMessage'), () => {
                      const { logout } = useAuthStore.getState();
                      logout();
                      router.replace('/(auth)/login' as any);
                    });
                    return;
                  }
                  const route = ROUTE_MAP[item.id];
                  if (route) router.navigate(route as any);
                }}
                style={(state: any) => [
                  styles.navItem,
                  state.hovered && [styles.navItemHover, isLight && styles.navItemHoverLight],
                  isDanger && styles.lockVaultItem,
                ]}
              >
                <NavIcon
                  item={item}
                  color={isDanger ? (isLight ? '#DC2626' : '#EF4444') : dashboardColors.textPrimary}
                />
                <Text style={[styles.navLabel, isDanger && styles.lockVaultLabel]}>
                  {t(NAV_LABEL_KEY[item.id]) || item.label}
                </Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={handleGoPremium}
            style={(state: any) => [
              styles.premiumCta,
              webOnlyGlowTier2,
              isLight && styles.premiumCtaLight,
              isLight && webOnlyGlowTier2Light,
              state.hovered && styles.premiumCtaHover,
            ]}
          >
            <View
              style={
                Platform.OS === 'web'
                  ? {
                      width: 100,
                      height: 100,
                      marginVertical: -20,
                      marginLeft: -10,
                      marginRight: -6,
                      ...webOnly({
                        mixBlendMode: 'screen',
                        filter: 'drop-shadow(0 0 8px rgba(139,92,246,0.6))',
                      }),
                    }
                  : { width: 100, height: 100 }
              }
            >
              <Image
                source={require('../../../assets/diamond_premiere.png')}
                style={styles.premiumGemImg}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.premiumText}>{t('sidebar.goPremium')}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

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

const styles = StyleSheet.create({
  container: {
    width: dashboardLayout.sidebarWidth,
    paddingHorizontal: dashboardSpacing.sm + 6,
    paddingTop: dashboardSpacing.lg - 4,
    paddingBottom: 16,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    borderRightWidth: 1,
    borderRightColor: 'rgba(139,92,246,0.34)',
    flexDirection: 'column',
    ...webOnly({
      overflow: 'hidden',
      background:
        'linear-gradient(170deg, rgba(26,16,56,0.68) 0%, rgba(14,9,36,0.78) 50%, rgba(9,7,24,0.9) 100%)',
      boxShadow: 'inset -1px 0 0 rgba(139,92,246,0.28), inset 0 0 40px rgba(139,92,246,0.16)',
    }),
  },
  containerLight: {
    borderRightColor: 'rgba(200,190,230,0.30)',
    ...webOnly({
      background:
        'linear-gradient(170deg, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.50) 100%)',
      boxShadow: 'inset -1px 0 0 rgba(200,190,230,0.20), inset 0 0 30px rgba(255,255,255,0.15)',
      backdropFilter: 'blur(20px) saturate(120%)',
    }),
  },
  sidebarSheen: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 10,
    height: 120,
    borderRadius: 18,
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(245,243,255,0.08), rgba(245,243,255,0))',
    }),
    opacity: 0.55,
  },
  sidebarSheenLight: {
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0))',
    }),
  },
  topSection: {
    flexShrink: 0,
  },
  navScrollArea: {
    flex: 1,
    minHeight: 0,
    ...webOnly({
      overflowY: 'auto',
    }),
  },
  navScrollContent: {
    paddingBottom: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 4,
    paddingHorizontal: 0,
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
  logoWrapLight: {
    ...webOnly({
      filter:
        'drop-shadow(0 0 12px rgba(124,58,237,0.25)) drop-shadow(0 0 24px rgba(8,145,178,0.15))',
    }),
  },
  logoImg: {
    width: 140,
    height: 140,
  },
  logoFallback: {
    position: 'absolute',
  },
  logoText: {
    fontSize: 30,
    color: dashboardColors.textPrimary,
    fontWeight: '700',
    letterSpacing: 0.5,
    ...webOnly({
      textShadow: '0 0 18px rgba(139,92,246,0.5), 0 0 30px rgba(34,211,238,0.2)',
    }),
  },
  logoTextLight: {
    ...webOnly({
      textShadow: '0 0 10px rgba(124,58,237,0.15)',
    }),
  },
  navList: {
    gap: dashboardSpacing.xs + 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    borderRadius: 8,
    ...webOnly({ cursor: 'pointer' }),
  },
  sectionHeaderHover: {
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(200,196,222,0.88)',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  navItem: {
    ...webOnlyTransition,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.08)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    position: 'relative',
  },
  navItemActive: {
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(89,59,212,0.4)',
    ...webOnly({
      background: 'linear-gradient(90deg, rgba(124,58,237,0.68) 0%, rgba(34,211,238,0.4) 100%)',
      boxShadow:
        '0 0 20px rgba(139,92,246,0.48), 0 0 38px rgba(34,211,238,0.26), inset 0 1px 0 rgba(245,243,255,0.1), inset 0 0 18px rgba(245,243,255,0.06)',
    }),
  },
  navItemActiveLight: {
    borderColor: 'rgba(124,58,237,0.25)',
    backgroundColor: 'rgba(124,58,237,0.12)',
    ...webOnly({
      background: 'linear-gradient(90deg, rgba(124,58,237,0.18) 0%, rgba(8,145,178,0.12) 100%)',
      boxShadow: '0 0 12px rgba(124,58,237,0.12), inset 0 1px 0 rgba(255,255,255,0.30)',
    }),
  },
  navItemHover: {
    borderColor: 'rgba(139,92,246,0.26)',
    backgroundColor: 'rgba(61,37,109,0.28)',
    ...webOnly({
      background: 'linear-gradient(130deg, rgba(139,92,246,0.2), rgba(34,211,238,0.08))',
      boxShadow: '0 0 16px rgba(139,92,246,0.3), 0 0 24px rgba(34,211,238,0.1)',
    }),
  },
  navItemHoverLight: {
    borderColor: 'rgba(124,58,237,0.18)',
    backgroundColor: 'rgba(124,58,237,0.08)',
    ...webOnly({
      background: 'linear-gradient(130deg, rgba(124,58,237,0.10), rgba(8,145,178,0.06))',
      boxShadow: '0 0 10px rgba(124,58,237,0.08)',
    }),
  },
  activeBeam: {
    position: 'absolute',
    right: 6,
    top: 10,
    bottom: 10,
    width: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(34,211,238,0.88)',
    ...webOnly({
      boxShadow: '0 0 14px rgba(34,211,238,0.85), 0 0 24px rgba(34,211,238,0.48)',
    }),
  },
  activeBeamLight: {
    backgroundColor: 'rgba(124,58,237,0.75)',
    ...webOnly({
      boxShadow: '0 0 10px rgba(124,58,237,0.50), 0 0 18px rgba(124,58,237,0.25)',
    }),
  },
  navLabel: {
    color: dashboardColors.textPrimary,
    fontSize: 16,
    fontWeight: '500',
  },
  navLabelActive: {
    fontWeight: '700',
  },
  bottomArea: {
    flexShrink: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,179,209,0.17)',
    paddingTop: 12,
    gap: 12,
  },
  premiumCta: {
    ...webOnlyTransition,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.48)',
    borderRadius: 16,
    minHeight: 60,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(22,17,44,0.9)',
    ...webOnly({
      overflow: 'visible',
      background: 'linear-gradient(135deg, rgba(76,39,155,0.62) 0%, rgba(17,16,56,0.92) 100%)',
      boxShadow:
        '0 8px 25px rgba(139,92,246,0.35), 0 0 20px rgba(34,211,238,0.22), inset 0 0 16px rgba(245,243,255,0.05)',
    }),
  },
  premiumCtaLight: {
    borderColor: 'rgba(124,58,237,0.25)',
    backgroundColor: 'rgba(255,255,255,0.55)',
    ...webOnly({
      background: 'linear-gradient(135deg, rgba(255,255,255,0.60) 0%, rgba(245,240,255,0.50) 100%)',
      boxShadow: '0 4px 16px rgba(124,58,237,0.10), inset 0 1px 0 rgba(255,255,255,0.60)',
      backdropFilter: 'blur(16px)',
    }),
  },
  premiumCtaHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 12px 40px rgba(139,92,246,0.6), 0 0 30px rgba(34,211,238,0.45)',
    }),
  },
  premiumGemImg: {
    width: 100,
    height: 100,
  },
  premiumText: {
    color: dashboardColors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginLeft: -4,
  },
  lockVaultItem: {
    borderColor: 'rgba(239,68,68,0.15)',
  },
  lockVaultLabel: {
    color: '#EF4444',
  },
});
