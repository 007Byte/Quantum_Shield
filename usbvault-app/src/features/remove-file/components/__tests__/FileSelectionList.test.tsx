import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FileSelectionList } from '../FileSelectionList';
import type { FileItem } from '../../domain/remove-file.types';

// Provide a usable theme object so style resolution does not throw. getTheme is
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
  selectFiles: 'Select Files',
  selectAll: 'Select All',
  deselectAll: 'Deselect All',
};

const files: FileItem[] = [
  { id: 'f1', name: 'report.docx', size: '2.1 MB', dateModified: '2026-06-10', icon: 'file-text' },
  { id: 'f2', name: 'photo.png', size: '4.8 MB', dateModified: '2026-06-11', icon: 'image' },
];

function renderList(overrides: Partial<React.ComponentProps<typeof FileSelectionList>> = {}) {
  const onToggleFile = jest.fn();
  const onSelectAll = jest.fn();
  const utils = render(
    <FileSelectionList
      files={files}
      selectedFiles={new Set()}
      allFilesSelected={false}
      onToggleFile={onToggleFile}
      onSelectAll={onSelectAll}
      panelStyle={{}}
      labels={labels}
      {...overrides}
    />
  );
  return { ...utils, onToggleFile, onSelectAll };
}

describe('FileSelectionList', () => {
  it('renders the panel title and file rows when populated', () => {
    const { getByText } = renderList();
    expect(getByText('Select Files')).toBeTruthy();
    expect(getByText('report.docx')).toBeTruthy();
    expect(getByText('photo.png')).toBeTruthy();
    expect(getByText('2.1 MB • 2026-06-10')).toBeTruthy();
  });

  it('renders without throwing when the file list is empty', () => {
    const { getByText, queryByText } = renderList({ files: [] });
    expect(getByText('Select Files')).toBeTruthy();
    expect(queryByText('report.docx')).toBeNull();
  });

  it('shows the Select All label when not all files are selected', () => {
    const { getByText, queryByText } = renderList({ allFilesSelected: false });
    expect(getByText('Select All')).toBeTruthy();
    expect(queryByText('Deselect All')).toBeNull();
  });

  it('shows the Deselect All label when all files are selected', () => {
    const { getByText, queryByText } = renderList({ allFilesSelected: true });
    expect(getByText('Deselect All')).toBeTruthy();
    expect(queryByText('Select All')).toBeNull();
  });

  it('invokes onSelectAll when the select-all button is pressed', () => {
    const { getByText, onSelectAll } = renderList();
    fireEvent.press(getByText('Select All'));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('invokes onToggleFile with the file id when a row is pressed', () => {
    const { getByText, onToggleFile } = renderList();
    fireEvent.press(getByText('report.docx'));
    expect(onToggleFile).toHaveBeenCalledWith('f1');
  });

  it('renders selected rows (selected branch) for files in selectedFiles', () => {
    // selectedFiles contains f1 -> isSelected true branch (checkbox + check icon).
    const { getByText, onToggleFile } = renderList({
      selectedFiles: new Set(['f1']),
    });
    // Row still renders and remains pressable in the selected state.
    fireEvent.press(getByText('report.docx'));
    expect(onToggleFile).toHaveBeenCalledWith('f1');
  });

  it('toggles a different file via its own row press (unselected branch)', () => {
    const { getByText, onToggleFile } = renderList({
      selectedFiles: new Set(['f1']),
    });
    // f2 is NOT selected -> isSelected false branch.
    fireEvent.press(getByText('photo.png'));
    expect(onToggleFile).toHaveBeenCalledWith('f2');
  });

  it('uses the inner trash action button to toggle the same file', () => {
    const { getAllByRole, onToggleFile } = renderList({ files: [files[0]] });
    // Buttons: the select-all button, the row Pressable, and the trash action.
    const buttons = getAllByRole('button');
    // Press the last button (innermost trash action) for the single file.
    fireEvent.press(buttons[buttons.length - 1]);
    expect(onToggleFile).toHaveBeenCalledWith('f1');
  });
});
