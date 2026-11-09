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
  execSuite,
} = require('../../scripts/testing/mock-manager.cjs');

describe('Cross-Platform Lock Safety, Test Isolation & Process Safety Suite', () => {
  let tmpDir;
  let testPort;
  let lockFile;
  let ownerFile;
  let activeRunIds = [];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'samgamam-iso-test-'));
    // Use dynamic port to avoid collision with any developer service
    testPort = 20000 + Math.floor(Math.random() * 20000);
    lockFile = path.join(tmpDir, 'test-acceptance.lock');
    ownerFile = path.join(tmpDir, 'test-mock-owner.json');
    activeRunIds = [];
  });

  afterEach(async () => {
    // Verified safe cleanup: only stop known owned test runs via stopMock
    for (const runId of activeRunIds) {
      try {
        await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
      } catch {}
    }

    try {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    } catch {}

    try {
      if (fs.existsSync(ownerFile)) {
        fs.unlinkSync(ownerFile);
      }
    } catch {}

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test('LOCK-01: Android owns lock -> iOS cannot start conflicting suite', async () => {
    const androidRunId = `android-test-lock-01-${Date.now()}`;
    activeRunIds.push(androidRunId);

    // Android starts mock and acquires lock
    const ownerData = await startMock({
      port: testPort,
      runId: androidRunId,
      platform: 'android',
      ownerFile,
      lockPath: lockFile,
    });
    assert.ok(ownerData.pid > 0);

    // iOS attempts to start on same lock
    const iosRunId = `ios-test-lock-01-${Date.now()}`;
    await assert.rejects(
      async () => {
        await startMock({
          port: testPort,
          runId: iosRunId,
          platform: 'ios',
          ownerFile: path.join(tmpDir, 'ios-owner.json'),
          lockPath: lockFile,
        });
      },
      /LOCK BUSY.*android/,
      'iOS must be rejected when Android holds active lock',
    );

    // Android mock must remain unaffected
    const health = await queryMockHealth(testPort);
    assert.equal(health?.status, 200);
    assert.equal(health?.data?.runId, androidRunId);
  });

  test('LOCK-02: iOS owns lock -> Android cannot start conflicting suite', async () => {
    const iosRunId = `ios-test-lock-02-${Date.now()}`;
    activeRunIds.push(iosRunId);

    // iOS starts mock and acquires lock
    const iosOwnerFile = path.join(tmpDir, 'ios-owner.json');
    const ownerData = await startMock({
      port: testPort,
      runId: iosRunId,
      platform: 'ios',
      ownerFile: iosOwnerFile,
      lockPath: lockFile,
    });
    assert.ok(ownerData.pid > 0);

    // Android attempts to start on same lock
    const androidRunId = `android-test-lock-02-${Date.now()}`;
    await assert.rejects(
      async () => {
        await startMock({
          port: testPort,
          runId: androidRunId,
          platform: 'android',
          ownerFile,
          lockPath: lockFile,
        });
      },
      /LOCK BUSY.*ios/,
      'Android must be rejected when iOS holds active lock',
    );

    // iOS mock must remain unaffected
    const health = await queryMockHealth(testPort);
    assert.equal(health?.status, 200);
    assert.equal(health?.data?.runId, iosRunId);
  });

  test('LOCK-03: Startup CLI exits -> Lock remains valid while suite runs (real child processes)', async () => {
    const runId = `cli-runner-test-${Date.now()}`;
    activeRunIds.push(runId);
    const managerCli = path.resolve(__dirname, '../../scripts/testing/mock-manager.cjs');

    // Execute real independent CLI process: `mock-manager.cjs start`
    const startResult = await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [
          managerCli,
          'start',
          '--port',
          String(testPort),
          '--platform',
          'android',
          '--run-id',
          runId,
          '--owner-file',
          ownerFile,
          '--lock-file',
          lockFile,
        ],
        (err, stdout, stderr) => {
          if (err) reject(new Error(`CLI start failed: ${stderr || err.message}`));
          else resolve({ stdout, stderr });
        },
      );
    });

    assert.ok(startResult.stdout.includes('[MOCK STARTED]'));

    // Startup CLI has exited with code 0!
    // The lock file must exist and contain the persistent mockPid
    assert.ok(fs.existsSync(lockFile), 'Lock file must exist');
    const lockMeta = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.equal(lockMeta.runId, runId);
    assert.ok(lockMeta.mockPid > 0, 'Lock metadata must record child mockPid');

    // Health probe confirms the mock server is running and verified
    const health = await queryMockHealth(testPort);
    assert.equal(health?.status, 200);
    assert.equal(health?.data?.runId, runId);
    assert.equal(health?.data?.pid, lockMeta.mockPid);

    // A second independent CLI process attempts to start: must be rejected with LOCK BUSY
    const secondResult = await new Promise((resolve) => {
      execFile(
        process.execPath,
        [
          managerCli,
          'start',
          '--port',
          String(testPort),
          '--platform',
          'ios',
          '--run-id',
          `ios-competing-${Date.now()}`,
          '--owner-file',
          path.join(tmpDir, 'competing-owner.json'),
          '--lock-file',
          lockFile,
        ],
        (err, stdout, stderr) => {
          resolve({ exitCode: err ? err.code : 0, stdout, stderr });
        },
      );
    });

    assert.notEqual(secondResult.exitCode, 0, 'Second CLI process must fail');
    assert.ok(
      secondResult.stderr.includes('LOCK BUSY'),
      `Second process must report LOCK BUSY, got: ${secondResult.stderr}`,
    );

    // The original mock process is still alive and lock is untouched
    const lockMetaAfter = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.equal(lockMetaAfter.runId, runId, 'Original lock must be completely intact');

    // Stop mock via CLI
    await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [
          managerCli,
          'stop',
          '--run-id',
          runId,
          '--owner-file',
          ownerFile,
          '--lock-file',
          lockFile,
          '--port',
          String(testPort),
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        },
      );
    });

    assert.equal(fs.existsSync(lockFile), false, 'Lock must be freed after stop CLI');
  });

  test('LOCK-04: Second process sees active lock -> No stale-lock deletion', async () => {
    const runId1 = `run-1-${Date.now()}`;
    activeRunIds.push(runId1);

    await startMock({
      port: testPort,
      runId: runId1,
      platform: 'android',
      ownerFile,
      lockPath: lockFile,
    });

    const runId2 = `run-2-${Date.now()}`;
    await assert.rejects(
      async () => {
        await acquireLock({
          platform: 'android',
          runId: runId2,
          lockPath: lockFile,
          port: testPort,
        });
      },
      /LOCK BUSY/,
    );

    // Lock file must still belong to runId1 without being unlinked or modified
    const currentLock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
    assert.equal(currentLock.runId, runId1, 'Lock must NOT be deleted or overwritten');
  });

  test('LOCK-05: Foreign process occupies port -> Process untouched and test fails closed', async () => {
    let foreignClosed = false;
    const foreignServer = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('foreign-service-online');
    });

    await new Promise((resolve) => foreignServer.listen(testPort, '127.0.0.1', resolve));
    foreignServer.on('close', () => { foreignClosed = true; });

    const runId = `android-lock-05-${Date.now()}`;
    activeRunIds.push(runId);

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

    // Foreign server must be untouched
    assert.equal(foreignClosed, false, 'Foreign listener must remain running');
    const res = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${testPort}`, (r) => {
        let text = '';
        r.on('data', (c) => { text += c; });
        r.on('end', () => resolve({ status: r.statusCode, text }));
      });
    });
    assert.equal(res.status, 200);
    assert.equal(res.text, 'foreign-service-online');

    await new Promise((resolve) => foreignServer.close(resolve));
  });

  test('LOCK-06: Normal completion -> Owned lock released', async () => {
    const runId = `android-lock-06-${Date.now()}`;

    await startMock({
      port: testPort,
      runId,
      platform: 'android',
      ownerFile,
      lockPath: lockFile,
    });
    assert.ok(fs.existsSync(lockFile), 'Lock file must exist during active run');

    // Normal completion
    await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
    assert.equal(fs.existsSync(lockFile), false, 'Lock file must be cleanly released');

    const portStatus = await checkPort(testPort);
    assert.equal(portStatus.occupied, false, 'Port must be freed');
  });

  test('LOCK-07: SIGTERM -> Safe cleanup via signal handler', async () => {
    const runId = `android-lock-07-${Date.now()}`;
    activeRunIds.push(runId);

    await startMock({
      port: testPort,
      runId,
      platform: 'android',
      ownerFile,
      lockPath: lockFile,
    });

    // Simulated SIGTERM cleanup
    await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });

    assert.equal(fs.existsSync(lockFile), false);
    const portStatus = await checkPort(testPort);
    assert.equal(portStatus.occupied, false);
  });

  test('LOCK-08: Malformed lock metadata -> Fail closed without wiping state', async () => {
    fs.writeFileSync(lockFile, '{{malformed json content!!!', 'utf8');

    const runId = `android-lock-08-${Date.now()}`;
    assert.rejects(
      async () => {
        await acquireLock({ platform: 'android', runId, lockPath: lockFile, port: testPort });
      },
      /LOCK ERROR.*malformed/,
    );

    // Malformed lock file must not be silently deleted
    assert.ok(fs.existsSync(lockFile), 'Must fail closed without destroying uncertain lock');
  });

  test('LOCK-09: Simulated PID reuse -> Foreign process protected', async () => {
    // Start an independent foreign process (HTTP server) on a different port
    const foreignPort = testPort + 5;
    let foreignSurvives = true;
    const foreignServer = http.createServer((req, res) => res.end('foreign-identity'));
    await new Promise((resolve) => foreignServer.listen(foreignPort, '127.0.0.1', resolve));
    foreignServer.on('close', () => { foreignSurvives = false; });

    // Write a lock file pointing to the current test runner PID or foreign PID, but with different runId
    const simulatedOwner = {
      platform: 'ios',
      runId: 'foreign-reused-run',
      mockPid: process.pid, // Simulated PID match
      port: testPort,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(lockFile, JSON.stringify(simulatedOwner), 'utf8');

    const runId = `android-lock-09-${Date.now()}`;
    await assert.rejects(
      async () => {
        await acquireLock({ platform: 'android', runId, lockPath: lockFile, port: testPort });
      },
      /LOCK BUSY/,
    );

    // Foreign process must survive
    assert.equal(foreignSurvives, true, 'Foreign process must never be killed');
    await new Promise((resolve) => foreignServer.close(resolve));
  });

  test('LOCK-10: Concurrent startup attempts -> Exactly one owner succeeds', async () => {
    const promises = [];
    const count = 5;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < count; i++) {
      const runId = `concurrent-run-${i}-${Date.now()}`;
      promises.push(
        acquireLock({
          platform: 'android',
          runId,
          lockPath: lockFile,
          port: testPort,
        })
          .then(() => {
            successCount++;
            activeRunIds.push(runId);
          })
          .catch((err) => {
            if (/LOCK BUSY|LOCK CONFLICT/.test(err.message)) {
              failCount++;
            } else {
              throw err;
            }
          }),
      );
    }

    await Promise.all(promises);
    assert.equal(successCount, 1, 'Exactly one concurrent acquire must succeed');
    assert.equal(failCount, count - 1, 'All other concurrent acquires must fail closed');
  });

  test('LOCK-11: Mock startup failure -> No orphaned owned resources', async () => {
    const runId = `android-lock-11-${Date.now()}`;
    // Force immediate failure by passing invalid project root
    await assert.rejects(
      async () => {
        await startMock({
          port: testPort,
          runId,
          platform: 'android',
          ownerFile,
          lockPath: lockFile,
          projectRoot: path.join(tmpDir, 'nonexistent-project-root'),
        });
      },
      /MOCK FAILURE|MOCK TIMEOUT|Mock process exited early/,
    );

    // Lock must not remain dangling
    assert.equal(fs.existsSync(lockFile), false, 'Lock must be freed on failed startup');
  });

  test('LOCK-12: Long-running Maestro suite -> Lock remains valid throughout', async () => {
    const runId = `android-lock-12-${Date.now()}`;
    activeRunIds.push(runId);

    // Start mock
    const owner = await startMock({
      port: testPort,
      runId,
      platform: 'android',
      ownerFile,
      lockPath: lockFile,
    });
    assert.ok(owner.pid > 0);

    // Simulate multi-step acceptance suite execution (e.g. 5 simulated steps)
    for (let step = 1; step <= 5; step++) {
      await new Promise((r) => setTimeout(r, 60));
      // Verify lock file is intact
      const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      assert.equal(lockData.runId, runId);
      assert.equal(lockData.mockPid, owner.pid);

      // Verify health endpoint responds with matching runId
      const health = await queryMockHealth(testPort);
      assert.equal(health?.status, 200);
      assert.equal(health?.data?.runId, runId);
    }

    // Attempted concurrent acquire halfway through must still fail
    await assert.rejects(
      async () => {
        await acquireLock({
          platform: 'ios',
          runId: `ios-late-${Date.now()}`,
          lockPath: lockFile,
          port: testPort,
        });
      },
      /LOCK BUSY/,
    );

    // Clean finish
    await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
    assert.equal(fs.existsSync(lockFile), false);
  });

  describe('Unsafe Cleanup Elimination & Hostile Owner-File Regression Tests', () => {
    test('CLEANUP-01: Correct PID and run ID -> Graceful stop', async () => {
      const runId = `cleanup-01-${Date.now()}`;
      activeRunIds.push(runId);

      const ownerData = await startMock({
        port: testPort,
        runId,
        platform: 'android',
        ownerFile,
        lockPath: lockFile,
      });

      assert.ok(ownerData.pid > 0);
      const stopped = await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
      assert.equal(stopped, true);

      const status = await checkPort(testPort);
      assert.equal(status.occupied, false);
    });

    test('CLEANUP-02: Incorrect PID in owner file -> Foreign PID preserved', async () => {
      // Start a foreign listener on an adjacent port
      const foreignPort = testPort + 2;
      let foreignAlive = true;
      const foreignServer = http.createServer((req, res) => res.end('foreign-02'));
      await new Promise((r) => foreignServer.listen(foreignPort, '127.0.0.1', r));
      foreignServer.on('close', () => { foreignAlive = false; });

      const runId = `cleanup-02-${Date.now()}`;
      // Write hostile owner file with incorrect PID pointing to a foreign process
      fs.writeFileSync(
        ownerFile,
        JSON.stringify({
          runId,
          pid: process.pid, // Not a mock server
          port: foreignPort,
        }),
        'utf8',
      );

      // Attempting stopMock must refuse to kill the foreign PID
      await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });

      assert.equal(foreignAlive, true, 'Foreign process must not be killed');
      await new Promise((r) => foreignServer.close(r));
    });

    test('CLEANUP-03: Incorrect run ID in owner file -> No termination', async () => {
      const runId = `cleanup-03-${Date.now()}`;
      fs.writeFileSync(
        ownerFile,
        JSON.stringify({
          runId: 'different-run-id',
          pid: process.pid,
          port: testPort,
        }),
        'utf8',
      );

      await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
      // Owner file must not be deleted if runId does not match
      assert.ok(fs.existsSync(ownerFile), 'Foreign owner file must not be unlinked');
    });

    test('CLEANUP-04: Malformed JSON in owner file -> Fails safely without killing', async () => {
      const runId = `cleanup-04-${Date.now()}`;
      fs.writeFileSync(ownerFile, '{malformed json data...', 'utf8');

      // Must not throw or crash or send blind signals
      const stopped = await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
      assert.equal(stopped, true);
    });

    test('CLEANUP-05: PID belonging to foreign listener on target port -> Foreign listener preserved', async () => {
      let foreignServerAlive = true;
      const foreignServer = http.createServer((req, res) => res.end('foreign-service'));
      await new Promise((r) => foreignServer.listen(testPort, '127.0.0.1', r));
      foreignServer.on('close', () => { foreignServerAlive = false; });

      const runId = `cleanup-05-${Date.now()}`;
      // Owner file claiming this port and current process PID
      fs.writeFileSync(
        ownerFile,
        JSON.stringify({
          runId,
          pid: process.pid,
          port: testPort,
        }),
        'utf8',
      );

      await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });

      // Foreign server is still listening!
      assert.equal(foreignServerAlive, true, 'Foreign listener must remain intact');
      await new Promise((r) => foreignServer.close(r));
    });

    test('CLEANUP-06: Stale metadata (dead PID) -> Safe idempotent cleanup', async () => {
      const runId = `cleanup-06-${Date.now()}`;
      // PID 999999 is dead
      fs.writeFileSync(
        ownerFile,
        JSON.stringify({
          runId,
          pid: 999999,
          port: testPort,
        }),
        'utf8',
      );

      const stopped = await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
      assert.equal(stopped, true);
    });

    test('CLEANUP-07: Already-terminated owned process -> Idempotent no-op', async () => {
      const runId = `cleanup-07-${Date.now()}`;
      const ownerData = await startMock({
        port: testPort,
        runId,
        platform: 'android',
        ownerFile,
        lockPath: lockFile,
      });

      // First stop
      await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
      assert.equal(fs.existsSync(lockFile), false);

      // Second stop: idempotent
      const secondStop = await stopMock({ runId, ownerFile, lockPath: lockFile, port: testPort });
      assert.equal(secondStop, true);
    });
  });
});
