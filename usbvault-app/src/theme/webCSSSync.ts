/**
 * Web CSS Theme Sync
 *
 * React Native Web's StyleSheet.create() captures color values once at module
 * load time. When the user toggles themes, backgrounds update (via isLight
 * conditionals), but text colors remain frozen as the original theme's values.
 *
 * This module fixes that by scanning RNW's generated atomic CSS classes,
 * finding any that match the *wrong* theme's text colors, and injecting
 * !important overrides with the correct colors.
 *
 * Enhanced with:
 *   - Hex-to-rgb normalization (handles browsers that keep hex format)
 *   - Border color overrides
 *   - Broader CSS property scanning
 *   - Comprehensive color mapping tables
 *
 * @module theme/webCSSSync
 */

import { Platform } from 'react-native';
import type { ColorScheme } from '@/stores/themeStore';

// ── Color Normalization ──────────────────────────────────────────
// Browsers may report CSS colors as rgb(), rgba(), or hex.
// We normalize everything to a canonical form for matching.

function hexToRgb(hex: string): string | null {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) {
    return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
  }
  return null;
}

/**
 * Normalize a CSS color value to a canonical form we can look up.
 * Handles: rgb(), rgba(), #RRGGBB.
 */
function normalizeColor(raw: string): string {
  const trimmed = raw.trim();
  // Already rgb()/rgba() — normalize spacing
  if (trimmed.startsWith('rgb')) {
    return trimmed.replace(/\s+/g, ' ');
  }
  // Hex → rgb
  const rgb = hexToRgb(trimmed);
  if (rgb) return rgb;
  return trimmed;
}

// ── Color mapping tables ──────────────────────────────────────────
// Format: { [wrongColor]: correctColor }
// Keys are CSS rgb()/rgba() strings as browsers report them.

const DARK_MODE_OVERRIDES: Record<string, string> = {
  // When stylesheets captured LIGHT-mode values but we're now in DARK mode:

  // ── Primary / secondary text ──
  'rgb(26, 21, 40)': '#F5F3FF', // lightText.primary (#1A1528)
  'rgb(30, 26, 45)': '#F5F3FF', // dashboardColors.textPrimary (#1E1A2D)
  'rgb(74, 61, 107)': '#B7B2D9', // lightText.secondary (#4A3D6B)
  'rgb(107, 97, 137)': '#B7B2D9', // dashboardColors.textSecondary (#6B6189)
  'rgb(100, 116, 139)': '#8893A7', // colors.textMuted (#64748B in light → dark #8893A7)
  'rgb(148, 163, 184)': '#8893A7', // colors.textMuted (#94A3B8 in light → dark #8893A7)
  'rgb(91, 106, 125)': '#8893A7', // new light muted #5B6A7D → dark muted #8893A7
  'rgb(74, 69, 96)': '#B7B2D9', // light-mode description text (#4A4560)
  'rgb(90, 85, 128)': '#B7B2D9', // light-mode chart labels (#5A5580)
  'rgb(45, 40, 69)': '#F5F3FF', // #2D2845 → near-white
  'rgb(58, 53, 85)': 'rgba(255,255,255,0.7)', // #3A3555 → white 70%
  'rgb(90, 85, 117)': 'rgba(255,255,255,0.5)', // #5A5575 → white 50%
  'rgb(107, 101, 137)': 'rgba(255,255,255,0.4)', // #6B6589 → white 40%
  'rgb(122, 117, 154)': 'rgba(255,255,255,0.35)', // #7A759A → white 35%
  'rgb(138, 133, 165)': 'rgba(255,255,255,0.3)', // #8A85A5 → white 30%

  // ── Cyan / teal — darkened versions back to bright ──
  'rgb(8, 145, 178)': '#22D3EE', // #0891B2 → bright cyan
  'rgb(14, 116, 144)': '#67E8F9', // #0E7490 → light cyan
  'rgb(6, 95, 115)': '#22D3EE', // #065F73 → bright cyan (light cyanStrong)
  'rgb(3, 105, 161)': '#67E8F9', // #0369A1 → light cyan (light lightCyan)

  // ── Greens ──
  'rgb(5, 150, 105)': '#10B981', // #059669 → success green
  'rgb(22, 163, 74)': '#22C55E', // #16A34A → green

  // ── Blues ──
  'rgb(59, 130, 246)': '#60A5FA', // #3B82F6 → blue

  // ── Purples ──
  'rgb(124, 58, 237)': '#A855F7', // #7C3AED → glowPurple (light accentPrimary)

  // ── Light borders → dark borders ──
  'rgba(200, 190, 230, 0.35)': 'rgba(139,92,246,0.28)', // light L2 border → dark L2 border
  'rgba(200, 190, 230, 0.40)': 'rgba(139,92,246,0.40)', // light L3 border → dark L3 border
  'rgba(200, 190, 230, 0.30)': 'rgba(139,92,246,0.20)', // light border → dark border
};

