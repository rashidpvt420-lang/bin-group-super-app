#!/usr/bin/env bash
set -euo pipefail

EXPECTED_BUNDLE_ID="ae.bingroups.superapp"
EXPECTED_COCOAPODS_VERSION="1.16.2"
BUILD_NUMBER="${IOS_BUILD_NUMBER:-}"
ARCHIVE_PATH="${RUNNER_TEMP:?RUNNER_TEMP is required}/BIN-GROUP.xcarchive"
EXPORT_PATH="${RUNNER_TEMP}/bin-group-ios-export"
EXPORT_OPTIONS_PATH="${RUNNER_TEMP}/ExportOptions.plist"
CERTIFICATE_PATH="${RUNNER_TEMP}/apple-distribution.p12"
PROFILE_PATH="${RUNNER_TEMP}/app-store.mobileprovision"
PROFILE_PLIST="${RUNNER_TEMP}/app-store-profile.plist"
KEYCHAIN_PATH="${RUNNER_TEMP}/bin-group-signing.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -hex 24)"
IOS_LOG="ios-app-store-xcodebuild.log"
EVIDENCE_PATH="ios-app-store-release-evidence.json"

required=(
  APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64
  APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD
  APPLE_PROVISIONING_PROFILE_BASE64
  APPLE_TEAM_ID
  IOS_BUILD_NUMBER
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "::error::Missing required protected iOS signing value: $name"
    exit 1
  fi
done

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_REF:-}" != "refs/heads/main" ]]; then
  echo "::error::iOS App Store release builds are allowed only from the protected main workflow."
  exit 1
