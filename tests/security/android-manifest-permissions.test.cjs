const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');

const projectRoot = join(__dirname, '../..');

const BLOCKED_PERMISSIONS = [
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

const REQUIRED_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.CAMERA',
];

function validateSourceManifestXml(manifestContent) {
  for (const perm of BLOCKED_PERMISSIONS) {
    const removalRegex = new RegExp(
      `<uses-permission[^>]+android:name="${perm}"[^>]+tools:node="remove"|<uses-permission[^>]+tools:node="remove"[^>]+android:name="${perm}"`,
    );
    const bareRegex = new RegExp(
      `<uses-permission[^>]+android:name="${perm}"(?![^>]+tools:node="remove")`,
    );

    if (!removalRegex.test(manifestContent)) {
      throw new Error(`AndroidManifest.xml must include tools:node="remove" for ${perm}`);
    }
    if (bareRegex.test(manifestContent)) {
      throw new Error(`AndroidManifest.xml must NOT request ${perm} without tools:node="remove"`);
    }
  }

  for (const reqPerm of REQUIRED_PERMISSIONS) {
    const regex = new RegExp(`<uses-permission[^>]+android:name="${reqPerm}"`);
    if (!regex.test(manifestContent)) {
      throw new Error(`${reqPerm} must be declared in AndroidManifest.xml`);
    }
  }

  return true;
}

function validateMergedManifestXml(manifestContent) {
  // In merged manifest, stripped permissions must be completely absent
  for (const perm of BLOCKED_PERMISSIONS) {
    const bareRegex = new RegExp(`<uses-permission[^>]+android:name="${perm}"`);
    if (bareRegex.test(manifestContent)) {
      throw new Error(`Merged AndroidManifest.xml must NOT contain blocked permission: ${perm}`);
    }
  }

  for (const reqPerm of REQUIRED_PERMISSIONS) {
    const regex = new RegExp(`<uses-permission[^>]+android:name="${reqPerm}"`);
    if (!regex.test(manifestContent)) {
      throw new Error(`Merged AndroidManifest.xml must contain required permission: ${reqPerm}`);
    }
  }

  return true;
}

test('app.json blocks dangerous and unwanted Android permissions', () => {
  const appJsonPath = join(projectRoot, 'app.json');
  assert.ok(existsSync(appJsonPath), 'app.json must exist');

  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  const android = appJson.expo?.android;
  assert.ok(android, 'expo.android must be configured in app.json');

  const blocked = android.blockedPermissions || [];
  for (const perm of BLOCKED_PERMISSIONS) {
    assert.ok(
      blocked.includes(perm),
      `app.json must block ${perm} via android.blockedPermissions`,
    );
  }

  // Declared permissions should be strictly minimized to justified features
  const permissions = android.permissions || [];
  assert.deepEqual(
    permissions,
    ['android.permission.CAMERA'],
    'Only justified permissions (CAMERA) should be declared in app.json',
  );
});

test('generated AndroidManifest.xml removes blocked permissions via tools:node="remove"', (t) => {
  const manifestPath = join(projectRoot, 'android/app/src/main/AndroidManifest.xml');
  if (!existsSync(manifestPath)) {
    // Report SKIPPED explicitly with a clear reason instead of returning silent pass
    t.skip('Native Android source manifest not generated in this worktree');
    return;
  }

  const manifestContent = readFileSync(manifestPath, 'utf8');
  assert.doesNotThrow(() => {
    validateSourceManifestXml(manifestContent);
  });
});

test('merged release AndroidManifest.xml contains no blocked permissions', (t) => {
  const mergedManifestPath = join(
    projectRoot,
    'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml',
  );

  if (!existsSync(mergedManifestPath)) {
    t.skip('Merged release manifest not generated yet; build has not run');
    return;
  }

  const manifestContent = readFileSync(mergedManifestPath, 'utf8');
  assert.doesNotThrow(() => {
    validateMergedManifestXml(manifestContent);
  });
});

test('release APK binary permissions confirm prohibited permissions are stripped', (t) => {
  const apkPath = join(projectRoot, 'android/app/build/outputs/apk/release/app-release.apk');
  if (!existsSync(apkPath)) {
    t.skip('Release APK binary not built yet in this worktree');
    return;
  }

  // Calculate and record artifact SHA-256
  const apkBuffer = readFileSync(apkPath);
  const sha256 = crypto.createHash('sha256').update(apkBuffer).digest('hex');
  assert.ok(sha256.length === 64, 'APK SHA-256 must be a 64-character hex string');

  // Locate aapt2 in SDK or PATH
  const possiblePaths = [
    '/Users/vidas/Library/Android/sdk/build-tools/35.0.0/aapt2',
    '/Users/vidas/Library/Android/sdk/build-tools/36.0.0/aapt2',
    process.env.ANDROID_HOME ? join(process.env.ANDROID_HOME, 'build-tools/35.0.0/aapt2') : null,
  ].filter(Boolean);

  let aapt2Path = null;
  for (const candidate of possiblePaths) {
    if (existsSync(candidate)) {
      aapt2Path = candidate;
      break;
    }
  }

  if (!aapt2Path) {
    t.skip('aapt2 binary not found in standard Android SDK location; skipping APK binary inspection');
    return;
  }

  const badgingOutput = execFileSync(aapt2Path, ['dump', 'badging', apkPath], { encoding: 'utf8' });

  for (const perm of BLOCKED_PERMISSIONS) {
    assert.ok(
      !badgingOutput.includes(`uses-permission: name='${perm}'`),
      `Release APK must NOT contain ${perm}`,
    );
  }

  for (const reqPerm of REQUIRED_PERMISSIONS) {
    assert.ok(
      badgingOutput.includes(`uses-permission: name='${reqPerm}'`),
      `Release APK must contain required permission ${reqPerm}`,
    );
  }
});

test('security gate negative regression: validator rejects manifest with prohibited permissions', () => {
  // Negative test 1: Manifest introduces RECORD_AUDIO without tools:node="remove"
  const badManifest = `
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.CAMERA"/>
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.RECORD_AUDIO"/>
</manifest>
`;

  assert.throws(
    () => {
      validateSourceManifestXml(badManifest);
    },
    /tools:node="remove" for android\.permission\.RECORD_AUDIO/,
    'Negative test must catch unstripped prohibited permission in source manifest',
  );

  // Negative test 2: Merged manifest contains SYSTEM_ALERT_WINDOW
  const badMergedManifest = `
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.CAMERA"/>
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
</manifest>
`;

  assert.throws(
    () => {
      validateMergedManifestXml(badMergedManifest);
    },
    /Merged AndroidManifest\.xml must NOT contain blocked permission: android\.permission\.SYSTEM_ALERT_WINDOW/,
    'Negative test must catch presence of prohibited permission in merged manifest',
  );

  // Negative test 3: Manifest missing required CAMERA permission
  const missingCameraManifest = `
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.RECORD_AUDIO" tools:node="remove"/>
  <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" tools:node="remove"/>
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" tools:node="remove"/>
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" tools:node="remove"/>
</manifest>
`;

  assert.throws(
    () => {
      validateSourceManifestXml(missingCameraManifest);
    },
    /android\.permission\.CAMERA must be declared in AndroidManifest\.xml/,
    'Negative test must catch missing required CAMERA permission',
  );
});

module.exports = {
  validateSourceManifestXml,
  validateMergedManifestXml,
  BLOCKED_PERMISSIONS,
  REQUIRED_PERMISSIONS,
};
