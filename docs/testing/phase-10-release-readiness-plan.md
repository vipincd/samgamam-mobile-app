# Samgamam Mobile Phase 10 — Real device and release readiness plan

Status: **PLANNED, NOT STARTED**. Baseline: `main` at `f5e11b4` (Phase 9 merge, PR #3).
Phase 9 proved deterministic, mock-only acceptance on an Android emulator (12/12), an iOS
Simulator (12/12) and GitHub Android smoke (2/2). It proves nothing about physical devices,
real authentication, push delivery, signing or store readiness. **Production release
remains NOT APPROVED.** Phase 10 does not deploy, upload to a store, enable production
integrations or create paid infrastructure without separate, explicit owner authorization.

## Authorization gates

Each gate needs a written owner approval (name, date, scope) in this file before work in it begins.

| Gate | Unlocks | Default |
|---|---|---|
| G1 Devices | Physical Android/iPhone testing against the loopback mock | Ready; needs devices only |
| G2 Non-production Auth0 | A dedicated dev/staging Auth0 tenant and seeded test identities | Blocked |
| G3 Non-production backend | A staging API with resettable test data | Blocked |
| G4 Push sandbox | Expo/FCM/APNs sandbox credentials for test devices | Blocked |
| G5 Signing | Apple Developer team, Play upload key, EAS credentials | Blocked |
| G6 Store consoles | Internal testing tracks (Play internal, TestFlight internal) | Blocked |
| G7 Production release | Store submission and production rollout | Blocked until 10.8 passes |

## Carry-over findings from the Phase 9 review

Fix these early. They are small, and several affect store review.

| ID | Finding | Action | Gate |
|---|---|---|---|
| F1 | The merged release manifest requests `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`, none of which the app declares in `app.json`. | Add them to `android.blockedPermissions`, rebuild, and verify the merged manifest with an asset test similar to the RECORD_AUDIO check. | none |
| F2 | iOS `NSAllowsLocalNetworking=true` (Expo default) ships in Release builds. | Set it from `app.config.ts` for production profiles (false) and keep it true only for acceptance/dev. Verify the built `Info.plist`. | none |
| F3 | The Maestro CLI is installed by `curl \| bash` with no integrity check. | Download the pinned 2.12.1 release zip, verify its SHA-256 in the workflow, then unzip. | none |
| F4 | GitHub Actions are pinned by tag, not commit SHA. | Pin `actions/*` and `reactivecircus/android-emulator-runner` to full SHAs; add Dependabot for `github-actions`. | none |
| F5 | `main` has no branch protection or rulesets. | Require the `verify` and `android` checks plus one review on `main`; block force pushes. | owner |
| F6 | Three `react-hooks/exhaustive-deps` warnings (`GroupsScreen` x2, `ProfileScreen`). These are not stale-closure bugs, but out-of-order responses can win. | Add a request-generation guard or `AbortController` per loader, add a test for rapid locale/auth changes, then clear the warnings. | none |
| F7 | `10_relaunch` relaunches without the launcher-ANR handler. | Route the relaunch through the shared `dismiss-launcher-anr.yaml` before running the full suite in CI. | none |
| F8 | 68 moderate and 5 low audit findings, all in build/dev tooling chains. | Triage each: runtime or build-only, fix available, Expo SDK upgrade path. Record the outcome in `security-review.md`. | none |
| F9 | Account deletion is not implemented (an Apple 5.1.1(v) and Google Play requirement). | See 10.6. This is a product and backend dependency. | product |

## Workstreams and exit criteria

### 10.1 Repository hardening (no gate)
Complete F1–F4, F6 and F7, with a regression test for each. Exit: CI green, the merged
manifest and Info.plist evidence are refreshed in `evidence/phase-10/summary/`, and lint
reports 0 warnings.

### 10.2 Android physical-device acceptance (G1)
Devices: at least one low-end device (≤3 GB RAM, Android 10–11), one mid-range device
(Android 13–14) and one current Pixel (Android 15). Run the mock-only acceptance APK
first, then the G2/G3 build when unlocked.
- Installation over USB (`adb -s SERIAL install -r`) and `npm run test:maestro -- SERIAL all`: 12/12 per device.
- Camera and QR: grant, deny, "don't ask again", revoke in Settings, then valid, invalid and duplicate tickets.
- Notifications: POST_NOTIFICATIONS prompt on Android 13+, denial, and re-enabling from Settings.
- Lifecycle: background and foreground, process death (`adb shell am kill`), and rotation if supported.
- Network: airplane mode, Wi-Fi to mobile data handover, a throttled 3G profile, and timeout/retry without duplicate mutations.
- Layout: smallest and largest screens, font scale 2.0, display size "Largest", 3-button and gesture navigation.
- Performance: cold start (`adb shell am start -W`, budget ≤ 2.5 s on mid-range), memory (`dumpsys meminfo`) after 20 navigation cycles, and a battery historian sample over 30 minutes in the background.
- TalkBack: every tab, button and form field has a label; focus order is logical; touch targets are ≥ 48 dp.
Exit: a JUnit report per device, a completed checklist table, zero crashes in `logcat -b crash`.

### 10.3 iPhone physical-device acceptance (G1 + G5 for signing)
Devices: at least one small iPhone (SE/mini class) and one current Pro Max class device, on the oldest supported iOS and the newest.
- Signing: development team, automatically managed provisioning for `com.samgamam.mobile`, and a registered device. Build Release from Xcode or `eas build --profile preview`.
- Camera and permission prompts: purpose text, denial, re-enabling from Settings.
- Navigation and safe areas: notch and Dynamic Island, the home indicator, keyboard avoidance, landscape if supported.
- VoiceOver and Dynamic Type at the largest accessibility size; contrast and Reduce Motion.
- Performance and crashes: Xcode Instruments (Time Profiler, Allocations, Leaks), MetricKit/organizer crash logs, cold start ≤ 2.5 s.
- Maestro physical-iOS support is limited, so execute the 12 journeys manually with screenshots and record them in the checklist.
Exit: a completed checklist per device, no crashes, Instruments traces attached as CI artifacts or retained locally.

### 10.4 Authentication (G2 + G3)
- Provision a non-production Auth0 tenant with a native app and API audience. No client secrets in the app. Store the identifiers as `EXPO_PUBLIC_*` in EAS environment variables for the `preview` profile only.
- Seed test identities: verified member, unverified email, admin/organizer, locked/blocked, and an account to delete.
- Tests: login, cancel, wrong password, MFA if enabled, token expiry and silent refresh (shorten the access-token TTL in the test tenant), refresh-token revocation, logout (local secure-store cleared, `/auth/revoke` called, device unregistered), session persistence across relaunch, and access to protected endpoints after logout returning 401.
- Extend `src/api/client-real-backend.test.ts` to run against the staging API behind an explicit `RUN_STAGING_TESTS=1`, never in default CI.
Exit: every row in the checklist's Auth section passes on both platforms.

### 10.5 Push notifications (G4)
- Sandbox APNs and an FCM test project. Register test devices only.
- Tests: permission granted, denied and later granted; token registration after login; token rotation (reinstall, `addPushTokenListener`); delivery in foreground, background and cold start, each opening the correct destination; logout unregisters, and no notification arrives for a signed-out user.
Exit: a delivery matrix (platform × app state × outcome) with server-side send IDs.

### 10.6 Privacy and GDPR (product + G3)
- Account deletion: an in-app entry point, a confirmation step, and a backend deletion/anonymization job. Required before store submission.
- Data export/access request path, privacy notice link in-app and in store listings, and consent records for event terms (already enforced in the RSVP contract).
- Data minimization: inventory every field sent and stored; confirm logs contain no tokens or PII (grep device logs from 10.2 and 10.3).
- Update `ios/PrivacyInfo.xcprivacy` required-reason APIs; draft the Play Data safety form and the App Store privacy nutrition labels from the inventory.
Exit: deletion works end to end in staging; the privacy inventory is reviewed by the owner.

### 10.7 Store readiness (G5 + G6)
- Android: Play App Signing with an EAS-managed upload key, an AAB from `eas build --profile production`, an internal testing track, target API level compliance, and the Data safety form.
- iOS: a distribution certificate and App Store provisioning profile through EAS credentials, TestFlight internal testing, export compliance (encryption), and the privacy labels.
- Metadata: name, subtitle, description, keywords, support and privacy URLs, age rating, screenshots for each required device size (taken from 10.2 and 10.3 builds with production-like test data), release notes.
- Versioning: `appVersionSource: remote` with `autoIncrement` is already configured; record the version and build number per candidate.
Exit: an internal-track build installed from the store on at least one Android and one iPhone device.

### 10.8 Release attestation (G7)
Fill `docs/testing/release-acceptance.json` for the exact candidate SHA with evidence links
and a reviewer for every check, then run the manual `release-acceptance.yml` workflow.
A passing gate is a prerequisite for the production-release decision, not the decision itself.

## Recommended execution sequence

1. 10.1 hardening (F1–F7) plus F5 branch protection. This needs no external access.
2. 10.2 Android and 10.3 iPhone device runs against the mock-only build (G1), in parallel.
3. Owner approval of G2 and G3, then 10.4 authentication, then 10.6 account deletion and privacy.
4. G4, then 10.5 push.
5. G5 and G6, then 10.7 internal tracks; repeat the 10.2 and 10.3 smoke checks on store-installed builds.
6. 10.8 attestation, then the owner's production-release decision (G7).

## Evidence rules (unchanged from Phase 9)

Record the build SHA, device model, OS, reviewer, date and outcome for every row. Keep raw
screenshots, logs and traces in CI artifacts (14-day retention) or the ignored local archive.
Commit only compact summaries under `docs/testing/evidence/phase-10/summary/`. Never record
an unexecuted check as passed.
