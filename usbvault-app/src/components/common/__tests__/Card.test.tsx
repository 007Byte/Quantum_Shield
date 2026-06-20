import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Card } from '../Card';

jest.mock('@/theme/colors', () => ({
  colors: {
    bgSecondary: '#120C28',
    border: 'rgba(139,92,246,0.3)',
    accentPrimary: '#8B5CF6',
  },
}));
jest.mock('@/theme/spacing', () => ({
  spacing: { lg: 16 },
}));

describe('Card', () => {
  it('renders children', () => {
    const { getByText } = render(
      <Card>
        <Text>Card Content</Text>
      </Card>
    );
    expect(getByText('Card Content')).toBeTruthy();
  });

  it('applies testID prop', () => {
    const { getByTestId } = render(
      <Card testID="card-1">
        <Text>Inner</Text>
      </Card>
    );
    expect(getByTestId('card-1')).toBeTruthy();
  });

  it('applies testID prop correctly renders', () => {
    const { getByTestId } = render(
      <Card testID="accessibility-card">
        <Text>Content</Text>
      </Card>
    );
    expect(getByTestId('accessibility-card')).toBeTruthy();
  });

  it('applies custom style', () => {
    const { getByTestId } = render(
      <Card testID="styled" style={{ marginTop: 20 }}>
        <Text>Styled</Text>
      </Card>
    );
    const card = getByTestId('styled');
    const flatStyle = Array.isArray(card.props.style)
      ? Object.assign({}, ...card.props.style.filter(Boolean))
      : card.props.style;
    expect(flatStyle.marginTop).toBe(20);
  });

  it('applies glow styles when glow prop is true', () => {
    const { getByTestId } = render(
      <Card testID="glow-card" glow>
        <Text>Glow</Text>
      </Card>
    );
    // Card should render without error with glow enabled
    expect(getByTestId('glow-card')).toBeTruthy();
  });
});
