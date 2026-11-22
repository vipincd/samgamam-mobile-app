# Samgamam Mobile Phase 10 — Real device and release readiness plan

Status: **IN PROGRESS — CODE-ONLY SDK 58 MERGED; RELEASE NOT APPROVED.** The original Phase 9 baseline was `main` at `f5e11b4` (PR #3).
On 2026-11-22 PR #8 was merged into `main` at `ce213fa44d1c621979a3286def59690ab339ff11`, from reviewed PR head `d70732cf38e80ea77c094db3c17bb64a0b1bc0fd`.
GitHub Mobile CI run `43988736177` and Android deterministic acceptance run `43988735970` succeeded on that PR head. The 2026-11-22 Antigravity review reported 266/266 Jest tests passing, 85 contract/security checks passing (4 native-artifact checks skipped locally), and zero lint/typecheck errors. Its latest Expo Doctor check was 19/20 because newer SDK 58 patch versions were published; this needs reconciliation before claiming a current fully-green local preflight.
**2026-11-22 independent audit of `main` at `ce213fa`:** Mobile CI on `main` (run `45029955435`) fails at Expo Doctor on that patch drift. The iOS **native** Release build also fails: under the SDK 58 scene template, react-native-auth0 5.11.0 injects an `application(_:open:options:)` override that does not compile. CI only exports the iOS JS bundle, so it never compiled this. The two are fixed together with a `/e/{eventId}` deep-link contract gap in PR #9 (`fix/sdk58-patch-alignment`, head `7094f0d`, open, not merged). At that SHA: Expo Doctor 20/20, Jest 267/267, contracts 102/102, Android Maestro 12/12 on an Android 15 emulator, and an iOS Release simulator build with Maestro `ios-all` 14/14 on iPhone 17 Pro / iOS 26.5. Simulator and emulator only; no physical device was used.
PR #5's SDK 54-era release-hardening safeguards were confirmed represented in #8 and PR #5 was closed as superseded; its historical security review remains in the PR history. Phase 9 simulator and SDK 58 emulator evidence is **not** physical-device acceptance. Real authentication, push delivery, privacy/store compliance, signing, and production release remain **NOT APPROVED**. This document does not authorize deployment, paid builds, tenant creation or store submission.

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
| F1 | Android merged release manifest included `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE`. | **CODE-LEVEL DONE in PR #8:** blocked permissions and native manifest checks; recheck real release APK on final signed candidate in 10.7. | none |
| F2 | iOS `NSAllowsLocalNetworking=true` could ship in Release builds. | **CODE-LEVEL DONE in PR #8:** production/preview/staging ATS deny local networking in config tests; verify final signed IPA `Info.plist` in 10.7. | none |
| F3 | The Maestro CLI is installed by `curl \| bash` with no integrity check. | Download the pinned 2.12.1 release zip, verify its SHA-256 in the workflow, then unzip. | none |
| F4 | GitHub Actions are pinned by tag, not commit SHA. | Pin `actions/*` and `reactivecircus/android-emulator-runner` to full SHAs; add Dependabot for `github-actions`. | none |
| F5 | `main` has no branch protection or rulesets. | Require the `verify` and `android` checks plus one review on `main`; block force pushes. | owner |
| F6 | Three `react-hooks/exhaustive-deps` warnings (`GroupsScreen` x2, `ProfileScreen`). | **DONE in PR #8:** request-generation/cancellation guards and race tests; 2026-11-22 lint check had 0 warnings. | none |
| F7 | `10_relaunch` relaunches without launcher-ANR handling. | **DONE in PR #8:** uses `dismiss-launcher-anr.yaml` and asserts the Samgamam app itself has not crashed/ANRed. | none |
| F8 | Moderate/low dependency advisories required triage. | **CODE-LEVEL DONE in PR #8:** audit gate remains fail-closed for high/critical; 2026-11-22 review reported 0 critical, 0 high, 27 moderate, 0 low (`glob`/`minimatch` tooling). Residual advisories need explicit owner assessment before release. | none |
| F9 | Account deletion is not implemented (Apple 5.1.1(v) and Google Play requirement). | **OPEN — STORE SUBMISSION BLOCKER:** implement and verify in-app deletion plus backend erasure in staging. See 10.6. | product |

## Workstreams and exit criteria

### 10.1 Repository hardening (no gate)
**Completed at code level in PR #8:** F1, F2, F6, F7 and F8. **Still open (re-verified 2026-11-22):** F3 (verified Maestro installer), F4 (pin GitHub Actions to full SHAs and Dependabot; no `.github/dependabot.yml` exists), F5 (owner-enabled branch protection; the GitHub API reports `main` as not protected, with no rulesets). Do not mark 10.1 complete until these are addressed, current Expo Doctor patch drift is reconciled and CI is green on the resulting HEAD. Confirm final native release manifest and iOS `Info.plist` in the signed-build workstream (10.7).

### 10.2 Android physical-device acceptance (G1)
Devices: at least one low-end device (≤3 GB RAM, Android 10–11), one mid-range device
(Android 13–14) and one current Pixel (Android 15). Run the mock-only acceptance APK
first, then the G2/G3 build when unlocked.
- Installation over USB (`adb -s SERIAL install -r`) and `npm run test:android:acceptance -- SERIAL all`: 12/12 per device. (Plain `npm run test:maestro` refuses to start without the mock-manager run ID; the acceptance wrapper takes the 4318 lock, starts the owned mock and runs `adb reverse tcp:4318 tcp:4318`, so the device must stay on USB.)
- The acceptance APK is signed with the generated debug keystore. It is for G1 only and must never be shared outside the test group or uploaded to a store.
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
- Backend reachability: acceptance builds are pinned to `http://127.0.0.1:4318`, which on a physical iPhone is the phone itself; iOS has no `adb reverse`. A mock-only iPhone run therefore cannot reach the Mac's mock. Either run 10.3 against the G3 staging API, or get owner approval for a separately reviewed LAN-mock acceptance mode. Do not loosen the loopback pin silently.
Exit: a completed checklist per device, no crashes, Instruments traces attached as CI artifacts or retained locally.

### 10.4 Authentication (G2 + G3)
- Provision a non-production Auth0 tenant with a native app and API audience. No client secrets in the app. Store the non-production identifiers as `EXPO_PUBLIC_AUTH0_DOMAIN`, `EXPO_PUBLIC_AUTH0_CLIENT_ID` and `EXPO_PUBLIC_AUTH0_AUDIENCE` (all three or none; `app.config.ts` rejects partial sets) plus `EXPO_PUBLIC_API_URL` in the EAS `preview` environment only. The production tenant's values go in the `production` environment at G7; production builds fail without all three. These values are public identifiers: never put a client secret, Management API token or `AUTH0_*` server variable in any `EXPO_PUBLIC_*` variable.
- Tenant application settings: Native application type, refresh-token rotation on, `offline_access` allowed (the app requests `openid profile email offline_access`), and these exact Allowed Callback and Logout URLs:
  `samgamam://{domain}/ios/com.samgamam.mobile/callback` and `samgamam://{domain}/android/com.samgamam.mobile/callback`. `EXPO_PUBLIC_AUTH0_AUDIENCE` must equal web staging's `AUTH0_API_AUDIENCE`, and the domain must match its `AUTH0_ISSUER_BASE_URL`, or `/api/v1/auth/session` rejects every token.
- Seed test identities: verified member, unverified email, admin/organizer, locked/blocked, and an account to delete.
- Tests: login, cancel, wrong password, MFA if enabled, token expiry and silent refresh (shorten the access-token TTL in the test tenant), refresh-token revocation, logout (local secure-store cleared, `/api/v1/auth/revoke` called, `DELETE /api/v1/devices/register` called), session persistence across relaunch, and access to protected endpoints after logout returning 401.
- Cookie jar: `/api/v1/auth/session` also sets the web session cookie, and native networking may persist it. Sign out while offline (so revocation cannot be delivered), go back online, relaunch, and confirm `GET /api/v1/me` is anonymous and the app shows signed-out.
- Identity consistency: the same Auth0 user signed in on web and mobile maps to one Samgamam account (same user ID in `/api/v1/me`); test the unverified-email (`email_not_verified`), suspended (`account_suspended`) and social-link conflict (`social_account_conflict`, `social_link_confirmation_required`) responses.
- Extend `src/api/client-real-backend.test.ts` to run against the staging API behind an explicit `RUN_STAGING_TESTS=1`, never in default CI.
Exit: every row in the checklist's Auth section passes on both platforms.

### 10.5 Push notifications (G4)
- Sandbox APNs and an FCM test project. Register test devices only.
- Android prerequisite: the app has no `android.googleServicesFile` today, so Expo push tokens cannot be issued on standalone Android builds. Add the FCM test project's `google-services.json` and upload its FCM V1 service-account key to EAS credentials. iOS needs an APNs key in EAS credentials (push entitlement). Samgamam Web staging sends through `ExpoPushProvider`; record its send IDs.
- Tests: permission granted, denied and later granted; token registration after login; token rotation (reinstall, `addPushTokenListener`); delivery in foreground, background and cold start, each opening the correct destination; logout unregisters, and no notification arrives for a signed-out user.
Exit: a delivery matrix (platform × app state × outcome) with server-side send IDs.

### 10.6 Privacy and GDPR (product + G3)
- Account deletion: an in-app entry point, a confirmation step, and a backend deletion/anonymization job. Required before store submission.
- Data export/access request path, privacy notice link in-app and in store listings, and consent records for event terms (already enforced in the RSVP contract).
- Data minimization: inventory every field sent and stored; confirm logs contain no tokens or PII (grep device logs from 10.2 and 10.3).
- Declare required-reason APIs in `app.json` under `expo.ios.privacyManifests` (`/ios` is generated by prebuild and git-ignored, so edits to `ios/PrivacyInfo.xcprivacy` are lost), then check the generated file in the signed IPA; draft the Play Data safety form and the App Store privacy nutrition labels from the inventory.
- Samgamam Web already exposes `/api/auth/delete-account` and `/api/v1/me/export`; the mobile app calls neither today. Acceptance must cover step-up/confirmation, the session being revoked on every device after deletion, and the queued Auth0 erasure completing.
Exit: deletion works end to end in staging; the privacy inventory is reviewed by the owner.

### 10.6a Links and invitations (G3 + G5)
Added by the 2026-11-22 audit; these were not covered above.
- Universal links / App Links: the app has no `ios.associatedDomains` and no Android `autoVerify` HTTPS intent filter, so `https://samgamam.com` links open the browser, not the app. Web serves `/.well-known/apple-app-site-association` (claims `/e/*`, needs `IOS_APP_TEAM_ID`) and `/.well-known/assetlinks.json` (needs `ANDROID_APP_SHA256_FINGERPRINTS`, which must include the Play App Signing key and the preview keystore). Exit: tapping `https://samgamam.com/e/{eventId}` on each device opens that event in the installed app, and falls back to web when it is not installed.
- Invitations: web has `/invites/{inviteId}` and `/api/invites`; the app has no invitation screen or route. Decide whether invitations are in scope for the first release. If they are, add the route and accept, decline and expired-invite tests. If they are not, record that invite links open web.
- Custom-scheme links (`samgamam://events/{id}`, `samgamam://groups/{id}`) from QR codes and notifications: cold start, warm start and signed-out (sign in, then land on the target).

### 10.6b Preview distribution (G5, no store)
- Android: `eas build --profile preview` must produce an installable APK signed with an EAS-managed (non-debug) keystore. Confirm the artifact type, or set `android.buildType: "apk"` on the preview profile. Record its SHA-256 certificate fingerprint for `assetlinks.json`.
- iOS: an ad-hoc build needs every tester's UDID registered in the Apple Developer team; otherwise use TestFlight internal testing (G6).
- Preview must use `APP_ENV=preview` (no local networking in ATS) and a staging HTTPS `EXPO_PUBLIC_API_URL`. Never point preview at production.

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

1. Finish the open 10.1 safeguards F3 and F4; owner enables F5 branch protection. Merge PR #9 (SDK 58 patch alignment and iOS build fix) so `main` is green. Add a CI job that compiles the iOS app natively (macOS runner minutes are billed, so the owner approves it); until then, record a local iOS Release simulator build for every candidate SHA. F1/F2/F6/F7/F8 were completed at code level by PR #8; don't silently re-open or mark real-device checks complete.
2. 10.2 Android device runs against the mock-only build (G1). The 10.3 iPhone mock-only run is not possible as built (see 10.3); schedule it with G3.
3. Owner approval of G2 and G3, then 10.4 authentication, 10.3 on staging, 10.6 account deletion and privacy, and 10.6a links and invitations. 10.6b preview distribution needs G5.
4. G4, then 10.5 push.
5. G5 and G6, then 10.7 internal tracks; repeat the 10.2 and 10.3 smoke checks on store-installed builds.
6. 10.8 attestation, then the owner's production-release decision (G7).

## Evidence rules (unchanged from Phase 9)

Record the build SHA, device model, OS, reviewer, date and outcome for every row. Keep raw
screenshots, logs and traces in CI artifacts (14-day retention) or the ignored local archive.
Commit only compact summaries under `docs/testing/evidence/phase-10/summary/`. Never record
an unexecuted check as passed.
