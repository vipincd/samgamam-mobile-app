#!/usr/bin/env node
// Agent 06 cross-platform mock ownership / lock acceptance harness.
//
//   node tests/manual/agent06-cross-platform-lock.cjs [--ios-worktree PATH] [--skip-shared]
//
// Not part of `npm run test:contracts`: the X-* cases take the REAL shared lock
// ($(git rev-parse --git-common-dir)/samgamam-acceptance-4318.lock) and port 4318
// for a few seconds, exactly as an acceptance run would. They are skipped when the
// lock exists or the port is occupied, and never kill a foreign process or
// remove a foreign lock. All other cases use temp locks and private ports.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');
const MANAGER = path.join(ROOT, 'scripts/testing/mock-manager.cjs');
const M = require(MANAGER);
const args = process.argv.slice(2);
const iosIdx = args.indexOf('--ios-worktree');
const IOS_ROOT = iosIdx !== -1 ? path.resolve(args[iosIdx + 1]) : null;
const SKIP_SHARED = args.includes('--skip-shared');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'agent06-lock-'));
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function record(id, pass, detail) {
  results.push({ id, result: pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL', detail });
  console.log(`${pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL'} ${id} — ${detail}`);
}
async function test(id, fn) {
  try { await fn(); } catch (err) { record(id, false, `threw: ${err.stack || err}`); }
}
function freePort() {
  return new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
}
function deadPid() {
  const r = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}
function readLock(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
async function health(port) { try { return await (await fetch(`http://127.0.0.1:${port}/__mock/health`)).json(); } catch { return null; } }
function waitFor(pred, ms = 10000, step = 25) {
  return (async () => { const end = Date.now() + ms; while (Date.now() < end) { if (await pred()) return true; await sleep(step); } return false; })();
}
function run(cmd, argv, opts = {}) {
  return new Promise((resolve) => {
    const c = spawn(cmd, argv, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    c.stdout.on('data', (d) => (out += d)); c.stderr.on('data', (d) => (err += d));
    c.on('close', (code) => resolve({ code, out, err }));
  });
}
// A child that blocks until `release` exists (deterministic barrier), recording
// its env so the harness can see the run id mock-manager handed it.
function barrierChild(dir) {
  const script = path.join(dir, 'barrier.cjs');
  fs.writeFileSync(script, `
    const fs = require('fs'); const d = ${JSON.stringify(dir)};
    fs.writeFileSync(d + '/child.json', JSON.stringify({ pid: process.pid, ppid: process.ppid, runId: process.env.MOCK_RUN_ID, lock: process.env.ACCEPTANCE_LOCK_PATH }));
    const t = setInterval(() => { if (fs.existsSync(d + '/release')) { clearInterval(t); process.exit(0); } }, 20);
  `);
  return script;
}

(async () => {
  // ---------------------------------------------------------------- L1 atomic create
  await test('L1 concurrent acquisition (24 contenders, fs barrier)', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l1-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    const go = path.join(dir, 'go');
    const code = `const M=require(${JSON.stringify(MANAGER)});const fs=require('fs');
      (async()=>{while(!fs.existsSync(${JSON.stringify(go)}))await new Promise(r=>setImmediate(r));
      try{await M.acquireLock({platform:process.argv[1]%2?'ios':'android',runId:'c'+process.argv[1],lockPath:${JSON.stringify(lock)},port:${port}});console.log('WON')}
      catch(e){console.log((e.message.match(/\\[[A-Z ]+\\]/)||['?'])[0])}
      setTimeout(()=>{},1500)})()`;
    const kids = Array.from({ length: 24 }, (_, i) => run(process.execPath, ['-e', code, String(i)]));
    await sleep(800); fs.writeFileSync(go, '1');
    const outs = (await Promise.all(kids)).map((k) => k.out.trim());
    const winners = outs.filter((o) => o === 'WON').length;
    const meta = readLock(lock);
    const leftovers = fs.readdirSync(dir).filter((f) => f.includes('.tmp'));
    const tally = outs.reduce((a, o) => ((a[o] = (a[o] || 0) + 1), a), {});
    record('L1 concurrent acquisition (24 contenders, fs barrier)', winners === 1 && !!meta?.runId && leftovers.length === 0,
      `winners=${winners} tally=${JSON.stringify(tally)} lockOwner=${meta?.runId} tmpLeftovers=${leftovers.length}`);
  });

  // ---------------------------------------------------------------- L2 atomic update
  await test('L2 atomic metadata updates under concurrent reader', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l2-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    await M.acquireLock({ platform: 'android', runId: 'upd', lockPath: lock, port });
    const reader = run(process.execPath, ['-e', `const fs=require('fs');let n=0,bad=0,gone=0,foreign=0;const end=Date.now()+2500;
      while(Date.now()<end){let s;try{s=fs.readFileSync(${JSON.stringify(lock)},'utf8')}catch{gone++;continue}n++;try{if(JSON.parse(s).runId!=='upd')foreign++}catch{bad++}}
      console.log(JSON.stringify({n,bad,gone,foreign}))`]);
    let ok = 0; const end = Date.now() + 2000;
    while (Date.now() < end) { if (M.updateLockMetadata({ lockPath: lock, runId: 'upd', updates: { mockPid: ok, pad: 'x'.repeat(4096) } })) ok++; await sleep(0); }
    const foreignUpdate = M.updateLockMetadata({ lockPath: lock, runId: 'intruder', updates: { runId: 'intruder' } });
    const r = JSON.parse((await reader).out);
    record('L2 atomic metadata updates under concurrent reader', r.bad === 0 && r.gone === 0 && r.foreign === 0 && ok > 100 && !foreignUpdate && readLock(lock).runId === 'upd',
      `updates=${ok} reads=${r.n} partialJSON=${r.bad} missing=${r.gone} foreignOwner=${r.foreign} foreignUpdateAccepted=${foreignUpdate}`);
  });

  // ---------------------------------------------------------------- L3 stale lock
  await test('L3 stale-lock detection and explicit recovery', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l3-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    fs.writeFileSync(lock, JSON.stringify({ platform: 'ios', runId: 'stale-ios', runnerPid: deadPid(), mockPid: deadPid(), port }));
    let refused = '';
    try { await M.acquireLock({ platform: 'android', runId: 'new-and', lockPath: lock, port }); } catch (e) { refused = e.message; }
    const preserved = readLock(lock)?.runId === 'stale-ios';
    const r = await M.acquireLock({ platform: 'android', runId: 'new-and', lockPath: lock, port, allowStaleReclaim: true });
    record('L3 stale-lock detection and explicit recovery', /\[LOCK STALE\]/.test(refused) && preserved && r.acquired && readLock(lock).runId === 'new-and' && !fs.existsSync(`${lock}.recovery`),
      `withoutFlag=${refused.slice(0, 13)} preserved=${preserved} withFlag=acquired:${r.acquired} owner=${readLock(lock).runId}`);
  });

  await test('L4 malformed / partial lock fails closed', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l4-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    fs.writeFileSync(lock, '{"platform":"ios","runId":"par');
    const msgs = [];
    for (const f of [() => M.acquireLock({ runId: 'a', lockPath: lock, port, allowStaleReclaim: true }), () => M.unlockLock({ lockPath: lock, port, force: true })]) {
      try { await f(); msgs.push('accepted'); } catch (e) { msgs.push((e.message.match(/\[[A-Z ]+\]/) || ['?'])[0]); }
    }
    record('L4 malformed / partial lock fails closed', msgs.every((m) => m === '[LOCK ERROR]') && fs.readFileSync(lock, 'utf8').endsWith('"par'), `acquire=${msgs[0]} forceUnlock=${msgs[1]} contentPreserved=true`);
  });

  // ---------------------------------------------------------------- L5 recovery vs new owner
  await test('L5 recovery racing a new foreign owner (guard barrier)', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l5-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    fs.writeFileSync(lock, JSON.stringify({ platform: 'android', runId: 'stale-X', runnerPid: deadPid(), mockPid: deadPid(), port }));
    // Hold the recovery guard ourselves: the recoverer reads stale-X, then blocks on the guard.
    const guard = `${lock}.recovery`; fs.mkdirSync(guard);
    fs.writeFileSync(path.join(guard, 'holder.json'), JSON.stringify({ pid: process.pid, token: 'harness' }));
    const recoverer = run(process.execPath, ['-e', `require(${JSON.stringify(MANAGER)}).unlockLock({lockPath:${JSON.stringify(lock)},port:${port},force:true}).then(r=>console.log('RESULT',JSON.stringify(r)),e=>console.log('ERR',e.message))`]);
    await sleep(700);
    // Meanwhile the stale lock is legitimately replaced by a live iOS owner.
    fs.writeFileSync(lock, JSON.stringify({ platform: 'ios', runId: 'live-Y', runnerPid: process.pid, mockPid: null, port }));
    fs.rmSync(guard, { recursive: true });
    const out = (await recoverer).out.trim();
    record('L5 recovery racing a new foreign owner (guard barrier)', /^ERR \[LOCK CONFLICT\]/.test(out) && readLock(lock)?.runId === 'live-Y',
      `recoverer=${out.slice(0, 60)} owner=${readLock(lock)?.runId}`);
  });

  await test('L5b recovery guard timeout never deletes', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l5b-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    fs.writeFileSync(lock, JSON.stringify({ platform: 'android', runId: 'stale-X', runnerPid: deadPid(), mockPid: deadPid(), port }));
    const guard = `${lock}.recovery`; fs.mkdirSync(guard);
    fs.writeFileSync(path.join(guard, 'holder.json'), JSON.stringify({ pid: process.pid, token: 'harness' }));
    let msg = ''; try { await M.unlockLock({ lockPath: lock, port, force: true }); } catch (e) { msg = e.message; }
    record('L5b recovery guard timeout never deletes', /RECOVERY BUSY/.test(msg) && readLock(lock)?.runId === 'stale-X' && fs.existsSync(guard), `error=${msg.slice(0, 24)} lockPreserved=true foreignGuardPreserved=${fs.existsSync(guard)}`);
    fs.rmSync(guard, { recursive: true });
  });

  await test('L6 force-unlock of an active foreign session refused', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l6-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    fs.writeFileSync(lock, JSON.stringify({ platform: 'ios', runId: 'active-ios', runnerPid: process.pid, mockPid: null, port }));
    const r = await run(process.execPath, [MANAGER, 'unlock', '--force', '--lock-file', lock, '--port', String(port)]);
    const r2 = await run(process.execPath, [MANAGER, 'unlock', '--run-id', 'android-x', '--lock-file', lock, '--port', String(port)]);
    record('L6 force-unlock of an active foreign session refused', r.code !== 0 && /LOCK ACTIVE/.test(r.err) && r2.code !== 0 && /LOCK REFUSED/.test(r2.err) && readLock(lock)?.runId === 'active-ios',
      `--force: exit ${r.code} ${r.err.trim().slice(0, 13)}; wrong --run-id: exit ${r2.code} ${r2.err.trim().slice(0, 14)}; owner=${readLock(lock)?.runId}`);
  });

  // ---------------------------------------------------------------- L7 owner-only cleanup, runId checks
  await test('L7 owner-only cleanup and runId enforcement on control endpoints', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l7-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    const owner = path.join(dir, 'owner.json');
    const info = await M.startMock({ port, runId: 'ios-owner', platform: 'ios', ownerFile: owner, lockPath: lock, runnerPid: process.pid });
    const base = `http://127.0.0.1:${port}`;
    const st = {};
    st.resetNoHeader = (await fetch(`${base}/__mock/reset?mode=error`, { method: 'POST' })).status;
    st.resetWrong = (await fetch(`${base}/__mock/reset?mode=error`, { method: 'POST', headers: { 'x-mock-run-id': 'android-x' } })).status;
    st.historyNoHeader = (await fetch(`${base}/__mock/history`)).status;
    st.eventsAfter = (await fetch(`${base}/api/v1/events`)).status;
    await M.stopMock({ runId: 'android-x', ownerFile: owner, lockPath: lock, port });
    st.aliveAfterForeignStop = M.isPidAlive(info.pid); st.lockAfterForeignStop = readLock(lock)?.runId; st.ownerFileKept = fs.existsSync(owner);
    let unl = ''; try { await M.unlockLock({ lockPath: lock, port, runId: 'android-x' }); } catch (e) { unl = (e.message.match(/\[[A-Z ]+\]/) || [''])[0]; }
    st.foreignUnlock = unl;
    st.resetOwner = (await fetch(`${base}/__mock/reset?mode=error`, { method: 'POST', headers: { 'x-mock-run-id': 'ios-owner' } })).status;
    st.eventsAfterOwnerReset = (await fetch(`${base}/api/v1/events`)).status;
    await M.stopMock({ runId: 'ios-owner', ownerFile: owner, lockPath: lock, port });
    await waitFor(() => !M.isPidAlive(info.pid), 4000);
    st.aliveAfterOwnerStop = M.isPidAlive(info.pid); st.lockAfterOwnerStop = fs.existsSync(lock); st.ownerFileAfter = fs.existsSync(owner);
    const ok = st.resetNoHeader === 409 && st.resetWrong === 409 && st.historyNoHeader === 409 && st.eventsAfter === 200 && st.aliveAfterForeignStop &&
      st.lockAfterForeignStop === 'ios-owner' && st.ownerFileKept && st.foreignUnlock === '[LOCK REFUSED]' && st.resetOwner === 200 &&
      st.eventsAfterOwnerReset === 503 && !st.aliveAfterOwnerStop && !st.lockAfterOwnerStop && !st.ownerFileAfter;
    record('L7 owner-only cleanup and runId enforcement on control endpoints', ok, JSON.stringify(st));
  });

  await test('L7b start/stop CLI without --run-id refused', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l7b-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    const env = { ...process.env }; delete env.MOCK_RUN_ID;
    const a = await run(process.execPath, [MANAGER, 'start', '--lock-file', lock, '--port', String(port)], { env });
    const b = await run(process.execPath, [MANAGER, 'stop', '--lock-file', lock, '--port', String(port)], { env });
    record('L7b start/stop CLI without --run-id refused', a.code === 1 && b.code === 1 && !fs.existsSync(lock) && !(await health(port)), `start exit ${a.code}, stop exit ${b.code}, no lock, no listener`);
  });

  // ---------------------------------------------------------------- L8/L9 crash and signal recovery
  for (const variant of ['supervisor-only', 'supervisor-and-mock']) {
    await test(`L8 crash recovery (SIGKILL ${variant})`, async () => {
      const dir = fs.mkdtempSync(path.join(TMP, 'l8-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
      const sup = spawn(process.execPath, [MANAGER, 'exec', '--platform', 'android', '--run-id', 'crash-run', '--port', String(port), '--lock-file', lock, '--', process.execPath, barrierChild(dir)], { cwd: ROOT, stdio: 'ignore' });
      await waitFor(() => fs.existsSync(path.join(dir, 'child.json')));
      const meta = readLock(lock); const mockPid = meta.mockPid;
      process.kill(sup.pid, 'SIGKILL');
      if (variant === 'supervisor-and-mock') process.kill(mockPid, 'SIGKILL');
      await waitFor(() => !M.isPidAlive(sup.pid), 3000);
      fs.writeFileSync(path.join(dir, 'release'), '1'); // let the orphaned barrier child exit
      await waitFor(() => !M.isPidAlive(JSON.parse(fs.readFileSync(path.join(dir, 'child.json'))).pid), 3000);
      if (variant === 'supervisor-and-mock') await waitFor(() => !M.isPidAlive(mockPid), 3000);
      const st = { lockAfterCrash: readLock(lock)?.runId, mockAlive: M.isPidAlive(mockPid) };
      try { await M.acquireLock({ platform: 'ios', runId: 'ios-next', lockPath: lock, port }); st.nextAcquire = 'acquired'; } catch (e) { st.nextAcquire = (e.message.match(/\[[A-Z ]+\]/) || ['?'])[0]; }
      if (variant === 'supervisor-only') {
        // Orphaned detached mock keeps answering for crash-run: must stay busy until its owner id stops it.
        let fu = ''; try { await M.unlockLock({ lockPath: lock, port, force: true }); } catch (e) { fu = (e.message.match(/\[[A-Z ]+\]/) || ['?'])[0]; }
        st.forceUnlock = fu;
        const stop = await run(process.execPath, [MANAGER, 'stop', '--run-id', 'crash-run', '--lock-file', lock, '--port', String(port)]);
        st.ownerStopExit = stop.code; await waitFor(() => !M.isPidAlive(mockPid), 4000);
        st.mockAliveAfterOwnerStop = M.isPidAlive(mockPid); st.lockAfterOwnerStop = fs.existsSync(lock);
        const ok = st.lockAfterCrash === 'crash-run' && st.mockAlive && st.nextAcquire === '[LOCK BUSY]' && st.forceUnlock === '[LOCK ACTIVE]' && st.ownerStopExit === 0 && !st.mockAliveAfterOwnerStop && !st.lockAfterOwnerStop;
        record(`L8 crash recovery (SIGKILL ${variant})`, ok, JSON.stringify(st));
      } else {
        const rec = await M.acquireLock({ platform: 'ios', runId: 'ios-next', lockPath: lock, port, allowStaleReclaim: true });
        st.recovered = rec.acquired && readLock(lock)?.runId === 'ios-next';
        record(`L8 crash recovery (SIGKILL ${variant})`, st.lockAfterCrash === 'crash-run' && !st.mockAlive && st.nextAcquire === '[LOCK STALE]' && st.recovered, JSON.stringify(st));
      }
    });
  }

  await test('L9 SIGTERM to supervisor cleans up only its own mock and lock', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'l9-')); const lock = path.join(dir, 'x.lock'); const port = await freePort();
    const sup = spawn(process.execPath, [MANAGER, 'exec', '--platform', 'ios', '--run-id', 'term-run', '--port', String(port), '--lock-file', lock, '--', process.execPath, barrierChild(dir)], { cwd: ROOT, stdio: 'ignore' });
    await waitFor(() => fs.existsSync(path.join(dir, 'child.json')));
    const mockPid = readLock(lock).mockPid; const child = JSON.parse(fs.readFileSync(path.join(dir, 'child.json')));
    const exit = new Promise((r) => sup.on('exit', (c, s) => r(c ?? s)));
    process.kill(sup.pid, 'SIGTERM');
    const code = await exit; await waitFor(() => !M.isPidAlive(mockPid), 4000);
    fs.writeFileSync(path.join(dir, 'release'), '1');
    record('L9 SIGTERM to supervisor cleans up only its own mock and lock', code === 1 && !M.isPidAlive(mockPid) && !fs.existsSync(lock) && child.runId === 'term-run' && child.lock === lock,
      `supervisorExit=${code} mockAlive=${M.isPidAlive(mockPid)} lockExists=${fs.existsSync(lock)} childRunId=${child.runId}`);
  });

  // ---------------------------------------------------------------- X: real shared lock, two worktrees
  const shared = M.getDefaultLockPath();
  const sharedBusy = fs.existsSync(shared) || (await M.checkPort(4318)).occupied;
  const xSkip = SKIP_SHARED ? '--skip-shared' : !IOS_ROOT ? 'no --ios-worktree' : sharedBusy ? `shared lock ${shared} present or port 4318 occupied (foreign run; not touched)` : null;
  if (xSkip) { for (const id of ['X1', 'X2', 'X3']) record(id, null, xSkip); }
  else {
    const sameLock = spawnSync(process.execPath, ['-e', `console.log(require('./scripts/testing/mock-manager.cjs').getDefaultLockPath())`], { cwd: IOS_ROOT, encoding: 'utf8' }).stdout.trim();
    await test('X1 Android owns shared 4318; iOS worktree cannot take, reset, stop or unlock it', async () => {
      const dir = fs.mkdtempSync(path.join(TMP, 'x1-'));
      const runId = `android-agent06-${Date.now()}`;
      const sup = spawn(process.execPath, [MANAGER, 'exec', '--platform', 'android', '--run-id', runId, '--', process.execPath, barrierChild(dir)], { cwd: ROOT, stdio: 'ignore' });
      const supExit = new Promise((r) => sup.on('exit', (c) => r(c)));
      await waitFor(() => fs.existsSync(path.join(dir, 'child.json')), 15000);
      const h0 = await health(4318); const st = { sameLockPath: sameLock === shared, owner: readLock(shared)?.runId, ownerPlatform: readLock(shared)?.platform };
      const ios = await run('bash', ['scripts/testing/ios-acceptance.sh', 'AGENT06-FAKE-UDID', 'ios'], { cwd: IOS_ROOT });
      st.iosRunnerExit = ios.code; st.iosRunnerMsg = /\[LOCK BUSY\]/.test(ios.err) ? "[LOCK BUSY]" : ios.err.trim().slice(-80); st.iosForeignLockPreserved = /Foreign lock preserved/.test(ios.err);
      const runM = await run(process.execPath, ['scripts/testing/run-maestro.mjs', 'AGENT06-FAKE-UDID', 'ios'], { cwd: IOS_ROOT, env: { ...process.env, MOCK_RUN_ID: 'ios-intruder' } });
      st.iosMaestroRefused = runM.code !== 0 && /not owned by run ios-intruder/.test(runM.err);
      const stop = await run(process.execPath, ['scripts/testing/mock-manager.cjs', 'stop', '--run-id', 'ios-intruder'], { cwd: IOS_ROOT });
      const unl = await run(process.execPath, ['scripts/testing/mock-manager.cjs', 'unlock', '--force'], { cwd: IOS_ROOT });
      st.iosForeignStopExit = stop.code; st.iosForceUnlock = (unl.err.match(/\[[A-Z ]+\]/) || ['?'])[0];
      st.iosReset = (await fetch('http://127.0.0.1:4318/__mock/reset?mode=error', { method: 'POST', headers: { 'x-mock-run-id': 'ios-intruder' } })).status;
      st.eventsStill200 = (await fetch('http://127.0.0.1:4318/api/v1/events')).status === 200;
      const h1 = await health(4318);
      st.androidMockUntouched = h1?.pid === h0?.pid && h1?.runId === runId && readLock(shared)?.runId === runId;
      // PR #6's assert-no-entity-requests.js issues GET /__mock/history WITHOUT x-mock-run-id.
      st.historyNoHeader = (await fetch('http://127.0.0.1:4318/__mock/history')).status;
      st.historyOwnerHeader = (await fetch('http://127.0.0.1:4318/__mock/history', { headers: { 'x-mock-run-id': runId } })).status;
      fs.writeFileSync(path.join(dir, 'release'), '1');
      st.androidExit = await supExit; st.lockReleased = !fs.existsSync(shared); st.portFree = !(await M.checkPort(4318)).occupied;
      const ok = st.sameLockPath && st.owner === runId && st.iosRunnerExit !== 0 && st.iosRunnerMsg === '[LOCK BUSY]' && st.iosMaestroRefused &&
        st.iosForceUnlock === '[LOCK ACTIVE]' && st.iosReset === 409 && st.eventsStill200 && st.androidMockUntouched && st.androidExit === 0 && st.lockReleased && st.portFree;
      record('X1 Android owns shared 4318; iOS worktree cannot take, reset, stop or unlock it', ok, JSON.stringify(st));
      record('X3 iOS no-entity-request history probe vs run-owned mock', st.historyNoHeader === 200,
        `GET /__mock/history without x-mock-run-id -> ${st.historyNoHeader}; with owner header -> ${st.historyOwnerHeader}`);
    });
    await test('X2 iOS owns shared 4318 from other worktree; Android cannot take or reset it', async () => {
      const dir = fs.mkdtempSync(path.join(TMP, 'x2-'));
      const runId = `ios-agent06-${Date.now()}`;
      const sup = spawn(process.execPath, ['scripts/testing/mock-manager.cjs', 'exec', '--platform', 'ios', '--port', '4318', '--run-id', runId, '--', process.execPath, barrierChild(dir)], { cwd: IOS_ROOT, stdio: 'ignore' });
      const supExit = new Promise((r) => sup.on('exit', (c) => r(c)));
      await waitFor(() => fs.existsSync(path.join(dir, 'child.json')), 15000);
      const h0 = await health(4318); const st = { owner: readLock(shared)?.runId, ownerPlatform: readLock(shared)?.platform };
      const and = await run('npm', ['run', '-s', 'test:android:acceptance', '--', 'emulator-0000', 'smoke'], { cwd: ROOT });
      st.androidRunnerExit = and.code; st.androidRunnerMsg = /\[LOCK BUSY\]/.test(and.err) ? "[LOCK BUSY]" : and.err.trim().slice(-80);
      const ci = await run('bash', ['scripts/testing/android-ci.sh', 'smoke'], { cwd: ROOT, env: { ...process.env, ANDROID_SERIAL: 'emulator-0000' } });
      st.androidCiExit = ci.code; st.androidCiMsg = /\[LOCK BUSY\]/.test(ci.err + ci.out) ? "[LOCK BUSY]" : "?";
      st.androidReset = (await fetch('http://127.0.0.1:4318/__mock/reset?mode=error', { method: 'POST', headers: { 'x-mock-run-id': 'android-intruder' } })).status;
      const h1 = await health(4318);
      st.iosMockUntouched = h1?.pid === h0?.pid && h1?.runId === runId && readLock(shared)?.runId === runId;
      fs.writeFileSync(path.join(dir, 'release'), '1');
      st.iosExit = await supExit; st.lockReleased = !fs.existsSync(shared); st.portFree = !(await M.checkPort(4318)).occupied;
      const ok = st.owner === runId && st.ownerPlatform === 'ios' && st.androidRunnerExit !== 0 && st.androidRunnerMsg === '[LOCK BUSY]' && st.androidCiExit !== 0 &&
        st.androidCiMsg === '[LOCK BUSY]' && st.androidReset === 409 && st.iosMockUntouched && st.iosExit === 0 && st.lockReleased && st.portFree;
      record('X2 iOS owns shared 4318 from other worktree; Android cannot take or reset it', ok, JSON.stringify(st));
    });
  }

  fs.rmSync(TMP, { recursive: true, force: true });
  const s = results.reduce((a, r) => ((a[r.result] = (a[r.result] || 0) + 1), a), {});
  console.log(`\nSUMMARY ${JSON.stringify(s)}`);
  process.exitCode = s.FAIL ? 1 : 0;
})();
