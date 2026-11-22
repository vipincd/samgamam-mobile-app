// Regression test: every Babel preset/plugin and Jest preset that package.json
// names directly must be a declared dependency, not something reachable only
// through npm hoisting. A patch upgrade of `expo` once nested
// babel-preset-expo under node_modules/expo/, and every Jest suite then
// failed with "Cannot find module 'babel-preset-expo'".
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

const declared = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

function babelName(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

function referencedToolchainPackages() {
  const names = new Set();
  const jest = pkg.jest || {};
  if (typeof jest.preset === 'string') names.add(jest.preset);
  for (const transform of Object.values(jest.transform || {})) {
    if (!Array.isArray(transform)) continue;
    const [transformer, options = {}] = transform;
    if (typeof transformer === 'string' && !transformer.startsWith('<rootDir>')) names.add(transformer);
    for (const preset of options.presets || []) names.add(babelName(preset));
    for (const plugin of options.plugins || []) names.add(babelName(plugin));
  }
  return [...names].filter((n) => typeof n === 'string' && !n.startsWith('.') && !path.isAbsolute(n));
}

describe('Toolchain packages referenced by package.json are declared', () => {
  const referenced = referencedToolchainPackages();

  test('the Jest config references babel-preset-expo (guards this test against going vacuous)', () => {
    assert.ok(referenced.includes('babel-preset-expo'), `referenced: ${referenced.join(', ')}`);
  });

  for (const name of referenced) {
    test(`${name} is a direct dependency in package.json`, () => {
      assert.ok(declared[name], `${name} is used by the Jest config but not declared; it only resolves via hoisting`);
    });

    test(`${name} is installed at the top level by the lockfile`, () => {
      const rootEntry = lock.packages && lock.packages[''];
      const lockDeclared = { ...(rootEntry?.dependencies || {}), ...(rootEntry?.devDependencies || {}) };
      assert.equal(lockDeclared[name], declared[name], `package-lock.json root is out of sync for ${name}`);
      assert.ok(lock.packages[`node_modules/${name}`], `node_modules/${name} is missing from package-lock.json`);
    });
  }
});
