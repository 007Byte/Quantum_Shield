/**
 * HelpSection — In-app support infrastructure
 *
 * INFRA-01: FAQ/knowledge base, support ticket submission, status page link.
 * Enterprise tier shows live chat hook availability.
 */

import { useState } from 'react';
import { useRouter } from 'expo-router';
import { View, Text, Pressable, Linking, TextInput, StyleSheet, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { dashboardColors, dashboardLayout, dashboardSpacing } from '@/components/dashboard2/styles';
import { webOnly } from '@/utils/webStyle';
import { styles } from './styles';
import { supportService, TicketCategory, TicketPriority } from '@/services/supportService';
import { useAuthStore } from '@/stores/authStore';
import { useLanguage } from '@/hooks/useLanguage';

const CATEGORIES: { value: TicketCategory; labelKey: string }[] = [
  { value: 'bug', labelKey: 'help.categoryBug' },
  { value: 'feature', labelKey: 'help.categoryFeature' },
  { value: 'security', labelKey: 'help.categorySecurity' },
  { value: 'account', labelKey: 'help.categoryAccount' },
  { value: 'billing', labelKey: 'help.categoryBilling' },
  { value: 'general', labelKey: 'help.categoryGeneral' },
];

const PRIORITIES: { value: TicketPriority; labelKey: string; color: string }[] = [
  { value: 'low', labelKey: 'help.priorityLow', color: dashboardColors.textSecondary },
  { value: 'medium', labelKey: 'help.priorityMedium', color: '#FBBF24' },
  { value: 'high', labelKey: 'help.priorityHigh', color: '#F97316' },
  { value: 'critical', labelKey: 'help.priorityCritical', color: '#EF4444' },
];

export function HelpSection() {
  const router = useRouter();
  const { t } = useLanguage();
  const [showFAQ, setShowFAQ] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [faqSearch, setFaqSearch] = useState('');
  const [faqCategory, setFaqCategory] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  // Ticket form state
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketCategory, setTicketCategory] = useState<TicketCategory>('general');
  const [ticketPriority, setTicketPriority] = useState<TicketPriority>('medium');
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [ticketError, setTicketError] = useState('');

  const email = useAuthStore(s => s.email);
  const config = supportService.getConfig();

  // FAQ data
  const faqItems = supportService.getFAQ({
    category: faqCategory || undefined,
    search: faqSearch || undefined,
  });
  const faqCategories = supportService.getFAQCategories();

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
      // Reset form after delay
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

  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Feather name="help-circle" size={18} color={dashboardColors.cyan} />
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {t('help.title')}
        </Text>
      </View>

      {/* FAQ / Knowledge Base */}
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [styles.helpRow, state.hovered && styles.helpRowHover]}
        onPress={() => router.navigate('/(tabs)/help' as any)}
      >
        <View style={hs.helpRowInner}>
          <Feather name="book-open" size={16} color={dashboardColors.cyan} />
          <Text style={styles.helpText}>{t('help.faqKnowledgeBase')}</Text>
        </View>
        <Feather name="chevron-right" size={16} color={dashboardColors.textSecondary} />
      </Pressable>

      {/* Submit Ticket */}
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [styles.helpRow, state.hovered && styles.helpRowHover]}
        onPress={() => setShowTicketForm(true)}
      >
        <View style={hs.helpRowInner}>
          <Feather name="message-square" size={16} color={dashboardColors.cyan} />
          <Text style={styles.helpText}>{t('help.submitTicket')}</Text>
        </View>
        <Feather name="chevron-right" size={16} color={dashboardColors.textSecondary} />
      </Pressable>

      {/* Status Page */}
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [styles.helpRow, state.hovered && styles.helpRowHover]}
        onPress={() => handleOpenUrl(config.statusPageUrl)}
      >
        <View style={hs.helpRowInner}>
          <Feather name="activity" size={16} color="#34D399" />
          <Text style={styles.helpText}>{t('help.systemStatus')}</Text>
        </View>
        <Feather name="external-link" size={14} color={dashboardColors.textSecondary} />
      </Pressable>

      {/* Documentation */}
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [styles.helpRow, state.hovered && styles.helpRowHover]}
        onPress={() => handleOpenUrl('https://docs.usbvault.io')}
      >
        <View style={hs.helpRowInner}>
          <Feather name="file-text" size={16} color={dashboardColors.cyan} />
          <Text style={styles.helpText}>{t('help.documentation')}</Text>
        </View>
        <Feather name="external-link" size={14} color={dashboardColors.textSecondary} />
      </Pressable>

      {/* Contact */}
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [styles.helpRow, state.hovered && styles.helpRowHover]}
        onPress={() => handleOpenUrl(`mailto:${config.supportEmail}`)}
      >
        <View style={hs.helpRowInner}>
          <Feather name="mail" size={16} color={dashboardColors.cyan} />
          <Text style={styles.helpText}>{t('help.emailSupport')}</Text>
        </View>
        <Text style={hs.emailHint}>{config.supportEmail}</Text>
      </Pressable>

      {/* Security disclosure */}
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [styles.helpRow, state.hovered && styles.helpRowHover]}
        onPress={() => handleOpenUrl('mailto:security@usbvault.io')}
      >
        <View style={hs.helpRowInner}>
          <Feather name="alert-triangle" size={16} color="#FBBF24" />
          <Text style={styles.helpText}>{t('help.reportVulnerability')}</Text>
        </View>
        <Feather name="external-link" size={14} color={dashboardColors.textSecondary} />
      </Pressable>

      {/* Enterprise live chat indicator */}
      {supportService.isLiveChatAvailable() && (
        <Pressable
          style={(state: any) => [styles.helpRow, state.hovered && styles.helpRowHover]}
          accessibilityRole="button"
        >
          <View style={hs.helpRowInner}>
            <Feather name="headphones" size={16} color="#A855F7" />
            <Text style={styles.helpText}>{t('help.liveChat')}</Text>
          </View>
          <View style={hs.liveBadge}>
            <Text style={hs.liveBadgeText}>{t('help.liveBadge')}</Text>
          </View>
        </Pressable>
      )}

      {/* Legal */}
      <Pressable
        accessibilityRole="button"
        style={(state: any) => [styles.helpRow, state.hovered && styles.helpRowHover]}
        onPress={() => handleOpenUrl('https://usbvault.io/privacy')}
      >
        <Text style={styles.helpText}>{t('help.privacyPolicy')}</Text>
        <Feather name="external-link" size={14} color={dashboardColors.textSecondary} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        style={(state: any) => [styles.helpRow, state.hovered && styles.helpRowHover]}
        onPress={() => handleOpenUrl('https://usbvault.io/terms')}
      >
        <Text style={styles.helpText}>{t('help.termsOfService')}</Text>
        <Feather name="external-link" size={14} color={dashboardColors.textSecondary} />
      </Pressable>

      {/* ── FAQ Modal ─────────────────────────── */}
      <Modal visible={showFAQ} transparent animationType="fade">
        <View style={hs.modalOverlay}>
          <View style={hs.modalContent}>
            <View style={hs.modalHeader}>
              <Text style={hs.modalTitle}>{t('help.faqKnowledgeBase')}</Text>
              <Pressable onPress={() => setShowFAQ(false)} accessibilityRole="button">
                <Feather name="x" size={24} color={dashboardColors.textSecondary} />
              </Pressable>
            </View>

            {/* Search */}
            <View style={hs.searchRow}>
              <Feather name="search" size={16} color={dashboardColors.textSecondary} />
              <TextInput
                accessibilityLabel={t('help.searchFaqAccessibility')}
                style={hs.searchInput}
                placeholder={t('help.searchFaq')}
                placeholderTextColor={dashboardColors.textSecondary}
                value={faqSearch}
                onChangeText={setFaqSearch}
              />
            </View>

            {/* Category filters */}
            <View style={hs.categoryRow}>
              <Pressable
                accessibilityRole="button"
                style={[hs.categoryChip, !faqCategory && hs.categoryChipActive]}
                onPress={() => setFaqCategory(null)}
              >
                <Text style={[hs.categoryChipText, !faqCategory && hs.categoryChipTextActive]}>
                  {t('help.all')}
                </Text>
              </Pressable>
              {faqCategories.map(cat => (
                <Pressable
                  accessibilityRole="button"
                  key={cat}
                  style={[hs.categoryChip, faqCategory === cat && hs.categoryChipActive]}
                  onPress={() => setFaqCategory(faqCategory === cat ? null : cat)}
                >
                  <Text
                    style={[hs.categoryChipText, faqCategory === cat && hs.categoryChipTextActive]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* FAQ items */}
            <View style={hs.faqList}>
              {faqItems.map(item => (
                <Pressable
                  accessibilityRole="button"
                  key={item.id}
                  style={hs.faqItem}
                  onPress={() => setExpandedFaq(expandedFaq === item.id ? null : item.id)}
                >
                  <View style={hs.faqQuestion}>
                    <Text style={hs.faqQuestionText}>{item.question}</Text>
                    <Feather
                      name={expandedFaq === item.id ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={dashboardColors.textSecondary}
                    />
                  </View>
                  {expandedFaq === item.id && <Text style={hs.faqAnswer}>{item.answer}</Text>}
                </Pressable>
              ))}
              {faqItems.length === 0 && <Text style={hs.noResults}>{t('help.noResults')}</Text>}
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Ticket Form Modal ─────────────────── */}
      <Modal visible={showTicketForm} transparent animationType="fade">
        <View style={hs.modalOverlay}>
          <View style={hs.modalContent}>
            <View style={hs.modalHeader}>
              <Text style={hs.modalTitle}>{t('help.submitTicket')}</Text>
              <Pressable
                onPress={() => {
                  setShowTicketForm(false);
                  setTicketSubmitted(false);
                  setTicketError('');
                }}
                accessibilityRole="button"
              >
                <Feather name="x" size={24} color={dashboardColors.textSecondary} />
              </Pressable>
            </View>

            {ticketSubmitted ? (
              <View style={hs.ticketSuccess}>
                <Feather name="check-circle" size={48} color="#34D399" />
                <Text style={hs.ticketSuccessTitle}>{t('help.ticketSubmitted')}</Text>
                <Text style={hs.ticketSuccessText}>
                  {t('help.ticketSubmittedMessage', { email: email || 'your email' })}
                </Text>
              </View>
            ) : (
              <View style={hs.ticketForm}>
                {ticketError !== '' && (
                  <View style={hs.errorBanner}>
                    <Feather name="alert-circle" size={14} color="#EF4444" />
                    <Text style={hs.errorText}>{ticketError}</Text>
                  </View>
                )}

                <Text style={hs.formLabel}>{t('help.subject')}</Text>
                <TextInput
                  accessibilityLabel={t('help.subjectAccessibility')}
                  style={hs.formInput}
                  placeholder={t('help.subjectPlaceholder')}
                  placeholderTextColor={dashboardColors.textSecondary}
                  value={ticketSubject}
                  onChangeText={setTicketSubject}
                />

                <Text style={hs.formLabel}>{t('help.category')}</Text>
                <View style={hs.categoryRow}>
                  {CATEGORIES.map(cat => (
                    <Pressable
                      accessibilityRole="button"
                      key={cat.value}
                      style={[
                        hs.categoryChip,
                        ticketCategory === cat.value && hs.categoryChipActive,
                      ]}
                      onPress={() => setTicketCategory(cat.value)}
                    >
                      <Text
                        style={[
                          hs.categoryChipText,
                          ticketCategory === cat.value && hs.categoryChipTextActive,
                        ]}
                      >
                        {t(cat.labelKey)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={hs.formLabel}>{t('help.priority')}</Text>
                <View style={hs.categoryRow}>
                  {PRIORITIES.map(p => (
                    <Pressable
                      accessibilityRole="button"
                      key={p.value}
                      style={[
                        hs.categoryChip,
                        ticketPriority === p.value && {
                          borderColor: p.color,
                          backgroundColor: `${p.color}15`,
                        },
                      ]}
                      onPress={() => setTicketPriority(p.value)}
                    >
                      <Text
                        style={[
                          hs.categoryChipText,
                          ticketPriority === p.value && { color: p.color },
                        ]}
                      >
                        {t(p.labelKey)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={hs.formLabel}>{t('help.description')}</Text>
                <TextInput
                  accessibilityLabel={t('help.descriptionPlaceholder')}
                  style={[hs.formInput, { height: 120, textAlignVertical: 'top' }]}
                  placeholder={t('help.descriptionPlaceholder')}
                  placeholderTextColor={dashboardColors.textSecondary}
                  value={ticketDescription}
                  onChangeText={setTicketDescription}
                  multiline
                />

                <Pressable
                  style={(state: any) => [hs.submitBtn, state.hovered && hs.submitBtnHover]}
                  onPress={handleSubmitTicket}
                  accessibilityRole="button"
                >
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={hs.submitBtnText}>{t('help.submitTicketBtn')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Local Styles ────────────────────────────────────────

const hs = StyleSheet.create({
  helpRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  emailHint: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
  },
  liveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(168,85,247,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.4)',
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A855F7',
    letterSpacing: 0.5,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: dashboardSpacing.md,
  },
  modalContent: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '80%',
    borderRadius: dashboardLayout.radiusXl,
    backgroundColor: 'rgba(18,12,40,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    overflow: 'hidden',
    ...webOnly({ backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: dashboardSpacing.lg,
    paddingVertical: dashboardSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.2)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
  },

  // Search
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: dashboardSpacing.lg,
    marginTop: dashboardSpacing.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    backgroundColor: 'rgba(8,5,20,0.5)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: dashboardColors.textPrimary,
    ...webOnly({ outline: 'none' }),
  },

  // Categories
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: dashboardSpacing.lg,
    marginTop: 8,
    marginBottom: 4,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    backgroundColor: 'rgba(8,5,20,0.3)',
    ...webOnly({ cursor: 'pointer' }),
  },
  categoryChipActive: {
    borderColor: 'rgba(34,211,238,0.4)',
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: dashboardColors.textSecondary,
  },
  categoryChipTextActive: {
    color: '#22D3EE',
  },

  // FAQ
  faqList: {
    padding: dashboardSpacing.lg,
    gap: 8,
  },
  faqItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.15)',
    backgroundColor: 'rgba(8,5,20,0.4)',
    overflow: 'hidden',
    ...webOnly({ cursor: 'pointer' }),
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: dashboardColors.textPrimary,
    marginRight: 8,
  },
  faqAnswer: {
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  noResults: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },

  // Ticket form
  ticketForm: {
    padding: dashboardSpacing.lg,
    gap: 8,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: dashboardColors.textSecondary,
    marginTop: 4,
  },
  formInput: {
    fontSize: 14,
    color: dashboardColors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
    backgroundColor: 'rgba(8,5,20,0.5)',
    ...webOnly({ outline: 'none' }),
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
    ...webOnly({
      background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
      boxShadow: '0 0 20px rgba(168,85,247,0.4)',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }),
  },
  submitBtnHover: {
    ...webOnly({
      transform: 'translateY(-1px)',
      boxShadow: '0 0 30px rgba(168,85,247,0.6)',
    }),
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Success state
  ticketSuccess: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 40,
  },
  ticketSuccessTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#34D399',
  },
  ticketSuccessText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    maxWidth: 320,
  },
});
