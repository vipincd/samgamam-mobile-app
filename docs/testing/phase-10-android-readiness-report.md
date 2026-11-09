# Samgamam Mobile Phase 10A Android Readiness & Acceptance Report

**Date:** 2026-11-09 (Europe/Berlin)  
**Branch:** `feature/mobile-android-readiness`  
**Base Commit SHA:** `f5e11b4bb60ef2b7ef58d029b6b3ba4879f2cfa7`  
**Developer:** C — Android Engineering  
**Role:** Principal React Native Engineer, Senior Android/Kotlin Engineer, Mobile Security Architect, Mobile Test Automation Engineer, Accessibility & Performance Engineer, Independent Android QA Auditor  

---

## 1. Executive Summary & Verdict

- **Overall Android Verdict:** **PASS (Local Deterministic Acceptance & Release Readiness Scope)**
- **Production Store Publication & Deployment:** **NOT AUTHORIZED / NOT APPROVED FOR PRODUCTION RELEASE**
- **Native Android Build Validation:**
  - Debug APK (`app-debug.apk`): Built successfully via Gradle 8.14.3 / AGP 8.11.0 / Kotlin 2.1.20 / Java 17. SHA-256: `8fa64fabc5dc333441c33ca66a6ce4c7dcc597530308b77be05f4a44188ef959` (61,287,908 bytes).
  - Standalone Acceptance Release APK (`app-release.apk`): Built successfully with Hermes bytecode, full R8/resource shrinking, and acceptance loopback network security. SHA-256: `8da579f206b2f2927c138e64e50d5e5f4a7fbde98aab236ac3e1c578743df478` (42,326,580 bytes).
- **Automated Test Results:**
  - Maestro E2E Acceptance (Android 15 API 35 `samgamam_phase9` on arm64-v8a): **12/12 flows passed** (0 failures, total runtime 315.944s).
  - Jest Unit & Integration Test Suites: **15 suites, 176 tests passed** (0 failures).
  - Security & HTTP Contract Tests: **20 tests passed** (including new Android manifest permission security gate).
  - TypeScript Typecheck (`tsc --noEmit`): **0 errors**.
  - ESLint (`expo lint`): **0 errors** (3 existing hook dependency warnings).
  - Expo Doctor (`npx expo-doctor`): **18/18 checks passed**.
  - Security Audit Gate (`scripts/security-audit.cjs`): **0 critical, 0 high, 26 moderate, 7 low**.

---

## 2. Baseline Architecture & Environment Verification

```text
Repository: vipincd/samgamam-mobile-app
Default branch: main
Base SHA: f5e11b4bb60ef2b7ef58d029b6b3ba4879f2cfa7
React Native version: 0.81.5 (React 19.1.0, Expo SDK 54.0.37, Fabric/TurboModules New Architecture enabled)
Android Gradle Plugin version: 8.11.0
Gradle version: 8.14.3
Kotlin version: 2.1.20
Java version: 17.0.19-amzn (Amazon Corretto 17.0.19 LTS)
Compile SDK: 36 (Android 16 preview)
Target SDK: 36 (Android 16 preview)
Minimum SDK: 24 (Android 7.0 Nougat)
Android package identifier: com.samgamam.mobile
Authentication provider: Auth0 (react-native-auth0 5.11.0, custom redirect scheme: samgamam)
API configuration: Canonical: https://samgamam.com (Allowed: samgamam.com, api.samgamam.com; Acceptance Mock: http://127.0.0.1:4318)
Existing tests: Jest (15 suites, 176 tests), Contract tests (20 tests), Maestro (12 flows)
Known blocked features: Physical biometric sensor testing, physical camera QR scanning, store billing, real Auth0 tenant interactive login
```

---

## 3. Findings & Remediations

