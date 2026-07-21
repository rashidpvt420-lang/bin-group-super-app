#!/usr/bin/env bash
set -euo pipefail

DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-${RUNNER_TEMP:-/tmp}/bin-group-ios-derived-data}"
IOS_BUILD_LOG="${IOS_BUILD_LOG:-ios-arm64-xcodebuild.log}"
IOS_EVIDENCE_PATH="${IOS_EVIDENCE_PATH:-ios-arm64-build-evidence.json}"

runner_arch="$(uname -m)"
if [[ "$runner_arch" != "arm64" ]]; then
  echo "Expected native Apple Silicon arm64 runner, got: $runner_arch" >&2
  exit 1
fi

xcode_version="$(xcodebuild -version | awk 'NR == 1 { print $2 }')"
xcode_major="${xcode_version%%.*}"
if [[ ! "$xcode_major" =~ ^[0-9]+$ ]] || (( xcode_major < 26 )); then
  echo "Expected Xcode 26 or newer, got: $xcode_version" >&2
  exit 1
fi

simulator_sdk="$(xcrun --sdk iphonesimulator --show-sdk-version)"
echo "Runner architecture: $runner_arch"
sw_vers
xcodebuild -version
echo "iOS Simulator SDK: $simulator_sdk"

npm ci --include=optional --legacy-peer-deps
npm run verify:ios-apple-silicon
CI=false npm run build
npx cap copy ios
(
  cd ios/App
  pod install --deployment
)

rm -rf "$DERIVED_DATA_PATH"
xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  ARCHS=arm64 \
  ONLY_ACTIVE_ARCH=YES \
  CODE_SIGNING_ALLOWED=NO \
  COMPILER_INDEX_STORE_ENABLE=NO \
  build | tee "$IOS_BUILD_LOG"

app_binary="$DERIVED_DATA_PATH/Build/Products/Debug-iphonesimulator/App.app/App"
if [[ ! -f "$app_binary" ]]; then
  echo "Expected simulator executable is missing: $app_binary" >&2
  exit 1
fi

binary_archs="$(lipo -archs "$app_binary")"
echo "Compiled simulator architectures: $binary_archs"
if [[ "$binary_archs" != "arm64" ]]; then
  echo "Expected arm64-only simulator executable, got: $binary_archs" >&2
  exit 1
fi
if [[ "$binary_archs" == *x86_64* ]]; then
  echo "Intel x86_64 slice is prohibited." >&2
  exit 1
fi

binary_sha256="$(shasum -a 256 "$app_binary" | awk '{ print $1 }')"
workflow_url="https://github.com/${GITHUB_REPOSITORY:-local}/actions/runs/${GITHUB_RUN_ID:-local}"

RUNNER_ARCH="$runner_arch" \
XCODE_VERSION="$xcode_version" \
SIMULATOR_SDK="$simulator_sdk" \
BINARY_ARCHS="$binary_archs" \
BINARY_SHA256="$binary_sha256" \
WORKFLOW_URL="$workflow_url" \
IOS_EVIDENCE_PATH="$IOS_EVIDENCE_PATH" \
python3 - <<'PY'
import json
import os
from pathlib import Path

evidence = {
    "schemaVersion": 1,
    "status": "PASSED",
    "repository": os.environ.get("GITHUB_REPOSITORY", "local"),
    "commitSha": os.environ.get("GITHUB_SHA", "local"),
    "workflowRunId": os.environ.get("GITHUB_RUN_ID", "local"),
    "workflowRunAttempt": os.environ.get("GITHUB_RUN_ATTEMPT", "local"),
    "workflowUrl": os.environ["WORKFLOW_URL"],
    "runner": {
        "label": "macos-26" if os.environ.get("GITHUB_ACTIONS") == "true" else "local-apple-silicon",
        "architecture": os.environ["RUNNER_ARCH"],
    },
    "toolchain": {
        "xcode": os.environ["XCODE_VERSION"],
        "simulatorSdk": os.environ["SIMULATOR_SDK"],
    },
    "build": {
        "workspace": "ios/App/App.xcworkspace",
        "scheme": "App",
        "configuration": "Debug",
        "destination": "generic/platform=iOS Simulator",
        "architectures": os.environ["BINARY_ARCHS"],
        "binarySha256": os.environ["BINARY_SHA256"],
        "codeSigningAllowed": False,
    },
}
Path(os.environ["IOS_EVIDENCE_PATH"]).write_text(
    json.dumps(evidence, indent=2) + "\n",
    encoding="utf-8",
)
PY

cat "$IOS_EVIDENCE_PATH"
