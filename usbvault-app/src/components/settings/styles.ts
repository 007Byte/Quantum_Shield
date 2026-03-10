import { StyleSheet } from 'react-native';
import { dashboardColors, dashboardLayout, dashboardSpacing } from '@/components/dashboard2/styles';
import { webOnly } from '@/utils/webStyle';

export const styles = StyleSheet.create({
  // -- Layout --
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
    paddingBottom: 24,
  },
  settingsArea: {
    flex: 1,
    paddingTop: 8,
  },
  columnsRow: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'flex-start',
  },
  leftCol: {
    flex: 1,
    gap: 20,
  },
  rightCol: {
    flex: 1,
    gap: 20,
  },

  // -- Back nav --
  backRow: {
    marginBottom: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    ...webOnly({ transition: 'all 0.18s ease' }),
  },
  backBtnHover: {
    backgroundColor: 'rgba(34,211,238,0.1)',
  },
  backLabel: {
    color: dashboardColors.cyan,
    fontSize: 15,
    fontWeight: '500',
  },
  pageTitle: {
    color: dashboardColors.textPrimary,
    fontSize: 42,
    fontWeight: '800',
    marginBottom: 24,
  },

  // -- Section cards --
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(8,5,20,0.55)',
    padding: 20,
    ...webOnly({
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      background: 'linear-gradient(160deg, rgba(139,92,246,0.12), rgba(34,211,238,0.04))',
      boxShadow: '0 8px 32px rgba(0,0,0,0.45), 0 0 18px rgba(139,92,246,0.15), inset 0 0 20px rgba(139,92,246,0.12)',
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.2)',
  },
  sectionTitle: {
    color: dashboardColors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // -- Setting rows --
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.12)',
  },
  settingLabel: {
    color: dashboardColors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  settingMeta: {
    color: dashboardColors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  settingValue: {
    color: dashboardColors.textSecondary,
    fontSize: 15,
  },
  settingValueHighlight: {
    color: dashboardColors.cyan,
    fontSize: 15,
    fontWeight: '600',
  },

  // -- Badges --
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
  },
  tierText: {
    color: dashboardColors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  pqcPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.4)',
    backgroundColor: 'rgba(34,197,94,0.1)',
  },
  pqcDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: dashboardColors.green,
    ...webOnly({ boxShadow: '0 0 8px rgba(34,197,94,0.8)' }),
  },
  pqcText: {
    color: dashboardColors.green,
    fontSize: 13,
    fontWeight: '600',
  },
  enabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  enabledText: {
    color: dashboardColors.green,
    fontSize: 14,
    fontWeight: '600',
  },

  // -- Toggle --
  toggle: {
    width: 48,
    height: 26,
    borderRadius: 13,
    padding: 2,
    flexDirection: 'row',
  },
  toggleOn: {
    backgroundColor: dashboardColors.green,
    justifyContent: 'flex-end',
  },
  toggleCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
  },

  // -- Select pill --
  selectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(18,12,40,0.8)',
    ...webOnly({ transition: 'all 0.18s ease' }),
  },
  selectPillHover: {
    borderColor: 'rgba(34,211,238,0.5)',
  },
  selectText: {
    color: dashboardColors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },

  // -- Action buttons --
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    backgroundColor: 'rgba(139,92,246,0.15)',
    ...webOnly({ transition: 'all 0.18s ease' }),
  },
  actionBtnHover: {
    backgroundColor: 'rgba(139,92,246,0.3)',
    borderColor: 'rgba(139,92,246,0.6)',
  },
  actionBtnText: {
    color: dashboardColors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  lockBtn: {
    borderColor: 'rgba(255,107,107,0.3)',
    backgroundColor: 'rgba(255,107,107,0.08)',
  },
  lockBtnHover: {
    backgroundColor: 'rgba(255,107,107,0.18)',
    borderColor: 'rgba(255,107,107,0.5)',
  },
  lockBtnText: {
    color: '#FF6B6B',
    fontSize: 15,
    fontWeight: '600',
  },

  // -- Key fingerprint --
  keyFingerprint: {
    backgroundColor: 'rgba(8,5,20,0.7)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  keyLabel: {
    color: dashboardColors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
  },
  keyValue: {
    color: dashboardColors.cyan,
    fontSize: 14,
    fontFamily: 'monospace',
    fontWeight: '600',
  },

  // -- Link rows --
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginTop: 4,
    borderRadius: 8,
    paddingHorizontal: 4,
    ...webOnly({ transition: 'all 0.18s ease' }),
  },
  linkRowHover: {
    backgroundColor: 'rgba(34,211,238,0.08)',
  },
  linkText: {
    color: dashboardColors.cyan,
    fontSize: 15,
    fontWeight: '500',
  },

  // -- Help rows --
  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(139,92,246,0.1)',
    borderRadius: 6,
    ...webOnly({ transition: 'all 0.18s ease' }),
  },
  helpRowHover: {
    backgroundColor: 'rgba(139,92,246,0.1)',
  },
  helpText: {
    color: dashboardColors.cyan,
    fontSize: 15,
    fontWeight: '500',
  },

  // -- Sign out --
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.3)',
    backgroundColor: 'rgba(255,107,107,0.08)',
    ...webOnly({ transition: 'all 0.18s ease' }),
  },
  signOutBtnHover: {
    backgroundColor: 'rgba(255,107,107,0.18)',
    borderColor: 'rgba(255,107,107,0.5)',
    ...webOnly({ boxShadow: '0 0 16px rgba(255,107,107,0.2)' }),
  },
  signOutText: {
    color: '#FF6B6B',
    fontSize: 15,
    fontWeight: '600',
  },
});
