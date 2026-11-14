import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { assertOwnedMock } from './mock-ownership.mjs';
// `ios` holds iOS-only flows (custom-scheme deep links); `ios-all` is the full iOS acceptance set.
const SUITES = { all: ['smoke', 'regression'], smoke: ['smoke'], regression: ['regression'], ios: ['ios'], 'ios-all': ['smoke', 'regression', 'ios'] };
const [device, suite = 'all'] = process.argv.slice(2);
if (!device || !Object.hasOwn(SUITES, suite)) throw new Error(`Usage: npm run test:maestro -- DEVICE [${Object.keys(SUITES).join('|')}]`);
const health = await fetch('http://127.0.0.1:4318/__mock/health').then(r => r.json());
// MOCK_RUN_ID is set by mock-manager.cjs exec/start: then only our own mock is acceptable.
assertOwnedMock(health, process.env.MOCK_RUN_ID);
// Multiple Android emulators may be running; never rely on ADB's default target.
if (device.startsWith('emulator-')) {
  for (const args of [['-s', device, 'wait-for-device'], ['-s', device, 'reverse', 'tcp:4318', 'tcp:4318']]) {
    const result = spawnSync('adb', args, { stdio: 'inherit', timeout: 30000 });
    if (result.status !== 0) throw new Error('Unable to prepare the selected Android emulator');
  }
}
const output = `artifacts/maestro/${new Date().toISOString().replaceAll(':', '-')}`;
mkdirSync(output, { recursive: true });
const suites = SUITES[suite];
const paths = suites.flatMap(s => readdirSync(`.maestro/${s}`).filter(f => f.endsWith('.yaml')).sort().map(f => `.maestro/${s}/${f}`));
const child = spawn('maestro', ['--device', device, 'test', ...(process.env.MAESTRO_REUSE_DRIVER === '1' ? ['--no-reinstall-driver'] : []), '--format', 'junit', '--output', `${output}/results.xml`, '--test-output-dir', output, ...paths], { stdio: 'inherit' });
const timer = setTimeout(() => child.kill('SIGTERM'), 15 * 60 * 1000);
child.on('error', e => { clearTimeout(timer); console.error(e); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timer); console.log(`Evidence: ${output}`); process.exitCode = code ?? 1; });
