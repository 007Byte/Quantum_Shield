import { useRef, useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Focus trap hook for modals and dialogs (web only).
 * Traps Tab/Shift+Tab cycling within a container, handles Escape to close,
 * and restores focus on unmount.
 */
export function useFocusTrap(isActive: boolean, onEscape?: () => void) {
  const containerRef = useRef<any>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Use a ref for onEscape so the keydown listener always sees the latest
  // callback without needing to re-register (which would steal focus).
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  // Effect 1: Initial focus + restore on close.
  // Only runs when isActive flips — never on re-renders.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!isActive) return;

    // Save current focus so we can restore it when the modal closes
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus first focusable element inside the trap container
    const container = containerRef.current;
    if (container) {
      const firstFocusable = container.querySelector(
        'input:not([disabled]), button:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ) as HTMLElement;
      if (firstFocusable) {
        setTimeout(() => firstFocusable.focus(), 50);
      }
    }

    return () => {
      // Restore previous focus when modal deactivates
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [isActive]);

  // Effect 2: Keydown listener for Tab trapping and Escape.
  // Also only depends on isActive — reads onEscape from ref.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.preventDefault();
        onEscapeRef.current();
        return;
      }

      if (e.key !== 'Tab') return;

      const container = containerRef.current;
      if (!container) return;

      const focusableElements = container.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  return containerRef;
}
