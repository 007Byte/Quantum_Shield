module.exports = {
  // Note: 'react-native' preset not used here because NativeWind's babel
  // plugin conflicts with RN's jest/setup.js babel transform. Service-layer
  // tests use ts-jest directly; component tests use jest.config.components.js.
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testEnvironment: 'jsdom',
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
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@sentry/react-native|@sentry/core|@sentry/types|@sentry/utils|@sentry/browser|expo-.*|@expo/.*|react-native|@react-native|posthog-react-native|react-native-purchases)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@screens/(.*)$': '<rootDir>/src/app/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@stores/(.*)$': '<rootDir>/src/stores/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@theme/(.*)$': '<rootDir>/src/theme/$1',
    '^@crypto/(.*)$': '<rootDir>/src/crypto/$1',
  },
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts', '<rootDir>/src/**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '\\.test\\.tsx$'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/app/**',
    '!src/components/**',
    '!src/theme/**',
    // SECURITY-CRITICAL: explicitly KEEP crypto + services in coverage
    // collection. The zero-knowledge design performs all cryptography on the
    // client, so these directories must never be silently dropped from the
    // coverage denominator (which would let the global gate be gamed by
    // excluding the untested security surface).
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  maxWorkers: '50%',
  // FIX 5 (TS coverage gate): a RATCHET threshold is now enforced. Previously
  // the threshold was commented out so `jest --coverage` could never fail and
  // coverage regressions went uncaught. The global floor is set conservatively
  // below the measured baseline (~34%) so it can only move up over time, while
  // the security-critical src/crypto and src/services directories — where all
  // client-side cryptography lives — carry a substantially higher bar.
  //
  // Ratchet policy: raise these numbers as coverage climbs; never lower them.
  // jest --coverage exits non-zero if ANY of these is not met, so the CI
  // "Check TypeScript coverage threshold" step now gates real regressions
  // instead of merely warning.
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 30,
      lines: 33,
      statements: 33,
    },
    // Security-critical: client crypto primitives and bridge. Higher bar than
    // the global floor. NOTE: these per-directory numbers are conservative
    // starting points — if a CI run reports actual coverage above them, RATCHET
    // them up toward parity with the real figure; never lower them.
    './src/crypto/': {
      branches: 45,
      functions: 50,
      lines: 50,
      statements: 50,
    },
    // Security-critical: key hierarchy, session, SRP, recovery-phrase services.
    './src/services/': {
      branches: 35,
      functions: 40,
      lines: 40,
      statements: 40,
    },
  },
};
