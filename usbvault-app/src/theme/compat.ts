/**
 * USBVault Theme Compatibility Layer
 *
 * Migration bridge: re-exports the old APIs (dashboardColors, lightGlass, colors)
 * backed by the new layer-based theme system. Existing imports continue to work
 * without changes. Migrate file-by-file to the new useTheme() API, then delete
 * this file when all consumers are migrated.
 *
 * Usage: import { dashboardColors, lightGlass, colors } from '@/theme/compat';
 * (or from '@/theme' once index.ts is updated)
 */

import type { ViewStyle } from 'react-native';
import { getTheme } from './engine';
import { darkTheme } from './dark';
import { logger } from '@/utils/logger';
import { lightTheme } from './light';
import { webOnly } from '@/utils/webStyle';

// ── dashboardColors Shim ─────────────────────────────────────────────
// Maps old flat property names to new layer locations.

const dashboardColorMap: Record<
  string,
  (dark: typeof darkTheme, light: typeof lightTheme, isDark: boolean) => string
> = {
  bg0: (d, l, isDark) => (isDark ? d : l).L0.base.native.backgroundColor,
  bg1: (_d, _l, isDark) => (isDark ? '#1A0F3A' : '#FFFFFF'),
  bg2: (_d, _l, isDark) => (isDark ? '#120A26' : '#F3EFF8'),
  panel: (d, l, isDark) => (isDark ? d : l).L2.base.native.backgroundColor,
  panelStrong: (d, l, isDark) => (isDark ? d : l).L2.active.native.backgroundColor,
  borderPurple: (d, l, isDark) => (isDark ? d : l).L2.base.native.borderColor,
  borderBlue: () => 'rgba(96,165,250,0.08)',
  borderCyan: () => 'rgba(6,182,212,0.10)',
  purple: (d, l, isDark) => (isDark ? d : l).semantic.purple,
  magenta: (d, l, isDark) => (isDark ? d : l).semantic.magenta,
  cyan: (d, l, isDark) => (isDark ? d : l).semantic.cyan,
  lightCyan: (d, l, isDark) => (isDark ? d : l).semantic.lightCyan,
  cyanStrong: (d, l, isDark) => (isDark ? d : l).semantic.cyanStrong,
  blue: (d, l, isDark) => (isDark ? d : l).semantic.blue,
  glowPurple: (d, l, isDark) => (isDark ? d : l).semantic.glowPurple,
  glowCyan: (d, l, isDark) => (isDark ? d : l).semantic.glowCyan,
  green: (d, l, isDark) => (isDark ? d : l).semantic.green,
  textPrimary: (d, l, isDark) => (isDark ? d : l).L2.base.text.primary,
  textSecondary: (d, l, isDark) => (isDark ? d : l).L2.base.text.secondary,
};

export const dashboardColorsCompat = new Proxy({} as Record<string, string>, {
  get(_target, prop: string) {
    const t = getTheme();
    const isDark = t.name === 'dark';
    const resolver = dashboardColorMap[prop];
    if (resolver) return resolver(darkTheme, lightTheme, isDark);
    if (__DEV__) {
      logger.warn(
        `[theme/compat] dashboardColors.${prop} is not mapped. Add it to compat.ts or migrate to useTheme().`
      );
    }
    return '';
  },
});

// ── lightGlass Shim ──────────────────────────────────────────────────
// Returns light theme layer styles. Old code applies these via `isLight && lightGlass.xxx`.