const LIGHT_MODE_OVERRIDES: Record<string, string> = {
  // When stylesheets captured DARK-mode values but we're now in LIGHT mode:

  // ── Primary text (white / near-white → dark) ──
  'rgb(245, 243, 255)': '#1A1528', // darkText.primary (#F5F3FF → light primary)
  'rgb(255, 255, 255)': '#1A1528', // colors.textPrimary / pure white text
  'rgb(241, 245, 249)': '#1A1528', // EmptyState title (#F1F5F9)

  // ── Semi-transparent white text → graduated dark shades ──
  'rgba(255, 255, 255, 0.9)': '#1A1528', // near-opaque white → primary dark
  'rgba(255, 255, 255, 0.8)': '#2D2845', // strong white → dark purple-gray
  'rgba(255, 255, 255, 0.75)': '#3A3555',
  'rgba(255, 255, 255, 0.7)': '#3A3555', // algorithm descriptions
  'rgba(255, 255, 255, 0.65)': '#4A4560',
  'rgba(255, 255, 255, 0.6)': '#4A4560', // mid-opacity white
  'rgba(255, 255, 255, 0.55)': '#4A3D6B', // just above muted
  'rgba(255, 255, 255, 0.5)': '#4A3D6B', // descriptions (XChaCha20, ML-KEM)
  'rgba(255, 255, 255, 0.4)': '#5B6A7D', // lighter descriptions → light muted
  'rgba(255, 255, 255, 0.35)': '#5B6A7D', // faint labels
  'rgba(255, 255, 255, 0.3)': '#5B6A7D', // very faint text
  'rgba(255, 255, 255, 0.25)': '#6B6589', // extremely faint → still readable
  'rgba(255, 255, 255, 0.2)': '#6B6589',
  'rgba(255, 255, 255, 0.15)': '#8893A7', // ghost-level → muted but visible

  // ── Secondary / muted text ──
  'rgb(183, 178, 217)': '#4A3D6B', // darkText.secondary (#B7B2D9 → light secondary)
  'rgb(184, 179, 209)': '#4A3D6B', // radar chart labels (#B8B3D1)
  'rgb(148, 163, 184)': '#5B6A7D', // colors.textMuted (#94A3B8 in dark → light muted)
  'rgb(100, 116, 139)': '#5B6A7D', // colors.textMuted (#64748B in dark → light muted)
  'rgb(136, 147, 167)': '#5B6A7D', // new dark muted #8893A7 → light muted #5B6A7D
  'rgba(200, 196, 222, 0.88)': '#4A4560', // section headers: FILES, VAULT, USB

  // ── Cyan / teal — too bright on light backgrounds ──
  'rgb(34, 211, 238)': '#0891B2', // cyan badges (#22D3EE)
  'rgba(34, 211, 238, 0.8)': '#0891B2', // "Cipher", "Auth", "Integrity" labels
  'rgb(103, 232, 249)': '#0E7490', // lightCyan (#67E8F9)
  'rgb(6, 182, 212)': '#0891B2', // cyanStrong (#06B6D4)

  // ── Greens — too bright / washed out on light ──
  'rgb(134, 239, 172)': '#059669', // "Good" status text (#86EFAC)
  'rgb(110, 231, 183)': '#059669', // light green (#6EE7B7)
  'rgb(52, 211, 153)': '#059669', // active green (#34D399)
  'rgb(34, 197, 94)': '#16A34A', // green (#22C55E)
  'rgb(16, 185, 129)': '#059669', // success (#10B981)

  // ── Blues — slightly too bright ──
  'rgb(96, 165, 250)': '#3B82F6', // blue (#60A5FA)
  'rgb(129, 140, 248)': '#6366F1', // indigo (#818CF8)

  // ── Purples — glows too faint on light ──
  'rgb(168, 85, 247)': '#7C3AED', // glowPurple (#A855F7) → standard purple
  'rgb(139, 92, 246)': '#6D28D9', // medium purple (#8B5CF6)

  // ── Reds — adjust for light bg ──
  'rgb(239, 68, 68)': '#DC2626', // red (#EF4444)

  // ── Yellows/Ambers ──
  'rgb(251, 191, 36)': '#D97706', // yellow (#FBBF24)
  'rgb(244, 114, 182)': '#DB2777', // pink (#F472B6)

  // ── Dark borders → light borders ──
  'rgb(45, 38, 69)': 'rgba(200,190,230,0.35)',   // colors.border #2D2645
  'rgb(61, 53, 81)': 'rgba(200,190,230,0.30)',   // colors.borderLight #3D3551
  'rgb(61, 44, 94)': 'rgba(139,92,246,0.15)',    // colors.borderAccent #3D2C5E
};

