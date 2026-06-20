/**
 * USBVault Dark Theme — Complete Definition
 *
 * Every visual value for dark mode lives here.
 * All values extracted from the existing codebase:
 *   - darkDashboardColors (dashboard2/styles.ts)
 *   - darkColors (theme/colors.ts)
 *   - Static glass/glow exports (dashboard2/styles.ts)
 *   - Sidebar/TopBar/Footer dark StyleSheet values
 *   - settings/styles.ts dark StyleSheet values
 */

import type { ThemeDefinition, LayerStateStyle } from './layers.types';
import { radii, timing } from './tokens';

// ── Helpers ──────────────────────────────────────────────────────────

const darkText = {
  primary: '#F5F3FF',
  secondary: '#B7B2D9',
  muted: '#8893A7', // ↑ raised from #64748B → 6.2:1 on L0 (was 3.45:1, failed AA)
  onAccent: '#FFFFFF',
};

/** Reuse a base state with minor overrides */
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

const L0Base: LayerStateStyle = {
  native: {
    backgroundColor: '#110D22',
    borderColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
  },
  text: darkText,
  web: {},
};

// ── L1: Shell Chrome (Sidebar, TopBar, Footer) ──────────────────────

const L1Base: LayerStateStyle = {
  native: {
    backgroundColor: 'rgba(45,32,88,0.52)',
    borderColor: 'rgba(139,92,246,0.42)',
    borderWidth: 1,
    borderRadius: radii['3xl'],
    opacity: 1,
  },
  text: darkText,
  web: {
    background:
      'linear-gradient(180deg, rgba(55,38,100,0.48) 0%, rgba(45,32,88,0.52) 56%, rgba(45,32,88,0.56) 100%)',
    backdropFilter: 'blur(18px)',
    boxShadow:
      '0 0 0 1px rgba(139,92,246,0.26), 0 0 24px rgba(139,92,246,0.3), 0 0 58px rgba(34,211,238,0.14), inset 0 0 38px rgba(96,165,250,0.08)',
    transition: timing.interactive,
  },
};

// ── L2: Content Surfaces (Cards, Panels, Sections) ──────────────────

const L2Base: LayerStateStyle = {
  native: {
    backgroundColor: 'rgba(52,38,98,0.58)',
    borderColor: 'rgba(139,92,246,0.28)',
    borderWidth: 1,
    borderRadius: radii['2xl'],
    opacity: 1,
  },
  text: darkText,
  web: {
    backdropFilter: 'blur(18px)',
    boxShadow:
      '0 8px 32px rgba(117,60,255,0.15), 0 0 20px rgba(139,92,246,0.15), inset 0 1px 0 rgba(245,243,255,0.14), inset 0 1px 0 rgba(255,255,255,0.12)',
  },
};

// ── L3: Interactive Controls (Buttons, Inputs, Pills, Nav Items) ────

const L3Base: LayerStateStyle = {
  native: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderColor: 'rgba(139,92,246,0.4)',
    borderWidth: 1,
    borderRadius: radii.lg,
    opacity: 1,
  },
  text: darkText,
  web: {
    cursor: 'pointer',
    transition: timing.normal,
  },
};

// ── L4: Elevated Surfaces (Dropdowns, Modals, Tooltips) ─────────────

const L4Base: LayerStateStyle = {
  native: {
    backgroundColor: 'rgba(48,34,90,0.95)',
    borderColor: 'rgba(139,92,246,0.4)',
    borderWidth: 1,
    borderRadius: radii.lg,
    opacity: 1,
  },
  text: darkText,
  web: {
    backdropFilter: 'blur(24px)',
    boxShadow:
      '0 12px 40px rgba(0,0,0,0.6), 0 0 24px rgba(139,92,246,0.25), 0 0 1px rgba(139,92,246,0.5)',
  },
};

// ── Theme Export ─────────────────────────────────────────────────────

