# SAMGAMAM — DEVELOPER C TO D — TEST ISOLATION HANDOFF

**Date:** 2026-11-09  
**From:** Developer C (Android Platform & Infrastructure Lead)  
**To:** Developer D (iOS Platform Lead)  
**Repository:** `vipincd/samgamam-mobile-app`  
**Shared Resource:** Loopback Mock Server on TCP port 4318 (`127.0.0.1:4318`)  
**Integration Status:** **PARTIAL** (Android implementation complete and verified; awaiting iOS runner integration)

---

## 1. Shared Locking Mechanism
Cross-platform mutual exclusion lock implemented in `scripts/testing/mock-manager.cjs`. It enforces Option A (serialized execution) using atomic file creation (`flag: 'wx'`) and strict process identity verification.

## 2. Lock Path & Configuration
- **Primary Shared Path:** `$(git rev-parse --git-common-dir)/samgamam-acceptance-4318.lock` (resolves to `samgamammobile/.git/samgamam-acceptance-4318.lock`, shared across all git worktrees).
- **Fallback Path:** `/tmp/samgamam-acceptance-4318.lock` (if git common dir is unavailable).
- **Environment Override:** `ACCEPTANCE_LOCK_PATH` (supported across all environments and test suites).

## 3. Run Ownership Model
Each test run creates a unique `runId` (e.g. `android-${Date.now()}-${pid}` or `ios-${Date.now()}-${pid}`).
The lock file records:
```json
{
  "platform": "android" | "ios",
  "runId": "string",
  "mockPid": 12346,
  "runnerPid": 12345,
  "port": 4318,
  "startedAt": "2026-11-09T...",
  "createdAt": "2026-11-09T..."
}
```
Ownership is NOT inferred from PID liveness alone. The runner verifies mock health via `GET http://127.0.0.1:4318/__mock/health` and confirms `res.data.runId === lock.runId` AND `res.data.pid === lock.mockPid`.

## 4. Android Runner Changes
- `scripts/testing/android-ci.sh` invokes:
  ```bash
  node scripts/testing/mock-manager.cjs start --port 4318 --platform android --run-id "$RUN_ID" --owner-file "$OWNER_FILE" --runner-pid "$$"
  ```
- Traps `EXIT INT TERM` to call:
  ```bash
  node scripts/testing/mock-manager.cjs stop --run-id "$RUN_ID" --owner-file "$OWNER_FILE" --port 4318
  ```
- Startup CLI records persistent mock child PID (`mockPid`), preserving the lock throughout the long-running Maestro test suite.

## 5. Required iOS Runner Changes
Developer D's iOS acceptance runner should adopt the same lock lifecycle:
### Option 1 (Wrapper CLI):
```bash
RUN_ID="ios-$(date +%s)-$$"
OWNER_FILE="artifacts/ios-mock-owner.json"
cleanup() {
  node scripts/testing/mock-manager.cjs stop --run-id "$RUN_ID" --owner-file "$OWNER_FILE" --port 4318 2>/dev/null || true
}
trap cleanup EXIT INT TERM

node scripts/testing/mock-manager.cjs start --port 4318 --platform ios --run-id "$RUN_ID" --owner-file "$OWNER_FILE" --runner-pid "$$"
# ... run iOS Maestro suite ...
```
### Option 2 (Supervisor command):
```bash
node scripts/testing/mock-manager.cjs exec --platform ios --run-id "ios-$(date +%s)" -- npm run test:maestro:ios
```

## 6. Foreign-Process Protection
- Indiscriminate port killing (`lsof | kill`, `fuser`, `pkill`) is strictly eliminated.
- Pre-flight port check probes `127.0.0.1:4318`. If occupied by an unverified process or another runner's mock, it fails closed (`[PORT CONFLICT]`) and leaves the foreign process untouched.
- Shutdown only signals a process if `__mock/health` verifies that the process currently listening on the port matches `samgamam-acceptance-mock`, the exact `runId`, and the exact `pid`.

## 7. Concurrent-Run Verification
Validated by 19/19 passing automated tests in `tests/isolation/mock-server-isolation.test.cjs`:
- `LOCK-01`: Android owns lock -> iOS cannot start conflicting suite (rejected with `LOCK BUSY`).
- `LOCK-02`: iOS owns lock -> Android cannot start conflicting suite (rejected with `LOCK BUSY`).
- `LOCK-03`: Real child process test verifying lock remains valid and protects port 4318 even after the startup CLI process exits.
- `LOCK-04` through `LOCK-12`: Safe mutual exclusion, PID reuse defense, and fail-closed malformed handling.
- `CLEANUP-01` through `CLEANUP-07`: Hostile owner file handling; foreign processes survive intact.

## 8. Failure Recovery
- Stale locks from crashed processes fail closed by default with explicit diagnostics.
- An explicit `--force-stale` flag or CLI command `node scripts/testing/mock-manager.cjs unlock --force` allows manual reclamation.

## 9. Remaining Dependencies
- Developer D to integrate `mock-manager.cjs` into iOS acceptance scripts in branch `feature/mobile-ios-readiness` (PR #6).
- End-to-end verification of serialized Android and iOS Maestro suites in local development environments.
