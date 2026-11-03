#!/usr/bin/env bash
set -euo pipefail
mkdir -p artifacts
node scripts/testing/mock-api.cjs > artifacts/mock.log 2>&1 &
mock_pid=$!
serial=${ANDROID_SERIAL:-$(adb devices | awk '$2 == "device" {print $1; exit}')}
: "${serial:?No Android device}"
trap 'adb -s "$serial" logcat -d > artifacts/logcat.txt; kill "$mock_pid" 2>/dev/null || true' EXIT
for attempt in {1..60}; do
  if curl -fsS http://127.0.0.1:4318/__mock/health; then break; fi
  sleep 2
done
adb -s "$serial" reverse tcp:4318 tcp:4318
adb -s "$serial" install -r android/app/build/outputs/apk/release/app-release.apk
npm run test:maestro -- "$serial" "${1:-smoke}"
