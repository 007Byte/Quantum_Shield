import { Platform, ViewStyle, TextStyle, ImageStyle } from 'react-native';

/**
 * Web-only CSS properties that React Native Web supports but
 * React Native's TypeScript definitions don't include.
 *
 * Using this helper instead of per-line @ts-ignore gives us:
 *  - Autocomplete for known web properties
 *  - A single point to update if RN types ever add these
 *  - Zero runtime cost on native (returns empty object)
 */

export interface WebOnlyStyles {
  // Backgrounds & filters
  background?: string;
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
  filter?: string;

  // Shadows & glows
  boxShadow?: string;
  textShadow?: string;

  // Transitions & animations
  transition?: string;
  animation?: string;

  // Pointer & cursor
  cursor?: string;
  pointerEvents?: string;
  userSelect?: string;
  WebkitUserSelect?: string;

  // Layout
  overflow?: string;
  mixBlendMode?: string;
  clipPath?: string;
  WebkitClipPath?: string;
  position?: string;
  top?: number | string;
  bottom?: number | string;
  left?: number | string;
  right?: number | string;
  minHeight?: number | string;
  flex?: number;
  transform?: string;
  justifyContent?: string;
  alignItems?: string;
  flexDirection?: string;

  // Text
  WebkitBackgroundClip?: string;
  WebkitTextFillColor?: string;
  backgroundClip?: string;
  textOverflow?: string;
  whiteSpace?: string;
  wordBreak?: string;

  // Form inputs
  outlineWidth?: number;

  // Other
  appearance?: string;
  outline?: string;
  resize?: string;
  scrollbarWidth?: string;
  overflowY?: string;
  overflowX?: string;
  zIndex?: number;
}

type RNStyle = ViewStyle | TextStyle | ImageStyle;

/**
 * Merge standard RN styles with web-only CSS properties.
 * On native platforms the web properties are silently dropped.
 *
 * @example
 * const styles = StyleSheet.create({
 *   card: webStyle(
 *     { borderRadius: 12, padding: 16 },
 *     { backdropFilter: 'blur(18px)', boxShadow: '0 0 20px rgba(0,0,0,0.3)' }
 *   ),
 * });
 */
export function webStyle<T extends RNStyle>(base: T, web: WebOnlyStyles): T {
  if (Platform.OS !== 'web') return base;
  return { ...base, ...web } as T;
}

/**
 * Returns web-only styles as a plain object (useful for inline styles).
 * Returns an empty object on native platforms.
 *
 * @example
 * <View style={[styles.panel, webOnly({ boxShadow: '0 0 10px purple' })]} />
 */
export function webOnly(web: WebOnlyStyles): Record<string, unknown> {
  if (Platform.OS !== 'web') return {};
  return web as Record<string, unknown>;
}
