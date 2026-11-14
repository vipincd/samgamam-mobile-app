const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync, execSync } = require('node:child_process');
const crypto = require('node:crypto');
const os = require('node:os');

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

// Every permission the release APK may declare, with the dependency that adds
// it (from android/app/build/outputs/logs/manifest-merger-release-report.txt).
// A permission outside this list fails the gate, so a new transitive
// permission must be reviewed here before it can ship.
const REVIEWED_APK_PERMISSIONS = {
  'android.permission.CAMERA': 'app.json + expo-camera (QR ticket check-in)',
  'android.permission.INTERNET': 'React Native networking',
  'android.permission.ACCESS_NETWORK_STATE': 'firebase-messaging (via expo-notifications)',
  'android.permission.VIBRATE': 'expo-notifications',
  'android.permission.RECEIVE_BOOT_COMPLETED': 'expo-notifications (reschedule after reboot)',
  'android.permission.POST_NOTIFICATIONS': 'expo-notifications (Android 13+ runtime prompt)',
  'android.permission.WAKE_LOCK': 'expo-notifications / Firebase messaging',
  'com.google.android.c2dm.permission.RECEIVE': 'Firebase Cloud Messaging (push)',
  'android.permission.USE_BIOMETRIC': 'androidx.biometric via expo-secure-store (requireAuthentication support; app does not use it)',
  'android.permission.USE_FINGERPRINT': 'androidx.biometric (legacy API alias)',
  'com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE': 'com.android.installreferrer (transitive)',
  'com.samgamam.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION': 'androidx.core signature-level self permission',
  'android.permission.READ_APP_BADGE': 'me.leolin ShortcutBadger via expo-notifications',
  'com.sec.android.provider.badge.permission.READ': 'ShortcutBadger (Samsung)',
  'com.sec.android.provider.badge.permission.WRITE': 'ShortcutBadger (Samsung)',
  'com.htc.launcher.permission.READ_SETTINGS': 'ShortcutBadger (HTC)',
  'com.htc.launcher.permission.UPDATE_SHORTCUT': 'ShortcutBadger (HTC)',
  'com.sonyericsson.home.permission.BROADCAST_BADGE': 'ShortcutBadger (Sony)',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE': 'ShortcutBadger (Sony)',
  'com.anddoes.launcher.permission.UPDATE_COUNT': 'ShortcutBadger (Apex)',
  'com.majeur.launcher.permission.UPDATE_BADGE': 'ShortcutBadger (Solid)',
  'com.huawei.android.launcher.permission.CHANGE_BADGE': 'ShortcutBadger (Huawei)',
  'com.huawei.android.launcher.permission.READ_SETTINGS': 'ShortcutBadger (Huawei)',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS': 'ShortcutBadger (Huawei)',
  'com.oppo.launcher.permission.READ_SETTINGS': 'ShortcutBadger (Oppo)',
  'com.oppo.launcher.permission.WRITE_SETTINGS': 'ShortcutBadger (Oppo)',
  'me.everything.badger.permission.BADGE_COUNT_READ': 'ShortcutBadger (Everything)',
  'me.everything.badger.permission.BADGE_COUNT_WRITE': 'ShortcutBadger (Everything)',
};

function isAcceptanceMode() {
  return (
    process.env.ANDROID_ACCEPTANCE === '1' ||
    process.env.STRICT_ACCEPTANCE === '1' ||
    process.env.CI_ACCEPTANCE === '1'
  );
}

function findAapt2() {
  // 1. Check if aapt2 is available on PATH
  try {
    const whichResult = execSync('which aapt2 2>/dev/null || where aapt2 2>/dev/null', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (whichResult && existsSync(whichResult)) {
      return whichResult;
    }
  } catch {}

  // 2. Discover dynamically from standard Android SDK paths without hardcoding user directories
  const candidateHomes = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(os.homedir(), 'Library/Android/sdk'), // macOS standard
    join(os.homedir(), 'Android/Sdk'), // Linux standard
    '/usr/local/lib/android/sdk', // GitHub Actions Linux runner standard
    '/opt/android-sdk',
  ].filter(Boolean);

  for (const home of candidateHomes) {
    const buildToolsDir = join(home, 'build-tools');
    if (existsSync(buildToolsDir)) {
      try {
        const versions = readdirSync(buildToolsDir).sort().reverse();
        for (const ver of versions) {
          const candidate = join(buildToolsDir, ver, 'aapt2');
          if (existsSync(candidate)) return candidate;
        }
      } catch {}
    }
  }

  return null;
}

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
    if (isAcceptanceMode()) {
      assert.fail('MANDATORY ACCEPTANCE GATE FAILED: Source manifest not generated at android/app/src/main/AndroidManifest.xml');
    } else {
      t.skip('Native Android source manifest not generated in this worktree');
      return;
    }
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
    if (isAcceptanceMode()) {
      assert.fail('MANDATORY ACCEPTANCE GATE FAILED: Merged release manifest not found at android/app/build/.../AndroidManifest.xml');
    } else {
      t.skip('Merged release manifest not generated yet; build has not run');
      return;
    }
  }

  const manifestContent = readFileSync(mergedManifestPath, 'utf8');
  assert.doesNotThrow(() => {
    validateMergedManifestXml(manifestContent);
  });
});

test('release APK binary permissions confirm prohibited permissions are stripped', (t) => {
  const apkPath = join(projectRoot, 'android/app/build/outputs/apk/release/app-release.apk');
  if (!existsSync(apkPath)) {
    if (isAcceptanceMode()) {
      assert.fail('MANDATORY ACCEPTANCE GATE FAILED: Release APK binary not found at android/app/build/outputs/apk/release/app-release.apk');
    } else {
      t.skip('Release APK binary not built yet in this worktree');
      return;
    }
  }

  // Calculate and record artifact SHA-256
  const apkBuffer = readFileSync(apkPath);
  const sha256 = crypto.createHash('sha256').update(apkBuffer).digest('hex');
  assert.equal(sha256.length, 64, 'APK SHA-256 must be a 64-character hex string');
  // Builds are not bit-reproducible across machines or signing keys, so the
  // hash is recorded as evidence of exactly which binary was inspected rather
  // than pinned to one historical build.
  t.diagnostic(`release APK sha256=${sha256} bytes=${apkBuffer.length}`);

  const aapt2Path = findAapt2();
  if (!aapt2Path) {
    if (isAcceptanceMode()) {
      assert.fail('MANDATORY ACCEPTANCE GATE FAILED: aapt2 inspection binary not found in execution environment');
    } else {
      t.skip('aapt2 binary not found in standard Android SDK location; skipping APK binary inspection');
      return;
    }
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

  const declared = [...badgingOutput.matchAll(/^uses-permission: name='([^']+)'/gm)].map((m) => m[1]).sort();
  const unreviewed = declared.filter((perm) => !(perm in REVIEWED_APK_PERMISSIONS));
  assert.deepEqual(unreviewed, [], `Release APK declares unreviewed permissions: ${unreviewed.join(', ')}`);

  const attestation = { apk: 'android/app/build/outputs/apk/release/app-release.apk', sha256, bytes: apkBuffer.length, permissions: declared, inspectedAt: new Date().toISOString() };
  mkdirSync(join(projectRoot, 'artifacts'), { recursive: true });
  writeFileSync(join(projectRoot, 'artifacts/apk-attestation.json'), JSON.stringify(attestation, null, 2));
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
  findAapt2,
  BLOCKED_PERMISSIONS,
  REQUIRED_PERMISSIONS,
};
