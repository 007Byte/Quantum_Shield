import { StyleSheet } from 'react-native';
import { webOnly } from '@/utils/webStyle';
import {
  dashboardColors,
  dashboardSpacing,
  webOnlyEdgeLit,
  webOnlyGlassLuxury,
  webOnlyGlowTier2,
  webOnlyTransition,
} from '../styles';

export const rightRailStyles = StyleSheet.create({
  wrap: {
    width: 330,
    gap: dashboardSpacing.sm + 2,
    paddingBottom: dashboardSpacing.sm + 2,
  },
  card: {
    ...webOnlyGlassLuxury,
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    padding: 16,
    borderColor: 'rgba(139,92,246,0.35)',
    backgroundColor: 'rgba(18,12,40,0.65)',
    borderRadius: 16,
    position: 'relative',
    overflow: 'hidden',
    ...webOnly({
      background: 'linear-gradient(160deg, rgba(139,92,246,0.18), rgba(34,211,238,0.06))',
    }),
  },
  cardSheen: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 62,
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(245,243,255,0.09), rgba(245,243,255,0))',
    }),
    opacity: 0.56,
  },
  cardInnerBorder: {
    position: 'absolute',
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(245,243,255,0.04)',
    pointerEvents: 'none',
  },
  overviewCard: {
    minHeight: 296,
    overflow: 'visible',
  },
  scoreCard: {
    minHeight: 220,
    paddingBottom: 12,
  },
  shareCard: {
    minHeight: 242,
  },
  upgradeCard: {
    minHeight: 188,
    paddingBottom: 12,
  },
  cardTitle: {
    color: dashboardColors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  radarWrap: {
    width: 290,
    height: 260,
    marginTop: 6,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  radarHitZone: {
    position: 'absolute',
    zIndex: 10,
    justifyContent: 'center',
    ...webOnly({ cursor: 'pointer' }),
  },
  radarHitLabel: {
    color: '#B8B3D1',
    fontSize: 13,
    fontWeight: '500',
    ...webOnly({ userSelect: 'none' }),
  },
  radarTooltip: {
    marginTop: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(168,85,247,0.3)',
    backgroundColor: 'rgba(15,10,35,0.95)',
    ...webOnly({
      backdropFilter: 'blur(16px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 16px rgba(168,85,247,0.15)',
      animation: 'fadeIn 0.15s ease-out',
    }),
  },
  tooltipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  tooltipTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tooltipBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tooltipBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tooltipCurrent: {
    color: '#B0B0B0',
    fontSize: 12,
    marginBottom: 6,
  },
  tooltipSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 4,
  },
  tooltipSuggestion: {
    color: '#D4D0E8',
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  scoreRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: dashboardSpacing.sm,
  },
  scoreRingWrap: {
    width: 180,
    height: 150,
    position: 'relative',
  },
  scoreLabelWrap: {
    position: 'absolute',
    top: 55,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  scoreValue: {
    color: dashboardColors.textPrimary,
    fontSize: 42,
    fontWeight: '800',
    ...webOnly({ textShadow: '0 0 22px rgba(139,92,246,0.42)' }),
  },
  scoreStatus: {
    color: '#86EFAC',
    fontSize: 14,
    fontWeight: '600',
    marginTop: -2,
  },
  checkListWrap: {
    flex: 1,
    gap: 7,
    justifyContent: 'center',
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  checkItemText: {
    color: dashboardColors.textSecondary,
    fontSize: 14,
  },
  shareList: {
    marginTop: 8,
    gap: 8,
  },
  shareRow: {
    ...webOnlyEdgeLit,
    ...webOnlyTransition,
    minHeight: 58,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    backgroundColor: 'rgba(18,12,40,0.72)',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...webOnly({
      boxShadow: '0 0 12px rgba(139,92,246,0.2), inset 0 0 16px rgba(139,92,246,0.16)',
      background: 'linear-gradient(145deg, rgba(139,92,246,0.16), rgba(34,211,238,0.06))',
    }),
  },
  shareRowHovered: {
    borderColor: 'rgba(34,211,238,0.4)',
    backgroundColor: 'rgba(39,23,72,0.78)',
    ...webOnly({
      boxShadow: '0 0 16px rgba(139,92,246,0.28), inset 0 0 14px rgba(34,211,238,0.1)',
    }),
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  shareTextWrap: {
    flex: 1,
  },
  shareName: {
    color: dashboardColors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
  },
  shareSubtitle: {
    marginTop: 1,
    color: dashboardColors.textSecondary,
    fontSize: 13,
  },
  upgradeRow: {
    position: 'relative',
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bulletsWrap: {
    flex: 1,
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bulletText: {
    color: dashboardColors.textSecondary,
    fontSize: 16,
  },
  diamondWrap: {
    position: 'absolute',
    right: -50,
    top: 0,
    bottom: 0,
    width: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamondImg: {
    width: 240,
    height: 240,
  },
  upgradeBtn: {
    ...webOnlyGlowTier2,
    ...webOnlyTransition,
    marginTop: 10,
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.44)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(57,31,95,0.95)',
    ...webOnly({
      background: 'linear-gradient(135deg,#8b5cf6 0%, #22d3ee 100%)',
      boxShadow: '0 8px 25px rgba(139,92,246,0.45), 0 0 20px rgba(34,211,238,0.35)',
    }),
  },
  upgradeBtnHovered: {
    ...webOnly({
      transform: 'translateY(-2px)',
      boxShadow: '0 12px 40px rgba(139,92,246,0.6), 0 0 30px rgba(34,211,238,0.45)',
    }),
  },
  upgradeBtnText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  cardLight: {
    borderColor: 'rgba(200,190,230,0.25)',
    backgroundColor: 'rgba(255,255,255,0.45)',
    ...webOnly({
      background: 'linear-gradient(160deg, rgba(255,255,255,0.50), rgba(255,255,255,0.38))',
      backdropFilter: 'blur(20px) saturate(120%)',
      boxShadow:
        '0 4px 20px rgba(0,0,0,0.04), 0 0 0 1px rgba(255,255,255,0.50), inset 0 1px 0 rgba(255,255,255,0.60)',
    }),
  },
  cardSheenLight: {
    ...webOnly({
      background: 'linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0))',
    }),
  },
});
