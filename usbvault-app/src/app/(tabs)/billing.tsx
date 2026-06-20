/**
 * Billing & Subscription Screen (INFRA-04)
 *
 * Subscription management, billing history, payment methods, usage statistics,
 * and plan cancellation. Integrates with tierService for plan information.
 */

import { StyleSheet, Text, View, Pressable, Alert, Linking, Platform } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { Feather, Ionicons } from '@expo/vector-icons';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { dashboardSpacing } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { tierService } from '@/services/billing';
import { useVaultListStore } from '@/stores/vaultListStore';
import { vaultOrchestrator } from '@/services/vaultOrchestrator';
import { purchaseService } from '@/services/purchaseService';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';

// ── Main Component ─────────────────────────────────────────────

function BillingScreen() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const currentTier = tierService.getCurrentTier();
  const tierConfig = tierService.getTierConfig(currentTier);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Real data from stores/services
  const files = useVaultListStore(s => s.files);
  const orchestratorIndex = vaultOrchestrator.getIndex();
  const fileCount = orchestratorIndex ? Object.keys(orchestratorIndex.files).length : files.length;

  // No invoices until payment service is connected — show empty state
  const invoices: {
    id: string;
    date: string;
    description: string;
    amount: number;
    status: 'paid' | 'pending' | 'failed';
  }[] = [];

  const usageStats = useMemo(
    () => [
      {
        label: t('billing.storageUsed'),
        value: '—',
        max: (tierConfig as any)?.storageLimit || '—',
        icon: 'hard-drive',
        color: theme.semantic.cyan,
      },
      {
        label: t('billing.filesEncrypted'),
        value: `${fileCount}`,
        max: t('billing.unlimited'),
        icon: 'lock',
        color: theme.semantic.cyan,
      },
    ],
    [fileCount, tierConfig, theme.semantic.cyan, t]
  );

  const handleDownloadReceipt = (invoiceId: string) => {
    Alert.alert(t('billing.receipt'), t('billing.downloadingReceipt', { id: invoiceId }));
  };

  const handleChangePaymentMethod = useCallback(async () => {
    // On native, open the App Store / Play Store subscription management page
    const managementUrl = await purchaseService.getManagementURL();
    if (managementUrl) {
      Linking.openURL(managementUrl);
      return;
    }
    // On web or when no subscription exists, guide user to appropriate store
    if (Platform.OS === 'web') {
      Alert.alert(
        t('billing.paymentMethod'),
        t('billing.webPaymentMsg')
      );
    } else {
      // No active subscription — open the platform's subscription settings
      const storeUrl =
        Platform.OS === 'ios'
          ? 'https://apps.apple.com/account/subscriptions'
          : 'https://play.google.com/store/account/subscriptions';
      Linking.openURL(storeUrl);
    }
  }, [t]);

  const handleCancelPlan = useCallback(async () => {
    setShowCancelConfirm(false);
    // Cancellation is handled through the App Store / Play Store
    const managementUrl = await purchaseService.getManagementURL();
    if (managementUrl) {
      Alert.alert(
        t('billing.cancelSubscription'),
        t('billing.cancelRedirectMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('billing.continue'),
            onPress: () => Linking.openURL(managementUrl),
          },
        ]
      );
    } else if (currentTier === 'free') {
      Alert.alert(
        t('billing.cancelSubscription'),
        t('billing.alreadyFree')
      );
    } else {
      // Fallback: open platform store directly
      const storeUrl =
        Platform.OS === 'ios'
          ? 'https://apps.apple.com/account/subscriptions'
          : Platform.OS === 'android'
            ? 'https://play.google.com/store/account/subscriptions'
            : '';
      if (storeUrl) {
        Linking.openURL(storeUrl);
      } else {
        Alert.alert(
          t('billing.cancelSubscription'),
          t('billing.cancelMobileOnly')
        );
      }
    }
  }, [currentTier, t]);

  const getTierBadgeColor = (tier: string) => {
    if (tier === 'pro') return theme.semantic.cyan;
    if (tier === 'enterprise') return theme.semantic.purple;
    return theme.L2.base.text.secondary;
  };

  const getStatusBadgeStyle = (status: 'paid' | 'pending' | 'failed') => {
    switch (status) {
      case 'paid':
        return { borderColor: 'rgba(52,211,153,0.3)', backgroundColor: 'rgba(52,211,153,0.1)' };
      case 'pending':
        return { borderColor: 'rgba(251,146,60,0.3)', backgroundColor: 'rgba(251,146,60,0.1)' };
      case 'failed':
        return { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.1)' };
    }
  };

  const getStatusTextColor = (status: 'paid' | 'pending' | 'failed') => {
    switch (status) {
      case 'paid':
        return theme.semantic.green;
      case 'pending':
        return '#FB923C';
      case 'failed':
        return '#EF4444';
    }
  };

  return (
    <ShellLayout>
      <View style={styles.contentWrapper}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.L2.base.text.primary }]}>
            {t('billing.pageTitle')}
          </Text>
          <Text style={[styles.subtitle, { color: theme.L2.base.text.secondary }]}>
            {t('billing.pageSubtitle')}
          </Text>
        </View>

        {/* Current Plan */}
        <View style={styles.section}>
          <View style={[styles.currentPlanCard, resolveLayerStyle(theme.L2.base)]}>
            <View style={styles.currentPlanContent}>
              <View>
                <Text style={styles.planTitle}>{t('billing.currentPlan')}</Text>
                <View style={styles.planNameRow}>
                  <Text style={styles.planName}>{tierConfig?.name}</Text>
                  <View style={[styles.planBadge, { borderColor: getTierBadgeColor(currentTier) }]}>
                    <Text style={[styles.planBadgeText, { color: getTierBadgeColor(currentTier) }]}>
                      {t('billing.active')}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={styles.planDetails}>
                <View style={styles.planDetail}>
                  <Text style={styles.planDetailLabel}>{t('billing.price')}</Text>
                  <Text style={styles.planDetailValue}>
                    ${tierConfig?.priceMonthly}
                    {t('billing.perMonth')}
                  </Text>
                </View>
                <View style={styles.planDetail}>
                  <Text style={styles.planDetailLabel}>{t('billing.renewalDate')}</Text>
                  <Text style={styles.planDetailValue}>
                    {currentTier === 'free'
                      ? '—'
                      : t('billing.managedByStore')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Billing History */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.L2.base.text.primary }]}>
            {t('billing.billingHistory')}
          </Text>
          <View style={[styles.historyTable, resolveLayerStyle(theme.L2.base)]}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <View style={styles.tableColDate}>
                <Text style={[styles.tableHeaderText, { color: theme.L2.base.text.primary }]}>
                  {t('billing.date')}
                </Text>
              </View>
              <View style={styles.tableColDesc}>
                <Text style={[styles.tableHeaderText, { color: theme.L2.base.text.primary }]}>
                  {t('billing.description')}
                </Text>
              </View>
              <View style={styles.tableColAmount}>
                <Text style={[styles.tableHeaderText, { color: theme.L2.base.text.primary }]}>
                  {t('billing.amount')}
                </Text>
              </View>
              <View style={styles.tableColStatus}>
                <Text style={[styles.tableHeaderText, { color: theme.L2.base.text.primary }]}>
                  {t('billing.status')}
                </Text>
              </View>
              <View style={styles.tableColAction}>
                <Text style={[styles.tableHeaderText, { color: theme.L2.base.text.primary }]}>
                  {t('billing.action')}
                </Text>
              </View>
            </View>

            {/* Table Rows */}
            {invoices.length === 0 ? (
              <View style={[styles.tableRow, { justifyContent: 'center' }]}>
                <Text style={[styles.tableText, { color: theme.L2.base.text.primary }]}>
                  {t('billing.noInvoices')}
                </Text>
              </View>
            ) : (
              invoices.map(invoice => (
                <View key={invoice.id} style={styles.tableRow}>
                  <View style={styles.tableColDate}>
                    <Text style={[styles.tableText, { color: theme.L2.base.text.primary }]}>
                      {invoice.date}
                    </Text>
                  </View>
                  <View style={styles.tableColDesc}>
                    <View>
                      <Text style={[styles.tableText, { color: theme.L2.base.text.primary }]}>
                        {invoice.description}
                      </Text>
                      <Text style={[styles.tableSubtext, { color: theme.L2.base.text.secondary }]}>
                        {invoice.id}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.tableColAmount}>
                    <Text
                      style={[styles.tableText, styles.tableAmount, { color: theme.semantic.cyan }]}
                    >
                      ${invoice.amount.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.tableColStatus}>
                    <View style={[styles.statusBadge, getStatusBadgeStyle(invoice.status)]}>
                      <Text
                        style={[styles.statusText, { color: getStatusTextColor(invoice.status) }]}
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.tableColAction}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => handleDownloadReceipt(invoice.id)}
                      style={(state: any) => [
                        styles.downloadButton,
                        state.hovered && styles.downloadButtonHover,
                      ]}
                    >
                      <Feather name="download" size={14} color={theme.semantic.cyan} />
                      <Text style={[styles.downloadButtonText, { color: theme.semantic.cyan }]}>
                        {t('billing.receipt')}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.L2.base.text.primary }]}>
            {t('billing.paymentMethod')}
          </Text>
          <View style={[styles.paymentCard, resolveLayerStyle(theme.L2.base)]}>
            <View style={styles.paymentInfo}>
              <Feather name="credit-card" size={24} color={theme.semantic.cyan} />
              <View style={styles.paymentDetails}>
                <Text style={[styles.paymentType, { color: theme.L2.base.text.primary }]}>
                  {t('billing.noPaymentMethod')}
                </Text>
                <Text style={[styles.paymentNumber, { color: theme.L2.base.text.secondary }]}>
                  {t('billing.addPaymentPrompt')}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={handleChangePaymentMethod}
              style={(state: any) => [
                styles.changePaymentButton,
                state.hovered && styles.changePaymentButtonHover,
              ]}
            >
              <Text style={[styles.changePaymentButtonText, { color: theme.L2.base.text.primary }]}>
                {t('billing.change')}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Usage Stats */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.L2.base.text.primary }]}>
            {t('billing.pageSubtitle')}
          </Text>
          <View style={styles.statsGrid}>
            {usageStats.map((stat, index) => (
              <View key={index} style={[styles.statCard, resolveLayerStyle(theme.L2.base)]}>
                <View style={styles.statHeader}>
                  <Feather name={stat.icon as any} size={18} color={stat.color} />
                  <Text style={[styles.statLabel, { color: theme.L2.base.text.secondary }]}>
                    {stat.label}
                  </Text>
                </View>
                <Text style={[styles.statValue, { color: theme.L2.base.text.primary }]}>
                  {stat.value}
                </Text>
                {stat.max && (
                  <Text style={[styles.statMax, { color: theme.L2.base.text.secondary }]}>
                    {t('billing.ofMax', { max: stat.max })}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Cancel Plan */}
        <View style={styles.section}>
          <View style={[styles.cancelCard, resolveLayerStyle(theme.L2.base)]}>
            <View style={styles.cancelContent}>
              <View style={styles.cancelIconBox}>
                <Ionicons name="warning" size={24} color="#EF4444" />
              </View>
              <View style={styles.cancelText}>
                <Text style={styles.cancelTitle}>{t('billing.dangerZone')}</Text>
                <Text style={[styles.cancelDesc, { color: theme.L2.base.text.secondary }]}>
                  {t('billing.cancelDesc')}
                </Text>
              </View>
            </View>

            {showCancelConfirm ? (
              <View style={styles.confirmSection}>
                <Text style={[styles.confirmText, { color: theme.L2.base.text.secondary }]}>
                  {t('billing.cancelConfirmMsg')}
                </Text>
                <View style={styles.confirmButtons}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowCancelConfirm(false)}
                    style={(state: any) => [
                      styles.confirmCancelButton,
                      state.hovered && styles.confirmCancelButtonHover,
                    ]}
                  >
                    <Text
                      style={[
                        styles.confirmCancelButtonText,
                        { color: theme.L2.base.text.primary },
                      ]}
                    >
                      {t('billing.keepPlan')}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleCancelPlan}
                    style={(state: any) => [
                      styles.confirmConfirmButton,
                      state.hovered && styles.confirmConfirmButtonHover,
                    ]}
                  >
                    <Text style={styles.confirmConfirmButtonText}>{t('billing.yesCancel')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowCancelConfirm(true)}
                style={(state: any) => [
                  styles.cancelButton,
                  state.hovered && styles.cancelButtonHover,
                ]}
              >
                <Text style={styles.cancelButtonText}>{t('billing.cancelSubscription')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </ShellLayout>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  contentWrapper: {
    paddingTop: dashboardSpacing.lg,
  },
  header: {
    marginBottom: dashboardSpacing.md,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
  },

  // Sections
  section: {
    marginBottom: dashboardSpacing.xl,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },

  // Current Plan
  currentPlanCard: {
    padding: 20,
    borderRadius: 16,
  },
  currentPlanContent: {
    gap: 16,
  },
  planTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  planNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  planName: {
    fontSize: 26,
    fontWeight: '700',
  },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  planBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  planDetails: {
    flexDirection: 'row',
    gap: 24,
  },
  planDetail: {
    gap: 4,
  },
  planDetailLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  planDetailValue: {
    fontSize: 15,
    fontWeight: '600',
  },

  // Billing History Table
  historyTable: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.2)',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.1)',
    alignItems: 'center',
  },
  tableColDate: {
    width: 90,
  },
  tableColDesc: {
    flex: 1.2,
  },
  tableColAmount: {
    width: 90,
  },
  tableColStatus: {
    width: 100,
  },
  tableColAction: {
    width: 100,
  },
  tableHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tableText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tableSubtext: {
    fontSize: 11,
    marginTop: 2,
  },
  tableAmount: {
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  downloadButtonHover: {
    backgroundColor: 'rgba(34,211,238,0.2)',
  },
  downloadButtonText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Payment Method
  paymentCard: {
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  paymentInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentDetails: {
    gap: 2,
  },
  paymentType: {
    fontSize: 14,
    fontWeight: '700',
  },
  paymentNumber: {
    fontSize: 12,
  },
  paymentExpiry: {
    fontSize: 11,
  },
  changePaymentButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
  changePaymentButtonHover: {
    backgroundColor: 'rgba(139,92,246,0.25)',
  },
  changePaymentButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Usage Stats
  statsGrid: {
    gap: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 160,
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  statHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statMax: {
    fontSize: 11,
  },
  statBarContainer: {
    height: 4,
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  statBar: {
    height: '100%',
    borderRadius: 2,
  },

  // Cancel Plan
  cancelCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    backgroundColor: 'rgba(239,68,68,0.05)',
  },
  cancelContent: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  cancelIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    flex: 1,
    gap: 4,
  },
  cancelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#EF4444',
  },
  cancelDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
  },
  cancelButtonHover: {
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EF4444',
  },
  confirmSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(239,68,68,0.2)',
    paddingTop: 12,
    gap: 10,
  },
  confirmText: {
    fontSize: 12,
    lineHeight: 16,
  },
  confirmButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  confirmCancelButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(139,92,246,0.1)',
    alignItems: 'center',
  },
  confirmCancelButtonHover: {
    backgroundColor: 'rgba(139,92,246,0.2)',
  },
  confirmCancelButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  confirmConfirmButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.4)',
    backgroundColor: 'rgba(239,68,68,0.1)',
    alignItems: 'center',
  },
  confirmConfirmButtonHover: {
    backgroundColor: 'rgba(239,68,68,0.2)',
  },
  confirmConfirmButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
});

export default withErrorBoundary(BillingScreen, 'Billing');
