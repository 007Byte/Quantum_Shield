/**
 * Style utilities for React Native + Web.
 *
 * Eliminates the `[...styles] as any` pattern by providing typed helpers
 * for conditional style arrays.
 */

import type { ViewStyle, TextStyle, ImageStyle } from 'react-native';

type StyleValue = ViewStyle | TextStyle | ImageStyle | false | null | undefined;

/**
 * Merge an array of conditional styles into a single flat style object.
 * Filters out falsy values (false, null, undefined) so you can write:
 *
 * @example
 * style={mergeStyles([
 *   styles.base,
 *   isActive && styles.active,
 *   isHovered && styles.hovered,
 * ])}
 */
export function mergeStyles(styles: StyleValue[]): ViewStyle {
  return Object.assign({}, ...styles.filter(Boolean)) as ViewStyle;
}
