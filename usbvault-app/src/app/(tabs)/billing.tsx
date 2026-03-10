/**
 * Billing & Subscription Screen (INFRA-04)
 *
 * Subscription management, billing history, payment methods, usage statistics,
 * and plan cancellation. Integrates with tierService for plan information.
 */

import { ScrollView, StyleSheet, Text, View, Pressable, Alert } from 'react-native';
import { useState } from 'react';
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
} from '@/components/dashboard2/styles';
import { tierService } from '@/services/tierService';

// ── Main Component ─────────────────────────────────────────────

export default function BillingScreen() {
  const currentTier = tierService.getCurrentTier();
  const tierConfig = tierService.getTierConfig(currentTier);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const invoices = [
    {
      id: 'INV-2024-003',
      date: '2024-03-01',
      description: 'QAV Pro - Monthly Subscription',
      amount: 9.99,
      status: 'paid' as const,
    },
    {
      id: 'INV-2024-002',
      date: '2024-02-01',
      description: 'QAV Pro - Monthly Subscription',
      amount: 9.99,
      status: 'paid' as const,
    },
    {
      id: 'INV-2024-001',
      date: '2024-01-01',
      description: 'QAV Pro - Monthly Subscription',
      amount: 9.99,
      status: 'paid' as const,
    },
  ];

  const usageStats = [
    {
      label: 'Storage Used',
      value: '2.4 GB',
      max: '50 GB',
      percentage: 4.8,
      icon: 'hard-drive',
      color: dashboardColors.cyan,
    },
    {
      label: 'Files Encrypted',
      value: '1,247',
      max: 'Unlimited',
      icon: 'lock',
      color: dashboardColors.cyan,
    },
    {
      label: 'Shares Created',
      value: '12',
      max: 'Unlimited',
      icon: 'share-2',
      color: dashboardColors.cyan,
    },
    {
      label: 'Messages Sent',
      value: '284',
      max: 'Unlimited',
      icon: 'mail',
      color: dashboardColors.cyan,
    },
  ];

  const handleDownloadReceipt = (invoiceId: string) => {
    Alert.alert('Receipt', `Downloading receipt for ${invoiceId}...`);
  };

  const handleChangePaymentMethod = () => {
    Alert.alert('Coming Soon', 'Payment method management coming in the next update.');
  };

  const handleCancelPlan = () => {
    setShowCancelConfirm(false);
    Alert.alert(
      'Plan Cancelled',
      'Your subscription has been cancelled. Contact ultimatepqcshield@gmail.com to restore your plan.'
    );
  };

  const getTierBadgeColor = (tier: string) => {
    if (tier === 'pro') return dashboardColors.cyan;
    if (tier === 'enterprise') return dashboardColors.glowPurple;
    return dashboardColors.textSecondary;
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
        return dashboardColors.green;
      case 'pending':
        return '#FB923C';
      case 'failed':
        return '#EF4444';
    }
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
                <Text style={styles.title}>Billing & Subscription</Text>
                <Text style={styles.subtitle}>
                  Manage your subscription plan and billing details
                </Text>
              </View>

              {/* Current Plan */}
              <View style={styles.section}>
                <View style={[styles.currentPlanCard, glassPanelBase, webOnlyGlass, webOnlyGlowTier2]}>
                  <View style={styles.currentPlanContent}>
                    <View>
                      <Text style={styles.planTitle}>Current Plan</Text>
                      <View style={styles.planNameRow}>
                        <Text style={styles.planName}>{tierConfig?.name}</Text>
                        <View style={[styles.planBadge, { borderColor: getTierBadgeColor(currentTier) }]}>
                          <Text style={[styles.planBadgeText, { color: getTierBadgeColor(currentTier) }]}>
                            Active
                          </Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.planDetails}>
                      <View style={styles.planDetail}>
                        <Text style={styles.planDetailLabel}>Price</Text>
                        <Text style={styles.planDetailValue}>${tierConfig?.priceMonthly}/month</Text>
                      </View>
                      <View style={styles.planDetail}>
                        <Text style={styles.planDetailLabel}>Renewal Date</Text>
                        <Text style={styles.planDetailValue}>April 1, 2024</Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* Billing History */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Billing History</Text>
                <View style={[styles.historyTable, glassPanelBase, webOnlyGlass]}>
                  {/* Table Header */}
                  <View style={styles.tableHeader}>
                    <View style={styles.tableColDate}>
                      <Text style={styles.tableHeaderText}>Date</Text>
                    </View>
                    <View style={styles.tableColDesc}>
                      <Text style={styles.tableHeaderText}>Description</Text>
                    </View>
                    <View style={styles.tableColAmount}>
                      <Text style={styles.tableHeaderText}>Amount</Text>
                    </View>
                    <View style={styles.tableColStatus}>
                      <Text style={styles.tableHeaderText}>Status</Text>
                    </View>
                    <View style={styles.tableColAction}>
                      <Text style={styles.tableHeaderText}>Action</Text>
                    </View>
                  </View>

                  {/* Table Rows */}
                  {invoices.map((invoice) => (
                    <View key={invoice.id} style={styles.tableRow}>
                      <View style={styles.tableColDate}>
                        <Text style={styles.tableText}>{invoice.date}</Text>
                      </View>
                      <View style={styles.tableColDesc}>
                        <View>
                          <Text style={styles.tableText}>{invoice.description}</Text>
                          <Text style={styles.tableSubtext}>{invoice.id}</Text>
                        </View>
                      </View>
                      <View style={styles.tableColAmount}>
                        <Text style={[styles.tableText, styles.tableAmount]}>${invoice.amount.toFixed(2)}</Text>
                      </View>
                      <View style={styles.tableColStatus}>
                        <View
                          style={[
                            styles.statusBadge,
                            getStatusBadgeStyle(invoice.status),
                          ]}
                        >
                          <Text style={[styles.statusText, { color: getStatusTextColor(invoice.status) }]}>
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.tableColAction}>
                        <Pressable
                          onPress={() => handleDownloadReceipt(invoice.id)}
                          style={(state: any) => [
                            styles.downloadButton,
                            state.hovered && styles.downloadButtonHover,
                          ]}
                        >
                          <Feather name="download" size={14} color={dashboardColors.cyan} />
                          <Text style={styles.downloadButtonText}>Receipt</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              {/* Payment Method */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Payment Method</Text>
                <View style={[styles.paymentCard, glassPanelBase, webOnlyGlass]}>
                  <View style={styles.paymentInfo}>
                    <Feather name="credit-card" size={24} color={dashboardColors.cyan} />
                    <View style={styles.paymentDetails}>
                      <Text style={styles.paymentType}>Visa</Text>
                      <Text style={styles.paymentNumber}>Card ending in 4242</Text>
                      <Text style={styles.paymentExpiry}>Expires 12/2025</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={handleChangePaymentMethod}
                    style={(state: any) => [
                      styles.changePaymentButton,
                      state.hovered && styles.changePaymentButtonHover,
                    ]}
                  >
                    <Text style={styles.changePaymentButtonText}>Change</Text>
                  </Pressable>
                </View>
              </View>

              {/* Usage Stats */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Usage Statistics</Text>
                <View style={styles.statsGrid}>
                  {usageStats.map((stat, index) => (
                    <View
                      key={index}
                      style={[styles.statCard, glassPanelBase, webOnlyGlass]}
                    >
                      <View style={styles.statHeader}>
                        <Feather name={stat.icon as any} size={18} color={stat.color} />
                        <Text style={styles.statLabel}>{stat.label}</Text>
                      </View>
                      <Text style={styles.statValue}>{stat.value}</Text>
                      {stat.max && <Text style={styles.statMax}>of {stat.max}</Text>}
                      {stat.percentage !== undefined && (
                        <View style={styles.statBarContainer}>
                          <View
                            style={[
                              styles.statBar,
                              { width: `${stat.percentage}%`, backgroundColor: stat.color },
                            ]}
                          />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </View>

              {/* Cancel Plan */}
              <View style={styles.section}>
                <View style={[styles.cancelCard, glassPanelBase, webOnlyGlass]}>
                  <View style={styles.cancelContent}>
                    <View style={styles.cancelIconBox}>
                      <Ionicons name="warning" size={24} color="#EF4444" />
                    </View>
                    <View style={styles.cancelText}>
                      <Text style={styles.cancelTitle}>Danger Zone</Text>
                      <Text style={styles.cancelDesc}>
                        Cancelling your subscription will immediately revoke access to premium features. This action is permanent.
                      </Text>
                    </View>
                  </View>

                  {showCancelConfirm ? (
                    <View style={styles.confirmSection}>
                      <Text style={styles.confirmText}>
                        Are you sure? Contact ultimatepqcshield@gmail.com to restore your plan later.
                      </Text>
                      <View style={styles.confirmButtons}>
                        <Pressable
                          onPress={() => setShowCancelConfirm(false)}
                          style={(state: any) => [
                            styles.confirmCancelButton,
                            state.hovered && styles.confirmCancelButtonHover,
                          ]}
                        >
                          <Text style={styles.confirmCancelButtonText}>Keep Plan</Text>
                        </Pressable>
                        <Pressable
                          onPress={handleCancelPlan}
                          style={(state: any) => [
                            styles.confirmConfirmButton,
                            state.hovered && styles.confirmConfirmButtonHover,
                          ]}
                        >
                          <Text style={styles.confirmConfirmButtonText}>Yes, Cancel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setShowCancelConfirm(true)}
                      style={(state: any) => [
                        styles.cancelButton,
                        state.hovered && styles.cancelButtonHover,
                      ]}
                    >
                      <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
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
    color: dashboardColors.textSecondary,
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
    color: dashboardColors.textPrimary,
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
    color: dashboardColors.textSecondary,
    letterSpacing: 0.3,
  },
  planDetailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
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
    color: dashboardColors.textPrimary,
    letterSpacing: 0.3,
  },
  tableText: {
    fontSize: 13,
    color: dashboardColors.textPrimary,
    fontWeight: '500',
  },
  tableSubtext: {
    fontSize: 11,
    color: dashboardColors.textSecondary,
    marginTop: 2,
  },
  tableAmount: {
    fontWeight: '700',
    color: dashboardColors.cyan,
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
    color: dashboardColors.cyan,
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
    color: dashboardColors.textPrimary,
  },
  paymentNumber: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  paymentExpiry: {
    fontSize: 11,
    color: dashboardColors.textSecondary,
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
    color: dashboardColors.textPrimary,
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
    color: dashboardColors.textSecondary,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
  },
  statMax: {
    fontSize: 11,
    color: dashboardColors.textSecondary,
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
    color: dashboardColors.textSecondary,
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
    color: dashboardColors.textSecondary,
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
    color: dashboardColors.textPrimary,
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
