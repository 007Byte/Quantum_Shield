/**
 * Render tests for CleanupTiers.
 *
 * CleanupTiers is the only zero-trace component that touches the theme
 * engine (useTheme / resolveLayerStyle). We mock @/theme/engine so it
 * returns a deterministic, usable theme object and style resolution does
 * not depend on the zustand theme store. Everything else (the nested
 * GhostModePanel / AppArtifactList / OsArtifactList) renders for real.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockTheme = {
  name: 'dark',
  L2: {
    base: {
      native: {
        backgroundColor: '#100A24',
        borderColor: 'rgba(34,211,238,0.12)',
        borderWidth: 1,
      },
      web: {},
    },
  },
};

jest.mock('@/theme/engine', () => ({
  // getTheme is pulled in transitively via dashboard2/styles -> compat.ts,
  // which only reads `.name` off the returned theme.
  getTheme: () => mockTheme,
  theme: mockTheme,
  useTheme: () => ({
    theme: mockTheme,
    colorScheme: 'dark',
    toggleTheme: jest.fn(),
  }),
  resolveLayerStyle: (state: { native?: object }) => ({ ...(state?.native ?? {}) }),
}));

import { CleanupTiers } from '../CleanupTiers';
import type { ScanResults, OsScanResults, GhostModeSettings } from '../../domain/zero-trace.types';

const t = (_key: string) => undefined as unknown as string;

const settings: GhostModeSettings = {
  enabled: false,
  ramScrubOnLock: true,
  ramScrubOnLogout: false,
  clipboardAutoClean: true,
  clipboardCleanDelaySec: 30,
  metadataSanitization: false,
  journalCleanup: true,
  autoCleanScheduleMinutes: 15,
};

const appScanResults: ScanResults = {
  count: 2,
  riskLevel: 'high',
  artifacts: [
    {
      id: 'clipboard-residual',
      severity: 'critical',
      description: 'Clipboard contains a copied vault password',
      canRemediate: true,
    },
    {
      id: 'cache-warning',
      severity: 'warning',
      description: 'Cached thumbnail preview detected',
      canRemediate: false,
    },
  ],
  categoryStatuses: [
    {
      category: 'clipboard',
      label: 'Clipboard',
      description: 'Copied credentials and secrets',
      status: 'dirty',
      lastCleaned: null,
      canClean: true,
    },
  ],
};

const osScanResults: OsScanResults = {
  count: 1,
  artifacts: ['/Volumes/USBVault/.DS_Store'],
};

const osCleaners = [
  { label: '.DS_Store files', icon: 'file' },
  { label: 'Spotlight Index', icon: 'search' },
];

const adminCleaners = ['Spotlight re-index with sudo', 'Purge system swap'];

const baseProps = {
  companionAvailable: false,
  scanning: false,
  cleaning: false,
  settings,
  appScanResults,
  osScanResults,
  osCleaners,
  adminCleaners,
  adminState: { elevating: false },
  onGhostModeToggle: jest.fn(),
  onUpdateSetting: jest.fn(),
  onAppScan: jest.fn(),
  onAppClean: jest.fn(),
  onOsScan: jest.fn(),
  onOsClean: jest.fn(),
  onAdminClean: jest.fn(),
  t,
};

describe('CleanupTiers', () => {
  it('renders the App-Level and OS-Level tier cards', () => {
    const { getByText } = render(<CleanupTiers {...baseProps} />);
    expect(getByText('App-Level Protection')).toBeTruthy();
    expect(getByText('Always Active')).toBeTruthy();
    expect(getByText('OS-Level Cleanup')).toBeTruthy();
  });

  it('embeds the GhostModePanel master toggle', () => {
    const { getByText } = render(<CleanupTiers {...baseProps} />);
    expect(getByText('Ghost Mode')).toBeTruthy();
  });

  it('embeds the app artifact list when appScanResults is provided', () => {
    const { getByText } = render(<CleanupTiers {...baseProps} />);
    expect(getByText('2 traces detected')).toBeTruthy();
    expect(getByText('Clipboard contains a copied vault password')).toBeTruthy();
  });

  it('omits the app artifact list when appScanResults is null', () => {
    const { queryByText } = render(
      <CleanupTiers {...baseProps} appScanResults={null} />
    );
    expect(queryByText('2 traces detected')).toBeNull();
  });

  it('fires onAppScan when the App scan button is pressed', () => {
    const onAppScan = jest.fn();
    const { getByText } = render(
      <CleanupTiers {...baseProps} onAppScan={onAppScan} />
    );
    fireEvent.press(getByText('Scan App Traces'));
    expect(onAppScan).toHaveBeenCalledTimes(1);
  });

  it('shows scanning/cleaning labels and disables action buttons in flight', () => {
    const onAppScan = jest.fn();
    const onAppClean = jest.fn();
    const { getAllByText } = render(
      <CleanupTiers
        {...baseProps}
        scanning={true}
        cleaning={true}
        onAppScan={onAppScan}
        onAppClean={onAppClean}
      />
    );
    // Both App and OS action rows show scanning/cleaning, but OS is hidden
    // when companion is unavailable, so only the App row is present here.
    expect(getAllByText('Scanning...').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Cleaning...').length).toBeGreaterThanOrEqual(1);
    fireEvent.press(getAllByText('Scanning...')[0]);
    fireEvent.press(getAllByText('Cleaning...')[0]);
    expect(onAppScan).not.toHaveBeenCalled();
    expect(onAppClean).not.toHaveBeenCalled();
  });

  it('shows the companion-required overlay and hides OS tooling when companion is unavailable', () => {
    const { getByText, queryByText } = render(
      <CleanupTiers {...baseProps} companionAvailable={false} />
    );
    expect(getByText('Companion Required')).toBeTruthy();
    expect(
      getByText(/USB Companion Required/)
    ).toBeTruthy();
    // OS cleaner items and OS scan controls are not rendered.
    expect(queryByText('.DS_Store files')).toBeNull();
    expect(queryByText('Scan OS Traces')).toBeNull();
  });

  it('does not render the Admin-Level card when companion is unavailable', () => {
    const { queryByText } = render(
      <CleanupTiers {...baseProps} companionAvailable={false} />
    );
    expect(queryByText('Admin-Level Cleanup')).toBeNull();
  });

  it('renders OS cleaner list, OS artifacts, and the Admin card when companion is available', () => {
    const { getByText } = render(
      <CleanupTiers {...baseProps} companionAvailable={true} />
    );
    expect(getByText('Companion Ready')).toBeTruthy();
    expect(getByText('.DS_Store files')).toBeTruthy();
    expect(getByText('Spotlight Index')).toBeTruthy();
    // OS artifact list (from OsArtifactList) renders the artifact entry.
    expect(getByText('1 OS artifact found')).toBeTruthy();
    expect(getByText('/Volumes/USBVault/.DS_Store')).toBeTruthy();
    // Admin card and its cleaners.
    expect(getByText('Admin-Level Cleanup')).toBeTruthy();
    expect(getByText('Requires Password')).toBeTruthy();
    expect(getByText('Spotlight re-index with sudo')).toBeTruthy();
    expect(getByText('Purge system swap')).toBeTruthy();
  });

  it('fires onOsScan and onAdminClean when companion is available', () => {
    const onOsScan = jest.fn();
    const onAdminClean = jest.fn();
    const { getByText } = render(
      <CleanupTiers
        {...baseProps}
        companionAvailable={true}
        onOsScan={onOsScan}
        onAdminClean={onAdminClean}
      />
    );
    fireEvent.press(getByText('Scan OS Traces'));
    expect(onOsScan).toHaveBeenCalledTimes(1);
    fireEvent.press(getByText('Clean with Admin'));
    expect(onAdminClean).toHaveBeenCalledTimes(1);
  });

  it('shows the elevating label and blocks onAdminClean while elevating', () => {
    const onAdminClean = jest.fn();
    const { getByText, queryByText } = render(
      <CleanupTiers
        {...baseProps}
        companionAvailable={true}
        adminState={{ elevating: true }}
        onAdminClean={onAdminClean}
      />
    );
    expect(getByText('Authorizing...')).toBeTruthy();
    expect(queryByText('Clean with Admin')).toBeNull();
    fireEvent.press(getByText('Authorizing...'));
    expect(onAdminClean).not.toHaveBeenCalled();
  });

  it('omits the OS artifact list when osScanResults is null but companion is available', () => {
    const { queryByText, getByText } = render(
      <CleanupTiers
        {...baseProps}
        companionAvailable={true}
        osScanResults={null}
      />
    );
    expect(queryByText('1 OS artifact found')).toBeNull();
    // OS cleaner list still renders.
    expect(getByText('.DS_Store files')).toBeTruthy();
  });
});
