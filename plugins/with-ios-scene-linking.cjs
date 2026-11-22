const { withAppDelegate } = require('expo/config-plugins');

// Expo SDK 58 moved iOS to the scene life cycle: ExpoAppSceneDelegate receives
// every opened URL (scene:openURLContexts:) and forwards it to RCTLinkingManager,
// which is what delivers the Auth0 callback and samgamam:// links to JS.
//
// react-native-auth0 5.x still injects an
// `override func application(_:open:options:)` into AppDelegate.swift unless the
// file already mentions `RCTLinkingManager.application`. In the SDK 58 template
// it anchors on `sourceURL(for:)`, which lives in ReactNativeDelegate, a class
// with no such method to override, so the Release build fails with
// "method does not override any method from its superclass".
//
// This plugin works whichever order the mods run in: it removes the injected
// block if it is already there, and it leaves the marker comment below so that
// react-native-auth0 skips the injection if it runs afterwards.
const AUTH0_BLOCK =
  /^[ \t]*\/\/ @generated begin react-native-auth0-linking-swift[^\n]*\n[\s\S]*?^[ \t]*\/\/ @generated end react-native-auth0-linking-swift[^\n]*\n/m;
const MARKER =
  '// URL handling: ExpoAppSceneDelegate forwards opened URLs to RCTLinkingManager.application ' +
  '(scene life cycle); see plugins/with-ios-scene-linking.cjs.';
const INJECTED_OVERRIDE = /override func application\(_ app: UIApplication, open url: URL/;

function applyIosSceneLinking(contents) {
  let next = contents.replace(AUTH0_BLOCK, '');

  if (INJECTED_OVERRIDE.test(next)) {
    throw new Error(
      'AppDelegate.swift still overrides application(_:open:options:). Under the SDK 58 scene ' +
        'life cycle URLs are delivered by ExpoAppSceneDelegate; remove the override.',
    );
  }

  if (!next.includes(MARKER)) {
    const appDelegate = /^@main\s*\n/m.exec(next);
    if (!appDelegate) {
      throw new Error('AppDelegate.swift has no @main AppDelegate to annotate.');
    }
    next = `${next.slice(0, appDelegate.index)}${MARKER}\n${next.slice(appDelegate.index)}`;
  }

  return next;
}

function withIosSceneLinking(config) {
  return withAppDelegate(config, (modConfig) => {
    if (modConfig.modResults.language !== 'swift') {
      throw new Error('with-ios-scene-linking supports only the Swift AppDelegate (Expo SDK 53+).');
    }
    modConfig.modResults.contents = applyIosSceneLinking(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withIosSceneLinking;
module.exports.applyIosSceneLinking = applyIosSceneLinking;
module.exports.MARKER = MARKER;
