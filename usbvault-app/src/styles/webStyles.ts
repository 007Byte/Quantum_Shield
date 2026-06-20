import { Platform, ViewStyle, TextStyle, ImageStyle } from 'react-native';

/**
 * Inject global focus-visible styles for web accessibility (WCAG 2.2 AA).
 * Applies a purple focus ring to all interactive elements when focused via keyboard.
 */
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    *:focus-visible {
      outline: 2px solid #8B5CF6 !important;
      outline-offset: 2px !important;
    }
    *:focus:not(:focus-visible) {
      outline: none !important;
    }
    [data-testid="skip-link"]:focus,
    [role="link"][tabindex="0"]:focus {
      top: 16px !important;
    }
  `;
  document.head.appendChild(style);
}

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
