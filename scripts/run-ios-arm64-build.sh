#!/usr/bin/env bash
set -euo pipefail

DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-${RUNNER_TEMP:-/tmp}/bin-group-ios-derived-data}"
IOS_BUILD_LOG="${IOS_BUILD_LOG:-ios-arm64-xcodebuild.log}"
IOS_EVIDENCE_PATH="${IOS_EVIDENCE_PATH:-ios-arm64-build-evidence.json}"
IOS_FAILURE_SUMMARY="${IOS_FAILURE_SUMMARY:-ios-arm64-failure-summary.txt}"
EXPECTED_COCOAPODS_VERSION="1.16.2"

: > "$IOS_BUILD_LOG"
exec > >(tee -a "$IOS_BUILD_LOG") 2>&1

stage="bootstrap"
trap 'status=$?; printf "stage=%s\nexitCode=%s\n" "$stage" "$status" > "$IOS_FAILURE_SUMMARY"; echo "Apple Silicon build failed at stage: $stage (exit $status)" >&2; exit "$status"' ERR

stage="runner-and-xcode"
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

stage="npm-install"
npm ci --include=optional --legacy-peer-deps

stage="source-readiness"
npm run verify:ios-apple-silicon

stage="web-build"
CI=false npm run build

stage="capacitor-copy"
npx cap copy ios

stage="cocoapods-version"
if ! gem list --installed --exact cocoapods --version "$EXPECTED_COCOAPODS_VERSION" >/dev/null; then
  gem install cocoapods --version "$EXPECTED_COCOAPODS_VERSION" --no-document
fi
cocoapods_version="$(pod _${EXPECTED_COCOAPODS_VERSION}_ --version)"
if [[ "$cocoapods_version" != "$EXPECTED_COCOAPODS_VERSION" ]]; then
  echo "Expected CocoaPods $EXPECTED_COCOAPODS_VERSION, got: $cocoapods_version" >&2
  exit 1
fi
echo "CocoaPods: $cocoapods_version"

stage="cocoapods-install"
(
  cd ios/App
  pod _${EXPECTED_COCOAPODS_VERSION}_ install --deployment
)

stage="xcodebuild"
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
  build

stage="binary-architecture"
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

stage="evidence"
binary_sha256="$(shasum -a 256 "$app_binary" | awk '{ print $1 }')"
workflow_url="https://github.com/${GITHUB_REPOSITORY:-local}/actions/runs/${GITHUB_RUN_ID:-local}"

RUNNER_ARCH="$runner_arch" \
XCODE_VERSION="$xcode_version" \
SIMULATOR_SDK="$simulator_sdk" \
COCOAPODS_VERSION="$cocoapods_version" \
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
        "cocoaPods": os.environ["COCOAPODS_VERSION"],
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

rm -f "$IOS_FAILURE_SUMMARY"
cat "$IOS_EVIDENCE_PATH"
