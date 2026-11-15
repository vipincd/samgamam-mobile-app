# Agent 6 → Agent 7: Shared Mock Lock Protocol (v2)

**Date:** 2026-11-14
**From:** Agent 6 (Android, PR #7 `feature/mobile-android-readiness`)
**To:** Agent 7 (iOS, PR #6 `feature/mobile-ios-readiness`)
**Supersedes:** sections 1–8 of `developer-c-to-d-handoff.md` where they differ.

Nothing in PR #6 was modified. iOS adopts this independently, by merging or
cherry-picking the files listed in §6.

## 1. What changed in v2 and why

| ID | Defect (reproduced at `0f52c8e`) | Fix |
|---|---|---|
| F1 | `/__mock/reset` was unauthenticated and `run-maestro.mjs` only checked `service`. A runner from one platform could switch the other platform's mock into `error`/`offline` (repro: iOS-owned mock flipped to 503 by an Android-side reset). | The mock requires `x-mock-run-id: <owning runId>` on every `/__mock/*` control route except `/__mock/health`, and returns `409 mock_run_mismatch` otherwise. `run-maestro.mjs` refuses to start unless `MOCK_RUN_ID` is set, the lock is owned by that run, and health reports the same `runId`. It then passes `-e MOCK_RUN_ID=…` to Maestro, and `.maestro/scripts/reset.js` sends the header. |
| F2 | Lock create (`writeFileSync wx`) and update (`writeFileSync`) were not atomic. Contenders read partial JSON and reported an **active** lock as `[LOCK ERROR] malformed`: 539 of 4,144 attempts in the repro. | Create = write a unique temp file, then `link()` it (atomic, `EEXIST` when held). Update = write a unique temp file, then `rename()`. Each call deletes only its own temp file. |
| F3 | Stale-lock recovery was read → verify → `unlink` with no serialisation. Concurrent recoverers deleted a freshly acquired foreign lock: 619 of 1,808 acquisitions lost in an 8-process stress test (the TOCTOU noted in review 5839080797). | All force/stale recovery runs inside an atomic `mkdir` guard, `<lock>.recovery/holder.json`, and re-reads and re-verifies inside it. Stress result after the fix: 0 lost of 857. A guard held by a live process makes recovery fail closed with `[LOCK RECOVERY BUSY]`. A dead holder is reported and never auto-removed. |

## 2. Lock protocol (exact)

- **Path:** `$(git rev-parse --git-common-dir)/samgamam-acceptance-4318.lock`. Every worktree of this repository shares it. If git is unavailable the fallback is `/tmp/samgamam-acceptance-4318.lock`. Override with `ACCEPTANCE_LOCK_PATH` (CI and tests only).
- **Metadata:** `{ platform, runId, runnerPid, mockPid, pid, port, startedAt, createdAt, updatedAt }`.
- **runId:** unique per run, e.g. `ios-<epoch>-<pid>`. It is the only proof of ownership.
- **Acquire:** atomic create. If the lock is held: when `runnerPid` or `mockPid` is alive, or health returns the owner's `runId`, the result is `[LOCK BUSY]` (exit 1). A dead owner gives `[LOCK STALE]` (exit 1) unless `--allow-stale` is passed. Malformed metadata gives `[LOCK ERROR]` and the file is preserved.
- **Port:** after acquiring, if 4318 is occupied the lock is released and the run fails with `[PORT CONFLICT]`. Nothing is ever killed by port.
- **Release:** only when `lock.runId === runId`. Foreign locks are always preserved.
- **Stop:** sends SIGTERM (SIGKILL after 3 s) only to a PID whose `/__mock/health` returns `service=samgamam-acceptance-mock`, the same `runId` and the same `pid`.
- **Force unlock (operator only):** `node scripts/testing/mock-manager.cjs unlock --force`. Runs inside the recovery guard and refuses when the runner or mock is alive, health matches, the port is occupied, the PIDs are missing, or the lock changed.
- **Mock control:** every `/__mock/reset` and `/__mock/history` request must send `x-mock-run-id: $MOCK_RUN_ID`.

## 3. Entry points

```bash
# Android, local (supervisor: acquires lock, starts owned mock, runs, cleans up)
npm run test:android:acceptance -- emulator-5554 all     # or smoke | regression

# Android, CI (shell trap wrapper; exports MOCK_RUN_ID)
bash scripts/testing/android-ci.sh smoke

# iOS (recommended, supervisor mode; run-maestro skips adb for non-emulator ids)
node scripts/testing/mock-manager.cjs exec --platform ios -- \
  node scripts/testing/run-maestro.mjs <SIMULATOR_UDID> all
```

For a shell-trap iOS runner, follow `android-ci.sh`:
`RUN_ID=ios-$(date +%s)-$$`, `export MOCK_RUN_ID=$RUN_ID`,
`mock-manager.cjs start --platform ios --run-id "$RUN_ID" --owner-file … --runner-pid "$$"`,
then trap `stop --run-id "$RUN_ID" --owner-file …` on `EXIT INT TERM`.

Any iOS-only flow that calls the mock directly must send the header. Reuse
`.maestro/scripts/reset.js`, which does this already.

## 4. Diagnosing an interrupted run

| Symptom | Meaning | Action |
|---|---|---|
| `[LOCK BUSY] … held by android/ios session (PID, runId, started)` | Another run is live. | Wait. Never kill it. |
| `[LOCK STALE] …` | Owner runner and mock are dead. | Run `unlock --force` and keep its `[LOCK RECOVERED] Reason:` line as evidence. |
| `[LOCK RECOVERY BUSY] … alive: false` | A recoverer crashed holding the guard. | Confirm no recovery is running, then remove `<lock>.recovery/` manually. |
| `[PORT CONFLICT] … unidentified listener` | Something that is not ours is on 4318. | Identify it out of band. The tooling never kills it. |
| `409 mock_run_mismatch` in a flow | The flow reached a mock owned by another run. | Run under `mock-manager exec`. |

`artifacts/mock.log` (per worktree) records the mock's requests. The lock file
itself is left in place for inspection whenever ownership is unclear.

## 5. Tests

- `tests/isolation/mock-server-isolation.test.cjs`: LOCK-01..12, CLEANUP-01..11, UNLOCK-01..09.
- `tests/isolation/lock-atomicity.test.cjs` (new): ATOMIC-01 partial-read, ATOMIC-02 multi-process recovery stress, ATOMIC-03 live guard, ATOMIC-04 no temp leakage, RUNID-01 control-route ownership, RUNID-02 runner refusal. Five of the six fail against `0f52c8e` and all pass after the fix.
- Run with `npm run test:contracts`.

## 6. Files Agent 7 needs from PR #7

`scripts/testing/mock-manager.cjs`, `scripts/testing/mock-api.cjs` (+ `.d.cts`),
`scripts/testing/run-maestro.mjs`, `.maestro/scripts/reset.js`, and optionally
`tests/isolation/*`.

## 7. Still open

- iOS adoption on PR #6, plus a genuine cross-worktree contention run in which one worktree is Android and the other is iOS. This remains Agent 7's sign-off.
- Owner release (`releaseLock`) does not take the recovery guard. It is only reachable by the owning run, and recovery refuses while that owner's runner or mock is alive. The remaining window, a manual `stop` for a run whose processes are already dead, racing a concurrent `unlock --force`, is documented and not closed.
- These guarantees assume a trusted local test host. A process that edits the lock file directly bypasses them.
