import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AlgorithmPicker } from '../AlgorithmPicker';
import { getAlgorithmOptions } from '../../domain/encrypt.data';

// Deterministic theme so style resolution does not throw. Returns a usable
// theme object shaped like the real layer engine output.
jest.mock('@/theme/engine', () => {
  const layerState = {
    native: { backgroundColor: '#120C28' },
    web: {},
    text: { primary: '#F5F3FF', secondary: '#B8B3D1' },
  };
  return {
    // Used by @/theme/compat (loaded via dashboard2/styles) — return the real
    // dark theme so the compat proxy resolves correctly.
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

// i18n passthrough so option labels resolve to readable strings.
const ALGO_IDS = getAlgorithmOptions((k: string) => k).map(a => a.id);

describe('AlgorithmPicker', () => {
  it('renders all algorithm options without throwing', () => {
    const { getByText } = render(<AlgorithmPicker algorithm={ALGO_IDS[0]} onSelect={() => {}} />);
    expect(getByText('AES-256-GCM-SIV')).toBeTruthy();
    expect(getByText('XChaCha20-Poly1305')).toBeTruthy();
    expect(getByText('ML-KEM-1024 Hybrid')).toBeTruthy();
  });

  it('renders the section label and hint', () => {
    const { getByText } = render(<AlgorithmPicker algorithm={ALGO_IDS[0]} onSelect={() => {}} />);
    expect(getByText('encrypt.algorithm')).toBeTruthy();
    expect(getByText('encrypt.algorithmHint')).toBeTruthy();
  });

  it('renders one Pressable per option', () => {
    const { getAllByRole } = render(
      <AlgorithmPicker algorithm={ALGO_IDS[0]} onSelect={() => {}} />
    );
    expect(getAllByRole('button')).toHaveLength(ALGO_IDS.length);
  });

  it('fires onSelect with the correct id for each option', () => {
    const onSelect = jest.fn();
    const { getAllByRole } = render(
      <AlgorithmPicker algorithm={ALGO_IDS[0]} onSelect={onSelect} />
    );
    const buttons = getAllByRole('button');
    buttons.forEach((btn, idx) => {
      fireEvent.press(btn);
      expect(onSelect).toHaveBeenNthCalledWith(idx + 1, ALGO_IDS[idx]);
    });
    expect(onSelect).toHaveBeenCalledTimes(ALGO_IDS.length);
  });

  it('shows expanded detail rows only for the selected algorithm', () => {
    // First option (AES) carries a "Cipher" detail value unique to it.
    const { queryByText, rerender } = render(
      <AlgorithmPicker algorithm={ALGO_IDS[0]} onSelect={() => {}} />
    );
    expect(queryByText('256-bit AES in GCM-SIV mode (12-byte nonce)')).toBeTruthy();

    // Select a different option — the AES detail must collapse away.
    rerender(<AlgorithmPicker algorithm={ALGO_IDS[1]} onSelect={() => {}} />);
    expect(queryByText('256-bit AES in GCM-SIV mode (12-byte nonce)')).toBeNull();
    expect(queryByText('XChaCha20 stream cipher (24-byte nonce)')).toBeTruthy();
  });

  it('applies active card style only to the selected option', () => {
    const { getAllByRole } = render(
      <AlgorithmPicker algorithm={ALGO_IDS[2]} onSelect={() => {}} />
    );
    const buttons = getAllByRole('button');
    // RTL exposes the resolved style array on the host node. The active border
    // color is the discriminator (backgroundColor is overridden by the trailing
    // layer style, so we assert on borderColor).
    expect(flattenStyle(buttons[2]).borderColor).toBe('rgba(139,92,246,0.5)');
    expect(flattenStyle(buttons[0]).borderColor).toBe('rgba(139,92,246,0.25)');
    expect(flattenStyle(buttons[1]).borderColor).toBe('rgba(139,92,246,0.25)');
  });

  it('renders with an unknown selected id (no option active)', () => {
    const { getAllByRole } = render(
      <AlgorithmPicker algorithm="none-selected" onSelect={() => {}} />
    );
    getAllByRole('button').forEach(btn => {
      // No option matches → every card keeps the inactive border color.
      expect(flattenStyle(btn).borderColor).toBe('rgba(139,92,246,0.25)');
    });
  });
});

function flattenStyle(node: any): Record<string, any> {
  const style = node.props.style;
  const arr = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...arr.filter(Boolean));
}