const lightGlassMap: Record<string, () => ViewStyle> = {
  // Shell
  shell: () =>
    ({
      backgroundColor: lightTheme.L1.base.native.backgroundColor,
      borderColor: lightTheme.L1.base.native.borderColor,
    }) as ViewStyle,
  shellWeb: () =>
    ({ backgroundColor: 'transparent', ...webOnly(lightTheme.L1.base.web) }) as ViewStyle,
  shellEdgeGlow: () => ({ backgroundColor: lightTheme.special.edgeGlow }) as ViewStyle,

  // Sidebar
  sidebar: () =>
    ({
      backgroundColor: 'rgba(255,255,255,0.35)',
      borderRightColor: 'rgba(255,255,255,0.50)',
    }) as ViewStyle,
  sidebarWeb: () =>
    ({
      backgroundColor: 'transparent',
      ...webOnly({
        background: 'rgba(255,255,255,0.38)',
        boxShadow: 'inset -1px 0 0 rgba(255,255,255,0.40)',
        backdropFilter: 'blur(20px) saturate(120%)',
      }),
    }) as ViewStyle,

  // Panels (L2)
  panel: () => lightTheme.L2.base.native as ViewStyle,
  panelWeb: () => ({ ...webOnly(lightTheme.L2.base.web) }) as ViewStyle,
  panelStrong: () =>
    ({
      backgroundColor: 'rgba(255,255,255,0.55)',
      borderColor: 'rgba(255,255,255,0.65)',
      borderWidth: 1,
    }) as ViewStyle,

  // Controls (L3)
  control: () => lightTheme.L3.base.native as ViewStyle,
  controlWeb: () =>
    ({ backgroundColor: 'transparent', ...webOnly(lightTheme.L3.base.web) }) as ViewStyle,
  controlHover: () => lightTheme.L3.hover.native as ViewStyle,
  controlHoverWeb: () =>
    ({ backgroundColor: 'transparent', ...webOnly(lightTheme.L3.hover.web) }) as ViewStyle,

  // Dropdowns (L4)
  dropdown: () => lightTheme.L4.base.native as ViewStyle,
  dropdownWeb: () => ({ ...webOnly(lightTheme.L4.base.web) }) as ViewStyle,
  dropdownItemHover: () => lightTheme.L4.hover.native as ViewStyle,

  // Nav items (L3 active/hover)
  navItemActive: () => lightTheme.L3.active.native as ViewStyle,
  navItemActiveWeb: () =>
    ({ backgroundColor: 'transparent', ...webOnly(lightTheme.L3.active.web) }) as ViewStyle,
  navItemHover: () => lightTheme.L3.hover.native as ViewStyle,
  navItemHoverWeb: () =>
    ({ backgroundColor: 'transparent', ...webOnly(lightTheme.L3.hover.web) }) as ViewStyle,

  // Footer
  footer: () =>
    ({
      backgroundColor: 'rgba(255,255,255,0.40)',
      borderTopColor: 'rgba(0,0,0,0.04)',
    }) as ViewStyle,

  // Action cards (L2)
  actionCard: () => lightTheme.L2.base.native as ViewStyle,
  actionCardWeb: () =>
    ({ backgroundColor: 'transparent', ...webOnly(lightTheme.L2.base.web) }) as ViewStyle,

  // Status pill
  statusPill: () =>
    ({
      backgroundColor: 'rgba(255,255,255,0.50)',
      borderColor: 'rgba(8,145,178,0.25)',
    }) as ViewStyle,
  statusPillWeb: () =>
    ({
      backgroundColor: 'transparent',
      ...webOnly({
        background: 'linear-gradient(145deg, rgba(255,255,255,0.55), rgba(255,255,255,0.40))',
        boxShadow: '0 2px 12px rgba(124,58,237,0.06), 0 0 0 1px rgba(255,255,255,0.45)',
        backdropFilter: 'blur(16px)',
      }),
    }) as ViewStyle,

  // Premium CTA
  premiumCta: () =>
    ({
      backgroundColor: 'rgba(255,255,255,0.45)',
      borderColor: 'rgba(139,92,246,0.15)',
    }) as ViewStyle,
  premiumCtaWeb: () =>
    ({
      backgroundColor: 'transparent',
      ...webOnly({
        background:
          'linear-gradient(135deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.40) 100%)',
        boxShadow: '0 4px 16px rgba(139,92,246,0.08), 0 0 0 1px rgba(255,255,255,0.45)',
        backdropFilter: 'blur(16px)',
      }),
    }) as ViewStyle,

  // Share row
  shareRow: () =>
    ({
      backgroundColor: 'rgba(255,255,255,0.40)',
      borderColor: 'rgba(255,255,255,0.55)',
      borderWidth: 1,
    }) as ViewStyle,
  shareRowWeb: () =>
    ({
      ...webOnly({
        background: 'rgba(255,255,255,0.40)',
        boxShadow: '0 0 10px rgba(139,92,246,0.06), inset 0 1px 0 rgba(255,255,255,0.50)',
        backdropFilter: 'blur(16px)',
      }),
    }) as ViewStyle,

  // Tooltip (L4 variant)
  tooltip: () =>
    ({ backgroundColor: 'rgba(255,255,255,0.90)', borderColor: 'rgba(200,190,230,0.30)' }) as ViewStyle,
  tooltipWeb: () =>
    ({
      ...webOnly({
        boxShadow: '0 8px 32px rgba(139,92,246,0.10), 0 0 0 1px rgba(255,255,255,0.60)',
        backdropFilter: 'blur(20px) saturate(130%)',
      }),
    }) as ViewStyle,

  // Upgrade button
  upgradeBtn: () =>
    ({
      backgroundColor: 'rgba(124,58,237,0.10)',
      borderColor: 'rgba(139,92,246,0.20)',
    }) as ViewStyle,

  // Generic reusable
  sectionBg: () => lightTheme.L2.base.native as ViewStyle,
  sectionBgWeb: () => ({ ...webOnly(lightTheme.L2.base.web) }) as ViewStyle,
  cardBg: () => lightTheme.L2.base.native as ViewStyle,
  cardBgWeb: () =>
    ({ backgroundColor: 'transparent', ...webOnly(lightTheme.L2.base.web) }) as ViewStyle,
  containerBg: () => lightTheme.L1.base.native as ViewStyle,
  containerBgWeb: () => ({ ...webOnly(lightTheme.L1.base.web) }) as ViewStyle,
  strongBg: () =>
    ({
      backgroundColor: 'rgba(255,255,255,0.55)',
      borderColor: 'rgba(255,255,255,0.65)',
    }) as ViewStyle,
  strongBgWeb: () =>
    ({
      ...webOnly({
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 0 10px rgba(139,92,246,0.08), inset 0 1px 0 rgba(255,255,255,0.60)',
      }),
    }) as ViewStyle,
  modalBg: () =>
    ({
      backgroundColor: 'rgba(255,255,255,0.85)',
      borderColor: 'rgba(200,190,230,0.30)',
    }) as ViewStyle,
  modalBgWeb: () =>
    ({
      ...webOnly({
        backdropFilter: 'blur(28px) saturate(140%)',
        boxShadow: '0 16px 48px rgba(139,92,246,0.12), 0 0 0 1px rgba(255,255,255,0.55)',
      }),
    }) as ViewStyle,
  inputBg: () =>
    ({
      backgroundColor: 'rgba(255,255,255,0.50)',
      borderColor: 'rgba(200,190,230,0.35)',
      borderWidth: 1,
    }) as ViewStyle,
  subtleBg: () => ({ backgroundColor: 'rgba(255,255,255,0.25)' }) as ViewStyle,

  // Web-only effects
  webGlassSubtle: () =>
    ({
      ...webOnly({
        backdropFilter: 'blur(20px) saturate(120%)',
        boxShadow: '0 4px 20px rgba(124,58,237,0.03), inset 0 1px 0 rgba(255,255,255,0.18)',
      }),
    }) as ViewStyle,
  webEdgeLitSubtle: () =>
    ({
      ...webOnly({ boxShadow: '0 0 0 1px rgba(139,92,246,0.10), 0 0 6px rgba(139,92,246,0.06)' }),
    }) as ViewStyle,
  webGlowSubtle: () =>
    ({
      ...webOnly({ boxShadow: '0 2px 12px rgba(139,92,246,0.06), 0 0 4px rgba(34,211,238,0.04)' }),
    }) as ViewStyle,
  sidebarSheen: () =>
    ({
      ...webOnly({
        background: 'linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0))',
      }),
    }) as ViewStyle,
};

