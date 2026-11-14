// Guards the native-permission decisions in app.config.ts: a permission or
// Info.plist purpose string is only blocked because no app code needs it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const { join, relative } = require('node:path');

const root = join(__dirname, '../..');

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx)$/.test(entry) && !/\.test\.(ts|tsx|js)$/.test(entry) ? [full] : [];
  });
}

const appSources = [join(root, 'App.tsx'), join(root, 'index.ts'), ...sourceFiles(join(root, 'src'))];

test('no app code requests biometric-gated SecureStore items (USE_BIOMETRIC/USE_FINGERPRINT are blocked)', () => {
  const offenders = appSources.filter((file) =>
    /requireAuthentication|canUseBiometricAuthentication|authenticationPrompt|expo-local-authentication/.test(
      readFileSync(file, 'utf8'),
    ),
  );
  assert.deepEqual(offenders.map((file) => relative(root, file)), []);
});

test('no app code records audio (RECORD_AUDIO is blocked, camera microphonePermission is false)', () => {
  const offenders = appSources.filter((file) =>
    /recordAsync|expo-av|expo-audio|Audio\.Recording|mute=\{false\}/.test(readFileSync(file, 'utf8')),
  );
  assert.deepEqual(offenders.map((file) => relative(root, file)), []);
});

test('app.config.ts stays bundle-safe: it is imported by src/auth/config.ts, so no Node-only config-plugin imports', () => {
  const source = readFileSync(join(root, 'app.config.ts'), 'utf8');
  assert.doesNotMatch(source, /from ['"](expo\/config-plugins|@expo\/config-plugins)['"]/);
  assert.doesNotMatch(source, /require\(['"](expo\/config-plugins|@expo\/config-plugins)['"]\)/);
});
