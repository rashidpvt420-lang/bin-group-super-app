#!/usr/bin/env bash
set -euo pipefail

npm config set fetch-retries 5
npm config set fetch-retry-factor 2
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000
npm config set registry https://registry.npmjs.org/

for attempt in 1 2 3; do
  echo "npm install attempt ${attempt}/3"
  if npm install --legacy-peer-deps --no-audit --no-fund; then
    exit 0
  fi

  if [ "${attempt}" = "3" ]; then
    echo "npm install failed after 3 attempts."
    exit 1
  fi

  sleep_seconds=$((attempt * 30))
  echo "npm install failed. Retrying in ${sleep_seconds}s..."
  sleep "${sleep_seconds}"
done
