# Samgamam Mobile — Combined Android/iOS Acceptance (Agent 06)

Date: 2026-11-14 · Role: Android Engineering / Cross-Platform Acceptance · Host: macOS (Apple Silicon), Node 24.22.1, JDK 17.0.19 (Gradle), Maestro CLI

## 1. Source SHAs

| Input | Branch | SHA | Status at start and end of run |
|---|---|---|---|
| Android PR #7 | `feature/mobile-android-readiness` | `533bc5665ab7f4e4c594dba142ebda2dac339e6d` | Draft, open, head unchanged |
| iOS PR #6 | `feature/mobile-ios-readiness` | `a3e8370505151ba532c68d3731553de10f332fab` | Draft, open, head unchanged |
| Merge base | — | `f5e11b4bb60ef2b7ef58d029b6b3ba4879f2cfa7` | PR #6 +7 commits, PR #7 +10 commits |

Neither source branch was updated. Nothing was force-pushed, merged into a PR branch, pushed or deployed. Agent 7's worktrees (`mobile-agent-07`, `mobile-agent-07-int`) were not touched.

## 2. Combined integration candidate

- Worktree: `/Users/vidas/dev/agent-workspaces/mobile-agent-06-int` (agent-owned, disposable)
- Branch: `agents/mobile06-int-pr6-pr7-20261114` (local only, not pushed)

| Commit | Content |
|---|---|
| `59cae1c` (tree `6a50a5c0614a3a7b005fc101114a364fbde574c6`) | `merge --no-ff` of PR #6 into PR #7. Conflict resolution only (see below). |
| `577db7c` | Cross-platform lock/ownership acceptance harness `tests/manual/agent06-cross-platform-lock.cjs` |
| `f9db0ac` | **Regression fix**: iOS history probe sends run id, plus regression test |
| `4565dbe` (tree `a95eab4dde76e9c2ae6435c8711ce812a7d1aec8`) | Supplemental Android Maestro flows `.maestro/agent06/*` |

This document is committed on top of `4565dbe`. All evidence below was produced at `4565dbe` unless a row names another commit.

