const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const projectRoot = join(__dirname, '../..');

test('app.json blocks dangerous and unwanted Android permissions', () => {
  const appJsonPath = join(projectRoot, 'app.json');
  assert.ok(existsSync(appJsonPath), 'app.json must exist');

  const appJson = JSON.parse(readFileSync(appJsonPath, 'utf8'));
  const android = appJson.expo?.android;
  assert.ok(android, 'expo.android must be configured in app.json');

  const blocked = android.blockedPermissions || [];
  const expectedBlocked = [
    'android.permission.RECORD_AUDIO',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ];

  for (const perm of expectedBlocked) {
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

test('generated AndroidManifest.xml removes blocked permissions via tools:node="remove"', () => {
  const manifestPath = join(projectRoot, 'android/app/src/main/AndroidManifest.xml');
  if (!existsSync(manifestPath)) {
    // If native folder is not yet generated in this worktree, skip manifest check
    return;
  }

  const manifestContent = readFileSync(manifestPath, 'utf8');

  // Verify blocked permissions have tools:node="remove"
  const blockedPermissions = [
    'android.permission.RECORD_AUDIO',
    'android.permission.SYSTEM_ALERT_WINDOW',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ];

  for (const perm of blockedPermissions) {
    const removalRegex = new RegExp(
      `<uses-permission[^>]+android:name="${perm}"[^>]+tools:node="remove"|<uses-permission[^>]+tools:node="remove"[^>]+android:name="${perm}"`,
    );
    const bareRegex = new RegExp(
      `<uses-permission[^>]+android:name="${perm}"(?![^>]+tools:node="remove")`,
    );

    assert.ok(
      removalRegex.test(manifestContent),
      `AndroidManifest.xml must include tools:node="remove" for ${perm}`,
    );
    assert.ok(
      !bareRegex.test(manifestContent),
      `AndroidManifest.xml must NOT request ${perm} without tools:node="remove"`,
    );
  }

  // Verify necessary permissions are retained
  assert.match(
    manifestContent,
    /android\.permission\.INTERNET/,
    'INTERNET permission must be declared in AndroidManifest.xml',
  );
  assert.match(
    manifestContent,
    /android\.permission\.CAMERA/,
    'CAMERA permission must be declared in AndroidManifest.xml',
  );
});
