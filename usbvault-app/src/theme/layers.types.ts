/**
 * Type definitions for the USBVault layer-based theme system.
 *
 * Every surface in the app maps to one of five layers (L0–L4).
 * Each layer has six interactive states (base, hover, active, focused, pressed, disabled).
 * Each state provides native styles, text colors, and web-only CSS effects.
 */

import type { WebOnlyStyles } from '@/utils/webStyle';

// ── Layer & State Enums ──────────────────────────────────────────────

/** The five surface layers, ordered by elevation */
export type LayerLevel = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

/** Interactive states each layer can be in */
export type InteractiveState = 'base' | 'hover' | 'active' | 'focused' | 'pressed' | 'disabled';

// ── Layer State Style ────────────────────────────────────────────────

/** Native-safe visual properties (work on iOS, Android, Web) */
export interface NativeStyle {
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  opacity: number;
}

/** Text colors for content rendered on a given surface */
export interface TextColors {
  primary: string;
  secondary: string;
  muted: string;
  onAccent: string;
}

/**
 * Complete visual definition for one layer + state combination.
 * Split into `native` (all platforms) and `web` (CSS-only).
 */
export interface LayerStateStyle {
  native: NativeStyle;
  text: TextColors;
  web: WebOnlyStyles;
}

/** A complete layer with all six interactive states */
export type Layer = Record<InteractiveState, LayerStateStyle>;

// ── Semantic Colors ──────────────────────────────────────────────────

/** Brand and status colors that cross layer boundaries */
export interface SemanticColors {
  // Brand accents
  accentPrimary: string;
  accentSecondary: string; // magenta / pink
  accentTertiary: string; // cyan / teal

  // Status
  success: string;
  warning: string;
  danger: string;
  info: string;

  // Brand palette (for icons, badges, decorations)
  purple: string;
  cyan: string;
  lightCyan: string;
  cyanStrong: string;
  magenta: string;
  blue: string;
  green: string;

  // Glow variants (for web shadow effects)
  glowPurple: string;
  glowCyan: string;
}

// ── Special Surfaces ─────────────────────────────────────────────────

/** Compound style for status badges */
export interface StatusBadgeStyle {
  bg: string;
  border: string;
  text: string;
}

/** Special-purpose surfaces that don't fit the L0–L4 model */
export interface SpecialSurfaces {
  // Status badges
  statusSuccess: StatusBadgeStyle;
  statusWarning: StatusBadgeStyle;
  statusDanger: StatusBadgeStyle;
  statusInfo: StatusBadgeStyle;

  // PQC badge
  pqcBadge: { bg: string; border: string; text: string; dot: string };

  // Active beam (sidebar nav accent)
  activeBeam: { bg: string; glow: string };

  // Divider line
  divider: string;

  // Edge glow (top of shell)
  edgeGlow: string;

  // Danger button variant
  dangerButton: {
    bg: string;
    bgHover: string;
    border: string;
    borderHover: string;
    text: string;
    glowHover: string;
  };
}

// ── Theme Definition ─────────────────────────────────────────────────

/** The complete theme — one of these exists for dark mode and one for light mode */
export interface ThemeDefinition {
  name: 'dark' | 'light';

  // Surface layers
  L0: Layer; // App background / cosmic gradient
  L1: Layer; // Shell chrome (sidebar, topbar, footer)
  L2: Layer; // Content surfaces (cards, panels, sections)
  L3: Layer; // Interactive controls (buttons, inputs, pills, nav items)
  L4: Layer; // Elevated surfaces (dropdowns, modals, tooltips)

  // Non-layer colors
  semantic: SemanticColors;
  special: SpecialSurfaces;

  // Cosmic background gradient (L0 web background CSS)
  cosmicGradient: string;
}
