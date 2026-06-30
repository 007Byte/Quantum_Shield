/**
 * Render tests for ArtifactList — both exported sub-components
 * (AppArtifactList and OsArtifactList).
 *
 * Both import only static constants and pure severity/status helper
 * functions, so no module mocks are required beyond the shared setup.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AppArtifactList, OsArtifactList } from '../ArtifactList';
import type {
  ScanResults,
  OsScanResults,
  ForensicsFinding,
  CategoryStatus,
} from '../../domain/zero-trace.types';

const t = (_key: string) => undefined as unknown as string;

const findings: ForensicsFinding[] = [
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
  {
    id: 'session-info',
    severity: 'info',
    description: 'Session token present in memory',
    canRemediate: true,
  },
];

const categoryStatuses: CategoryStatus[] = [
  {
    category: 'clipboard',
    label: 'Clipboard',
    description: 'Copied credentials and secrets',
    status: 'dirty',
    lastCleaned: null,
    canClean: true,
  },
  {
    category: 'app_cache',
    label: 'App Cache',
    description: 'Rendered previews and thumbnails',
    status: 'clean',
    lastCleaned: '2026-06-29T10:00:00Z',
    canClean: true,
  },
  {
    category: 'os_journals',
    label: 'OS Journals',
    description: 'Filesystem journal entries',
    status: 'requires_desktop',
    lastCleaned: null,
    canClean: false,
  },
  {
    category: 'temp_files',
    label: 'Temporary Files',
    description: 'Scratch files on disk',
    status: 'unknown',
    lastCleaned: null,
    canClean: false,
  },
];

const populatedResults: ScanResults = {
  count: 3,
  riskLevel: 'high',
  artifacts: findings,
  categoryStatuses,
};

const emptyResults: ScanResults = {
  count: 0,
  riskLevel: 'none',
  artifacts: [],
  categoryStatuses,
};

describe('AppArtifactList', () => {
  it('renders the trace count header and each finding when traces exist', () => {
    const { getByText } = render(
      <AppArtifactList
        appScanResults={populatedResults}
        cleaning={false}
        onAppClean={jest.fn()}
        t={t}
      />
    );
    expect(getByText('3 traces detected')).toBeTruthy();
    expect(getByText('Clipboard contains a copied vault password')).toBeTruthy();
    expect(getByText('Cached thumbnail preview detected')).toBeTruthy();
    expect(getByText('Session token present in memory')).toBeTruthy();
  });

  it('shows the "Can clean" badge only for remediable findings', () => {
    const { getAllByText } = render(
      <AppArtifactList
        appScanResults={populatedResults}
        cleaning={false}
        onAppClean={jest.fn()}
        t={t}
      />
    );
    // Two of the three findings have canRemediate: true.
    expect(getAllByText('Can clean')).toHaveLength(2);
  });

  it('uses singular "trace" wording for a single finding', () => {
    const single: ScanResults = {
      ...populatedResults,
      count: 1,
      artifacts: [findings[0]],
    };
    const { getByText } = render(
      <AppArtifactList
        appScanResults={single}
        cleaning={false}
        onAppClean={jest.fn()}
        t={t}
      />
    );
    expect(getByText('1 trace detected')).toBeTruthy();
    expect(getByText('Clean 1 trace')).toBeTruthy();
  });

  it('renders the idle clean button and fires onAppClean', () => {
    const onAppClean = jest.fn();
    const { getByText } = render(
      <AppArtifactList
        appScanResults={populatedResults}
        cleaning={false}
        onAppClean={onAppClean}
        t={t}
      />
    );
    const cleanButton = getByText('Clean 3 traces');
    fireEvent.press(cleanButton);
    expect(onAppClean).toHaveBeenCalledTimes(1);
  });

  it('shows the cleaning label and blocks onAppClean while cleaning', () => {
    const onAppClean = jest.fn();
    const { getByText, queryByText } = render(
      <AppArtifactList
        appScanResults={populatedResults}
        cleaning={true}
        onAppClean={onAppClean}
        t={t}
      />
    );
    expect(getByText('Cleaning...')).toBeTruthy();
    expect(queryByText('Clean 3 traces')).toBeNull();
    fireEvent.press(getByText('Cleaning...'));
    expect(onAppClean).not.toHaveBeenCalled();
  });

  it('renders the clean "no traces" state and hides the clean button', () => {
    const { getByText, queryByText } = render(
      <AppArtifactList
        appScanResults={emptyResults}
        cleaning={false}
        onAppClean={jest.fn()}
        t={t}
      />
    );
    expect(getByText('No forensic traces detected')).toBeTruthy();
    expect(queryByText(/^Clean /)).toBeNull();
    expect(queryByText('Cleaning...')).toBeNull();
  });

  it('renders the cleanup-capabilities grid with every category status label', () => {
    const { getByText } = render(
      <AppArtifactList
        appScanResults={populatedResults}
        cleaning={false}
        onAppClean={jest.fn()}
        t={t}
      />
    );
    expect(getByText('Cleanup Capabilities')).toBeTruthy();
    // Status-text branches: dirty -> "Dirty", clean -> "Clean",
    // requires_desktop -> "Desktop", unknown+!canClean -> "N/A".
    expect(getByText('Dirty')).toBeTruthy();
    expect(getByText('Clean')).toBeTruthy();
    expect(getByText('Desktop')).toBeTruthy();
    expect(getByText('N/A')).toBeTruthy();
  });
});

describe('OsArtifactList', () => {
  const osPopulated: OsScanResults = {
    count: 2,
    artifacts: ['/Volumes/USBVault/.DS_Store', 'Spotlight index fragment'],
  };

  const osEmpty: OsScanResults = {
    count: 0,
    artifacts: [],
  };

  it('renders the OS artifact count header and each artifact when present', () => {
    const { getByText } = render(<OsArtifactList osScanResults={osPopulated} t={t} />);
    expect(getByText('2 OS artifacts found')).toBeTruthy();
    expect(getByText('/Volumes/USBVault/.DS_Store')).toBeTruthy();
    expect(getByText('Spotlight index fragment')).toBeTruthy();
  });

  it('renders the explanatory metadata note when OS artifacts are present', () => {
    const { getByText } = render(<OsArtifactList osScanResults={osPopulated} t={t} />);
    expect(getByText(/OS metadata traces/)).toBeTruthy();
  });

  it('uses singular "artifact" wording for a single OS artifact', () => {
    const single: OsScanResults = {
      count: 1,
      artifacts: ['Recent documents entry'],
    };
    const { getByText } = render(<OsArtifactList osScanResults={single} t={t} />);
    expect(getByText('1 OS artifact found')).toBeTruthy();
  });

  it('renders the clean "no OS artifacts" state and omits the artifact list', () => {
    const { getByText, queryByText } = render(
      <OsArtifactList osScanResults={osEmpty} t={t} />
    );
    expect(getByText('No OS artifacts detected')).toBeTruthy();
    expect(queryByText(/OS metadata traces/)).toBeNull();
  });
});
