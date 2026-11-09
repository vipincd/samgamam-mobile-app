#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts
lsof -ti :4318 | xargs kill -9 2>/dev/null || true
node scripts/testing/mock-api.cjs > artifacts/mock.log 2>&1 &
mock_pid=$!
serial=${ANDROID_SERIAL:-$(adb devices | awk '$2 == "device" {print $1; exit}')}
: "${serial:?No Android device}"
cleanup() {
  adb -s "$serial" logcat -d > artifacts/logcat.txt || true
  adb -s "$serial" logcat -d -b crash > artifacts/crash-logcat.txt || true
  adb -s "$serial" reverse --list > artifacts/adb-reverse.txt || true
  curl -fsS http://127.0.0.1:4318/__mock/history > artifacts/mock-history.json || true
  kill "$mock_pid" 2>/dev/null || true
}
trap cleanup EXIT
for attempt in {1..60}; do
  if curl -fsS http://127.0.0.1:4318/__mock/health > artifacts/mock-health.json; then break; fi
  kill -0 "$mock_pid"
  sleep 2
done
# Fail before Maestro if host readiness or emulator forwarding is broken.
curl -fsS http://127.0.0.1:4318/__mock/health
adb -s "$serial" wait-for-device
adb -s "$serial" reverse tcp:4318 tcp:4318
adb -s "$serial" reverse --list > artifacts/adb-reverse-before.txt
# Keep stdin open briefly: adb otherwise closes the relay before the HTTP reply.
{ printf 'GET /__mock/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n'; sleep 1; } |
  adb -s "$serial" shell toybox nc -w 5 -q 5 127.0.0.1 4318 > artifacts/emulator-mock-health.txt
grep -q 'samgamam-acceptance-mock' artifacts/emulator-mock-health.txt
adb -s "$serial" install -r android/app/build/outputs/apk/release/app-release.apk
npm run test:maestro -- "$serial" "${1:-smoke}"
