import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const diagnostics = readFileSync('src/runtime/androidRuntimeDiagnostics.ts', 'utf8');
const main = readFileSync('src/main.tsx', 'utf8');
const gradle = readFileSync('android/app/build.gradle', 'utf8');

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

test('next Google Play diagnostic build uses versionCode 3', () => {
  assert.match(gradle, /versionCode\s+3\b/);
});
