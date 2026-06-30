import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SecurityLevelPicker } from '../SecurityLevelPicker';
import { getSecurityLevels } from '../../domain/encrypt.data';

// Deterministic theme so style resolution does not throw.
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

const LEVEL_IDS = getSecurityLevels((k: string) => k).map(l => l.id);

describe('SecurityLevelPicker', () => {
  it('renders all security level titles without throwing', () => {
    const { getByText } = render(
      <SecurityLevelPicker securityLevel={LEVEL_IDS[0]} onSelect={() => {}} />
    );
    // Title is rendered via t(`encrypt.${id.toLowerCase()}`).
    LEVEL_IDS.forEach(id => {
      expect(getByText(`encrypt.${id.toLowerCase()}`)).toBeTruthy();
    });
  });

  it('renders the section label and hint', () => {
    const { getByText } = render(
      <SecurityLevelPicker securityLevel={LEVEL_IDS[0]} onSelect={() => {}} />
    );
    expect(getByText('encrypt.securityLevel')).toBeTruthy();
    expect(getByText('encrypt.securityLevelHint')).toBeTruthy();
  });

  it('renders one Pressable per level', () => {
    const { getAllByRole } = render(
      <SecurityLevelPicker securityLevel={LEVEL_IDS[0]} onSelect={() => {}} />
    );
    expect(getAllByRole('button')).toHaveLength(LEVEL_IDS.length);
  });

  it('fires onSelect with the correct id for each level', () => {
    const onSelect = jest.fn();
    const { getAllByRole } = render(
      <SecurityLevelPicker securityLevel={LEVEL_IDS[0]} onSelect={onSelect} />
    );
    const buttons = getAllByRole('button');
    buttons.forEach((btn, idx) => {
      fireEvent.press(btn);
      expect(onSelect).toHaveBeenNthCalledWith(idx + 1, LEVEL_IDS[idx]);
    });
    expect(onSelect).toHaveBeenCalledTimes(LEVEL_IDS.length);
  });

  it('shows expanded detail rows only for the selected level', () => {
    const { queryByText, rerender } = render(
      <SecurityLevelPicker securityLevel={LEVEL_IDS[0]} onSelect={() => {}} />
    );
    // Standard level KDF detail is unique to it.
    expect(
      queryByText('Argon2id (64 MB memory, 3 iterations)')
    ).toBeTruthy();

    rerender(
      <SecurityLevelPicker securityLevel={LEVEL_IDS[2]} onSelect={() => {}} />
    );
    expect(
      queryByText('Argon2id (64 MB memory, 3 iterations)')
    ).toBeNull();
    expect(
      queryByText('Argon2id + ML-KEM-1024 hybrid via HKDF-SHA384')
    ).toBeTruthy();
  });

  it('applies active card style only to the selected level', () => {
    const { getAllByRole } = render(
      <SecurityLevelPicker securityLevel={LEVEL_IDS[1]} onSelect={() => {}} />
    );
    const buttons = getAllByRole('button');
    // Active border color is the discriminator (backgroundColor is overridden
    // by the trailing resolved layer style).
    expect(flattenStyle(buttons[1]).borderColor).toBe('rgba(139,92,246,0.5)');
    expect(flattenStyle(buttons[0]).borderColor).toBe('rgba(139,92,246,0.25)');
    expect(flattenStyle(buttons[2]).borderColor).toBe('rgba(139,92,246,0.25)');
  });

  it('renders with an unknown selected id (no level active)', () => {
    const { getAllByRole } = render(
      <SecurityLevelPicker securityLevel="none" onSelect={() => {}} />
    );
    getAllByRole('button').forEach(btn => {
      expect(flattenStyle(btn).borderColor).toBe('rgba(139,92,246,0.25)');
    });
  });
});

function flattenStyle(node: any): Record<string, any> {
  const style = node.props.style;
  const arr = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...arr.filter(Boolean));
}
