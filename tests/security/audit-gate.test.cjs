const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('scripts/security-audit.cjs', 'utf8');
function run(result) {
  let exitCode = 0;
  try { vm.runInNewContext(source, { require: () => ({ spawnSync: () => result }), console: { log() {}, warn() {}, error() {} }, process: { platform: 'linux', exit(code) { exitCode = code; throw new Error('exit'); } }, Date, Map }); } catch (e) { if (e.message !== 'exit') throw e; }
  return exitCode;
}
for (const [name, response] of Object.entries({ empty: {status:0,stdout:'{}'}, registry: {status:1,stdout:'{"error":{"code":"E503"}}'}, malformed: {status:1,stdout:'invalid'}, execution: {status:null,stdout:'',error: new Error('not found')} })) test(`audit fails closed on ${name}`, () => assert.equal(run(response), 1));
test('audit accepts a complete clean report', () => assert.equal(run({status:0,stdout: JSON.stringify({vulnerabilities:{},metadata:{vulnerabilities:{high:0,critical:0}}})}),0));
test('audit rejects unapproved high vulnerabilities', () => assert.equal(run({status:1,stdout:JSON.stringify({vulnerabilities:{x:{via:[{name:'x',severity:'high',url:'https://github.com/advisories/GHSA-AAAA-BBBB-CCCC'}]}},metadata:{vulnerabilities:{high:1}}})}),1));
test('audit rejects the retired image-size exception', () => assert.equal(run({status:1,stdout:JSON.stringify({vulnerabilities:{'image-size':{via:[{name:'image-size',severity:'high',url:'https://github.com/advisories/GHSA-5P2G-FCMC-QVQQ'}]}},metadata:{vulnerabilities:{high:1}}})}),1));
