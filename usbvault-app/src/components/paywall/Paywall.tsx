/**
 * Paywall — Full-screen subscription selection modal.
 *
 * Displays tier comparison cards with pricing, feature lists, and purchase CTAs.
 * Integrates with purchaseService for RevenueCat purchases and tierService
 * for current tier state.
 *
 * When RevenueCat is not configured, shows tier info with a "Coming Soon" state
 * on purchase buttons.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  View,
  Text,
  ScrollView,
  Pressable,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import {
  tierService,
  TIER_CONFIGS,
  type SubscriptionTier,
  type TierConfig,
} from '@/services/billing/billing';
import { purchaseService, type PurchaseOffering } from '@/services/purchaseService';
import { PaywallFeatureRow } from './PaywallFeatureRow';

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  highlightTier?: SubscriptionTier;
}

const TIER_ORDER: SubscriptionTier[] = ['free', 'pro', 'enterprise'];
const TIER_ICONS: Record<SubscriptionTier, string> = {
  free: 'shield',
  pro: 'zap',
  enterprise: 'award',
};

const FEATURE_I18N: Record<string, string> = {
  basic_encryption: 'paywall.featureE2E',
  password_manager: 'paywall.featurePasswords',
  secure_messaging: 'paywall.featureMessaging',
  file_sharing: 'paywall.featureSharing',
  ghost_messages: 'paywall.featureGhost',
  backup_restore: 'paywall.featureBackup',
  recovery_phrase: 'paywall.featureRecovery',
  forensic_cleanup: 'paywall.featureZeroTrace',
  priority_support: 'paywall.featurePriority',
  unlimited_storage: 'paywall.featureUnlimited',
  sso_integration: 'paywall.featureSSO',
  dedicated_support: 'paywall.featureDedicated',
};

const KEY_FEATURES = [
  'basic_encryption',
  'password_manager',
  'secure_messaging',
  'file_sharing',
  'ghost_messages',
  'backup_restore',
  'recovery_phrase',
  'forensic_cleanup',
  'priority_support',
  'unlimited_storage',
  'sso_integration',
  'dedicated_support',
] as const;

export function Paywall({ visible, onClose, highlightTier }: PaywallProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [_offerings, setOfferings] = useState<PurchaseOffering[]>([]);
  const [loading, setLoading] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const currentTier = tierService.getCurrentTier();
  const isConfigured = purchaseService.isConfigured();

  useEffect(() => {
    if (visible && isConfigured) {
      setLoading(true);
      purchaseService
        .getOfferings()
        .then(setOfferings)
        .catch(() => setError(t('paywall.loadFailed')))
        .finally(() => setLoading(false));
    }
  }, [visible, isConfigured]);

  const handlePurchase = useCallback(
    async (tier: SubscriptionTier) => {
      if (!isConfigured || tier === 'free' || tier === currentTier) return;

      setPurchasing(tier);
      setError(null);
      try {
        // Map tier to RevenueCat package identifier
        const packageId = tier === 'pro' ? '$rc_monthly' : '$rc_annual';
        await purchaseService.purchasePackage(packageId);
        onClose();
      } catch (err: any) {
        setError(err?.message || t('paywall.purchaseFailed'));
      } finally {
        setPurchasing(null);
      }
    },
    [isConfigured, currentTier, onClose]
  );

  const handleRestore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await purchaseService.restorePurchases();
    } catch (err: any) {
      setError(err?.message || t('paywall.restoreFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleManageSubscription = useCallback(async () => {
    const url = await purchaseService.getManagementURL();
    if (url) Linking.openURL(url);
  }, []);

  // Build a colors-like object from theme tokens for PaywallFeatureRow compat
  const featureRowColors = {
    success: theme.semantic.success,
    textMuted: theme.L2.base.text.muted,
    textSecondary: theme.L2.base.text.secondary,
    border: theme.special.divider,
  };

  const renderTierCard = (tier: SubscriptionTier) => {
    const config: TierConfig = TIER_CONFIGS[tier];
    const isCurrentTier = tier === currentTier;
    const isHighlighted = tier === (highlightTier || 'pro');
    const icon = TIER_ICONS[tier] as keyof typeof Feather.glyphMap;

    return (
      <View
        key={tier}
        style={[
          styles.tierCard,
          resolveLayerStyle(theme.L2.base),
          {
            borderColor: isHighlighted
              ? theme.semantic.accentPrimary
              : theme.L2.base.native.borderColor,
            borderWidth: isHighlighted ? 2 : 1,
          },
        ]}
      >
        {isHighlighted && (
          <View
            style={[styles.recommendedBadge, { backgroundColor: theme.semantic.accentPrimary }]}
          >
            <Text style={styles.recommendedText}>{t('paywall.recommended')}</Text>
          </View>
        )}

        <View style={styles.tierHeader}>
          <Feather name={icon} size={24} color={theme.semantic.accentPrimary} />
          <Text style={[styles.tierName, { color: theme.L2.base.text.primary }]}>
            {config.name}
          </Text>
        </View>

        <View style={styles.priceRow}>
          <Text style={[styles.price, { color: theme.L2.base.text.primary }]}>
            {config.priceMonthly === 0 ? t('paywall.free') : `$${config.priceMonthly}`}
          </Text>
          {config.priceMonthly > 0 && (
            <Text style={[styles.priceUnit, { color: theme.L2.base.text.muted }]}>
              {t('paywall.perMonth')}
            </Text>
          )}
        </View>

        <Pressable
          accessibilityRole="button"
          style={[
            styles.ctaButton,
            resolveLayerStyle(
              isCurrentTier ? theme.L3.disabled : isHighlighted ? theme.L3.active : theme.L3.base
            ),
            isHighlighted && !isCurrentTier && { backgroundColor: theme.semantic.accentPrimary },
          ]}
          onPress={() => {
            if (!isConfigured && !isCurrentTier) {
              // On web: prompt user to get the mobile app for purchases
              Alert.alert(
                t('paywall.availableOnMobile'),
                t('paywall.mobileUpgradeMsg', { name: config.name })
              );
              return;
            }
            handlePurchase(tier);
          }}
          disabled={isCurrentTier || purchasing !== null}
        >
          {purchasing === tier ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={[
                styles.ctaText,
                {
                  color: isCurrentTier
                    ? theme.L3.disabled.text.muted
                    : isHighlighted
                      ? '#FFFFFF'
                      : theme.L3.base.text.primary,
                },
              ]}
            >
              {isCurrentTier
                ? t('paywall.currentPlan')
                : !isConfigured
                  ? t('paywall.getOnMobile', { name: config.name })
                  : t('paywall.upgradeTo', { name: config.name })}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={[styles.container, { backgroundColor: theme.L0.base.native.backgroundColor }]}>
        <View style={styles.header}>
          <Text
            style={[styles.title, { color: theme.L2.base.text.primary }]}
            accessibilityRole="header"
          >
            {t('paywall.chooseYourPlan')}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Feather name="x" size={24} color={theme.L2.base.text.secondary} />
          </Pressable>
        </View>

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
          {loading ? (
            <ActivityIndicator
              size="large"
              color={theme.semantic.accentPrimary}
              style={styles.loader}
            />
          ) : (
            <>
              <View style={styles.tierCards}>{TIER_ORDER.map(renderTierCard)}</View>

              <View style={[styles.featureTable, resolveLayerStyle(theme.L2.base)]}>
                <Text style={[styles.featureTableTitle, { color: theme.L2.base.text.primary }]}>
                  {t('paywall.featureComparison')}
                </Text>

                <View style={styles.featureTableHeader}>
                  <Text style={[styles.featureHeaderLabel, { color: theme.L2.base.text.muted }]}>
                    {t('paywall.feature')}
                  </Text>
                  {TIER_ORDER.map(tier => (
                    <Text
                      key={tier}
                      style={[styles.featureHeaderTier, { color: theme.L2.base.text.muted }]}
                    >
                      {TIER_CONFIGS[tier].name}
                    </Text>
                  ))}
                </View>

                {KEY_FEATURES.map(key => (
                  <PaywallFeatureRow
                    key={key}
                    label={t(FEATURE_I18N[key]) || key}
                    free={TIER_CONFIGS.free.features.includes(key as any)}
                    pro={TIER_CONFIGS.pro.features.includes(key as any)}
                    enterprise={TIER_CONFIGS.enterprise.features.includes(key as any)}
                    colors={featureRowColors}
                  />
                ))}
              </View>

              {error && (
                <Text style={[styles.errorText, { color: theme.semantic.danger }]}>{error}</Text>
              )}

              <View style={styles.footer}>
                <Pressable onPress={handleRestore} accessibilityRole="button">
                  <Text style={[styles.footerLink, { color: theme.semantic.accentPrimary }]}>
                    {t('paywall.restorePurchases')}
                  </Text>
                </Pressable>

                {currentTier !== 'free' && (
                  <Pressable onPress={handleManageSubscription} accessibilityRole="button">
                    <Text style={[styles.footerLink, { color: theme.semantic.accentPrimary }]}>
                      {t('paywall.manageSubscription')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '700' },
  scrollArea: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  loader: { marginTop: 40 },
  tierCards: { gap: 16, marginBottom: 24 },
  tierCard: {
    borderRadius: 16,
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  recommendedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
  },
  recommendedText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  tierName: { fontSize: 20, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 16 },
  price: { fontSize: 32, fontWeight: '800' },
  priceUnit: { fontSize: 14, marginLeft: 4 },
  ctaButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaText: { fontSize: 15, fontWeight: '600' },
  featureTable: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  featureTableTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  featureTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  featureHeaderLabel: { flex: 1, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  featureHeaderTier: {
    width: 70,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  errorText: { textAlign: 'center', marginBottom: 12, fontSize: 14 },
  footer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  footerLink: { fontSize: 14, fontWeight: '500' },
});