Merge conflicts and their resolution:
- `package.json`: kept both `test:android:acceptance` (PR #7) and `test:maestro:ios` (PR #6).
- `scripts/testing/run-maestro.mjs`: kept PR #7's fail-closed checks (`MOCK_RUN_ID` is required and the acceptance lock must be owned by this run). Kept PR #6's `SUITES` map (`ios`, `ios-all`) and its `assertOwnedMock(health, process.env.MOCK_RUN_ID)` call. PR #6's weaker "no runId → identity-only" path is now unreachable, because the runId check above it already rejects that case.
- Auto-merged without conflict: `app.json`, `App.tsx`, `src/auth/session.ts`, `src/api/client.ts`, `src/services/notifications.ts`, `src/services/deep-links.ts`, `src/screens/DiscoverScreen.tsx`.

## 3. Android test evidence

| Gate | Command | Result |
|---|---|---|
| Clean install | `npm ci` | exit 0. No `package-lock.json` change from either PR. |
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0: 0 errors, 3 pre-existing `react-hooks/exhaustive-deps` warnings |
| Jest | `jest --runInBand` (real-backend excluded) | **16/16 suites, 243/243 tests passed**, 0 skipped |
| Contracts + security + isolation | `ANDROID_ACCEPTANCE=1 npm run test:contracts` | **84/84 passed, 0 skipped** (before the native build: 77 passed, 4 skipped for "native build not present", at `59cae1c`) |
| Native gate (CI step) | `node --test android-manifest-permissions + android-deep-links` | 8/8 passed |
| Lock/ownership harness | `node tests/manual/agent06-cross-platform-lock.cjs --ios-worktree …` | **15/15 PASS** (§4) |
| Dependency security | `npm run security:audit` | gate passed: critical 0, high 0, moderate 27, low 7 (all deps) |
| | `npm audit --omit=dev` | 20 (19 moderate, 1 low, 0 high/critical). Direct: expo, expo-asset, expo-dev-client, expo-notifications, expo-splash-screen (moderate) |
| Android build | `expo prebuild --clean` + `prepare-android-acceptance.mjs` + `./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a` | BUILD SUCCESSFUL in 2m 27s |
| Full Android Maestro | `npm run test:android:acceptance -- emulator-5580 all` | **12/12 passed** (run 2; run 1 was environmental, see below) |
| PR #6 iOS flows on Android | `npm run test:android:acceptance -- emulator-5580 ios` | 1 passed, 1 failed: platform difference, not a defect (§6.2) |
| Supplemental Android flows | `.maestro/agent06/01,02,03` under `mock-manager exec` | 3/3 passed |

Maestro run 1 (`artifacts/maestro/2026-11-14T20-49-17.690Z`) failed 12/12 at the launch assertion. A screenshot showed the app had rendered Discover with mock data, but a system "Digital Wellbeing isn't responding" ANR dialog covered it on the cold-booted emulator. `.maestro/dismiss-launcher-anr.yaml` handles only Quickstep and System UI dialogs. I disabled `com.google.android.apps.wellbeing` and animations on this read-only emulator only, then reran: 12/12 passed (`artifacts/maestro/2026-11-14T21-02-12.469Z`). Both runs are reported.

Per-flow, run 2: 01_startup, 02_navigation, 03_event_details, 04_search_empty_recovery, 05_empty_groups, 06_signed_out_profile, 07_error_recovery, 08_malformed_recovery, 09_offline_recovery, 10_relaunch, 11_background_recovery, 12_timeout_recovery: all Passed.

Device: dedicated emulator `emulator-5580` (AVD `samgamam_phase9`, API 35 arm64, booted `-read-only -no-snapshot-save`). The pre-existing emulator `emulator-5554` (AVD `pratiksha_test_device`, another project's app in the foreground) was not used, installed to, reversed or stopped. The pre-existing iOS simulator in use by another project was not touched.

### Runtime checklist

| Item | Evidence | Level |
|---|---|---|
| App launch | 01_startup | Emulator runtime |
| Event discovery / details | 01, 03 | Emulator runtime |
| Navigation | 02_navigation | Emulator runtime |
| Android deep links | `samgamam://event|events|notifications` resolve to `.MainActivity`; PR #6 `ios/01_deep_link_event` opens details on Android; three app-level malformed links rejected (agent06/03) with no API request beyond the Discover listing | Emulator runtime + `cmd package query-activities` |
| Auth0 callback activity routing | `samgamam://unconfigured.invalid/android/com.samgamam.mobile/callback` resolves **only** to `com.auth0.android.provider.RedirectActivity`. Host-less `samgamam:///…` and unknown hosts resolve to no activity. | Intent resolution with the **placeholder** Auth0 domain only |
| Offline launch | 09_offline_recovery (signed-out), Jest session cases 10 and 11 (offline launch keeps the stored session and recovers on retry) | Emulator runtime (signed-out) + Jest |
| Session restoration | Jest session case 2 | Jest only (simulated Auth0) |
| Failed refresh recovery | Jest session case 6 | Jest only |
| Concurrent 401 | Jest session case 8 (single shared refresh) | Jest only |
| Logout racing refresh | Jest session cases 14 and 15 (logout wins, late token revoked, no refresh after logout) | Jest only |
| Late 401 after refresh | Jest session case 13, client case 16 | Jest only |
| Notification cold start | Jest: cold-start response consumed (no replay), untrusted payloads rejected | Jest only. No FCM or real notification tap on device. |
| Search keyboard dismissal | agent06/01: Enter submit → keyboard hidden, empty-state "Explore all" visible (screenshot reviewed) | Emulator runtime |
| Discover large font | agent06/02 at `font_scale 2.0`: heading capped, tab labels single-line, Profile reachable. Minor: the search placeholder text is vertically clipped at 2.0×. Non-blocking. | Emulator runtime |
| Background/resume, relaunch | 11_background_recovery, 10_relaunch | Emulator runtime |

## 4. Mock ownership and lock verification

Harness: `tests/manual/agent06-cross-platform-lock.cjs`. L-cases use temp locks and private ports. X-cases use the **real shared lock** `/Users/vidas/dev/projects/samgamammobile/.git/samgamam-acceptance-4318.lock` and port 4318, run from two separate Git worktrees (`mobile-agent-06-int` as Android, `mobile-agent-06-int-ios` as iOS). X-cases self-skip if a foreign lock or listener is present. Final run: 15/15 PASS. L-cases repeated 5× with no failures.

| Case | What was proven |
|---|---|
| L1 concurrent acquisition | 24 processes released by an fs barrier: exactly 1 winner, the others got `[LOCK CONFLICT]`/`[LOCK BUSY]`, valid JSON, no temp leftovers (5/5 repeats) |
| L2 atomic updates | ~1,000 metadata rewrites against ~45–85k concurrent reads: 0 partial-JSON reads, 0 missing-file reads. A foreign-runId update was rejected. |
| L3 stale lock | Dead pids: refused with `[LOCK STALE]` unless `--allow-stale`, then recovered under the recovery guard |
| L4 malformed lock | `[LOCK ERROR]` on acquire and on force-unlock; content preserved |
| L5 recovery vs new foreign owner | Recoverer blocked on the guard while the stale lock was replaced by a live iOS owner → `[LOCK CONFLICT]`, live owner preserved |
| L5b guard timeout | `[LOCK RECOVERY BUSY]`; lock and foreign guard preserved |
| L6 active foreign session | `unlock --force` → `[LOCK ACTIVE]`; wrong `--run-id` → `[LOCK REFUSED]` |
| L7 owner-only cleanup / runId | Control endpoints return 409 with no or a wrong `x-mock-run-id`. Foreign `stop` leaves the mock, lock and owner file intact. Owner reset and stop work. |
| L7b missing runId | CLI `start`/`stop` without a run id exit 1; no lock, no listener |
| L8 crash (supervisor SIGKILL) | The orphaned detached mock keeps the lock **busy** (`[LOCK BUSY]`, force → `[LOCK ACTIVE]`) until `stop --run-id <owner>` |
| L8 crash (supervisor + mock SIGKILL) | `[LOCK STALE]` → explicit recovery succeeds |
| L9 SIGTERM | Supervisor stops only its own mock, releases its lock, exits 1 |
| X1 Android owns 4318 | From the iOS worktree: `ios-acceptance.sh` → `[LOCK BUSY]` (foreign lock preserved); `run-maestro` refused; foreign `stop` is a no-op; `unlock --force` → `[LOCK ACTIVE]`; reset → 409. The Android mock pid and runId were unchanged. Lock released and port free afterwards. |
| X2 iOS owns 4318 | From the Android worktree: `test:android:acceptance` and `android-ci.sh` → `[LOCK BUSY]`; reset → 409; iOS mock untouched |
| X3 history probe | Owned mock: `/__mock/history` without header → 409, with owner header → 200. The iOS probe now sends the run id. |

Both worktrees resolve the same default lock path (via `git rev-parse --git-common-dir`). Every Maestro run in this report ran serially under `mock-manager exec` with a verified, owned lock. After each run the lock was absent and port 4318 was free. No foreign process was signalled and no foreign lock was removed at any point.

## 5. APK build and permissions

- APK: `android/app/build/outputs/apk/release/app-release.apk` (bundled local-acceptance release variant, arm64-v8a, API 36 target, 42,329,308 bytes)
- **SHA-256: `a162c2c04cde4bf921c3a82d96f70618f9ff3fb7b4537809b4e8d72334abf97a`**
- Signing: **Android Debug certificate** (`CN=Android Debug`, cert SHA-256 `fac61745…3b9c`). This is not a release-signed build.
- `aapt2 dump permissions` (actual APK): CAMERA (allowlisted: QR check-in), INTERNET, VIBRATE, RECEIVE_BOOT_COMPLETED, POST_NOTIFICATIONS, ACCESS_NETWORK_STATE, WAKE_LOCK, c2dm RECEIVE, USE_BIOMETRIC, USE_FINGERPRINT, the dynamic-receiver permission, install-referrer, and launcher badge permissions (from libraries).
- **Absent: SYSTEM_ALERT_WINDOW, READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE, RECORD_AUDIO.** The source manifest marks all four `tools:node="remove"`. The merged manifest and APK tests pass.
- Note: this acceptance APK contains the loopback-only cleartext overlay from `prepare-android-acceptance.mjs` and must never be distributed.

## 6. Android/iOS compatibility findings

### 6.1 Defect found and fixed: iOS history probe rejected by the run-owned mock (`f9db0ac`)
PR #6's `.maestro/scripts/assert-no-entity-requests.js` called `GET /__mock/history` without `x-mock-run-id`. PR #7's mock answers every `/__mock/*` endpoint except `/health` with **409** unless the caller presents the owning run id. `mock-manager` always sets one, and PR #6's `ios-acceptance.sh` now requires `mock-manager`. Neither PR fails alone (PR #6's own mock had no run id), but in the combined candidate `.maestro/ios/02_deep_link_rejected.yaml` fails on every iOS run.
- Reproduced: harness X3 on `577db7c`, and with real Maestro on Android: the unfixed probe gives `Mock history failed: 409` (`artifacts/agent06/maestro-agent06-negctl.log`).
- Fix: the probe sends `MOCK_RUN_ID`, as `reset.js` does. New test `tests/security/maestro-mock-run-id.test.cjs` runs every mock-control script against an owned mock (must pass) and with a foreign id (must get 409). It fails on the unfixed script and passes on the fix. The fixed probe passes on Android Maestro.
- **Not re-verified on an iOS simulator.** Agent 7 should rerun `npm run test:maestro:ios` on the combined candidate.

### 6.2 Platform difference (not a defect)
On Android, `samgamam:///event/qa-event` (host-less) is refused by the OS ("unable to resolve Intent"), because MainActivity registers only routed hosts and Auth0 registers only its domain. Maestro's `openLink` therefore fails on Android at that step of `ios/02_deep_link_rejected.yaml`. The outcome is fail-closed and the app never sees the link. The flow is correctly documented as iOS-only. `.maestro/agent06/03_deep_link_rejected_android.yaml` covers the other three rejections on Android.

### 6.3 Shared-file review
| File | PR #6 change | Android effect |
|---|---|---|
| `src/auth/session.ts` | Generation counter and `signingOut` guard; transient vs rejected restore | Compatible. Android launches with no Auth0 in acceptance; Jest 243/243 including PR #7's client tests |
| `src/api/client.ts` | Explicit Authorization not overwritten; 401 clears only the rejected token; `revokeSessionToken` → `/v1/auth/revoke` | Compatible; the endpoint is already in PR #7's contract and mock |
| `src/services/notifications.ts` | Clears the last notification response after cold start | Compatible (optional-chained); device behaviour not verified |
| `src/screens/DiscoverScreen.tsx` | `Keyboard.dismiss()` on submit; heading `maxFontSizeMultiplier=1.6` | Verified on the Android emulator |
| `src/services/deep-links.ts` | Strict parser, https-only allowlisted hosts | Matches PR #7's `with-android-deep-links` routed hosts; Auth0 callback path unaffected |
| `scripts/testing/run-maestro.mjs` | iOS suites + `assertOwnedMock` | Merged; PR #7 fail-closed semantics kept (RUNID-02 passes) |
| `package.json` | `test:maestro:ios` | Merged; no dependency change |

Both platforms' deep-link and session-security fixes are preserved in the merge. Every PR #6 and PR #7 test passes.

### 6.4 Observations (no change made)
- An orphaned detached mock after a supervisor SIGKILL blocks every platform until someone runs `mock-manager stop --run-id <runId from lock>`. This fails closed by design, but no operator runbook step for it was found.
- A caller that reuses another run's exact `runId` "re-acquires" the lock (`existing: true`). Generated ids include the timestamp and pid, so a collision is not practical.
- On refusal, `exec` prints `[LOCK WARNING] … Foreign lock preserved` before the `[LOCK BUSY]` reason. This is correct but can mislead log readers.
- `dismiss-launcher-anr.yaml` does not cover other system ANR dialogs (here, Digital Wellbeing) on cold-booted emulators.

## 7. Regression fixes
Only `f9db0ac` (§6.1): `.maestro/scripts/assert-no-entity-requests.js` (+ regression test). No production source (`src/`, `App.tsx`, native config) was changed.

## 8. Remaining limitations
- **No real Auth0.** The acceptance build has no Auth0 configuration (`unconfigured.invalid` placeholder). Sign-in, session restore, refresh, concurrent 401, logout-vs-refresh and late-401 evidence comes from Jest with simulated Auth0, not from a real tenant on a device.
- **No physical device.** Emulator only (API 35, arm64, swiftshader).
- **No release signing.** The APK is debug-signed. The release keystore and Play signing are unverified.
- **No push delivery.** Notification cold start was verified only in Jest (no FCM token or real notification tap).
- **iOS runtime not rerun** by Agent 06. Only the shared lock path, iOS runner refusals and iOS flow scripts were exercised.
- The npm audit has moderate advisories in Expo packages (no high or critical).

## 9. Commits for Agent 9
Local branch `agents/mobile06-int-pr6-pr7-20261114` (shared object store, not pushed):

```
4565dbe test(agent06): supplemental Android Maestro flows for combined acceptance
f9db0ac fix(maestro): send run id on the iOS no-entity-request history probe   <- required
577db7c test(agent06): cross-platform mock ownership and lock acceptance harness
59cae1c integration(agent06): merge PR #6 a3e8370 into PR #7 533bc56            <- conflict resolution
```
Minimum for integration: the conflict resolution in `59cae1c` (`package.json`, `run-maestro.mjs`) plus `f9db0ac`. `f9db0ac` applies cleanly onto PR #6 (`a3e8370`) on its own, since it touches only the PR #6 probe and adds a test.

## 10. Verdict

**CONDITIONAL. Ready for independent review once these conditions are met:**
1. Fix `f9db0ac` (or an equivalent) is taken into the integration. Without it, PR #6's iOS rejected-link flow fails under PR #7's run-owned mock.
2. Agent 7 or Agent 9 reruns iOS simulator Maestro (`ios-all`) on the combined candidate with the fix applied.

Android on the combined candidate is clean: all static, unit, contract, native and lock gates pass, the full Android Maestro suite passes 12/12, and the cross-platform lock is shown to keep Android and iOS from interfering. Real Auth0, physical-device, push and release-signing acceptance remain open (§8) and are not claimed.
