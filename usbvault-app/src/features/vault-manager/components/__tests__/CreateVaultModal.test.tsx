import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { CreateVaultModal } from '../CreateVaultModal';

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
import type { CreateVaultModalState } from '../../domain/vault-manager.types';

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

function makeState(overrides: Partial<CreateVaultModalState> = {}): CreateVaultModalState {
  return {
    visible: true,
    vaultName: '',
    securityLevel: 'High',
    ...overrides,
  };
}

function makeProps(stateOverrides: Partial<CreateVaultModalState> = {}, cbOverrides: Record<string, unknown> = {}) {
  return {
    state: makeState(stateOverrides),
    onChangeState: jest.fn(),
    onClose: jest.fn(),
    onCreate: jest.fn(),
    t,
    ...cbOverrides,
  };
}

describe('CreateVaultModal', () => {
  it('renders title, fields, and the security level options when visible', () => {
    const { getByText } = render(<CreateVaultModal {...(makeProps() as any)} />);
    expect(getByText('vaultManager.createNewVault')).toBeTruthy();
    expect(getByText('manageVaults.vaultName')).toBeTruthy();
    expect(getByText('manageVaults.securityLevel')).toBeTruthy();
    expect(getByText('Standard')).toBeTruthy();
    expect(getByText('High')).toBeTruthy();
    expect(getByText('Maximum')).toBeTruthy();
    expect(getByText('Post-Quantum Cryptography (PQC-256)')).toBeTruthy();
  });

  it('updates vault name via onChangeState on text input', () => {
    const onChangeState = jest.fn();
    const { getByLabelText } = render(
      <CreateVaultModal {...(makeProps({}, { onChangeState }) as any)} />
    );
    fireEvent.changeText(getByLabelText('vaultManager.enterName'), 'Photos Vault');
    expect(onChangeState).toHaveBeenCalledWith(
      expect.objectContaining({ vaultName: 'Photos Vault' })
    );
  });

  it('selects a security level via onChangeState', () => {
    const onChangeState = jest.fn();
    const { getByText } = render(
      <CreateVaultModal {...(makeProps({}, { onChangeState }) as any)} />
    );
    fireEvent.press(getByText('Maximum'));
    expect(onChangeState).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: 'Maximum' })
    );
  });

  it('disables Create and does not fire onCreate when the name is blank', () => {
    const onCreate = jest.fn();
    const { getByText } = render(
      <CreateVaultModal {...(makeProps({ vaultName: '   ' }, { onCreate }) as any)} />
    );
    // The Create button is disabled (blank name). Pressing it bubbles to the
    // modal-content wrapper's onPress(e => e.stopPropagation()), so supply a
    // synthetic event with stopPropagation to avoid a crash on the bubble.
    fireEvent.press(getByText('common.create'), { stopPropagation: jest.fn() });
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('fires onCreate when a non-empty name is present', () => {
    const onCreate = jest.fn();
    const { getByText } = render(
      <CreateVaultModal {...(makeProps({ vaultName: 'Docs' }, { onCreate }) as any)} />
    );
    fireEvent.press(getByText('common.create'));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('fires onClose from the Cancel button', () => {
    const onClose = jest.fn();
    const { getByText } = render(
      <CreateVaultModal {...(makeProps({}, { onClose }) as any)} />
    );
    fireEvent.press(getByText('common.cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose from the close (X) header button', () => {
    const onClose = jest.fn();
    const { getByLabelText } = render(
      <CreateVaultModal {...(makeProps({}, { onClose }) as any)} />
    );
    fireEvent.press(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not render content when state.visible is false', () => {
    const { queryByText } = render(
      <CreateVaultModal {...(makeProps({ visible: false }) as any)} />
    );
    // Modal with visible=false does not mount its children
    expect(queryByText('vaultManager.createNewVault')).toBeNull();
  });

  it('resolves hovered style branches for the footer buttons', () => {
    const { UNSAFE_root } = render(
      <CreateVaultModal {...(makeProps({ vaultName: 'Docs' }) as any)} />
    );
    const fns = collectStyleFns(UNSAFE_root);
    expect(fns.length).toBeGreaterThan(0);
    fns.forEach(fn => {
      expect(() => fn({ hovered: true })).not.toThrow();
      expect(() => fn({ hovered: false })).not.toThrow();
    });
  });
});
