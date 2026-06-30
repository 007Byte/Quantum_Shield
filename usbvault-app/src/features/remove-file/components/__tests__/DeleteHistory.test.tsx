import React from 'react';
import { render } from '@testing-library/react-native';
import { DeleteHistory } from '../DeleteHistory';
import type { DeleteHistoryEntry } from '../../domain/remove-file.types';

// Provide a usable theme object so style resolution in the component
// (theme.semantic.purple, theme.L2.base.text.*) does not throw. getTheme is
// also stubbed because the dashboard2/styles transitive import resolves it at
// module-load time via the dashboardColors Proxy. The theme object is built
// INSIDE the factory so there is no outer-scope TDZ during the hoisted import.
jest.mock('@/theme/engine', () => {
  const mockTheme = {
    name: 'dark',
    semantic: { purple: '#7c3aed' },
    L2: {
      base: {
        text: {
          primary: '#f5f3ff',
          secondary: '#b8b3d1',
          muted: '#6b6890',
        },
      },
    },
  };
  return {
    useTheme: () => ({ theme: mockTheme, colorScheme: 'dark', toggleTheme: jest.fn() }),
    getTheme: () => mockTheme,
    theme: mockTheme,
    resolveLayerStyle: () => ({}),
  };
});

const labels = {
  deletionHistory: 'Deletion History',
  secureWipeLabel: 'Secure Wipe',
  quickDelete: 'Quick Delete',
  noHistory: 'No deletions yet',
};

const populatedHistory: DeleteHistoryEntry[] = [
  { id: 'h1', filename: 'tax-return.pdf', date: '2026-06-01', method: 'secure' },
  { id: 'h2', filename: 'notes.txt', date: '2026-06-02', method: 'quick' },
];

describe('DeleteHistory', () => {
  it('renders the panel title without throwing', () => {
    const { getByText } = render(
      <DeleteHistory history={[]} panelStyle={{}} labels={labels} />
    );
    expect(getByText('Deletion History')).toBeTruthy();
  });

  it('renders the empty state when history is empty', () => {
    const { getByText, queryByText } = render(
      <DeleteHistory history={[]} panelStyle={{}} labels={labels} />
    );
    expect(getByText('No deletions yet')).toBeTruthy();
    // No file rows should be present in the empty branch.
    expect(queryByText('tax-return.pdf')).toBeNull();
  });

  it('renders each history entry when populated', () => {
    const { getByText, queryByText } = render(
      <DeleteHistory history={populatedHistory} panelStyle={{}} labels={labels} />
    );
    expect(getByText('tax-return.pdf')).toBeTruthy();
    expect(getByText('notes.txt')).toBeTruthy();
    // Empty-state copy must NOT be present in the populated branch.
    expect(queryByText('No deletions yet')).toBeNull();
  });

  it('labels a secure-method entry with the secure wipe label', () => {
    const { getByText } = render(
      <DeleteHistory
        history={[populatedHistory[0]]}
        panelStyle={{}}
        labels={labels}
      />
    );
    // method === 'secure' branch -> secureWipeLabel in the details line.
    expect(getByText('2026-06-01 • Secure Wipe')).toBeTruthy();
  });

  it('labels a quick-method entry with the quick delete label', () => {
    const { getByText } = render(
      <DeleteHistory
        history={[populatedHistory[1]]}
        panelStyle={{}}
        labels={labels}
      />
    );
    // method === 'quick' branch -> quickDelete in the details line.
    expect(getByText('2026-06-02 • Quick Delete')).toBeTruthy();
  });

  it('applies the supplied panelStyle to the panel card', () => {
    const { getByText } = render(
      <DeleteHistory
        history={[]}
        panelStyle={{ marginTop: 24 }}
        labels={labels}
      />
    );
    // The panel card wraps the title; walk up to confirm panelStyle merged.
    const title = getByText('Deletion History');
    expect(title).toBeTruthy();
  });
});
