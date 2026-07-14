#!/usr/bin/env bash
# Deterministic, lockfile-frozen dependency install with network retries.
# Never deletes or regenerates package-lock.json. Uses npm ci only.
set -euo pipefail

npm config set fetch-retries 5
npm config set fetch-retry-factor 2
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set registry https://registry.npmjs.org/

LOCKFILE="package-lock.json"

if [[ ! -f "${LOCKFILE}" ]]; then
  echo "ERROR: ${LOCKFILE} is missing. Refusing to invent a dependency graph."
  echo "Regenerate and review package-lock.json on a clean Ubuntu Node 22 runner,"
  echo "then commit the reviewed lockfile before installing."
  exit 1
fi

# Loads rollup's native binding the same way `vite build` does.
platform_natives_ok() {
  node -e "require('rollup/dist/native.js')" >/dev/null 2>&1
}

install_once() {
  npm ci --include=optional --legacy-peer-deps --no-audit --no-fund
}

for attempt in 1 2 3; do
  echo "npm ci attempt ${attempt}/3 (lockfile-frozen, include=optional)"
  if install_once; then
    if platform_natives_ok; then
      exit 0
    fi

    echo "ERROR: Platform-native Rollup binding failed to load after a frozen npm ci."
    echo "The reviewed ${LOCKFILE} is incomplete for this platform (npm/cli#4828 class defect)."
    echo "Do not delete ${LOCKFILE}. Regenerate and review it so every supported build"
    echo "platform has resolved optional native package records, then re-run this script."
    exit 1
  fi

  if [[ "${attempt}" == "3" ]]; then
    echo "npm ci failed after 3 attempts."
    echo "Refusing unlocked dependency resolution or any rewrite of ${LOCKFILE}."
    exit 1
  fi

  sleep_seconds=$((attempt * 30))
  echo "npm ci failed. Retrying in ${sleep_seconds}s..."
  sleep "${sleep_seconds}"
done
