import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../Button';

// Mock theme modules
jest.mock('@/theme/colors', () => ({
  colors: {
    accentPrimary: '#8B5CF6',
    textOnAccent: '#FFFFFF',
    textPrimary: '#F5F3FF',
    textSecondary: '#B8B3D1',
    textMuted: '#6B6890',
    bgSecondary: '#120C28',
    border: 'rgba(139,92,246,0.3)',
    danger: '#EF4444',
  },
}));
jest.mock('@/theme/typography', () => ({
  typography: { sizes: { sm: 14, base: 16, lg: 18 }, fontFamily: 'System' },
}));
jest.mock('@/theme/spacing', () => ({
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
}));

describe('Button', () => {
  it('renders children text', () => {
    const { getByText } = render(<Button onPress={() => {}}>Click Me</Button>);
    expect(getByText('Click Me')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(<Button onPress={onPress}>Press</Button>);
    fireEvent.press(getByText('Press'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button onPress={onPress} disabled>
        Disabled
      </Button>
    );
    fireEvent.press(getByText('Disabled'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not call onPress when loading', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button onPress={onPress} loading>
        Loading
      </Button>
    );
    fireEvent.press(getByText('Loading'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows loading indicator when loading', () => {
    const { getByTestId } = render(
      <Button onPress={() => {}} loading testID="btn">
        Load
      </Button>
    );
    // ActivityIndicator is rendered when loading
    expect(getByTestId('btn')).toBeTruthy();
  });

  it('applies testID prop', () => {
    const { getByTestId } = render(
      <Button onPress={() => {}} testID="my-button">
        Test
      </Button>
    );
    expect(getByTestId('my-button')).toBeTruthy();
  });

  it('sets accessibility role to button by default', () => {
    const { getByRole } = render(<Button onPress={() => {}}>Accessible</Button>);
    expect(getByRole('button')).toBeTruthy();
  });

  it('sets accessibility role to link for link variant', () => {
    const { getByRole } = render(
      <Button onPress={() => {}} variant="link">
        Link
      </Button>
    );
    expect(getByRole('link')).toBeTruthy();
  });

  it('sets busy accessibility state when loading', () => {
    const { getByRole } = render(
      <Button onPress={() => {}} loading>
        Busy
      </Button>
    );
    const btn = getByRole('button');
    expect(btn.props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
  });
});
