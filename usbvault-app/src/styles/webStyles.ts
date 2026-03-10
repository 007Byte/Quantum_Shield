import { Platform, ViewStyle, TextStyle, ImageStyle } from 'react-native';

/** Web-only CSS properties supported by React Native Web but not in RN type definitions */
interface WebOnlyStyles {
  backdropFilter?: string;
  WebkitBackdropFilter?: string;
  mixBlendMode?: string;
  filter?: string;
  background?: string;
  boxShadow?: string;
  textShadow?: string;
  transition?: string;
  cursor?: string;
  userSelect?: string;
  pointerEvents?: string;
  overflow?: string;
}

// Type exports removed - use ViewStyle | TextStyle | ImageStyle directly with WebOnlyStyles for inline use
// Or extend specific component style types as needed

/** Create a platform-aware style: applies webOnly properties only on web */
export function webStyle<T extends ViewStyle | TextStyle | ImageStyle>(
  base: T,
  webOnly: WebOnlyStyles
): T {
  if (Platform.OS !== 'web') return base;
  return { ...base, ...webOnly } as T;
}
