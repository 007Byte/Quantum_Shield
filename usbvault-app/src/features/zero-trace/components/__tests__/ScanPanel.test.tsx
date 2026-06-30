/**
 * Render tests for ScanPanel.
 *
 * ScanPanel imports webStyle (a pure helper that returns {} off web) and
 * static zero-trace constants, so no module mocks are required beyond the
 * shared component setup.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { ScanPanel } from '../ScanPanel';
import type { CleanupSummary } from '../../domain/zero-trace.types';

// Returns the hard-coded English fallbacks (returns undefined for plain keys),
// but interpolates the cleanup-summary template when options are provided.
const t = (key: string, options?: Record<string, unknown>) => {
  if (key === 'zeroTrace.cleanupSummary' && options) {
    return `${options.completed}/${options.total} tier${options.plural} completed`;
  }
  return undefined as unknown as string;
};

const baseProps = {
  companionAvailable: false,
  cleaning: false,
  scanning: false,
  cleanupSummary: null,
  onFullCleanup: jest.fn(),
  onDismissSummary: jest.fn(),
  t,
};

describe('ScanPanel', () => {
  it('renders the page title and subtitle', () => {
    const { getByText, getByRole } = render(<ScanPanel {...baseProps} />);
    expect(getByText('Zero-Trace Mode')).toBeTruthy();
    expect(
      getByText('Eliminate forensic evidence across three tiers of cleanup')
    ).toBeTruthy();
    expect(getByRole('header')).toBeTruthy();
  });

  it('shows the disconnected companion pill when companion is unavailable', () => {
    const { getByText, queryByText } = render(
      <ScanPanel {...baseProps} companionAvailable={false} />
    );
    expect(getByText('Not Connected')).toBeTruthy();
    expect(queryByText('USB Companion Connected')).toBeNull();
  });

  it('shows the connected companion pill when companion is available', () => {
    const { getByText, queryByText } = render(
      <ScanPanel {...baseProps} companionAvailable={true} />
    );
    expect(getByText('USB Companion Connected')).toBeTruthy();
    expect(queryByText('Not Connected')).toBeNull();
  });

  it('renders the idle full-cleanup button and fires onFullCleanup', () => {
    const onFullCleanup = jest.fn();
    const { getByText } = render(
      <ScanPanel {...baseProps} cleaning={false} onFullCleanup={onFullCleanup} />
    );
    const button = getByText('Full Cleanup');
    expect(button).toBeTruthy();
    fireEvent.press(button);
    expect(onFullCleanup).toHaveBeenCalledTimes(1);
  });

  it('shows the cleaning label and does not fire onFullCleanup while cleaning', () => {
    const onFullCleanup = jest.fn();
    const { getByText, queryByText } = render(
      <ScanPanel {...baseProps} cleaning={true} onFullCleanup={onFullCleanup} />
    );
    expect(getByText('Running Full Cleanup...')).toBeTruthy();
    expect(queryByText('Full Cleanup')).toBeNull();
    fireEvent.press(getByText('Running Full Cleanup...'));
    expect(onFullCleanup).not.toHaveBeenCalled();
  });

  it('does not render the cleanup summary box when summary is null', () => {
    const { queryByText } = render(<ScanPanel {...baseProps} cleanupSummary={null} />);
    expect(queryByText(/completed/)).toBeNull();
  });

  it('renders a fully-successful cleanup summary with all details', () => {
    const cleanupSummary: CleanupSummary = {
      tiersAttempted: 3,
      tiersCompleted: 3,
      details: ['Cleared clipboard history', 'Scrubbed session cache'],
    };
    const { getByText } = render(
      <ScanPanel {...baseProps} cleanupSummary={cleanupSummary} />
    );
    expect(getByText('3/3 tiers completed')).toBeTruthy();
    expect(getByText('Cleared clipboard history')).toBeTruthy();
    expect(getByText('Scrubbed session cache')).toBeTruthy();
  });

  it('renders a partial cleanup summary (completed !== attempted)', () => {
    const cleanupSummary: CleanupSummary = {
      tiersAttempted: 3,
      tiersCompleted: 2,
      details: ['One tier required the desktop companion'],
    };
    const { getByText } = render(
      <ScanPanel {...baseProps} cleanupSummary={cleanupSummary} />
    );
    expect(getByText('2/3 tiers completed')).toBeTruthy();
    expect(getByText('One tier required the desktop companion')).toBeTruthy();
  });

  it('uses singular tier wording when exactly one tier was attempted', () => {
    const cleanupSummary: CleanupSummary = {
      tiersAttempted: 1,
      tiersCompleted: 1,
      details: [],
    };
    const { getByText } = render(
      <ScanPanel {...baseProps} cleanupSummary={cleanupSummary} />
    );
    expect(getByText('1/1 tier completed')).toBeTruthy();
  });

  it('fires onDismissSummary when the summary close control is pressed', () => {
    const onDismissSummary = jest.fn();
    const cleanupSummary: CleanupSummary = {
      tiersAttempted: 3,
      tiersCompleted: 3,
      details: ['All tiers cleaned'],
    };
    const { getByText, getAllByRole } = render(
      <ScanPanel
        {...baseProps}
        cleanupSummary={cleanupSummary}
        onDismissSummary={onDismissSummary}
      />
    );
    // Buttons in the rendered tree: full-cleanup button + summary dismiss button.
    const buttons = getAllByRole('button');
    // The dismiss button is the last button (the X) in the summary box.
    fireEvent.press(buttons[buttons.length - 1]);
    expect(onDismissSummary).toHaveBeenCalledTimes(1);
    // sanity: summary is still rendered (dismissal is owned by the parent)
    expect(getByText('All tiers cleaned')).toBeTruthy();
  });
});
