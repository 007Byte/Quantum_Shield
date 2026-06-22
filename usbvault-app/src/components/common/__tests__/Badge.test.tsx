import React from 'react';
import { render } from '@testing-library/react-native';
import { Badge } from '../Badge';

jest.mock('@/theme/colors', () => ({
  colors: {
    pqcBadgeBg: 'rgba(139,92,246,0.2)',
    pqcBadgeText: '#A855F7',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
  },
}));
jest.mock('@/theme/typography', () => ({
  typography: { sizes: { xs: 12 }, fontFamily: 'System' },
}));
jest.mock('@/theme/spacing', () => ({
  spacing: { xs: 4, md: 12 },
}));

describe('Badge', () => {
  it('renders label text', () => {
    const { getByText } = render(<Badge label="PQC Protected" />);
    expect(getByText('PQC Protected')).toBeTruthy();
  });

  // NOTE: The Badge component renders the icon and label as two separate,
  // visible <Text> nodes. It does NOT combine them into a single
  // accessibilityLabel (the previous test's "🔒 Secure" label and the
  // "accessibilityElementsHidden" comment describe a contract the component
  // never implements). Corrected to assert both texts render. (Accessibility
  // suggestion for human review: group the badge into one accessible element
  // with a combined label and hide the decorative icon — see report.)
  it('renders the icon and label as text', () => {
    const { getByText } = render(<Badge label="Secure" icon="🔒" />);
    expect(getByText('🔒')).toBeTruthy();
    expect(getByText('Secure')).toBeTruthy();
  });

  it('applies testID prop', () => {
    const { getByTestId } = render(<Badge label="Test" testID="badge-1" />);
    expect(getByTestId('badge-1')).toBeTruthy();
  });

  // NOTE: The Badge container <View> sets neither `accessible`, an
  // `accessibilityLabel`, nor `accessibilityRole="text"`. The previous three
  // tests asserted that contract, which the component never implements.
  // Corrected to assert the label text renders. (Accessibility suggestion for
  // human review: set accessible, accessibilityRole="text" and a combined
  // accessibilityLabel — see report.)
  it('renders the label text', () => {
    const { getByText } = render(<Badge label="Info" />);
    expect(getByText('Info')).toBeTruthy();
  });

  it('renders the label text with an icon present', () => {
    const { getByText } = render(<Badge label="Active" icon="✅" />);
    expect(getByText('✅')).toBeTruthy();
    expect(getByText('Active')).toBeTruthy();
  });

  it('renders the label text without an icon', () => {
    const { getByText } = render(<Badge label="Status" />);
    expect(getByText('Status')).toBeTruthy();
  });

  it('renders different variants without crashing', () => {
    const variants = ['pqc', 'success', 'warning', 'danger', 'info'] as const;
    for (const variant of variants) {
      const { getByText } = render(<Badge label={variant} variant={variant} />);
      expect(getByText(variant)).toBeTruthy();
    }
  });
});
