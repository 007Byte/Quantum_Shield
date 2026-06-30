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
    // Transform ESM-only JS dependencies (e.g. @noble/* v2, which ships pure ESM)
    // into CJS so they load under jsdom. babel-jest uses the repo babel.config.js
    // (babel-preset-expo), which converts ESM->CJS in the CommonJS test env. Only
    // applied to plain .js deps (the @noble crypto libs), not app JSX.
    '^.+\\.(js|jsx|mjs|cjs)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@noble/.*|@sentry/react-native|@sentry/core|@sentry/types|@sentry/utils|@sentry/browser|expo-.*|@expo/.*|react-native|@react-native|posthog-react-native|react-native-purchases)/)',
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
  // json-summary is REQUIRED by the CI "Check TypeScript coverage threshold"
  // step (it reads coverage/coverage-summary.json); without it that file is
  // never generated and the CI check silently no-ops.
  coverageReporters: ['json-summary', 'text', 'text-summary', 'lcov'],
  // Ratchet floors set strictly BELOW the measured baseline (measured 2026-06-26
  // over the UI-inclusive denominator: global lines ~19% / branches ~11% /
  // functions ~14% / statements ~19%; crypto lines+statements ~32% / branches
  // ~24% / functions ~43%; services branches ~32%). jest --coverage enforces
  // these as a real floor. Ratchet UP as coverage climbs; never lower.
  // Ratcheted 2026-06-29 (after coverage waves 1+2) to lock current coverage as a
  // NO-REGRESSION floor — a couple points below the jest-measured actuals so a minor
  // fluctuation doesn't fail CI. Raise as coverage grows; never lower.
  //
  // The per-directory crypto/services floors are the meaningful protection (waves 1+2
  // took services ~45%->~83% lines and crypto stays ~84%). The jest-enforced GLOBAL
  // stays low (~20% lines / ~12% branches) because collectCoverageFrom spans src/**
  // EXCEPT app/components/theme — so it still includes the large, still-untested
  // src/hooks and src/stores layers that drag the average down. Raising global
  // meaningfully needs those covered (tracked in REMAINING_WORK.md).
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 13,
      lines: 18,
      statements: 18,
    },
    // Security-critical: client crypto primitives and bridge (~84% covered).
    './src/crypto/': {
      branches: 47,
      functions: 80,
      lines: 82,
      statements: 82,
    },
    // Security-critical services: key hierarchy, session, SRP, recovery, vault,
    // device, messaging, security, billing, etc. (~83% covered after waves 1+2).
    './src/services/': {
      branches: 66,
      functions: 79,
      lines: 80,
      statements: 80,
    },
  },
};
