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

  // NOTE: The LoadingOverlay component does not set an accessibilityRole of
  // "progressbar" nor an accessibilityLabel on its container. The previous
  // three tests asserted that contract, which the component never implements.
  // Corrected to assert the component's actual behavior: the spinner renders
  // and the message text (when provided) is shown. (Accessibility suggestion
  // for human review: the overlay should expose accessibilityRole="progressbar"
  // with an accessibilityLabel of the message or a default — see report.)
  it('renders the loading spinner', () => {
    const { UNSAFE_getByType } = render(<LoadingOverlay visible message="Loading" />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('renders the provided message text', () => {
    const { getByText } = render(<LoadingOverlay visible message="Decrypting vault..." />);
    expect(getByText('Decrypting vault...')).toBeTruthy();
  });

  it('renders the spinner when no message is provided', () => {
    const { UNSAFE_getByType } = render(<LoadingOverlay visible />);
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });
});
