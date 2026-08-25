import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const diagnostics = readFileSync('src/runtime/androidRuntimeDiagnostics.ts', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const bridge = readFileSync('android/app/src/main/java/ae/bingroups/superapp/FirebaseAppCheckBridgePlugin.java', 'utf8');

test('Android production diagnostics expose only safe stage and error code', () => {
  assert.match(diagnostics, /isNativeAndroid/);
  assert.match(diagnostics, /stage=\$\{safeStage\}/);
  assert.match(diagnostics, /code=\$\{safeErrorCode\}/);
  assert.match(diagnostics, /No credential or token data is shown/);
  assert.doesNotMatch(diagnostics, /payload\.message/);
  assert.doesNotMatch(diagnostics, /emailAttempted/);
  assert.doesNotMatch(diagnostics, /password/);
});

test('diagnostics install before the application bootstrap', () => {
  const diagnosticImport = main.indexOf("import './runtime/androidRuntimeDiagnostics';");
  const appImport = main.indexOf("import App from './App';");
  assert.ok(diagnosticImport >= 0);
  assert.ok(appImport >= 0);
  assert.ok(diagnosticImport < appImport);
});

test('App Check failure remains the visible root cause when profile read subsequently fails', () => {
  assert.match(diagnostics, /APP_CHECK_ROOT_CAUSE_WINDOW_MS/);
  assert.match(diagnostics, /rememberAppCheckFailure/);
  assert.match(diagnostics, /recentAppCheckFailure/);
  assert.match(diagnostics, /showDiagnostic\(appCheckRootCause\.stage, appCheckRootCause\.code\)/);
});

test('native bridge classifies App Check attestation failures without returning credentials or raw error text', () => {
  assert.match(bridge, /APP_CHECK_INVALID_TOKEN_RESULT/);
  assert.match(bridge, /String diagnosticCode\(Throwable error\)/);
  assert.match(bridge, /ATTEST403/);
  assert.match(bridge, /PI_-2_PLAYSTORE/);
  assert.match(bridge, /PI_-8_THROTTLED/);
  assert.match(bridge, /installerState\(\)/);
  assert.match(bridge, /signingState\(\)/);
  assert.match(bridge, /EXPECTED_PLAY_SIGNING_SHA256/);
  assert.match(bridge, /5B907128BD19514E4D3F804B1E4583D15F0B65F51D61746F6804DAE1B2DCD26C/);
  assert.match(bridge, /call\.reject\("Unable to obtain Firebase App Check token\."/);
  assert.doesNotMatch(bridge, /result\.put\("message"/);
  // Returning the App Check token to the JS CustomProvider is required. The
  // safeguard is that token material must never be written to logs/stdout.
  assert.doesNotMatch(bridge, /Log\.[a-z]+\([^\n]*token/i);
  assert.doesNotMatch(bridge, /System\.out\.print(?:ln)?\([^\n]*token/i);
});

test('next Google Play App Check signer repair build uses versionCode 7', () => {
  assert.match(gradle, /versionCode\s+7\b/);
});
