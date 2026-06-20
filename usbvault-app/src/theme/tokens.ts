/**
 * Theme-invariant design tokens.
 * These values do NOT change between dark and light mode.
 * Single source of truth for spacing, layout, radii, timing, and z-index.
 *
 * Replaces: dashboardLayout, dashboardSpacing, theme/spacing.ts
 */

// ── Spacing Scale ────────────────────────────────────────────────────
// Unified scale merging dashboardSpacing (xs:4, sm:8, md:16, lg:24, xl:32)
// and theme/spacing.ts (xs:4, sm:8, md:12, lg:16, xl:20, 2xl:24, 3xl:32, 4xl:48).
// Uses numeric keys for the base scale + named aliases for common usage.

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 48,
  9: 64,
} as const;

/** Named aliases mapping to the numeric scale (backward-compatible) */
export const spaceAliases = {
  xs: space[1], // 4
  sm: space[2], // 8
  md: space[4], // 16
  lg: space[6], // 24
  xl: space[7], // 32
} as const;

// ── Layout Dimensions ────────────────────────────────────────────────

export const layout = {
  maxWidth: 1880,
  sidebarWidth: 280,
  rightRailWidth: 330,
  mobileBreakpoint: 768,
  tabletBreakpoint: 1024,
} as const;

// ── Border Radii ─────────────────────────────────────────────────────

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  '2xl': 22,
  '3xl': 26,
  full: 9999,
} as const;

// ── Transition Timing ────────────────────────────────────────────────

export const timing = {
  fast: 'all 0.12s ease',
  normal: 'all 0.18s ease',
  smooth: 'all 0.25s ease',
  /** Standard multi-property transition for interactive elements */
  interactive:
    'transform 0.25s ease, box-shadow 0.25s ease, background 0.25s ease, border-color 0.25s ease',
} as const;

// ── Z-Index Scale ────────────────────────────────────────────────────
// Per SKILL.md: 0 / 10 / 20 / 40 / 100 / 1000

export const zIndex = {
  base: 0,
  raised: 10,
  dropdown: 20,
  sticky: 40,
  modal: 100,
  overlay: 1000,
} as const;

// ── Type Exports ─────────────────────────────────────────────────────

export type SpaceScale = typeof space;
export type SpaceKey = keyof typeof space;
export type SpaceAliasKey = keyof typeof spaceAliases;
export type RadiiKey = keyof typeof radii;
