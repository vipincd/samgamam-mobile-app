# Samgamam production-readiness audit

Date: 2026-10-26. Scope: current mobile working tree, its configured production API, and the sibling web/backend repository. Production endpoints were checked with read-only requests. No production sign-in, RSVP, membership, push registration, or other mutation was attempted.

## Update — 2026-10-28

Code-level blockers 1 and 2 below are resolved on the Expo 58 / React Native 0.88 working tree:

| Check | Result |
| --- | --- |
| Typecheck | Passes. `tsconfig.json` declares Jest/Node types (TypeScript 6 no longer loads them implicitly); deep-link, list-slot and `StyleSheet.absoluteFill` errors fixed. The QR scanner camera and overlay had lost their positioning at runtime because RN 0.88 removed `absoluteFillObject`. |
| Lint | 0 errors, 0 warnings. Real state-in-effect issues were rewritten; fetch-on-load effects carry an explained suppression. |
| Unit tests | 157/157 across 13 suites. |
| Expo Doctor | 20/20. |
| Dependencies | `node-forge` 1.4.2 and `qs` 6.17.0 fixed via non-breaking `npm audit fix`. The remaining high findings are one issue — zod 3 inside `@expo/cli` (build tooling only) — allow-listed in `scripts/security-audit.cjs` and documented in `docs/security/MOBILE-DEPENDENCY-EXCEPTIONS.md` (review by 2026-11-15). The obsolete `node-forge` and `image-size` exceptions were removed. 0 critical. |
| Backend contract | Every web route and method the mobile client calls exists with matching request and response shapes, and accepts bearer sessions. |

Blockers 3–5 (device acceptance, production Auth0 sign-in, FCM push credentials, usability pass) remain open; they need the physical device and production credentials.

The original findings from 2026-10-26 follow unchanged.

## Verdict

**Not ready for production release.** The web/backend release verification passes and read-only production endpoints are responding. The current mobile checkout has failing lint and type checks, five high-severity dependency advisories, and no hands-on device acceptance. The Android phone was not attached to the test workstation.

## Results

| Area | Result |
| --- | --- |
| Web/backend `npm run verify:production` | Passed end to end, including lint, typecheck, unit suite, legal and localization checks, secret and dependency scans, and production build. ESLint reported four warnings and no errors. |
| Production liveness | `GET /api/healthz` returned HTTP 200. |
| Production mobile API | `GET /api/v1/events?locale=en` and `GET /api/v1/groups?locale=en` both returned HTTP 200 with 12 items each. |
| Auth0 discovery | Configured tenant OIDC discovery returned HTTP 200. This does not test interactive login or the native callback. |
| Mobile unit tests | 157 passed across 13 suites. These primarily test app logic with mocked clients. |
| Mobile Android/iOS JavaScript export | Both platforms exported successfully from the current Expo 58 checkout. |
| Expo Doctor | 20/20 checks passed. |
| Mobile lint | Failed: 14 errors and 3 warnings across nine files. Eleven errors are `react-hooks/set-state-in-effect`; the remainder include a notification API namespace mismatch, render-time impurity, and an immutability finding. |
| Mobile typecheck | Failed. With Jest and Node types explicitly included, five application-source errors remain: one deep-link callback accepts a narrower URL type, two icon props reject `null`, and two uses of `StyleSheet.absoluteFillObject` are incompatible with React Native 0.88 types. The default TypeScript command also fails to load Jest/Node globals for test files. |
| Mobile dependency audit | Five high-severity findings remain, including transitive Expo CLI `node-forge` and Zod findings. The critical-only audit threshold passes; the high-severity audit threshold fails. |
| Native preview | Existing APK is SDK 54 and was built from clean commit `fce061c`. It predates the current uncommitted Expo 58 upgrade, so it does not represent the current checkout. A new Expo 58 preview build is queued as `d25ef5cd-b644-4328-a6ed-5085e81f456c`; it is not yet an installable test artifact. |
| Real-device and usability testing | Not performed. `adb devices` showed no attached phone. Sign-in/session refresh/logout, RSVP, group membership, organizer permissions, QR camera flow, push delivery/deep links, Android 16 layout, accessibility, and usability remain unverified on the SM-A536B/DS. |

## Release blockers

1. Resolve mobile lint and TypeScript failures under the current Expo 58 / React Native 0.88 toolchain, then make the CI checks pass.
2. Review and resolve or formally accept the five high-severity dependency findings.
3. Finish the Expo 58 Android build, install that artifact on the SM-A536B/DS running Android 16, and complete the device acceptance flows. Configure and verify Firebase/FCM credentials before treating push as ready.
4. Validate Auth0 interactive sign-in, callback, refresh, and logout against the production app registration, then verify authorized and unauthorized API access.
5. Conduct at least one usability pass on-device, including larger text, screen-reader navigation, permission denial, slow/offline network, and recovery from errors.

The green backend checks and HTTP responses show that core server routes are alive; they do not establish production readiness for the native mobile experience.
