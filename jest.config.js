const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFiles: ['<rootDir>/jest.polyfills.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // Path alias from tsconfig: @/* → root
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
  // Coverage is scoped to OUR source. Excluded: the orval-generated client (api/generated —
  // machine-generated, would swamp the numbers), barrels/types (no logic), and the vendored
  // interchain-kit starter scaffold (components/common, hooks/common, template utils) which is
  // UI boilerplate we don't own. Everything else that is ours — including the big integration
  // pages — stays in scope.
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'pages/**/*.{ts,tsx}',
    'hooks/**/*.{ts,tsx}',
    'contexts/**/*.{ts,tsx}',
    'utils/**/*.{ts,tsx}',
    'api/authedFetch.ts',
    'api/mutator/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/index.{ts,tsx}',
    '!pages/_app.tsx',
    '!pages/_document.tsx',
    '!pages/_error.tsx',
    '!components/common/**',
    '!hooks/common/**',
    '!utils/common.ts',
    '!utils/eth-test-net.ts',
  ],
  // The big launch pages are integration/wallet/SSE-heavy and covered by Playwright e2e, not unit
  // tests — excluded from the unit coverage report + gate. Regex (NOT glob), because [id].tsx has
  // literal brackets. The proposal deep-link page (pages/launch/[id]/proposal/[propId].tsx) is
  // deliberately NOT matched — it ends in [propId].tsx and stays in scope (it's unit-tested).
  coveragePathIgnorePatterns: [
    '/node_modules/',
    'pages/launch/\\[id\\]\\.tsx$',
    'pages/launch/new\\.tsx$',
  ],
  // Console table on every run + a machine-readable summary at coverage/coverage-summary.json
  // (readable/greppable later) + lcov for CI/HTML drill-down.
  coverageReporters: ['text', 'json-summary', 'lcov'],
  // Ratchet floor — ~2–3% under the actuals (lines 78.7 / stmts 75.4 / funcs 64.6 / branches 58,
  // measured 2026-07-14) so trivial fluctuation doesn't trip it but new untested code does. Bump
  // these up whenever coverage rises; never lower them without a reason in the commit message.
  coverageThreshold: {
    global: {
      lines: 76,
      statements: 73,
      functions: 62,
      branches: 55,
    },
  },
};

module.exports = createJestConfig(config);