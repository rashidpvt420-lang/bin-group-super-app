#!/usr/bin/env bash
set -euo pipefail

EXPECTED_APP_ID="ae.bingroups.superapp"
KEYSTORE_PATH="android/app/bin-group-upload.jks"
KEYSTORE_PROPERTIES="android/keystore.properties"
AAB_PATH="android/app/build/outputs/bundle/release/app-release.aab"
APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
EVIDENCE_PATH="android-store-release-evidence.json"
GRADLE_LOG="android-store-release-gradle.log"

required=(
  ANDROID_UPLOAD_KEYSTORE_BASE64
  ANDROID_KEYSTORE_PASSWORD
  ANDROID_KEY_ALIAS
  ANDROID_KEY_PASSWORD
)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "::error::Missing required protected Android signing secret: $name"
    exit 1
  fi
done

if [[ "${GITHUB_ACTIONS:-}" != "true" || "${GITHUB_REF:-}" != "refs/heads/main" ]]; then
  echo "::error::Android store release builds are allowed only from the protected main workflow."
  exit 1
fi
if [[ ! "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "::error::Android store release requires an exact 40-character commit SHA."
  exit 1
fi

umask 077
cleanup() {
  rm -f "$KEYSTORE_PATH" "$KEYSTORE_PROPERTIES"
}
trap cleanup EXIT

mkdir -p "$(dirname "$KEYSTORE_PATH")"
ANDROID_UPLOAD_KEYSTORE_BASE64="$ANDROID_UPLOAD_KEYSTORE_BASE64" \
KEYSTORE_PATH="$KEYSTORE_PATH" \
python3 - <<'PY'
import base64
import os
from pathlib import Path

raw = os.environ['ANDROID_UPLOAD_KEYSTORE_BASE64'].strip()
try:
    decoded = base64.b64decode(raw, validate=True)
except Exception as error:
    raise SystemExit(f'Invalid ANDROID_UPLOAD_KEYSTORE_BASE64: {error}')
if not decoded:
    raise SystemExit('Decoded Android keystore is empty.')
Path(os.environ['KEYSTORE_PATH']).write_bytes(decoded)
PY

ANDROID_KEYSTORE_PASSWORD="$ANDROID_KEYSTORE_PASSWORD" \
ANDROID_KEY_ALIAS="$ANDROID_KEY_ALIAS" \
ANDROID_KEY_PASSWORD="$ANDROID_KEY_PASSWORD" \
KEYSTORE_PROPERTIES="$KEYSTORE_PROPERTIES" \
python3 - <<'PY'
import os
from pathlib import Path

def java_property(value: str) -> str:
    return (
        value.replace('\\', '\\\\')
        .replace('\r', '\\r')
        .replace('\n', '\\n')
        .replace('=', '\\=')
        .replace(':', '\\:')
    )

values = {
    'storeFile': 'app/bin-group-upload.jks',
    'storePassword': os.environ['ANDROID_KEYSTORE_PASSWORD'],
    'keyAlias': os.environ['ANDROID_KEY_ALIAS'],
    'keyPassword': os.environ['ANDROID_KEY_PASSWORD'],
}
Path(os.environ['KEYSTORE_PROPERTIES']).write_text(
    ''.join(f'{key}={java_property(value)}\n' for key, value in values.items()),
    encoding='utf-8',
)
PY

keytool -list \
  -keystore "$KEYSTORE_PATH" \
  -storepass "$ANDROID_KEYSTORE_PASSWORD" \
  -alias "$ANDROID_KEY_ALIAS" >/dev/null

npm ci --include=optional --legacy-peer-deps
npm run test:mobile-store-readiness
CI=false npm run build
npx cap sync android

: > "$GRADLE_LOG"
(
  cd android
  ./gradlew --no-daemon clean :app:assembleRelease :app:bundleRelease
) 2>&1 | tee "$GRADLE_LOG"

test -s "$AAB_PATH"
test -s "$APK_PATH"

aab_signing_report="$(mktemp)"
jarsigner -verify -verbose -certs "$AAB_PATH" > "$aab_signing_report" 2>&1
grep -q 'jar verified\.' "$aab_signing_report" || {
  cat "$aab_signing_report"
  echo "::error::Android App Bundle signature verification did not report a verified JAR."
  exit 1
}
rm -f "$aab_signing_report"

build_tools_dir="$(find "${ANDROID_HOME:?ANDROID_HOME is required}/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n 1)"
apksigner="$build_tools_dir/apksigner"
aapt="$build_tools_dir/aapt"
test -x "$apksigner"
test -x "$aapt"

apk_signing_report="$(mktemp)"
"$apksigner" verify --verbose --print-certs "$APK_PATH" > "$apk_signing_report"

package_line="$($aapt dump badging "$APK_PATH" | sed -n 's/^package: //p' | head -n 1)"
package_name="$(sed -n "s/.*name='\([^']*\)'.*/\1/p" <<<"$package_line")"
version_code="$(sed -n "s/.*versionCode='\([^']*\)'.*/\1/p" <<<"$package_line")"
version_name="$(sed -n "s/.*versionName='\([^']*\)'.*/\1/p" <<<"$package_line")"
if [[ "$package_name" != "$EXPECTED_APP_ID" ]]; then
  echo "::error::Release APK package $package_name does not match $EXPECTED_APP_ID"
  exit 1
