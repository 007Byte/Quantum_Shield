import React from 'react';
import { render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { ErrorBoundary } from '../ErrorBoundary';

// Mock dependencies
jest.mock('@/utils/webStyle', () => ({
  webOnly: () => ({}),
}));
jest.mock('@/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Component that throws on demand
const ThrowingChild: React.FC<{ shouldThrow?: boolean }> = ({ shouldThrow }) => {
  if (shouldThrow) {
    throw new Error('Test explosion');
  }
  return <Text>Child content</Text>;
};

// Suppress React error boundary console noise during tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: any[]) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Error: Uncaught') ||
        args[0].includes('The above error occurred') ||
        args[0].includes('Error Boundary'))
    ) {
      return;
    }
    originalConsoleError.call(console, ...args);
  };
});
afterAll(() => {
  console.error = originalConsoleError;
});

describe('ErrorBoundary', () => {
  it('renders children when no error occurs', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <Text>Safe content</Text>
      </ErrorBoundary>
    );
    expect(getByText('Safe content')).toBeTruthy();
  });

  it('renders default fallback UI when child throws', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(getByText('Something went wrong')).toBeTruthy();
    expect(getByText(/unexpected error/i)).toBeTruthy();
  });

  it('displays error details when child throws', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(getByText('Error Details:')).toBeTruthy();
    expect(getByText(/Test explosion/)).toBeTruthy();
  });

  it('renders custom fallback when provided', () => {
    const CustomFallback = <Text>Custom error view</Text>;
    const { getByText, queryByText } = render(
      <ErrorBoundary fallback={CustomFallback}>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(getByText('Custom error view')).toBeTruthy();
    expect(queryByText('Something went wrong')).toBeNull();
  });

  it('calls onError callback when child throws', () => {
    const onError = jest.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Test explosion' }),
      expect.objectContaining({ componentStack: expect.any(String) })
    );
  });

  it('renders Retry button that resets the error state', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(getByText('Retry')).toBeTruthy();
    // Note: pressing Retry resets hasError, but the child will throw again
    // immediately since shouldThrow is still true. We just verify the button exists.
    expect(queryByText('Something went wrong')).toBeTruthy();
  });

  it('renders Get Help button', () => {
    const { getByText } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow />
      </ErrorBoundary>
    );
    expect(getByText('Get Help')).toBeTruthy();
  });

  it('does not render error UI when children render successfully', () => {
    const { queryByText, getByText } = render(
      <ErrorBoundary>
        <Text>All good</Text>
      </ErrorBoundary>
    );
    expect(getByText('All good')).toBeTruthy();
    expect(queryByText('Something went wrong')).toBeNull();
  });
});
