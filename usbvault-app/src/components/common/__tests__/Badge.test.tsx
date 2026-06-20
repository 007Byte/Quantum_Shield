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

  it('renders with icon in accessibility label', () => {
    const { getByText, getByLabelText } = render(<Badge label="Secure" icon="🔒" />);
    // Icon is accessibilityElementsHidden, but label includes it
    expect(getByLabelText('🔒 Secure')).toBeTruthy();
    expect(getByText('Secure')).toBeTruthy();
  });

  it('applies testID prop', () => {
    const { getByTestId } = render(<Badge label="Test" testID="badge-1" />);
    expect(getByTestId('badge-1')).toBeTruthy();
  });

  it('sets accessible prop and accessibilityRole', () => {
    const { getByLabelText } = render(<Badge label="Info" />);
    const badge = getByLabelText('Info');
    expect(badge.props.accessible).toBe(true);
    expect(badge.props.accessibilityRole).toBe('text');
  });

  it('sets accessibility label with icon prefix when icon provided', () => {
    const { getByLabelText } = render(<Badge label="Active" icon="✅" />);
    expect(getByLabelText('✅ Active')).toBeTruthy();
  });

  it('sets accessibility label without icon when no icon', () => {
    const { getByLabelText } = render(<Badge label="Status" />);
    expect(getByLabelText('Status')).toBeTruthy();
  });

  it('renders different variants without crashing', () => {
    const variants = ['pqc', 'success', 'warning', 'danger', 'info'] as const;
    for (const variant of variants) {
      const { getByText } = render(<Badge label={variant} variant={variant} />);
      expect(getByText(variant)).toBeTruthy();
    }
  });
});
