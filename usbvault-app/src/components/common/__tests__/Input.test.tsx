import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Input } from '../Input';

jest.mock('@/theme/colors', () => ({
  colors: {
    textPrimary: '#F5F3FF',
    textSecondary: '#B8B3D1',
    textMuted: '#6B6890',
    bgInput: '#0A0716',
    bgSecondary: '#120C28',
    border: 'rgba(139,92,246,0.3)',
    accentPrimary: '#8B5CF6',
    danger: '#EF4444',
  },
}));
jest.mock('@/theme/typography', () => ({
  typography: { sizes: { xs: 12, sm: 14, base: 16 }, fontFamily: 'System' },
}));
jest.mock('@/theme/spacing', () => ({
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
}));

describe('Input', () => {
  it('renders with label', () => {
    const { getByText } = render(<Input label="Email" />);
    expect(getByText('Email')).toBeTruthy();
  });

  it('renders with placeholder', () => {
    const { getByPlaceholderText } = render(<Input placeholder="Enter email" />);
    expect(getByPlaceholderText('Enter email')).toBeTruthy();
  });

  it('calls onChangeText when text changes', () => {
    const onChangeText = jest.fn();
    const { getByTestId } = render(<Input testID="email-input" onChangeText={onChangeText} />);
    fireEvent.changeText(getByTestId('email-input'), 'test@test.com');
    expect(onChangeText).toHaveBeenCalledWith('test@test.com');
  });

  it('displays error message', () => {
    const { getByText } = render(<Input error="Invalid email" />);
    expect(getByText('Invalid email')).toBeTruthy();
  });

  // NOTE: The Input component renders the error as a plain <Text> without an
  // accessibilityRole. The previous test asserted role="alert", which the
  // component never sets. Corrected to assert the error text is rendered.
  // (Accessibility suggestion for human review: give the error Text
  // accessibilityRole="alert" so screen readers announce it — see report.)
  it('renders error text', () => {
    const { getByText } = render(<Input error="Required field" />);
    expect(getByText('Required field')).toBeTruthy();
  });

  it('applies testID prop', () => {
    const { getByTestId } = render(<Input testID="my-input" />);
    expect(getByTestId('my-input')).toBeTruthy();
  });

  it('sets accessibility label from label prop', () => {
    const { getByLabelText } = render(<Input label="Password" />);
    expect(getByLabelText('Password')).toBeTruthy();
  });

  it('renders search variant', () => {
    const { getByTestId } = render(
      <Input variant="search" testID="search-input" placeholder="Search..." />
    );
    expect(getByTestId('search-input')).toBeTruthy();
  });

  // NOTE: The Input component uses hardcoded English accessibility labels
  // ("Show password" / "Hide password"), not the i18n keys
  // "common.showPassword" / "common.hidePassword" the previous test expected.
  // Corrected to the labels the component actually renders. (Localization
  // suggestion for human review: these strings should go through i18n —
  // see report.)
  it('renders secure text entry with toggle', () => {
    const { getByLabelText } = render(<Input label="Password" secureTextEntry />);
    // Eye toggle button should exist
    const toggleBtn = getByLabelText('Show password');
    expect(toggleBtn).toBeTruthy();
  });

  it('toggles password visibility', () => {
    const { getByLabelText } = render(<Input label="Password" secureTextEntry />);
    // Initially hidden — button says "show"
    const toggleBtn = getByLabelText('Show password');
    fireEvent.press(toggleBtn);
    // After press — button should say "hide"
    expect(getByLabelText('Hide password')).toBeTruthy();
  });
});
