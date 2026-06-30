import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { VaultGrid } from '../VaultGrid';

// Walk the rendered tree and collect every function-valued `style` prop
// (the Pressable hover-style callbacks) so both branches can be exercised.
function collectStyleFns(root: any): Array<(s: any) => unknown> {
  const fns: Array<(s: any) => unknown> = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.props && typeof node.props.style === 'function') fns.push(node.props.style);
    if (Array.isArray(node.children)) node.children.forEach(visit);
  };
  visit(root);
  return fns;
}
import type { VaultCardData } from '../../domain/vault-manager.types';

jest.mock('@/theme/engine', () => {
  const mockTheme = {
    name: 'dark',
    L2: {
      base: {
        native: { backgroundColor: '#120C28', borderColor: 'rgba(139,92,246,0.3)' },
        web: {},
        text: { primary: '#F5F3FF', secondary: '#B8B3D1' },
      },
    },
    semantic: {
      blue: '#3B82F6',
      cyan: '#22D3EE',
      danger: '#EF4444',
      purple: '#8B5CF6',
      success: '#10B981',
    },
  };
  return {
    useTheme: () => ({ theme: mockTheme, colorScheme: 'dark', toggleTheme: jest.fn() }),
    theme: mockTheme,
    getTheme: () => mockTheme,
    resolveLayerStyle: (state: any) => ({ ...(state?.native || {}) }),
    resolveLayerStyleWith: (state: any, overrides: any) => ({
      ...(state?.native || {}),
      ...(overrides || {}),
    }),
  };
});

// VaultCard renders a vaultOrchestrator singleton; keep it deterministic.
jest.mock('@/services/vaultOrchestrator', () => ({
  vaultOrchestrator: { getIndex: () => null },
}));

// i18n is mocked in jest.setup.components.js, but VaultGrid takes `t` via props.
const t = (key: string) => key;

function makeVault(id: string, name: string): VaultCardData {
  return {
    id,
    name,
    fileCount: 4,
    lastModified: new Date().toISOString(),
    securityLevel: 'high',
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    vaults: [] as VaultCardData[],
    currentVaultId: null as string | null,
    isLoading: false,
    onCreateVault: jest.fn(),
    onOpen: jest.fn(),
    onRename: jest.fn(),
    onExport: jest.fn(),
    onDelete: jest.fn(),
    t,
    ...overrides,
  };
}

describe('VaultGrid', () => {
  it('renders the section header and count badge', () => {
    const { getByText } = render(<VaultGrid {...(makeProps() as any)} />);
    expect(getByText('vaultManager.yourVaults')).toBeTruthy();
    // count badge shows 0 for empty list
    expect(getByText('0')).toBeTruthy();
  });

  it('shows the empty state when no vaults and not loading', () => {
    const { getByText } = render(<VaultGrid {...(makeProps() as any)} />);
    expect(getByText('vaultManager.noVaults')).toBeTruthy();
    expect(getByText('vaultManager.createFirst')).toBeTruthy();
    expect(getByText('vaultManager.createVault')).toBeTruthy();
  });

  it('fires onCreateVault from the empty-state CTA', () => {
    const onCreateVault = jest.fn();
    const { getByText } = render(
      <VaultGrid {...(makeProps({ onCreateVault }) as any)} />
    );
    fireEvent.press(getByText('vaultManager.createVault'));
    expect(onCreateVault).toHaveBeenCalledTimes(1);
  });

  it('shows skeleton loaders when loading with no vaults (no empty state)', () => {
    const { queryByText } = render(
      <VaultGrid {...(makeProps({ isLoading: true }) as any)} />
    );
    // empty state must NOT render while loading
    expect(queryByText('vaultManager.noVaults')).toBeNull();
  });

  it('renders one VaultCard per vault and shows the count', () => {
    const vaults = [makeVault('v-1a2b', 'Work'), makeVault('v-3c4d', 'Travel')];
    const { getByText } = render(
      <VaultGrid {...(makeProps({ vaults }) as any)} />
    );
    expect(getByText('Work')).toBeTruthy();
    expect(getByText('Travel')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
    // empty state suppressed when populated
  });

  it('does not render the empty state when vaults are present', () => {
    const vaults = [makeVault('v-3c4d', 'Travel')];
    const { queryByText } = render(
      <VaultGrid {...(makeProps({ vaults }) as any)} />
    );
    expect(queryByText('vaultManager.noVaults')).toBeNull();
  });

  it('marks the active vault and forwards onOpen through the card', () => {
    const onOpen = jest.fn();
    const vaults = [makeVault('v-active', 'Active One')];
    const { getByText, getAllByText } = render(
      <VaultGrid {...(makeProps({ vaults, currentVaultId: 'v-active', onOpen }) as any)} />
    );
    // active indicator from the child card
    expect(getByText('vaultManager.active')).toBeTruthy();
    fireEvent.press(getAllByText('vaultManager.open')[0]);
    expect(onOpen).toHaveBeenCalledWith('v-active');
  });

  it('resolves the empty-state CTA hovered style branch', () => {
    const { UNSAFE_root } = render(<VaultGrid {...(makeProps() as any)} />);
    const fns = collectStyleFns(UNSAFE_root);
    expect(fns.length).toBeGreaterThan(0);
    fns.forEach(fn => {
      expect(() => fn({ hovered: true })).not.toThrow();
      expect(() => fn({ hovered: false })).not.toThrow();
    });
  });
});
