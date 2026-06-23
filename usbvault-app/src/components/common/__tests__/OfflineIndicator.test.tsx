import React from 'react';
import { render } from '@testing-library/react-native';
import { OfflineIndicator } from '../OfflineIndicator';

// Save original navigator.onLine descriptor
const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');

describe('OfflineIndicator', () => {
  afterEach(() => {
    // Restore navigator.onLine
    if (originalOnLine) {
      Object.defineProperty(navigator, 'onLine', originalOnLine);
    } else {
      Object.defineProperty(navigator, 'onLine', {
        value: true,
        writable: true,
        configurable: true,
      });
    }
  });

  it('renders nothing when online', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true,
    });
    const { toJSON } = render(<OfflineIndicator />);
    expect(toJSON()).toBeNull();
  });

  it('renders offline message when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', {
      value: false,
      writable: true,
      configurable: true,
    });
    const { getByText } = render(<OfflineIndicator />);
    expect(getByText("You're offline. Changes will sync when reconnected.")).toBeTruthy();
  });

  it('renders nothing by default (online state)', () => {
    // Default navigator.onLine is true in jsdom
    const { queryByText } = render(<OfflineIndicator />);
    expect(queryByText("You're offline. Changes will sync when reconnected.")).toBeNull();
  });
});
