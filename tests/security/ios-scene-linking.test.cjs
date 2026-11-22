// Regression test: under Expo SDK 58's scene life cycle, react-native-auth0 5.x
// injected `override func application(_:open:options:)` into ReactNativeDelegate,
// and the iOS Release build failed with "method does not override any method from
// its superclass". plugins/with-ios-scene-linking.cjs must keep that override out
// whichever order the two AppDelegate mods run in.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { addAuth0AppDelegateCode } = require('react-native-auth0/lib/commonjs/plugin/withAuth0.js');
const { applyIosSceneLinking, MARKER } = require('../../plugins/with-ios-scene-linking.cjs');

const template = fs.readFileSync(path.join(__dirname, 'fixtures/expo-sdk58-AppDelegate.swift'), 'utf8');
const OVERRIDE = /override func application\(_ app: UIApplication, open url: URL/;

describe('iOS AppDelegate URL handling under the SDK 58 scene life cycle', () => {
  test('the fixture is the scene-based template that react-native-auth0 breaks', () => {
    assert.match(template, /class ReactNativeDelegate: ExpoReactNativeFactoryDelegate/);
    assert.doesNotMatch(template, OVERRIDE);
    // Without the plugin, react-native-auth0 injects the uncompilable override.
    assert.match(addAuth0AppDelegateCode(template, 'swift'), OVERRIDE);
  });

  test('react-native-auth0 first, then this plugin: the injected block is removed', () => {
    const result = applyIosSceneLinking(addAuth0AppDelegateCode(template, 'swift'));
    assert.doesNotMatch(result, OVERRIDE);
    assert.doesNotMatch(result, /react-native-auth0-linking-swift/);
    assert.ok(result.includes(MARKER));
  });

  test('this plugin first, then react-native-auth0: the injection is skipped', () => {
    const result = addAuth0AppDelegateCode(applyIosSceneLinking(template), 'swift');
    assert.doesNotMatch(result, OVERRIDE);
    assert.doesNotMatch(result, /react-native-auth0-linking-swift/);
  });

  test('re-running prebuild is idempotent', () => {
    const once = applyIosSceneLinking(addAuth0AppDelegateCode(template, 'swift'));
    const twice = applyIosSceneLinking(addAuth0AppDelegateCode(once, 'swift'));
    assert.equal(twice, once);
    assert.equal(once.split(MARKER).length - 1, 1);
  });

  test('a hand-written openURL override outside the generated block fails closed', () => {
    const handWritten = template.replace(
      'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {',
      'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {\n  override func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey : Any] = [:]) -> Bool { true }',
    );
    assert.throws(() => applyIosSceneLinking(handWritten), /still overrides application/);
  });

  test('the plugin is registered in app.config.ts after react-native-auth0', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../app.config.ts'), 'utf8');
    const auth0 = source.indexOf("['react-native-auth0',");
    const scene = source.indexOf('      IOS_SCENE_LINKING_PLUGIN,');
    assert.ok(auth0 > 0 && scene > auth0, 'IOS_SCENE_LINKING_PLUGIN must be listed after react-native-auth0');
  });
});
