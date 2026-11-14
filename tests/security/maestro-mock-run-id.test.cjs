// Every Maestro script that calls a mock control endpoint must present the run id,
// because mock-manager always starts the mock with MOCK_RUN_ID and the mock then
// answers /__mock/* (except /health) only for that run. A script without the
// header passes against an unowned mock but fails with 409 under the shared lock.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const root = path.join(__dirname, '../..');
const scriptsDir = path.join(root, '.maestro/scripts');
const controlScripts = fs.readdirSync(scriptsDir).filter((f) => f.endsWith('.js'))
  .filter((f) => /\/__mock\/(?!health)/.test(fs.readFileSync(path.join(scriptsDir, f), 'utf8')));

const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

// Synchronous stand-in for Maestro's `http` (scripts run synchronously there).
function maestroHttp(port) {
  const call = (method, url, opts = {}) => {
    const target = url.replace('127.0.0.1:4318', `127.0.0.1:${port}`);
    const r = spawnSync(process.execPath, ['-e', `fetch(${JSON.stringify(target)}, ${JSON.stringify({ method, headers: opts.headers || {}, body: opts.body })})
      .then(async (res) => process.stdout.write(JSON.stringify({ status: res.status, body: await res.text() })))`], { encoding: 'utf8' });
    return JSON.parse(r.stdout);
  };
  return { get: (u, o) => call('GET', u, o), post: (u, o) => call('POST', u, o) };
}

test('Maestro mock-control scripts are discovered', () => {
  assert.ok(controlScripts.includes('reset.js'));
  assert.ok(controlScripts.includes('assert-no-entity-requests.js'));
});

for (const file of controlScripts) {
  test(`${file} works against a run-owned mock and is refused by a foreign one`, async () => {
    const port = await freePort();
    const mock = spawn(process.execPath, [path.join(root, 'scripts/testing/mock-api.cjs')], {
      env: { ...process.env, MOCK_PORT: String(port), MOCK_RUN_ID: 'owner-run' }, stdio: 'ignore',
    });
    try {
      for (let i = 0; i < 100; i++) {
        try { if ((await fetch(`http://127.0.0.1:${port}/__mock/health`)).ok) break; } catch {}
        await new Promise((r) => setTimeout(r, 50));
      }
      const source = fs.readFileSync(path.join(scriptsDir, file), 'utf8');
      const runAs = (runId) => vm.runInNewContext(source, { http: maestroHttp(port), output: {}, MODE: 'success', MOCK_RUN_ID: runId, JSON });
      // reset first so history holds no stray entries
      vm.runInNewContext(fs.readFileSync(path.join(scriptsDir, 'reset.js'), 'utf8'), { http: maestroHttp(port), MODE: 'success', MOCK_RUN_ID: 'owner-run', JSON });
      assert.doesNotThrow(() => runAs('owner-run'));
      assert.throws(() => runAs('foreign-run'), /409/);
    } finally {
      mock.kill('SIGTERM');
    }
  });
}