export const lightGlassCompat = new Proxy({} as Record<string, ViewStyle>, {
  get(_target, prop: string) {
    const resolver = lightGlassMap[prop as string];
    if (resolver) return resolver();
    if (__DEV__) {
      logger.warn(
        `[theme/compat] lightGlass.${prop} is not mapped. Add it to compat.ts or migrate to useTheme().`
      );
    }
    return {} as ViewStyle;
  },
});

// ── colors Shim ──────────────────────────────────────────────────────
// Maps the old theme/colors.ts API to new layer locations.

const colorsMap: Record<
  string,
  (dark: typeof darkTheme, light: typeof lightTheme, isDark: boolean) => unknown
> = {
  // Backgrounds
  bgPrimary: (d, l, isDark) => (isDark ? d : l).L0.base.native.backgroundColor,
  bgSecondary: (_d, _l, isDark) => (isDark ? '#1A1530' : '#FFFFFF'),
  bgTertiary: (_d, _l, isDark) => (isDark ? '#251D40' : '#F0ECF5'),
  bgInput: (_d, _l, isDark) => (isDark ? '#130F24' : '#FFFFFF'),
  bgHover: (_d, _l, isDark) => (isDark ? '#2D2645' : '#EDE8F5'),

  // Accents
  accentPrimary: (d, l, isDark) => (isDark ? d : l).semantic.accentPrimary,
  accentPrimaryHover: (_d, _l, isDark) => (isDark ? '#8B5CF6' : '#6D28D9'),
  accentPrimaryPressed: (_d, _l, isDark) => (isDark ? '#6D28D9' : '#5B21B6'),
  accentSecondary: (d, l, isDark) => (isDark ? d : l).semantic.accentSecondary,
  accentSecondaryHover: (_d, _l, isDark) => (isDark ? '#F472B6' : '#DB2777'),
  accentTertiary: (d, l, isDark) => (isDark ? d : l).semantic.accentTertiary,

  // Text
  textPrimary: (d, l, isDark) => (isDark ? d : l).L2.base.text.primary,
  textSecondary: (d, l, isDark) => (isDark ? d : l).L2.base.text.secondary,
  textMuted: (d, l, isDark) => (isDark ? d : l).L2.base.text.muted,
  textOnAccent: (d, l, isDark) => (isDark ? d : l).L2.base.text.onAccent,

  // Status
  success: (d, l, isDark) => (isDark ? d : l).semantic.success,
  warning: (d, l, isDark) => (isDark ? d : l).semantic.warning,
  danger: (d, l, isDark) => (isDark ? d : l).semantic.danger,
  dangerHover: (_d, _l, isDark) => (isDark ? '#DC2626' : '#B91C1C'),
  dangerPressed: (_d, _l, isDark) => (isDark ? '#B91C1C' : '#991B1B'),

  // Accent ghost variants (low-opacity accent background for secondary interactions)
  accentPrimaryGhost: (_d, _l, isDark) =>
    isDark ? 'rgba(139, 92, 246, 0.15)' : 'rgba(124, 58, 237, 0.15)',
  accentPrimaryGhostSubtle: (_d, _l, isDark) =>
    isDark ? 'rgba(139, 92, 246, 0.10)' : 'rgba(124, 58, 237, 0.10)',

  // Borders
  border: (_d, _l, isDark) => (isDark ? '#2D2645' : '#E2DEF0'),
  borderLight: (_d, _l, isDark) => (isDark ? '#3D3551' : '#D4CEE5'),
  borderAccent: (_d, _l, isDark) => (isDark ? '#3D2C5E' : '#C4B5E0'),
  borderFocus: () => '#7C3AED',

  // Gradients
  gradientStart: (_d, _l, isDark) => (isDark ? '#0F0B1E' : '#F8F7FC'),
  gradientEnd: (_d, _l, isDark) => (isDark ? '#1A0F33' : '#EDE8F5'),
  gradientAccent: () => ['#7C3AED', '#EC4899'],

  // PQC Badge
  pqcBadgeBg: (_d, _l, isDark) => (isDark ? 'rgba(124, 58, 237, 0.2)' : 'rgba(124, 58, 237, 0.12)'),
  pqcBadgeText: () => '#7C3AED',
};

export const colorsCompat = new Proxy({} as Record<string, unknown>, {
  get(_target, prop: string) {
    const t = getTheme();
    const isDark = t.name === 'dark';
    const resolver = colorsMap[prop];
    if (resolver) return resolver(darkTheme, lightTheme, isDark);
    if (__DEV__) {
      logger.warn(
        `[theme/compat] colors.${prop} is not mapped. Add it to compat.ts or migrate to useTheme().`
      );
    }
    return '';
  },
});
