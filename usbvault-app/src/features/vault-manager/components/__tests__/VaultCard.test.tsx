import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { VaultCard } from '../VaultCard';
import type { VaultCardData } from '../../domain/vault-manager.types';

// ── Theme engine mock ──────────────────────────────────────────────────
// Returns a usable theme tree so resolveLayerStyle and inline style lookups
// (theme.L2.base.*, theme.semantic.*) don't throw during render. Defined
// inside the factory because the `theme` proxy is read at module-init time
// (StyleSheet.create), before top-level test consts initialize.
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

// vaultOrchestrator singleton — VaultCard reads getIndex() for the ground-truth
// file count. Default: no index, so it falls back to vault.fileCount.
const mockGetIndex = jest.fn(() => null as { files: Record<string, unknown> } | null);
jest.mock('@/services/vaultOrchestrator', () => ({
  vaultOrchestrator: {
    getIndex: () => mockGetIndex(),
  },
}));

function makeVault(overrides: Partial<VaultCardData> = {}): VaultCardData {
  return {
    id: 'vault-7f3a9c',
    name: 'Personal Vault',
    fileCount: 12,
    lastModified: new Date().toISOString(),
    securityLevel: 'high',
    ...overrides,
  };
}

function makeActions() {
  return {
    onOpen: jest.fn(),
    onRename: jest.fn(),
    onExport: jest.fn(),
    onDelete: jest.fn(),
  };
}

describe('VaultCard', () => {
  beforeEach(() => {
    mockGetIndex.mockReturnValue(null);
  });

  it('renders the vault name and action labels', () => {
    const { getByText } = render(
      <VaultCard vault={makeVault()} isActive={false} {...makeActions()} />
    );
    expect(getByText('Personal Vault')).toBeTruthy();
    expect(getByText('vaultManager.open')).toBeTruthy();
    expect(getByText('vaultManager.rename')).toBeTruthy();
    expect(getByText('vaultManager.export')).toBeTruthy();
    expect(getByText('vaultManager.delete')).toBeTruthy();
    expect(getByText('PQC-256')).toBeTruthy();
  });

  it('shows the active indicator when isActive is true', () => {
    const { getByText } = render(
      <VaultCard vault={makeVault()} isActive {...makeActions()} />
    );
    expect(getByText('vaultManager.active')).toBeTruthy();
  });

  it('hides the active indicator when isActive is false', () => {
    const { queryByText } = render(
      <VaultCard vault={makeVault()} isActive={false} {...makeActions()} />
    );
    expect(queryByText('vaultManager.active')).toBeNull();
  });

  it('falls back to vault.fileCount when orchestrator has no index', () => {
    mockGetIndex.mockReturnValue(null);
    const { getAllByText } = render(
      <VaultCard vault={makeVault({ fileCount: 12 })} isActive={false} {...makeActions()} />
    );
    // file count appears in the description line and the stats value
    expect(getAllByText('12').length).toBeGreaterThan(0);
  });

  it('prefers the orchestrator index file count when available', () => {
    mockGetIndex.mockReturnValue({ files: { a: 1, b: 1, c: 1 } });
    const { getAllByText } = render(
      <VaultCard vault={makeVault({ fileCount: 12 })} isActive={false} {...makeActions()} />
    );
    // 3 keys in the index override the prop value of 12
    expect(getAllByText('3').length).toBeGreaterThan(0);
  });

  it('renders the Maximum security badge label', () => {
    const { getByText } = render(
      <VaultCard
        vault={makeVault({ securityLevel: 'maximum' })}
        isActive={false}
        {...makeActions()}
      />
    );
    expect(getByText('vaultManager.max')).toBeTruthy();
  });

  it('renders the High security badge label', () => {
    const { getByText } = render(
      <VaultCard
        vault={makeVault({ securityLevel: 'high' })}
        isActive={false}
        {...makeActions()}
      />
    );
    expect(getByText('vaultManager.high')).toBeTruthy();
  });

  it('renders the Standard security badge label', () => {
    const { getByText } = render(
      <VaultCard
        vault={makeVault({ securityLevel: 'standard' })}
        isActive={false}
        {...makeActions()}
      />
    );
    expect(getByText('vaultManager.standard')).toBeTruthy();
  });

  it('fires onOpen with the vault id', () => {
    const actions = makeActions();
    const { getByText } = render(
      <VaultCard vault={makeVault()} isActive={false} {...actions} />
    );
    fireEvent.press(getByText('vaultManager.open'));
    expect(actions.onOpen).toHaveBeenCalledWith('vault-7f3a9c');
  });

  it('fires onRename with id and name', () => {
    const actions = makeActions();
    const { getByText } = render(
      <VaultCard vault={makeVault()} isActive={false} {...actions} />
    );
    fireEvent.press(getByText('vaultManager.rename'));
    expect(actions.onRename).toHaveBeenCalledWith('vault-7f3a9c', 'Personal Vault');
  });

  it('fires onExport with id and name', () => {
    const actions = makeActions();
    const { getByText } = render(
      <VaultCard vault={makeVault()} isActive={false} {...actions} />
    );
    fireEvent.press(getByText('vaultManager.export'));
    expect(actions.onExport).toHaveBeenCalledWith('vault-7f3a9c', 'Personal Vault');
  });

  it('fires onDelete with id and name', () => {
    const actions = makeActions();
    const { getByText } = render(
      <VaultCard vault={makeVault()} isActive={false} {...actions} />
    );
    fireEvent.press(getByText('vaultManager.delete'));
    expect(actions.onDelete).toHaveBeenCalledWith('vault-7f3a9c', 'Personal Vault');
  });

  it('resolves the hovered style branch for every action button', () => {
    const { UNSAFE_root } = render(
      <VaultCard vault={makeVault()} isActive={false} {...makeActions()} />
    );
    const styleFns = collectStyleFns(UNSAFE_root);
    expect(styleFns.length).toBeGreaterThan(0);
    // Each action button uses a style callback that branches on state.hovered.
    styleFns.forEach(fn => {
      expect(() => fn({ hovered: true })).not.toThrow();
      expect(() => fn({ hovered: false })).not.toThrow();
    });
  });
});

// Walk the rendered tree and collect every function-valued `style` prop
// (the Pressable hover-style callbacks), so both the hovered/non-hovered
// branches can be exercised.
function collectStyleFns(root: any): Array<(s: any) => unknown> {
  const fns: Array<(s: any) => unknown> = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (node.props && typeof node.props.style === 'function') {
      fns.push(node.props.style);
    }
    const kids = node.children;
    if (Array.isArray(kids)) kids.forEach(visit);
  };
  visit(root);
  return fns;
}
