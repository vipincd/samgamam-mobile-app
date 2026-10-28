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
    ignores: ['dist/*'],
  },
  {
    files: ['jest.setup.js', '**/*.test.ts', '**/*.test.tsx'],
    languageOptions: { globals: jestGlobals },
  },
  {
    // TypeScript already verifies namespace members, and eslint-plugin-import cannot
    // parse some Expo 58 build outputs (e.g. expo-notifications' AndroidImportance enum).
    files: ['**/*.ts', '**/*.tsx'],
    rules: { 'import/namespace': 'off' },
  },
]);
