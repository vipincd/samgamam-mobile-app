# Android Readiness, APK Validation and Test Isolation: Agent 6

**Date:** 2026-11-14 · **PR:** #7 `feature/mobile-android-readiness` (Draft) · **Owner:** Agent 6
**Starting HEAD:** `0f52c8e4801f075cea21975194c92c9a068ce16f`
**Code HEAD validated:** `87b1b75` (this report is committed on top of it)
**Verdict:** **CONDITIONAL.** Android acceptance is repeatable on the emulator and test isolation is demonstrated. Release still needs real credentials, a physical device and release signing (§7).

## 1. Android issues fixed

Every issue was reproduced before it was fixed, and each one has a regression test that fails on `0f52c8e`.

| ID | Severity | Defect | Evidence before → after | Regression test |
|---|---|---|---|---|
| AND-DL-1 | P1 | `samgamam://` deep links did not open the app on Android. `react-native-auth0` shares the `samgamam` scheme and strips the host-less filter from `MainActivity`, so only Auth0's `RedirectActivity` (host `unconfigured.invalid`) claimed the scheme. | Before: `pm query-activities … samgamam://events/qa-event` returned *No activities found*, and `am start` reported *unable to resolve Intent*. After: it resolves to `MainActivity` and opens event details. The Auth0 callback still resolves only to `RedirectActivity`. | `tests/security/android-deep-links.test.cjs` (DEEPLINK-01..03) |
| ISO-F1 | P1 | Cross-platform mock state corruption. `/__mock/reset` was unauthenticated, and `run-maestro.mjs` checked only the service name. | Before: an Android-side reset flipped an iOS-owned mock to 503. After: `409 mock_run_mismatch`, and the owner's scenario is unchanged. | RUNID-01, RUNID-02 |
| ISO-F2 | P2 | Lock create and update were non-atomic. Contenders read partial JSON and reported an active lock as `[LOCK ERROR] malformed`. | 539 of 4,144 attempts → 0 (all reported `[LOCK BUSY]`). | ATOMIC-01, ATOMIC-04 |
| ISO-F3 | P1 | Stale-recovery TOCTOU (review 5839080797): a concurrent recoverer deleted a freshly acquired lock. | 8-process stress: 619 of 1,808 acquisitions lost → 0 of 857. | ATOMIC-02, ATOMIC-03 |
| GATE-1 | P2 | The mandatory APK permission gate pinned one historical SHA-256, so every rebuild failed before any permission was inspected. CI never ran it in mandatory mode. | It now records the hash as an attestation and fails on any permission outside a reviewed allowlist with provenance. CI runs it with `ANDROID_ACCEPTANCE=1` after the APK build. | `android-manifest-permissions.test.cjs` |

## 2. Native permissions report (built APK, `aapt2 dump badging`)

**Absent (verified in the binary):** `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, `RECORD_AUDIO`. The expo-camera microphone permission is disabled.

**Runtime (dangerous) permissions on the installed app:** `CAMERA` (QR check-in) and `POST_NOTIFICATIONS`. Both are ungranted after a fresh install.

**Install-time permissions, all transitive and all on the reviewed allowlist (28 in total):**

| Permission | Source (manifest-merger report) | Note |
|---|---|---|
| INTERNET | react-native, react-native-auth0 | required |
| ACCESS_NETWORK_STATE, WAKE_LOCK, c2dm.RECEIVE | firebase-messaging (expo-notifications) | push |
| VIBRATE, RECEIVE_BOOT_COMPLETED, POST_NOTIFICATIONS | expo-notifications | push |
| USE_BIOMETRIC, USE_FINGERPRINT | androidx.biometric via expo-secure-store | **Not used by app code** (no `requireAuthentication`). Normal-level permission. Candidate for `blockedPermissions` after product sign-off. |
| finsky BIND_GET_INSTALL_REFERRER_SERVICE | com.android.installreferrer | transitive |
| 16 launcher badge permissions, READ_APP_BADGE | me.leolin ShortcutBadger (expo-notifications) | vendor badge counts |
| DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION | androidx.core | signature-level self permission |

No permission was removed in this change. The `exp+mobile-app` scheme comes from the expo-dev-client prebuild and is exported on `MainActivity` in release builds. It routes into the same fail-closed parser. Removing it would affect the development workflow, so it is recorded as a follow-up item only.

## 3. APK build result

| Field | Value |
|---|---|
| Build | `expo prebuild --clean` + `prepare-android-acceptance.mjs` + `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a` → BUILD SUCCESSFUL |
| APK | `android/app/build/outputs/apk/release/app-release.apk`, 42,326,828 bytes |
| SHA-256 | `2d3782e8cad751f45a9d881bb8d306cc37b6d4b7915fca393c95b54529f49515` |
| Package / SDK | `com.samgamam.mobile` 1.0.0 (1), target and compile SDK 36, ABI arm64-v8a |
| Signing | **Android Debug certificate** (`CN=Android Debug`). **Not production-signed and not distribution-ready.** |
| Variant | Local acceptance build: loopback API `127.0.0.1:4318`, cleartext allowed only for `127.0.0.1`, Auth0 unconfigured (`.invalid`). |

The APK was not published or uploaded anywhere.

## 4. Emulator and Maestro results

Environment: AVD `samgamam_phase9`, Pixel profile, API 35, arm64, headless emulator on macOS. **No physical device was used.**

| Run | Binary | Result |
|---|---|---|
| `npm run test:android:acceptance -- emulator-5554 all` (fresh uninstall and install) | APK before the deep-link fix | **12/12 passed** (7m 37s) |
| Same command, fresh install, final APK `2d3782e8…` at `87b1b75` | final | **12/12 passed** (4m 38s), runId `android-1794664919525-76659` |

Flows: startup, navigation, event details, search and empty recovery, empty groups, signed-out profile, 503 recovery, malformed JSON, offline recovery, relaunch, background/resume, 504 timeout. The scenario switches go through the run-id-gated reset, which proves the `maestro -e MOCK_RUN_ID` → `reset.js` header path end to end.

**Deep links (final APK, adb `VIEW` intent):**
- `samgamam://events/qa-event` opens event details ("A deterministic gathering…").
- `samgamam://groups` opens Groups.
- `samgamam://events/%3Cscript%3E` is handled safely; the app stays alive.
- `samgamam://evil/...` does not resolve to the app.
- Crash buffer: 0 entries.

