// Regression tests for lock atomicity, serialised stale recovery and mock run
// ownership. Every fixture lives in a private temp dir; no test touches the
// real shared lock or port 4318.
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const {
  acquireLock,
  releaseLock,
  updateLockMetadata,
  unlockLock,
} = require('../../scripts/testing/mock-manager.cjs');
const { createMockServer } = require('../../scripts/testing/mock-api.cjs');

const root = path.join(__dirname, '../..');
const contender = path.join(__dirname, 'fixtures/lock-contender.cjs');
// Port with nothing listening, so health probes fail fast and deterministically.
const DEAD_PORT = 1;

function runContender(args) {
  return execFileAsync(process.execPath, [contender, ...args], {
    env: { ...process.env, CONTENDER_PORT: String(DEAD_PORT) },
  }).then(({ stdout }) => JSON.parse(stdout.trim().split('\n').pop()));
}

describe('Lock atomicity, serialised recovery and mock run ownership', () => {
  let tmpDir;
  let lockFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'samgamam-atomic-test-'));
    lockFile = path.join(tmpDir, 'test-acceptance.lock');
  });

  afterEach(() => {
    // tmpDir is created by this test only; nothing foreign can live inside it.
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('ATOMIC-01: Foreign contenders never observe partial lock metadata during owner updates', async () => {
    await acquireLock({ platform: 'android', runId: 'owner-A', lockPath: lockFile, port: DEAD_PORT });
    updateLockMetadata({ lockPath: lockFile, runId: 'owner-A', updates: { runnerPid: process.pid } });

    const [writer, reader] = await Promise.all([
      runContender(['writer', lockFile, '2000']),
      runContender(['reader', lockFile, '1800']),
    ]);

    assert.ok(writer.updates > 50, `writer made ${writer.updates} updates`);
    const total = Object.values(reader).reduce((a, b) => a + b, 0);
    assert.ok(total > 50, `reader made ${total} attempts`);
    assert.deepEqual(Object.keys(reader), ['[LOCK BUSY]'], `unexpected outcomes ${JSON.stringify(reader)}`);
    assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).runId, 'owner-A');
    assert.deepEqual(fs.readdirSync(tmpDir), ['test-acceptance.lock'], 'no temp files left behind');
  });

  test('ATOMIC-02: Concurrent multi-process stale recovery never deletes a freshly acquired lock', async () => {
    fs.writeFileSync(lockFile, JSON.stringify({ platform: 'android', runId: 'stale-X', runnerPid: 999999, mockPid: 999998, port: DEAD_PORT }));

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => runContender(['cycler', lockFile, '2500', `w${i}`])),
    );
    const acquired = results.reduce((a, r) => a + (r.acquired || 0), 0);
    const lost = results.reduce((a, r) => a + (r.lost || 0), 0);

    assert.ok(acquired > 20, `expected meaningful contention, got ${acquired} acquisitions`);
    assert.equal(lost, 0, `${lost} live locks were deleted by a concurrent recoverer`);
    const leftovers = fs.readdirSync(tmpDir).filter((f) => f !== 'test-acceptance.lock');
    assert.deepEqual(leftovers, [], 'no temp files or recovery guard left behind');
  });

  test('ATOMIC-03: Recovery guard held by a live process -> force unlock refused, lock and guard preserved', async () => {
    fs.writeFileSync(lockFile, JSON.stringify({ platform: 'ios', runId: 'stale-ios', runnerPid: 999999, mockPid: 999998, port: DEAD_PORT }));
    const guardDir = `${lockFile}.recovery`;
    fs.mkdirSync(guardDir);
    fs.writeFileSync(path.join(guardDir, 'holder.json'), JSON.stringify({ pid: process.pid, token: 'foreign-token', startedAt: 'now' }));

    await assert.rejects(
      unlockLock({ lockPath: lockFile, port: DEAD_PORT, force: true }),
      /LOCK RECOVERY BUSY.*alive: true/,
    );
    assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).runId, 'stale-ios', 'lock preserved');
    assert.equal(JSON.parse(fs.readFileSync(path.join(guardDir, 'holder.json'), 'utf8')).token, 'foreign-token', 'foreign guard preserved');
  });

  test('ATOMIC-04: Create, update and owned release leave no temp files; foreign release refused', async () => {
    await acquireLock({ platform: 'android', runId: 'run-4', lockPath: lockFile, port: DEAD_PORT });
    assert.equal(updateLockMetadata({ lockPath: lockFile, runId: 'run-4', updates: { mockPid: 123 } }), true);
    assert.equal(updateLockMetadata({ lockPath: lockFile, runId: 'other', updates: { mockPid: 456 } }), false);
    assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).mockPid, 123);
    assert.deepEqual(fs.readdirSync(tmpDir), ['test-acceptance.lock']);
    assert.equal(releaseLock({ runId: 'other', lockPath: lockFile }), false);
    assert.ok(fs.existsSync(lockFile));
    assert.equal(releaseLock({ runId: 'run-4', lockPath: lockFile }), true);
    assert.deepEqual(fs.readdirSync(tmpDir), []);
  });

  test('RUNID-01: Mock control endpoints only answer the owning run; health stays public', async () => {
    const server = createMockServer({ runId: 'ios-owner' });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      const health = await (await fetch(`${base}/__mock/health`)).json();
      assert.equal(health.runId, 'ios-owner');

      for (const headers of [{}, { 'x-mock-run-id': 'android-intruder' }]) {
        const r = await fetch(`${base}/__mock/reset?mode=error`, { method: 'POST', headers });
        assert.equal(r.status, 409);
        assert.equal((await r.json()).error.code, 'mock_run_mismatch');
        assert.equal((await fetch(`${base}/__mock/history`, { headers })).status, 409);
      }
      assert.equal((await fetch(`${base}/api/v1/events`)).status, 200, 'owner scenario unchanged');

      const own = await fetch(`${base}/__mock/reset?mode=error`, { method: 'POST', headers: { 'x-mock-run-id': 'ios-owner' } });
      assert.equal(own.status, 200);
      assert.equal((await fetch(`${base}/api/v1/events`)).status, 503);
    } finally {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });

  test('RUNID-02: Maestro runner refuses without a run id or when the lock belongs to another run', async () => {
    const runner = path.join(root, 'scripts/testing/run-maestro.mjs');
    const env = { ...process.env, ACCEPTANCE_LOCK_PATH: lockFile };
    delete env.MOCK_RUN_ID;

    await assert.rejects(
      execFileAsync(process.execPath, [runner, 'emulator-0000', 'smoke'], { cwd: root, env }),
      (err) => /MOCK_RUN_ID is not set/.test(err.stderr),
    );

    fs.writeFileSync(lockFile, JSON.stringify({ platform: 'ios', runId: 'ios-owner', runnerPid: process.pid }));
    await assert.rejects(
      execFileAsync(process.execPath, [runner, 'emulator-0000', 'smoke'], { cwd: root, env: { ...env, MOCK_RUN_ID: 'android-run' } }),
      (err) => /not owned by run android-run \(owner: ios-owner\)/.test(err.stderr),
    );
    assert.equal(JSON.parse(fs.readFileSync(lockFile, 'utf8')).runId, 'ios-owner', 'foreign lock untouched');
  });
});
