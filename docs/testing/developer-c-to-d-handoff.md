# SAMGAMAM — DEVELOPER C TO D — TEST ISOLATION HANDOFF

> **Superseded 2026-11-14:** the current protocol (atomic lock writes, serialised stale recovery, run-id-gated mock control routes, `npm run test:android:acceptance`) is in [`agent-6-to-agent-7-lock-handoff.md`](agent-6-to-agent-7-lock-handoff.md). iOS runners must also send `x-mock-run-id` on `/__mock/*` control requests.

**Date:** 2026-11-10  
**From:** Developer C (Android Platform & Infrastructure Lead)  
**To:** Developer D (iOS Platform Lead)  
**Repository:** `vipincd/samgamam-mobile-app`  
**Shared Resource:** Loopback Mock Server on TCP port 4318 (`127.0.0.1:4318`)  
**Integration Status:** **PENDING (iOS Integration PENDING)** — Android implementation complete, process-safety hardened, and verified with 32/32 tests. Awaiting iOS runner integration and cross-worktree signoff by Developer D.

---

## 1. Shared Locking Mechanism
Cross-platform mutual exclusion lock implemented in `scripts/testing/mock-manager.cjs`. It enforces Option A (serialized test suite execution) across Android and iOS using atomic file creation (`flag: 'wx'`) and strict process identity verification.

Both platforms share port 4318 without risk of collision, clobbering, or dangling processes.

## 2. Lock Path & Configuration
- **Primary Shared Path:** `$(git rev-parse --git-common-dir)/samgamam-acceptance-4318.lock` (resolves to `samgamammobile/.git/samgamam-acceptance-4318.lock`, universally accessible across all git worktrees).
- **Fallback Path:** `/tmp/samgamam-acceptance-4318.lock` (used if git common dir is unavailable or outside a repository).
- **Environment Override:** `ACCEPTANCE_LOCK_PATH` (supported across all environments, CI runners, and test suites).

## 3. Run Ownership Model & Verification
Each test run generates a unique `runId` (e.g. `android-${Date.now()}-${pid}` or `ios-${Date.now()}-${pid}`).

The lock file records comprehensive, tamper-evident metadata:
```json
{
  "platform": "android",
  "runId": "android-1731220000000-12345",
  "runnerPid": 12345,
  "mockPid": 12346,
  "port": 4318,
  "startedAt": "2026-11-10T07:45:00.000Z",
  "createdAt": "2026-11-10T07:45:00.000Z",
  "updatedAt": "2026-11-10T07:45:01.000Z"
}
```

### Safe Ownership Verification
Ownership is never inferred from PID existence alone:
1. **Mock Health Identity:** Probes `GET http://127.0.0.1:4318/__mock/health`.
2. **Service & RunId Match:** Verifies `res.data.service === 'samgamam-acceptance-mock'`, `res.data.runId === lock.runId`, and `res.data.pid === lock.mockPid`.
3. **Runner Liveness:** Inspects `runnerPid` and detached child `mockPid`.
4. **PID Reuse Defense:** If a process exists with a matching PID but does not respond with the expected mock service identity and `runId`, the lock manager considers it foreign and refuses to signal it or release the lock.

## 4. Startup & Shutdown Commands

### Android Implementation Reference
`scripts/testing/android-ci.sh` invokes:
```bash
# Startup with runner PID and persistent mock tracking
node scripts/testing/mock-manager.cjs start \
  --port 4318 \
  --platform android \
  --run-id "$RUN_ID" \
  --owner-file "$OWNER_FILE" \
  --runner-pid "$$"

# Trapped cleanup (EXIT INT TERM)
node scripts/testing/mock-manager.cjs stop \
  --run-id "$RUN_ID" \
  --owner-file "$OWNER_FILE" \
  --port 4318
```

## 5. Required Changes to iOS Acceptance Runner
Developer D's iOS acceptance runner (`feature/mobile-ios-readiness` / PR #6) must adopt the shared lock to prevent cross-platform test conflicts.

### Integration Option A (Shell Trap Wrapper):
```bash
#!/usr/bin/env bash
set -euo pipefail

LOCK_PATH="$(git rev-parse --git-common-dir 2>/dev/null || echo '/tmp')/samgamam-acceptance-4318.lock"
RUN_ID="ios-$(date +%s)-$$"
OWNER_FILE="artifacts/ios-mock-owner.json"

cleanup() {
  local exit_code=$?
  node scripts/testing/mock-manager.cjs stop \
    --run-id "$RUN_ID" \
    --owner-file "$OWNER_FILE" \
    --lock-file "$LOCK_PATH" \
    --port 4318 2>/dev/null || true
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# Acquire lock and launch mock
node scripts/testing/mock-manager.cjs start \
  --port 4318 \
  --platform ios \
  --run-id "$RUN_ID" \
  --owner-file "$OWNER_FILE" \
  --lock-file "$LOCK_PATH" \
  --runner-pid "$$"

# Execute iOS Maestro suite
npm run test:maestro:ios
```

