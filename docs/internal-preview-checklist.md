# Internal preview release checklist

## Verification record — 2026-10-25

Starting commit: `fce061c`. The following results include the uncommitted dependency and CI changes from this release-readiness pass.

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Unit tests | 157 passed across 13 suites, including image-extension regression checks |
| Lint | No errors; three existing hook-dependency warnings in GroupsScreen and ProfileScreen |
| Expo Doctor | 18/18 passed after updating expo-asset |
| Critical dependency audit | Passed after compatible lockfile updates; five high-severity findings remain |
| Android and iOS release JS export | Both passed after removing the incompatible global ws override |
| Production health | GET https://samgamam.com/api/healthz returned 200 |
| Production events | GET https://samgamam.com/api/v1/events?locale=en returned 500, internal_error; request ID b68ad85f-3ce6-4a38-a0f1-794d1831211b |
| EAS authentication | Logged in as vipincd |
| EAS project link | @vipincd/mobile-app; 0c199634-d3e2-4c01-b7da-417b34a55801 |
| Attached Android device | None reported by adb |
| Android native cloud build | FINISHED; build 84bdf49d-6308-46e9-80a0-b741050cd6f7 |
| Native install and device acceptance | Not performed |

The bundle export proves JavaScript bundling only, not native compilation, installation, Auth0 callbacks, push delivery, or backend acceptance. CI now exports both native-platform bundles to catch bundler failures that unit tests miss.

The remaining audit findings are image-size in Metro and node-forge in Expo CLI/code-signing dependencies (including propagated Expo findings). Repeated compatible npm audit fix did not resolve them. Do not use audit fix --force: its suggested Expo 44 downgrade is incompatible with this SDK 54 app. Review an upstream fix or a separately validated SDK migration before production release. Passing the existing critical-only CI gate is not a clean security audit.

## Before requesting the preview build

- [x] Log in on the Mac with `npx eas-cli login` from this repository.
- [x] Link the project under the authenticated account vipincd and record the project UUID in app configuration.
- [x] Configure the EAS preview environment with EXPO_PUBLIC_API_URL, EXPO_PUBLIC_AUTH0_DOMAIN, EXPO_PUBLIC_AUTH0_CLIENT_ID, EXPO_PUBLIC_AUTH0_AUDIENCE, and EXPO_PUBLIC_EAS_PROJECT_ID. Public identifiers are bundled into the app; never put client secrets here.
- [ ] Use a reachable HTTPS test backend with approved test accounts and test records. The local .env.local is ignored by Git and must not be assumed to configure a remote build. A release preview cannot use the development-only HTTP/LAN override.
- [ ] If using samgamam.com, resolve the recorded events HTTP 500 and repeat the read-only endpoint check before testing event flows.
- [ ] Verify Auth0 native callback/logout configuration for scheme samgamam and app identifiers com.samgamam.mobile.
- [ ] Configure Android push credentials, and iOS signing/push credentials and registered test devices if building iOS.
- [ ] Build Android first with `npx eas-cli build --platform android --profile preview`; record build URL, source commit/diff, backend, app version, and build number. Then build iOS with the corresponding platform flag when credentials and devices are ready.

## Real-device acceptance

### Android build submitted — 2026-10-25

- Current build: https://expo.dev/accounts/vipincd/projects/mobile-app/builds/84bdf49d-6308-46e9-80a0-b741050cd6f7
- First build 60fab513-9a91-4fb7-8cfd-320e7793499b failed in mergeReleaseResources: assets/brand/community.png contained JPEG bytes. Renamed it to community.jpg and updated src/brand.ts. The unchanged image data passed local Android aapt2 resource compilation with the correct extension; typecheck and all 151 tests passed again. The current build includes this correction.
- Project: @vipincd/mobile-app; app 1.0.0, remote Android versionCode 1.
- Backend: https://samgamam.com. Existing local public Auth0 identifiers were copied into the EAS preview environment; compatibility with the backend remains unverified.
- A new Android signing keystore was generated and stored by EAS. Push/FCM credentials have not been configured or verified in this pass.
- Source: fce061c plus the local dependency fixes, CI export check, app.json EAS project/owner link, and explicit preview environment in eas.json. Changes are not committed.
- Removed the global brace-expansion override after EAS fingerprinting failed with `expand is not a function`. Fingerprinting and submission then succeeded; Expo Doctor 18/18, critical-only audit, and all 151 unit tests passed again.
- EAS Update was not configured. The existing channel setting produces a warning because expo-updates is absent; this does not prevent a standalone preview build.
- Submitted using EXPO_NO_DOTENV=1 so the ignored local loopback backend setting cannot override the EAS preview environment during build configuration.
- Cloud build finished successfully. APK: https://expo.dev/artifacts/eas/pbzZMoidiMH_zzKUgB6nRBiMR3q34qD67o8f8NB7Vdg.apk
- APK installation and device tests are pending; iOS native build has not been attempted.
- After submission, added assets.test.ts to check PNG/JPEG signatures against filenames. All 157 tests, typecheck, and lint (three existing warnings) pass. This test/documentation-only addition is not part of the uploaded build archive.

Use designated test records for mutations. Record device model, OS, build ID, date, tester, and pass/fail evidence for each row. Do not record passwords or tokens. All rows below are currently untested.

| Flow | Required result | Status |
| --- | --- | --- |
| Clean install and cold launch | Preview launches without Metro or a USB connection; no crash or error overlay | Untested |
| Auth0 sign-in | Browser login returns to the app and authenticated backend profile succeeds | Untested |
| Session persistence | Force-close and reopen retains the expected signed-in state | Untested |
| Session refresh | After access-token expiry, a protected request renews successfully or clearly requests sign-in; no stale authenticated state | Untested |
| Discover | Events load, search and details work, counts and times are correct | Untested |
| RSVP | Join and cancel on a test event; state survives reload and capacity/error handling is clear | Untested |
| Groups and messages | Membership/approval and test discussion/message flows persist correctly | Untested |
| Organizer | Authorized account loads roster and approvals; ordinary attendee cannot access restricted actions | Untested |
| QR check-in | Camera permission, valid test ticket, duplicate ticket, and invalid ticket have correct outcomes | Untested |
| Push | Registration succeeds; an authorized test notification arrives and opens the correct destination in foreground/background/cold-start states | Untested |
| Permission denial | Denied camera or notification permission produces usable recovery guidance without a crash | Untested |
| Network interruption | Offline/failed requests show recoverable errors; retry does not duplicate a mutation | Untested |
| Logout and account switch | Protected data disappears; relaunch stays signed out; device registration belongs to the new account after switching | Untested |

## Exit criteria

Store testing is pending until a native preview build is installed and the applicable device rows pass, backend failures are resolved, and remaining security findings have a documented resolution or explicit release decision. Preserve build links and test evidence here. The mock-based integration/unit suites do not replace these device checks.
