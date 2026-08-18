import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  androidWorkflow,
  androidScript,
  iosWorkflow,
  iosScript,
] = await Promise.all([
  readFile(new URL('../../.github/workflows/android-store-release.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/run-android-store-release.sh', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/ios-app-store-release.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/run-ios-app-store-release.sh', import.meta.url), 'utf8'),
]);

function resolveBash() {
  const candidates = [
    'bash',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    'C:\\msys64\\usr\\bin\\bash.exe',
  ];
  for (const candidate of candidates) {
    if (candidate !== 'bash' && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0 && /GNU bash/.test(result.stdout)) return candidate;
  }
  return null;
}

function assertBashSyntax(path) {
  const bash = resolveBash();
  assert.ok(bash, 'A usable GNU Bash executable is required for release script syntax validation.');
  const result = spawnSync(bash, ['-n', path], { encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `${path} must pass bash -n:\n${result.stderr || result.stdout}`,
  );
}

function assertProductionFirebaseContract(workflow) {
  assert.match(workflow, /VITE_FIREBASE_AUTH_DOMAIN: bin-group-57c60\.firebaseapp\.com/);
  assert.match(workflow, /VITE_FIREBASE_PROJECT_ID: bin-group-57c60/);
  assert.match(workflow, /VITE_FIREBASE_STORAGE_BUCKET: bin-group-57c60\.firebasestorage\.app/);
  assert.match(workflow, /VITE_FIREBASE_VAPID_KEY: \$\{\{ secrets\.VITE_FIREBASE_VAPID_KEY \}\}/);
  assert.match(workflow, /VITE_ENABLE_FIREBASE_APPCHECK: 'true'/);
  assert.match(workflow, /VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: ''/);
  assert.match(workflow, /\[\[ -z "\$VITE_FIREBASE_APPCHECK_DEBUG_TOKEN" \]\]/);
}

test('store release shell scripts pass bash syntax validation', () => {
  assertBashSyntax('scripts/run-android-store-release.sh');
  assertBashSyntax('scripts/run-ios-app-store-release.sh');
});

test('Android SHA-256 fingerprint normalization accepts tool formatting differences', () => {
  const bash = resolveBash();
  assert.ok(bash, 'A usable GNU Bash executable is required for fingerprint normalization validation.');

  const normalizer = androidScript.match(/normalize_sha256\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(normalizer, 'Android release script must define normalize_sha256().');

  const bare = 'A1'.repeat(32);
  const coloned = bare.match(/.{2}/g).join(':');
  for (const input of [bare.toLowerCase(), coloned.toLowerCase(), `  ${coloned}  `]) {
    const result = spawnSync(
      bash,
      ['-c', `${normalizer}\nnormalize_sha256 "$1"`, 'normalize-sha256', input],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout, bare);
  }

  const malformed = spawnSync(
    bash,
    ['-c', `${normalizer}\nnormalize_sha256 "$1"`, 'normalize-sha256', 'AA:BB'],
    { encoding: 'utf8' },
  );
  assert.notEqual(malformed.status, 0, 'Malformed SHA-256 fingerprints must fail closed.');
});

test('Android store release is manual, exact-main, production-protected, and signed', () => {
  assert.match(androidWorkflow, /^name: Android Store Release AAB/m);
  assert.match(androidWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(androidWorkflow, /^\s+pull_request:/m);
  assert.doesNotMatch(androidWorkflow, /^\s+push:/m);
  assert.match(androidWorkflow, /environment: production/);
  assert.match(androidWorkflow, /BUILD_SIGNED_ANDROID_AAB_BIN_GROUP/);
  assert.match(androidWorkflow, /EXPECTED_COMMIT_SHA.*inputs\.expected_commit_sha/s);
  assert.match(androidWorkflow, /\[\[ "\$EXPECTED_COMMIT_SHA" == "\$GITHUB_SHA" \]\]/);
  assert.match(androidWorkflow, /Verify main has not moved before signing/);
  assert.match(androidWorkflow, /Verify main remained frozen through signing/);
  assertProductionFirebaseContract(androidWorkflow);

  for (const secret of [
    'ANDROID_UPLOAD_KEYSTORE_BASE64',
    'ANDROID_KEYSTORE_PASSWORD',
    'ANDROID_KEY_ALIAS',
    'ANDROID_KEY_PASSWORD',
  ]) {
    assert.match(androidWorkflow, new RegExp(`secrets\\.${secret}`));
    assert.match(androidScript, new RegExp(secret));
  }

  assert.match(androidScript, /EXPECTED_APP_ID="ae\.bingroups\.superapp"/);
  assert.match(androidScript, /bash \.\/gradlew --no-daemon clean :app:assembleRelease :app:bundleRelease/);
  assert.doesNotMatch(androidScript, /^\s*\.\/gradlew --no-daemon/m);
  assert.match(androidScript, /:app:assembleRelease :app:bundleRelease/);
  assert.match(androidScript, /jarsigner -verify -verbose -certs/);
  assert.match(androidScript, /keytool -printcert -jarfile "\$AAB_PATH"/);
  assert.match(androidScript, /Release AAB certificate does not match the protected upload keystore/);
  assert.match(androidScript, /apksigner.*verify --verbose --print-certs/s);
  assert.match(androidScript, /aapt dump badging/);
  assert.match(androidScript, /package_name="\$\(sed -n "s\/\^name='/);
  assert.doesNotMatch(androidScript, /package_name="\$\(sed -n "s\/\.\*name='/);
  assert.match(androidScript, /normalize_sha256\(\)/);
  assert.match(androidScript, /tr -cd '\[:xdigit:\]'/);
  assert.match(androidScript, /extract_apksigner_sha256_lines\(\)/);
  assert.match(androidScript, /resolve_apksigner_sha256\(\)/);
  assert.match(androidScript, /certificate SHA-256 digest/);
  assert.match(androidScript, /V\[0-9\]\+\(\\\.\[0-9\]\+\)\?/);
  assert.match(androidScript, /resolved_apk_sha256="\$\(resolve_apksigner_sha256 "\$apk_signing_report"\)"/);
  assert.match(androidScript, /multiple distinct signer SHA-256 fingerprints/);
  assert.match(androidScript, /apk_sha256="\$resolved_apk_sha256"/);
  assert.doesNotMatch(androidScript, /apk_sha256="\$\([\s\S]*sed 's\/\.\.\/&:\/g/);
  assert.match(androidScript, /Release APK certificate does not match the protected upload keystore/);
  assert.match(androidScript, /aabCertificateMatchedUploadKeystore': True/);
  assert.match(androidScript, /apkCertificateMatchedUploadKeystore': True/);
  assert.match(androidScript, /trap cleanup EXIT/);
  assert.match(androidScript, /rm -f "\$KEYSTORE_PATH" "\$KEYSTORE_PROPERTIES"/);

  assert.match(androidWorkflow, /android\/app\/build\/outputs\/bundle\/release\/app-release\.aab/);
  assert.match(androidWorkflow, /android-store-release-evidence\.json/);
  assert.match(androidWorkflow, /if-no-files-found: error/);
  assert.doesNotMatch(androidWorkflow, /bin-group-upload\.jks\s*$/m);
});

test('iOS App Store release is manual, exact-main, production-protected, and distribution signed', () => {
  assert.match(iosWorkflow, /^name: iOS App Store Release IPA/m);
  assert.match(iosWorkflow, /workflow_dispatch:/);
  assert.doesNotMatch(iosWorkflow, /^\s+pull_request:/m);
  assert.doesNotMatch(iosWorkflow, /^\s+push:/m);
  assert.match(iosWorkflow, /environment: production/);
  assert.match(iosWorkflow, /BUILD_SIGNED_IOS_IPA_BIN_GROUP/);
  assert.match(iosWorkflow, /\[\[ "\$EXPECTED_COMMIT_SHA" == "\$GITHUB_SHA" \]\]/);
  assert.match(iosWorkflow, /\[\[ "\$BUILD_NUMBER" =~ \^\[1-9\]\[0-9\]\*\$ \]\]/);
  assert.match(iosWorkflow, /Verify main has not moved before signing/);
  assert.match(iosWorkflow, /Verify main remained frozen through signing/);
  assertProductionFirebaseContract(iosWorkflow);

  for (const secret of [
    'APPLE_DISTRIBUTION_CERTIFICATE_P12_BASE64',
    'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD',
    'APPLE_PROVISIONING_PROFILE_BASE64',
    'APPLE_TEAM_ID',
  ]) {
    assert.match(iosWorkflow, new RegExp(`secrets\\.${secret}`));
    assert.match(iosScript, new RegExp(secret));
  }

  assert.match(iosScript, /EXPECTED_BUNDLE_ID="ae\.bingroups\.superapp"/);
  assert.match(iosScript, /security create-keychain/);
  assert.match(iosScript, /security find-identity.*Apple Distribution/s);
  assert.match(iosScript, /Provisioning profile is not an App Store distribution profile/);
  assert.match(iosScript, /'method': 'app-store-connect'/);
  assert.match(iosScript, /-destination 'generic\/platform=iOS'/);
  assert.match(iosScript, /CODE_SIGN_STYLE=Manual/);
  assert.match(iosScript, /CODE_SIGN_IDENTITY='Apple Distribution'/);
  assert.match(iosScript, /-exportArchive/);
  assert.match(iosScript, /codesign --verify --deep --strict/);
  assert.match(iosScript, /lipo -archs/);
  assert.match(iosScript, /embedded_uuid.*profile_uuid/s);
  assert.match(iosScript, /trap cleanup EXIT/);

  assert.match(iosWorkflow, /xcrun altool[\s\S]*--validate-app/);
  assert.match(iosWorkflow, /xcrun altool[\s\S]*--upload-app/);
  assert.match(iosWorkflow, /ios-release\/BIN-GROUP\.ipa/);
  assert.match(iosWorkflow, /ios-app-store-release-evidence\.json/);
  assert.match(iosWorkflow, /name: Upload signed iOS release artifact[\s\S]*if-no-files-found: error/);
  assert.match(iosWorkflow, /name: Upload TestFlight receipt[\s\S]*if-no-files-found: error/);
  assert.doesNotMatch(iosWorkflow, /apple-distribution\.p12|app-store\.mobileprovision|bin-group-signing\.keychain/);
});
