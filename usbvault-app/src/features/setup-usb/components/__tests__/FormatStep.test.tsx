import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FormatStep } from '../FormatStep';
import type { FormatStepProps } from '../../domain/setup-usb.types';

// `name` is mutable (via __setThemeName) so a single instrumented module can
// cover BOTH the `theme.name === 'dark'` and the light branches.
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
    __setThemeName: (name: string) => {
      mockTheme.name = name;
    },
    useTheme: () => ({ theme: mockTheme, colorScheme: mockTheme.name, toggleTheme: jest.fn() }),
    resolveLayerStyle: (state: any) => ({ ...(state?.native ?? {}) }),
    theme: mockTheme,
  };
});

jest.mock('@/components/dashboard2/styles', () => ({
  dashboardSpacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  webOnlyTransition: {},
}));

jest.mock('@/utils/webStyle', () => ({
  webOnly: () => ({}),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const themeEngineMock = require('@/theme/engine') as { __setThemeName: (n: string) => void };

afterEach(() => {
  themeEngineMock.__setThemeName('dark');
});

const passthroughT = (key: string) => key;

function buildProps(overrides: Partial<FormatStepProps> = {}): FormatStepProps {
  return {
    vaultName: '',
    partitionName: '',
    formatType: 'quick',
    fileSystem: 'exfat',
    algorithm: 'AES-256-GCM-SIV',
    showPlatformFS: false,
    onChangeVaultName: jest.fn(),
    onChangePartitionName: jest.fn(),
    onChangeFormatType: jest.fn(),
    onChangeFileSystem: jest.fn(),
    onChangeAlgorithm: jest.fn(),
    onTogglePlatformFS: jest.fn(),
    t: passthroughT,
    ...overrides,
  };
}

describe('FormatStep', () => {
  it('renders title, field labels and section headers without throwing', () => {
    const { getByText } = render(<FormatStep {...buildProps()} />);
    expect(getByText('setupUsb.formatOptionsTitle')).toBeTruthy();
    expect(getByText('Vault Name')).toBeTruthy();
    expect(getByText('Partition Name')).toBeTruthy();
    expect(getByText('Universal')).toBeTruthy();
    expect(getByText('Encryption Algorithm')).toBeTruthy();
  });

  // ── Vault name field ─────────────────────────────────────────────────────
  it('fires onChangeVaultName when the vault name input changes', () => {
    const onChangeVaultName = jest.fn();
    const { getByLabelText } = render(<FormatStep {...buildProps({ onChangeVaultName })} />);
    fireEvent.changeText(getByLabelText('My Vault'), 'Work Files');
    expect(onChangeVaultName).toHaveBeenCalledWith('Work Files');
  });

  it('shows the default-name hint when vaultName is blank', () => {
    const { getByText } = render(<FormatStep {...buildProps({ vaultName: '   ' })} />);
    expect(
      getByText('Leave blank for default name (USBVault). Max 32 characters.')
    ).toBeTruthy();
  });

  it('shows the identifier hint when vaultName has a value', () => {
    const { getByText } = render(<FormatStep {...buildProps({ vaultName: 'Photos' })} />);
    expect(getByText('Logical vault identifier: "Photos"')).toBeTruthy();
  });

  // ── Partition name field ─────────────────────────────────────────────────
  it('fires onChangePartitionName when the partition name input changes', () => {
    const onChangePartitionName = jest.fn();
    const { getByLabelText } = render(
      <FormatStep {...buildProps({ onChangePartitionName })} />
    );
    fireEvent.changeText(getByLabelText('USBVAULT'), 'mydrive');
    expect(onChangePartitionName).toHaveBeenCalledWith('mydrive');
  });

  it('shows the default partition hint when partitionName is blank', () => {
    const { getByText } = render(<FormatStep {...buildProps({ partitionName: '' })} />);
    expect(
      getByText(
        'Name shown in Finder / File Explorer for the visible partition. Max 11 characters. Defaults to USBVAULT.'
      )
    ).toBeTruthy();
  });

  it('sanitizes and uppercases the partition name preview', () => {
    const { getByText } = render(
      <FormatStep {...buildProps({ partitionName: 'my-drive!!' })} />
    );
    // Strips disallowed chars, uppercases, slices to 11 chars => "MY-DRIVE"
    expect(getByText('Drive will appear as: MY-DRIVE')).toBeTruthy();
  });

  // ── Format type radios ───────────────────────────────────────────────────
  it('fires onChangeFormatType with "full" when the full-format option is pressed', () => {
    const onChangeFormatType = jest.fn();
    const { getByText } = render(<FormatStep {...buildProps({ onChangeFormatType })} />);
    fireEvent.press(getByText('setupUsb.fullFormat'));
    expect(onChangeFormatType).toHaveBeenCalledWith('full');
  });

  it('fires onChangeFormatType with "quick" when the quick-format option is pressed', () => {
    const onChangeFormatType = jest.fn();
    const { getByText } = render(
      <FormatStep {...buildProps({ formatType: 'full', onChangeFormatType })} />
    );
    fireEvent.press(getByText('setupUsb.quickFormat'));
    expect(onChangeFormatType).toHaveBeenCalledWith('quick');
  });

  // ── File system selection ────────────────────────────────────────────────
  it('fires onChangeFileSystem with a universal filesystem id when pressed', () => {
    const onChangeFileSystem = jest.fn();
    const { getByText } = render(<FormatStep {...buildProps({ onChangeFileSystem })} />);
    fireEvent.press(getByText('exFAT'));
    expect(onChangeFileSystem).toHaveBeenCalledWith('exfat');
  });

  it('hides platform-specific filesystems until expanded', () => {
    const { queryByText } = render(<FormatStep {...buildProps({ showPlatformFS: false })} />);
    // APFS / NTFS / EXT4 are platform-category and collapsed by default
    expect(queryByText('APFS')).toBeNull();
    expect(queryByText('NTFS')).toBeNull();
    expect(queryByText('EXT4')).toBeNull();
  });

  it('reveals platform-specific filesystems when showPlatformFS is true', () => {
    const { getByText } = render(<FormatStep {...buildProps({ showPlatformFS: true })} />);
    expect(getByText('APFS')).toBeTruthy();
    expect(getByText('NTFS')).toBeTruthy();
    expect(getByText('EXT4')).toBeTruthy();
  });

  it('fires onTogglePlatformFS when the platform-specific toggle is pressed', () => {
    const onTogglePlatformFS = jest.fn();
    const { getByText } = render(<FormatStep {...buildProps({ onTogglePlatformFS })} />);
    fireEvent.press(getByText('Platform-Specific'));
    expect(onTogglePlatformFS).toHaveBeenCalledTimes(1);
  });

  it('fires onChangeFileSystem with a platform filesystem id when expanded and pressed', () => {
    const onChangeFileSystem = jest.fn();
    const { getByText } = render(
      <FormatStep {...buildProps({ showPlatformFS: true, onChangeFileSystem })} />
    );
    fireEvent.press(getByText('NTFS'));
    expect(onChangeFileSystem).toHaveBeenCalledWith('ntfs');
  });

  it('renders the selected-radio branch for a platform filesystem', () => {
    // fileSystem === 'ntfs' while expanded exercises the platform-FS selected
    // ternaries (fsItemSelected / radioButtonSelected / radioDot).
    const { getByText } = render(
      <FormatStep {...buildProps({ showPlatformFS: true, fileSystem: 'ntfs' })} />
    );
    expect(getByText('NTFS')).toBeTruthy();
  });

  // ── Algorithm selection ──────────────────────────────────────────────────
  it('renders all algorithm options', () => {
    const { getByText } = render(<FormatStep {...buildProps()} />);
    expect(getByText('AES-256-GCM-SIV')).toBeTruthy();
    expect(getByText('XChaCha20-Poly1305')).toBeTruthy();
    expect(getByText('ML-KEM-1024 Hybrid')).toBeTruthy();
  });

  it('fires onChangeAlgorithm with the algorithm id when pressed', () => {
    const onChangeAlgorithm = jest.fn();
    const { getByText } = render(<FormatStep {...buildProps({ onChangeAlgorithm })} />);
    fireEvent.press(getByText('XChaCha20-Poly1305'));
    expect(onChangeAlgorithm).toHaveBeenCalledWith('XChaCha20-Poly1305');
  });

  it('renders the spec line only for the selected algorithm', () => {
    const { getByText, queryByText } = render(
      <FormatStep {...buildProps({ algorithm: 'AES-256-GCM-SIV' })} />
    );
    // Selected algo shows its specs string
    expect(
      getByText('256-bit key · 12-byte nonce · 16-byte AEAD tag · HMAC-SHA256 integrity')
    ).toBeTruthy();
    // A non-selected algo's specs are not rendered
    expect(
      queryByText('256-bit key · 24-byte nonce · 16-byte Poly1305 tag · HMAC-SHA256 integrity')
    ).toBeNull();
  });

  it('falls back to USBVAULT preview when sanitization strips all characters', () => {
    // Input made entirely of disallowed chars => sanitized string is empty =>
    // the `|| 'USBVAULT'` fallback branch is taken.
    const { getByText } = render(<FormatStep {...buildProps({ partitionName: '!!!@@@###' })} />);
    expect(getByText('Drive will appear as: USBVAULT')).toBeTruthy();
  });
});

// ── Light theme render path ────────────────────────────────────────────────
// Flips the shared mock's theme.name to 'light' so the same instrumented
// component covers the else-side of the `theme.name === 'dark' ? ... : ...`
// card-background and placeholder-color ternaries.
describe('FormatStep (light theme)', () => {
  it('renders without throwing under the light theme', () => {
    themeEngineMock.__setThemeName('light');
    const { getByText } = render(<FormatStep {...buildProps({ vaultName: 'Lite' })} />);
    expect(getByText('setupUsb.formatOptionsTitle')).toBeTruthy();
    expect(getByText('Logical vault identifier: "Lite"')).toBeTruthy();
  });
});