### Finding 1: Unintentional Android Permission Requests in Generated Release Manifest
- **Severity:** High (Play Store policy violation & attack surface expansion).
- **Detail:** Merged Android manifest generated during prebuild inherited `android.permission.SYSTEM_ALERT_WINDOW`, `android.permission.READ_EXTERNAL_STORAGE`, and `android.permission.WRITE_EXTERNAL_STORAGE` from transitive library modules without explicit declarations in `app.json`.
- **Fix:** Added `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, and `WRITE_EXTERNAL_STORAGE` to `android.blockedPermissions` in `app.json` alongside `RECORD_AUDIO`. Regenerated prebuild and verified that `tools:node="remove"` is injected for all four blocked permissions.
- **Verification:** Added automated contract test `tests/security/android-manifest-permissions.test.cjs` asserting blocked permissions are stripped and `aapt2 dump badging` confirms zero presence in `app-release.apk`.

### Finding 2: Android Quickstep & SystemUI ANR Stalls in Maestro Acceptance
- **Severity:** Medium (E2E acceptance test flakiness on Android 15 emulators).
- **Detail:** On Android 15 (API 35), system cold boot or app relaunch can display an OS-level "System UI isn't responding" or "Quickstep isn't responding" prompt over the app window. Maestro flows previously matched only `"Quickstep isn't responding"`.
- **Fix:** Updated `.maestro/dismiss-launcher-anr.yaml`, `.maestro/launch.yaml`, and `.maestro/regression/10_relaunch.yaml` to detect either OS dialog and dismiss it via `android:id/aerr_close` without altering app logic or dismissing any app-level error.
- **Verification:** `01_startup` and `10_relaunch` executed cleanly and passed in 26s each.

### Finding 3: Predictive Back Navigation Collision in Flow 04
- **Severity:** Medium (E2E test defect).
- **Detail:** In `.maestro/regression/04_search_empty_recovery.yaml`, an explicit `- hideKeyboard` command dispatched an `input keyevent 4` (BACK) when the soft keyboard was not open. On Android 15 with predictive back gestures, this exited the app to the launcher, causing subsequent Search assertions to fail.
- **Fix:** Removed the redundant `- hideKeyboard` step since the app search submit button is fixed in the header and not obstructed.
- **Verification:** `04_search_empty_recovery` passed in 31s with full empty search and explore-all recovery validation.

### Finding 4: Mock Server Port Contention in CI
- **Severity:** Low (Test infrastructure reliability).
- **Detail:** If an existing test session or process held loopback port 4318, subsequent test runs failed with `EADDRINUSE`.
- **Fix:** Added port reclamation (`lsof -ti :4318 | xargs kill -9`) to `scripts/testing/android-ci.sh` before spawning the mock server, and added request logging to `scripts/testing/mock-api.cjs`.

---

## 4. Maestro Acceptance Suite Matrix

Tested on Android Virtual Device: `samgamam_phase9` (Google Pixel 6 emulation, Android 15.0 / API 35, `arm64-v8a`, screen resolution 1080x2400 at 420 dpi).

| Flow Filename | Description | Result | Duration |
|---|---|:---:|:---:|
| `.maestro/smoke/01_startup.yaml` | Cold start, splash dismissal, event list render, profile tab visible | **PASS** | 25.7s |
| `.maestro/smoke/02_navigation.yaml` | Tab switching (Events -> Groups -> Help -> Profile -> Events) | **PASS** | 57.2s |
| `.maestro/regression/03_event_details.yaml` | Event list item selection, detail view modal, terms display, close | **PASS** | 46.6s |
| `.maestro/regression/04_search_empty_recovery.yaml` | Search input, zero-result empty state, "Explore all" reset | **PASS** | 30.5s |
| `.maestro/regression/05_empty_groups.yaml` | Empty community groups scenario, truthful empty feedback | **PASS** | 18.5s |
| `.maestro/regression/06_signed_out_profile.yaml` | Unauthenticated profile, sign-in CTA, language toggle, legal links | **PASS** | 15.2s |
| `.maestro/regression/07_error_recovery.yaml` | 503 service unavailable error handling, retry CTA | **PASS** | 15.8s |
| `.maestro/regression/08_malformed_recovery.yaml` | Malformed JSON response resilience, parse error recovery | **PASS** | 18.0s |
| `.maestro/regression/09_offline_recovery.yaml` | Offline transport closure, offline banner, automatic reconnection | **PASS** | 18.2s |
| `.maestro/regression/10_relaunch.yaml` | App restart, state restoration, session preservation | **PASS** | 26.4s |
| `.maestro/regression/11_background_recovery.yaml` | App backgrounding and foregrounding, state retention | **PASS** | 20.6s |
| `.maestro/regression/12_timeout_recovery.yaml` | 504 gateway timeout handling, client-side abort, retry | **PASS** | 23.1s |
| **Total** | **12 Flows** | **12 / 12 PASS** | **315.9s (5m 16s)** |

---

## 5. Security & Privacy Audit Summary

- **Permissions:**
  - Declared & Verified: `android.permission.INTERNET`, `android.permission.CAMERA` (QR scanning only).
  - Explicitly Blocked & Stripped: `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`.
- **Sensitive Data Storage:** Session tokens and authentication secrets are stored exclusively via `expo-secure-store`, backed by Android Keystore with encryption at rest. Backup configurations (`secure_store_backup_rules.xml` and `secure_store_data_extraction_rules.xml`) exclude all credentials from Google Cloud Backup and adb extraction.
- **Network Security:** Production release builds permit only HTTPS to canonical hosts (`samgamam.com`, `api.samgamam.com`). Cleartext HTTP is globally blocked (`cleartextTrafficPermitted="false"`). Standalone acceptance builds use an explicit overlay restricted strictly to `127.0.0.1` for mock validation without permitting broad cleartext traffic.
- **Deep Linking:** Auth0 callbacks are routed exclusively through `com.auth0.react.RedirectActivity` on custom scheme `samgamam://`. Ambiguous scheme declarations on `MainActivity` are removed to prevent intent-filter hijacking or disambiguation prompts.

---

## 6. Release Gate Attestation

Production release attestation via `scripts/testing/release-gate.cjs` remains **intentionally blocked** (`status: blocked` in `docs/testing/release-acceptance.json`). Physical Android hardware validation, production Auth0 tenant integration, and store submission are strictly pending authorized staging and production deployment approvals.
