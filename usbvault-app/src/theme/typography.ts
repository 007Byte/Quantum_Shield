import { Platform } from 'react-native';

const baseFont = Platform.select({
  ios: 'SF Pro Display',
  android: 'Roboto',
  web: 'Inter, system-ui, sans-serif',
  default: 'system-ui',
});

export const typography = {
  fontFamily: baseFont,

  sizes: {
    xs: 11,
    sm: 13,
    base: 15,
    lg: 17,
    xl: 20,
    '2xl': 24,
    '3xl': 28,
    hero: 36,
  },

  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },

  // Pre-composed styles
  displayHero: {
    fontSize: 36,
    fontWeight: '700' as const,
    lineHeight: 44,
    fontFamily: baseFont,
  },

  display3xl: {
    fontSize: 28,
    fontWeight: '700' as const,
    lineHeight: 36,
    fontFamily: baseFont,
  },

  display2xl: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
    fontFamily: baseFont,
  },

  displayXl: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
    fontFamily: baseFont,
  },

  displayLg: {
    fontSize: 18,
    fontWeight: '600' as const,
    lineHeight: 26,
    fontFamily: baseFont,
  },

  bodyBase: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
    fontFamily: baseFont,
  },

  bodySm: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 20,
    fontFamily: baseFont,
  },

  bodyXs: {
    fontSize: 11,
    fontWeight: '400' as const,
    lineHeight: 16,
    fontFamily: baseFont,
  },

  labelBase: {
    fontSize: 15,
    fontWeight: '500' as const,
    lineHeight: 22,
    fontFamily: baseFont,
  },

  labelSm: {
    fontSize: 13,
    fontWeight: '500' as const,
    lineHeight: 20,
    fontFamily: baseFont,
  },
};
