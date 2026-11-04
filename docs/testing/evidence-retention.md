# Acceptance evidence retention

Keep reviewed reports, compact result summaries, JUnit counts, privacy checks and build hashes in Git.
Raw screenshots, UI hierarchies, execution logs, APKs and build output belong in `artifacts/` and
GitHub Actions artifacts (14-day retention). Download important runs before their expiry.

The original Phase 9 commit added 255 generated evidence files totaling 92,185,467 bytes.
Those raw files have been removed from the current source tree/index, but are preserved locally
under the ignored `docs/testing/evidence/phase-9/` paths and in historical commit
`0b4888fa66d588e6716499d1dff8e6e96e12c5ca`. No force push or history rewrite was performed.
Compact historical summaries are retained in `docs/testing/evidence/phase-9/summary/`.
Historical raw-file links in the original report refer to that original commit/local archive.

Failed CI run: https://github.com/vipincd/samgamam-mobile-app/actions/runs/41722226729
Artifact: `android-acceptance`, ID 13272423973, expires November 17, 2026.
The downloaded ZIP SHA-256 and root-cause observations are recorded in `summary/ci-failure.json`.

New CI runs retain mock readiness, device-side HTTP response, reverse mappings before/after,
last mock request history, Android crash/full logs, Maestro screenshots, hierarchies, command records
and JUnit alongside the APK. The workflow fails on test failure and uploads evidence regardless.
