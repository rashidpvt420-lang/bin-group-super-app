#!/usr/bin/env bash
set -euo pipefail

npm config set fetch-retries 5
npm config set fetch-retry-factor 2
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set registry https://registry.npmjs.org/

# Loads rollup's native binding the same way `vite build` does. A package-lock.json
# resolved on another OS (e.g. a Windows dev machine) can omit the Linux
# @rollup/rollup-<platform> / @esbuild/<platform> binaries, so a plain `npm install`
# silently skips them (npm/cli#4828) and the build later dies with
# "Cannot find module @rollup/rollup-linux-x64-gnu". Returns non-zero when the
# platform-native binding cannot load on this runner.
platform_natives_ok() {
  node -e "require('rollup/dist/native.js')" >/dev/null 2>&1
}

install_once() {
  npm install --legacy-peer-deps --no-audit --no-fund
}

for attempt in 1 2 3; do
  echo "npm install attempt ${attempt}/3"
  if install_once; then
    if platform_natives_ok; then
      exit 0
    fi

    echo "Platform-native rollup binary is missing after install."
    echo "This usually means package-lock.json was generated on a different OS."
    echo "Repairing with a clean, platform-correct install on this runner..."
    rm -rf node_modules package-lock.json
    if install_once && platform_natives_ok; then
      echo "Native binaries repaired."
      exit 0
    fi
    echo "Native binary repair did not resolve the missing rollup binding."
  fi

  if [ "${attempt}" = "3" ]; then
    echo "npm install failed after 3 attempts."
    exit 1
  fi

  sleep_seconds=$((attempt * 30))
  echo "npm install failed. Retrying in ${sleep_seconds}s..."
  sleep "${sleep_seconds}"
done
