import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/theme/engine';
import { heroActions } from './navigationConfig';
import {
  dashboardColors,
  dashboardSpacing,
  textGlowStrong,
  webOnlyEdgeLit,
  webOnlyGlassLuxury,
  webOnlyGlowTier1,
  webOnlyGlowTier1Light,
  webOnlyGlowTier2,
  webOnlyGlowTier2Light,
  webOnlyTransition,
} from './styles';
import { HeroAction } from './types';
import { webOnly } from '@/utils/webStyle';

const heroLogoAsset = require('../../../assets/logo.png');

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

/**
 * HeroSection - Full-width hero banner with primary call-to-action and quick action buttons.
 *
 * Displays an engaging hero with large title, subtitle, PQC status badge, and primary
 * "Encrypt New" button. Features a large shield logo with glassmorphism effects and
 * decorative glow elements. Three quick action cards below for Encrypt, Decrypt, and Share.
 *
 * @remarks
 * - Hero logo rendered with blur and glow effects for depth
 * - Status pill shows PQC protection status with dropdown
 * - Primary CTA button with hover lift animation
 * - Three action cards with icons for common workflows
 * - Responsive layout adapts to mobile and desktop views
 */
// Map hero action IDs to i18n keys
const HERO_ACTION_KEY: Record<string, string> = {
  encrypt: 'hero.encrypt',
  decrypt: 'hero.decrypt',
  share: 'hero.share',
};