// Background color overrides for cards/panels that freeze with the wrong theme
const DARK_BG_OVERRIDES: Record<string, string> = {
  // High-opacity white glass (new light theme) → dark glass
  'rgba(255, 255, 255, 0.98)': 'rgba(8,5,20,0.98)',
  'rgba(255, 255, 255, 0.95)': 'rgba(8,5,20,0.95)',
  'rgba(255, 255, 255, 0.92)': 'rgba(48,34,90,0.95)',
  'rgba(255, 255, 255, 0.9)': 'rgba(8,5,20,0.9)',
  'rgba(255, 255, 255, 0.88)': 'rgba(48,34,90,0.95)',
  'rgba(255, 255, 255, 0.85)': 'rgba(48,34,90,0.92)',
  'rgba(255, 255, 255, 0.82)': 'rgba(8,5,20,0.8)',
  'rgba(255, 255, 255, 0.8)': 'rgba(14,10,34,0.74)',
  'rgba(255, 255, 255, 0.78)': 'rgba(8,5,20,0.75)',
  'rgba(255, 255, 255, 0.72)': 'rgba(8,5,20,0.7)',
  'rgba(255, 255, 255, 0.70)': 'rgba(8,5,20,0.68)',
  'rgba(255, 255, 255, 0.65)': 'rgba(18,12,40,0.65)',
  'rgba(255, 255, 255, 0.6)': 'rgba(8,5,20,0.6)',
  'rgba(255, 255, 255, 0.58)': 'rgba(52,38,98,0.58)',
  'rgba(255, 255, 255, 0.55)': 'rgba(8,5,20,0.55)',
  'rgba(255, 255, 255, 0.5)': 'rgba(52,38,98,0.58)',
  'rgba(255, 255, 255, 0.50)': 'rgba(52,38,98,0.58)',
  'rgba(255, 255, 255, 0.48)': 'rgba(45,32,88,0.52)',
  'rgba(255, 255, 255, 0.45)': 'rgba(139,92,246,0.15)',
  'rgba(255, 255, 255, 0.42)': 'rgba(45,32,88,0.52)',
  'rgba(255, 255, 255, 0.40)': 'rgba(139,92,246,0.15)',
  'rgba(255, 255, 255, 0.38)': 'rgba(8,5,20,0.38)',
  'rgba(255, 255, 255, 0.35)': 'rgba(8,5,20,0.3)',
  'rgba(255, 255, 255, 0.25)': 'rgba(139,92,246,0.12)',
  'rgba(255, 255, 255, 0.04)': 'rgba(8,5,20,0.55)',
  'rgba(255, 255, 255, 0.08)': 'rgba(8,5,20,0.6)',
  // Solid light backgrounds → dark equivalents
  'rgb(255, 255, 255)': '#1A0F3A',
  'rgb(248, 247, 252)': '#0F0B1E',
  'rgb(243, 239, 248)': '#120A26',
  'rgb(240, 236, 245)': '#251D40',
  'rgb(237, 232, 245)': '#110D22',
};