fi
if [[ ! "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::iOS App Store release requires an exact 40-character commit SHA."
  exit 1
fi
if [[ ! "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::IOS_BUILD_NUMBER must be a positive integer."
  exit 1
fi

umask 077
original_keychains="$(security list-keychains -d user | tr -d '"')"
cleanup() {
  security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true
  if [[ -n "$original_keychains" ]]; then
    # shellcheck disable=SC2086
    security list-keychains -d user -s $original_keychains >/dev/null 2>&1 || true
  fi
  rm -f "$CERTIFICATE_PATH" "$PROFILE_PATH" "$PROFILE_PLIST" "$EXPORT_OPTIONS_PATH"
  if [[ -n "${profile_uuid:-}" ]]; then
    rm -f "$HOME/Library/MobileDevice/Provisioning Profiles/${profile_uuid}.mobileprovision"
  fi
}
trap cleanup EXIT

APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64="$APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64" \
APPLE_PROVISIONING_PROFILE_BASE64="$APPLE_PROVISIONING_PROFILE_BASE64" \
CERTIFICATE_PATH="$CERTIFICATE_PATH" \
PROFILE_PATH="$PROFILE_PATH" \
python3 - <<'PY'
import base64
import os
from pathlib import Path

for source, destination in (
    ('APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64', 'CERTIFICATE_PATH'),
    ('APPLE_PROVISIONING_PROFILE_BASE64', 'PROFILE_PATH'),
):
    raw = os.environ[source].strip()
    try:
        decoded = base64.b64decode(raw, validate=True)
    except Exception as error:
        raise SystemExit(f'Invalid {source}: {error}')
    if not decoded:
        raise SystemExit(f'Decoded {source} is empty.')
    Path(os.environ[destination]).write_bytes(decoded)
PY

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$CERTIFICATE_PATH" \
  -k "$KEYCHAIN_PATH" \
  -P "$APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD" \
  -T /usr/bin/codesign \
  -T /usr/bin/security
security set-key-partition-list \
  -S apple-tool:,apple:,codesign: \
  -s \
  -k "$KEYCHAIN_PASSWORD" \
  "$KEYCHAIN_PATH" >/dev/null
# shellcheck disable=SC2086
security list-keychains -d user -s "$KEYCHAIN_PATH" $original_keychains
security find-identity -v -p codesigning "$KEYCHAIN_PATH" | grep -q 'Apple Distribution'

security cms -D -i "$PROFILE_PATH" > "$PROFILE_PLIST"
profile_values="$(
  PROFILE_PLIST="$PROFILE_PLIST" EXPECTED_BUNDLE_ID="$EXPECTED_BUNDLE_ID" APPLE_TEAM_ID="$APPLE_TEAM_ID" \
  python3 - <<'PY'
import os
import plistlib
from pathlib import Path

profile = plistlib.loads(Path(os.environ['PROFILE_PLIST']).read_bytes())
uuid = str(profile.get('UUID', '')).strip()
name = str(profile.get('Name', '')).strip()
team_ids = profile.get('TeamIdentifier') or []
team_id = str(team_ids[0] if team_ids else '').strip()
entitlements = profile.get('Entitlements') or {}
application_identifier = str(entitlements.get('application-identifier', '')).strip()
expected_team = os.environ['APPLE_TEAM_ID'].strip()
expected_bundle = os.environ['EXPECTED_BUNDLE_ID'].strip()
expected_application_identifier = f'{expected_team}.{expected_bundle}'
provisions_all_devices = bool(profile.get('ProvisionsAllDevices', False))
provisioned_devices = profile.get('ProvisionedDevices') or []
get_task_allow = bool(entitlements.get('get-task-allow', False))

if not uuid or not name:
    raise SystemExit('Provisioning profile is missing UUID or Name.')
if team_id != expected_team:
    raise SystemExit(f'Provisioning profile team {team_id!r} does not match APPLE_TEAM_ID.')
if application_identifier != expected_application_identifier:
    raise SystemExit(
        f'Provisioning profile application identifier {application_identifier!r} '
        f'does not match {expected_application_identifier!r}.'
    )
if provisions_all_devices or provisioned_devices or get_task_allow:
    raise SystemExit('Provisioning profile is not an App Store distribution profile.')
print(uuid)
print(name)
print(application_identifier)
PY
)"
profile_uuid="$(sed -n '1p' <<<"$profile_values")"
profile_name="$(sed -n '2p' <<<"$profile_values")"
profile_application_identifier="$(sed -n '3p' <<<"$profile_values")"

mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$PROFILE_PATH" "$HOME/Library/MobileDevice/Provisioning Profiles/${profile_uuid}.mobileprovision"

APPLE_TEAM_ID="$APPLE_TEAM_ID" \
EXPECTED_BUNDLE_ID="$EXPECTED_BUNDLE_ID" \
PROFILE_NAME="$profile_name" \
EXPORT_OPTIONS_PATH="$EXPORT_OPTIONS_PATH" \
python3 - <<'PY'
import os
import plistlib
from pathlib import Path

options = {
    'method': 'app-store-connect',
    'destination': 'export',
    'signingStyle': 'manual',
    'teamID': os.environ['APPLE_TEAM_ID'],
    'provisioningProfiles': {
        os.environ['EXPECTED_BUNDLE_ID']: os.environ['PROFILE_NAME'],
    },
    'manageAppVersionAndBuildNumber': False,
    'stripSwiftSymbols': True,
    'uploadSymbols': True,
}
Path(os.environ['EXPORT_OPTIONS_PATH']).write_bytes(plistlib.dumps(options))
PY

npm ci --include=optional --legacy-peer-deps
npm run test:mobile-store-readiness
CI=false npm run build
npx cap sync ios

if ! gem list --installed --exact cocoapods --version "$EXPECTED_COCOAPODS_VERSION" >/dev/null; then
  gem install cocoapods --version "$EXPECTED_COCOAPODS_VERSION" --no-document
fi
(
  cd ios/App
  pod _${EXPECTED_COCOAPODS_VERSION}_ install --deployment
)

rm -rf "$ARCHIVE_PATH" "$EXPORT_PATH"
: > "$IOS_LOG"

xcodebuild \
  -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE_PATH" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  PRODUCT_BUNDLE_IDENTIFIER="$EXPECTED_BUNDLE_ID" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  CODE_SIGN_STYLE=Manual \
  PROVISIONING_PROFILE_SPECIFIER="$profile_name" \
  CODE_SIGN_IDENTITY='Apple Distribution' \
  archive 2>&1 | tee -a "$IOS_LOG"

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS_PATH" 2>&1 | tee -a "$IOS_LOG"

ipa_path="$(find "$EXPORT_PATH" -maxdepth 1 -type f -name '*.ipa' -print -quit)"
if [[ -z "$ipa_path" || ! -s "$ipa_path" ]]; then
  echo "::error::Expected App Store IPA was not exported."
  exit 1
fi

payload_dir="${RUNNER_TEMP}/bin-group-ios-payload"
rm -rf "$payload_dir"
mkdir -p "$payload_dir"
unzip -q "$ipa_path" -d "$payload_dir"
app_path="$(find "$payload_dir/Payload" -maxdepth 1 -type d -name '*.app' -print -quit)"
if [[ -z "$app_path" ]]; then
  echo "::error::Exported IPA does not contain an application bundle."
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$app_path"
app_info="$app_path/Info.plist"
bundle_id="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_info")"
version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app_info")"
build="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$app_info")"
executable_name="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app_info")"
architectures="$(lipo -archs "$app_path/$executable_name")"