export function HeroSection() {
  const router = useRouter();
  const { t } = useLanguage();
  const { colorScheme, theme } = useTheme();
  const isLight = colorScheme === 'light';

  const handleActionPress = (actionId: string) => {
    if (actionId === 'encrypt') {
      router.navigate('/(tabs)/encrypt-store' as any);
    } else if (actionId === 'decrypt') {
      router.navigate('/(tabs)/decrypt-export' as any);
    } else if (actionId === 'share') {
      router.navigate('/(tabs)/share' as any);
    }
  };

  return (
    <View style={styles.wrap}>
      {/* Hero area with shield behind text */}
      <View style={styles.heroArea}>
        {/* Shield image — absolutely positioned behind everything */}
        <View style={styles.shieldContainer}>
          <View style={[styles.visualGlowLarge, isLight ? webOnlyGlowTier1Light : webOnlyGlowTier1, isLight && styles.visualGlowLargeLight]} />
          <View style={[styles.visualGlowSmall, isLight && styles.visualGlowSmallLight]} />
          <View style={[styles.visualLightSpill, isLight && styles.visualLightSpillLight]} />
          <Image source={heroLogoAsset} style={[styles.heroLogo, isLight && styles.heroLogoLight]} resizeMode="contain" />
        </View>

        {/* Text content — sits on top of the shield */}
        <View style={styles.copyCol}>
          <Text style={[styles.title, !isLight && textGlowStrong, isLight && { color: theme.L0.base.text.primary }]}>
            {t('hero.title')}
          </Text>
          <Text style={[styles.subtitle, isLight && { color: theme.L0.base.text.secondary }]}>
            {t('hero.subtitle')}
          </Text>

          <Pressable
            style={(state: any) => [
              styles.statusPill,
              isLight && styles.statusPillLight,
              state.hovered && styles.statusPillHovered,
            ]}
          >
            <View style={styles.statusDotWrap}>
              <Ionicons name="checkmark-circle" size={16} color={theme.semantic.green} />
            </View>
            <Text style={[styles.statusLabel, isLight && { color: theme.L2.base.text.primary }]}>
              {t('hero.pqcProtected')}
            </Text>
            <Feather name="chevron-down" size={16} color={theme.L2.base.text.secondary} />
          </Pressable>

          <Pressable
            onPress={() => handleActionPress('encrypt')}
            style={(state: any) => [styles.primaryCta, state.hovered && styles.primaryCtaHovered]}
          >
            <Feather name="plus" size={22} color="#111827" />
            <Text style={styles.primaryCtaText}>{t('hero.encryptNew')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.actionRow}>
        {heroActions.map(action => (
          <Pressable
            key={action.id}
            onPress={() => handleActionPress(action.id)}
            style={(state: any) => [
              styles.actionCard,
              isLight && styles.actionCardLight,
              state.hovered && (isLight ? styles.actionCardLightHovered : styles.actionCardHovered),
            ]}
          >
            <View style={[styles.actionIconWrap, isLight && styles.actionIconWrapLight]}>
              {renderActionIcon(action)}
            </View>
            <Text style={[styles.actionText, isLight && { color: theme.L2.base.text.primary }]}>
              {t(HERO_ACTION_KEY[action.id]) || action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingBottom: 16,
  },
  heroArea: {
    position: 'relative',
    minHeight: 420,
    justifyContent: 'center',
    ...webOnly({ overflow: 'visible' }),
  },
  /* ── Shield image layer (behind text) ── */
  shieldContainer: {
    position: 'absolute',
    top: -80,
    bottom: -50,
    right: -80,
    left: '28%' as any,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ zIndex: 0, pointerEvents: 'none' }),
  },
  visualGlowLarge: {
    position: 'absolute',
    width: '90%' as any,
    height: '80%' as any,
    borderRadius: 400,
    backgroundColor: 'rgba(139,92,246,0.55)',
    ...webOnly({ filter: 'blur(90px)' }),
  },
  visualGlowSmall: {
    position: 'absolute',
    width: '70%' as any,
    height: '50%' as any,
    borderRadius: 300,
    backgroundColor: 'rgba(34,211,238,0.38)',
    bottom: '10%' as any,
    ...webOnly({ filter: 'blur(70px)' }),
  },
  visualLightSpill: {
    position: 'absolute',
    bottom: '18%' as any,
    width: '80%' as any,
    height: 50,
    borderRadius: 28,
    ...webOnly({
      background:
        'linear-gradient(90deg, rgba(139,92,246,0), rgba(139,92,246,0.38), rgba(34,211,238,0.34), rgba(139,92,246,0))',
      filter: 'blur(18px)',
    }),
    opacity: 0.95,
  },
  heroLogo: {
    width: '100%' as any,
    height: '100%' as any,
    ...webOnly({
      filter:
        'drop-shadow(0 0 28px rgba(139,92,246,0.55)) drop-shadow(0 0 56px rgba(34,211,238,0.35))',
    }),
  },
  /* ── Text content layer (on top) ── */
  copyCol: {
    position: 'relative',
    ...webOnly({ zIndex: 1 }),
    justifyContent: 'center',
    gap: dashboardSpacing.md,
    maxWidth: '55%' as any,
    paddingTop: dashboardSpacing.sm,
  },
  title: {
    color: dashboardColors.textPrimary,
    fontSize: 58,
    fontWeight: '800',
    lineHeight: 64,
    letterSpacing: 2,
    textTransform: 'uppercase',
    ...webOnly({
      textShadow: '0 0 22px rgba(139,92,246,0.42), 0 0 38px rgba(34,211,238,0.12)',
    }),
  },
  subtitle: {
    color: dashboardColors.textSecondary,
    fontSize: 17,
    fontWeight: '500',
  },
  statusPill: {
    ...webOnlyEdgeLit,
    ...webOnlyGlassLuxury,
    ...webOnlyTransition,
    marginTop: dashboardSpacing.sm,
    alignSelf: 'flex-start',
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.52)',
    backgroundColor: 'rgba(18,12,40,0.76)',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...webOnly({
      backdropFilter: 'blur(12px)',
      background: 'linear-gradient(145deg, rgba(34,211,238,0.16), rgba(139,92,246,0.2))',
      boxShadow:
        '0 0 0 1px rgba(34,211,238,0.24), 0 0 20px rgba(34,211,238,0.3), 0 0 36px rgba(139,92,246,0.24), inset 0 1px 0 rgba(245,243,255,0.08), inset 0 0 22px rgba(139,92,246,0.26)',
    }),
  },
  statusPillHovered: {
    borderColor: 'rgba(34,211,238,0.68)',
    ...webOnly({ transform: 'translateY(-1px)' }),
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
    ...webOnlyGlowTier2,
    ...webOnlyTransition,
    marginTop: dashboardSpacing.xs + 2,
    alignSelf: 'flex-start',
    minHeight: 48,
    borderRadius: 16,
    paddingHorizontal: 26,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: 'rgba(147,51,234,0.42)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 230,
    ...webOnly({
      boxShadow:
        '0 8px 25px rgba(139,92,246,0.45), 0 0 22px rgba(34,211,238,0.2), 0 0 38px rgba(168,85,247,0.24), inset 0 1px 0 rgba(255,255,255,0.62), inset 0 0 12px rgba(255,255,255,0.45)',
      background: 'linear-gradient(180deg, #FFFFFF 0%, #EAE6FF 100%)',
    }),
  },
  primaryCtaHovered: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 12px 40px rgba(139,92,246,0.6), 0 0 30px rgba(34,211,238,0.45)',
    }),
  },
  primaryCtaText: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '700',
  },
  /* ── Action cards row ── */
  actionRow: {
    marginTop: dashboardSpacing.sm,
    flexDirection: 'row',
    gap: dashboardSpacing.sm + 2,
  },
  actionCard: {
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    flex: 1,
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(18,12,40,0.78)',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...webOnly({
      background: 'linear-gradient(145deg, rgba(139,92,246,0.22), rgba(34,211,238,0.1))',
      boxShadow:
        '0 0 18px rgba(139,92,246,0.28), 0 0 28px rgba(34,211,238,0.12), inset 0 0 18px rgba(139,92,246,0.2)',
    }),
  },
  actionCardHovered: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow:
        '0 0 25px rgba(124,58,237,0.6), 0 0 44px rgba(34,211,238,0.24), inset 0 0 18px rgba(34,211,238,0.24)',
    }),
  },
  actionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(168,85,247,0.25)',
    ...webOnly({ boxShadow: '0 0 12px rgba(139,92,246,0.35)' }),
  },
  actionText: {
    color: dashboardColors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  /* ── Light mode overrides ── */
  visualGlowLargeLight: {
    backgroundColor: 'rgba(124,58,237,0.12)',
    ...webOnly({ filter: 'blur(60px)' }),
  },
  visualGlowSmallLight: {
    backgroundColor: 'rgba(8,145,178,0.10)',
    ...webOnly({ filter: 'blur(50px)' }),
  },
  visualLightSpillLight: {
    ...webOnly({
      background:
        'linear-gradient(90deg, rgba(124,58,237,0), rgba(124,58,237,0.10), rgba(8,145,178,0.08), rgba(124,58,237,0))',
      filter: 'blur(14px)',
    }),
    opacity: 0.5,
  },
  heroLogoLight: {
    ...webOnly({
      filter:
        'drop-shadow(0 0 14px rgba(124,58,237,0.18)) drop-shadow(0 0 28px rgba(8,145,178,0.10))',
    }),
  },
  statusPillLight: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderColor: 'rgba(8,145,178,0.30)',
    ...webOnly({
      background: 'linear-gradient(145deg, rgba(255,255,255,0.60), rgba(255,255,255,0.45))',
      boxShadow:
        '0 0 0 1px rgba(255,255,255,0.50), 0 2px 12px rgba(139,92,246,0.08), inset 0 1px 0 rgba(255,255,255,0.65)',
      backdropFilter: 'blur(16px)',
    }),
  },
  actionCardLight: {
    backgroundColor: 'rgba(255,255,255,0.50)',
    borderColor: 'rgba(200,190,230,0.35)',
    ...webOnly({
      background: 'linear-gradient(145deg, rgba(255,255,255,0.55), rgba(255,255,255,0.42))',
      boxShadow:
        '0 2px 16px rgba(139,92,246,0.06), 0 0 0 1px rgba(255,255,255,0.50), inset 0 1px 0 rgba(255,255,255,0.60)',
      backdropFilter: 'blur(16px)',
    }),
  },
  actionCardLightHovered: {
    ...webOnly({
      transform: 'translateY(-2px)',
      background: 'linear-gradient(145deg, rgba(255,255,255,0.65), rgba(255,255,255,0.50))',
      boxShadow:
        '0 6px 24px rgba(139,92,246,0.10), 0 0 0 1px rgba(255,255,255,0.55), inset 0 1px 0 rgba(255,255,255,0.70)',
    }),
  },
  actionIconWrapLight: {
    backgroundColor: 'rgba(124,58,237,0.12)',
    ...webOnly({ boxShadow: '0 0 8px rgba(139,92,246,0.10)' }),
  },
});
