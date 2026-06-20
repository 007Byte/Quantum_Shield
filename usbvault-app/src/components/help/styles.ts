/**
 * Help screen styles.
 */

import { StyleSheet } from 'react-native';
import { webOnly } from '@/utils/webStyle';
import { dashboardSpacing, dashboardColors } from '@/components/dashboard2/styles';

export const styles = StyleSheet.create({
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

  // Cards Grid (Getting Started) — now left-aligned with expand
  cardsGrid: {
    gap: 10,
  },
  card: {
    padding: 16,
    borderRadius: 16,
    ...webOnly({ cursor: 'pointer', transition: 'all 0.2s ease' }),
  },
  cardHovered: {
    borderColor: dashboardColors.cyan,
    backgroundColor: 'rgba(34,211,238,0.06)',
  },
  cardExpanded: {
    backgroundColor: 'rgba(139,92,246,0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTextCol: {
    flex: 1,
  },
  cardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 12,
    color: dashboardColors.textSecondary,
    lineHeight: 16,
  },

  // Steps (expanded guide content)
  stepsContainer: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139,92,246,0.15)',
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: dashboardColors.textPrimary,
    marginBottom: 2,
  },
  stepDetail: {
    fontSize: 13,
    color: dashboardColors.textSecondary,
    lineHeight: 18,
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
    ...webOnly({ cursor: 'pointer', transition: 'all 0.2s ease' }),
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
    ...webOnly({ cursor: 'pointer' }),
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
    ...webOnly({ cursor: 'pointer', transition: 'all 0.18s ease' }),
  },
  contactBtnHover: {
    backgroundColor: 'rgba(34,211,238,0.3)',
    borderColor: dashboardColors.cyan,
  },
  contactBtnTicket: {
    backgroundColor: 'rgba(139,92,246,0.2)',
    borderColor: 'rgba(139,92,246,0.4)',
  },
  contactBtnTicketHover: {
    backgroundColor: 'rgba(139,92,246,0.35)',
    borderColor: 'rgba(139,92,246,0.7)',
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

  // ── Modal styles ──────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: dashboardSpacing.md,
  },
  modalContent: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '80%',
    borderRadius: 20,
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
    ...webOnly({ outline: 'none' }),
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
    marginBottom: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
    ...webOnly({ cursor: 'pointer' }),
  },
  chipActive: {
    borderColor: 'rgba(34,211,238,0.4)',
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: dashboardColors.textSecondary,
  },
  chipTextActive: {
    color: 'rgba(34,211,238,1)',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 13,
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
  },
  ticketSuccessText: {
    fontSize: 14,
    color: dashboardColors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
});
