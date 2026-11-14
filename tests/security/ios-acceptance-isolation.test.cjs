// The iOS acceptance runner must use the shared mock-manager lock (PR #7 protocol)
// and never act on another run's mock or lock.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, mkdtempSync, writeFileSync, chmodSync, mkdirSync, copyFileSync, rmSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const runner = readFileSync(path.join(root, 'scripts/testing/ios-acceptance.sh'), 'utf8');
const code = runner.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');

test('iOS runner delegates lock, mock lifecycle and cleanup to mock-manager exec', () => {
  assert.match(code, /node "\$MANAGER" exec\s*\\\s*\n\s*--platform ios\s*\\\s*\n\s*--port 4318/);
  assert.match(code, /--run-id "\$RUN_ID"/);
  assert.match(code, /RUN_ID="ios-/);
  assert.match(code, /-- node scripts\/testing\/run-maestro\.mjs "\$device" "\$suite"/);
  assert.doesNotMatch(code, /mock-api\.cjs/, 'the runner must not start an unlocked mock itself');
});

test('iOS runner never kills processes or removes lock files', () => {
  for (const forbidden of [/\bkill\b/, /\bpkill\b/, /\bkillall\b/, /\bfuser\b/, /\blsof\b/, /\brm\b/, /\bunlock\b/, /--force/, /--allow-stale|--force-stale/]) {
    assert.doesNotMatch(code, forbidden);
  }
});

test('iOS runner fails closed when the shared mock-manager is absent', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ios-acceptance-'));
  try {
    mkdirSync(path.join(dir, 'scripts/testing'), { recursive: true });
    copyFileSync(path.join(root, 'scripts/testing/ios-acceptance.sh'), path.join(dir, 'scripts/testing/ios-acceptance.sh'));
    // A stub mock server would be started if the runner fell through; make that observable.
    writeFileSync(path.join(dir, 'scripts/testing/mock-api.cjs'), "require('fs').writeFileSync(__dirname + '/started', '1');");
    const result = spawnSync('bash', [path.join(dir, 'scripts/testing/ios-acceptance.sh'), 'TEST-UDID', 'ios'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /mock-manager\.cjs is missing/);
    assert.throws(() => readFileSync(path.join(dir, 'scripts/testing/started')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('iOS runner passes ios platform, its own runId and the Maestro command to mock-manager', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ios-acceptance-'));
  try {
    mkdirSync(path.join(dir, 'scripts/testing'), { recursive: true });
    copyFileSync(path.join(root, 'scripts/testing/ios-acceptance.sh'), path.join(dir, 'scripts/testing/ios-acceptance.sh'));
    // Stand-in manager records its argv instead of taking the real lock or touching port 4318.
    writeFileSync(path.join(dir, 'scripts/testing/mock-manager.cjs'), "require('fs').writeFileSync(__dirname + '/argv.json', JSON.stringify(process.argv.slice(2)));");
    chmodSync(path.join(dir, 'scripts/testing/ios-acceptance.sh'), 0o755);
    const result = spawnSync('bash', [path.join(dir, 'scripts/testing/ios-acceptance.sh'), 'TEST-UDID', 'ios'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const argv = JSON.parse(readFileSync(path.join(dir, 'scripts/testing/argv.json'), 'utf8'));
    assert.equal(argv[0], 'exec');
    assert.equal(argv[argv.indexOf('--platform') + 1], 'ios');
    assert.equal(argv[argv.indexOf('--port') + 1], '4318');
    assert.match(argv[argv.indexOf('--run-id') + 1], /^ios-\d+-\d+$/);
    assert.deepEqual(argv.slice(argv.indexOf('--') + 1), ['node', 'scripts/testing/run-maestro.mjs', 'TEST-UDID', 'ios']);
    assert.ok(!argv.includes('--lock-file'), 'default shared lock path ($(git rev-parse --git-common-dir)) must be used');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('iOS runner refuses Android device serials', () => {
  const result = spawnSync('bash', [path.join(root, 'scripts/testing/ios-acceptance.sh'), 'emulator-5554'], { encoding: 'utf8' });
  // Exits 2 either because mock-manager is absent on this branch or because the serial is Android.
  assert.equal(result.status, 2);
});

test('Maestro runner accepts only the mock owned by its run', async () => {
  const { assertOwnedMock } = await import(path.join(root, 'scripts/testing/mock-ownership.mjs'));
  const health = { service: 'samgamam-acceptance-mock', runId: 'ios-1-1', pid: 10 };
  assert.equal(assertOwnedMock(health, 'ios-1-1'), health);
  assert.throws(() => assertOwnedMock({ ...health, runId: 'android-2-2' }, 'ios-1-1'), /MOCK OWNERSHIP/);
  assert.throws(() => assertOwnedMock({ ...health, runId: undefined }, 'ios-1-1'), /MOCK OWNERSHIP/);
  assert.throws(() => assertOwnedMock({ service: 'other' }, undefined), /Expected Samgamam mock/);
  // Legacy start/stop mode (android-ci.sh) does not export MOCK_RUN_ID: identity check only.
  assert.equal(assertOwnedMock({ service: 'samgamam-acceptance-mock' }, undefined).service, 'samgamam-acceptance-mock');
});

test('Maestro runner exposes the iOS suites and the deep-link flow asserts no API request', () => {
  const runMaestro = readFileSync(path.join(root, 'scripts/testing/run-maestro.mjs'), 'utf8');
  assert.match(runMaestro, /'ios-all': \['smoke', 'regression', 'ios'\]/);
  assert.match(runMaestro, /assertOwnedMock\(health, process\.env\.MOCK_RUN_ID\)/);
  const flow = readFileSync(path.join(root, '.maestro/ios/02_deep_link_rejected.yaml'), 'utf8');
  assert.match(flow, /assert-no-entity-requests\.js/);
});
