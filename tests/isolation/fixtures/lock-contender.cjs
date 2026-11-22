// Child-process contender used by tests/isolation/lock-atomicity.test.cjs.
// Modes:
//   writer  <lockPath> <ms>  owner continuously rewrites its own lock metadata
//   reader  <lockPath> <ms>  foreign runner repeatedly tries to acquire
//   cycler  <lockPath> <ms> <id>  recover-stale -> acquire -> verify -> go stale
const fs = require('node:fs');
const m = require('../../../scripts/testing/mock-manager.cjs');
const [mode, lockPath, msRaw, id = 'c'] = process.argv.slice(2);
const end = Date.now() + Number(msRaw);
const port = Number(process.env.CONTENDER_PORT || 1);
const out = {};
const bump = (k) => { out[k] = (out[k] || 0) + 1; };
const quiet = () => {};
console.log = quiet; console.warn = quiet;

(async () => {
  if (mode === 'writer') {
    let i = 0;
    while (Date.now() < end) {
      m.updateLockMetadata({ lockPath, runId: 'owner-A', updates: { pad: 'x'.repeat(20000), i: i++ } });
      bump('updates');
      await new Promise((r) => setImmediate(r));
    }
  } else if (mode === 'reader') {
    while (Date.now() < end) {
      try {
        await m.acquireLock({ platform: 'ios', runId: 'contender-B', lockPath, port });
        bump('acquired');
      } catch (e) {
        bump((e.message.match(/^\[[A-Z ]+\]/) || ['other'])[0]);
      }
    }
  } else if (mode === 'cycler') {
    let n = 0;
    while (Date.now() < end) {
      try { await m.unlockLock({ lockPath, port, force: true }); } catch {}
      const runId = `${id}-${n++}`;
      try {
        await m.acquireLock({ platform: 'android', runId, lockPath, port, runnerPid: process.pid });
      } catch { continue; }
      bump('acquired');
      await new Promise((r) => setTimeout(r, 2));
      let cur = null;
      try { cur = JSON.parse(fs.readFileSync(lockPath, 'utf8')); } catch {}
      if (cur?.runId !== runId) { bump('lost'); continue; }
      m.updateLockMetadata({ lockPath, runId, updates: { runnerPid: 999999, mockPid: 999998 } });
    }
  }
  process.stdout.write(JSON.stringify(out) + '\n');
})();
