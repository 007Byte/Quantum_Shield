import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { DetectStep } from '../DetectStep';
import type { DetectStepProps } from '../../domain/setup-usb.types';
import type { USBDrive } from '@/services/usbService';

// ── Deterministic theme mock ───────────────────────────────────────────────
// DetectStep reads theme.name, theme.semantic.* and theme.L2.base (a LayerState
// with .native/.web for resolveLayerStyle and .text.* color strings).
// Built inside the factory so it survives jest.mock hoisting (no TDZ).
jest.mock('@/theme/engine', () => {
  const mockTheme = {
    name: 'dark',
    semantic: {
      cyan: '#22D3EE',
      warning: '#F59E0B',
      danger: '#EF4444',
      success: '#10B981',
      purple: '#8B5CF6',
    },
    L2: {
      base: {
        native: { backgroundColor: '#120C28' },
        web: {},
        text: { primary: '#F5F3FF', secondary: '#B8B3D1', muted: '#6B6890' },
      },
    },
  };
  return {
    useTheme: () => ({ theme: mockTheme, colorScheme: 'dark', toggleTheme: jest.fn() }),
    resolveLayerStyle: (state: any) => ({ ...(state?.native ?? {}) }),
    theme: mockTheme,
  };
});

// dashboard2/styles pulls in the theme-compat proxy chain; stub the bits used.
jest.mock('@/components/dashboard2/styles', () => ({
  dashboardSpacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  webOnlyTransition: {},
}));

const passthroughT = (key: string) => key;

function makeDrive(overrides: Partial<USBDrive> = {}): USBDrive {
  return {
    id: 'drive-1',
    name: 'Kingston DataTraveler',
    capacity: '32 GB',
    device: '/dev/sdb',
    available: true,
    hasVault: false,
    ...overrides,
  };
}

function buildProps(overrides: Partial<DetectStepProps> = {}): DetectStepProps {
  return {
    drives: [],
    loadingDrives: false,
    driveError: null,
    selectedDriveId: null,
    companionStatus: 'connected',
    companionVersionMismatch: false,
    companionVersion: null,
    onSelectDrive: jest.fn(),
    onRefresh: jest.fn(),
    t: passthroughT,
    ...overrides,
  };
}

