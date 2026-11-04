# Samgamam Mobile Phase 9 acceptance — CI follow-up

Updated November 4, 2026. Branch: `feature/phase-9-mobile-release-acceptance`; PR #3.
**GitHub CI acceptance is pending verification of this fix. Do not equate local success with CI acceptance.**
Production release remains blocked by physical-device, real authentication/push, accessibility,
performance and distribution-signing verification. Local deterministic mocks only; no staging,
production backend, real Auth0 account, paid API or real push service was exercised.

## Independent GitHub failure and root cause

[Run 41722226729](https://github.com/vipincd/samgamam-mobile-app/actions/runs/41722226729),
job 126217719519, commit `0b4888fa66d588e6716499d1dff8e6e96e12c5ca`: **0 passed, 2 failed**.
The downloaded artifact includes the APK, mock log, Android logcat, both flow screenshots,
UI hierarchies and Maestro command logs. Both failure hierarchies expose only the OS-owned
`Quickstep isn't responding` dialog and system UI. The screenshots show the fully rendered
Samgamam Discover screen and local fixture `Berlin Community Walk` underneath that dialog.
Logcat records React Native running `main`; the app did not fail to initialize.

The blocking cause is an **emulator launcher ANR overlay**, not a missing search control or
failed mock response. The job log records successful ADB reverse and APK install; the rendered
mock-only event corroborates device-to-host API access. The old run did not capture reverse
listings or request history, so it cannot establish forwarding beyond the observed requests.
It also contains no full launcher ANR trace explaining Quickstep's internal stall. We do not
claim to have diagnosed that underlying Android deadlock.

## Fix and assertions

The launch setup waits for the search control or that exact launcher dialog, captures the latter,
and closes it using `android:id/aerr_close`. It then requires **the original Search events assertion**.
Samgamam ANRs and other dialogs do not match this handling. Every smoke and journey assertion remains.

CI now fails early if host readiness or emulator-to-mock HTTP forwarding fails, and retains the
HTTP response, reverse mappings, crash/full logcat and last mock request history. The application
runtime was not changed for this fix. Local CI-script execution verified HTTP 200 with the exact
mock service identity through emulator loopback.

## Verification so far

| Check | Result |
|---|---|
| Android full Maestro regression via CI script | 12 passed, 0 failed |
| iOS full Maestro regression after Metro update | Running; original Phase 9 baseline was 12 passed, 0 failed |
| Jest | 176 passed, 0 failed; 15 suites |
| HTTP/security/asset contracts | 18 passed, 0 failed |
| Typecheck | PASS |
| Lint | PASS, 0 errors, 3 existing hook warnings |
| Expo Doctor | 18/18 passed |
| Android bundled Release APK | PASS, local acceptance signing |
| iOS bundled Release Simulator build | PASS, no device distribution signing |
| New GitHub Android workflow | Pending; must pass on latest pushed commit |

Android target: dedicated `samgamam_phase9`, API 35 arm64 emulator-5556.
iOS target: iPhone 17 Pro / iOS 26.5 Simulator. Maestro 2.12.1.
No skipped/unexecuted flow is counted as a pass. Local raw logs are in ignored
`artifacts/ci-investigation/`; final compact results are retained under
`docs/testing/evidence/phase-9/summary/`.

## Security remediation

Metro and its companion packages are pinned together at **0.83.8**, a patch-series update that
removes `image-size` rather than forcing an incompatible major version of that dependency.
Real JPEG/PNG asset compatibility and malformed-image rejection are tested, and both native
bundles build. The November 15 image-size exceptions were removed; the gate now rejects all
high/critical advisories, including the retired exception IDs.

Fresh audit: **0 critical, 0 high, 68 moderate, 5 low**. The high/critical gate passes; raw audit
still exits 1. See [security-review.md](security-review.md) for scope and residual risks.

## Evidence retention and release limitations

Removed 255 generated raw evidence files (92,185,467 bytes) from the current Git index, preserving
local files and compact historical results, JUnit, privacy records and build hashes. Raw evidence
is retained in CI artifacts for 14 days. No history rewrite occurred; the original evidence remains
in historical commit `0b4888f`. See [evidence-retention.md](evidence-retention.md).

The original merged Android manifest excludes RECORD_AUDIO. The original built iOS app's privacy
configuration includes camera purpose text, no microphone purpose, and no tracking declaration.
This follow-up changes no permissions. Physical camera/QR, denied/revoked permissions, low-end
performance, TalkBack/VoiceOver, large-font layouts, airplane-mode recovery and signed-device
checks remain unexecuted. Real Auth0 and push UI checks remain prohibited by the local-only policy.
The release attestation stays blocked; this PR does not merge or deploy anything.
