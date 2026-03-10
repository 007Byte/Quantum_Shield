// Jest setup file

// Define React Native globals used by logger and other modules
global.__DEV__ = true;

// Mock NativeModules for testing
jest.mock('react-native', () => ({
  NativeModules: {
    USBVaultCrypto: undefined,
  },
  Platform: {
    OS: 'ios',
  },
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Suppress console errors in tests (optional)
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render')
    ) {
      return;
    }
    originalError.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
});
