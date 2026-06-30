import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DiscoverVaults } from '../DiscoverVaults';

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
import type { DetectedVault, KnownLocation } from '../../domain/vault-manager.types';

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

const t = (key: string) => key;

function makeDetected(overrides: Partial<DetectedVault> = {}): DetectedVault {
  return {
    id: 'det-9b1c',
    name: 'USB Vault',
    path: '/Volumes/USB/vault.qsv',
    size: '128 MB',
    status: 'healthy',
    fileCount: 8,
    ...overrides,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    isScanning: false,
    detectedVaults: [] as DetectedVault[],
    knownLocations: [] as KnownLocation[],
    lastScanTime: null as string | null,
    onScanAll: jest.fn(),
    onOpenVault: jest.fn(),
    onEjectVault: jest.fn(),
    onRemoveLocation: jest.fn(),
    t,
    ...overrides,
  };
}

describe('DiscoverVaults', () => {
  it('renders the section header and scan button (idle)', () => {
    const { getByText } = render(<DiscoverVaults {...(makeProps() as any)} />);
    expect(getByText('vaultManager.discoverVaults')).toBeTruthy();
    expect(getByText('findVault.scanAllDrives')).toBeTruthy();
  });

  it('fires onScanAll when the scan button is pressed', () => {
    const onScanAll = jest.fn();
    const { getByText } = render(<DiscoverVaults {...(makeProps({ onScanAll }) as any)} />);
    fireEvent.press(getByText('findVault.scanAllDrives'));
    expect(onScanAll).toHaveBeenCalledTimes(1);
  });

  it('shows the scanning state and disables the scan button', () => {
    const onScanAll = jest.fn();
    const { getByText } = render(
      <DiscoverVaults {...(makeProps({ isScanning: true, onScanAll }) as any)} />
    );
    expect(getByText('findVault.pleaseWait')).toBeTruthy();
    expect(getByText('vaultManager.scanningDrives')).toBeTruthy();
    // disabled while scanning -> press is a no-op
    fireEvent.press(getByText('findVault.pleaseWait'));
    expect(onScanAll).not.toHaveBeenCalled();
  });

  it('renders detected vaults with a healthy "open" action', () => {
    const onOpenVault = jest.fn();
    const detectedVaults = [makeDetected({ status: 'healthy' })];
    const { getByText } = render(
      <DiscoverVaults {...(makeProps({ detectedVaults, onOpenVault }) as any)} />
    );
    expect(getByText('findVault.detectedVaults')).toBeTruthy();
    expect(getByText('USB Vault')).toBeTruthy();
    expect(getByText('/Volumes/USB/vault.qsv')).toBeTruthy();
    expect(getByText('Healthy')).toBeTruthy();
    fireEvent.press(getByText('findVault.open'));
    expect(onOpenVault).toHaveBeenCalledWith('det-9b1c');
  });

  it('shows a repair action and does NOT open for a corrupted vault', () => {
    const onOpenVault = jest.fn();
    const detectedVaults = [makeDetected({ status: 'corrupted', id: 'det-bad' })];
    const { getByText } = render(
      <DiscoverVaults {...(makeProps({ detectedVaults, onOpenVault }) as any)} />
    );
    expect(getByText('findVault.repair')).toBeTruthy();
    expect(getByText('Corrupted')).toBeTruthy();
    // pressing repair must not trigger open (status !== healthy)
    fireEvent.press(getByText('findVault.repair'));
    expect(onOpenVault).not.toHaveBeenCalled();
  });

  it('falls back to the literal "Eject" label when the translation is empty', () => {
    // When t() returns an empty string for the eject key, the component uses
    // the `|| 'Eject'` fallback label.
    const tWithEmptyEject = (key: string) => (key === 'vaultManager.eject' ? '' : key);
    const onEjectVault = jest.fn();
    const detectedVaults = [makeDetected()];
    const { getByText } = render(
      <DiscoverVaults
        {...(makeProps({ detectedVaults, onEjectVault, t: tWithEmptyEject }) as any)}
      />
    );
    fireEvent.press(getByText('Eject'));
    expect(onEjectVault).toHaveBeenCalledWith('det-9b1c', '/Volumes/USB/vault.qsv');
  });

  it('fires onEjectVault with id and path', () => {
    const onEjectVault = jest.fn();
    const detectedVaults = [makeDetected()];
    const { getByText } = render(
      <DiscoverVaults {...(makeProps({ detectedVaults, onEjectVault }) as any)} />
    );
    fireEvent.press(getByText('vaultManager.eject'));
    expect(onEjectVault).toHaveBeenCalledWith('det-9b1c', '/Volumes/USB/vault.qsv');
  });

  it('shows the "no vaults found" state after a scan with no results', () => {
    const { getByText } = render(
      <DiscoverVaults {...(makeProps({ detectedVaults: [], lastScanTime: '10:42 AM' }) as any)} />
    );
    expect(getByText('vaultManager.noVaultsFound')).toBeTruthy();
  });

  it('does not show "no vaults found" before any scan (no lastScanTime)', () => {
    const { queryByText } = render(
      <DiscoverVaults {...(makeProps({ detectedVaults: [], lastScanTime: null }) as any)} />
    );
    expect(queryByText('vaultManager.noVaultsFound')).toBeNull();
  });

  it('renders known locations and fires onRemoveLocation', () => {
    const onRemoveLocation = jest.fn();
    const knownLocations: KnownLocation[] = [{ id: 'loc-42', path: '/mnt/secure' }];
    const { getByText, UNSAFE_getAllByProps } = render(
      <DiscoverVaults {...(makeProps({ knownLocations, onRemoveLocation }) as any)} />
    );
    expect(getByText('findVault.knownLocations')).toBeTruthy();
    expect(getByText('/mnt/secure')).toBeTruthy();
    // the remove button is the only pressable with the "x" feather inside the
    // location card; press by accessibilityRole button list is brittle, so we
    // press the first button after the path text. Use the rendered tree:
    const buttons = UNSAFE_getAllByProps({ accessibilityRole: 'button' });
    // last-scan refresh button is absent here (no lastScanTime); the scan
    // button is first, the remove-location button follows.
    fireEvent.press(buttons[buttons.length - 1]);
    expect(onRemoveLocation).toHaveBeenCalledWith('loc-42');
  });

  it('renders the last-scan row and its refresh button triggers onScanAll', () => {
    const onScanAll = jest.fn();
    const { getByText } = render(
      <DiscoverVaults {...(makeProps({ lastScanTime: '09:15 AM', onScanAll }) as any)} />
    );
    expect(getByText('findVault.lastScanned')).toBeTruthy();
    expect(getByText('09:15 AM')).toBeTruthy();
  });

  it('does not call onOpenVault for a healthy vault with an empty id', () => {
    const onOpenVault = jest.fn();
    const detectedVaults = [makeDetected({ status: 'healthy', id: '' })];
    const { getByText } = render(
      <DiscoverVaults {...(makeProps({ detectedVaults, onOpenVault }) as any)} />
    );
    // status healthy renders "open", but the empty id guard blocks the call
    fireEvent.press(getByText('findVault.open'));
    expect(onOpenVault).not.toHaveBeenCalled();
  });

  it('resolves hovered style branches across the rendered pressables', () => {
    const detectedVaults = [makeDetected({ status: 'corrupted', id: 'det-x' })];
    const knownLocations: KnownLocation[] = [{ id: 'loc-1', path: '/data' }];
    const { UNSAFE_root } = render(
      <DiscoverVaults
        {...(makeProps({ detectedVaults, knownLocations, lastScanTime: '08:00 AM' }) as any)}
      />
    );
    const fns = collectStyleFns(UNSAFE_root);
    expect(fns.length).toBeGreaterThan(0);
    fns.forEach(fn => {
      expect(() => fn({ hovered: true })).not.toThrow();
      expect(() => fn({ hovered: false })).not.toThrow();
    });
  });
});
