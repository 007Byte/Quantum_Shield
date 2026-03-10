/**
 * Premium / Subscription Screen (INFRA-03)
 *
 * Subscription and pricing page with three tier cards (Free/Pro/Enterprise),
 * feature comparison table, and upgrade CTAs. Uses tierService for pricing data.
 */

import { ScrollView, StyleSheet, Text, View, Pressable, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import {
  dashboardLayout,
  dashboardSpacing,
  dashboardColors,
  glassPanelBase,
  webOnlyGlass,
  webOnlyGlowTier2,
  webOnlyGlowTier3,
} from '@/components/dashboard2/styles';
import { tierService, SubscriptionTier } from '@/services/tierService';

// ── Main Component ─────────────────────────────────────────────

export default function PremiumScreen() {
  const allTiers = tierService.getAllTierConfigs();
  const currentTier = tierService.getCurrentTier();

  const handleUpgrade = (tier: SubscriptionTier) => {
    if (tier === 'free') return;

    if (tier === 'pro') {
      Alert.alert(
        'Upgrade to Pro',
        `Upgrade to Pro for $${tierService.getTierConfig('pro').priceMonthly}/month. This will unlock advanced features including ghost messages, backup & restore, and priority support.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', style: 'default', onPress: () => {
            tierService.setCurrentTier('pro');
            Alert.alert('Success', 'Subscription upgraded to Pro');
          }},
        ]
      );
    } else if (tier === 'enterprise') {
      Alert.alert(
        'Enterprise Plan',
        `Contact our sales team for Enterprise pricing starting at $${tierService.getTierConfig('enterprise').priceMonthly}/month. Includes unlimited storage, custom encryption, SSO, and dedicated support.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Contact Sales', style: 'default', onPress: () => {
            // In a real app, this would open an email client or contact form
            Alert.alert('Contact', 'Email: ultimatepqcshield@gmail.com');
          }},
        ]
      );
    }
  };

  const getPricingBadge = (tier: SubscriptionTier) => {
    if (tier === currentTier) return 'Current Plan';
    if (tier === 'pro') return 'Most Popular';
    if (tier === 'enterprise') return 'Best Value';
    return null;
  };

  const getBadgeColor = (tier: SubscriptionTier) => {
    if (tier === currentTier) return dashboardColors.green;
    if (tier === 'pro') return dashboardColors.cyan;
    if (tier === 'enterprise') return dashboardColors.glowPurple;
    return dashboardColors.textSecondary;
  };

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.pageScroll} contentContainerStyle={styles.pageContent} showsVerticalScrollIndicator>
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />
          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentWrapper}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Subscription Plans</Text>
                <Text style={styles.subtitle}>
                  Choose the perfect plan for your security needs
                </Text>
              </View>

              {/* Pricing Cards */}
              <View style={styles.pricingGrid}>
                {(['free', 'pro', 'enterprise'] as SubscriptionTier[]).map((tier) => {
                  const config = allTiers[tier];
                  const features = tierService.getFeatureList(tier);
                  const badge = getPricingBadge(tier);
                  const isCurrent = tier === currentTier;

                  return (
                    <View
                      key={tier}
                      style={[
                        styles.pricingCard,
                        glassPanelBase,
                        webOnlyGlass,
                        tier === 'pro' && styles.pricingCardHighlight,
                        tier === 'pro' && webOnlyGlowTier2,
                      ]}
                    >
                      {/* Badge */}
                      {badge && (
                        <View style={[styles.badge, { borderColor: getBadgeColor(tier) }]}>
                          <Text style={[styles.badgeText, { color: getBadgeColor(tier) }]}>
                            {badge}
                          </Text>
                        </View>
                      )}

                      {/* Tier Name */}
                      <Text style={styles.tierName}>{config.name}</Text>

                      {/* Price */}
                      <View style={styles.priceRow}>
                        <Text style={styles.priceAmount}>${tierService.getTierConfig(tier).priceMonthly}</Text>
                        <Text style={styles.pricePeriod}>/month</Text>
                      </View>

                      {/* Description */}
                      <Text style={styles.tierDesc}>
                        {tier === 'free' && 'Perfect for getting started'}
                        {tier === 'pro' && 'Recommended for most users'}
                        {tier === 'enterprise' && 'For teams and organizations'}
                      </Text>

                      {/* CTA Button */}
                      <Pressable
                        onPress={() => handleUpgrade(tier)}
                        disabled={isCurrent}
                        style={(state: any) => [
                          styles.ctaBtn,
                          isCurrent && styles.ctaBtnDisabled,
                          tier === 'pro' && styles.ctaBtnPrimary,
                          state.hovered && !isCurrent && styles.ctaBtnHovered,
                        ]}
                      >
                        <Text style={[styles.ctaBtnText, isCurrent && styles.ctaBtnTextDisabled]}>
                          {isCurrent ? 'Current Plan' : tier === 'pro' ? 'Upgrade to Pro' : 'Contact Sales'}
                        </Text>
                      </Pressable>

                      {/* Features List */}
                      <View style={styles.featuresList}>
                        {features.slice(0, 7).map((item) => (
                          <View key={item.feature} style={styles.featureItem}>
                            {item.available ? (
                              <Ionicons name="checkmark-circle" size={16} color={dashboardColors.green} />
                            ) : (
                              <Ionicons name="close-circle" size={16} color={dashboardColors.textSecondary} />
                            )}
                            <Text style={[styles.featureLabel, !item.available && styles.featureLabelDisabled]}>
                              {item.label}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* What's Included */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>What's Included in All Plans</Text>
                <View style={[styles.whatsIncludedCard, glassPanelBase, webOnlyGlass]}>
                  <View style={styles.includedItem}>
                    <Feather name="lock" size={18} color={dashboardColors.cyan} />
                    <Text style={styles.includedText}>Post-Quantum Cryptography (ML-KEM-1024)</Text>
                  </View>
                  <View style={styles.includedItem}>
                    <Feather name="key" size={18} color={dashboardColors.cyan} />
                    <Text style={styles.includedText}>Zero-Knowledge Authentication (SRP-6a)</Text>
                  </View>
                  <View style={styles.includedItem}>
                    <Feather name="share-2" size={18} color={dashboardColors.cyan} />
                    <Text style={styles.includedText}>End-to-End Encrypted Sharing</Text>
                  </View>
                </View>
              </View>

              {/* Feature Comparison Table */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Feature Comparison</Text>
                <View style={[styles.comparisonTable, glassPanelBase, webOnlyGlass]}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <View style={styles.tableFeatureCol}>
                      <Text style={styles.tableHeaderText}>Feature</Text>
                    </View>
                    <View style={styles.tableTierCol}>
                      <Text style={styles.tableHeaderText}>Free</Text>
                    </View>
                    <View style={styles.tableTierCol}>
                      <Text style={styles.tableHeaderText}>Pro</Text>
                    </View>
                    <View style={styles.tableTierCol}>
                      <Text style={styles.tableHeaderText}>Enterprise</Text>
                    </View>
                  </View>

                  {/* Table Rows */}
                  {tierService.getFeatureList('free').map((item) => (
                    <View key={item.feature} style={styles.tableRow}>
                      <View style={styles.tableFeatureCol}>
                        <Text style={styles.tableFeatureText}>{item.label}</Text>
                      </View>
                      <View style={styles.tableTierCol}>
                        <CheckIcon available={allTiers.free.features.includes(item.feature)} />
                      </View>
                      <View style={styles.tableTierCol}>
                        <CheckIcon available={allTiers.pro.features.includes(item.feature)} />
                      </View>
                      <View style={styles.tableTierCol}>
                        <CheckIcon available={allTiers.enterprise.features.includes(item.feature)} />
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Support Section */}
              <View style={styles.section}>
                <View style={[styles.supportCard, glassPanelBase, webOnlyGlass, webOnlyGlowTier3]}>
                  <Feather name="mail" size={24} color={dashboardColors.cyan} />
                  <View style={styles.supportContent}>
                    <Text style={styles.supportTitle}>Questions About Our Plans?</Text>
                    <Text style={styles.supportText}>
                      Contact us at ultimatepqcshield@gmail.com for custom solutions and enterprise inquiries.
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Check Icon Component ────────────────────────────────────────

function CheckIcon({ available }: { available: boolean }) {
  if (available) {
    return <Ionicons name="checkmark-circle" size={18} color={dashboardColors.green} />;
  }
  return <Ionicons name="close-circle" size={18} color="rgba(139,92,246,0.2)" />;
}

// ── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    width: '100%',
    backgroundColor: 'transparent',
    ...webOnly({ overflow: 'hidden' }),
  },
  pageScroll: {
    flex: 1,
    width: '100%',
    ...webOnly({ overflowY: 'auto' }),
  },
  pageContent: {
    paddingHorizontal: dashboardSpacing.md,
    paddingVertical: dashboardSpacing.md,
    alignItems: 'center',
  },
  shell: {
    width: '100%',
    maxWidth: dashboardLayout.maxWidth,
    alignSelf: 'center',
    alignItems: 'flex-start',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.42)',
    borderRadius: dashboardLayout.radius2Xl,
    backgroundColor: 'rgba(8,5,20,0.38)',
    ...webOnly({
      overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow: '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute',
    left: 0, right: 0, top: 0, height: 1,
    backgroundColor: 'rgba(217,70,239,0.55)',
  },
  mainCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
  },
  contentWrapper: {
    paddingTop: dashboardSpacing.lg,
  },
  header: {
    marginBottom: dashboardSpacing.md,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },

  // Pricing Grid
  pricingGrid: {
    gap: 16,
    marginBottom: dashboardSpacing.xl,
  },
  pricingCard: {
    padding: 24,
    borderRadius: 18,
    position: 'relative',
  },
  pricingCardHighlight: {
    borderColor: dashboardColors.cyan,
    backgroundColor: 'rgba(34,211,238,0.12)',
    ...webOnly({
      background: 'linear-gradient(135deg, rgba(34,211,238,0.18), rgba(139,92,246,0.12))',
    }),
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 12,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tierName: {
    fontSize: 22,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8,
  },
  priceAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: dashboardColors.cyan,
  },
  pricePeriod: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    marginLeft: 4,
  },
  tierDesc: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    marginBottom: 16,
  },
  ctaBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    marginBottom: 16,
  },
  ctaBtnPrimary: {
    borderColor: dashboardColors.cyan,
    backgroundColor: 'rgba(34,211,238,0.25)',
    ...webOnly({
      background: 'linear-gradient(135deg, rgba(34,211,238,0.35), rgba(139,92,246,0.25))',
    }),
  },
  ctaBtnDisabled: {
    borderColor: 'rgba(52,211,153,0.4)',
    backgroundColor: 'rgba(52,211,153,0.1)',
  },
  ctaBtnHovered: {
    borderColor: dashboardColors.cyan,
    backgroundColor: 'rgba(34,211,238,0.35)',
  },
  ctaBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.cyan,
  },
  ctaBtnTextDisabled: {
    color: dashboardColors.green,
  },

  // Features List
  featuresList: {
    gap: 10,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureLabel: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  featureLabelDisabled: {
    opacity: 0.5,
  },

  // Sections
  section: {
    marginBottom: dashboardSpacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 12,
  },

  // What's Included
  whatsIncludedCard: {
    padding: 16,
    borderRadius: 16,
    gap: 12,
  },
  includedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  includedText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },

  // Comparison Table
  comparisonTable: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.2)',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.1)',
  },
  tableFeatureCol: {
    flex: 1.2,
  },
  tableTierCol: {
    flex: 1,
    alignItems: 'center',
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
    letterSpacing: 0.3,
  },
  tableFeatureText: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },

  // Support Card
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    gap: 14,
  },
  supportContent: {
    flex: 1,
  },
  supportTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 4,
  },
  supportText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    lineHeight: 18,
  },
});
