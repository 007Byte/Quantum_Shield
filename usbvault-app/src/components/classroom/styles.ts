/**
 * Classroom screen styles.
 * Extracted from classroom.tsx for maintainability (MONO-1).
 */

import { StyleSheet } from 'react-native';
import { webOnly } from '@/utils/webStyle';
import {
  dashboardLayout,
  dashboardSpacing,
  webOnlyTransition,
} from '@/components/dashboard2/styles';

// ── Lab Styles ──────────────────────────────────────────────────

export const labStyles = StyleSheet.create({
  container: {
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  cipherRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  cipherCard: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    gap: 4,
    minWidth: 120,
    flex: 1,
  },
  cipherName: {
    fontSize: 13,
    fontWeight: '600',
  },
  cipherType: {
    fontSize: 11,
  },
  description: {
    fontSize: 13,
    fontStyle: 'italic',
    marginBottom: 16,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase' as any,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    padding: 12,
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  encryptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(139,92,246,0.4)',
  },
  breakBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.3)',
  },
  btnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  outputBox: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  outputText: {
    fontSize: 13,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  bruteBox: {
    backgroundColor: 'rgba(255,107,107,0.08)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.2)',
  },
  bruteTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  bruteResult: {
    fontSize: 12,
    fontFamily: 'monospace',
    lineHeight: 18,
    paddingVertical: 1,
  },
  bruteResultMatch: {
    fontWeight: '700',
  },
  takeawayRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 16,
  },
  takeawayText: {
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
});

// ── KDF Styles ──────────────────────────────────────────────────

export const kdfStyles = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(168,85,247,0.8)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase' as any,
    letterSpacing: 0.5,
  },
  iterationRow: {
    marginBottom: 12,
  },
  iterationButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  iterationBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    backgroundColor: 'rgba(96,165,250,0.08)',
  },
  iterationBtnActive: {
    backgroundColor: 'rgba(96,165,250,0.4)',
    borderColor: '#60A5FA',
  },
  iterationBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'monospace',
  },
  iterationBtnTextActive: {
    color: '#fff',
  },
});

// ── Learn More Styles ───────────────────────────────────────────

export const learnStyles = StyleSheet.create({
  wrapper: {
    marginTop: 8,
    marginBottom: 12,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  panel: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    gap: 14,
  },
  section: {
    gap: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase' as any,
    letterSpacing: 0.4,
  },
  sectionContent: {
    fontSize: 13,
    lineHeight: 20,
    paddingLeft: 19,
  },
});

// ── Main Styles ──────────────────────────────────────────────────

export const classroomStyles = StyleSheet.create({
  contentArea: {
    paddingRight: 10,
  },

  // Header
  header: {
    marginBottom: dashboardSpacing.lg,
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

  // Progress Card
  progressCard: {
    padding: dashboardSpacing.lg,
    borderRadius: dashboardLayout.radiusXl,
    marginBottom: dashboardSpacing.xl,
    ...webOnlyTransition,
  },
  progressHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: dashboardSpacing.md,
  },
  progressTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  allCompleteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  allCompleteText: {
    fontSize: 12,
    fontWeight: '700',
  },
  progressBarContainer: {
    marginBottom: dashboardSpacing.md,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
    ...webOnly({ transition: 'width 0.4s ease' }),
  },
  progressFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: {
    fontSize: 13,
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    ...webOnly({ cursor: 'pointer', transition: 'all 0.18s ease' }),
  },
  continueBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Modules Section
  modulesSection: {
    marginBottom: dashboardSpacing.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: dashboardSpacing.md,
  },
  modulesList: {
    gap: 10,
  },

  // Module Card
  moduleCard: {
    padding: dashboardSpacing.md,
    borderRadius: dashboardLayout.radiusXl,
    ...webOnly({
      cursor: 'pointer',
      transition: 'all 0.22s ease',
      backdropFilter: 'blur(18px)',
    }),
  },
  moduleCardExpanded: {
    ...webOnly({
      boxShadow: '0 4px 24px rgba(0,0,0,0.3), 0 0 16px rgba(139,92,246,0.15)',
    }),
  },
  moduleCardHovered: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35), 0 0 20px rgba(139,92,246,0.18)',
    }),
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: dashboardSpacing.md,
    marginBottom: 8,
  },
  moduleIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  moduleInfo: {
    flex: 1,
    minWidth: 0,
  },
  moduleTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  moduleDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  statusContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  completedBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    ...webOnly({ boxShadow: '0 0 10px rgba(34,197,94,0.2)' }),
  },
  availableBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Module Footer
  moduleFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: dashboardSpacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(139, 92, 246, 0.1)',
  },
  lessonNumber: {
    fontSize: 11,
    fontWeight: '500',
  },
  estimatedTime: {
    fontSize: 12,
  },

  // Expanded Lesson Content
  lessonContent: {
    marginTop: -2,
    padding: dashboardSpacing.lg,
    borderBottomLeftRadius: dashboardLayout.radiusXl,
    borderBottomRightRadius: dashboardLayout.radiusXl,
    marginBottom: 4,
  },
  lessonSection: {
    marginBottom: 20,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 22,
    paddingLeft: 16,
  },

  // Key Takeaway
  takeawayBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  takeawayTextCol: {
    flex: 1,
  },
  takeawayLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase' as any,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  takeawayBody: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
  },

  // Complete Button
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    ...webOnly({ cursor: 'pointer', transition: 'all 0.18s ease' }),
  },
  completeBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Completed Banner
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  completedBannerText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
