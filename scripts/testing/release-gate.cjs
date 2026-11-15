const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const file = process.argv[2];
if (!file) throw new Error('Provide a reviewed acceptance JSON file for the exact tested commit');
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const required = ['androidEmulator', 'iosSimulator', 'physicalAndroid', 'physicalIPhone', 'security', 'accessibility', 'authenticatedJourneys'];
const failures = [];
if (report.commit !== sha) failures.push('Acceptance evidence must refer to HEAD');
for (const name of required) {
  const check = report.checks?.[name];
  if (check?.status !== 'passed' || !check.evidence?.trim() || !check.reviewer?.trim()) failures.push(`${name}: missing passed status, evidence or reviewer`);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Reviewed release acceptance complete for ${sha}. No deployment performed.`);
