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
  const [settings, setSettings] = useState(settingsService.load());

  useEffect(() => {
    setSettings(settingsService.load());
  }, []);

  const fido2Count = fido2Service.getDeviceCount();

  // ── 10 Security Layers ────────────────────────────

  const layers: SecurityLayer[] = useMemo(() => [
    {
      id: 'srp',
      name: 'SRP-6a Zero-Knowledge Auth',
      description: 'Password never leaves device. Server verifies without knowing password.',
      icon: 'key',
      activeColor: '#34D399',
      isActive: true,
      details: 'SRP-6a with 3072-bit group, Argon2id KDF',
    },
    {
      id: 'fido2',
      name: 'FIDO2 / Biometric MFA',
      description: 'Hardware key or biometric second factor authentication.',
      icon: 'fingerprint' as any,
      activeColor: '#22D3EE',
      isActive: fido2Count > 0 || settings.biometricLockEnabled,
      details: fido2Count > 0
        ? `${fido2Count} hardware key${fido2Count > 1 ? 's' : ''} registered`
        : settings.biometricLockEnabled ? 'Biometric lock enabled' : 'No MFA configured',
    },
    {
      id: 'aead',
      name: 'AEAD File Encryption',
      description: 'Authenticated encryption with associated data for all vault contents.',
      icon: 'lock',
      activeColor: '#A855F7',
      isActive: true,
      details: 'AES-256-GCM-SIV / XChaCha20-Poly1305, 64KB streaming chunks',
    },
    {
      id: 'pinning',
      name: 'Certificate Pinning',
      description: 'HTTPS connections validated against known server certificate pins.',
      icon: 'shield',
      activeColor: '#60A5FA',
      isActive: true,
      details: 'SHA-256 SPKI pins, fail-closed, environment-injected',
    },
    {
      id: 'integrity',
      name: 'Device Integrity',
      description: 'Runtime detection of jailbreak, root, debugger, and instrumentation.',
      icon: 'smartphone',
      activeColor: '#FBBF24',
      isActive: true,
      details: 'Jailbreak, root, debugger, emulator, Frida, Xposed detection',
    },
    {
      id: 'runtime',
      name: 'Runtime Protection',
      description: 'Screenshot blocking, secure pasteboard, memory cleanup.',
      icon: 'eye-off',
      activeColor: '#F472B6',
      isActive: true,
      details: 'FLAG_SECURE, pasteboard timeout, RAM scrubbing',
    },
    {
      id: 'selfdestruct',
      name: 'Self-Destruct / Brute-Force',
      description: 'Vault wipes after configurable failed login attempts.',
      icon: 'zap',
      activeColor: '#EF4444',
      isActive: settings.selfDestructEnabled,
      details: settings.selfDestructEnabled
        ? `Wipe after ${settings.selfDestructAttempts} failed attempts`
        : 'Self-destruct not enabled',
    },
    {
      id: 'audit',
      name: 'Audit Trail',
      description: 'Cryptographically signed log of all security-relevant actions.',
      icon: 'file-text',
      activeColor: '#818CF8',
      isActive: true,
      details: 'Append-only log, HMAC-SHA256 integrity, tamper detection',
    },
    {
      id: 'ghost',
      name: 'Ghost Mode / Anti-Forensics',
      description: 'RAM scrubbing, clipboard sanitization, trace elimination.',
      icon: 'ghost' as any,
      activeColor: '#6EE7B7',
      isActive: settings.ghostModeEnabled,
      details: settings.ghostModeEnabled
        ? 'Active: cleanup on lock/logout'
        : 'Ghost Mode not enabled',
    },
    {
      id: 'pqc',
      name: 'Post-Quantum Cryptography',
      description: 'ML-KEM-1024 hybrid key encapsulation for quantum resistance.',
      icon: 'cpu',
      activeColor: '#22D3EE',
      isActive: settings.pqcEnabled,
      details: settings.pqcEnabled
        ? 'ML-KEM-1024 (FIPS 203) + ML-DSA-87 (FIPS 204)'
        : 'PQC not enabled',
    },
  ], [settings, fido2Count]);

  const activeCount = layers.filter(l => l.isActive).length;

  // ── Cryptographic Properties (DID-02) ─────────────

  const cryptoProps: CryptoProperty[] = useMemo(() => [
    {
      id: 'ci',
      name: 'Confidentiality & Integrity',
      description: 'Every file in your vault is encrypted with AEAD ciphers that bind ciphertext to an authentication tag — if even one bit is altered, decryption fails. This guarantees that only you (with the correct key) can read your data, and any tampering is immediately detected.',
      algorithm: 'AES-256-GCM-SIV · XChaCha20-Poly1305 · HMAC-SHA256 per-chunk tags',
      isActive: true,
      icon: 'lock',
      color: '#A855F7',
    },
    {
      id: 'availability',
      name: 'Availability',
      description: 'Your vault stays accessible even under adverse conditions. Encrypted backups, BIP39 recovery phrases, and multi-vault architecture ensure you can always recover your data — even if a device is lost, stolen, or wiped by the self-destruct policy.',
      algorithm: 'AES-256-GCM encrypted backups · BIP39 24-word recovery · Multi-vault redundancy',
      isActive: true,
      icon: 'cloud',
      color: '#F59E0B',
    },
    {
      id: 'fs',
      name: 'Forward Secrecy',
      description: 'Each secure share and message session derives a unique ephemeral key pair. Even if your long-term identity key is compromised in the future, all past conversations and file transfers remain encrypted and unreadable.',
      algorithm: 'X25519 ephemeral key exchange · Per-session ECDH · HKDF-SHA256 key derivation',
      isActive: true,
      icon: 'refresh-cw',
      color: '#22D3EE',
    },
    {
      id: 'nr',
      name: 'Non-Repudiation',
      description: 'Every vault operation is digitally signed with your Ed25519 identity key, creating a cryptographic proof of authorship. The post-quantum ML-DSA-87 co-signature future-proofs these proofs against quantum attacks on the audit trail.',
      algorithm: 'Ed25519 identity signatures · ML-DSA-87 (FIPS 204) co-signatures · HMAC-SHA256 audit chain',
      isActive: true,
      icon: 'check-circle',
      color: '#34D399',
    },
  ], []);

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
                <Text style={styles.title}>Defense-in-Depth</Text>
                <Text style={styles.subtitle}>
                  {activeCount} of {layers.length} security layers active
                </Text>
              </View>

              {/* Overall Score Badge */}
              <View style={styles.scoreBadge}>
                <View style={[styles.scoreCircle, activeCount >= 8 ? styles.scoreExcellent : activeCount >= 6 ? styles.scoreGood : styles.scoreWarn]}>
                  <Text style={styles.scoreNumber}>{activeCount}</Text>
                  <Text style={styles.scoreSlash}>/{layers.length}</Text>
                </View>
                <View>
                  <Text style={styles.scoreLabel}>
                    {activeCount >= 9 ? 'Maximum Protection' : activeCount >= 7 ? 'Strong Protection' : activeCount >= 5 ? 'Good Protection' : 'Needs Attention'}
                  </Text>
                  <Text style={styles.scoreHint}>
                    Enable more layers for stronger defense
                  </Text>
                </View>
              </View>

              {/* Security Layers Stack */}
              <Text style={styles.sectionTitle}>Security Layers</Text>
              <View style={styles.layersStack}>
                {layers.map((layer, index) => (
                  <LayerCard key={layer.id} layer={layer} index={index} />
                ))}
              </View>

              {/* Cryptographic Properties Panel (DID-02) */}
              <Text style={[styles.sectionTitle, { marginTop: dashboardSpacing.lg }]}>Cryptographic Properties</Text>
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

  const iconName = (layer.icon === 'fingerprint' || layer.icon === 'ghost')
    ? 'shield' // Feather doesn't have these, use fallback
    : layer.icon;

  return (
    <View style={[styles.layerCard, glassPanelBase, webOnlyGlass]}>
      {/* Layer number */}
      <View style={styles.layerNumber}>
        <Text style={styles.layerNumberText}>{index + 1}</Text>
      </View>

      {/* Status indicator with pulse */}
      <Animated.View style={[
        styles.statusDot,
        {
          backgroundColor: layer.isActive ? layer.activeColor : 'rgba(255,255,255,0.15)',
          opacity: layer.isActive ? pulseAnim : 0.4,
        },
      ]} />

      {/* Icon */}
      <View style={[styles.layerIcon, { borderColor: layer.isActive ? layer.activeColor : 'rgba(255,255,255,0.1)' }]}>
        <Feather name={iconName as any} size={18} color={layer.isActive ? layer.activeColor : 'rgba(255,255,255,0.3)'} />
      </View>

      {/* Content */}
      <View style={styles.layerContent}>
        <View style={styles.layerNameRow}>
          <Text style={[styles.layerName, !layer.isActive && { opacity: 0.5 }]}>{layer.name}</Text>
          <View style={[styles.statusBadge, layer.isActive ? styles.statusActive : styles.statusInactive]}>
            <Text style={[styles.statusText, layer.isActive ? { color: '#34D399' } : { color: '#EF4444' }]}>
              {layer.isActive ? 'ACTIVE' : 'OFF'}
            </Text>
          </View>
        </View>
        <Text style={styles.layerDesc}>{layer.description}</Text>
        <Text style={[styles.layerDetails, { color: layer.isActive ? layer.activeColor : 'rgba(255,255,255,0.3)' }]}>
          {layer.details}
        </Text>
      </View>
    </View>
  );
}

// ── Crypto Property Card ────────────────────────────────────

function CryptoPropertyCard({ property }: { property: CryptoProperty }) {
  return (
    <View style={[styles.cryptoCard, glassPanelBase, webOnlyGlass, webOnlyGlowTier3]}>
      <View style={styles.cryptoHeader}>
        <View style={[styles.cryptoIcon, { borderColor: property.color }]}>
          <Feather name={property.icon as any} size={20} color={property.color} />
        </View>
        <View style={styles.cryptoHeaderText}>
          <Text style={styles.cryptoName}>{property.name}</Text>
          <View style={[styles.statusBadge, property.isActive ? styles.statusActive : styles.statusInactive]}>
            <Text style={[styles.statusText, property.isActive ? { color: '#34D399' } : { color: '#EF4444' }]}>
              {property.isActive ? 'ENGAGED' : 'INACTIVE'}
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
    ...webOnly({ backdropFilter: 'blur(12px)' }),
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
    ...webOnly({ transition: 'all 0.2s ease' }),
  },
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
