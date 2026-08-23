import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const verifier = readFileSync('scripts/verify-android-play-integrity-appcheck.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/android-store-release.yml', 'utf8');

test('Android release verifier binds the production project, package, app ID and Play signing SHA-256', () => {
  assert.match(verifier, /PROJECT_ID = 'bin-group-57c60'/);
  assert.match(verifier, /PROJECT_NUMBER = '123413252227'/);
  assert.match(verifier, /PACKAGE_NAME = 'ae\.bingroups\.superapp'/);
  assert.match(verifier, /EXPECTED_PLAY_SIGNING_SHA256/);
  assert.match(verifier, /certType: 'SHA_256'/);
  assert.match(verifier, /playIntegrityConfig/);
  assert.match(verifier, /allowUnrecognizedVersion === true/);
});

test('Android release gate may repair only the expected SHA certificate and never disables App Check', () => {
  assert.match(verifier, /process\.argv\.includes\('--repair-sha'\)/);
  assert.match(verifier, /method: 'POST'/);
  assert.match(verifier, /Google Play App Signing SHA-256 is not registered/);
  assert.doesNotMatch(verifier, /debugToken/i);
  assert.doesNotMatch(verifier, /enforcementMode\s*[:=]\s*['"]OFF/i);
  assert.doesNotMatch(verifier, /allowUnrecognizedVersion\s*:\s*true/);
});

test('signed AAB workflow authenticates with short-lived OIDC and gates before Gradle build', () => {
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /google-github-actions\/auth@v2/);
  assert.match(workflow, /token_format: access_token/);
  assert.match(workflow, /verify-android-play-integrity-appcheck\.mjs --repair-sha/);
  assert.match(workflow, /android-play-integrity-appcheck-proof\.json/);

  const gate = workflow.indexOf('Repair and verify Play Integrity App Check registration');
  const build = workflow.indexOf('Build and cryptographically verify signed AAB');
  assert.ok(gate >= 0 && build >= 0 && gate < build, 'App Check gate must run before the AAB build');
});
