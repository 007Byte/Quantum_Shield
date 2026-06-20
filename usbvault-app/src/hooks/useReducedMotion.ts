/**
 * useReducedMotion — Reactive hook for OS-level "reduce motion" preference.
 *
 * Returns `true` when the user has enabled "Reduce motion" in their OS
 * accessibility settings (macOS: System Settings → Accessibility → Display,
 * Windows: Settings → Ease of Access → Display, iOS: Settings → Accessibility
 * → Motion).
 *
 * On web, this listens for changes to the `prefers-reduced-motion` media
 * query in real time. On native, it reads from the React Native Accessibility
 * API on mount (no live listener — RN doesn't broadcast changes).
 *
 * Usage:
 *   const reducedMotion = useReducedMotion();
 *   const transition = reducedMotion ? {} : { transition: 'all 0.3s ease' };
 */
import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

function getInitialValue(): boolean {
  if (isWeb && typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getInitialValue);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined' || !window.matchMedia) return;

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);

    // Modern browsers
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    }
    // Safari 13 fallback
    mql.addListener(handler);
    return () => mql.removeListener(handler);
  }, []);

  return reduced;
}

/**
 * Non-hook helper for code that runs outside React (e.g. StyleSheet.create,
 * module-level constants). Reads the current value without subscribing to
 * changes — fine for static styles that are set once.
 */
export function prefersReducedMotion(): boolean {
  return getInitialValue();
}
