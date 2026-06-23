// Component test setup — lighter mocks than jest.setup.js
// Does NOT mock react-native entirely so @testing-library/react-native works

global.__DEV__ = true;

// Mock expo vector icons
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const icon = props => React.createElement(View, props);
  return {
    Feather: icon,
    Ionicons: icon,
    MaterialCommunityIcons: icon,
    Octicons: icon,
  };
});

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Mock i18n
jest.mock('@/i18n', () => ({
  t: (key, opts) => {
    // Return key with interpolations for testing
    if (opts) {
      let result = key;
      for (const [k, v] of Object.entries(opts)) {
        result = result.replace(`{{${k}}}`, String(v));
      }
      return result;
    }
    return key;
  },
  language: 'en',
  changeLanguage: jest.fn(),
}));

// Mock useLanguage hook
jest.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key, opts) => {
      if (opts) {
        let result = key;
        for (const [k, v] of Object.entries(opts)) {
          result = result.replace(`{{${k}}}`, String(v));
        }
        return result;
      }
      return key;
    },
    language: 'en',
    setLanguage: jest.fn(),
  }),
}));
