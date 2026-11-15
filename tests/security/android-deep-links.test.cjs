// Android samgamam:// deep-link registration. react-native-auth0 strips the
// host-less app scheme filter (it shares the `samgamam` scheme), so the app
// re-registers routed hosts on MainActivity via plugins/with-android-deep-links.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { addRoutedDeepLinks, ROUTED_HOSTS } = require('../../plugins/with-android-deep-links.cjs');

const root = join(__dirname, '../..');
const mergedManifest = join(root, 'android/app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml');
const acceptance = process.env.ANDROID_ACCEPTANCE === '1';

function fakeManifest() {
  return {
    manifest: {
      application: [{
        activity: [
          { $: { 'android:name': '.MainActivity' }, 'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }] }] },
          { $: { 'android:name': 'com.auth0.android.provider.RedirectActivity' }, 'intent-filter': [{ data: [{ $: { 'android:scheme': 'samgamam', 'android:host': 'tenant.example', 'android:pathPrefix': '/android/com.samgamam.mobile/callback' } }] }] },
        ],
      }],
    },
  };
}

test('DEEPLINK-01: plugin registers every routed host on MainActivity, idempotently, without touching Auth0', () => {
  const m = addRoutedDeepLinks(addRoutedDeepLinks(fakeManifest()));
  const [main, redirect] = m.manifest.application[0].activity;
  const routed = main['intent-filter'].filter((f) => f.data?.some((d) => d.$['android:scheme'] === 'samgamam'));
  assert.equal(routed.length, 1, 'exactly one routed filter after applying twice');
  assert.deepEqual(routed[0].data.map((d) => d.$['android:host']).sort(), [...ROUTED_HOSTS].sort());
  assert.ok(routed[0].data.every((d) => !d.$['android:pathPrefix']));
  assert.deepEqual(routed[0].category.map((c) => c.$['android:name']).sort(), ['android.intent.category.BROWSABLE', 'android.intent.category.DEFAULT']);
  assert.equal(redirect['intent-filter'][0].data[0].$['android:host'], 'tenant.example', 'Auth0 callback filter unchanged');
  assert.ok(!ROUTED_HOSTS.includes('unconfigured.invalid'));
});

test('DEEPLINK-02: every registered host is a route the JS parser handles', () => {
  const parser = readFileSync(join(root, 'src/services/deep-links.ts'), 'utf8');
  for (const host of ROUTED_HOSTS) assert.ok(parser.includes(`route === '${host}'`), `parser has no route for ${host}`);
});

test('DEEPLINK-03: merged release manifest routes samgamam:// hosts to MainActivity', (t) => {
  if (!existsSync(mergedManifest)) {
    if (acceptance) assert.fail('MANDATORY ACCEPTANCE GATE FAILED: merged release manifest not found');
    t.skip('native release build not present in this worktree');
    return;
  }
  const xml = readFileSync(mergedManifest, 'utf8');
  const main = xml.match(/<activity[^>]*android:name="com\.samgamam\.mobile\.MainActivity"[\s\S]*?<\/activity>/);
  assert.ok(main, 'MainActivity present');
  for (const host of ROUTED_HOSTS) {
    assert.match(main[0], new RegExp(`android:host="${host}"`), `MainActivity missing samgamam://${host}`);
  }
});
