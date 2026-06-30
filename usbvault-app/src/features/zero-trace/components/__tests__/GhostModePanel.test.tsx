/**
 * Render tests for GhostModePanel.
 *
 * GhostModePanel imports only static constants (ztColors, dashboardSpacing),
 * so no module mocks are required beyond the shared component setup.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GhostModePanel } from '../GhostModePanel';
import type { GhostModeSettings } from '../../domain/zero-trace.types';

// A translation function that returns null so each ToggleRow falls back to its
// hard-coded English label — this lets us assert on the real visible strings.
const t = (_key: string) => undefined as unknown as string;

const baseSettings: GhostModeSettings = {
  enabled: false,
  ramScrubOnLock: true,
  ramScrubOnLogout: false,
  clipboardAutoClean: true,
  clipboardCleanDelaySec: 30,
  metadataSanitization: false,
  journalCleanup: true,
  autoCleanScheduleMinutes: 15,
};

describe('GhostModePanel', () => {
  it('renders the master Ghost Mode toggle row', () => {
    const { getByText } = render(
      <GhostModePanel
        settings={baseSettings}
        onToggle={jest.fn()}
        onUpdateSetting={jest.fn()}
        t={t}
      />
    );
    expect(getByText('Ghost Mode')).toBeTruthy();
    expect(getByText('Automatically eliminate digital footprints')).toBeTruthy();
  });

  it('hides sub-option toggles when ghost mode is disabled', () => {
    const { queryByText } = render(
      <GhostModePanel
        settings={{ ...baseSettings, enabled: false }}
        onToggle={jest.fn()}
        onUpdateSetting={jest.fn()}
        t={t}
      />
    );
    expect(queryByText('Clipboard Auto-Clean')).toBeNull();
    expect(queryByText('Metadata Sanitization')).toBeNull();
    expect(queryByText('Memory Scrub on Lock')).toBeNull();
    expect(queryByText('Journal Cleanup')).toBeNull();
  });

  it('shows all five sub-option toggles when ghost mode is enabled', () => {
    const { getByText } = render(
      <GhostModePanel
        settings={{ ...baseSettings, enabled: true }}
        onToggle={jest.fn()}
        onUpdateSetting={jest.fn()}
        t={t}
      />
    );
    expect(getByText('Clipboard Auto-Clean')).toBeTruthy();
    expect(getByText('Metadata Sanitization')).toBeTruthy();
    expect(getByText('Memory Scrub on Lock')).toBeTruthy();
    expect(getByText('Memory Scrub on Logout')).toBeTruthy();
    expect(getByText('Journal Cleanup')).toBeTruthy();
  });

  it('interpolates clipboard delay seconds into the description', () => {
    const { getByText } = render(
      <GhostModePanel
        settings={{ ...baseSettings, enabled: true, clipboardCleanDelaySec: 45 }}
        onToggle={jest.fn()}
        onUpdateSetting={jest.fn()}
        t={t}
      />
    );
    expect(getByText('Clear clipboard 45s after copy')).toBeTruthy();
  });

  it('fires onToggle when the master toggle is pressed', () => {
    const onToggle = jest.fn();
    const { getByText } = render(
      <GhostModePanel
        settings={baseSettings}
        onToggle={onToggle}
        onUpdateSetting={jest.fn()}
        t={t}
      />
    );
    fireEvent.press(getByText('Ghost Mode'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('fires onUpdateSetting with the negated value for each sub-toggle', () => {
    const onUpdateSetting = jest.fn();
    const settings = {
      ...baseSettings,
      enabled: true,
      clipboardAutoClean: true,
      metadataSanitization: false,
      ramScrubOnLock: true,
      ramScrubOnLogout: false,
      journalCleanup: true,
    };
    const { getByText } = render(
      <GhostModePanel
        settings={settings}
        onToggle={jest.fn()}
        onUpdateSetting={onUpdateSetting}
        t={t}
      />
    );

    fireEvent.press(getByText('Clipboard Auto-Clean'));
    expect(onUpdateSetting).toHaveBeenCalledWith('clipboardAutoClean', false);

    fireEvent.press(getByText('Metadata Sanitization'));
    expect(onUpdateSetting).toHaveBeenCalledWith('metadataSanitization', true);

    fireEvent.press(getByText('Memory Scrub on Lock'));
    expect(onUpdateSetting).toHaveBeenCalledWith('ramScrubOnLock', false);

    fireEvent.press(getByText('Memory Scrub on Logout'));
    expect(onUpdateSetting).toHaveBeenCalledWith('ramScrubOnLogout', true);

    fireEvent.press(getByText('Journal Cleanup'));
    expect(onUpdateSetting).toHaveBeenCalledWith('journalCleanup', false);

    expect(onUpdateSetting).toHaveBeenCalledTimes(5);
  });

  it('prefers translated labels when the translation function returns a value', () => {
    const translate = (key: string) =>
      key === 'zeroTrace.ghostMode' ? 'Stealth Mode' : undefined;
    const { getByText, queryByText } = render(
      <GhostModePanel
        settings={baseSettings}
        onToggle={jest.fn()}
        onUpdateSetting={jest.fn()}
        t={translate as (k: string) => string | undefined}
      />
    );
    expect(getByText('Stealth Mode')).toBeTruthy();
    expect(queryByText('Ghost Mode')).toBeNull();
  });
});