if [[ "$bundle_id" != "$EXPECTED_BUNDLE_ID" ]]; then
  echo "::error::Exported bundle ID $bundle_id does not match $EXPECTED_BUNDLE_ID."
  exit 1
fi
if [[ "$build" != "$BUILD_NUMBER" ]]; then
  echo "::error::Exported build number $build does not match requested build $BUILD_NUMBER."
  exit 1
fi
if [[ " $architectures " != *' arm64 '* || "$architectures" == *'x86_64'* ]]; then
  echo "::error::Exported iOS executable must contain arm64 and no simulator x86_64 slice: $architectures"
  exit 1
fi

embedded_profile_plist="${RUNNER_TEMP}/embedded-profile.plist"
security cms -D -i "$app_path/embedded.mobileprovision" > "$embedded_profile_plist"
embedded_uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$embedded_profile_plist")"
if [[ "$embedded_uuid" != "$profile_uuid" ]]; then
  echo "::error::Exported IPA does not embed the protected App Store provisioning profile."
  exit 1
fi

ipa_sha256="$(shasum -a 256 "$ipa_path" | awk '{print $1}')"
ipa_size="$(stat -f '%z' "$ipa_path")"
mkdir -p ios-release
cp "$ipa_path" ios-release/BIN-GROUP.ipa

EXPECTED_BUNDLE_ID="$EXPECTED_BUNDLE_ID" \
BUNDLE_ID="$bundle_id" \
VERSION="$version" \
BUILD_NUMBER="$build" \
ARCHITECTURES="$architectures" \
PROFILE_UUID="$profile_uuid" \
PROFILE_NAME="$profile_name" \
PROFILE_APPLICATION_IDENTIFIER="$profile_application_identifier" \
IPA_SHA256="$ipa_sha256" \
IPA_SIZE="$ipa_size" \
EVIDENCE_PATH="$EVIDENCE_PATH" \
python3 - <<'PY'
import json
import os
from pathlib import Path

result = {
    'schemaVersion': 1,
    'status': 'PASSED',
    'repository': os.environ.get('GITHUB_REPOSITORY', ''),
    'commitSha': os.environ.get('GITHUB_SHA', ''),
    'workflowRunId': os.environ.get('GITHUB_RUN_ID', ''),
    'bundleId': os.environ['BUNDLE_ID'],
    'expectedBundleId': os.environ['EXPECTED_BUNDLE_ID'],
    'version': os.environ['VERSION'],
    'buildNumber': os.environ['BUILD_NUMBER'],
    'architectures': os.environ['ARCHITECTURES'].split(),
    'artifact': {
        'path': 'ios-release/BIN-GROUP.ipa',
        'sha256': os.environ['IPA_SHA256'],
        'sizeBytes': int(os.environ['IPA_SIZE']),
        'codesignVerified': True,
    },
    'provisioning': {
        'uuid': os.environ['PROFILE_UUID'],
        'name': os.environ['PROFILE_NAME'],
        'applicationIdentifier': os.environ['PROFILE_APPLICATION_IDENTIFIER'],
        'embeddedProfileMatched': True,
    },
    'privateSigningMaterialExcludedFromArtifacts': True,
    'hardLaunchClaim': False,
}
Path(os.environ['EVIDENCE_PATH']).write_text(
    json.dumps(result, indent=2) + '\n',
    encoding='utf-8',
)
PY

cat "$EVIDENCE_PATH"
