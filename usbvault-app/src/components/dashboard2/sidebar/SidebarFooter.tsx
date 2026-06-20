/**
 * SidebarFooter — bottom utility items + Premium CTA.
 */

import React from 'react';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { webOnly } from '@/utils/webStyle';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { webOnlyGlowTier2 } from '../styles';
import { NavIcon } from './NavIcon';
import type { DashboardNavItem } from '../types';

interface Props {
  bottomItems: DashboardNavItem[];
  onNavigate: (id: string) => void;
  onLockVault: () => void;
  onExit: () => void;
  onGoPremium: () => void;
  getLabel: (id: string, fallback: string) => string;
}

export const SidebarFooter = React.memo(function SidebarFooter({
  bottomItems,
  onNavigate,
  onLockVault,
  onExit,
  onGoPremium,
  getLabel,
}: Props) {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <View style={[styles.bottomArea, { borderTopColor: theme.special.divider }]}>
      {bottomItems.map(item => {
        const isLockVault = item.id === 'lock-vault';
        const isExit = item.id === 'exit';
        const isDanger = isLockVault || isExit;
        const label = getLabel(item.id, item.label);
        return (
          <Pressable
            key={item.id}
            onPress={() => {
              if (isLockVault) {
                onLockVault();
                return;
              }
              if (isExit) {
                onExit();
                return;
              }
              onNavigate(item.id);
            }}
            style={(state: any) => [
              styles.navItem,
              state.hovered && resolveLayerStyle(theme.L3.hover),
              isDanger && styles.lockVaultItem,
            ]}
            accessibilityRole={isDanger ? 'button' : 'link'}
            accessibilityLabel={label}
          >
            <NavIcon
              item={item}
              color={isDanger ? theme.semantic.danger : theme.L2.base.text.primary}
            />
            <Text
              style={[
                styles.navLabel,
                { color: theme.L2.base.text.primary },
                isDanger && styles.lockVaultLabel,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}

      <Pressable
        onPress={onGoPremium}
        style={(state: any) => [
          styles.premiumCta,
          {
            borderColor: `${theme.semantic.purple}70`,
            ...webOnly({
              background: `linear-gradient(135deg, ${theme.semantic.purple} 0%, ${theme.semantic.cyan} 100%)`,
              boxShadow: `0 8px 25px ${theme.semantic.purple}73, 0 0 20px ${theme.semantic.cyan}59`,
            }),
          } as any,
          webOnlyGlowTier2,
          state.hovered && styles.premiumCtaHover,
        ]}
        accessibilityRole="link"
        accessibilityLabel={t('sidebar.goPremium')}
      >
        <View
          style={
            Platform.OS === 'web'
              ? {
                  position: 'absolute',
                  left: 8,
                  width: 80,
                  height: 80,
                  ...webOnly({
                    filter: 'drop-shadow(0 0 8px rgba(139,92,246,0.6))',
                    overflow: 'visible',
                  }),
                }
              : { position: 'absolute', left: 8, width: 80, height: 80 }
          }
        >
          <Image
            source={require('../../../../assets/diamond_premiere.png')}
            style={styles.premiumGemImg}
            resizeMode="contain"
            accessibilityLabel={t('sidebar.premiumDiamond') || 'Premium diamond'}
          />
        </View>
        <Text
          style={[
            styles.premiumText,
            { color: '#FFFFFF', fontSize: 19, marginLeft: 0, flex: 1, textAlign: 'center' },
          ]}
        >
          {t('sidebar.goPremium')}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  bottomArea: {
    paddingTop: 12,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(184,179,209,0.17)',
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
  navLabel: { fontSize: 16, fontWeight: '500' },
  lockVaultItem: {
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    backgroundColor: 'rgba(239,68,68,0.05)',
    marginTop: 4,
  },
  lockVaultLabel: { color: 'rgba(239,68,68,1)', fontWeight: '600' },
  premiumCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.48)',
    backgroundColor: 'rgba(22,17,44,0.9)',
    ...webOnly({
      transition: 'transform 0.3s ease, box-shadow 0.3s ease, filter 0.3s ease',
      cursor: 'pointer',
      overflow: 'visible',
      position: 'relative',
      background: 'linear-gradient(135deg, rgba(76,39,155,0.62) 0%, rgba(17,16,56,0.92) 100%)',
      boxShadow:
        '0 8px 25px rgba(139,92,246,0.35), 0 0 20px rgba(34,211,238,0.22), inset 0 0 16px rgba(245,243,255,0.05)',
    }),
  },
  premiumCtaHover: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 28px rgba(139,92,246,0.45), 0 0 20px rgba(34,211,238,0.2)',
    }),
  },
  premiumGemImg: { width: '100%', height: '100%' },
  premiumText: { fontSize: 22, fontWeight: '700', marginLeft: -4 },
});