### Integration Option B (Supervisor Mode):
```bash
node scripts/testing/mock-manager.cjs exec \
  --platform ios \
  --port 4318 \
  -- npm run test:maestro:ios
```

## 6. Signal Handling & Process Teardown
- **Graceful Termination:** On shutdown or signal (`SIGINT`, `SIGTERM`, `EXIT`), `stopMock()` sends `SIGTERM` exclusively to the verified owned `mockPid`.
- **Drain Timeout:** Polls process exit for up to 3 seconds before escalating to `SIGKILL`.
- **Foreign Process Immunity:** Blanket port termination (`fuser -k`, `killall`, `lsof -ti:4318 | xargs kill`) is completely prohibited. If an unverified process holds port 4318, `mock-manager.cjs` exits fail-closed (`[PORT CONFLICT]`) without modifying the foreign process.

## 7. Hardened Safe Stale-Lock Recovery
Manual force-unlock (`node scripts/testing/mock-manager.cjs unlock --force`) has been strictly hardened:
1. **Runner Liveness Check:** Refuses unlock if `runnerPid` is alive (`[LOCK ACTIVE]`).
2. **Mock Process Check:** Refuses unlock if `mockPid` is alive (`[LOCK ACTIVE]`).
3. **Mock Health Probe:** Refuses unlock if mock is responding on HTTP port 4318 (`[LOCK ACTIVE]`).
4. **Foreign Listener Protection:** Refuses unlock if an unknown foreign process is listening on the port (`[PORT CONFLICT]`).
5. **Ambiguity Defense:** Refuses unlock if metadata lacks valid PIDs (`[LOCK AMBIGUOUS]`).
6. **Race-Condition Defense:** Re-checks lock content and `runId` immediately prior to unlinking.
7. **Audit Record:** Emits structured recovery rationale upon success:
   ```
   [LOCK RECOVERED] Stale lock at <path> successfully recovered. Reason: Verified inactive session (runId: <id>, platform: <platform>): runnerPid <pid> dead, mockPid <pid> dead, port 4318 unoccupied.
   ```

## 8. Cross-Worktree Concurrency Verification
Developer D can verify cross-worktree contention with these commands:

1. **Terminal 1 (Android Worktree):**
   ```bash
   node scripts/testing/mock-manager.cjs start \
     --platform android \
     --run-id android-manual-test \
     --lock-file "$(git rev-parse --git-common-dir)/samgamam-acceptance-4318.lock"
   ```
2. **Terminal 2 (iOS Worktree):**
   ```bash
   node scripts/testing/mock-manager.cjs start \
     --platform ios \
     --run-id ios-manual-test \
     --lock-file "$(git rev-parse --git-common-dir)/samgamam-acceptance-4318.lock"
   # Output MUST fail closed with [LOCK BUSY] and exit 1
   ```
3. **Teardown in Terminal 1:**
   ```bash
   node scripts/testing/mock-manager.cjs stop \
     --run-id android-manual-test \
     --lock-file "$(git rev-parse --git-common-dir)/samgamam-acceptance-4318.lock"
   ```

## 9. Verification & Automated Test Coverage
All 32 test isolation and process-safety tests in `tests/isolation/mock-server-isolation.test.cjs` pass:
- **`LOCK-01` to `LOCK-12`:** Cross-platform mutual exclusion, child process survival, PID reuse protection.
- **`CLEANUP-01` to `CLEANUP-11`:** Hostile owner-file handling, safe isolation cleanup, foreign lock/owner file survival, and idempotency.
- **`UNLOCK-01` to `UNLOCK-09`:** Hardened force-unlock verification, active iOS/Android rejection, ambiguous metadata rejection, concurrent recovery safety.

## 10. Status & Handoff Action Items
- **Android Status:** Complete, verified in CI and emulator smoke test, ready for merge upon iOS readiness.
- **iOS Status:** **PENDING** — Developer D must integrate `mock-manager.cjs` into iOS acceptance scripts in branch `feature/mobile-ios-readiness` (PR #6).
- **Final Acceptance:** Serialized parallel execution of Android and iOS Maestro suites against shared port 4318 to be verified end-to-end once PR #6 is updated.
