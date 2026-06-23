import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { EmptyState } from '../EmptyState';

// Mock theme engine
jest.mock('@/theme/engine', () => ({
  useTheme: () => ({
    theme: {
      L2: {
        base: {
          text: {
            primary: '#F5F3FF',
            secondary: '#B8B3D1',
            muted: '#6B6890',
          },
        },
      },
      semantic: {
        accentPrimary: '#8B5CF6',
      },
    },
    colorScheme: 'dark',
    toggleTheme: jest.fn(),
  }),
  resolveLayerStyle: () => ({}),
}));

describe('EmptyState', () => {
  it('renders title text', () => {
    const { getByText } = render(<EmptyState icon="folder" title="No files found" />);
    expect(getByText('No files found')).toBeTruthy();
  });

  it('renders with description', () => {
    const { getByText } = render(
      <EmptyState icon="folder" title="No files" description="Upload a file to get started" />
    );
    expect(getByText('No files')).toBeTruthy();
    expect(getByText('Upload a file to get started')).toBeTruthy();
  });

  it('does not render description when not provided', () => {
    const { queryByText } = render(<EmptyState icon="folder" title="No files" />);
    expect(queryByText('Upload a file to get started')).toBeNull();
  });

  it('renders action button when actionLabel and onAction provided', () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <EmptyState icon="plus" title="Empty" actionLabel="Add Item" onAction={onAction} />
    );
    expect(getByText('Add Item')).toBeTruthy();
  });

  it('calls onAction when action button is pressed', () => {
    const onAction = jest.fn();
    const { getByText } = render(
      <EmptyState icon="plus" title="Empty" actionLabel="Add Item" onAction={onAction} />
    );
    fireEvent.press(getByText('Add Item'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('does not render action button when only actionLabel is provided without onAction', () => {
    const { queryByText } = render(
      <EmptyState icon="folder" title="Empty" actionLabel="Click me" />
    );
    expect(queryByText('Click me')).toBeNull();
  });

  it('does not render action button when only onAction is provided without actionLabel', () => {
    const onAction = jest.fn();
    const { queryByRole } = render(<EmptyState icon="folder" title="Empty" onAction={onAction} />);
    expect(queryByRole('button')).toBeNull();
  });

  it('applies testID prop', () => {
    const { getByTestId } = render(
      <EmptyState icon="folder" title="Empty" testID="empty-state-1" />
    );
    expect(getByTestId('empty-state-1')).toBeTruthy();
  });

  it('sets accessibility label with title and description', () => {
    const { getByLabelText } = render(
      <EmptyState icon="folder" title="No items" description="Try adding one" />
    );
    expect(getByLabelText('No items. Try adding one')).toBeTruthy();
  });

  it('sets accessibility label with title only when no description', () => {
    const { getByLabelText } = render(<EmptyState icon="folder" title="No items" />);
    expect(getByLabelText('No items')).toBeTruthy();
  });

  it('sets accessibilityRole header on title', () => {
    const { getByRole } = render(<EmptyState icon="folder" title="Empty" />);
    expect(getByRole('header')).toBeTruthy();
  });
});
