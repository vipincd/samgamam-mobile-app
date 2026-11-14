#!/usr/bin/env bash
# iOS simulator acceptance under the shared Android/iOS mock lock (PR #7 protocol).
#
#   npm run test:maestro:ios -- [SIMULATOR_UDID] [ios-all|all|smoke|regression|ios]
#
# Both platforms' acceptance builds are fail-closed to http://127.0.0.1:4318, so runs
# are serialized through scripts/testing/mock-manager.cjs (owned by the Android/infra
# developer; not duplicated here). mock-manager takes the lock at
# $(git rev-parse --git-common-dir)/samgamam-acceptance-4318.lock, spawns and verifies
# its own mock, passes MOCK_RUN_ID to the flows, and on exit or signal stops only that
# mock and releases only its own lock. This script never kills processes or removes locks.
set -euo pipefail

cd "$(dirname "$0")/../.."

MANAGER="scripts/testing/mock-manager.cjs"
if [ ! -f "$MANAGER" ]; then
  echo "[IOS ACCEPTANCE] $MANAGER is missing. It ships with the shared test infrastructure (PR #7);" >&2
  echo "run from a checkout that contains it. Refusing to start an unlocked mock on port 4318." >&2
  exit 2
fi

device="${1:-}"
suite="${2:-ios-all}"
if [ -z "$device" ]; then
  device="$(xcrun simctl list devices booted -j | node -e '
    const d = JSON.parse(require("fs").readFileSync(0, "utf8")).devices;
    const booted = Object.values(d).flat().filter((x) => x.state === "Booted");
    if (booted.length !== 1) { console.error(`Expected exactly one booted simulator, found ${booted.length}; pass a UDID.`); process.exit(1); }
    console.log(booted[0].udid);')"
fi
case "$device" in
  emulator-*) echo "[IOS ACCEPTANCE] $device is an Android device; use scripts/testing/android-ci.sh." >&2; exit 2 ;;
esac

mkdir -p artifacts
RUN_ID="ios-$(date +%s)-$$"

exec node "$MANAGER" exec \
  --platform ios \
  --port 4318 \
  --run-id "$RUN_ID" \
  --owner-file artifacts/ios-mock-owner.json \
  -- node scripts/testing/run-maestro.mjs "$device" "$suite"
