import { TextStyle, ViewStyle } from 'react-native';
import { webOnly } from '@/utils/webStyle';
import { dashboardColorsCompat } from '@/theme/compat';

/**
 * Theme-reactive dashboard colors.
 * Uses the compat proxy — resolves to dark or light palette based on current theme.
 * Works reactively in inline JSX: color={dashboardColors.green}
 * NOTE: Values captured in StyleSheet.create() are fixed at load time and
 * rely on webCSSSync for correction on theme toggle.
 */
export const dashboardColors = dashboardColorsCompat as {
  bg0: string;
  bg1: string;
  bg2: string;
  panel: string;
  panelStrong: string;
  borderPurple: string;
  borderBlue: string;
  borderCyan: string;
  purple: string;
  magenta: string;
  cyan: string;
  lightCyan: string;
  cyanStrong: string;
  blue: string;
  glowPurple: string;
  glowCyan: string;
  green: string;
  textPrimary: string;
  textSecondary: string;
};

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
    transition:
      'transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease',
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
    filter:
      'drop-shadow(0 0 18px rgba(139,92,246,0.42)) drop-shadow(0 0 30px rgba(34,211,238,0.28))',
  }),
} as ViewStyle;

// ── Light-mode variants ──────────────────────────────────────────────────────
// Applied AFTER the dark counterparts in style arrays so they win the cascade.

export const webOnlyGlassLight: ViewStyle = {
  ...webOnly({
    backdropFilter: 'blur(16px) saturate(120%)',
    boxShadow:
      '0 4px 20px rgba(0,0,0,0.04), 0 0 0 1px rgba(255,255,255,0.50), inset 0 1px 0 rgba(255,255,255,0.60)',
  }),
} as ViewStyle;

export const webOnlyGlassLuxuryLight: ViewStyle = {
  ...webOnly({
    backdropFilter: 'blur(20px) saturate(130%)',
    boxShadow:
      '0 6px 24px rgba(0,0,0,0.06), 0 0 0 1px rgba(255,255,255,0.55), inset 0 1px 0 rgba(255,255,255,0.65), inset 0 0 20px rgba(255,255,255,0.15)',
  }),
} as ViewStyle;

export const webOnlyEdgeLitLight: ViewStyle = {
  ...webOnly({
    boxShadow: '0 0 0 1px rgba(200,190,230,0.18), 0 2px 8px rgba(124,58,237,0.06)',
  }),
} as ViewStyle;

export const webOnlyGlowTier1Light: ViewStyle = {
  ...webOnly({
    boxShadow: '0 4px 24px rgba(124,58,237,0.08), 0 0 12px rgba(8,145,178,0.06)',
  }),
} as ViewStyle;

export const webOnlyGlowTier2Light: ViewStyle = {
  ...webOnly({
    boxShadow: '0 2px 16px rgba(124,58,237,0.06), 0 0 8px rgba(8,145,178,0.04)',
  }),
} as ViewStyle;

export const webOnlyGlowTier3Light: ViewStyle = {
  ...webOnly({
    boxShadow: '0 2px 12px rgba(124,58,237,0.04), 0 0 4px rgba(8,145,178,0.03)',
  }),
} as ViewStyle;

export const textGlowStrongLight: TextStyle = {
  ...webOnly({
    textShadow: '0 0 12px rgba(124,58,237,0.12)',
  }),
} as TextStyle;

export const webOnlyNeonRingLight: ViewStyle = {
  ...webOnly({
    filter: 'drop-shadow(0 0 8px rgba(124,58,237,0.12)) drop-shadow(0 0 16px rgba(8,145,178,0.08))',
  }),
} as ViewStyle;
