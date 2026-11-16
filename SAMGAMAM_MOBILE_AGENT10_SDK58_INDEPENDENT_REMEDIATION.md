# Agent 10 — SDK 58 Independent Remediation

## Verdict

**Ready for final code/merge review; not approved for merge or release.** The corrected source candidate passed the listed automated checks and is committed at the tested SHA below. Android manifest processing now succeeds without producing or signing an APK. Native QR appearance/framing has not been visually accepted on a device: the available emulator/simulators were not used because installing an app requires signing, which was explicitly disallowed without authorization. PR #2 remains open and conflicting.

## 1. Exact revisions and evidence integrity

- **Starting reviewed SHA:** `d0762b2fc808970610bf580295424edf8958d2cf`
- **Final tested source SHA:** `6b390972bd55522c6d28d9859c07fdb628467f62`
- **Branch:** `agents/mobile10-sdk58-remediation`, in an isolated Agent 10 worktree. Agent 09’s branch and PR #2 were not modified.

Actual history immediately before remediation:

| SHA | Commit |
|---|---|
| `d0762b2fc808970610bf580295424edf8958d2cf` | `docs(closure): complete SDK 58 Jest failure closure report` |
| `14a071d0d09968d69d02694a20fd0860132f57c4` | `fix(typescript): use absoluteFillObject for spread in StyleSheet.create` |
| `c9984a5f878247e1f14e94d49887f1686e08c8b2` | `docs(acceptance): complete SDK 58 regression closure & readiness report` |
| `3f97bd3dda22fec0911de97a5685272c4d138da0` | `docs(handoff): fix Android test command (remove incorrect ios-all suite)` |
| `0645c918fbb3e0a4e5d82c0e5bc1b7e64d2d1605` | `fix(lint,test): resolve ESLint rule errors and isolate Jest from Node tests` |

The Agent 09 closure report gives `14a071d1f6b8c9e8a2d3c4e5f6a7b8c9d0e1f2a3` as the fix commit SHA; that SHA does not match the repository history. The actual commit is `14a071d0d09968d69d02694a20fd0860132f57c4`.

The two Agent 09 reports also give contradictory explanations for the nine Jest failures: one called them Jest/mock-server environmental failures; the later closure report attributed them to the scanner TypeScript spread error. A clean install independently reproduced all nine failures in `src/api/deterministic-backend.test.ts`, both in the full suite and in isolation. The cause was the Jest-provided truthy `fetch` implementation not performing the tests’ localhost HTTP requests; the previous `require('node:fetch')` fallback was not a valid Node built-in and did not replace that implementation. The tests now use Undici for those local HTTP requests and restore the original global fetch descriptor after the suite. All nine tests pass in the final run.

## 2. Confirmed findings and corrections

### React Native scanner styles

Against the installed React Native `0.88.1` source, `StyleSheetExports.js` defines and exports `absoluteFill`; it does not define/export `absoluteFillObject`. The regression test also asserts at runtime, under Jest’s React Native environment, that `Reflect.get(StyleSheet, 'absoluteFillObject')` is `undefined`.

`QrCheckInScreen.tsx` now uses explicit `position: 'absolute'` and `top/right/bottom/left: 0` styles for both the camera and overlay. `QrCheckInScreen.test.tsx` renders the screen and checks the complete flattened camera fill and centered overlay styles, rather than relying on typechecking alone.

### Metro and SDK dependency graph

Removed the forced Metro `0.83.8` overrides. The clean installed graph is:

- `expo@58.0.25` → `@expo/metro@58.0.0` → Metro `0.87.1`.
- `react-native@0.88.1` → community CLI Metro `0.87.3`.

Those are separate declared dependency paths; they are not forced to one version. `npm ls metro` and `npm ls @expo/metro` both succeed. `npx expo install --check` reports dependencies up to date. Expo SDK-compatible React Native, React, safe-area context, Expo ESLint config, TypeScript, and `expo-system-ui@58.0.7` are recorded in the manifest/lockfile. The obsolete `android.edgeToEdgeEnabled` option was removed after SDK 58 prebuild rejected it.

Removed the global `brace-expansion` override after Expo fingerprinting exposed an incompatible API (`expand is not a function`). The lockfile now satisfies each consumer’s declared major (including `1.1.21`, `2.1.8`, and `5.0.13`); the final Android+iOS export completed without that warning.

### Auth0 native placeholders discovered during Android validation