const LIGHT_BG_OVERRIDES: Record<string, string> = {
  // Dark glass backgrounds → visible light glass
  'rgba(18, 12, 40, 0.65)': 'rgba(255,255,255,0.50)',
  'rgba(18, 12, 40, 0.8)': 'rgba(255,255,255,0.60)',
  'rgba(14, 10, 34, 0.74)': 'rgba(255,255,255,0.55)',
  'rgb(26, 15, 58)': 'rgba(255,255,255,0.88)',
  'rgb(18, 10, 38)': 'rgba(255,255,255,0.50)',
  'rgb(11, 6, 23)': 'rgba(255,255,255,0.42)',
  'rgb(15, 11, 30)': 'rgba(255,255,255,0.45)',
  'rgb(26, 21, 48)': 'rgba(255,255,255,0.55)',
  'rgb(37, 29, 64)': 'rgba(255,255,255,0.50)',
  'rgb(8, 5, 20)': 'rgba(255,255,255,0.42)',
  'rgba(8, 5, 20, 0.98)': 'rgba(255,255,255,0.92)',
  'rgba(8, 5, 20, 0.95)': 'rgba(255,255,255,0.88)',
  'rgba(8, 5, 20, 0.9)': 'rgba(255,255,255,0.82)',
  'rgba(8, 5, 20, 0.8)': 'rgba(255,255,255,0.70)',
  'rgba(8, 5, 20, 0.75)': 'rgba(255,255,255,0.65)',
  'rgba(8, 5, 20, 0.7)': 'rgba(255,255,255,0.60)',
  'rgba(8, 5, 20, 0.6)': 'rgba(255,255,255,0.55)',
  'rgba(8, 5, 20, 0.55)': 'rgba(255,255,255,0.50)',
  'rgba(8, 5, 20, 0.5)': 'rgba(255,255,255,0.45)',
  'rgba(8, 5, 20, 0.4)': 'rgba(255,255,255,0.40)',
  'rgba(8, 5, 20, 0.38)': 'rgba(255,255,255,0.38)',
  'rgba(8, 5, 20, 0.3)': 'rgba(255,255,255,0.35)',
  'rgb(18, 18, 18)': 'rgba(255,255,255,0.50)',
  // Dark purple/accent glass → light glass equivalents
  'rgba(139, 92, 246, 0.15)': 'rgba(255,255,255,0.45)',
  'rgba(52, 38, 98, 0.58)': 'rgba(255,255,255,0.50)',
  'rgba(45, 32, 88, 0.52)': 'rgba(255,255,255,0.42)',
  'rgba(48, 34, 90, 0.95)': 'rgba(255,255,255,0.88)',
  // L0 dark bg → L0 light bg
  'rgb(17, 13, 34)': '#EDE8F5',
  // Legacy colors.ts dark backgrounds → light glass equivalents
  'rgb(19, 15, 36)': 'rgba(255,255,255,0.50)',   // colors.bgInput #130F24
  // rgb(26, 21, 48) (colors.bgSecondary) and rgb(37, 29, 64) (colors.bgTertiary)
  // already mapped above (same target values).
  'rgb(45, 38, 69)': 'rgba(200,190,230,0.35)',   // colors.border #2D2645 / colors.bgHover (as bg)
  'rgb(61, 53, 81)': 'rgba(200,190,230,0.30)',   // colors.borderLight #3D3551 (as bg)
  'rgb(61, 44, 94)': 'rgba(139,92,246,0.15)',    // colors.borderAccent #3D2C5E (as bg)
};

