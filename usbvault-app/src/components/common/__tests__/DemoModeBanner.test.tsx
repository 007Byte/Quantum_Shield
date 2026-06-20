import React from 'react';
import { render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { DemoModeBanner } from '../DemoModeBanner';

// Mock dependencies
jest.mock('@/utils/webStyle', () => ({
  webOnly: () => ({}),
}));

const mockAuthStore = jest.fn();
jest.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: any) => mockAuthStore(selector),
}));

jest.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, opts?: any) => opts?.defaultValue || key,
    language: 'en',
    setLanguage: jest.fn(),
  }),
}));

describe('DemoModeBanner', () => {
  const originalPlatformOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: web platform, demo mode, authenticated
    (Platform as any).OS = 'web';
    mockAuthStore.mockImplementation((selector: any) => {
      const state = { isDemoMode: true, isAuthenticated: true };
      return selector(state);
    });
  });

  afterEach(() => {
    (Platform as any).OS = originalPlatformOS;
  });

  it('renders banner when in demo mode on web', () => {
    const { getByText } = render(<DemoModeBanner />);
    expect(
      getByText(
        'Demo Mode — Data is stored locally in your browser. Connect a backend for production use.'
      )
    ).toBeTruthy();
  });

  it('returns null when not in demo mode', () => {
    mockAuthStore.mockImplementation((selector: any) => {
      const state = { isDemoMode: false, isAuthenticated: true };
      return selector(state);
    });
    const { toJSON } = render(<DemoModeBanner />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when not authenticated', () => {
    mockAuthStore.mockImplementation((selector: any) => {
      const state = { isDemoMode: true, isAuthenticated: false };
      return selector(state);
    });
    const { toJSON } = render(<DemoModeBanner />);
    expect(toJSON()).toBeNull();
  });

  it('returns null on native platform', () => {
    (Platform as any).OS = 'ios';
    const { toJSON } = render(<DemoModeBanner />);
    expect(toJSON()).toBeNull();
  });

  it('returns null when not in __DEV__ mode', () => {
    const originalDev = (global as any).__DEV__;
    (global as any).__DEV__ = false;
    const { toJSON } = render(<DemoModeBanner />);
    expect(toJSON()).toBeNull();
    (global as any).__DEV__ = originalDev;
  });
});
