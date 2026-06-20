/**
 * USBVault Light Theme — Complete Definition
 *
 * Independent from dark mode — shares NO values with dark.ts.
 *
 * Light mode sits on a pastel ethereal background image (background-light.png).
 * Surfaces use frosted white glass at 35–75% opacity, creating visible
 * layered depth while letting the dreamy pastel cosmos peek through.
 *
 * Layer hierarchy:
 *   L0: Base — solid light lavender fallback behind the background image
 *   L1: Shell Chrome — frosted white glass (sidebar, topbar, footer)
 *   L2: Content Surfaces — soft white panels with purple-tinted shadows
 *   L3: Interactive Controls — buttons, inputs, pills with clear edges
 *   L4: Elevated — near-opaque white for modals, dropdowns, tooltips
 *
 * Text is dark (#1A1528 primary) for maximum readability on light glass.
 * Accents use saturated purple/cyan at darker values for contrast.
 */

import type { ThemeDefinition, LayerStateStyle } from './layers.types';
import { radii, timing } from './tokens';

// ── Helpers ──────────────────────────────────────────────────────────

const lightText = {
  primary: '#1A1528',
  secondary: '#4A3D6B',
  muted: '#5B6A7D',
  onAccent: '#FFFFFF',
};

function withOverrides(
  base: LayerStateStyle,
  overrides: Partial<{
    native: Partial<LayerStateStyle['native']>;
    text: Partial<LayerStateStyle['text']>;
    web: LayerStateStyle['web'];
  }>
): LayerStateStyle {
  return {
    native: { ...base.native, ...overrides.native },
    text: { ...base.text, ...overrides.text },
    web: { ...base.web, ...overrides.web },
  };
}

// ── L0: App Background ──────────────────────────────────────────────
// Solid fallback color; background-light.png is rendered behind everything.

const L0Base: LayerStateStyle = {
  native: {
    backgroundColor: '#EDE8F5',
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
  },
  text: lightText,
  web: {},
};

// ── L1: Shell Chrome (Sidebar, TopBar, Footer) ──────────────────────
// Frosted white glass — high enough opacity to be clearly visible
// while still letting the pastel background show through.

const L1Base: LayerStateStyle = {
  native: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    borderColor: 'rgba(255,255,255,0.60)',
    borderWidth: 1,
    borderRadius: radii['3xl'],
    opacity: 1,
  },
  text: lightText,
  web: {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.48) 0%, rgba(255,255,255,0.38) 100%)',
    backdropFilter: 'blur(24px) saturate(130%)',
    boxShadow:
      '0 0 0 1px rgba(255,255,255,0.50), 0 4px 24px rgba(139,92,246,0.08), 0 0 40px rgba(139,92,246,0.04), inset 0 1px 0 rgba(255,255,255,0.70)',
    transition: timing.interactive,
  },
};

// ── L2: Content Surfaces (Cards, Panels, Sections) ──────────────────
// Soft white glass panels with gentle purple-tinted shadows.

const L2Base: LayerStateStyle = {
  native: {
    backgroundColor: 'rgba(255,255,255,0.50)',
    borderColor: 'rgba(255,255,255,0.65)',
    borderWidth: 1,
    borderRadius: radii['2xl'],
    opacity: 1,
  },
  text: lightText,
  web: {
    background: 'rgba(255,255,255,0.50)',
    backdropFilter: 'blur(20px) saturate(120%)',
    boxShadow:
      '0 2px 16px rgba(139,92,246,0.06), 0 0 0 1px rgba(255,255,255,0.55), inset 0 1px 0 rgba(255,255,255,0.65)',
  },
};

// ── L3: Interactive Controls (Buttons, Inputs, Pills, Nav Items) ────
// Visible, touchable surfaces with clear edges and hover feedback.

const L3Base: LayerStateStyle = {
  native: {
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderColor: 'rgba(200,190,230,0.40)',
    borderWidth: 1,
    borderRadius: radii.lg,
    opacity: 1,
  },
  text: lightText,
  web: {
    cursor: 'pointer',
    transition: timing.normal,
    background: 'rgba(255,255,255,0.45)',
    boxShadow: '0 1px 6px rgba(139,92,246,0.06), 0 0 0 1px rgba(255,255,255,0.40)',
    backdropFilter: 'blur(16px)',
  },
};

// ── L4: Elevated Surfaces (Dropdowns, Modals, Tooltips) ─────────────
// Near-opaque for maximum text readability.

