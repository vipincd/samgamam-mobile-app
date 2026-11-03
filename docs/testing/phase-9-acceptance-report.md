# Samgamam Mobile Phase 9 acceptance report

Date: 2026-11-03 (Europe/Berlin). Branch: `feature/phase-9-mobile-release-acceptance`.
This report belongs to the commit containing it; tested native artifact SHA-256 hashes are in
[evidence/phase-9/continuation/build-sha256.json](evidence/phase-9/continuation/build-sha256.json).

## Verdict

**PASS for the supported local deterministic engineering acceptance scope. NOT APPROVED for production release.**
All 12 existing Samgamam Maestro flows executed and passed on both platforms. No UI assertion
was weakened and no unexecuted physical/authentication/push check is counted as passing.
The existing Phase 9 work was continued, not recreated. No merge or deployment was performed.

## Final results

| Check | Passed | Failed / remaining |
|---|---:|---|
| Android Maestro (2 smoke + 10 regression) | 12 | 0 |
| iOS Maestro (same flows) | 12 | 0 |
| Jest unit/component/local HTTP integration | 176 (15 suites) | 0 |
| HTTP/security contracts | 15 | 0 |
| Typecheck | PASS | 0 errors |
| ESLint | PASS | 0 errors; 3 existing hook dependency warnings |
| Expo Doctor | 18 | 0 |
| Android bundled acceptance Release APK | PASS | Local debug-key signing; not store distribution |
| iOS bundled acceptance Release Simulator app | PASS | CODE_SIGNING_ALLOWED=NO; not physical iPhone/archive signing |
| npm exception-aware security gate | PASS with exceptions | Raw audit fails: 0 critical, 1 high, 68 moderate, 5 low |
| Release attestation gate | Correctly BLOCKED | Physical platforms, authenticated UI, accessibility review and release approval incomplete |

Android: `samgamam_phase9`, emulator-5556, Android 15/API 35, arm64.
iOS: iPhone 17 Pro, iOS 26.5 Simulator, UUID `4399342B-BBCF-4FD3-A868-889CA3EB7791`.
Maestro 2.12.1; Node 24.22.1; Xcode 27.2 SDK. Android duration 93.134 seconds;
iOS duration is recorded exactly in its JUnit report. Suites ran sequentially against the shared mock.

| Flow | Android | iOS |
|---|---|---|
| 01_startup | PASS | PASS |
| 02_navigation | PASS | PASS |
| 03_event_details | PASS | PASS |
| 04_search_empty_recovery | PASS | PASS |
| 05_empty_groups | PASS | PASS |
| 06_signed_out_profile | PASS | PASS |
| 07_error_recovery | PASS | PASS |
| 08_malformed_recovery | PASS | PASS |
| 09_offline_recovery | PASS | PASS |
| 10_relaunch | PASS | PASS |
| 11_background_recovery | PASS | PASS |
| 12_timeout_recovery | PASS | PASS |

## Changes and defects resolved

- Replaced fragile development-launcher navigation with standalone bundled acceptance builds.
  The actual app UI still runs. Metro is no longer a UI-test prerequisite. Its local status endpoint
  and selected-device port mappings were checked and recorded in `connectivity.json`.
- Added explicit `EXPO_PUBLIC_LOCAL_ACCEPTANCE=1`: only `http://127.0.0.1:4318` is allowed.
  Build configuration rejects production mode, external endpoints and any Auth0 configuration.
  Normal release HTTPS restrictions remain covered. Android's generated acceptance overlay permits
  cleartext only to 127.0.0.1, with subdomains disabled; do not ship this test overlay/artifact.
- Selected the dedicated Android serial, restored its mock reverse mapping and reused the installed
  Maestro driver. All 12 final flows completed without ADB loss; the unrelated Pratiksha emulator was untouched.
