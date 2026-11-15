import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getDefaultLockPath, parseMetadata } = require('./mock-manager.cjs');
const [device, suite = 'all'] = process.argv.slice(2);
if (!device || !['all', 'smoke', 'regression'].includes(suite)) throw new Error('Usage: npm run test:maestro -- DEVICE [all|smoke|regression]');
// Run ownership: Maestro flows reset the mock's scenario, so they must only ever
// talk to the mock owned by this run. MOCK_RUN_ID is set by mock-manager
// (`exec`, or exported by android-ci.sh after `start`).
const runId = process.env.MOCK_RUN_ID;
if (!runId) throw new Error('MOCK_RUN_ID is not set. Start the mock through mock-manager (npm run test:android:acceptance -- DEVICE SUITE) so this run owns it.');
const lockPath = process.env.ACCEPTANCE_LOCK_PATH || getDefaultLockPath();
let lock = null;
try { lock = parseMetadata(readFileSync(lockPath, 'utf8')); } catch {}
if (lock?.runId !== runId) throw new Error(`Acceptance lock ${lockPath} is not owned by run ${runId} (owner: ${lock?.runId || 'none'}). Refusing to drive a mock this run does not own.`);
const health = await fetch('http://127.0.0.1:4318/__mock/health').then(r => r.json());
if (health.service !== 'samgamam-acceptance-mock' || health.runId !== runId) throw new Error(`Mock on loopback port 4318 belongs to run ${health.runId || 'unknown'}, not ${runId}. Refusing to continue.`);
// Multiple Android emulators may be running; never rely on ADB's default target.
if (device.startsWith('emulator-')) {
  for (const args of [['-s', device, 'wait-for-device'], ['-s', device, 'reverse', 'tcp:4318', 'tcp:4318']]) {
    const result = spawnSync('adb', args, { stdio: 'inherit', timeout: 30000 });
    if (result.status !== 0) throw new Error('Unable to prepare the selected Android emulator');
  }
}
const output = `artifacts/maestro/${new Date().toISOString().replaceAll(':', '-')}`;
mkdirSync(output, { recursive: true });
const suites = suite === 'all' ? ['smoke', 'regression'] : [suite];
const paths = suites.flatMap(s => readdirSync(`.maestro/${s}`).filter(f => f.endsWith('.yaml')).sort().map(f => `.maestro/${s}/${f}`));
const child = spawn('maestro', ['--device', device, 'test', '-e', `MOCK_RUN_ID=${runId}`, ...(process.env.MAESTRO_REUSE_DRIVER === '1' ? ['--no-reinstall-driver'] : []), '--format', 'junit', '--output', `${output}/results.xml`, '--test-output-dir', output, ...paths], { stdio: 'inherit' });
const timer = setTimeout(() => child.kill('SIGTERM'), 15 * 60 * 1000);
child.on('error', e => { clearTimeout(timer); console.error(e); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timer); console.log(`Evidence: ${output} (runId ${runId})`); process.exitCode = code ?? 1; });