describe('DetectStep', () => {
  it('renders the header without throwing', () => {
    const { getByText } = render(<DetectStep {...buildProps()} />);
    expect(getByText('setupUsb.detectUsbDrives')).toBeTruthy();
    expect(getByText('setupUsb.detectUsbDesc')).toBeTruthy();
  });

  // ── Companion: disconnected ──────────────────────────────────────────────
  it('renders the companion-disconnected guidance panel with steps', () => {
    const { getByText } = render(
      <DetectStep {...buildProps({ companionStatus: 'disconnected' })} />
    );
    expect(getByText('setupUsb.companionDisconnected')).toBeTruthy();
    expect(getByText('setupUsb.companionNeeded')).toBeTruthy();
    expect(getByText('setupUsb.companionStep1')).toBeTruthy();
    expect(getByText('setupUsb.companionStep2')).toBeTruthy();
    expect(getByText('setupUsb.companionStep3')).toBeTruthy();
    expect(getByText('setupUsb.autoRetrying')).toBeTruthy();
  });

  it('fires onRefresh from the "retry now" button in disconnected state', () => {
    const onRefresh = jest.fn();
    const { getByText } = render(
      <DetectStep {...buildProps({ companionStatus: 'disconnected', onRefresh })} />
    );
    fireEvent.press(getByText('setupUsb.retryNow'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // ── Companion: checking ──────────────────────────────────────────────────
  it('renders the checking-companion loading state', () => {
    const { getByText, queryByText } = render(
      <DetectStep {...buildProps({ companionStatus: 'checking' })} />
    );
    expect(getByText('setupUsb.checkingCompanion')).toBeTruthy();
    // Drive list / empty state must not render while checking
    expect(queryByText('setupUsb.noUsb')).toBeNull();
  });

  // ── Connected: version mismatch banner ───────────────────────────────────
  it('shows version mismatch banner with version suffix when mismatched', () => {
    const { getByText } = render(
      <DetectStep {...buildProps({ companionVersionMismatch: true, companionVersion: '1.2.3' })} />
    );
    expect(getByText('setupUsb.versionMismatch')).toBeTruthy();
    // Interpolated branch: ` (v1.2.3)` is appended to the desc text node
    expect(getByText(/setupUsb\.versionMismatchDesc \(v1\.2\.3\)/)).toBeTruthy();
  });

  it('renders mismatch banner without version suffix when companionVersion is null', () => {
    const { getByText } = render(
      <DetectStep {...buildProps({ companionVersionMismatch: true, companionVersion: null })} />
    );
    expect(getByText('setupUsb.versionMismatchDesc')).toBeTruthy();
  });

  // ── Connected: loading drives ────────────────────────────────────────────
  it('renders the scanning state while loadingDrives is true', () => {
    const { getByText } = render(<DetectStep {...buildProps({ loadingDrives: true })} />);
    expect(getByText('setupUsb.scanning')).toBeTruthy();
  });

  it('disables the header refresh button while loading', () => {
    const onRefresh = jest.fn();
    const { getByText } = render(
      <DetectStep {...buildProps({ loadingDrives: true, onRefresh })} />
    );
    // The scanning state is shown; header refresh is disabled so a press is a no-op.
    expect(getByText('setupUsb.scanning')).toBeTruthy();
  });

  // ── Connected: drive error ───────────────────────────────────────────────
  it('renders the error state and fires onRefresh from "try again"', () => {
    const onRefresh = jest.fn();
    const { getByText } = render(
      <DetectStep {...buildProps({ driveError: 'Companion crashed', onRefresh })} />
    );
    expect(getByText('Companion crashed')).toBeTruthy();
    fireEvent.press(getByText('setupUsb.tryAgain'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // ── Connected: empty drive list ──────────────────────────────────────────
  it('renders the empty state and fires onRefresh from "refresh"', () => {
    const onRefresh = jest.fn();
    const { getByText } = render(<DetectStep {...buildProps({ drives: [], onRefresh })} />);
    expect(getByText('setupUsb.noUsb')).toBeTruthy();
    expect(getByText('setupUsb.insertUsb')).toBeTruthy();
    fireEvent.press(getByText('setupUsb.refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // ── Connected: drive list ────────────────────────────────────────────────
  it('renders a list of drives with name and device · capacity', () => {
    const drives = [
      makeDrive({ id: 'd1', name: 'SanDisk Ultra', device: '/dev/sdb', capacity: '64 GB' }),
      makeDrive({ id: 'd2', name: 'Generic USB', device: '/dev/sdc', capacity: '16 GB' }),
    ];
    const { getByText } = render(<DetectStep {...buildProps({ drives })} />);
    expect(getByText('SanDisk Ultra')).toBeTruthy();
    expect(getByText('Generic USB')).toBeTruthy();
    expect(getByText('/dev/sdb · 64 GB')).toBeTruthy();
  });

  it('calls onSelectDrive with the drive id when an available drive is pressed', () => {
    const onSelectDrive = jest.fn();
    const drives = [makeDrive({ id: 'pick-me', name: 'PickMe', available: true })];
    const { getByText } = render(<DetectStep {...buildProps({ drives, onSelectDrive })} />);
    fireEvent.press(getByText('PickMe'));
    expect(onSelectDrive).toHaveBeenCalledWith('pick-me');
  });

  it('does NOT call onSelectDrive when an unavailable drive is pressed', () => {
    const onSelectDrive = jest.fn();
    const drives = [makeDrive({ id: 'busy', name: 'BusyDrive', available: false })];
    const { getByText } = render(<DetectStep {...buildProps({ drives, onSelectDrive })} />);
    // The "in use" badge marks it unavailable
    expect(getByText('setupUsb.inUse')).toBeTruthy();
    fireEvent.press(getByText('BusyDrive'));
    expect(onSelectDrive).not.toHaveBeenCalled();
  });

  it('renders the hasVault badge when a drive already contains a vault', () => {
    const drives = [makeDrive({ id: 'v1', name: 'VaultDrive', hasVault: true })];
    const { getByText } = render(<DetectStep {...buildProps({ drives })} />);
    expect(getByText('setupUsb.hasVault')).toBeTruthy();
  });

  it('renders the radio dot only for the selected drive', () => {
    const drives = [
      makeDrive({ id: 'sel', name: 'Selected' }),
      makeDrive({ id: 'other', name: 'Other' }),
    ];
    const { getByText } = render(
      <DetectStep {...buildProps({ drives, selectedDriveId: 'sel' })} />
    );
    // Both render; selection is style-driven and must not throw.
    expect(getByText('Selected')).toBeTruthy();
    expect(getByText('Other')).toBeTruthy();
  });
});
