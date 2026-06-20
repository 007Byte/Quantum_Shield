/**
 * Help & Support Screen (HELP-01)
 *
 * Comprehensive help center with Getting Started guides, Security Resources,
 * expandable FAQs, Contact Support with ticket form, and About information.
 * Uses glassmorphic design consistent with the Dashboard 2 theme.
 */

import { Text, View, Pressable, Linking } from 'react-native';
import { useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { webOnly } from '@/utils/webStyle';
import { ShellLayout } from '@/components/dashboard2/ShellLayout';
import { dashboardColors } from '@/components/dashboard2/styles';
import { useTheme, resolveLayerStyle } from '@/theme/engine';
import { useLanguage } from '@/hooks/useLanguage';
import { supportService, TicketCategory, TicketPriority } from '@/services/supportService';
import { useAuthStore } from '@/stores/authStore';
import {
  faqItemKeys,
  gettingStartedItems,
  securityResourceItems,
  styles,
  TicketFormModal,
} from '@/components/help';

// ── Main Component ─────────────────────────────────────────────

export default function HelpScreen() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  // Ticket form state
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketCategory, setTicketCategory] = useState<TicketCategory>('general');
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>('medium');
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [ticketError, setTicketError] = useState('');

  const email = useAuthStore(s => s.email);
  const config = supportService.getConfig();

  const toggleFaq = (id: string) => {
    setExpandedFaq(expandedFaq === id ? null : id);
  };

  const toggleGuide = (id: string) => {
    setExpandedGuide(expandedGuide === id ? null : id);
  };

  const handleOpenUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const handleSubmitTicket = () => {
    setTicketError('');

    if (!ticketSubject.trim()) {
      setTicketError(t('help.subjectRequired'));
      return;
    }
    if (!ticketDescription.trim()) {
      setTicketError(t('help.descriptionRequired'));
      return;
    }

    try {
      supportService.createTicket({
        subject: ticketSubject,
        description: ticketDescription,
        category: ticketCategory,
        priority: ticketPriority,
        userEmail: email || 'unknown',
      });

      setTicketSubmitted(true);
      setTimeout(() => {
        setShowTicketForm(false);
        setTicketSubmitted(false);
        setTicketSubject('');
        setTicketDescription('');
        setTicketCategory('general');
        setTicketPriority('medium');
      }, 2500);
    } catch (err) {
      setTicketError(err instanceof Error ? err.message : t('help.submitFailed'));
    }
  };

  const handleCloseTicketForm = () => {
    setShowTicketForm(false);
    setTicketSubmitted(false);
    setTicketError('');
  };

  return (
    <ShellLayout>
      <View style={styles.contentWrapper}>
        {/* Header */}
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.title}>
            {t('help.title')}
          </Text>
          <Text style={styles.subtitle}>{t('help.subtitle')}</Text>
        </View>

        {/* Getting Started Section — expandable guides */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t('help.gettingStarted')}
          </Text>
          <View style={styles.cardsGrid}>
            {gettingStartedItems.map(item => {
              const isExpanded = expandedGuide === item.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => toggleGuide(item.id)}
                  style={(state: any) => [
                    styles.card,
                    resolveLayerStyle(theme.L2.base),
                    { borderLeftWidth: 3, borderLeftColor: item.color },
                    state.hovered && styles.cardHovered,
                    isExpanded && styles.cardExpanded,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <View style={[styles.cardIcon, { backgroundColor: `${item.color}22` }]}>
                      <Feather name={item.icon as any} size={22} color={item.color} />
                    </View>
                    <View style={styles.cardTextCol}>
                      <Text style={styles.cardLabel}>{t(item.labelKey)}</Text>
                      <Text style={styles.cardDesc}>{t(item.descKey)}</Text>
                    </View>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={dashboardColors.textSecondary}
                    />
                  </View>

                  {isExpanded && (
                    <View style={styles.stepsContainer}>
                      {item.steps.map((step, idx) => (
                        <View key={idx} style={styles.stepRow}>
                          <View style={[styles.stepNumber, { backgroundColor: `${item.color}22` }]}>
                            <Text style={[styles.stepNumberText, { color: item.color }]}>
                              {idx + 1}
                            </Text>
                          </View>
                          <View style={styles.stepContent}>
                            <Text style={styles.stepTitle}>{t(step.stepKey)}</Text>
                            <Text style={styles.stepDetail}>{t(step.detailKey)}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Security Resources Section — opens URLs */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t('help.securityResources')}
          </Text>
          <View style={styles.resourcesList}>
            {securityResourceItems.map(item => (
              <Pressable
                accessibilityRole="button"
                key={item.id}
                onPress={() => handleOpenUrl(item.url)}
                style={(state: any) => [
                  styles.resourceRow,
                  resolveLayerStyle(theme.L2.base),
                  state.hovered && styles.resourceRowHovered,
                ]}
              >
                <View style={styles.resourceIcon}>
                  <Feather name={item.icon as any} size={20} color={dashboardColors.glowPurple} />
                </View>
                <View style={styles.resourceContent}>
                  <Text style={styles.resourceLabel}>{t(item.labelKey)}</Text>
                  <Text style={styles.resourceDesc}>{t(item.descKey)}</Text>
                </View>
                <Feather name="external-link" size={16} color={dashboardColors.textSecondary} />
              </Pressable>
            ))}
          </View>
        </View>

        {/* FAQ Section */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t('help.faqKnowledgeBase')}
          </Text>
          <View style={styles.faqList}>
            {faqItemKeys.map(item => {
              const isExpanded = expandedFaq === item.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  onPress={() => toggleFaq(item.id)}
                  style={(state: any) => [
                    styles.faqItem,
                    resolveLayerStyle(theme.L2.base),
                    state.hovered && styles.faqItemHovered,
                  ]}
                >
                  <View style={styles.faqHeader}>
                    <Text style={styles.faqQuestion}>{t(item.questionKey)}</Text>
                    <Feather
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color={dashboardColors.cyan}
                    />
                  </View>
                  {isExpanded && <Text style={styles.faqAnswer}>{t(item.answerKey)}</Text>}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Contact Support Section — functional buttons */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t('help.submitTicket')}
          </Text>
          <View style={[styles.contactCard, resolveLayerStyle(theme.L2.base)]}>
            <View style={styles.contactHeader}>
              <Feather name="mail" size={24} color={dashboardColors.green} />
              <View style={styles.contactInfo}>
                <Text style={styles.contactLabel}>{t('help.emailSupport')}</Text>
                <Text style={styles.contactEmail}>{config.supportEmail}</Text>
              </View>
            </View>

            <View style={styles.contactRow}>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleOpenUrl(`mailto:${config.supportEmail}`)}
                style={(state: any) => [styles.contactBtn, state.hovered && styles.contactBtnHover]}
              >
                <Feather name="mail" size={16} color="#FFFFFF" />
                <Text style={styles.contactBtnText}>{t('help.emailSupport')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowTicketForm(true)}
                style={(state: any) => [
                  styles.contactBtn,
                  styles.contactBtnTicket,
                  state.hovered && styles.contactBtnTicketHover,
                ]}
              >
                <Feather name="send" size={16} color="#FFFFFF" />
                <Text style={styles.contactBtnText}>{t('help.submitTicket')}</Text>
              </Pressable>
            </View>

            <View style={styles.statusRow}>
              <View style={styles.statusIndicator}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: theme.semantic.success,
                      ...webOnly({ boxShadow: `0 0 8px ${theme.semantic.success}99` }),
                    },
                  ]}
                />
                <Text style={styles.statusText}>
                  {t('help.systemStatus')}: {t('help.allOperational')}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {t('help.aboutTitle')}
          </Text>
          <View style={[styles.aboutCard, resolveLayerStyle(theme.L2.base)]}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>{t('help.versionLabel')}</Text>
              <Text style={styles.aboutValue}>0.1.0</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>{t('help.buildLabel')}</Text>
              <Text style={styles.aboutValue}>2026.03.09</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>{t('help.platformLabel')}</Text>
              <Text style={styles.aboutValue}>Quantum Shield (V3.0)</Text>
            </View>
          </View>
        </View>
      </View>

      {/* ── Ticket Form Modal ─────────────────── */}
      <TicketFormModal
        visible={showTicketForm}
        onClose={handleCloseTicketForm}
        onSubmit={handleSubmitTicket}
        submitted={ticketSubmitted}
        error={ticketError}
        subject={ticketSubject}
        onSubjectChange={setTicketSubject}
        description={ticketDescription}
        onDescriptionChange={setTicketDescription}
        category={ticketCategory}
        onCategoryChange={setTicketCategory}
        priority={ticketPriority}
        onPriorityChange={setTicketPriority}
      />
    </ShellLayout>
  );
}
