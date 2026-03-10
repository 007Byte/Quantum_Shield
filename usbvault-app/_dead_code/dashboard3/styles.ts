import { Platform, TextStyle, ViewStyle } from 'react-native';

export const dashboardColors = {
  bg0: '#070510',
  bg1: '#0B1020',
  panel: 'rgba(20,16,40,0.55)',
  panelStrong: 'rgba(24,18,48,0.74)',
  borderPurple: 'rgba(168,85,247,0.40)',
  borderBlue: 'rgba(96,165,250,0.30)',
  borderCyan: 'rgba(34,211,238,0.28)',
  purple: '#A855F7',
  magenta: '#D946EF',
  cyan: '#22D3EE',
  blue: '#60A5FA',
  green: '#22C55E',
  textPrimary: '#F5F3FF',
  textSecondary: '#B8B3D1',
} as const;

export const dashboardLayout = {
  maxWidth: 1880,
  sidebarWidth: 280,
  rightRailWidth: 330,
  radiusXl: 22,
  radius2Xl: 26,
};

export const glassPanelBase: ViewStyle = {
  backgroundColor: dashboardColors.panel,
  borderWidth: 1,
  borderColor: dashboardColors.borderPurple,
  borderRadius: dashboardLayout.radiusXl,
};

export const glassPanelStrong: ViewStyle = {
  backgroundColor: dashboardColors.panelStrong,
  borderWidth: 1,
  borderColor: dashboardColors.borderPurple,
  borderRadius: dashboardLayout.radiusXl,
};

export const webOnlyGlass: ViewStyle =
  Platform.OS === 'web'
    ? ({
        // RN Web-only visual fidelity: CSS blur glass effect.
        // @ts-ignore
        backdropFilter: 'blur(18px)',
        // RN Web-only visual fidelity: richer glow and elevation.
        // @ts-ignore
        boxShadow:
          '0 0 0 1px rgba(168,85,247,0.12), 0 20px 50px rgba(2,5,20,0.62), inset 0 0 32px rgba(96,165,250,0.07), inset 0 0 70px rgba(168,85,247,0.09)',
      } as ViewStyle)
    : {};

export const webOnlyCosmicBackground: ViewStyle =
  Platform.OS === 'web'
    ? ({
        // RN Web-only visual fidelity: layered radial/linear gradients.
        // @ts-ignore
        background:
          'radial-gradient(circle at 24% 13%, rgba(168,85,247,0.34) 0%, rgba(11,16,32,0) 42%), radial-gradient(circle at 83% 18%, rgba(34,211,238,0.2) 0%, rgba(11,16,32,0) 38%), radial-gradient(circle at 50% 85%, rgba(217,70,239,0.16) 0%, rgba(11,16,32,0) 50%), linear-gradient(160deg, #070510 0%, #0B1020 55%, #070510 100%)',
      } as ViewStyle)
    : {};

export const textGlowStrong: TextStyle =
  Platform.OS === 'web'
    ? ({
        // RN Web-only visual fidelity: soft title glow.
        // @ts-ignore
        textShadow: '0 0 28px rgba(217,70,239,0.5)',
      } as TextStyle)
    : {};
