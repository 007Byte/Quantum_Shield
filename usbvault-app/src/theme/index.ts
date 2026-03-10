export { colors } from './colors';
export { typography } from './typography';
export { spacing } from './spacing';
export type { SpacingKey } from './spacing';

export const theme = {
  colors: require('./colors').colors,
  typography: require('./typography').typography,
  spacing: require('./spacing').spacing,
};

export type Theme = typeof theme;
