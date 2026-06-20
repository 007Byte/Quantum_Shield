/**
 * USBVault Theme — Public API
 *
 * Primary exports: layer-based engine (useTheme, resolveLayerStyle, etc.)
 * Legacy exports: colors, typography, spacing (for gradual migration)
 */

// ── New Layer-Based Engine (preferred) ──────────────────────────────
export {
  useTheme,
  getTheme,
  theme,
  resolveLayerStyle,
  resolveLayerStyleWith,
  layerPressable,
  textColors,
} from './engine';

// ── Design Tokens ──────────────────────────────────────────────────
export { spacing } from './spacing';
export type { SpacingKey } from './spacing';
export { typography } from './typography';
export { radii, timing, zIndex, layout } from './tokens';

// ── Theme Definitions (for advanced use) ───────────────────────────
export { darkTheme } from './dark';
export { lightTheme } from './light';
export type { ThemeDefinition, LayerStateStyle, Layer, TextColors } from './layers.types';

// ── Legacy Compatibility (deprecated — migrate to useTheme) ────────
export { colors } from './colors';
export { dashboardColorsCompat, lightGlassCompat, colorsCompat } from './compat';
