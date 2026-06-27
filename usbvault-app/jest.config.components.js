/**
 * Jest configuration for component unit tests.
 *
 * Uses jsdom environment and @testing-library/react-native.
 * Separate from main jest.config.js which mocks react-native entirely
 * for service/store unit tests.
 *
 * Run: npx jest --config jest.config.components.js
 */
module.exports = {
  preset: 'react-native',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
  },
  testMatch: ['<rootDir>/src/components/**/__tests__/**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.components.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(@noble/.*|react-native|@react-native|expo|@expo|@testing-library)/)',
  ],
};
