# Physical Android and iPhone acceptance

Status: **NOT EXECUTED**. No phone was connected during the Phase 9 audit.
A prepared checklist is not acceptance evidence. Record exact build SHA, OS, model,
installation method, reviewer, date, outcome, screenshots and crash logs for every row.
For this Phase 9 run, use local deterministic mocks exclusively. Real Auth0, staging, paid APIs and real push services are prohibited.

## Android setup

1. Enable USB debugging and authorize the workstation. Run `adb devices -l` and identify the physical serial.
2. Build the Phase 9 APK using the commands in `README.md` in this directory.
3. `adb -s SERIAL install -r android/app/build/outputs/apk/release/app-release.apk`.
4. Start the loopback mock and reverse port 4318 on that serial.
5. `npm run test:maestro -- SERIAL all`. Preserve the JUnit report and screenshots.
6. Store signing and external authentication/push remain blocked and require separate authorization; this locally signed test APK is not a distribution candidate.

## iPhone setup

1. Select an Apple development team, provisioning profile and registered test iPhone.
2. Build/sign the exact candidate and install through Xcode or approved TestFlight distribution.
3. Check camera purpose text and notification permissions on first request and after denial.
4. Maestro CLI flows here target simulators; use manual physical iPhone acceptance unless
   a supported physical-device runner is separately available. Do not equate simulator results with iPhone results.

## Required observations (all pending)

| Journey | Required observation |
|---|---|
| Installation/startup | Fresh install, cold/warm starts, splash completion, background recovery; no fatal logs |
| Auth | BLOCKED under local-only policy: real Auth0 registration/login, bad credentials, cancel, expiry, persisted session, logout and revoked access |
| Discovery | Browse, search match/no match, categories, details, error/retry; keyboard and Android back |
| Events | Terms/risk consent required, register, waitlist, cancel; inspect persisted backend state |
| Communities | Open circle, membership, approval restrictions, post discussion, empty/error/retry |
| Account | Personalization add/remove/reset; notifications read/navigation; session cleanup |
| Camera | QR check-in granted/denied/revoked permission, invalid and duplicate tickets |
| Push | BLOCKED under local-only policy: real push token registration, foreground/background/cold-start delivery and correct destination |
| Accessibility | TalkBack/VoiceOver labels, focus order, largest fonts, 44pt/48dp targets, contrast, keyboard |
| Network | Slow mobile data, airplane mode, reconnect, request timeout and retry without duplicated mutations |
| Performance | Record cold-start timing and memory on low-end hardware; repeated navigation and background cycles |
| Privacy | No credentials/PII in logs; logout isolation; deletion remains a product gap pending implementation |
| iPhone layouts | Small and large iPhone, safe areas, notches, keyboard, Dynamic Type |

Native profile editing, image upload, voice profile creation and direct messaging are not implemented.
Do not record them as passed. Account deletion is also missing and needs an agreed product/backend implementation.
