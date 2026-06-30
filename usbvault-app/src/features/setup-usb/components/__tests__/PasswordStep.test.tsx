import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PasswordStep } from '../PasswordStep';
import type { PasswordStepProps, PasswordStrength } from '../../domain/setup-usb.types';

// PasswordStep imports `theme as themeProxy` at module scope (used inside
// StyleSheet.create for fieldError/fieldOkText), so the mock MUST expose a
// concrete `theme` object whose semantic colors resolve at import time.
// `name` is mutable (via __setThemeName) so a single instrumented module can
// cover BOTH the `theme.name === 'dark'` and the light branches.
// Built inside the factory so it survives jest.mock hoisting (no TDZ).
jest.mock('@/theme/engine', () => {
  const mockTheme = {
    name: 'dark',
    semantic: {
      cyan: '#22D3EE',
      warning: '#F59E0B',
      danger: '#EF4444',
      success: '#10B981',
      purple: '#8B5CF6',
    },
    L2: {
      base: {
        native: { backgroundColor: '#120C28' },
        web: {},
        text: { primary: '#F5F3FF', secondary: '#B8B3D1', muted: '#6B6890' },
      },
    },
  };
  return {
    __setThemeName: (name: string) => {
      mockTheme.name = name;
    },
    useTheme: () => ({ theme: mockTheme, colorScheme: mockTheme.name, toggleTheme: jest.fn() }),
    resolveLayerStyle: (state: any) => ({ ...(state?.native ?? {}) }),
    theme: mockTheme,
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const themeEngineMock = require('@/theme/engine') as { __setThemeName: (n: string) => void };

afterEach(() => {
  // Reset to the default dark theme after every test.
  themeEngineMock.__setThemeName('dark');
});

jest.mock('@/components/dashboard2/styles', () => ({
  dashboardSpacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
}));

jest.mock('@/utils/webStyle', () => ({
  webOnly: () => ({}),
}));

const passthroughT = (key: string) => key;

const NEUTRAL_STRENGTH: PasswordStrength = { strength: 0, label: '', color: '#6B6890' };

function buildProps(overrides: Partial<PasswordStepProps> = {}): PasswordStepProps {
  return {
    password: '',
    passwordConfirm: '',
    showPassword: false,
    showPasswordConfirm: false,
    passwordsMatch: false,
    strength: NEUTRAL_STRENGTH,
    onChangePassword: jest.fn(),
    onChangePasswordConfirm: jest.fn(),
    onToggleShowPassword: jest.fn(),
    onToggleShowPasswordConfirm: jest.fn(),
    t: passthroughT,
    ...overrides,
  };
}

describe('PasswordStep', () => {
  it('renders title, description and both password field labels', () => {
    const { getByText } = render(<PasswordStep {...buildProps()} />);
    expect(getByText('setupUsb.setPasswordTitle')).toBeTruthy();
    expect(getByText('setupUsb.setPasswordDesc')).toBeTruthy();
    expect(getByText('setupUsb.masterPassword')).toBeTruthy();
    expect(getByText('setupUsb.confirmPassword')).toBeTruthy();
  });

  // ── Password input changeText ────────────────────────────────────────────
  it('fires onChangePassword when the master password input changes', () => {
    const onChangePassword = jest.fn();
    const { getByLabelText } = render(<PasswordStep {...buildProps({ onChangePassword })} />);
    fireEvent.changeText(getByLabelText('setupUsb.enterMasterPassword'), 'Tr0ub4dour-Vault!');
    expect(onChangePassword).toHaveBeenCalledWith('Tr0ub4dour-Vault!');
  });

  it('fires onChangePasswordConfirm when the confirm input changes', () => {
    const onChangePasswordConfirm = jest.fn();
    const { getByLabelText } = render(
      <PasswordStep {...buildProps({ onChangePasswordConfirm })} />
    );
    fireEvent.changeText(
      getByLabelText('setupUsb.confirmMasterPassword'),
      'Tr0ub4dour-Vault!'
    );
    expect(onChangePasswordConfirm).toHaveBeenCalledWith('Tr0ub4dour-Vault!');
  });

  // ── secureTextEntry reflects show flags ──────────────────────────────────
  it('masks both inputs by default (secureTextEntry true when show flags are false)', () => {
    const { getByLabelText } = render(<PasswordStep {...buildProps()} />);
    expect(getByLabelText('setupUsb.enterMasterPassword').props.secureTextEntry).toBe(true);
    expect(getByLabelText('setupUsb.confirmMasterPassword').props.secureTextEntry).toBe(true);
  });

  it('reveals the master password when showPassword is true', () => {
    const { getByLabelText } = render(<PasswordStep {...buildProps({ showPassword: true })} />);
    expect(getByLabelText('setupUsb.enterMasterPassword').props.secureTextEntry).toBe(false);
  });

  it('reveals the confirm password when showPasswordConfirm is true', () => {
    const { getByLabelText } = render(
      <PasswordStep {...buildProps({ showPasswordConfirm: true })} />
    );
    expect(getByLabelText('setupUsb.confirmMasterPassword').props.secureTextEntry).toBe(false);
  });

  // ── Toggle callbacks ─────────────────────────────────────────────────────
  it('fires onToggleShowPassword when the master eye button is pressed', () => {
    const onToggleShowPassword = jest.fn();
    const { getAllByRole } = render(
      <PasswordStep {...buildProps({ onToggleShowPassword })} />
    );
    // Two eye toggle buttons in order: [master, confirm]
    const buttons = getAllByRole('button');
    fireEvent.press(buttons[0]);
    expect(onToggleShowPassword).toHaveBeenCalledTimes(1);
  });

  it('fires onToggleShowPasswordConfirm when the confirm eye button is pressed', () => {
    const onToggleShowPasswordConfirm = jest.fn();
    const { getAllByRole } = render(
      <PasswordStep {...buildProps({ onToggleShowPasswordConfirm })} />
    );
    const buttons = getAllByRole('button');
    fireEvent.press(buttons[1]);
    expect(onToggleShowPasswordConfirm).toHaveBeenCalledTimes(1);
  });

  // ── Mismatch vs match ────────────────────────────────────────────────────
  it('shows the mismatch error when confirm is non-empty and does not match', () => {
    const { getByText, queryByText } = render(
      <PasswordStep
        {...buildProps({
          password: 'Tr0ub4dour-Vault!',
          passwordConfirm: 'Different-Phrase-9',
          passwordsMatch: false,
        })}
      />
    );
    expect(getByText('setupUsb.passwordsDontMatch')).toBeTruthy();
    expect(queryByText('setupUsb.passwordsMatch')).toBeNull();
  });

  it('shows the match confirmation when confirm is non-empty and matches', () => {
    const { getByText, queryByText } = render(
      <PasswordStep
        {...buildProps({
          password: 'Tr0ub4dour-Vault!',
          passwordConfirm: 'Tr0ub4dour-Vault!',
          passwordsMatch: true,
        })}
      />
    );
    expect(getByText('setupUsb.passwordsMatch')).toBeTruthy();
    expect(queryByText('setupUsb.passwordsDontMatch')).toBeNull();
  });

  it('shows neither match nor mismatch feedback when confirm is empty', () => {
    const { queryByText } = render(
      <PasswordStep {...buildProps({ password: 'Tr0ub4dour-Vault!', passwordConfirm: '' })} />
    );
    expect(queryByText('setupUsb.passwordsMatch')).toBeNull();
    expect(queryByText('setupUsb.passwordsDontMatch')).toBeNull();
  });

  // ── Strength meter ───────────────────────────────────────────────────────
  it('hides the strength meter when the password is empty', () => {
    const { queryByText } = render(<PasswordStep {...buildProps({ password: '' })} />);
    expect(queryByText('setupUsb.passwordStrength')).toBeNull();
  });

  it('renders the strength meter with label when the password is non-empty', () => {
    const strength: PasswordStrength = { strength: 85, label: 'Strong', color: '#10B981' };
    const { getByText } = render(
      <PasswordStep {...buildProps({ password: 'Tr0ub4dour-Vault!', strength })} />
    );
    expect(getByText('setupUsb.passwordStrength')).toBeTruthy();
    expect(getByText('Strong')).toBeTruthy();
  });

  it('renders a weak strength label for a short password', () => {
    const strength: PasswordStrength = { strength: 20, label: 'Weak', color: '#EF4444' };
    const { getByText } = render(
      <PasswordStep {...buildProps({ password: 'short1', strength })} />
    );
    expect(getByText('Weak')).toBeTruthy();
  });
});

// ── Light theme render path ────────────────────────────────────────────────
// Flips the shared mock's theme.name to 'light' so the same instrumented
// component covers the else-side of every `theme.name === 'dark' ? ... : ...`
// ternary (input-row borders/backgrounds and the strength-bar background).
describe('PasswordStep (light theme)', () => {
  it('renders the match state and strength bar without throwing under light theme', () => {
    themeEngineMock.__setThemeName('light');
    const strength: PasswordStrength = { strength: 70, label: 'Good', color: '#059669' };
    const { getByText } = render(
      <PasswordStep
        {...buildProps({
          password: 'Tr0ub4dour-Vault!',
          passwordConfirm: 'Tr0ub4dour-Vault!',
          passwordsMatch: true,
          strength,
        })}
      />
    );
    expect(getByText('setupUsb.passwordsMatch')).toBeTruthy();
    expect(getByText('Good')).toBeTruthy();
  });

  it('renders the mismatch error under light theme (error border branch)', () => {
    themeEngineMock.__setThemeName('light');
    const { getByText } = render(
      <PasswordStep
        {...buildProps({
          password: 'Tr0ub4dour-Vault!',
          passwordConfirm: 'Mismatch-Phrase-7',
          passwordsMatch: false,
        })}
      />
    );
    expect(getByText('setupUsb.passwordsDontMatch')).toBeTruthy();
  });
});
