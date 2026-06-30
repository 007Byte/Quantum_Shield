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
    // Test files must NOT be in the coverage denominator. jest auto-excludes
    // files matching THIS config's testMatch (the *.test.ts suites), but NOT
    // the *.test.tsx component suites (run under jest.config.components.js and
    // ignored here via testPathIgnorePatterns). Without this line those .test.tsx
    // files count as 0%-covered "source" and silently drag the global down
    // (~78.6% -> ~71.8% once the feature-component tests land). Exclude all
    // __tests__ so the gate measures production code only.
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}',
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
  // IMPORTANT — two different "global" numbers, both real:
  //  * coverage-summary.json `.total` (what the CI "70% TS check" reads) = ~78.6%
  //    lines. It only counts files that at least one suite TOUCHES.
  //  * jest's ENFORCED `global` coverageThreshold = ~54.5% lines. It is computed
  //    over the FULL collectCoverageFrom expansion, INCLUDING files no test ever
  //    imports (forced to 0%): generated data (utils/weakPasswordBloom), pure
  //    *.types.ts, partially-tested modules. collectCoverageFrom force-include
  //    WINS over coveragePathIgnorePatterns, so you cannot lift this number by
  //    ignore-patterns — only by actually testing more production code. This (not
  //    a cache flake) is the source of the old "summary says 78% but the gate
  //    sees ~20%" confusion; pre-wave-3 the enforced global was genuinely ~15-20%.
  // The floors below are the ENFORCED numbers (measured 2026-06-29: 54.53% lines /
  // 53.91% statements / 45.31% functions / 36.23% branches), set ~6 points under
  // actual so CI denominator variance can't flake. The per-directory crypto/
  // services floors remain the meaningful security gate. Ratchet UP; never lower.
  coverageThreshold: {
    global: {
      branches: 30,
      functions: 38,
      lines: 45,
      statements: 45,
    },
    // Security-critical: client crypto primitives and bridge (~84.5% covered;
    // unchanged by the coverage waves, which targeted services/stores/hooks).
    './src/crypto/': {
      branches: 47,
      functions: 80,
      lines: 82,
      statements: 82,
    },
    // Security-critical services: key hierarchy, session, SRP, recovery, vault,
    // device, messaging, security, billing, etc. — 87.5% lines / 74.8% branches /
    // 86.3% functions / 86.4% statements after waves 1-3.
    './src/services/': {
      branches: 71,
      functions: 82,
      lines: 84,
      statements: 82,
    },
  },
};