const STYLE_ID = 'usbvault-theme-text-sync';

// ── CSS properties to scan ──────────────────────────────────────
// RNW generates atomic classes with these patterns for different properties.
const COLOR_PROPERTY_PREFIXES = [
  { prefix: '.r-color-', property: 'color', type: 'text' },
  { prefix: '.r-borderColor-', property: 'borderColor', type: 'border' },
  { prefix: '.r-borderTopColor-', property: 'borderTopColor', type: 'border' },
  { prefix: '.r-borderBottomColor-', property: 'borderBottomColor', type: 'border' },
  { prefix: '.r-borderLeftColor-', property: 'borderLeftColor', type: 'border' },
  { prefix: '.r-borderRightColor-', property: 'borderRightColor', type: 'border' },
];

const BG_PROPERTY_PREFIXES = [{ prefix: '.r-backgroundColor-', property: 'backgroundColor' }];

/**
 * Set the data-theme attribute on <html> immediately.
 * CSS attribute selectors ([data-theme="light"]) activate as soon as this runs.
 * Separated from syncThemeCSS() so it can fire before React's render completes.
 */
export function setThemeAttribute(scheme: ColorScheme): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', scheme);
}

/**
 * Scan all RNW-generated atomic CSS classes in the document's stylesheets
 * and inject !important overrides to correct any stale colors that were
 * captured by StyleSheet.create() under the wrong theme.
 *
 * IMPORTANT: Call this AFTER React has flushed its render (e.g. via double-rAF)
 * so the scanner finds the NEW theme's color values, not the old ones.
 */
export function syncThemeCSS(scheme: ColorScheme): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  // Ensure attribute is set (idempotent — may already be set by setThemeAttribute)
  document.documentElement.setAttribute('data-theme', scheme);

  const colorMap = scheme === 'dark' ? DARK_MODE_OVERRIDES : LIGHT_MODE_OVERRIDES;
  const bgMap = scheme === 'dark' ? DARK_BG_OVERRIDES : LIGHT_BG_OVERRIDES;
  const overrides: string[] = [];

  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        const sr = rule as CSSStyleRule;
        if (!sr.selectorText || !sr.style) continue;

        // ── Text and border color overrides ──
        for (const { prefix, property, type } of COLOR_PROPERTY_PREFIXES) {
          if (sr.selectorText.startsWith(prefix)) {
            const rawValue = sr.style.getPropertyValue(property) || (sr.style as any)[property];
            if (rawValue) {
              const normalized = normalizeColor(rawValue);
              const correctColor = colorMap[normalized];
              if (correctColor) {
                const cssProp =
                  type === 'text' ? 'color' : property.replace(/([A-Z])/g, '-$1').toLowerCase();
                overrides.push(`${sr.selectorText} { ${cssProp}: ${correctColor} !important; }`);
              }
            }
          }
        }

        // ── Background color overrides ──
        for (const { prefix, property } of BG_PROPERTY_PREFIXES) {
          if (sr.selectorText.startsWith(prefix)) {
            const rawValue = sr.style.getPropertyValue(property) || sr.style.backgroundColor;
            if (rawValue) {
              const normalized = normalizeColor(rawValue);
              const correctBg = bgMap[normalized];
              if (correctBg) {
                overrides.push(`${sr.selectorText} { background-color: ${correctBg} !important; }`);
              }
            }
          }
        }
      }
    } catch {
      // Cross-origin stylesheet — skip
    }
  }

  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = overrides.join('\n');
}

/**
 * Run initial CSS sync after the first render cycle.
 * Uses triple-rAF to ensure RNW has fully flushed atomic CSS classes.
 */
export function initWebCSSSync(getScheme: () => ColorScheme): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;

  const run = () => syncThemeCSS(getScheme());
  if (typeof requestAnimationFrame !== 'undefined') {
    // Triple-rAF: ensure all RNW atomic classes are flushed before scanning
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(run)));
  } else {
    setTimeout(run, 150);
  }
}
