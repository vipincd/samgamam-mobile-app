# Samgamam mobile testing

The reported Phase 8 suite was for Pratiksha, not this repository. See the independent
Phase 8 audit and Phase 9 acceptance report. The Samgamam suite does not contact paid AI,
Auth0 or production services. The mock binds only to `127.0.0.1:4318` and rejects unknown endpoints.
It has no production credentials and is never imported by the application.

## Local checks

```bash
npm ci
npm run typecheck
EXPO_NO_DOTENV=1 npm run lint
npm test
npm run test:contracts
npm run security:audit
EXPO_NO_DOTENV=1 npx expo-doctor
```

`npm test` includes mocked unit tests, rendered component tests and the real API client
against an ephemeral local HTTP server. `test:contracts` uses Node's native test runner
for mock fault injection and fail-closed audit validation. Existing tests remain in place.

## Build and run Android

Use Java 17 or compatible Java 21, Android SDK 36 and Maestro CLI 2.12.1.
Keep existing generated native edits backed up before regenerating. No `.env.local` is loaded:

```bash
EXPO_NO_DOTENV=1 EXPO_PUBLIC_LOCAL_ACCEPTANCE=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:4318 npx expo prebuild --platform android --no-install
EXPO_NO_DOTENV=1 EXPO_PUBLIC_LOCAL_ACCEPTANCE=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:4318 node scripts/testing/prepare-android-acceptance.mjs
(cd android && EXPO_NO_DOTENV=1 EXPO_PUBLIC_LOCAL_ACCEPTANCE=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:4318 ./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2)
# Linux CI emulator uses x86_64 instead of arm64-v8a.
# Set ANDROID_HOME to the installed Android SDK directory if needed.
adb -s SERIAL install -r android/app/build/outputs/apk/release/app-release.apk
adb -s SERIAL reverse tcp:4318 tcp:4318
npm run test:mock
# Separate terminal:
npm run test:maestro -- SERIAL all
```

Select `smoke` or `regression` instead of `all` when needed. Every flow resets the mock,
clears app state, opens the bundled application and asserts UI outcomes. The runner
requires an explicit device and verifies mock identity before starting. It has a 15-minute
suite timeout. A failed assertion returns nonzero. Reports/screenshots go to timestamped
`artifacts/maestro/` directories. Preserve failure artifacts before rerunning.

On an existing API 35 emulator, if driver installation resets ADB, restore the mock port reverse
and use `MAESTRO_REUSE_DRIVER=1 npm run test:maestro -- SERIAL all` after the driver is installed.
Acceptance builds bundle JS and do not require Metro.

The standalone launch helper is not a test. Only files in smoke/regression are executed.
Reset scripts use Maestro's host HTTP API, so the control service stays on loopback.
Socket closure tests transport recovery; they do not substitute for real airplane-mode testing.
Auth0 browser login is not bypassed or simulated in the application; authenticated flows are
covered at API/session level with local fixtures. Real Auth0 UI and push checks remain blocked
under the Phase 9 local-only testing policy; no staging tenant is used.

## iOS Simulator

```bash
EXPO_NO_DOTENV=1 EXPO_PUBLIC_LOCAL_ACCEPTANCE=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:4318 npx expo prebuild --platform ios --no-install
(cd ios && EXPO_NO_DOTENV=1 pod install)
EXPO_NO_DOTENV=1 EXPO_PUBLIC_LOCAL_ACCEPTANCE=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:4318 xcodebuild \
  -workspace ios/Samgamam.xcworkspace -scheme Samgamam -configuration Release \
  -sdk iphonesimulator -destination 'platform=iOS Simulator,id=SIMULATOR_UUID' \
  -derivedDataPath artifacts/ios-build -jobs 2 \
  CODE_SIGNING_ALLOWED=NO IPHONEOS_DEPLOYMENT_TARGET=15.1 build
xcrun simctl install SIMULATOR_UUID artifacts/ios-build/Build/Products/Release-iphonesimulator/Samgamam.app
# Start mock as above, then:
npm run test:maestro -- SIMULATOR_UUID all
```

The explicit deployment target addresses old pod targets rejected by Xcode 27.2.
Simulator builds do not need distribution signing. Physical iPhone needs an Apple team,
provisioning and a separate review. See `physical-device-checklist.md`.

## CI and release gates

- `ci.yml`: PR/push typecheck, lint, unit/component/client integration, HTTP/security contracts,
  dependency gate, Expo Doctor; 15-minute bound, retained test output.
- `mobile-e2e.yml`: Android build and emulator smoke on PRs; manual full regression, no secrets,
  pinned Maestro version, 40-minute job bound and retained APK/logs/screenshots/JUnit.
- `release-acceptance.yml`: manual only; repeats local checks and requires reviewed JSON for the
  exact selected SHA, including both physical platforms, security, accessibility and authenticated
  device journeys. Configure required reviewers on the `release-acceptance` GitHub environment.
  The checked-in JSON is deliberately blocked. The gate checks attestation completeness; a human
  must verify the linked evidence. It cannot prove a device test from a text claim.
- No workflow deploys, merges, or distributes to stores.

## Separate staging integration (not authorized for Phase 9)

The `test:integration` suite writes RSVP/device state. It now requires `RUN_STAGING_INTEGRATION=1`,
`REAL_BACKEND_URL`, `STAGING_TEST_EMAIL`, `STAGING_TEST_PASSWORD` and an owned `STAGING_TEST_EVENT_ID`.
Do **not** point it at production or run it opportunistically. Use a dedicated staging environment,
explicit opt-in and an owned test identity. No approved staging endpoint was supplied for Phase 9.
Deterministic client integration in `npm test` is the zero-cost default.

References: [Maestro HTTP scripts](https://docs.maestro.dev/maestro-flows/javascript/make-http-requests),
[Expo camera permissions](https://docs.expo.dev/versions/latest/sdk/camera/).

Bundled acceptance APKs use the generated debug signing key, never store credentials.
The Android preparation script creates an ignored release-source overlay permitting HTTP
only to 127.0.0.1. Remove that overlay before any distribution build. Neither acceptance
artifact is approved for distribution. No real authentication or push service is exercised.

## CI launcher ANR and retained diagnostics

API 35 can display an OS-owned `Quickstep isn't responding` dialog over the already rendered
Samgamam app. The launch helper captures and closes only that exact dialog via
`android:id/aerr_close`, then still requires `Search events`. App ANRs and other dialogs are
not dismissed. No smoke or journey assertions were removed.

`android-ci.sh` verifies the mock on both host and emulator loopback, captures reverse mappings,
crash/full logcat and mock history, and returns Maestro's failure status. A failed readiness check
stops the run before UI tests. See [evidence-retention.md](evidence-retention.md) for retention.

Metro 0.83.8 and its companion packages are pinned together to remove the vulnerable image-size
transitive dependency. The security gate allows no high/critical exceptions.
