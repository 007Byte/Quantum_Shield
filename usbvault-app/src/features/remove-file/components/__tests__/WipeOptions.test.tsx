import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { WipeOptions } from '../WipeOptions';

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
  deletionOptions: 'Deletion Options',
  quickDelete: 'Quick Delete',
  quickDeleteDesc: 'Standard removal',
  secureWipe: 'Secure Wipe',
  secureWipeLabel: 'Overwrite then delete',
  irreversible: 'This action cannot be undone',
};

function renderOptions(secureWipeEnabled: boolean) {
  const onToggleSecureWipe = jest.fn();
  const utils = render(
    <WipeOptions
      secureWipeEnabled={secureWipeEnabled}
      onToggleSecureWipe={onToggleSecureWipe}
      panelStyle={{}}
      labels={labels}
    />
  );
  return { ...utils, onToggleSecureWipe };
}

describe('WipeOptions', () => {
  it('renders the title, both options, and the warning banner', () => {
    const { getByText } = renderOptions(false);
    expect(getByText('Deletion Options')).toBeTruthy();
    expect(getByText('Quick Delete')).toBeTruthy();
    expect(getByText('Standard removal')).toBeTruthy();
    expect(getByText('Secure Wipe')).toBeTruthy();
    expect(getByText('Overwrite then delete')).toBeTruthy();
    expect(getByText('This action cannot be undone')).toBeTruthy();
  });

  it('calls onToggleSecureWipe(false) when the quick-delete option is pressed', () => {
    const { getByText, onToggleSecureWipe } = renderOptions(true);
    fireEvent.press(getByText('Quick Delete'));
    expect(onToggleSecureWipe).toHaveBeenCalledWith(false);
  });

  it('calls onToggleSecureWipe(true) when the secure-wipe option is pressed', () => {
    const { getByText, onToggleSecureWipe } = renderOptions(false);
    fireEvent.press(getByText('Secure Wipe'));
    expect(onToggleSecureWipe).toHaveBeenCalledWith(true);
  });

  it('renders the quick-delete-selected branch when secureWipeEnabled is false', () => {
    // !secureWipeEnabled -> quick radio shows selected dot; render must not throw.
    const { getByText } = renderOptions(false);
    expect(getByText('Quick Delete')).toBeTruthy();
    // Still able to switch to secure wipe from this state.
    fireEvent.press(getByText('Secure Wipe'));
  });

  it('renders the secure-wipe-selected branch when secureWipeEnabled is true', () => {
    // secureWipeEnabled -> secure radio shows selected dot; render must not throw.
    const { getByText, onToggleSecureWipe } = renderOptions(true);
    expect(getByText('Secure Wipe')).toBeTruthy();
    fireEvent.press(getByText('Quick Delete'));
    expect(onToggleSecureWipe).toHaveBeenCalledWith(false);
  });

  it('exposes both option rows plus the title as pressable buttons', () => {
    const { getAllByRole, onToggleSecureWipe } = renderOptions(false);
    const buttons = getAllByRole('button');
    // Two option rows are accessibilityRole=button.
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    fireEvent.press(buttons[0]);
    fireEvent.press(buttons[1]);
    expect(onToggleSecureWipe).toHaveBeenCalledWith(false);
    expect(onToggleSecureWipe).toHaveBeenCalledWith(true);
  });
});
