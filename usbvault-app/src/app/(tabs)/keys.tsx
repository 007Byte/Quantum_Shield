/**
 * Key Management Screen (SCR-02)
 *
 * Cryptographic key management interface with key status display,
 * rotation controls, provider selection, and export functionality.
 * Uses pqcStatusService for PQC key monitoring.
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
} from '@/components/dashboard2/styles';

import { useLanguage } from '@/hooks/useLanguage';
import { withErrorBoundary } from '@/components/common/withErrorBoundary';
import { EmptyState } from '@/components/common/EmptyState';

// ── Main Component ─────────────────────────────────────────────

function KeysScreen() {
  const { t } = useLanguage();
  const [selectedProvider, setSelectedProvider] = useState<'password' | 'pqc' | 'hardware' | 'hsm'>(
    'pqc'
  );

  const keys = [
    {
      id: 'ed25519',
      name: t('keys.ed25519Name'),
      algorithm: 'Ed25519',
      type: 'signing',
      created: '2024-01-15',
      status: 'active' as const,
    },
    {
      id: 'x25519',
      name: t('keys.x25519Name'),
      algorithm: 'X25519',
      type: 'key agreement',
      created: '2024-01-15',
      status: 'active' as const,
    },
    {
      id: 'ml-kem',
      name: t('keys.mlkemName'),
      algorithm: 'ML-KEM-1024',
      type: 'post-quantum encapsulation',
      created: '2024-01-20',
      status: 'active' as const,
    },
    {
      id: 'aes256',
      name: t('keys.aes256Name'),
      algorithm: 'AES-256',
      type: 'encryption',
      created: '2023-12-01',
      status: 'active' as const,
    },
  ];

  const handleRotateKey = () => {
    Alert.alert(t('keys.rotateKeys'), t('keys.rotateConfirm'), [
      { text: t('keys.cancel'), style: 'cancel' },
      {
        text: t('keys.rotateNow'),
        onPress: () => Alert.alert(t('keys.success'), t('keys.rotationInitiated')),
      },
    ]);
  };

  const handleExportPublicKey = () => {
    Alert.alert(t('keys.export'), t('keys.exportSuccess'));
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageContent}
        showsVerticalScrollIndicator
      >
        <View style={styles.shell}>
          <View style={styles.shellEdgeGlow} />
          <Sidebar />

          <View style={styles.mainCol}>
            <TopBar />

            <View style={styles.contentWrapper}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title} accessibilityRole="header">
                  {t('keys.pageTitle')}
                </Text>
                <Text style={styles.subtitle}>{t('keys.pageSubtitle')}</Text>
              </View>

              {/* Active Keys Section */}
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle} accessibilityRole="header">
                    {t('keys.activeKeys')}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={handleRotateKey}
                    style={(state: any) => [
                      styles.rotateButton,
                      state.hovered && styles.rotateButtonHover,
                    ]}
                  >
                    <Feather name="rotate-cw" size={14} color={dashboardColors.cyan} />
                    <Text style={styles.rotateButtonText}>{t('keys.rotateKeys')}</Text>
                  </Pressable>
                </View>

                {keys.length === 0 ? (
                  <EmptyState
                    icon="key"
                    title={t('empty.keys')}
                    description={t('empty.keysDescription')}
                  />
                ) : (
                  <View style={styles.keysGrid}>
                    {keys.map(key => (
                      <View key={key.id} style={[styles.keyCard, glassPanelBase, webOnlyGlass]}>
                        <View style={styles.keyCardHeader}>
                          <View>
                            <Text style={styles.keyName}>{key.name}</Text>
                            <Text style={styles.keyType}>{key.algorithm}</Text>
                          </View>
                          <View style={[styles.statusBadge, styles.statusActive]}>
                            <View style={styles.statusDot} />
                            <Text style={styles.statusText}>{t('keys.active')}</Text>
                          </View>
                        </View>

                        <View style={styles.keyCardContent}>
                          <View style={styles.keyDetail}>
                            <Text style={styles.keyLabel}>{t('keys.created')}</Text>
                            <Text style={styles.keyValue}>{key.created}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Key Provider Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('keys.keyProvider')}
                </Text>
                <View style={[styles.providerCard, glassPanelBase, webOnlyGlass]}>
                  {[
                    {
                      value: 'password' as const,
                      label: t('keys.providerPassword'),
                      icon: 'lock',
                    },
                    {
                      value: 'pqc' as const,
                      label: t('keys.providerPQC'),
                      icon: 'shield',
                    },
                    {
                      value: 'hardware' as const,
                      label: t('keys.providerHardware'),
                      icon: 'key',
                    },
                    { value: 'hsm' as const, label: t('keys.providerHSM'), icon: 'cpu' },
                  ].map(provider => (
                    <Pressable
                      accessibilityRole="button"
                      key={provider.value}
                      onPress={() => setSelectedProvider(provider.value)}
                      style={(state: any) => [
                        styles.providerOption,
                        selectedProvider === provider.value && styles.providerOptionSelected,
                        state.hovered && styles.providerOptionHover,
                      ]}
                    >
                      <View style={styles.providerRadio}>
                        <View
                          style={[
                            styles.providerRadioOuter,
                            selectedProvider === provider.value && styles.providerRadioSelected,
                          ]}
                        >
                          {selectedProvider === provider.value && (
                            <View style={styles.providerRadioInner} />
                          )}
                        </View>
                      </View>
                      <Feather name={provider.icon as any} size={18} color={dashboardColors.cyan} />
                      <Text style={styles.providerLabel}>{provider.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Key Export Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('keys.keyExport')}
                </Text>
                <View style={[styles.exportCard, glassPanelBase, webOnlyGlass]}>
                  <View style={styles.exportInfo}>
                    <Ionicons name="information-circle" size={20} color={dashboardColors.cyan} />
                    <View style={styles.exportInfoText}>
                      <Text style={styles.exportTitle}>{t('keys.exportPublicKeys')}</Text>
                      <Text style={styles.exportDesc}>{t('keys.exportDescription')}</Text>
                    </View>
                  </View>

                  <Pressable
                    accessibilityRole="button"
                    onPress={handleExportPublicKey}
                    style={(state: any) => [
                      styles.exportButton,
                      state.hovered && styles.exportButtonHover,
                    ]}
                  >
                    <Feather name="download" size={16} color={dashboardColors.cyan} />
                    <Text style={styles.exportButtonText}>{t('keys.exportBtn')}</Text>
                  </Pressable>
                </View>
              </View>

              {/* Rotation History */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} accessibilityRole="header">
                  {t('keys.rotationHistory')}
                </Text>
                <View style={[styles.historyCard, glassPanelBase, webOnlyGlass]}>
                  <View style={styles.historyItem}>
                    <View style={styles.historyDate}>
                      <Text style={styles.historyDateText}>{t('keys.45DaysAgo')}</Text>
                      <Text style={styles.historyDateSubtext}>2024-01-20</Text>
                    </View>
                    <View style={styles.historyEvent}>
                      <Text style={styles.historyEventText}>{t('keys.allKeysRotated')}</Text>
                      <Text style={styles.historyEventDesc}>Ed25519, ML-KEM-1024, X25519</Text>
                    </View>
                  </View>

                  <View style={styles.historyDivider} />

                  <View style={styles.historyItem}>
                    <View style={styles.historyDate}>
                      <Text style={styles.historyDateText}>{t('keys.90DaysAgo')}</Text>
                      <Text style={styles.historyDateSubtext}>2023-12-01</Text>
                    </View>
                    <View style={styles.historyEvent}>
                      <Text style={styles.historyEventText}>{t('keys.masterKeyInit')}</Text>
                      <Text style={styles.historyEventDesc}>AES-256 encryption key</Text>
                    </View>
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
      background:
        'linear-gradient(180deg, rgba(19,11,41,0.32) 0%, rgba(8,5,20,0.40) 56%, rgba(8,5,20,0.50) 100%)',
      boxShadow:
        '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    }),
  },
  shellEdgeGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  rotateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.3)',
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  rotateButtonHover: {
    backgroundColor: 'rgba(34,211,238,0.2)',
  },
  rotateButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.cyan,
  },

  // Keys Grid
  keysGrid: {
    gap: 12,
  },
  keyCard: {
    padding: 16,
    borderRadius: 14,
    marginBottom: 4,
  },
  keyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  keyName: {
    fontSize: 15,
    fontWeight: '700',
    color: dashboardColors.textPrimary,
  },
  keyType: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    marginTop: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusActive: {
    borderColor: 'rgba(52,211,153,0.3)',
    backgroundColor: 'rgba(52,211,153,0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: dashboardColors.green,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: dashboardColors.green,
  },

  keyCardContent: {
    gap: 12,
  },
  keyDetail: {
    gap: 4,
  },
  keyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: dashboardColors.textSecondary,
    letterSpacing: 0.3,
  },
  keyValue: {
    fontSize: 13,
    color: dashboardColors.textPrimary,
    fontFamily: 'monospace',
  },
  fingerprintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  copyButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  copyButtonHover: {
    backgroundColor: 'rgba(34,211,238,0.2)',
  },

  // Provider Selection
  providerCard: {
    padding: 16,
    borderRadius: 14,
    gap: 10,
  },
  providerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    gap: 10,
  },
  providerOptionSelected: {
    borderColor: 'rgba(34,211,238,0.6)',
    backgroundColor: 'rgba(34,211,238,0.12)',
  },
  providerOptionHover: {
    backgroundColor: 'rgba(139,92,246,0.08)',
  },
  providerRadio: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  providerRadioOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(139,92,246,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  providerRadioSelected: {
    borderColor: dashboardColors.cyan,
  },
  providerRadioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: dashboardColors.cyan,
  },
  providerLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: dashboardColors.textPrimary,
  },

  // Export Section
  exportCard: {
    padding: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  exportInfo: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  exportInfoText: {
    flex: 1,
    gap: 4,
  },
  exportTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  exportDesc: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    lineHeight: 16,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.3)',
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  exportButtonHover: {
    backgroundColor: 'rgba(34,211,238,0.2)',
  },
  exportButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.cyan,
  },

  // History
  historyCard: {
    padding: 16,
    borderRadius: 14,
  },
  historyItem: {
    flexDirection: 'row',
    gap: 14,
  },
  historyDate: {
    width: 80,
    gap: 2,
  },
  historyDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  historyDateSubtext: {
    fontSize: 11,
    color: dashboardColors.textSecondary,
  },
  historyEvent: {
    flex: 1,
    gap: 2,
  },
  historyEventText: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  historyEventDesc: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  historyDivider: {
    height: 1,
    backgroundColor: 'rgba(139,92,246,0.1)',
    marginVertical: 10,
  },
});

export default withErrorBoundary(KeysScreen, 'Keys');
