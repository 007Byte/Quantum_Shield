/**
 * USBVault Theme Engine
 *
 * Runtime entry point for the layer-based theme system.
 * Provides:
 *   - useTheme()          — React hook for components
 *   - theme               — Proxy accessor for non-React contexts
 *   - resolveLayerStyle() — Merge native + web into flat ViewStyle
 *   - layerPressable()    — Auto-handles hover/pressed/focused/active/disabled
 *   - textColors()        — Get text colors for a layer state
 */

import type { ViewStyle } from 'react-native';
import { useThemeStore } from '@/stores/themeStore';
import { darkTheme } from './dark';
import { lightTheme } from './light';
import { webOnly } from '@/utils/webStyle';
import type { ThemeDefinition, LayerStateStyle, Layer, TextColors } from './layers.types';

// ── Core Accessor ────────────────────────────────────────────────────

/** Get the current active theme definition (reads from Zustand store) */
export function getTheme(): ThemeDefinition {
  const scheme = useThemeStore.getState().colorScheme;
  return scheme === 'light' ? lightTheme : darkTheme;
}

// ── Proxy-Backed Accessor (non-React contexts) ──────────────────────
// Same pattern as the existing dashboardColors Proxy, but exposes the
// entire theme tree. Works for StyleSheet.create() and module-scope code.

export const theme = new Proxy({} as ThemeDefinition, {
  get(_target, prop: string) {
    return getTheme()[prop as keyof ThemeDefinition];
  },
});

// ── React Hook ───────────────────────────────────────────────────────

/**
 * Subscribe to theme changes. Returns the full theme + toggle function.
 *
 * @example
 * const { theme, colorScheme, toggleTheme } = useTheme();
 * <View style={resolveLayerStyle(theme.L2.base)} />
 */
export function useTheme() {
  const colorScheme = useThemeStore(s => s.colorScheme);
  const toggleTheme = useThemeStore(s => s.toggleTheme);
  const activeTheme = colorScheme === 'light' ? lightTheme : darkTheme;
  return { theme: activeTheme, colorScheme, toggleTheme } as const;
}

// ── Style Resolvers ──────────────────────────────────────────────────

/**
 * Resolve a layer+state into a flat ViewStyle.
 * Merges native properties with web-only CSS properties (empty on native).
 *
 * @example
 * <View style={resolveLayerStyle(theme.L2.base)} />
 */
export function resolveLayerStyle(state: LayerStateStyle): ViewStyle {
  return {
    ...state.native,
    ...webOnly(state.web),
  } as ViewStyle;
}

/**
 * Resolve a layer+state, merging with additional style overrides.
 *
 * @example
 * <View style={resolveLayerStyleWith(theme.L2.base, { padding: 16, gap: 8 })} />
 */
export function resolveLayerStyleWith(state: LayerStateStyle, overrides: ViewStyle): ViewStyle {
  return {
    ...state.native,
    ...webOnly(state.web),
    ...overrides,
  } as ViewStyle;
}

// ── Pressable Helper ─────────────────────────────────────────────────

interface PressableState {
  pressed?: boolean;
  hovered?: boolean;
  focused?: boolean;
}

interface LayerPressableOptions {
  /** Whether this element is currently active/selected */
  active?: boolean;
  /** Whether this element is disabled */
  disabled?: boolean;
  /** Additional styles to merge on top of the resolved layer style */
  style?: ViewStyle;
}

/**
 * Returns a Pressable style callback that automatically selects
 * the correct layer state based on interaction.
 *
 * Priority order: disabled > pressed > active > hovered > focused > base
 *
 * @example
 * <Pressable style={layerPressable(theme.L3)} />
 * <Pressable style={layerPressable(theme.L3, { active: isSelected })} />
 * <Pressable style={layerPressable(theme.L3, { disabled: true, style: { padding: 12 } })} />
 */
export function layerPressable(layer: Layer, options?: LayerPressableOptions) {
  return (pressableState: PressableState): ViewStyle => {
    let state: LayerStateStyle;

    if (options?.disabled) {
      state = layer.disabled;
    } else if (pressableState.pressed) {
      state = layer.pressed;
    } else if (options?.active) {
      state = layer.active;
    } else if (pressableState.hovered) {
      state = layer.hover;
    } else if (pressableState.focused) {
      state = layer.focused;
    } else {
      state = layer.base;
    }

    const resolved = resolveLayerStyle(state);
    return options?.style ? { ...resolved, ...options.style } : resolved;
  };
}

// ── Text Color Helper ────────────────────────────────────────────────

/**
 * Get the text colors for a given layer state.
 *
 * @example
 * const colors = textColors(theme.L2.base);
 * <Text style={{ color: colors.primary }}>Title</Text>
 * <Text style={{ color: colors.secondary }}>Subtitle</Text>
 */
export function textColors(state: LayerStateStyle): TextColors {
  return state.text;
}
