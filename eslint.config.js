const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const jestGlobals = {
  jest: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeAll: 'readonly',
  beforeEach: 'readonly',
  afterAll: 'readonly',
  afterEach: 'readonly',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/**', 'artifacts/**', 'docs/testing/evidence/**', '.maestro/**'],
  },
  {
    files: ['jest.setup.js', '**/*.test.ts', '**/*.test.tsx'],
    languageOptions: { globals: jestGlobals },
    rules: { 'import/no-unresolved': 'off' },
  },
  {
    // TypeScript already verifies namespace members, and eslint-plugin-import cannot
    // parse some Expo 58 build outputs (e.g. expo-notifications' AndroidImportance enum).
    files: ['**/*.ts', '**/*.tsx'],
    rules: { 'import/namespace': 'off' },
  },
]);
