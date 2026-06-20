import React from 'react';
import { render } from '@testing-library/react-native';
import { SkeletonLine, SkeletonCard, SkeletonTable, SkeletonAvatar } from '../SkeletonLoader';

// Mock the useReducedMotion hook
jest.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));

describe('SkeletonLine', () => {
  it('renders without crashing with default props', () => {
    const { toJSON } = render(<SkeletonLine />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with custom width and height', () => {
    const { toJSON } = render(<SkeletonLine width="50%" height={20} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with numeric width', () => {
    const { toJSON } = render(<SkeletonLine width={200} height={10} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom style', () => {
    const { toJSON } = render(<SkeletonLine style={{ marginBottom: 8 }} />);
    expect(toJSON()).toBeTruthy();
  });
});

describe('SkeletonCard', () => {
  it('renders with default 3 lines', () => {
    const { toJSON } = render(<SkeletonCard />);
    const tree = toJSON();
    expect(tree).toBeTruthy();
  });

  it('renders with custom line count', () => {
    const { toJSON } = render(<SkeletonCard lines={5} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with 1 line', () => {
    const { toJSON } = render(<SkeletonCard lines={1} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom style', () => {
    const { toJSON } = render(<SkeletonCard style={{ margin: 16 }} />);
    expect(toJSON()).toBeTruthy();
  });
});

describe('SkeletonTable', () => {
  it('renders with default 5 rows', () => {
    const { toJSON } = render(<SkeletonTable />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with custom row count', () => {
    const { toJSON } = render(<SkeletonTable rowCount={3} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with 0 rows (header only)', () => {
    const { toJSON } = render(<SkeletonTable rowCount={0} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom style', () => {
    const { toJSON } = render(<SkeletonTable style={{ padding: 8 }} />);
    expect(toJSON()).toBeTruthy();
  });
});

describe('SkeletonAvatar', () => {
  it('renders with default size (40)', () => {
    const { toJSON } = render(<SkeletonAvatar />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with custom size', () => {
    const { toJSON } = render(<SkeletonAvatar size={64} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with small size', () => {
    const { toJSON } = render(<SkeletonAvatar size={16} />);
    expect(toJSON()).toBeTruthy();
  });

  it('accepts custom style', () => {
    const { toJSON } = render(<SkeletonAvatar style={{ marginRight: 12 }} />);
    expect(toJSON()).toBeTruthy();
  });
});
