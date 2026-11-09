// Safe mock-server process ownership and cross-platform acceptance test runner lock.
// Strictly prevents accidental or unowned process termination.
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_PORT = 4318;
const DEFAULT_LOCK_PATH = process.env.ACCEPTANCE_LOCK_PATH || '/tmp/samgamam-acceptance.lock';

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
  } catch (err) {
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

function acquireLock({ platform = 'android', runId, lockPath = DEFAULT_LOCK_PATH }) {
  if (!runId) throw new Error('runId is required to acquire acceptance lock');

  if (fs.existsSync(lockPath)) {
    const content = fs.readFileSync(lockPath, 'utf8');
    const existing = parseMetadata(content);

    if (!existing || typeof existing !== 'object' || !existing.runId) {
      // AND-ISO-09: Stale or malformed ownership metadata -> Fail safely
      throw new Error(
        `[LOCK ERROR] Lock at ${lockPath} contains malformed or unreadable metadata. Refusing to guess or overwrite foreign state. Exiting fail-closed.`,
      );
    }

    if (existing.pid && isPidAlive(existing.pid)) {
      throw new Error(
        `[LOCK BUSY] Acceptance suite lock is currently held by ${existing.platform || 'foreign'} session (PID: ${existing.pid}, runId: ${existing.runId}, started: ${existing.startedAt}). Refusing to terminate or interfere with foreign run. Exiting fail-closed.`,
      );
    }

    // Process is dead: stale lock. Remove safely.
    console.warn(`[LOCK] Clearing stale lock file from exited PID ${existing.pid} (runId: ${existing.runId}).`);
    try {
      fs.unlinkSync(lockPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  const payload = JSON.stringify({
    platform,
    runId,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  });

  try {
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

function releaseLock({ runId, lockPath = DEFAULT_LOCK_PATH }) {
  if (!fs.existsSync(lockPath)) return false;

  const content = fs.readFileSync(lockPath, 'utf8');
  const existing = parseMetadata(content);

  if (existing && existing.runId === runId) {
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') return false;
      throw err;
    }
  }

  // Does not belong to this run: do NOT delete!
  console.warn(
    `[LOCK WARNING] Refusing to release lock held by different session (${existing?.runId || 'unknown'}).`,
  );
  return false;
}

async function startMock({
  port = DEFAULT_PORT,
  runId,
  platform = 'android',
  ownerFile,
  lockPath = DEFAULT_LOCK_PATH,
  projectRoot = path.join(__dirname, '../..'),
}) {
  if (!runId) throw new Error('runId is required to start mock server');

  // 1. Acquire cross-platform lock
  acquireLock({ platform, runId, lockPath });

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
  lockPath = DEFAULT_LOCK_PATH,
  port = DEFAULT_PORT,
}) {
  let targetPid = null;
  let targetPort = port;

  if (ownerFile && fs.existsSync(ownerFile)) {
    const ownerData = parseMetadata(fs.readFileSync(ownerFile, 'utf8'));
    if (ownerData && ownerData.runId === runId) {
      targetPid = ownerData.pid;
      targetPort = ownerData.port || port;
    } else {
      console.warn(
        `[MOCK WARNING] Owner file runId (${ownerData?.runId}) does not match current runId (${runId}). Refusing to kill foreign PID.`,
      );
    }
  }

  if (targetPid && isPidAlive(targetPid)) {
    // Verify that the listener on targetPort is actually the owned mock
    const health = await queryMockHealth(targetPort);
    if (
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
        `[MOCK SAFETY] PID ${targetPid} no longer matches active mock identity on port ${targetPort}. Foreign process left untouched.`,
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

module.exports = {
  acquireLock,
  releaseLock,
  checkPort,
  queryMockHealth,
  startMock,
  stopMock,
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
  const lockFile = getArg('--lock-file') || process.env.ACCEPTANCE_LOCK_PATH || DEFAULT_LOCK_PATH;

  (async () => {
    try {
      if (command === 'start') {
        if (!runId) {
          console.error('Error: --run-id is required for start');
          process.exit(1);
        }
        await startMock({ port, runId, platform, ownerFile, lockPath: lockFile });
        process.exit(0);
      } else if (command === 'stop') {
        if (!runId) {
          console.error('Error: --run-id is required for stop');
          process.exit(1);
        }
        await stopMock({ runId, ownerFile, lockPath: lockFile, port });
        process.exit(0);
      } else if (command === 'check') {
        const portStatus = await checkPort(port);
        console.log(JSON.stringify(portStatus));
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

