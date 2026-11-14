// Expo config plugin (build-time only; never imported by the app bundle).
//
// Third-party components merged into the release APK that must not be exported.
// androidx.compose.ui:ui-tooling arrives via expo-dev-launcher/expo-dev-menu as an
// `implementation` dependency, which merges an exported PreviewActivity into every
// variant, including release. PreviewActivity invokes @Composable functions named
// in the launching intent, so any installed app could start it.
const { withAndroidManifest } = require('expo/config-plugins');

const TOOLS_NAMESPACE = 'http://schemas.android.com/tools';

const REMOVED_ANDROID_COMPONENTS = Object.freeze([
  Object.freeze({ tag: 'activity', name: 'androidx.compose.ui.tooling.PreviewActivity' }),
]);

function applyAndroidComponentRemovals(androidManifest) {
  const manifest = androidManifest.manifest;
  manifest.$ = { ...manifest.$, 'xmlns:tools': TOOLS_NAMESPACE };
  const application = manifest.application && manifest.application[0];
  if (!application) {
    throw new Error('AndroidManifest.xml has no <application> element to harden.');
  }
  for (const component of REMOVED_ANDROID_COMPONENTS) {
    const entries = (application[component.tag] = application[component.tag] || []);
    const existing = entries.find((entry) => entry.$ && entry.$['android:name'] === component.name);
    if (existing) {
      existing.$['tools:node'] = 'remove';
    } else {
      entries.push({ $: { 'android:name': component.name, 'tools:node': 'remove' } });
    }
  }
  return androidManifest;
}

function withAndroidComponentRemovals(config) {
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = applyAndroidComponentRemovals(modConfig.modResults);
    return modConfig;
  });
}

module.exports = withAndroidComponentRemovals;
module.exports.applyAndroidComponentRemovals = applyAndroidComponentRemovals;
module.exports.REMOVED_ANDROID_COMPONENTS = REMOVED_ANDROID_COMPONENTS;
