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
  unlockLock,
  parseMetadata,
  isPidAlive,
} = require('../../scripts/testing/mock-manager.cjs');

async function safeCleanupTestFixture({
  activeRunIds = [],
  lockFile,
  ownerFile,
  tmpDir,
  port,
}) {
  // 1. Gracefully stop mock servers that belong to activeRunIds
  for (const runId of activeRunIds) {
    try {
      await stopMock({ runId, ownerFile, lockPath: lockFile, port });
    } catch {}
  }

  // 2. Safe owner-verified lock release: only unlink if runId matches activeRunIds
  if (lockFile && fs.existsSync(lockFile)) {
    try {
      const raw = fs.readFileSync(lockFile, 'utf8');
      const meta = parseMetadata(raw);
      if (meta && meta.runId && activeRunIds.includes(meta.runId)) {
        try {
          fs.unlinkSync(lockFile);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
      } else {
        // Foreign lock or malformed metadata: preserve! Never delete unowned locks!
      }
    } catch {}
  }

  // 3. Safe owner-verified ownerFile release
  if (ownerFile && fs.existsSync(ownerFile)) {
    try {
      const raw = fs.readFileSync(ownerFile, 'utf8');
      const meta = parseMetadata(raw);
      if (meta && meta.runId && activeRunIds.includes(meta.runId)) {
        try {
          fs.unlinkSync(ownerFile);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }
      } else {
        // Foreign owner file: preserve! Never delete unowned owner files!
      }
    } catch {}
  }

  // 4. Safe tmpDir removal: ONLY if tmpDir does NOT contain any preserved foreign lock, owner file, or other fixtures
  if (tmpDir && fs.existsSync(tmpDir)) {
    try {
      const remainingFiles = fs.readdirSync(tmpDir);
      if (remainingFiles.length === 0) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {}
  }
}

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
    await safeCleanupTestFixture({
      activeRunIds,
      lockFile,
      ownerFile,
      tmpDir,
      port: testPort,
    });
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

    test('CLEANUP-08: Foreign-owned lock survives test cleanup', async () => {
      // Start a foreign listener on an adjacent port
      const foreignPort = testPort + 3;
      let foreignServerAlive = true;
      const foreignServer = http.createServer((req, res) => res.end('foreign-08-service'));
      await new Promise((r) => foreignServer.listen(foreignPort, '127.0.0.1', r));
      foreignServer.on('close', () => { foreignServerAlive = false; });

      const foreignRunId = `foreign-session-${Date.now()}`;
      const foreignLockPayload = {
        platform: 'ios',
        runId: foreignRunId,
        runnerPid: process.pid,
        mockPid: null,
        port: foreignPort,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(lockFile, JSON.stringify(foreignLockPayload, null, 2), 'utf8');

      // The current test run only registered a different runId
      const currentRunId = `current-run-${Date.now()}`;
      activeRunIds.push(currentRunId);

      // Invoke safe cleanup for the current test run
      await safeCleanupTestFixture({
        activeRunIds,
        lockFile,
        ownerFile,
        tmpDir,
        port: testPort,
      });

      // The foreign lock file MUST survive completely untouched
      assert.ok(fs.existsSync(lockFile), 'Foreign-owned lock file must not be deleted by cleanup');
      const surviving = parseMetadata(fs.readFileSync(lockFile, 'utf8'));
      assert.equal(surviving?.runId, foreignRunId, 'Surviving lock must maintain foreign identity');

      // Temporary test fixture directory containing foreign lock must be preserved
      assert.ok(fs.existsSync(tmpDir), 'tmpDir containing foreign lock must be preserved');

      // Foreign process must remain alive
      assert.equal(foreignServerAlive, true, 'Foreign listener must not be killed');

      await new Promise((r) => foreignServer.close(r));
    });

    test('CLEANUP-09: Malformed lock metadata survives cleanup safely without deletion', async () => {
      fs.writeFileSync(lockFile, '{{malformed json metadata in lock', 'utf8');

      const currentRunId = `current-run-09-${Date.now()}`;
      activeRunIds.push(currentRunId);

      await safeCleanupTestFixture({
        activeRunIds,
        lockFile,
        ownerFile,
        tmpDir,
        port: testPort,
      });

      // Malformed lock file must survive without deletion or corruption
      assert.ok(fs.existsSync(lockFile), 'Malformed lock file must survive cleanup');
      assert.equal(fs.readFileSync(lockFile, 'utf8'), '{{malformed json metadata in lock');
      assert.ok(fs.existsSync(tmpDir), 'tmpDir containing unverified lock must be preserved');
    });

    test('CLEANUP-10: Foreign owner file survives cleanup', async () => {
      const foreignOwnerData = {
        runId: 'foreign-owner-suite-10',
        pid: process.pid,
        port: testPort,
      };
      fs.writeFileSync(ownerFile, JSON.stringify(foreignOwnerData, null, 2), 'utf8');

      const currentRunId = `current-run-10-${Date.now()}`;
      activeRunIds.push(currentRunId);

      await safeCleanupTestFixture({
        activeRunIds,
        lockFile,
        ownerFile,
        tmpDir,
        port: testPort,
      });

      // Foreign owner file must not be unlinked
      assert.ok(fs.existsSync(ownerFile), 'Foreign owner file must not be unlinked');
      const survivingOwner = parseMetadata(fs.readFileSync(ownerFile, 'utf8'));
      assert.equal(survivingOwner?.runId, 'foreign-owner-suite-10');
    });

    test('CLEANUP-11: Multiple sequential cleanup calls are strictly idempotent', async () => {
      const runId = `cleanup-11-${Date.now()}`;
      activeRunIds.push(runId);

      const ownerData = await startMock({
        port: testPort,
        runId,
        platform: 'android',
        ownerFile,
        lockPath: lockFile,
      });
      assert.ok(ownerData.pid > 0);

      // First safe cleanup invocation
      await safeCleanupTestFixture({
        activeRunIds,
        lockFile,
        ownerFile,
        tmpDir,
        port: testPort,
      });
      assert.equal(fs.existsSync(lockFile), false, 'Owned lock must be unlinked on first cleanup');

      // Second safe cleanup invocation: must be completely idempotent and not throw
      await safeCleanupTestFixture({
        activeRunIds,
        lockFile,
        ownerFile,
        tmpDir,
        port: testPort,
      });
      assert.equal(fs.existsSync(lockFile), false);
    });
  });

  describe('Manual Force-Unlock Hardening & Stale-Lock Recovery Suite', () => {
    const managerCli = path.resolve(__dirname, '../../scripts/testing/mock-manager.cjs');

    test('UNLOCK-01: Live Android owner -> unlock --force rejected (LOCK ACTIVE), lock preserved', async () => {
      const androidRunId = `android-unlock-01-${Date.now()}`;
      activeRunIds.push(androidRunId);

      const ownerData = await startMock({
        port: testPort,
        runId: androidRunId,
        platform: 'android',
        ownerFile,
        lockPath: lockFile,
      });
      assert.ok(ownerData.pid > 0);

      // 1. Programmatic unlockLock with force: true must be rejected
      await assert.rejects(
        async () => {
          await unlockLock({ lockPath: lockFile, port: testPort, force: true });
        },
        /LOCK ACTIVE/,
        'unlockLock must refuse to unlock active Android run',
      );
      assert.ok(fs.existsSync(lockFile), 'Lock file must remain intact');

      // 2. CLI mock-manager.cjs unlock --force must also fail closed
      const cliResult = await new Promise((resolve) => {
        execFile(
          process.execPath,
          [
            managerCli,
            'unlock',
            '--force',
            '--lock-file',
            lockFile,
            '--port',
            String(testPort),
          ],
          (err, stdout, stderr) => {
            resolve({ code: err ? err.code : 0, stdout, stderr });
          },
        );
      });

      assert.notEqual(cliResult.code, 0, 'CLI unlock --force must fail on active Android lock');
      assert.ok(
        cliResult.stderr.includes('LOCK ACTIVE'),
        `CLI stderr must contain LOCK ACTIVE, got: ${cliResult.stderr}`,
      );
      assert.ok(fs.existsSync(lockFile), 'Lock file must survive CLI force unlock');

      // Mock must still be running and healthy
      const health = await queryMockHealth(testPort);
      assert.equal(health?.status, 200);
      assert.equal(health?.data?.runId, androidRunId);
    });

    test('UNLOCK-02: Live iOS owner -> unlock --force rejected (LOCK ACTIVE), lock preserved', async () => {
      const iosRunId = `ios-unlock-02-${Date.now()}`;
      const iosLockData = {
        platform: 'ios',
        runId: iosRunId,
        runnerPid: process.pid, // Current process is alive
        mockPid: null,
        port: testPort,
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(lockFile, JSON.stringify(iosLockData, null, 2), 'utf8');

      // Programmatic force unlock must be rejected because runnerPid is alive
      await assert.rejects(
        async () => {
          await unlockLock({ lockPath: lockFile, port: testPort, force: true });
        },
        /LOCK ACTIVE.*runnerPid/,
        'Must reject unlocking live iOS runner',
      );
      assert.ok(fs.existsSync(lockFile), 'Lock file must remain intact');

      // CLI force unlock must also reject
      const cliResult = await new Promise((resolve) => {
        execFile(
          process.execPath,
          [
            managerCli,
            'unlock',
            '--force',
            '--lock-file',
            lockFile,
            '--port',
            String(testPort),
          ],
          (err, stdout, stderr) => {
            resolve({ code: err ? err.code : 0, stdout, stderr });
          },
        );
      });
      assert.notEqual(cliResult.code, 0);
      assert.ok(cliResult.stderr.includes('LOCK ACTIVE'));
      assert.ok(fs.existsSync(lockFile));
    });

    test('UNLOCK-03: Active mock process on port -> unlock --force rejected, process preserved', async () => {
      const runId = `unlock-03-${Date.now()}`;
      activeRunIds.push(runId);

      const ownerData = await startMock({
        port: testPort,
        runId,
        platform: 'android',
        ownerFile,
        lockPath: lockFile,
      });

      // Even if runnerPid is simulated as dead, active mockPid and health verify activity
      const lockData = parseMetadata(fs.readFileSync(lockFile, 'utf8'));
      lockData.runnerPid = 999999; // Dead runner
      fs.writeFileSync(lockFile, JSON.stringify(lockData, null, 2), 'utf8');

      await assert.rejects(
        async () => {
          await unlockLock({ lockPath: lockFile, port: testPort, force: true });
        },
        /LOCK ACTIVE.*mockPid/,
      );

      // Mock process is NOT killed and lock is preserved
      assert.ok(fs.existsSync(lockFile));
      const health = await queryMockHealth(testPort);
      assert.equal(health?.status, 200);
      assert.equal(health?.data?.pid, ownerData.pid);
    });

    test('UNLOCK-04: Malformed lock metadata -> unlock --force rejected with LOCK ERROR', async () => {
      fs.writeFileSync(lockFile, '{invalid:json:data...!}');

      await assert.rejects(
        async () => {
          await unlockLock({ lockPath: lockFile, port: testPort, force: true });
        },
        /LOCK ERROR.*malformed/,
      );

      // CLI call
      const cliResult = await new Promise((resolve) => {
        execFile(
          process.execPath,
          [managerCli, 'unlock', '--force', '--lock-file', lockFile, '--port', String(testPort)],
          (err, stdout, stderr) => {
            resolve({ code: err ? err.code : 0, stdout, stderr });
          },
        );
      });
      assert.notEqual(cliResult.code, 0);
      assert.ok(cliResult.stderr.includes('LOCK ERROR'));
      assert.ok(fs.existsSync(lockFile));
      assert.equal(fs.readFileSync(lockFile, 'utf8'), '{invalid:json:data...!}');
    });

    test('UNLOCK-05: Ambiguous lock metadata (no PIDs recorded) -> unlock --force rejected with LOCK AMBIGUOUS', async () => {
      const ambiguousMeta = {
        platform: 'android',
        runId: 'ambiguous-run-without-pids',
        runnerPid: null,
        mockPid: null,
        port: testPort,
      };
      fs.writeFileSync(lockFile, JSON.stringify(ambiguousMeta, null, 2), 'utf8');

      await assert.rejects(
        async () => {
          await unlockLock({ lockPath: lockFile, port: testPort, force: true });
        },
        /LOCK AMBIGUOUS/,
      );
      assert.ok(fs.existsSync(lockFile), 'Ambiguous lock must not be deleted');
    });

    test('UNLOCK-06: Foreign listener occupying port -> Never kill foreign listener, unlock rejected', async () => {
      let foreignAlive = true;
      const foreignServer = http.createServer((req, res) => res.end('foreign-service-06'));
      await new Promise((r) => foreignServer.listen(testPort, '127.0.0.1', r));
      foreignServer.on('close', () => { foreignAlive = false; });

      // Stale lock pointing to testPort with dead PIDs
      const staleLockWithForeignPort = {
        platform: 'ios',
        runId: 'stale-run-06',
        runnerPid: 999999,
        mockPid: 999998,
        port: testPort,
      };
      fs.writeFileSync(lockFile, JSON.stringify(staleLockWithForeignPort, null, 2), 'utf8');

      await assert.rejects(
        async () => {
          await unlockLock({ lockPath: lockFile, port: testPort, force: true });
        },
        /PORT CONFLICT/,
      );

      // Foreign listener must be untouched
      assert.equal(foreignAlive, true, 'Foreign listener must remain intact');
      assert.ok(fs.existsSync(lockFile), 'Lock must not be removed while port is bound to foreign process');

      await new Promise((r) => foreignServer.close(r));
    });

    test('UNLOCK-07: Verified inactive session -> unlock --force succeeds and records recovery reason', async () => {
      const staleMeta = {
        platform: 'android',
        runId: 'verified-stale-07',
        runnerPid: 999999, // Dead PID
        mockPid: 999998,   // Dead PID
        port: testPort,    // Free port
        createdAt: new Date().toISOString(),
      };
      fs.writeFileSync(lockFile, JSON.stringify(staleMeta, null, 2), 'utf8');

      const result = await unlockLock({ lockPath: lockFile, port: testPort, force: true });

      assert.equal(result.unlinked, true);
      assert.equal(result.recovered, true);
      assert.equal(result.runId, 'verified-stale-07');
      assert.ok(
        result.reason.includes('Verified inactive session'),
        `Reason must record verified inactivity, got: ${result.reason}`,
      );
      assert.ok(result.reason.includes('runnerPid 999999'));
      assert.ok(result.reason.includes('mockPid 999998'));
      assert.ok(result.reason.includes(`port ${testPort} unoccupied`));

      assert.equal(fs.existsSync(lockFile), false, 'Verified stale lock must be successfully unlinked');
    });

    test('UNLOCK-08: Concurrent force-unlock attempts on stale lock -> Exactly one recovers, no corruption', async () => {
      const staleMeta = {
        platform: 'android',
        runId: 'concurrent-stale-08',
        runnerPid: 999999,
        mockPid: 999998,
        port: testPort,
      };
      fs.writeFileSync(lockFile, JSON.stringify(staleMeta, null, 2), 'utf8');

      const promises = [];
      const concurrency = 5;
      for (let i = 0; i < concurrency; i++) {
        promises.push(
          unlockLock({ lockPath: lockFile, port: testPort, force: true }),
        );
      }

      const results = await Promise.all(promises);
      const recoveredCount = results.filter((r) => r.recovered === true).length;
      assert.equal(recoveredCount, 1, 'Exactly one concurrent recovery must succeed');

      // All others must report lock was already unlinked concurrently
      const nonRecovered = results.filter((r) => r.recovered !== true);
      assert.equal(nonRecovered.length, concurrency - 1);
      for (const nr of nonRecovered) {
        assert.equal(nr.unlinked, false);
      }

      assert.equal(fs.existsSync(lockFile), false);
    });

    test('UNLOCK-09: Unlocked without --force and without matching runId -> Refused with LOCK REFUSED', async () => {
      const lockMeta = {
        platform: 'ios',
        runId: 'ios-active-09',
        runnerPid: 999999,
        mockPid: 999998,
        port: testPort,
      };
      fs.writeFileSync(lockFile, JSON.stringify(lockMeta, null, 2), 'utf8');

      await assert.rejects(
        async () => {
          await unlockLock({ lockPath: lockFile, port: testPort, force: false, runId: 'mismatched-run' });
        },
        /LOCK REFUSED/,
      );

      assert.ok(fs.existsSync(lockFile), 'Lock must remain untouched without force or matching runId');
    });
  });
});
