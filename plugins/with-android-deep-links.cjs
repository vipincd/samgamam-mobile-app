// Restores samgamam:// in-app deep links on Android.
//
// The app scheme and the Auth0 customScheme are both `samgamam`. The
// react-native-auth0 config plugin removes every host-less `samgamam` data
// element from non-Auth0 activities so that RedirectActivity alone owns the
// callback, which leaves MainActivity with no samgamam:// filter at all:
// `samgamam://events/<id>` then fails to resolve on Android.
//
// This plugin registers the scheme on MainActivity for the explicit hosts the
// app routes (src/services/deep-links.ts). Each has a host, so it never matches
// the Auth0 callback (`samgamam://<auth0-domain>/android/<package>/callback`)
// and the Auth0 dedup leaves it in place, whatever order the plugins run in.
const { withAndroidManifest } = require('expo/config-plugins');

const SCHEME = 'samgamam';
const ROUTED_HOSTS = ['event', 'events', 'group', 'groups', 'notification', 'notifications', 'discover'];

function addRoutedDeepLinks(manifest) {
  const app = manifest.manifest.application?.[0];
  const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
  if (!main) throw new Error('with-android-deep-links: MainActivity not found in AndroidManifest');
  const isRouted = (f) =>
    Array.isArray(f.data) && f.data.length > 0 &&
    f.data.every((d) => d.$?.['android:scheme'] === SCHEME && ROUTED_HOSTS.includes(d.$?.['android:host']));
  // Idempotent: replace a previously added routed filter instead of duplicating it.
  main['intent-filter'] = (main['intent-filter'] || []).filter((f) => !isRouted(f));
  main['intent-filter'].push({
    action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
    category: [
      { $: { 'android:name': 'android.intent.category.DEFAULT' } },
      { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
    ],
    data: ROUTED_HOSTS.map((host) => ({ $: { 'android:scheme': SCHEME, 'android:host': host } })),
  });
  return manifest;
}

const withAndroidDeepLinks = (config) =>
  withAndroidManifest(config, (cfg) => {
    cfg.modResults = addRoutedDeepLinks(cfg.modResults);
    return cfg;
  });

module.exports = withAndroidDeepLinks;
module.exports.addRoutedDeepLinks = addRoutedDeepLinks;
module.exports.ROUTED_HOSTS = ROUTED_HOSTS;
