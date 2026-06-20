import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SessionTimeoutModal } from '../SessionTimeoutModal';

// Mock dependencies
jest.mock('@/utils/webStyle', () => ({
  webOnly: () => ({}),
}));
jest.mock('@/theme/engine', () => ({
  useTheme: () => ({
    theme: {
      L4: {
        base: {
          text: {
            primary: '#F5F3FF',
            secondary: '#B8B3D1',
            muted: '#6B6890',
          },
          bg: 'rgba(15,10,30,0.97)',
          border: 'rgba(139,92,246,0.45)',
        },
      },
    },
    colorScheme: 'dark',
    toggleTheme: jest.fn(),
  }),
  resolveLayerStyle: () => ({
    backgroundColor: 'rgba(15,10,30,0.97)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.45)',
  }),
}));
jest.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'session.expiring': 'Session Expiring',
        'session.willExpireIn': 'Your session will expire in',
        'session.loggedOutShortly': 'You will be logged out shortly',
        'session.extendOrLogout': 'Extend your session or logout now',
        'session.logout': 'Logout',
        'session.extendSession': 'Extend Session',
      };
      return translations[key] || key;
    },
    language: 'en',
    setLanguage: jest.fn(),
  }),
}));
jest.mock('@/hooks/useFocusTrap', () => ({
  useFocusTrap: () => ({ current: null }),
}));

describe('SessionTimeoutModal', () => {
  const defaultProps = {
    visible: true,
    secondsLeft: 120,
    extendSession: jest.fn(),
    logoutNow: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when not visible', () => {
    const { toJSON } = render(
      <SessionTimeoutModal {...defaultProps} visible={false} />
    );
    expect(toJSON()).toBeNull();
  });

  it('renders title when visible', () => {
    const { getByText } = render(<SessionTimeoutModal {...defaultProps} />);
    expect(getByText('Session Expiring')).toBeTruthy();
  });

  it('renders message text', () => {
    const { getByText } = render(<SessionTimeoutModal {...defaultProps} />);
    expect(getByText('Your session will expire in')).toBeTruthy();
  });

  it('displays formatted countdown (2:00 for 120 seconds)', () => {
    const { getByText } = render(<SessionTimeoutModal {...defaultProps} />);
    expect(getByText('2:00')).toBeTruthy();
  });

  it('displays formatted countdown for non-round seconds', () => {
    const { getByText } = render(
      <SessionTimeoutModal {...defaultProps} secondsLeft={95} />
    );
    expect(getByText('1:35')).toBeTruthy();
  });

  it('displays formatted countdown for seconds under 60', () => {
    const { getByText } = render(
      <SessionTimeoutModal {...defaultProps} secondsLeft={45} />
    );
    expect(getByText('0:45')).toBeTruthy();
  });

  it('renders Logout button', () => {
    const { getByText } = render(<SessionTimeoutModal {...defaultProps} />);
    expect(getByText('Logout')).toBeTruthy();
  });

  it('renders Extend Session button', () => {
    const { getByText } = render(<SessionTimeoutModal {...defaultProps} />);
    expect(getByText('Extend Session')).toBeTruthy();
  });

  it('calls logoutNow when Logout is pressed', () => {
    const logoutNow = jest.fn();
    const { getByText } = render(
      <SessionTimeoutModal {...defaultProps} logoutNow={logoutNow} />
    );
    fireEvent.press(getByText('Logout'));
    expect(logoutNow).toHaveBeenCalledTimes(1);
  });

  it('calls extendSession when Extend Session is pressed', () => {
    const extendSession = jest.fn();
    const { getByText } = render(
      <SessionTimeoutModal {...defaultProps} extendSession={extendSession} />
    );
    fireEvent.press(getByText('Extend Session'));
    expect(extendSession).toHaveBeenCalledTimes(1);
  });

  it('shows urgent subtext when secondsLeft <= 60', () => {
    const { getByText } = render(
      <SessionTimeoutModal {...defaultProps} secondsLeft={30} />
    );
    expect(getByText('You will be logged out shortly')).toBeTruthy();
  });

  it('shows extend-or-logout subtext when secondsLeft > 60', () => {
    const { getByText } = render(
      <SessionTimeoutModal {...defaultProps} secondsLeft={90} />
    );
    expect(getByText('Extend your session or logout now')).toBeTruthy();
  });

  it('renders countdown with accessibility label', () => {
    const { getByLabelText } = render(
      <SessionTimeoutModal {...defaultProps} secondsLeft={45} />
    );
    expect(getByLabelText('45 seconds remaining')).toBeTruthy();
  });

  it('renders title with header accessibility role', () => {
    const { getByRole } = render(<SessionTimeoutModal {...defaultProps} />);
    expect(getByRole('header')).toBeTruthy();
  });
});