- Corrected `community.png` (actually JPEG bytes) to `community.jpg` and updated the import.
  Bundled Android resources now compile. Removed the obsolete generated PNG from the incremental output.
- Preserved earlier Phase 9 fixes for signed-in notification synchronization, field accessibility,
  Auth0 native placeholders when unconfigured, microphone removal, and fail-closed audit handling.
- Configured the Jest Expo transform to preserve environment variables, so tests can exercise both
  acceptance opt-in and normal release restrictions. Production bundling still inlines public variables.
- Updated Android CI to build/run the bundled mock-only acceptance APK; no deployment workflow added.

## Failed attempts retained

Initial Android release build failed because of mislabeled JPEG data. The next incremental build
reported a stale duplicate generated PNG. Native lint then caught a missing `includeSubdomains`
attribute in the new network configuration; it was fixed without disabling lint.
The first bundled Android UI attempt failed startup because normal release HTTPS enforcement rejected
loopback HTTP. That run was stopped after diagnosis: one completed failed flow, an interrupted next
flow, and remaining flows unexecuted. It is not counted as a successful suite. Crash logs, screenshots
and commands remain in `android-maestro-http-failure/` and `android-release-http-crash.log`.
A unit-test attempt failed five new environment tests due to Expo/Jest variable inlining; the transform
was corrected and the full final suite passed. Earlier development-launcher failures remain in the
pre-continuation evidence. Final counts refer only to the final complete runs, not cumulative attempts.

## Privacy verification

The merged Android Release manifest excludes `android.permission.RECORD_AUDIO`.
The built iOS app has the camera purpose string, no `NSMicrophoneUsageDescription`,
`NSAllowsArbitraryLoads=false`, and `NSAllowsLocalNetworking=true`.
The aggregated privacy manifest declares no tracking and no collected data types, with required-reason
API entries for file timestamps, user defaults, disk space and boot time. This is a configuration audit,
not a claim that physical permission UX or store privacy disclosures have been approved.
See `android-privacy.json` and `ios-privacy.json`.

## Security and remaining blockers

See [security-review.md](security-review.md) for all nine unique advisory records and their links.
Two image-size high-severity advisories share one affected dependency entry. The existing exceptions
expire **2026-11-15**, unchanged. Patched 2.x exists but differs from Metro's callable 1.x API;
only reviewed repository assets may enter the build pipeline. node-forge is 1.4.2 and its obsolete
exception was removed. Moderate/low dependency findings remain; the raw audit is not clean.

Physical Android/iPhone checks are NOT EXECUTED: no authorized physical target/provisioning was available.
Camera hardware/QR scanning, permission denial/revocation, real airplane-mode recovery, low-end performance,
TalkBack/VoiceOver, large fonts and physical layouts remain pending. Real Auth0 login/session UI,
authenticated user journeys and real push delivery were not run under the user's local-only policy.
Local API/session/notification unit coverage does not substitute for those UI checks. No staging,
production backend, real Auth0 account, paid API or real push service was used.
Existing product gaps (including account deletion) remain as documented in the physical-device checklist.
The checked-in release attestation intentionally remains blocked and is not a fabricated approval.

## Evidence and reproduction

[Machine-readable final results](evidence/phase-9/continuation/verified-results.json),
[Android JUnit](evidence/phase-9/continuation/android-maestro/results.xml),
[iOS JUnit](evidence/phase-9/continuation/ios-maestro/results.xml).
Each platform's directory contains all 12 named screenshots, command records, Maestro execution logs
and available native device logs. Build logs: `android-acceptance-build.log`, `ios-acceptance-build.log`.
Local logs: `unit-verified.log`, `jest-verified.json`, `contracts-verified.log`, `typecheck-verified.log`,
`lint-verified.log`, `doctor-verified.log`, `security-final.log`, `audit.log`.
All paths in this paragraph are relative to `evidence/phase-9/continuation/`.
Exact reproducible build/install/run commands are in [README.md](README.md).
