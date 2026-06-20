import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { webOnly } from '@/utils/webStyle';
import { webOnlyEdgeLit, webOnlyGlassLuxury, webOnlyGlowTier2, webOnlyTransition } from '../styles';

const premiumDiamondAsset = require('../../../../assets/diamond.png');

interface UnlockPremiumProps {
  onUpgradePress: () => void;
}

/**
 * UnlockPremium - Card with premium feature highlights and upgrade CTA.
 *
 * Features:
 * - Three feature bullets with checkmark icons
 * - Diamond imagery positioned on the right with glow
 * - Gradient upgrade button with hover elevation
 * - Call-to-action "Upgrade Now" text
 *
 * @remarks
 * - Features are hardcoded as they are not expected to change
 * - Diamond image has overflow positioning to create visual balance
 * - Button includes gradient background and shadow effects
 * - Hover state includes subtle upward translation
 */
export const UnlockPremium = React.memo(function UnlockPremium({
  onUpgradePress,
}: UnlockPremiumProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();

  return (
    <View style={[styles.card, resolveLayerStyle(theme.L2.base)]}>
      <View style={styles.cardSheen} />
      <View style={styles.cardInnerBorder} />

      <Text style={[styles.cardTitle, { color: theme.L2.base.text.primary }]}>
        {t('rightRail.unlockPremium')}
      </Text>

      <View style={styles.upgradeRow}>
        {/* Feature bullets on the left */}
        <View style={styles.bulletsWrap}>
          <View style={styles.bulletRow}>
            <Ionicons name="checkmark" size={16} color={theme.semantic.cyan} />
            <Text style={[styles.bulletText, { color: theme.L2.base.text.secondary }]}>
              {t('rightRail.quantumFirewall')}
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <Ionicons name="checkmark" size={16} color={theme.semantic.cyan} />
            <Text style={[styles.bulletText, { color: theme.L2.base.text.secondary }]}>
              {t('rightRail.prioritySupport')}
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <Ionicons name="checkmark" size={16} color={theme.semantic.cyan} />
            <Text style={[styles.bulletText, { color: theme.L2.base.text.secondary }]}>
              {t('rightRail.unlimitedStorage')}
            </Text>
          </View>
        </View>

        {/* Diamond imagery on the right (overflow) */}
        <View style={styles.diamondWrap}>
          <Image
            source={premiumDiamondAsset}
            style={styles.diamondImg}
            resizeMode="contain"
            accessibilityLabel="Premium diamond"
          />
        </View>
      </View>

      {/* Upgrade button with gradient and glow */}
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [
          styles.upgradeBtn,
          {
            borderColor: `${theme.semantic.purple}70`,
            ...webOnly({
              background: `linear-gradient(135deg, ${theme.semantic.purple} 0%, ${theme.semantic.cyan} 100%)`,
              boxShadow: `0 8px 25px ${theme.semantic.purple}73, 0 0 20px ${theme.semantic.cyan}59`,
            }),
          } as any,
          state.hovered && styles.upgradeBtnHovered,
        ]}
        onPress={onUpgradePress}
      >
        <Text style={[styles.upgradeBtnText, { color: '#FFFFFF' }]}>
          {t('rightRail.upgradeNow')}
        </Text>
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    ...webOnlyGlassLuxury,
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 188,
    paddingBottom: 12,
  },
  cardSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 62,
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(245,243,255,0.09), rgba(245,243,255,0))',
    }),
    opacity: 0.56,
  },
  cardInnerBorder: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(245,243,255,0.04)',
    pointerEvents: 'none',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  upgradeRow: {
    position: 'relative',
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletsWrap: {
    flex: 1,
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulletText: {
    fontSize: 16,
  },
  diamondWrap: {
    position: 'absolute',
    right: -50,
    top: 0,
    bottom: 0,
    width: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamondImg: {
    width: 240,
    height: 240,
  },
  upgradeBtn: {
    ...webOnlyGlowTier2,
    ...webOnlyTransition,
    marginTop: 10,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  upgradeBtnHovered: {
    ...webOnly({
      transform: 'translateY(-2px)',
    }),
  },
  upgradeBtnText: {
    fontSize: 17,
    fontWeight: '700',
  },
});
