import React from 'react';
import { render } from '@testing-library/react-native';
import { LoadingOverlay } from '../LoadingOverlay';

describe('LoadingOverlay', () => {
  it('renders when visible', () => {
    const { getByTestId } = render(<LoadingOverlay visible testID="loading" />);
    expect(getByTestId('loading')).toBeTruthy();
  });

  it('renders loading spinner', () => {
    const { UNSAFE_getByType } = render(<LoadingOverlay visible testID="overlay" />);
    // ActivityIndicator is rendered inside the modal
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('displays message when provided', () => {
    const { getByText } = render(<LoadingOverlay visible message="Encrypting files..." />);
    expect(getByText('Encrypting files...')).toBeTruthy();
  });

  it('does not display message when not provided', () => {
    const { queryByText } = render(<LoadingOverlay visible />);
    // No message text should be rendered
    expect(queryByText('Encrypting')).toBeNull();
  });

  it('has progressbar accessibility role', () => {
    const { getByLabelText } = render(<LoadingOverlay visible message="Loading" />);
    const container = getByLabelText('Loading');
    expect(container.props.accessibilityRole).toBe('progressbar');
  });

  it('uses message as accessibility label', () => {
    const { getByLabelText } = render(<LoadingOverlay visible message="Decrypting vault..." />);
    expect(getByLabelText('Decrypting vault...')).toBeTruthy();
  });

  it('uses "Loading" as default accessibility label', () => {
    const { getByLabelText } = render(<LoadingOverlay visible />);
    expect(getByLabelText('Loading')).toBeTruthy();
  });
});
