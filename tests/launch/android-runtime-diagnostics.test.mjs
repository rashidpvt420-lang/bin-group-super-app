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

test('native bridge exposes a safe App Check cause chain without token logging', () => {
  assert.match(bridge, /APP_CHECK_INVALID_TOKEN_RESULT/);
  assert.match(bridge, /String diagnosticCode\(Throwable error\)/);
  assert.match(bridge, /getClass\(\)\.getSimpleName\(\)/);
  assert.match(bridge, /cursor\.getCause\(\)/);
  assert.doesNotMatch(bridge, /getMessage\(\)/);
  assert.doesNotMatch(bridge, /Log\.[a-z]+\([^\n]*token/i);
});

test('next Google Play App Check profile-read repair build uses versionCode 5', () => {
  assert.match(gradle, /versionCode\s+5\b/);
});
