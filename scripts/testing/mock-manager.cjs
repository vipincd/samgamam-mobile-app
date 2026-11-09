// Safe mock-server process ownership and cross-platform acceptance test runner lock.
// Strictly prevents accidental or unowned process termination.
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn, execSync } = require('node:child_process');

const DEFAULT_PORT = 4318;

function getDefaultLockPath() {
  if (process.env.ACCEPTANCE_LOCK_PATH) {
    return process.env.ACCEPTANCE_LOCK_PATH;
  }
  try {
    const gitCommonDir = execSync('git rev-parse --git-common-dir', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (gitCommonDir && fs.existsSync(gitCommonDir)) {
      return path.join(gitCommonDir, 'samgamam-acceptance-4318.lock');
    }
  } catch {}
  return '/tmp/samgamam-acceptance-4318.lock';
}

const DEFAULT_LOCK_PATH = getDefaultLockPath();

function parseMetadata(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number' || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function checkPort(port = DEFAULT_PORT) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(800);

    socket.once('connect', () => {
      socket.destroy();
      resolve({ occupied: true });
    });

    socket.once('timeout', () => {
      socket.destroy();
      resolve({ occupied: true });
    });

    socket.once('error', (err) => {
      socket.destroy();
      if (err.code === 'ECONNREFUSED') {
        resolve({ occupied: false });
      } else {
        // Any other error indicates port may be in use / bound
        resolve({ occupied: true, error: err.code });
      }
    });

    socket.connect(port, '127.0.0.1');
  });
}

