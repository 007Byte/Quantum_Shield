/**
 * Help & Support Screen (HELP-01)
 *
 * Comprehensive help center with Getting Started guides, Security Resources,
 * expandable FAQs, Contact Support, and About information.
 * Uses glassmorphic design consistent with the Dashboard 2 theme.
 */

import { StyleSheet, Text, View, Pressable } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import {
  dashboardSpacing,
  dashboardColors,
  glassPanelBase,
  webOnlyGlass,
  webOnlyGlowTier3,
} from '@/components/dashboard2/styles';

// ── FAQ Item Type ──────────────────────────────────────────────

interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

// ── FAQ Data ───────────────────────────────────────────────────

const faqItems: FAQItem[] = [
  {
    id: 'pqc-protection',
    question: 'How does post-quantum cryptography protect my data?',
    answer: 'Post-Quantum Cryptography (PQC) uses ML-KEM-1024 (FIPS 203) for hybrid key encapsulation, providing resistance against both classical and quantum computing attacks. Even if quantum computers break RSA and ECC in the future, your data encrypted with PQC remains secure.',
  },
  {
    id: 'recovery-phrase',
    question: 'What happens if I lose my recovery phrase?',
    answer: 'Your recovery phrase is the only backup to restore access to your vault. If lost, your vault becomes permanently inaccessible. Always store your recovery phrase in a secure location, separate from your device. Write it down on paper and store in a safe place.',
  },
  {
    id: 'master-password',
    question: 'How is my master password stored?',
    answer: 'Your master password never leaves your device and is never sent to our servers. It\'s processed through Argon2id KDF (key derivation function) and verified using SRP-6a zero-knowledge proof. This means the server validates your password without ever knowing it.',
  },
  {
    id: 'multiple-devices',
    question: 'Can I use USBVault on multiple devices?',
    answer: 'Yes, you can install USBVault on multiple devices. Your vault data is synchronized across devices when you use the same credentials. Make sure to keep your recovery phrase safe as it\'s needed for account recovery on new devices.',
  },
  {
    id: 'encryption-algorithms',
    question: 'What encryption algorithms does USBVault support?',
    answer: 'USBVault uses AES-256-GCM-SIV for file encryption with 64KB streaming chunks. For authenticated encryption with associated data (AEAD), we support both AES-256-GCM-SIV and XChaCha20-Poly1305. All algorithms use NIST-approved or IETF-standardized implementations.',
  },
  {
    id: 'security-audit',
    question: 'Is USBVault security audited?',
    answer: 'USBVault has undergone comprehensive third-party security audits. Our implementation follows defense-in-depth principles with 10 layers of security including SRP-6a auth, FIDO2, AEAD encryption, certificate pinning, device integrity checks, and post-quantum cryptography.',
  },
];

// ── Getting Started Cards ──────────────────────────────────────

const gettingStartedItems = [
  { id: 'encrypt', icon: 'lock', label: 'How to Encrypt Files', description: 'Step-by-step guide to encrypt and secure your files' },
  { id: 'manage', icon: 'folder', label: 'Managing Your Vault', description: 'Learn how to organize and manage encrypted vaults' },
  { id: 'share', icon: 'share-2', label: 'Secure Sharing', description: 'Share encrypted files securely with others' },
  { id: 'passwords', icon: 'key', label: 'Password Manager', description: 'Use built-in password manager for secure credentials' },
  { id: 'pqc', icon: 'cpu', label: 'Understanding PQC', description: 'Learn about post-quantum cryptography protection' },
];

// ── Security Resources ──────────────────────────────────────────

const securityResources = [
  { id: 'whitepaper', icon: 'file-text', label: 'Security Whitepaper', description: 'Complete technical security documentation' },
  { id: 'defense', icon: 'layers', label: 'Defense-in-Depth Guide', description: 'Detailed explanation of all 10 security layers' },
  { id: 'recovery', icon: 'shield', label: 'Recovery Phrase Guide', description: 'How to safely backup and store recovery phrase' },
];

// ── Main Component ─────────────────────────────────────────────

