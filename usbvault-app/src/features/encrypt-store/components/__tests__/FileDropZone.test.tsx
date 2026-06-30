import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FileDropZone } from '../FileDropZone';
import { sanitizeFileName } from '../../domain/encrypt.data';
import type { SelectedFile } from '../../domain/encrypt.types';

// Deterministic theme so style resolution does not throw. FileDropZone reads
// theme.L2.base + theme.L3.base + theme.semantic.{cyan,green}.
jest.mock('@/theme/engine', () => {
  const layerState = {
    native: { backgroundColor: '#120C28' },
    web: {},
    text: { primary: '#F5F3FF', secondary: '#B8B3D1' },
  };
  return {
    getTheme: () => jest.requireActual('@/theme/dark').darkTheme,
    useTheme: () => ({
      theme: {
        L2: { base: layerState },
        L3: { base: layerState },
        semantic: { cyan: '#22D3EE', green: '#22C55E' },
      },
      colorScheme: 'dark',
      toggleTheme: jest.fn(),
    }),
    resolveLayerStyle: (state: any) => ({ ...(state?.native ?? {}) }),
  };
});

const SAMPLE_FILE: SelectedFile = {
  name: 'quarterly-report.pdf',
  size: 2048,
  uri: 'file:///tmp/quarterly-report.pdf',
  mimeType: 'application/pdf',
};

function makeProps(overrides: Partial<React.ComponentProps<typeof FileDropZone>> = {}) {
  return {
    selectedFile: null,
    customName: '',
    effectiveFileName: '',
    isDragHover: false,
    onDragHover: jest.fn(),
    onSelectFile: jest.fn(),
    onCustomNameChange: jest.fn(),
    onCustomNameBlur: jest.fn(),
    onEditingNameStart: jest.fn(),
    onResetName: jest.fn(),
    ...overrides,
  };
}

describe('FileDropZone', () => {
  it('renders the empty drop zone without throwing', () => {
    const props = makeProps();
    const { getByText, queryByText } = render(<FileDropZone {...props} />);
    expect(getByText('addFile.dropTitle')).toBeTruthy();
    expect(getByText('addFile.dropSubtitle')).toBeTruthy();
    expect(getByText('addFile.supportedFormats')).toBeTruthy();
    // No file → no selected-file info and no rename section.
    expect(queryByText('Vault File Name')).toBeNull();
  });

  it('fires onSelectFile when the drop zone is pressed', () => {
    const props = makeProps();
    const { getByText } = render(<FileDropZone {...props} />);
    fireEvent.press(getByText('addFile.dropTitle'));
    expect(props.onSelectFile).toHaveBeenCalledTimes(1);
  });

  it('shows selected file name, size and rename section when a file is present', () => {
    const sanitized = sanitizeFileName(SAMPLE_FILE.name);
    const props = makeProps({
      selectedFile: SAMPLE_FILE,
      customName: sanitized,
      effectiveFileName: sanitized,
    });
    const { getByText } = render(<FileDropZone {...props} />);
    expect(getByText(SAMPLE_FILE.name)).toBeTruthy();
    // formatFileSize(2048) → "2.0 KB"
    expect(getByText('2.0 KB')).toBeTruthy();
    expect(getByText('Vault File Name')).toBeTruthy();
  });

  it('does NOT show the Modified badge or reset button when name is unchanged', () => {
    const sanitized = sanitizeFileName(SAMPLE_FILE.name);
    const props = makeProps({
      selectedFile: SAMPLE_FILE,
      customName: sanitized,
      effectiveFileName: sanitized,
    });
    const { queryByText, getAllByRole } = render(<FileDropZone {...props} />);
    expect(queryByText('Modified')).toBeNull();
    // Only the drop-zone Pressable is present (reset button absent).
    expect(getAllByRole('button')).toHaveLength(1);
  });

  it('shows the Modified badge and reset button when name differs', () => {
    const props = makeProps({
      selectedFile: SAMPLE_FILE,
      customName: 'renamed-doc.pdf',
      effectiveFileName: 'renamed-doc.pdf',
    });
    const { getByText, getAllByRole } = render(<FileDropZone {...props} />);
    expect(getByText('Modified')).toBeTruthy();
    // Drop-zone Pressable + reset Pressable = 2 buttons.
    expect(getAllByRole('button')).toHaveLength(2);
  });

  it('fires onResetName when the reset button is pressed', () => {
    const props = makeProps({
      selectedFile: SAMPLE_FILE,
      customName: 'renamed-doc.pdf',
      effectiveFileName: 'renamed-doc.pdf',
    });
    const { getAllByRole } = render(<FileDropZone {...props} />);
    // Reset is the second button (drop zone is first).
    fireEvent.press(getAllByRole('button')[1]);
    expect(props.onResetName).toHaveBeenCalledTimes(1);
  });

  it('wires up the rename TextInput change, blur and focus callbacks', () => {
    const props = makeProps({
      selectedFile: SAMPLE_FILE,
      customName: sanitizeFileName(SAMPLE_FILE.name),
      effectiveFileName: sanitizeFileName(SAMPLE_FILE.name),
    });
    const { getByLabelText } = render(<FileDropZone {...props} />);
    const input = getByLabelText('Text input');

    fireEvent.changeText(input, 'new-name.pdf');
    expect(props.onCustomNameChange).toHaveBeenCalledWith('new-name.pdf');

    fireEvent(input, 'focus');
    expect(props.onEditingNameStart).toHaveBeenCalledTimes(1);

    fireEvent(input, 'blur');
    expect(props.onCustomNameBlur).toHaveBeenCalledTimes(1);
  });

  it('applies the active drop-zone style when isDragHover is true', () => {
    const active = makeProps({ isDragHover: true });
    const { getByText: getActive } = render(<FileDropZone {...active} />);
    const activeZone = getActive('addFile.dropTitle').parent?.parent;
    const flat = Object.assign(
      {},
      ...(Array.isArray(activeZone?.props.style)
        ? activeZone!.props.style
        : [activeZone?.props.style]
      ).filter(Boolean)
    );
    expect(flat.backgroundColor).toBe('rgba(34,211,238,0.08)');
  });

  it('does not apply the active drop-zone style when isDragHover is false', () => {
    const props = makeProps({ isDragHover: false });
    const { getByText } = render(<FileDropZone {...props} />);
    const zone = getByText('addFile.dropTitle').parent?.parent;
    const flat = Object.assign(
      {},
      ...(Array.isArray(zone?.props.style) ? zone!.props.style : [zone?.props.style]).filter(
        Boolean
      )
    );
    expect(flat.backgroundColor).toBeUndefined();
  });

  it('invokes onDragHover via the pressable web mouse handlers', () => {
    const props = makeProps();
    const { getAllByRole } = render(<FileDropZone {...props} />);
    const dropZone = getAllByRole('button')[0];
    // The component attaches onMouseEnter/onMouseLeave that call onDragHover.
    dropZone.props.onMouseEnter?.();
    expect(props.onDragHover).toHaveBeenCalledWith(true);
    dropZone.props.onMouseLeave?.();
    expect(props.onDragHover).toHaveBeenCalledWith(false);
  });
});
