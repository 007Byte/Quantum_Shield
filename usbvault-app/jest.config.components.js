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
  // testMatch spans BOTH the shared common components AND the feature
  // components (src/features/*/components). The feature components are
  // additionally GATED below via coverageThreshold — they sat at ~0% (untested
  // under either jest config) before 2026-06-29 and are now render-tested to
  // ~100%. No .test.tsx exists outside these two trees, so this glob does not
  // accidentally pick up app screens.
  testMatch: [
    '<rootDir>/src/components/**/__tests__/**/*.test.tsx',
    '<rootDir>/src/features/**/__tests__/**/*.test.tsx',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.components.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(@noble/.*|react-native|@react-native|expo|@expo|@testing-library)/)',
  ],
  // Coverage GATE for the feature components (src/features/*/components/*.tsx).
  // Scoped to features ONLY: the 84 shared src/components are still RUN by this
  // config, but most are not yet render-tested (13/84), so adding them to the
  // denominator would crater it. CI runs this config WITH --coverage, so the
  // threshold below is an enforced no-regression floor — jest exits non-zero if
  // any feature component regresses (measured 2026-06-29: 100% lines/functions/
  // statements, 98.94% branches; floors set a few points below). Raise as
  // coverage of the shared components grows; never lower.
  // A SEPARATE coverageDirectory keeps this from overwriting the service-layer
  // gate's coverage/coverage-summary.json (written by jest.config.js).
  collectCoverageFrom: ['src/features/**/components/**/*.tsx'],
  coverageDirectory: '<rootDir>/coverage-components',
  coverageReporters: ['text-summary', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
};
