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

// Unique sibling path used for atomic writes. Only the creating call ever
// removes it, so concurrent runners never delete each other's temp files.
function uniqueSibling(lockPath, suffix) {
  const token = `${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 10)}`;
  return `${lockPath}.${token}.${suffix}`;
}

// Create the lock with its complete JSON payload in a single atomic step.
// writeFileSync(..., { flag: 'wx' }) creates an empty file first, so a
// concurrent reader could observe partial JSON and misreport an active lock as
// malformed. link(2) publishes the fully-written temp file or fails EEXIST.
function createLockAtomically(lockPath, payload) {
  fs.mkdirSync(path.dirname(path.resolve(lockPath)), { recursive: true });
  const tmp = uniqueSibling(lockPath, 'tmp');
  fs.writeFileSync(tmp, payload, { flag: 'wx' });
  try {
    fs.linkSync(tmp, lockPath);
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
}

// Replace lock content atomically (rename is atomic on the same filesystem).
function replaceLockAtomically(lockPath, payload) {
  const tmp = uniqueSibling(lockPath, 'tmp');
  fs.writeFileSync(tmp, payload, { flag: 'wx' });
  try {
    fs.renameSync(tmp, lockPath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
}

const RECOVERY_GUARD_WAIT_MS = 3000;

// Serialises every non-owner (stale-recovery) deletion of the lock. Without it,
// two recoverers can interleave: B unlinks stale lock X, a new runner C
// acquires Y, and A (which verified X earlier) unlinks Y. Inside the guard the
// lock is re-read and verified, so the compare-and-delete cannot cross another
// recoverer. mkdir(2) is atomic; the guard records its holder for diagnosis.
async function withRecoveryGuard(lockPath, fn) {
  const guardDir = `${lockPath}.recovery`;
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const deadline = Date.now() + RECOVERY_GUARD_WAIT_MS;
  for (;;) {
    try {
      fs.mkdirSync(guardDir);
      fs.writeFileSync(
        path.join(guardDir, 'holder.json'),
        JSON.stringify({ pid: process.pid, token, startedAt: new Date().toISOString() }),
      );
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      if (Date.now() >= deadline) {
        let holder = null;
        try { holder = parseMetadata(fs.readFileSync(path.join(guardDir, 'holder.json'), 'utf8')); } catch {}
        const alive = holder?.pid ? isPidAlive(holder.pid) : false;
        throw new Error(
          `[LOCK RECOVERY BUSY] Another stale-lock recovery holds ${guardDir} (holder pid: ${holder?.pid || 'unknown'}, alive: ${alive}, since: ${holder?.startedAt || 'unknown'}). ` +
            (alive
              ? 'Retry after it finishes.'
              : 'Holder is not alive; after confirming no recovery is running, an operator may remove that directory manually.'),
        );
      }
      await new Promise((r) => setTimeout(r, 25 + Math.floor(Math.random() * 50)));
    }
  }
  try {
    return await fn();
  } finally {
    // Release only the guard this call created.
    try {
      const holder = parseMetadata(fs.readFileSync(path.join(guardDir, 'holder.json'), 'utf8'));
      if (holder?.token === token) fs.rmSync(guardDir, { recursive: true, force: true });
    } catch {}
  }
}

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
    if (err.code === 'EPERM') {
      return true;
    }
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
      await unlockLock({
        lockPath,
        port: existing.port || port,
        force: true,
      });
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
    createLockAtomically(lockPath, payload);
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
    replaceLockAtomically(lockPath, JSON.stringify(updated, null, 2));
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

async function unlockLock({
  lockPath = getDefaultLockPath(),
  port = DEFAULT_PORT,
  runId,
  force = false,
}) {
  if (!fs.existsSync(lockPath)) {
    return { unlinked: false, exists: false, message: `Lock ${lockPath} does not exist.` };
  }

  let content;
  try {
    content = fs.readFileSync(lockPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { unlinked: false, exists: false, message: `Lock ${lockPath} does not exist.` };
    }
    throw err;
  }

  const existing = parseMetadata(content);
  if (!existing || typeof existing !== 'object' || !existing.runId) {
    throw new Error(
      `[LOCK ERROR] Lock at ${lockPath} contains malformed or unreadable metadata. Refusing to remove ambiguous lock without safe verification. Exiting fail-closed.`,
    );
  }

  // 1. Owned release: caller explicitly owns this runId
  if (runId && existing.runId === runId) {
    try {
      fs.unlinkSync(lockPath);
      return { unlinked: true, owned: true, runId };
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { unlinked: false, exists: false, message: `Lock ${lockPath} already removed.` };
      }
      throw err;
    }
  }

  // 2. Caller provided runId that does NOT match, and force was not specified
  if (runId && existing.runId !== runId && !force) {
    throw new Error(
      `[LOCK REFUSED] Lock at ${lockPath} is held by session ${existing.runId} (platform: ${existing.platform || 'unknown'}), not matching requested runId ${runId}. Refusing to remove foreign lock.`,
    );
  }

  // 3. Neither force nor matching runId was provided
  if (!force) {
    throw new Error(
      `[LOCK REFUSED] Refusing to remove lock without --force or matching --run-id. Lock owner: runId=${existing.runId}, platform=${existing.platform || 'unknown'}`,
    );
  }

  // 4. Force unlock / stale-lock recovery path. Everything from here runs inside
  // the recovery guard so verification and deletion form one serialised
  // compare-and-delete with respect to every other recoverer.
  const alreadyGone = {
    unlinked: false,
    exists: false,
    recovered: false,
    reason: 'Lock was already unlinked concurrently.',
  };

  return withRecoveryGuard(lockPath, async () => {
    let current;
    try {
      current = parseMetadata(fs.readFileSync(lockPath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return alreadyGone;
      throw err;
    }
    if (!current || typeof current !== 'object' || !current.runId) {
      throw new Error(
        `[LOCK ERROR] Lock at ${lockPath} contains malformed or unreadable metadata. Refusing to remove ambiguous lock without safe verification. Exiting fail-closed.`,
      );
    }
    if (current.runId !== existing.runId) {
      throw new Error(
        `[LOCK CONFLICT] Lock at ${lockPath} changed concurrently during recovery verification (now held by runId: ${current.runId}). Aborting recovery.`,
      );
    }

    const targetPort = current.port || port || DEFAULT_PORT;
    const runnerPid = current.runnerPid;
    const activeMockPid = current.mockPid || current.pid;

    // A. Check runner liveness
    if (runnerPid && isPidAlive(runnerPid)) {
      throw new Error(
        `[LOCK ACTIVE] Lock owner runner is actively running (platform: ${current.platform || 'unknown'}, runnerPid: ${runnerPid}, runId: ${current.runId}). Refusing to remove active lock.`,
      );
    }

    // B. Check mock server process liveness
    if (activeMockPid && isPidAlive(activeMockPid)) {
      throw new Error(
        `[LOCK ACTIVE] Mock server process is actively running (platform: ${current.platform || 'unknown'}, mockPid: ${activeMockPid}, runId: ${current.runId}). Refusing to remove active lock.`,
      );
    }

    // C. Query mock HTTP health
    const health = await queryMockHealth(targetPort);
    if (
      health?.status === 200 &&
      health?.data?.service === 'samgamam-acceptance-mock' &&
      health?.data?.runId === current.runId
    ) {
      throw new Error(
        `[LOCK ACTIVE] Mock server is actively responding on port ${targetPort} (runId: ${current.runId}). Refusing to remove active lock.`,
      );
    }

    // D. Ambiguity protection: if neither runnerPid nor activeMockPid was recorded
    if (!runnerPid && !activeMockPid) {
      throw new Error(
        `[LOCK AMBIGUOUS] Lock metadata at ${lockPath} contains neither runnerPid nor mockPid. Inactivity cannot be safely verified. Refusing to remove ambiguous lock.`,
      );
    }

    // E. Port check: never kill a foreign listener; refuse removal if port is occupied
    const portStatus = await checkPort(targetPort);
    if (portStatus.occupied) {
      if (health?.data?.service === 'samgamam-acceptance-mock') {
        throw new Error(
          `[LOCK BUSY] Port ${targetPort} is occupied by active mock server (runId: ${health?.data?.runId || 'unknown'}). Refusing to remove lock.`,
        );
      }
      throw new Error(
        `[PORT CONFLICT] Port ${targetPort} is occupied by foreign listener. Refusing to remove lock or disturb foreign process.`,
      );
    }

    // F. Final compare immediately before delete. No other recoverer can act
    // while we hold the guard, and acquirers only create when the path is free.
    let finalMeta;
    try {
      finalMeta = parseMetadata(fs.readFileSync(lockPath, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return alreadyGone;
      throw err;
    }
    if (!finalMeta || finalMeta.runId !== current.runId) {
      throw new Error(
        `[LOCK CONFLICT] Lock at ${lockPath} changed concurrently during recovery verification (now held by runId: ${finalMeta?.runId || 'unknown'}). Aborting recovery.`,
      );
    }

    try {
      fs.unlinkSync(lockPath);
    } catch (err) {
      if (err.code === 'ENOENT') return alreadyGone;
      throw err;
    }

    const recoveryReason = `Verified inactive session (runId: ${current.runId}, platform: ${current.platform || 'unknown'}): runnerPid ${runnerPid || 'none'} dead, mockPid ${activeMockPid || 'none'} dead, port ${targetPort} unoccupied.`;
    console.log(`[LOCK RECOVERED] Stale lock at ${lockPath} successfully recovered. Reason: ${recoveryReason}`);

    return {
      unlinked: true,
      recovered: true,
      runId: current.runId,
      reason: recoveryReason,
    };
  });
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
  unlockLock,
  parseMetadata,
  isPidAlive,
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
        const force = args.includes('--force');
        const result = await unlockLock({
          lockPath: lockFile,
          port,
          runId,
          force,
        });
        if (result.unlinked) {
          if (result.recovered) {
            console.log(`[LOCK RECOVERED] Stale lock ${lockFile} unlinked. Reason: ${result.reason}`);
          } else {
            console.log(`[LOCK RELEASED] Lock ${lockFile} unlinked.`);
          }
        } else {
          console.log(result.message || `Lock ${lockFile} not unlinked.`);
        }
        process.exit(0);
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
