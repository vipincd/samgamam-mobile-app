import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
const [device, suite = 'all'] = process.argv.slice(2);
if (!device || !['all', 'smoke', 'regression'].includes(suite)) throw new Error('Usage: npm run test:maestro -- DEVICE [all|smoke|regression]');
const health = await fetch('http://127.0.0.1:4318/__mock/health').then(r => r.json());
if (health.service !== 'samgamam-acceptance-mock') throw new Error('Expected Samgamam mock on loopback port 4318');
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
const child = spawn('maestro', ['--device', device, 'test', ...(process.env.MAESTRO_REUSE_DRIVER === '1' ? ['--no-reinstall-driver'] : []), '--format', 'junit', '--output', `${output}/results.xml`, '--test-output-dir', output, ...paths], { stdio: 'inherit' });
const timer = setTimeout(() => child.kill('SIGTERM'), 15 * 60 * 1000);
child.on('error', e => { clearTimeout(timer); console.error(e); process.exitCode = 1; });
child.on('exit', code => { clearTimeout(timer); console.log(`Evidence: ${output}`); process.exitCode = code ?? 1; });