fi

keystore_sha256="$(
  keytool -list -v \
    -keystore "$KEYSTORE_PATH" \
    -storepass "$ANDROID_KEYSTORE_PASSWORD" \
    -alias "$ANDROID_KEY_ALIAS" |
  sed -n 's/^[[:space:]]*SHA256:[[:space:]]*//p' |
  head -n 1 |
  tr '[:lower:]' '[:upper:]'
)"
apk_sha256="$(
  sed -n 's/^Signer #1 certificate SHA-256 digest: //p' "$apk_signing_report" |
  head -n 1 |
  tr '[:lower:]' '[:upper:]' |
  sed 's/../&:/g;s/:$//'
)"
rm -f "$apk_signing_report"

if [[ -z "$keystore_sha256" || -z "$apk_sha256" || "$keystore_sha256" != "$apk_sha256" ]]; then
  echo "::error::Release APK certificate does not match the protected upload keystore."
  exit 1
fi

aab_sha256="$(sha256sum "$AAB_PATH" | awk '{print $1}')"
aab_size="$(stat -c '%s' "$AAB_PATH")"

EXPECTED_APP_ID="$EXPECTED_APP_ID" \
PACKAGE_NAME="$package_name" \
VERSION_CODE="$version_code" \
VERSION_NAME="$version_name" \
CERTIFICATE_SHA256="$keystore_sha256" \
AAB_SHA256="$aab_sha256" \
AAB_SIZE="$aab_size" \
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
    'packageName': os.environ['PACKAGE_NAME'],
    'expectedPackageName': os.environ['EXPECTED_APP_ID'],
    'versionCode': os.environ['VERSION_CODE'],
    'versionName': os.environ['VERSION_NAME'],
    'artifact': {
        'path': 'android/app/build/outputs/bundle/release/app-release.aab',
        'sha256': os.environ['AAB_SHA256'],
        'sizeBytes': int(os.environ['AAB_SIZE']),
        'jarsignerVerified': True,
    },
    'signing': {
        'certificateSha256': os.environ['CERTIFICATE_SHA256'],
        'apkCertificateMatchedUploadKeystore': True,
        'privateKeyExcludedFromArtifacts': True,
    },
    'hardLaunchClaim': False,
}
Path(os.environ['EVIDENCE_PATH']).write_text(
    json.dumps(result, indent=2) + '\n',
    encoding='utf-8',
)
PY

cat "$EVIDENCE_PATH"
