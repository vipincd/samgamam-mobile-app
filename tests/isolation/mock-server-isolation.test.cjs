const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');

const {
  acquireLock,
  releaseLock,
  startMock,
  stopMock,
  checkPort,
  queryMockHealth,
} = require('../../scripts/testing/mock-manager.cjs');

describe('Android Test Isolation & Process Safety Suite (AND-ISO-01..10)', () => {
  let tmpDir;
  let testPort;
  let lockFile;
  let ownerFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'samgamam-iso-test-'));
    // Use high dynamic test port to avoid collision with any developer service
    testPort = 20000 + Math.floor(Math.random() * 20000);
    lockFile = path.join(tmpDir, 'test-acceptance.lock');
    ownerFile = path.join(tmpDir, 'test-mock-owner.json');
  });

  afterEach(async () => {
    try {
      if (fs.existsSync(ownerFile)) {
        const data = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
        if (data.pid) {
          try { process.kill(data.pid, 'SIGKILL'); } catch {}
        }
      }
    } catch {}

    try {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    } catch {}

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('AND-ISO-01: Port available -> Mock starts and verifies ownership', async () => {
    const runId = `android-test-iso-01-${Date.now()}`;
    const ownerData = await startMock({
      port: testPort,
      runId,
      platform: 'android',
      ownerFile,
      lockPath: lockFile,
    });

    assert.ok(ownerData.pid > 0, 'Mock process PID must be recorded');
    assert.equal(ownerData.runId, runId);
    assert.equal(ownerData.port, testPort);

    // Verify health endpoint identity
    const health = await queryMockHealth(testPort);
    assert.equal(health.status, 200);
    assert.equal(health.data.service, 'samgamam-acceptance-mock');
    assert.equal(health.data.runId, runId);
    assert.equal(health.data.pid, ownerData.pid);

    // Stop and clean up
    await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
    assert.equal(fs.existsSync(lockFile), false, 'Lock must be released');
  });

  test('AND-ISO-02: Foreign listener occupies port -> Test runner fails without terminating foreign listener', async () => {
    // Start an independent foreign HTTP server on testPort
    let foreignTerminated = false;
    const foreignServer = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('foreign-service');
    });

    await new Promise((resolve) => foreignServer.listen(testPort, '127.0.0.1', resolve));
    foreignServer.on('close', () => { foreignTerminated = true; });

    const runId = `android-test-iso-02-${Date.now()}`;

    // Attempting to start the mock must fail closed
    await assert.rejects(
      async () => {
        await startMock({
          port: testPort,
          runId,
          platform: 'android',
          ownerFile,
          lockPath: lockFile,
        });
      },
      /PORT CONFLICT/,
    );

    // Foreign server must still be running and alive!
    assert.equal(foreignTerminated, false, 'Foreign listener must NOT be terminated');
    const res = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${testPort}`, (r) => resolve(r.statusCode));
    });
    assert.equal(res, 200, 'Foreign listener must still respond with 200');

    // Clean up foreign server
    await new Promise((resolve) => foreignServer.close(resolve));
  });

  test('AND-ISO-03: iOS mock owns port -> Android leaves it untouched and fails closed', async () => {
    const iosRunId = `ios-test-session-${Date.now()}`;
    const iosLockFile = lockFile;
    const iosOwnerFile = path.join(tmpDir, 'ios-owner.json');

    // Simulate Developer D iOS mock startup
    const iosOwner = await startMock({
      port: testPort,
      runId: iosRunId,
      platform: 'ios',
      ownerFile: iosOwnerFile,
      lockPath: iosLockFile,
    });

    // Android attempts to run on the same environment
    const androidRunId = `android-test-session-${Date.now()}`;
    await assert.rejects(
      async () => {
        await startMock({
          port: testPort,
          runId: androidRunId,
          platform: 'android',
          ownerFile,
          lockPath: iosLockFile,
        });
      },
      /LOCK BUSY.*ios/,
    );

    // iOS mock must be completely untouched and intact
    const health = await queryMockHealth(testPort);
    assert.equal(health.status, 200);
    assert.equal(health.data.runId, iosRunId);
    assert.equal(health.data.pid, iosOwner.pid);

    // Cleanup iOS mock
    await stopMock({ runId: iosRunId, ownerFile: iosOwnerFile, lockPath: iosLockFile, port: testPort });
  });

  test('AND-ISO-04: Android owns mock -> Cleanup terminates owned mock only', async () => {
    // 1. Start a foreign server on an adjacent port
    const foreignPort = testPort + 1;
    let foreignKilled = false;
    const foreignServer = http.createServer((req, res) => res.end('foreign'));
    await new Promise((r) => foreignServer.listen(foreignPort, '127.0.0.1', r));
    foreignServer.on('close', () => { foreignKilled = true; });

    // 2. Start Android mock on testPort
    const runId = `android-test-iso-04-${Date.now()}`;
    const ownerData = await startMock({
      port: testPort,
      runId,
      platform: 'android',
      ownerFile,
      lockPath: lockFile,
    });

    assert.ok(ownerData.pid > 0);

    // 3. Stop Android mock
    await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });

    // 4. Verify owned mock is stopped
    const mockPortStatus = await checkPort(testPort);
    assert.equal(mockPortStatus.occupied, false, 'Owned mock port must be freed');

    // 5. Verify foreign server is still alive
    assert.equal(foreignKilled, false, 'Foreign server must NOT be affected');
    await new Promise((r) => foreignServer.close(r));
  });

  test('AND-ISO-05: Mock exits early -> Clear failure diagnostic', async () => {
    const runId = `android-test-iso-05-${Date.now()}`;
    // Point to a non-existent script root to force immediate spawn error
    await assert.rejects(
      async () => {
        await startMock({
          port: testPort,
          runId,
          platform: 'android',
          ownerFile,
          lockPath: lockFile,
          projectRoot: path.join(tmpDir, 'empty-dir'),
        });
      },
      /Mock process exited early|MOCK TIMEOUT/,
    );

    // Lock must not remain held
    assert.equal(fs.existsSync(lockFile), false, 'Lock must be freed on early failure');
  });

  test('AND-ISO-06: Runner receives SIGTERM -> Safe cleanup and lock release', async () => {
    const runId = `android-test-iso-06-${Date.now()}`;
    const ownerData = await startMock({
      port: testPort,
      runId,
      platform: 'android',
      ownerFile,
      lockPath: lockFile,
    });

    // Simulate SIGTERM handling by running stopMock
    await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });

    const portStatus = await checkPort(testPort);
    assert.equal(portStatus.occupied, false, 'Port must be released');
    assert.equal(fs.existsSync(lockFile), false, 'Lock file must be unlinked');
  });

  test('AND-ISO-07: Runner fails during setup -> No foreign process affected', async () => {
    // Start foreign service
    const foreignServer = http.createServer((req, res) => res.end('safe'));
    await new Promise((r) => foreignServer.listen(testPort, '127.0.0.1', r));

    // Runner tries setup, fails because port is occupied
    const runId = `android-test-iso-07-${Date.now()}`;
    await assert.rejects(
      async () => {
        await startMock({
          port: testPort,
          runId,
          platform: 'android',
          ownerFile,
          lockPath: lockFile,
        });
      },
      /PORT CONFLICT/,
    );

    // Attempting cleanup on failure
    await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });

    // Foreign server is still listening!
    const status = await checkPort(testPort);
    assert.equal(status.occupied, true, 'Foreign process must remain running');
    await new Promise((r) => foreignServer.close(r));
  });

  test('AND-ISO-08: Concurrent Android and iOS requests -> Mutual exclusion prevents interference', async () => {
    const iosRunId = `ios-iso-08-${Date.now()}`;
    const androidRunId = `android-iso-08-${Date.now()}`;

    // Acquire lock for iOS
    acquireLock({ platform: 'ios', runId: iosRunId, lockPath: lockFile });

    // Android tries to acquire lock concurrently
    assert.throws(
      () => {
        acquireLock({ platform: 'android', runId: androidRunId, lockPath: lockFile });
      },
      /LOCK BUSY.*ios/,
    );

    // Release iOS lock
    releaseLock({ runId: iosRunId, lockPath: lockFile });

    // Now Android can acquire lock
    const androidLock = acquireLock({ platform: 'android', runId: androidRunId, lockPath: lockFile });
    assert.equal(androidLock.acquired, true);

    releaseLock({ runId: androidRunId, lockPath: lockFile });
  });

  test('AND-ISO-09: Stale or malformed ownership metadata -> Fail safely', async () => {
    // 1. Write malformed JSON to lock file
    fs.writeFileSync(lockFile, '{{malformed json!!!', 'utf8');

    const runId = `android-iso-09-${Date.now()}`;
    assert.throws(
      () => {
        acquireLock({ platform: 'android', runId, lockPath: lockFile });
      },
      /LOCK ERROR.*malformed/,
      'Must fail closed on malformed lock metadata',
    );

    // 2. Write empty/missing runId
    fs.writeFileSync(lockFile, JSON.stringify({ pid: 1234 }), 'utf8');
    assert.throws(
      () => {
        acquireLock({ platform: 'android', runId, lockPath: lockFile });
      },
      /LOCK ERROR.*malformed/,
      'Must fail closed on missing runId metadata',
    );
  });

  test('AND-ISO-10: Runner exits successfully -> No owned resources leak', async () => {
    const runId = `android-test-iso-10-${Date.now()}`;
    const ownerData = await startMock({
      port: testPort,
      runId,
      platform: 'android',
      ownerFile,
      lockPath: lockFile,
    });

    assert.equal(fs.existsSync(lockFile), true);
    assert.equal(fs.existsSync(ownerFile), true);

    await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });

    assert.equal(fs.existsSync(lockFile), false, 'Lock file must not leak');
    assert.equal(fs.existsSync(ownerFile), false, 'Owner file must not leak');

    const portStatus = await checkPort(testPort);
    assert.equal(portStatus.occupied, false, 'Port must not remain bound');
  });
});