export default function HelpScreen() {
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  return (
    <ShellLayout>
            <View style={styles.contentWrapper}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Help & Support</Text>
                <Text style={styles.subtitle}>
                  Find answers, guides, and resources to get the most from USBVault
                </Text>
              </View>

              {/* Getting Started Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Getting Started</Text>
                <View style={styles.cardsGrid}>
                  {gettingStartedItems.map((item) => (
                    <Pressable
                      key={item.id}
                      style={(state: any) => [styles.card, glassPanelBase, webOnlyGlass, state.hovered && styles.cardHovered]}
                    >
                      <View style={styles.cardIcon}>
                        <Feather name={item.icon as any} size={24} color={dashboardColors.cyan} />
                      </View>
                      <Text style={styles.cardLabel}>{item.label}</Text>
                      <Text style={styles.cardDesc}>{item.description}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Security Resources Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Security Resources</Text>
                <View style={styles.resourcesList}>
                  {securityResources.map((item) => (
                    <Pressable
                      key={item.id}
                      style={(state: any) => [styles.resourceRow, glassPanelBase, webOnlyGlass, state.hovered && styles.resourceRowHovered]}
                    >
                      <View style={styles.resourceIcon}>
                        <Feather name={item.icon as any} size={20} color={dashboardColors.glowPurple} />
                      </View>
                      <View style={styles.resourceContent}>
                        <Text style={styles.resourceLabel}>{item.label}</Text>
                        <Text style={styles.resourceDesc}>{item.description}</Text>
                      </View>
                      <Feather name="arrow-right" size={18} color={dashboardColors.textSecondary} />
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* FAQ Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
                <View style={styles.faqList}>
                  {faqItems.map((item) => {
                    const isExpanded = expandedFaq === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => toggleFaq(item.id)}
                        style={(state: any) => [styles.faqItem, glassPanelBase, webOnlyGlass, state.hovered && styles.faqItemHovered]}
                      >
                        <View style={styles.faqHeader}>
                          <Text style={styles.faqQuestion}>{item.question}</Text>
                          <Feather
                            name={isExpanded ? 'chevron-up' : 'chevron-down'}
                            size={20}
                            color={dashboardColors.cyan}
                          />
                        </View>
                        {isExpanded && (
                          <Text style={styles.faqAnswer}>{item.answer}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Contact Support Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Contact Support</Text>
                <View style={[styles.contactCard, glassPanelBase, webOnlyGlass, webOnlyGlowTier3]}>
                  <View style={styles.contactHeader}>
                    <Feather name="mail" size={24} color={dashboardColors.green} />
                    <View style={styles.contactInfo}>
                      <Text style={styles.contactLabel}>Email Support</Text>
                      <Text style={styles.contactEmail}>ultimatepqcshield@gmail.com</Text>
                    </View>
                  </View>

                  <View style={styles.contactRow}>
                    <Pressable style={(state: any) => [styles.contactBtn, state.hovered && styles.contactBtnHover]}>
                      <Feather name="mail" size={16} color="#FFFFFF" />
                      <Text style={styles.contactBtnText}>Send Email</Text>
                    </Pressable>
                    <Pressable style={(state: any) => [styles.contactBtn, state.hovered && styles.contactBtnHover]}>
                      <Feather name="link" size={16} color="#FFFFFF" />
                      <Text style={styles.contactBtnText}>Submit Ticket</Text>
                    </Pressable>
                  </View>

                  <View style={styles.statusRow}>
                    <View style={styles.statusIndicator}>
                      <View style={styles.statusDot} />
                      <Text style={styles.statusText}>System Status: All Systems Operational</Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* About Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>About USBVault</Text>
                <View style={[styles.aboutCard, glassPanelBase, webOnlyGlass]}>
                  <View style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>Version</Text>
                    <Text style={styles.aboutValue}>0.1.0</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>Build</Text>
                    <Text style={styles.aboutValue}>2026.03.09</Text>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.aboutRow}>
                    <Text style={styles.aboutLabel}>Platform</Text>
                    <Text style={styles.aboutValue}>Quantum Shield (V3.0)</Text>
                  </View>
                </View>
              </View>
            </View>
    </ShellLayout>
  );
}

// ── Styles ──────────────────────────────────────────────────────

// PL-010: Shell styles (screen, pageScroll, pageContent, shell, shellEdgeGlow, mainCol)
// are now provided by <ShellLayout /> — see components/dashboard2/ShellLayout.tsx

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

  // Cards Grid (Getting Started)
  cardsGrid: {
    gap: 12,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ cursor: 'pointer', transition: 'all 0.2s ease' }),
  },
  cardHovered: {
    borderColor: dashboardColors.cyan,
    backgroundColor: 'rgba(34,211,238,0.08)',
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(34,211,238,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  cardDesc: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Security Resources List
  resourcesList: {
    gap: 8,
  },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    gap: 12,
  },
  resourceRowHovered: {
    borderColor: dashboardColors.glowPurple,
    backgroundColor: 'rgba(168,85,247,0.08)',
  },
  resourceIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(168,85,247,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceContent: {
    flex: 1,
  },
  resourceLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 2,
  },
  resourceDesc: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },

  // FAQ Section
  faqList: {
    gap: 8,
  },
  faqItem: {
    padding: 14,
    borderRadius: 14,
  },
  faqItemHovered: {
    borderColor: dashboardColors.cyan,
    backgroundColor: 'rgba(34,211,238,0.08)',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  faqAnswer: {
    marginTop: 12,
    fontSize: 13,
    color: dashboardColors.textSecondary,
    lineHeight: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.15)',
  },

  // Contact Section
  contactCard: {
    padding: 16,
    borderRadius: 16,
    gap: 16,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactInfo: {
    flex: 1,
  },
  contactLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  contactEmail: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    gap: 10,
  },
  contactBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(34,211,238,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.4)',
  },
  contactBtnHover: {
    backgroundColor: 'rgba(34,211,238,0.3)',
    borderColor: dashboardColors.cyan,
  },
  contactBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  statusRow: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.15)',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
    ...webOnly({ boxShadow: '0 0 8px rgba(52,211,153,0.6)' }),
  },
  statusText: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },

  // About Section
  aboutCard: {
    padding: 14,
    borderRadius: 14,
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  aboutLabel: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
  },
  aboutValue: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(139,92,246,0.15)',
  },
});
