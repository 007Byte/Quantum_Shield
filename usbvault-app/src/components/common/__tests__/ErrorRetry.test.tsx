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

  it('has alert accessibility role on container', () => {
    const { getByText } = render(<ErrorRetry error="Alert error" onRetry={() => {}} />);
    const errorText = getByText('Alert error');
    // Walk up through the tree to find the view with alert role
    let node = errorText.parent;
    let foundAlert = false;
    while (node) {
      if (node.props?.accessibilityRole === 'alert') {
        foundAlert = true;
        break;
      }
      node = node.parent;
    }
    expect(foundAlert).toBe(true);
  });

  it('retry button has correct accessibility label', () => {
    const { getByLabelText } = render(<ErrorRetry error="Error" onRetry={() => {}} />);
    expect(getByLabelText('common.retry')).toBeTruthy();
  });

  it('retry button shows busy state when retrying', () => {
    const { getByTestId } = render(<ErrorRetry error="Error" onRetry={() => {}} retrying />);
    const btn = getByTestId('error-retry-button');
    expect(btn.props.accessibilityState).toEqual(
      expect.objectContaining({ busy: true, disabled: true })
    );
  });
});