export const darkTheme: ThemeDefinition = {
  name: 'dark',

  cosmicGradient:
    'radial-gradient(circle at 40% 20%, rgba(139,92,246,0.28) 0%, rgba(17,13,34,0) 60%), radial-gradient(circle at 75% 35%, rgba(34,211,238,0.20) 0%, rgba(17,13,34,0) 60%), radial-gradient(circle at 24% 82%, rgba(168,85,247,0.18) 0%, rgba(17,13,34,0) 56%), linear-gradient(160deg, #0E0A1C 0%, #110D22 45%, #1E1444 78%, #0E0A1C 100%)',

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
    hover: L1Base,
    active: L1Base,
    focused: L1Base,
    pressed: L1Base,
    disabled: withOverrides(L1Base, { native: { opacity: 0.5 } }),
  },

  // ── L2: Content Surfaces ────────────────────────────────────────
  L2: {
    base: L2Base,
    hover: withOverrides(L2Base, {
      native: { borderColor: 'rgba(139,92,246,0.26)' },
      web: {
        transform: 'translateY(-2px)',
        backdropFilter: 'blur(18px)',
        boxShadow: '0 0 16px rgba(139,92,246,0.3), 0 0 24px rgba(34,211,238,0.1)',
      },
    }),
    active: withOverrides(L2Base, {
      native: {
        backgroundColor: 'rgba(58,42,105,0.62)',
        borderColor: 'rgba(139,92,246,0.20)',
      },
    }),
    focused: withOverrides(L2Base, {
      native: { borderColor: '#7C3AED' },
      web: { boxShadow: '0 0 0 2px rgba(124,58,237,0.5)' },
    }),
    pressed: withOverrides(L2Base, {
      native: { backgroundColor: 'rgba(58,42,105,0.62)' },
    }),
    disabled: withOverrides(L2Base, {
      native: { opacity: 0.5 },
      text: {
        primary: 'rgba(245,243,255,0.5)',
        secondary: 'rgba(183,178,217,0.5)',
        muted: 'rgba(100,116,139,0.5)',
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
        backgroundColor: 'rgba(139,92,246,0.3)',
        borderColor: 'rgba(34,211,238,0.5)',
        borderWidth: 1,
        borderRadius: radii.lg,
        opacity: 1,
      },
      text: darkText,
      web: {
        cursor: 'pointer',
        transition: timing.normal,
        boxShadow: '0 0 16px rgba(139,92,246,0.3), 0 0 24px rgba(34,211,238,0.1)',
      },
    },
    active: {
      native: {
        backgroundColor: 'rgba(89,59,212,0.4)',
        borderColor: 'rgba(139,92,246,0.35)',
        borderWidth: 1,
        borderRadius: radii.lg,
        opacity: 1,
      },
      text: darkText,
      web: {
        background: 'linear-gradient(90deg, rgba(124,58,237,0.68) 0%, rgba(34,211,238,0.4) 100%)',
        boxShadow:
          '0 0 20px rgba(139,92,246,0.48), 0 0 38px rgba(34,211,238,0.26), inset 0 1px 0 rgba(245,243,255,0.1), inset 0 0 18px rgba(245,243,255,0.06)',
      },
    },
    focused: withOverrides(L3Base, {
      native: { borderColor: '#7C3AED' },
      web: { boxShadow: '0 0 0 2px rgba(124,58,237,0.5)' },
    }),
    pressed: {
      native: {
        backgroundColor: '#6D28D9',
        borderColor: 'rgba(139,92,246,0.35)',
        borderWidth: 1,
        borderRadius: radii.lg,
        opacity: 1,
      },
      text: { ...darkText, primary: '#FFFFFF' },
      web: { cursor: 'pointer' },
    },
    disabled: {
      native: {
        backgroundColor: 'rgba(139,92,246,0.15)',
        borderColor: 'rgba(139,92,246,0.15)',
        borderWidth: 1,
        borderRadius: radii.lg,
        opacity: 0.5,
      },
      text: {
        primary: 'rgba(245,243,255,0.5)',
        secondary: 'rgba(183,178,217,0.5)',
        muted: 'rgba(100,116,139,0.5)',
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
        backgroundColor: 'rgba(139,92,246,0.18)',
        borderColor: 'rgba(139,92,246,0.4)',
        borderWidth: 0,
        borderRadius: radii.md,
        opacity: 1,
      },
      text: darkText,
      web: {
        boxShadow: '0 0 12px rgba(139,92,246,0.15)',
      },
    },
    active: withOverrides(L4Base, {
      native: { backgroundColor: 'rgba(139,92,246,0.15)' },
    }),
    focused: withOverrides(L4Base, {
      native: { borderColor: '#7C3AED' },
      web: { boxShadow: '0 0 0 2px rgba(124,58,237,0.5)' },
    }),
    pressed: withOverrides(L4Base, {
      native: { backgroundColor: 'rgba(139,92,246,0.25)' },
    }),
    disabled: withOverrides(L4Base, {
      native: { opacity: 0.5 },
      web: { cursor: 'not-allowed' },
    }),
  },

  // ── Semantic Colors ─────────────────────────────────────────────
  semantic: {
    accentPrimary: '#A78BFA', // ↑ raised from #7C3AED — needs contrast on dark glass panels
    accentSecondary: '#F472B6', // ↑ raised from #EC4899
    accentTertiary: '#22D3EE', // ↑ raised from #06B6D4
    success: '#34D399', // ↑ raised from #10B981
    warning: '#FBBF24', // ↑ raised from #F59E0B
    danger: '#F87171', // ↑ raised from #EF4444
    info: '#93C5FD', // ↑ raised from #60A5FA
    purple: '#B794F6', // ↑ raised from #8B5CF6 — main icon color, must pop on dark bg
    cyan: '#22D3EE',
    lightCyan: '#67E8F9',
    cyanStrong: '#22D3EE', // ↑ raised from #06B6D4
    magenta: '#E879F9', // ↑ raised from #C84FD8
    blue: '#93C5FD', // ↑ raised from #60A5FA
    green: '#4ADE80', // ↑ raised from #22C55E
    glowPurple: '#C084FC', // ↑ raised from #A855F7
    glowCyan: '#22D3EE', // ↑ raised from #06B6D4
  },

  // ── Special Surfaces ────────────────────────────────────────────
  special: {
    statusSuccess: { bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.4)', text: '#34D399' },
    statusWarning: { bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', text: '#FBBF24' },
    statusDanger: {
      bg: 'rgba(248,113,113,0.12)',
      border: 'rgba(248,113,113,0.3)',
      text: '#F87171',
    },
    statusInfo: { bg: 'rgba(147,197,253,0.12)', border: 'rgba(147,197,253,0.3)', text: '#93C5FD' },
    pqcBadge: {
      bg: 'rgba(52,211,153,0.12)',
      border: 'rgba(52,211,153,0.4)',
      text: '#34D399',
      dot: '#34D399',
    },
    activeBeam: {
      bg: 'rgba(34,211,238,0.88)',
      glow: '0 0 14px rgba(34,211,238,0.85), 0 0 24px rgba(34,211,238,0.48)',
    },
    divider: 'rgba(139,92,246,0.12)',
    edgeGlow: 'rgba(217,70,239,0.55)',
    dangerButton: {
      bg: 'rgba(255,107,107,0.08)',
      bgHover: 'rgba(255,107,107,0.18)',
      border: 'rgba(255,107,107,0.3)',
      borderHover: 'rgba(255,107,107,0.5)',
      text: '#FF6B6B',
      glowHover: '0 0 16px rgba(255,107,107,0.2)',
    },
  },
};
