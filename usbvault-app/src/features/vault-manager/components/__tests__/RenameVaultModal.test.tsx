import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RenameVaultModal } from '../RenameVaultModal';

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
import type { RenameModalState } from '../../domain/vault-manager.types';

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

function makeState(overrides: Partial<RenameModalState> = {}): RenameModalState {
  return {
    visible: true,
    vaultId: 'vault-5e2d',
    currentName: 'Old Vault',
    newName: '',
    ...overrides,
  };
}

function makeProps(
  stateOverrides: Partial<RenameModalState> = {},
  cbOverrides: Record<string, unknown> = {}
) {
  return {
    state: makeState(stateOverrides),
    onChangeState: jest.fn(),
    onClose: jest.fn(),
    onRename: jest.fn(),
    t,
    ...cbOverrides,
  };
}

describe('RenameVaultModal', () => {
  it('renders the title, current name, and field labels when visible', () => {
    const { getByText } = render(<RenameVaultModal {...(makeProps() as any)} />);
    expect(getByText('manageVaults.renameDlgTitle')).toBeTruthy();
    expect(getByText('manageVaults.currentName')).toBeTruthy();
    expect(getByText('manageVaults.newName')).toBeTruthy();
    // current (read-only) name is displayed
    expect(getByText('Old Vault')).toBeTruthy();
  });

  it('updates the new name via onChangeState on text input', () => {
    const onChangeState = jest.fn();
    const { getByLabelText } = render(
      <RenameVaultModal {...(makeProps({}, { onChangeState }) as any)} />
    );
    fireEvent.changeText(getByLabelText('manageVaults.enterNewName'), 'Fresh Name');
    expect(onChangeState).toHaveBeenCalledWith(expect.objectContaining({ newName: 'Fresh Name' }));
  });

  it('disables Rename and does not fire onRename when newName is blank', () => {
    const onRename = jest.fn();
    const { getByText } = render(
      <RenameVaultModal {...(makeProps({ newName: '   ' }, { onRename }) as any)} />
    );
    // Disabled press bubbles to the modal-content wrapper's
    // onPress(e => e.stopPropagation()); supply a synthetic event so the
    // bubble does not crash on an undefined event.
    fireEvent.press(getByText('vaultManager.rename'), { stopPropagation: jest.fn() });
    expect(onRename).not.toHaveBeenCalled();
  });

  it('fires onRename when newName is non-empty', () => {
    const onRename = jest.fn();
    const { getByText } = render(
      <RenameVaultModal {...(makeProps({ newName: 'Renamed' }, { onRename }) as any)} />
    );
    fireEvent.press(getByText('vaultManager.rename'));
    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it('fires onClose from the Cancel button', () => {
    const onClose = jest.fn();
    const { getByText } = render(<RenameVaultModal {...(makeProps({}, { onClose }) as any)} />);
    fireEvent.press(getByText('common.cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose from the close (X) header button', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <RenameVaultModal {...(makeProps({}, { onClose }) as any)} />
    );
    fireEvent.press(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render content when state.visible is false', () => {
    const { queryByText } = render(
      <RenameVaultModal {...(makeProps({ visible: false }) as any)} />
    );
    expect(queryByText('manageVaults.renameDlgTitle')).toBeNull();
  });

  it('resolves hovered style branches for the footer buttons', () => {
    const { UNSAFE_root } = render(
      <RenameVaultModal {...(makeProps({ newName: 'Renamed' }) as any)} />
    );
    const fns = collectStyleFns(UNSAFE_root);
    expect(fns.length).toBeGreaterThan(0);
    fns.forEach(fn => {
      expect(() => fn({ hovered: true })).not.toThrow();
      expect(() => fn({ hovered: false })).not.toThrow();
    });
  });
});
