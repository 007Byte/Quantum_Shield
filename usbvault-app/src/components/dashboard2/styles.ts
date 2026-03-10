import { TextStyle, ViewStyle } from 'react-native';
import { webOnly } from '@/utils/webStyle';

export const dashboardColors = {
  bg0: '#0B0617',
  bg1: '#1A0F3A',
  bg2: '#120A26',
  panel: 'rgba(18,12,40,0.65)',
  panelStrong: 'rgba(14,10,34,0.74)',
  borderPurple: 'rgba(139,92,246,0.35)',
  borderBlue: 'rgba(96,165,250,0.28)',
  borderCyan: 'rgba(6,182,212,0.3)',
  purple: '#8B5CF6',
  magenta: '#D946EF',
  cyan: '#22D3EE',
  lightCyan: '#67E8F9',
  cyanStrong: '#06B6D4',
  blue: '#60A5FA',
  glowPurple: '#A855F7',
  glowCyan: '#06B6D4',
  green: '#22C55E',
  textPrimary: '#F5F3FF',
  textSecondary: '#B7B2D9',
} as const;

export const dashboardLayout = {
  maxWidth: 1880,
  sidebarWidth: 280,
  rightRailWidth: 330,
  radiusXl: 22,
  radius2Xl: 26,
};

export const dashboardSpacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const glassPanelBase: ViewStyle = {
  backgroundColor: dashboardColors.panel,
  borderWidth: 1,
  borderColor: dashboardColors.borderPurple,
  borderRadius: dashboardLayout.radiusXl,
};

export const glassPanelStrong: ViewStyle = {
  backgroundColor: dashboardColors.panelStrong,
  borderWidth: 1,
  borderColor: dashboardColors.borderPurple,
  borderRadius: dashboardLayout.radiusXl,
};

export const webOnlyGlass: ViewStyle = {
  ...webOnly({
    backdropFilter: 'blur(18px)',
    boxShadow:
      '0 10px 40px rgba(0,0,0,0.58), 0 0 25px rgba(139,92,246,0.18), inset 0 1px 0 rgba(245,243,255,0.06)',
  }),
} as ViewStyle;

export const webOnlyCosmicBackground: ViewStyle = {
  ...webOnly({
    background:
      'radial-gradient(circle at 40% 20%, rgba(139,92,246,0.25) 0%, rgba(11,6,23,0) 60%), radial-gradient(circle at 75% 35%, rgba(34,211,238,0.18) 0%, rgba(11,6,23,0) 60%), radial-gradient(circle at 24% 82%, rgba(168,85,247,0.16) 0%, rgba(11,6,23,0) 56%), linear-gradient(160deg, #070412 0%, #0b0617 45%, #1a1038 78%, #070412 100%)',
  }),
} as ViewStyle;

export const textGlowStrong: TextStyle = {
  ...webOnly({
    textShadow: '0 0 28px rgba(139,92,246,0.45)',
  }),
} as TextStyle;

export const webOnlyTransition: ViewStyle = {
  ...webOnly({
    transition: 'transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease',
  }),
} as ViewStyle;

export const webOnlyEdgeLit: ViewStyle = {
  ...webOnly({
    boxShadow:
      '0 0 0 1px rgba(139,92,246,0.25), 0 0 12px rgba(139,92,246,0.35), 0 0 30px rgba(34,211,238,0.15)',
  }),
} as ViewStyle;

export const webOnlyGlowTier1: ViewStyle = {
  ...webOnly({
    boxShadow:
      '0 0 40px rgba(139,92,246,0.5), 0 0 80px rgba(34,211,238,0.35), 0 0 130px rgba(168,85,247,0.24)',
  }),
} as ViewStyle;

export const webOnlyGlowTier2: ViewStyle = {
  ...webOnly({
    boxShadow: '0 0 18px rgba(139,92,246,0.4), 0 0 36px rgba(34,211,238,0.16)',
  }),
} as ViewStyle;

export const webOnlyGlowTier3: ViewStyle = {
  ...webOnly({
    boxShadow: '0 0 8px rgba(139,92,246,0.2), 0 0 16px rgba(139,92,246,0.12)',
  }),
} as ViewStyle;

export const webOnlyGlassLuxury: ViewStyle = {
  ...webOnly({
    backdropFilter: 'blur(22px) saturate(130%)',
    boxShadow:
      '0 14px 42px rgba(0,0,0,0.62), 0 0 26px rgba(139,92,246,0.2), 0 0 48px rgba(34,211,238,0.1), inset 0 1px 0 rgba(245,243,255,0.08), inset 0 0 36px rgba(139,92,246,0.16)',
  }),
} as ViewStyle;

export const webOnlyNeonRing: ViewStyle = {
  ...webOnly({
    filter: 'drop-shadow(0 0 18px rgba(139,92,246,0.42)) drop-shadow(0 0 30px rgba(34,211,238,0.28))',
  }),
} as ViewStyle;
