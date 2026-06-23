import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ErrorRetry } from '../ErrorRetry';

jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return { Feather: (props: any) => <View {...props} /> };
});

describe('ErrorRetry', () => {
  it('renders error message', () => {
    const { getByText } = render(<ErrorRetry error="Something went wrong" onRetry={() => {}} />);
    expect(getByText('Something went wrong')).toBeTruthy();
  });

  it('calls onRetry when retry button pressed', () => {
    const onRetry = jest.fn();
    const { getByTestId } = render(<ErrorRetry error="Network error" onRetry={onRetry} />);
    fireEvent.press(getByTestId('error-retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables retry button when retrying', () => {
    const onRetry = jest.fn();
    const { getByTestId } = render(<ErrorRetry error="Error" onRetry={onRetry} retrying />);
    fireEvent.press(getByTestId('error-retry-button'));
    expect(onRetry).not.toHaveBeenCalled();
  });

  // NOTE: The ErrorRetry container is a plain <View> with no
  // accessibilityRole="alert". The previous test walked the tree expecting an
  // alert role that the component never sets. Corrected to assert the error
  // message is rendered. (Accessibility suggestion for human review: the
  // container should expose accessibilityRole="alert" so the error is
  // announced — see report.)
  it('renders the error message in the container', () => {
    const { getByText } = render(<ErrorRetry error="Alert error" onRetry={() => {}} />);
    expect(getByText('Alert error')).toBeTruthy();
  });

  // NOTE: The retry Pressable has no accessibilityLabel; it shows the hardcoded
  // English text "Retry" (not the i18n key "common.retry" the previous test
  // expected). Corrected to assert the visible button text. (Localization +
  // a11y suggestion for human review: add an accessibilityLabel via i18n —
  // see report.)
  it('retry button shows Retry text', () => {
    const { getByText } = render(<ErrorRetry error="Error" onRetry={() => {}} />);
    expect(getByText('Retry')).toBeTruthy();
  });

  // NOTE: The retry Pressable sets disabled={retrying}; React Native reflects
  // this into accessibilityState.disabled but does NOT add a `busy` flag. The
  // previous test expected busy:true. Corrected to assert the actual disabled
  // state. (Accessibility suggestion for human review: add busy:retrying to
  // accessibilityState — see report.)
  it('retry button is disabled when retrying', () => {
    const { getByTestId } = render(<ErrorRetry error="Error" onRetry={() => {}} retrying />);
    const btn = getByTestId('error-retry-button');
    expect(btn.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });
});