The first Android debug attempt stopped at manifest merging because `auth0Domain` and `auth0Scheme` were unresolved. The installed `react-native-auth0` instructions confirm that its Android `RedirectActivity` requires both Gradle manifest placeholders even when login is not configured. Added an idempotent Expo config plugin that sets those values in `defaultConfig`, using the configured domain/scheme or the inert `unconfigured.invalid`/`samgamam` development values. The plugin and its generated Gradle output are covered by tests. Android `processDebugMainManifest` now succeeds.

## 3. Jest, contracts, static checks, exports

Final validation on the tested source tree:

| Check | Result |
|---|---|
| `npm ci` | Passed from the regenerated lockfile |
| `npm ls metro` / `npm ls @expo/metro` | Passed; graph shown above |
| `npm run typecheck` / `npm run lint` | Passed |
| `npm test` | **258 passed, 0 failed; 19 suites** |
| `npm run test:contracts` | **86 passed, 0 failed, 3 skipped** |
| `npx expo-doctor` | **20/20 checks passed** |
| `npx expo install --check` | Dependencies up to date |
| `npx expo export --platform android --platform ios` | Both bundles exported |
| `:app:processDebugMainManifest` | Passed; no APK build/signing |
| `git diff --check` | Passed |

The three contract skips require release outputs that were not generated: merged release deep-link manifest, merged release permission manifest, and release APK permission inspection. The generated Android source manifest permission-removal contract now passes; it was the one failure in an earlier run against stale generated native files and passed after `expo prebuild`.

## 4. Native QR acceptance

`adb devices` and `xcrun simctl list devices available` showed Android emulators and booted iOS simulators available. The Android Gradle manifest-processing task passed with the configured local SDK, including the Auth0 placeholders and permission-removal manifest. **No APK/IPA was built or installed, and no camera preview or overlay screenshot was captured.** The earlier Android run stopped before signing on the unresolved placeholders; after fixing them, no signed build/install was attempted because the instruction prohibits signing without authorization. iOS native runtime acceptance was likewise not attempted.

The style regression test verifies the camera viewport fill and centered full-screen overlay layout, but it does not substitute for visual framing/appearance acceptance on either platform.

## 5. Dependency security

- `npm run security:audit`: passed; **0 critical, 0 high, 29 moderate, 1 low**. `npm ci` reported the same 30 low/moderate advisories; the gate lists the applicable low/moderate advisory IDs and rejects unapproved high findings.
- `npm ls zod fast-uri`: no `fast-uri` tree; the only Zod found is `zod@4.6.7` beneath the Expo ESLint plugin. No vulnerable Zod 3 path was restored.
- Removed the stale `fast-uri` override and did not extend expired exceptions.
- Removed the incompatible Metro and `brace-expansion` overrides rather than suppressing dependency errors.

## 6. PR compatibility and PR #2 conflict assessment

Current GitHub metadata was read without changing any pull request:

| PR | Current head | Compatibility evidence |
|---|---|---|
| #5 | `9a1208742e478cb4a6004c029009409c49a55c42` | Open and mergeable to its base; its head is not an ancestor of this candidate. The candidate retains the relevant fail-closed audit, ATS, blocked-permission, Android component-removal, and hook-stability protections, with contract/security checks passing. Its package/config/security files overlap and still require explicit final integration review. |
| #6 | `a3e8370505151ba532c68d3731553de10f332fab` | Open and mergeable; its current head is an ancestor of the starting candidate. |
| #7 | `d0222336e88808f48f4573b174e2ddc07cb31f10` | Open and mergeable; its current head is documentation-only, and its code parent `533bc5665ab7f4e4c594dba142ebda2dac339e6d` is an ancestor of the candidate. |

Original PR #2 remains open, at head `4915a269386fa2e0e57ea69fd9974bfbff2e4930` on base `8121869905b3d12599dce8b794436383b18336bf`, and GitHub reports it conflicting. A prior non-mutating merge-tree inspection identified conflicts in `.github/workflows/ci.yml`, `app.json`, `package.json`, `package-lock.json`, and `scripts/security-audit.cjs`. These are reconcilable at the code level while preserving the security configuration and audit gate, but each conflict requires deliberate review; no merge or PR update was performed.

## 7. Remaining blockers and readiness

- Native visual QR framing/overlay acceptance on Android and iOS remains unverified pending authorization for a local signed debug install/build.
- Three contract checks remain skipped until native release artifacts exist.
- PR #2’s five reported merge conflicts and PR #5’s overlapping config/security changes require final merge review.
- No production services were accessed; no merge, deploy, distribution, signed build, or paid EAS build was performed.

**Final verdict:** the SDK 58 incompatibilities and dependency graph issues are corrected, and exact tested source SHA `6b390972bd55522c6d28d9859c07fdb628467f62` is ready for final merge review. This is not native-device acceptance or release approval.
