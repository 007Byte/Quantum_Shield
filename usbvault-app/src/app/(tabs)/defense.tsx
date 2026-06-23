/**
 * Defense-in-Depth Screen (DID-01 + DID-02)
 *
 * Full-screen view showing all 10 security layers as a visual stack.
 * Each layer is a card with active/inactive status, color-coded.
 * Includes cryptographic properties panel showing CI, Forward Secrecy,
 * and Non-Repudiation with algorithm details.
 *
 * Subtle pulse animations on active layers.
 * Glassmorphic card design consistent with app theme.
 */

import { ScrollView, StyleSheet, Text, View, Animated } from 'react-native';
import { useEffect, useRef, useMemo, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { Sidebar } from '@/components/dashboard2/Sidebar';
import { TopBar } from '@/components/dashboard2/TopBar';
import {
  dashboardLayout,
  dashboardSpacing,
  dashboardColors,
  glassPanelBase,
  webOnlyGlass,
  webOnlyGlowTier3,
} from '@/components/dashboard2/styles';
import { settingsService } from '@/services/settingsService';
import { fido2Service } from '@/services/fido2Service';
import { useLanguage } from '@/hooks/useLanguage';

// ── Security Layer Definitions ─────────────────────────────

interface SecurityLayer {
  id: string;
  name: string;
  description: string;
  icon: string;
  activeColor: string;
  isActive: boolean;
  details: string;
}

interface CryptoProperty {
  id: string;
  name: string;
  description: string;
  algorithm: string;
  isActive: boolean;
  icon: string;
  color: string;
}

export default function DefenseScreen() {
  const { t } = useLanguage();
  const [settings, setSettings] = useState(settingsService.load());

  useEffect(() => {
    setSettings(settingsService.load());
  }, []);

  const fido2Count = fido2Service.getDeviceCount();

  // ── 10 Security Layers ────────────────────────────

  const layers: SecurityLayer[] = useMemo(
    () => [
      {
        id: 'srp',
        name: t('defense.layer.srp.name'),
        description: t('defense.layer.srp.desc'),
        icon: 'key',
        activeColor: '#34D399',
        isActive: true,
        details: t('defense.layer.srp.details'),
      },
      {
        id: 'fido2',
        name: t('defense.layer.fido2.name'),
        description: t('defense.layer.fido2.desc'),
        icon: 'fingerprint' as any,
        activeColor: '#22D3EE',
        isActive: fido2Count > 0 || settings.biometricLockEnabled,
        details:
          fido2Count > 0
            ? t('defense.layer.fido2.keysRegistered', { count: fido2Count })
            : settings.biometricLockEnabled
              ? t('defense.layer.fido2.biometricEnabled')
              : t('defense.layer.fido2.noMfa'),
      },
      {
        id: 'aead',
        name: t('defense.layer.aead.name'),
        description: t('defense.layer.aead.desc'),
        icon: 'lock',
        activeColor: '#A855F7',
        isActive: true,
        details: t('defense.layer.aead.details'),
      },
      {
        id: 'pinning',
        name: t('defense.layer.pinning.name'),
        description: t('defense.layer.pinning.desc'),
        icon: 'shield',
        activeColor: '#60A5FA',
        isActive: true,
        details: t('defense.layer.pinning.details'),
      },
      {
        id: 'integrity',
        name: t('defense.layer.integrity.name'),
        description: t('defense.layer.integrity.desc'),
        icon: 'smartphone',
        activeColor: '#FBBF24',
        isActive: true,
        details: t('defense.layer.integrity.details'),
      },
      {
        id: 'runtime',
        name: t('defense.layer.runtime.name'),
        description: t('defense.layer.runtime.desc'),
        icon: 'eye-off',
        activeColor: '#F472B6',
        isActive: true,
        details: t('defense.layer.runtime.details'),
      },
      {
        id: 'selfdestruct',
        name: t('defense.layer.selfdestruct.name'),
        description: t('defense.layer.selfdestruct.desc'),
        icon: 'zap',
        activeColor: '#EF4444',
        isActive: settings.selfDestructEnabled,
        details: settings.selfDestructEnabled
          ? t('defense.layer.selfdestruct.wipeAfter', { attempts: settings.selfDestructAttempts })
          : t('defense.layer.selfdestruct.notEnabled'),
      },
      {
        id: 'audit',
        name: t('defense.layer.audit.name'),
        description: t('defense.layer.audit.desc'),
        icon: 'file-text',
        activeColor: '#818CF8',
        isActive: true,
        details: t('defense.layer.audit.details'),
      },
      {
        id: 'ghost',
        name: t('defense.layer.ghost.name'),
        description: t('defense.layer.ghost.desc'),
        icon: 'ghost' as any,
        activeColor: '#6EE7B7',
        isActive: settings.ghostModeEnabled,
        details: settings.ghostModeEnabled
          ? t('defense.layer.ghost.activeDetails')
          : t('defense.layer.ghost.notEnabled'),
      },
      {
        id: 'pqc',
        name: t('defense.layer.pqc.name'),
        description: t('defense.layer.pqc.desc'),
        icon: 'cpu',
        activeColor: '#22D3EE',
        isActive: settings.pqcEnabled,
        details: settings.pqcEnabled
          ? t('defense.layer.pqc.activeDetails')
          : t('defense.layer.pqc.notEnabled'),
      },
    ],
    [settings, fido2Count, t]
  );

  const activeCount = layers.filter(l => l.isActive).length;

  // ── Cryptographic Properties (DID-02) ─────────────

  const cryptoProps: CryptoProperty[] = useMemo(
    () => [
      {
        id: 'ci',
        name: t('defense.crypto.ci.name'),
        description: t('defense.crypto.ci.desc'),
        algorithm: t('defense.crypto.ci.algo'),
        isActive: true,
        icon: 'lock',
        color: '#A855F7',
      },
      {
        id: 'availability',
        name: t('defense.crypto.availability.name'),
        description: t('defense.crypto.availability.desc'),
        algorithm: t('defense.crypto.availability.algo'),
        isActive: true,
        icon: 'cloud',
        color: '#F59E0B',
      },
      {
        id: 'fs',
        name: t('defense.crypto.fs.name'),
        description: t('defense.crypto.fs.desc'),
        algorithm: t('defense.crypto.fs.algo'),
        isActive: true,
        icon: 'refresh-cw',
        color: '#22D3EE',
      },
      {
        id: 'nr',
        name: t('defense.crypto.nr.name'),
        description: t('defense.crypto.nr.desc'),
        algorithm: t('defense.crypto.nr.algo'),
        isActive: true,
        icon: 'check-circle',
        color: '#34D399',
      },
    ],
    [t]
  );

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
                  {t('defense.pageTitle')}
                </Text>
                <Text style={styles.subtitle}>
                  {t('defense.layerCount', { active: activeCount, total: layers.length })}
                </Text>
              </View>

              {/* Overall Score Badge */}
              <View style={styles.scoreBadge}>
                <View
                  style={[
                    styles.scoreCircle,
                    activeCount >= 8
                      ? styles.scoreExcellent
                      : activeCount >= 6
                        ? styles.scoreGood
                        : styles.scoreWarn,
                  ]}
                >
                  <Text style={styles.scoreNumber}>{activeCount}</Text>
                  <Text style={styles.scoreSlash}>/{layers.length}</Text>
                </View>
                <View>
                  <Text style={styles.scoreLabel}>
                    {activeCount >= 9
                      ? t('defense.maxProtection')
                      : activeCount >= 7
                        ? t('defense.strongProtection')
                        : activeCount >= 5
                          ? t('defense.goodProtection')
                          : t('defense.needsAttention')}
                  </Text>
                  <Text style={styles.scoreHint}>{t('defense.enableMoreLayers')}</Text>
                </View>
              </View>

              {/* Security Layers Stack */}
              <Text style={styles.sectionTitle} accessibilityRole="header">
                {t('defense.layers')}
              </Text>
              <View style={styles.layersStack}>
                {layers.map((layer, index) => (
                  <LayerCard key={layer.id} layer={layer} index={index} />
                ))}
              </View>

              {/* Cryptographic Properties Panel (DID-02) */}
              <Text
                style={[styles.sectionTitle, { marginTop: dashboardSpacing.lg }]}
                accessibilityRole="header"
              >
                {t('defense.cryptoProperties')}
              </Text>
              <View style={styles.cryptoGrid}>
                {cryptoProps.map(prop => (
                  <CryptoPropertyCard key={prop.id} property={prop} />
                ))}
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

// ── Layer Card Component ────────────────────────────────────

function LayerCard({ layer, index }: { layer: SecurityLayer; index: number }) {
  const { t } = useLanguage();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (layer.isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 1500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [layer.isActive]);

  const iconName =
    layer.icon === 'fingerprint' || layer.icon === 'ghost'
      ? 'shield' // Feather doesn't have these, use fallback
      : layer.icon;

  return (
    <View
      style={[
        styles.layerCard,
        glassPanelBase,
        webOnlyGlass,
        styles.layerHalo,
        {
          borderLeftWidth: 3,
          borderLeftColor: layer.isActive ? layer.activeColor : 'rgba(255,255,255,0.1)',
        },
      ]}
    >
      {/* Layer number */}
      <View style={styles.layerNumber}>
        <Text style={styles.layerNumberText}>{index + 1}</Text>
      </View>

      {/* Status indicator with pulse */}
      <Animated.View
        style={[
          styles.statusDot,
          {
            backgroundColor: layer.isActive ? layer.activeColor : 'rgba(255,255,255,0.15)',
            opacity: layer.isActive ? pulseAnim : 0.4,
          },
        ]}
      />

      {/* Icon */}
      <View
        style={[
          styles.layerIcon,
          { borderColor: layer.isActive ? layer.activeColor : 'rgba(255,255,255,0.1)' },
        ]}
      >
        <Feather
          name={iconName as any}
          size={18}
          color={layer.isActive ? layer.activeColor : 'rgba(255,255,255,0.3)'}
        />
      </View>

      {/* Content */}
      <View style={styles.layerContent}>
        <View style={styles.layerNameRow}>
          <Text style={[styles.layerName, !layer.isActive && { opacity: 0.5 }]}>{layer.name}</Text>
          <View
            style={[
              styles.statusBadge,
              layer.isActive ? styles.statusActive : styles.statusInactive,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                layer.isActive ? { color: '#34D399' } : { color: '#EF4444' },
              ]}
            >
              {layer.isActive ? t('defense.active') : t('defense.off')}
            </Text>
          </View>
        </View>
        <Text style={styles.layerDesc}>{layer.description}</Text>
        <Text
          style={[
            styles.layerDetails,
            { color: layer.isActive ? layer.activeColor : 'rgba(255,255,255,0.3)' },
          ]}
        >
          {layer.details}
        </Text>
      </View>
    </View>
  );
}

// ── Crypto Property Card ────────────────────────────────────

function CryptoPropertyCard({ property }: { property: CryptoProperty }) {
  const { t } = useLanguage();
  return (
    <View
      style={[
        styles.cryptoCard,
        glassPanelBase,
        webOnlyGlass,
        webOnlyGlowTier3,
        styles.cryptoHalo,
        { borderLeftWidth: 3, borderLeftColor: property.color },
      ]}
    >
      <View style={styles.cryptoHeader}>
        <View style={[styles.cryptoIcon, { borderColor: property.color }]}>
          <Feather name={property.icon as any} size={20} color={property.color} />
        </View>
        <View style={styles.cryptoHeaderText}>
          <Text style={styles.cryptoName}>{property.name}</Text>
          <View
            style={[
              styles.statusBadge,
              property.isActive ? styles.statusActive : styles.statusInactive,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                property.isActive ? { color: '#34D399' } : { color: '#EF4444' },
              ]}
            >
              {property.isActive ? t('defense.engaged') : t('defense.inactive')}
            </Text>
          </View>
        </View>
      </View>
      <Text style={styles.cryptoDesc}>{property.description}</Text>
      <View style={styles.cryptoAlgoRow}>
        <Feather name="code" size={12} color={property.color} />
        <Text style={[styles.cryptoAlgo, { color: property.color }]}>{property.algorithm}</Text>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

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
  },

  // Score badge
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    backgroundColor: 'rgba(8,5,20,0.5)',
    marginBottom: dashboardSpacing.lg,
    ...webOnly({
      backdropFilter: 'blur(12px)',
      boxShadow:
        '0 0 16px rgba(139,92,246,0.18), 0 0 32px rgba(34,211,238,0.10), inset 0 0 22px rgba(139,92,246,0.06)',
    }),
  },
  scoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 2,
  },
  scoreExcellent: {
    borderColor: '#34D399',
    backgroundColor: 'rgba(52,211,153,0.1)',
    ...webOnly({ boxShadow: '0 0 20px rgba(52,211,153,0.3)' }),
  },
  scoreGood: {
    borderColor: '#FBBF24',
    backgroundColor: 'rgba(251,191,36,0.1)',
    ...webOnly({ boxShadow: '0 0 20px rgba(251,191,36,0.3)' }),
  },
  scoreWarn: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.1)',
    ...webOnly({ boxShadow: '0 0 20px rgba(239,68,68,0.3)' }),
  },
  scoreNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: dashboardColors.textPrimary,
  },
  scoreSlash: {
    fontSize: 14,
    fontWeight: '500',
    color: dashboardColors.textSecondary,
    marginLeft: 1,
  },
  scoreLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  scoreHint: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    marginTop: 2,
  },

  // Section
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 12,
  },

  // Layer stack
  layersStack: {
    gap: 8,
  },
  layerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
    ...webOnly({ transition: 'all 0.22s ease' }),
  },
  layerHalo: {
    ...webOnly({
      boxShadow:
        '0 4px 24px rgba(0,0,0,0.4), 0 0 20px rgba(139,92,246,0.25), 0 0 40px rgba(34,211,238,0.12), inset 0 1px 0 rgba(245,243,255,0.08)',
    }),
  } as any,
  layerNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(139,92,246,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: dashboardColors.textSecondary,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    ...webOnly({ boxShadow: '0 0 6px currentColor' }),
  },
  layerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(8,5,20,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  layerContent: {
    flex: 1,
  },
  layerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  layerName: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    flex: 1,
  },
  layerDesc: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    lineHeight: 18,
  },
  layerDetails: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    fontFamily: 'monospace',
  },

  // Status badges
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusActive: {
    borderColor: 'rgba(52,211,153,0.3)',
    backgroundColor: 'rgba(52,211,153,0.08)',
  },
  statusInactive: {
    borderColor: 'rgba(239,68,68,0.3)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // Crypto properties grid
  cryptoGrid: {
    gap: 12,
  },
  cryptoCard: {
    padding: 16,
  },
  cryptoHalo: {
    ...webOnly({
      boxShadow:
        '0 4px 24px rgba(0,0,0,0.4), 0 0 22px rgba(139,92,246,0.28), 0 0 44px rgba(34,211,238,0.14), inset 0 1px 0 rgba(245,243,255,0.08)',
    }),
  } as any,
  cryptoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  cryptoIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(8,5,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cryptoHeaderText: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cryptoName: {
    fontSize: 16,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    flex: 1,
  },
  cryptoDesc: {
    fontSize: 13,
    lineHeight: 20,
    color: dashboardColors.textSecondary,
    marginBottom: 8,
  },
  cryptoAlgoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.15)',
  },
  cryptoAlgo: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'monospace',
  },
});