**Not exercised on Android in this pass:**
- **QR scanner:** no mock flow exists. Camera permission denial is only covered by Jest.
- **Session expiry and refresh:** Jest only, in `src/auth/session.test.ts` and `src/api/client.test.ts`.
- **Live Auth0 login:** blocked on credentials.

## 5. Shared test-lock evidence

- **Unit and integration:** `npm run test:contracts` → **74/74 pass, 0 skipped** with native artifacts present, including LOCK-01..12, CLEANUP-01..11, UNLOCK-01..09, ATOMIC-01..04 and RUNID-01..02.
- **Live cross-worktree run 1 (Android owner):** while the Android suite held `<git-common-dir>/samgamam-acceptance-4318.lock`:
  - `mock-manager start --platform ios`, run from the iOS worktree's cwd, failed with `[LOCK BUSY] … held by android session`.
  - `unlock --force` failed with `[LOCK ACTIVE] … runnerPid 17866`.
  - A foreign reset got `409 mock_run_mismatch`.
  - The lock was unchanged.
- **Live cross-platform run 2 (iOS owner, real Agent 7 run):** Agent 7's iOS suite (`mock-manager exec --platform ios`, runId `ios-1794664432-15678`) held the lock.
  - My Android run failed closed with `[LOCK BUSY] … held by ios session` and logged `Foreign lock preserved`.
  - The iOS mock and runner were not signalled.
  - After the iOS run released the lock at 14:01:53Z, the Android suite acquired it and passed 12/12.
- **Cleanup:** after every run the lock file was gone, port 4318 was free and no temp or guard files were left. Each test fixture uses its own `mkdtemp` directory.

## 6. Validation commands (final code)

| Command | Result |
|---|---|
| `npm ci` | exit 0 |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0, 0 errors (3 existing `exhaustive-deps` warnings) |
| `npm test` | 190/190 |
| `npm run test:contracts` (`ANDROID_ACCEPTANCE=1`) | 74/74, 0 skipped |
| `npm run security:audit` | gate passed: critical 0, high 0, moderate 27, low 7 |

## 7. Remaining hardware and credential blockers

1. A physical Android device has not been tested, including the camera and QR scanning hardware.
2. Live Auth0 tenant login, refresh and logout need authorized tenant credentials. If the Auth0 custom scheme is ever changed, the tenant callback URLs must be changed too.
3. Release signing is missing. The keystore and Play Console configuration are intentionally absent.
4. Live RSVP and database mutations need a staging environment.
5. The account-deletion UI (store requirement) is still not implemented.
6. GitHub CI on PR pushes runs the smoke suite only. The full regression above was run locally on the emulator.

## 8. Agent 7 handoff

See [`agent-6-to-agent-7-lock-handoff.md`](agent-6-to-agent-7-lock-handoff.md) for the exact protocol, entry points, diagnostics and the files to adopt. Key points for iOS:
- Send `x-mock-run-id` on `/__mock/*` requests. The shared `reset.js` already does this when Maestro is started by `run-maestro.mjs`.
- When merging, keep the Android `blockedPermissions` list. `feature/mobile-ios-readiness` predates it.
- iOS is not affected by AND-DL-1, because the scheme stays in `CFBundleURLSchemes`.
