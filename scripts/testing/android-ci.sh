#!/usr/bin/env bash
set -euo pipefail

mkdir -p artifacts

# Safe process ownership: generate unique run identifier
RUN_ID="android-$(date +%s)-$$"
export MOCK_RUN_ID="$RUN_ID"
MOCK_OWNED=0
OWNER_FILE="artifacts/mock-owner.json"

cleanup() {
  if [ -n "${serial:-}" ]; then
    adb -s "$serial" logcat -d > artifacts/logcat.txt 2>/dev/null || true
    adb -s "$serial" logcat -d -b crash > artifacts/crash-logcat.txt 2>/dev/null || true
    adb -s "$serial" reverse --list > artifacts/adb-reverse.txt 2>/dev/null || true
  fi
  # Only collect history from the mock this run owns (never a foreign mock).
  if [ "$MOCK_OWNED" = 1 ]; then
    curl -fsS -H "x-mock-run-id: $RUN_ID" http://127.0.0.1:4318/__mock/history > artifacts/mock-history.json 2>/dev/null || true
  fi
  
  # Terminate ONLY the owned mock server and release our lock
  node scripts/testing/mock-manager.cjs stop --run-id "$RUN_ID" --owner-file "$OWNER_FILE" --port 4318 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start owned mock server with cross-platform lock and fail-closed port protection
node scripts/testing/mock-manager.cjs start --port 4318 --platform android --run-id "$RUN_ID" --owner-file "$OWNER_FILE" --runner-pid "$$"
MOCK_OWNED=1

curl -fsS http://127.0.0.1:4318/__mock/health > artifacts/mock-health.json

serial=${ANDROID_SERIAL:-$(adb devices | awk '$2 == "device" {print $1; exit}')}
: "${serial:?No Android device}"

# Fail before Maestro if host readiness or emulator forwarding is broken.
adb -s "$serial" wait-for-device
adb -s "$serial" reverse tcp:4318 tcp:4318
adb -s "$serial" reverse --list > artifacts/adb-reverse-before.txt

# Keep stdin open briefly: adb otherwise closes the relay before the HTTP reply.
{ printf 'GET /__mock/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n'; sleep 1; } |
  adb -s "$serial" shell toybox nc -w 5 -q 5 127.0.0.1 4318 > artifacts/emulator-mock-health.txt
grep -q 'samgamam-acceptance-mock' artifacts/emulator-mock-health.txt

adb -s "$serial" install -r android/app/build/outputs/apk/release/app-release.apk
npm run test:maestro -- "$serial" "${1:-smoke}"