async function queryMockHealth(port = DEFAULT_PORT) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/__mock/health`, { timeout: 1500 }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, raw });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });

    req.on('error', () => {
      resolve(null);
    });
  });
}

async function acquireLock({
  platform = 'android',
  runId,
  lockPath = getDefaultLockPath(),
  runnerPid,
  port = DEFAULT_PORT,
  allowStaleReclaim = false,
}) {
  if (!runId) throw new Error('runId is required to acquire acceptance lock');

  if (fs.existsSync(lockPath)) {
    const content = fs.readFileSync(lockPath, 'utf8');
    const existing = parseMetadata(content);

    if (!existing || typeof existing !== 'object' || !existing.runId) {
      // AND-ISO-09 / LOCK-08: Stale or malformed ownership metadata -> Fail safely
      throw new Error(
        `[LOCK ERROR] Lock at ${lockPath} contains malformed or unreadable metadata. Refusing to guess or overwrite foreign state. Exiting fail-closed.`,
      );
    }

    if (existing.runId === runId) {
      // Already owned by this exact session
      return { acquired: true, lockPath, runId, existing: true };
    }

    // Inspect whether existing lock owner is actively running
    const activeMockPid = existing.mockPid || existing.pid;
    const mockAlive = activeMockPid ? isPidAlive(activeMockPid) : false;
    const runnerAlive = existing.runnerPid ? isPidAlive(existing.runnerPid) : false;

    // Verify through HTTP health probe
    const health = await queryMockHealth(existing.port || port);
    const mockVerified =
      health?.status === 200 &&
      health?.data?.service === 'samgamam-acceptance-mock' &&
      health?.data?.runId === existing.runId;

    if (mockAlive || runnerAlive || mockVerified) {
      throw new Error(
        `[LOCK BUSY] Acceptance suite lock is currently held by ${existing.platform || 'foreign'} session (PID: ${activeMockPid || existing.runnerPid || 'unknown'}, runId: ${existing.runId}, started: ${existing.startedAt || existing.createdAt}). Refusing to terminate or interfere with foreign run. Exiting fail-closed.`,
      );
    }

    // Both runner and mock are not alive and health probe failed
    if (allowStaleReclaim) {
      console.warn(`[LOCK] Reclaiming verified stale lock file from inactive runId ${existing.runId}.`);
      try {
        fs.unlinkSync(lockPath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    } else {
      throw new Error(
        `[LOCK STALE] Stale acceptance lock detected at ${lockPath} from inactive session (runId: ${existing.runId}, platform: ${existing.platform || 'unknown'}, PID: ${activeMockPid || 'unknown'}). Refusing automatic deletion without explicit operator confirmation. Exiting fail-closed.`,
      );
    }
  }

  const payload = JSON.stringify({
    platform,
    runId,
    runnerPid: runnerPid || process.pid,
    mockPid: null,
    port,
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }, null, 2);

  try {
    fs.mkdirSync(path.dirname(path.resolve(lockPath)), { recursive: true });
    fs.writeFileSync(lockPath, payload, { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(
        `[LOCK CONFLICT] Concurrent race acquiring lock at ${lockPath}. Exiting fail-closed.`,
      );
    }
    throw err;
  }

  return { acquired: true, lockPath, runId };
}

function updateLockMetadata({ lockPath = getDefaultLockPath(), runId, updates }) {
  if (!fs.existsSync(lockPath)) return false;
  try {
    const existing = parseMetadata(fs.readFileSync(lockPath, 'utf8'));
    if (!existing || existing.runId !== runId) return false;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    fs.writeFileSync(lockPath, JSON.stringify(updated, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function releaseLock({ runId, lockPath = getDefaultLockPath() }) {
  if (!fs.existsSync(lockPath)) return true;

  const content = fs.readFileSync(lockPath, 'utf8');
  const existing = parseMetadata(content);

  if (existing && existing.runId === runId) {
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return true;
      throw err;
    }
  }

  // Does not belong to this run: do NOT delete!
  console.warn(
    `[LOCK WARNING] Refusing to release lock held by different session (${existing?.runId || 'unknown'}). Foreign lock preserved.`,
  );
  return false;
}

async function startMock({
  port = DEFAULT_PORT,
  runId,
  platform = 'android',
  ownerFile,
  lockPath = getDefaultLockPath(),
  runnerPid,
  allowStaleReclaim = false,
  projectRoot = path.join(__dirname, '../..'),
}) {
  if (!runId) throw new Error('runId is required to start mock server');

  // 1. Acquire cross-platform lock
  await acquireLock({
    platform,
    runId,
    lockPath,
    runnerPid: runnerPid || process.ppid || process.pid,
    port,
    allowStaleReclaim,
  });

  // 2. Check if port is already occupied
  const portStatus = await checkPort(port);
  if (portStatus.occupied) {
    // Release the lock we just acquired so we don't leave a dangling lock
    releaseLock({ runId, lockPath });

    const health = await queryMockHealth(port);
    let foreignDesc = 'unidentified listener';
    if (health?.data?.service === 'samgamam-acceptance-mock') {
      foreignDesc = `foreign mock (runId: ${health.data.runId || 'unknown'}, PID: ${health.data.pid || 'unknown'})`;
    }

    throw new Error(
      `[PORT CONFLICT] Port ${port} is occupied by ${foreignDesc}. Refusing to kill foreign process. Exiting fail-closed.`,
    );
  }

  // 3. Spawn mock server process with explicit runId and detached stdio
  const logDir = path.join(projectRoot, 'artifacts');
  fs.mkdirSync(logDir, { recursive: true });
  const logFd = fs.openSync(path.join(logDir, 'mock.log'), 'a');

  const scriptPath = path.join(projectRoot, 'scripts/testing/mock-api.cjs');
  const child = spawn(process.execPath, [scriptPath], {
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      MOCK_PORT: String(port),
      MOCK_RUN_ID: runId,
    },
  });

  child.unref();

  let hasExited = false;
  let exitCode = null;
  child.on('exit', (code) => {
    hasExited = true;
    exitCode = code;
  });

  // Update lock with the persistent mock process PID
  updateLockMetadata({
    lockPath,
    runId,
    updates: { mockPid: child.pid, pid: child.pid },
  });

  // 4. Poll health endpoint and verify exact ownership
  const maxAttempts = 60;
  let verified = false;
  let healthResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (hasExited) {
      releaseLock({ runId, lockPath });
      throw new Error(`[MOCK FAILURE] Mock process exited early with code ${exitCode}.`);
    }

    healthResult = await queryMockHealth(port);
    if (
      healthResult?.status === 200 &&
      healthResult.data?.service === 'samgamam-acceptance-mock' &&
      healthResult.data?.runId === runId &&
      healthResult.data?.pid === child.pid
    ) {
      verified = true;
      break;
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  if (!verified) {
    // If not verified, safely terminate ONLY child.pid that we spawned
    try {
      process.kill(child.pid, 'SIGTERM');
    } catch {}
    releaseLock({ runId, lockPath });
    throw new Error(
      `[MOCK TIMEOUT] Mock server failed ownership verification on port ${port} within timeout.`,
    );
  }

  // 5. Record verified process metadata
  const ownerData = {
    runId,
    pid: child.pid,
    port,
    platform,
    runnerPid: runnerPid || process.ppid || process.pid,
    startedAt: new Date().toISOString(),
  };

  if (ownerFile) {
    fs.mkdirSync(path.dirname(path.resolve(ownerFile)), { recursive: true });
    fs.writeFileSync(ownerFile, JSON.stringify(ownerData, null, 2), 'utf8');
  }

  console.log(
    `[MOCK STARTED] Verified mock listening on 127.0.0.1:${port} (PID: ${child.pid}, runId: ${runId})`,
  );
  return ownerData;
}

async function stopMock({
  runId,
  ownerFile,
  lockPath = getDefaultLockPath(),
  port = DEFAULT_PORT,
}) {
  if (!runId) throw new Error('runId is required to stop mock server');

  let targetPid = null;
  let targetPort = port;

  if (ownerFile && fs.existsSync(ownerFile)) {
    const raw = fs.readFileSync(ownerFile, 'utf8');
    const ownerData = parseMetadata(raw);
    if (!ownerData || typeof ownerData !== 'object') {
      console.warn(
        `[MOCK SAFETY] Owner file contains invalid/malformed JSON. Refusing to terminate unverified process.`,
      );
    } else if (ownerData.runId === runId) {
      targetPid = ownerData.pid;
      targetPort = ownerData.port || port;
    } else {
      console.warn(
        `[MOCK WARNING] Owner file runId (${ownerData?.runId}) does not match current runId (${runId}). Refusing to kill foreign PID.`,
      );
    }
  }

  if (!targetPid && lockPath && fs.existsSync(lockPath)) {
    const lockData = parseMetadata(fs.readFileSync(lockPath, 'utf8'));
    if (lockData && lockData.runId === runId) {
      targetPid = lockData.mockPid || lockData.pid;
      targetPort = lockData.port || port;
    }
  }

  if (targetPid && isPidAlive(targetPid)) {
    // Verify that the listener on targetPort is actually the owned mock
    const health = await queryMockHealth(targetPort);
    if (
      health?.status === 200 &&
      health?.data?.service === 'samgamam-acceptance-mock' &&
      health?.data?.runId === runId &&
      health?.data?.pid === targetPid
    ) {
      console.log(`[MOCK CLEANUP] Gracefully stopping owned mock PID ${targetPid}...`);
      try {
        process.kill(targetPid, 'SIGTERM');
        // Wait up to 3 seconds for graceful shutdown
        for (let i = 0; i < 30; i++) {
          if (!isPidAlive(targetPid)) break;
          await new Promise((r) => setTimeout(r, 100));
        }
        if (isPidAlive(targetPid)) {
          console.warn(`[MOCK CLEANUP] PID ${targetPid} did not exit on SIGTERM; sending SIGKILL.`);
          process.kill(targetPid, 'SIGKILL');
        }
      } catch (err) {
        if (err.code !== 'ESRCH') console.error(`[MOCK CLEANUP ERROR]`, err);
      }
    } else {
      console.warn(
        `[MOCK SAFETY] PID ${targetPid} no longer matches active mock identity on port ${targetPort} for runId ${runId}. Foreign process left untouched.`,
      );
    }
  }

  if (ownerFile && fs.existsSync(ownerFile)) {
    try {
      const ownerData = parseMetadata(fs.readFileSync(ownerFile, 'utf8'));
      if (ownerData?.runId === runId) {
        fs.unlinkSync(ownerFile);
      }
    } catch {}
  }

  releaseLock({ runId, lockPath });
  console.log(`[MOCK STOPPED] Owned resources released for runId ${runId}.`);
  return true;
}

// Supervisor mode: wraps full suite execution under long-lived lock and owned mock
async function execSuite({
  command,
  args = [],
  runId,
  platform = 'android',
  port = DEFAULT_PORT,
  ownerFile,
  lockPath = getDefaultLockPath(),
}) {
  if (!command) throw new Error('Command is required for execSuite');
  const activeRunId = runId || `${platform}-${Date.now()}-${process.pid}`;

  let cleanedUp = false;
  const doCleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    await stopMock({ runId: activeRunId, ownerFile, lockPath, port });
  };

  const handleSignal = async (sig) => {
    console.log(`[SUPERVISOR] Caught signal ${sig}, cleaning up...`);
    await doCleanup();
    process.exit(1);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  try {
    await startMock({
      port,
      runId: activeRunId,
      platform,
      ownerFile,
      lockPath,
      runnerPid: process.pid,
    });

    const child = spawn(command, args, {
      stdio: 'inherit',
      env: {
        ...process.env,
        MOCK_PORT: String(port),
        MOCK_RUN_ID: activeRunId,
        ACCEPTANCE_LOCK_PATH: lockPath,
      },
    });

    return new Promise((resolve) => {
      child.on('close', async (code) => {
        await doCleanup();
        resolve(code ?? 0);
      });
      child.on('error', async (err) => {
        console.error(`[SUPERVISOR] Failed to execute suite command:`, err);
        await doCleanup();
        resolve(1);
      });
    });
  } catch (err) {
    await doCleanup();
    throw err;
  }
}

module.exports = {
  acquireLock,
  releaseLock,
  updateLockMetadata,
  checkPort,
  queryMockHealth,
  startMock,
  stopMock,
  execSuite,
  getDefaultLockPath,
  DEFAULT_PORT,
  DEFAULT_LOCK_PATH,
};

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  function getArg(name) {
    const idx = args.indexOf(name);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  }

  const port = Number(getArg('--port') || process.env.MOCK_PORT || DEFAULT_PORT);
  const runId = getArg('--run-id') || process.env.MOCK_RUN_ID;
  const platform = getArg('--platform') || 'android';
  const ownerFile = getArg('--owner-file');
  const runnerPid = getArg('--runner-pid') ? Number(getArg('--runner-pid')) : undefined;
  const lockFile = getArg('--lock-file') || process.env.ACCEPTANCE_LOCK_PATH || getDefaultLockPath();
  const allowStaleReclaim = args.includes('--force-stale') || args.includes('--allow-stale');

  (async () => {
    try {
      if (command === 'start') {
        if (!runId) {
          console.error('Error: --run-id is required for start');
          process.exit(1);
        }
        await startMock({
          port,
          runId,
          platform,
          ownerFile,
          lockPath: lockFile,
          runnerPid,
          allowStaleReclaim,
        });
        process.exit(0);
      } else if (command === 'stop') {
        if (!runId) {
          console.error('Error: --run-id is required for stop');
          process.exit(1);
        }
        await stopMock({ runId, ownerFile, lockPath: lockFile, port });
        process.exit(0);
      } else if (command === 'exec') {
        const cmdIdx = args.indexOf('--');
        if (cmdIdx === -1 || cmdIdx + 1 >= args.length) {
          console.error('Error: exec requires "-- <command> [args...]"');
          process.exit(1);
        }
        const execCmd = args[cmdIdx + 1];
        const execArgs = args.slice(cmdIdx + 2);
        const code = await execSuite({
          command: execCmd,
          args: execArgs,
          runId,
          platform,
          port,
          ownerFile,
          lockPath: lockFile,
        });
        process.exit(code);
      } else if (command === 'check') {
        const portStatus = await checkPort(port);
        console.log(JSON.stringify(portStatus));
      } else if (command === 'unlock') {
        if (!fs.existsSync(lockFile)) {
          console.log(`Lock ${lockFile} does not exist.`);
          process.exit(0);
        }
        const existing = parseMetadata(fs.readFileSync(lockFile, 'utf8'));
        if (args.includes('--force') || (runId && existing?.runId === runId)) {
          fs.unlinkSync(lockFile);
          console.log(`Lock ${lockFile} unlinked.`);
          process.exit(0);
        } else {
          console.error(`Refusing to remove active lock without --force. Owner: ${JSON.stringify(existing)}`);
          process.exit(1);
        }
      } else {
        console.error(`Unknown command: ${command}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  })();
}