const L4Base: LayerStateStyle = {
  native: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(200,190,230,0.35)',
    borderWidth: 1,
    borderRadius: radii.lg,
    opacity: 1,
  },
  text: lightText,
  web: {
    background: 'rgba(255,255,255,0.88)',
    backdropFilter: 'blur(28px) saturate(140%)',
    boxShadow:
      '0 8px 32px rgba(139,92,246,0.10), 0 2px 8px rgba(0,0,0,0.04), 0 0 0 1px rgba(255,255,255,0.60), inset 0 1px 0 rgba(255,255,255,0.80)',
  },
};

// ── Theme Export ─────────────────────────────────────────────────────

export const lightTheme: ThemeDefinition = {
  name: 'light',

  cosmicGradient:
    'radial-gradient(circle at 40% 20%, rgba(139,92,246,0.10) 0%, transparent 60%), radial-gradient(circle at 75% 35%, rgba(34,211,238,0.07) 0%, transparent 60%), radial-gradient(circle at 24% 82%, rgba(168,85,247,0.07) 0%, transparent 56%)',

  // ── L0: App Background ──────────────────────────────────────────
  L0: {
    base: L0Base,
    hover: L0Base,
    active: L0Base,
    focused: L0Base,
    pressed: L0Base,
    disabled: withOverrides(L0Base, { native: { opacity: 0.5 } }),
  },

  // ── L1: Shell Chrome ────────────────────────────────────────────
  L1: {
    base: L1Base,
    hover: withOverrides(L1Base, {
      web: {
        background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.42) 100%)',
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.55), 0 4px 24px rgba(139,92,246,0.10), inset 0 1px 0 rgba(255,255,255,0.75)',
      },
    }),
    active: L1Base,
    focused: L1Base,
    pressed: L1Base,
    disabled: withOverrides(L1Base, { native: { opacity: 0.5 } }),
  },

  // ── L2: Content Surfaces ────────────────────────────────────────
  L2: {
    base: L2Base,
    hover: withOverrides(L2Base, {
      native: {
        backgroundColor: 'rgba(255,255,255,0.58)',
        borderColor: 'rgba(255,255,255,0.70)',
      },
      web: {
        background: 'rgba(255,255,255,0.58)',
        transform: 'translateY(-2px)',
        backdropFilter: 'blur(20px) saturate(125%)',
        boxShadow:
          '0 6px 24px rgba(139,92,246,0.10), 0 0 0 1px rgba(255,255,255,0.60), inset 0 1px 0 rgba(255,255,255,0.70)',
      },
    }),
    active: withOverrides(L2Base, {
      native: {
        backgroundColor: 'rgba(255,255,255,0.55)',
        borderColor: 'rgba(139,92,246,0.15)',
      },
    }),
    focused: withOverrides(L2Base, {
      native: { borderColor: '#7C3AED' },
      web: { boxShadow: '0 0 0 2px rgba(124,58,237,0.30)' },
    }),
    pressed: withOverrides(L2Base, {
      native: { backgroundColor: 'rgba(255,255,255,0.60)' },
    }),
    disabled: withOverrides(L2Base, {
      native: { opacity: 0.5 },
      text: {
        primary: 'rgba(26,21,40,0.5)',
        secondary: 'rgba(74,61,107,0.5)',
        muted: 'rgba(91,106,125,0.5)',
        onAccent: 'rgba(255,255,255,0.5)',
      },
      web: { cursor: 'not-allowed' },
    }),
  },

  // ── L3: Interactive Controls ────────────────────────────────────
  L3: {
    base: L3Base,
    hover: {
      native: {
        backgroundColor: 'rgba(255,255,255,0.60)',
        borderColor: 'rgba(139,92,246,0.18)',
        borderWidth: 1,
        borderRadius: radii.lg,
        opacity: 1,
      },
      text: lightText,
      web: {
        cursor: 'pointer',
        transition: timing.normal,
        background: 'linear-gradient(145deg, rgba(255,255,255,0.65), rgba(255,255,255,0.50))',
        boxShadow:
          '0 4px 16px rgba(139,92,246,0.08), 0 0 0 1px rgba(255,255,255,0.55)',
        backdropFilter: 'blur(16px) saturate(120%)',
      },
    },
    active: {
      native: {
        backgroundColor: 'rgba(139,92,246,0.12)',
        borderColor: 'rgba(139,92,246,0.25)',
        borderWidth: 1,
        borderRadius: radii.lg,
        opacity: 1,
      },
      text: lightText,
      web: {
        background: 'linear-gradient(90deg, rgba(124,58,237,0.14) 0%, rgba(34,211,238,0.08) 100%)',
        boxShadow:
          '0 0 12px rgba(139,92,246,0.10), 0 0 0 1px rgba(139,92,246,0.20), inset 0 1px 0 rgba(255,255,255,0.40)',
        backdropFilter: 'blur(16px)',
      },
    },
    focused: withOverrides(L3Base, {
      native: { borderColor: '#7C3AED' },
      web: { boxShadow: '0 0 0 2px rgba(124,58,237,0.30)' },
    }),
    pressed: {
      native: {
        backgroundColor: '#5B21B6',
        borderColor: 'rgba(139,92,246,0.20)',
        borderWidth: 1,
        borderRadius: radii.lg,
        opacity: 1,
      },
      text: { ...lightText, primary: '#FFFFFF', secondary: '#E8DCFF' },
      web: {
        cursor: 'pointer',
        boxShadow: '0 1px 4px rgba(91,33,182,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
      },
    },
    disabled: {
      native: {
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderColor: 'rgba(200,190,230,0.20)',
        borderWidth: 1,
        borderRadius: radii.lg,
        opacity: 0.55,
      },
      text: {
        primary: 'rgba(26,21,40,0.45)',
        secondary: 'rgba(74,61,107,0.45)',
        muted: 'rgba(91,106,125,0.45)',
        onAccent: 'rgba(255,255,255,0.5)',
      },
      web: { cursor: 'not-allowed' },
    },
  },

  // ── L4: Elevated Surfaces ───────────────────────────────────────
  L4: {
    base: L4Base,
    hover: {
      native: {
        backgroundColor: 'rgba(255,255,255,0.92)',
        borderColor: 'rgba(200,190,230,0.40)',
        borderWidth: 1,
        borderRadius: radii.md,
        opacity: 1,
      },
      text: lightText,
      web: {
        boxShadow:
          '0 4px 16px rgba(139,92,246,0.08), 0 0 0 1px rgba(255,255,255,0.65)',
      },
    },
    active: withOverrides(L4Base, {
      native: {
        backgroundColor: 'rgba(139,92,246,0.08)',
        borderColor: 'rgba(139,92,246,0.20)',
      },
    }),
    focused: withOverrides(L4Base, {
      native: { borderColor: '#7C3AED' },
      web: { boxShadow: '0 0 0 2px rgba(124,58,237,0.30)' },
    }),
    pressed: withOverrides(L4Base, {
      native: { backgroundColor: 'rgba(139,92,246,0.12)' },
    }),
    disabled: withOverrides(L4Base, {
      native: { opacity: 0.5 },
      web: { cursor: 'not-allowed' },
    }),
  },

  // ── Semantic Colors ─────────────────────────────────────────────
  // Darker, saturated variants for contrast on white glass surfaces.
  semantic: {
    accentPrimary: '#7C3AED',
    accentSecondary: '#DB2777',
    accentTertiary: '#0891B2',
    success: '#059669',
    warning: '#D97706',
    danger: '#DC2626',
    info: '#2563EB',
    purple: '#7C3AED',
    cyan: '#0891B2',
    lightCyan: '#0E7490',
    cyanStrong: '#065F73',
    magenta: '#C026D3',
    blue: '#2563EB',
    green: '#16A34A',
    glowPurple: '#8B5CF6',
    glowCyan: '#06B6D4',
  },

  // ── Special Surfaces ────────────────────────────────────────────
  special: {
    statusSuccess: { bg: 'rgba(5,150,105,0.10)', border: 'rgba(5,150,105,0.30)', text: '#059669' },
    statusWarning: { bg: 'rgba(217,119,6,0.10)', border: 'rgba(217,119,6,0.30)', text: '#D97706' },
    statusDanger: { bg: 'rgba(220,38,38,0.10)', border: 'rgba(220,38,38,0.30)', text: '#DC2626' },
    statusInfo: { bg: 'rgba(37,99,235,0.10)', border: 'rgba(37,99,235,0.30)', text: '#2563EB' },
    pqcBadge: {
      bg: 'rgba(124,58,237,0.10)',
      border: 'rgba(124,58,237,0.28)',
      text: '#7C3AED',
      dot: '#16A34A',
    },
    activeBeam: {
      bg: 'rgba(8,145,178,0.88)',
      glow: '0 0 14px rgba(8,145,178,0.50), 0 0 24px rgba(8,145,178,0.25)',
    },
    divider: 'rgba(0,0,0,0.06)',
    edgeGlow: 'rgba(139,92,246,0.10)',
    dangerButton: {
      bg: 'rgba(220,38,38,0.08)',
      bgHover: 'rgba(220,38,38,0.14)',
      border: 'rgba(220,38,38,0.22)',
      borderHover: 'rgba(220,38,38,0.40)',
      text: '#DC2626',
      glowHover: '0 0 12px rgba(220,38,38,0.12)',
    },
  },
};
