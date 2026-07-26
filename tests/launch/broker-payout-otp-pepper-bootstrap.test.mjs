import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  classifyAccessFailure,
  isValidPepper,
} from '../../scripts/bootstrap-broker-payout-otp-pepper.mjs';

const [workflow, script, preflight] = await Promise.all([
  readFile(new URL('../../.github/workflows/bootstrap-broker-payout-otp-pepper.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/bootstrap-broker-payout-otp-pepper.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/lib/production-otp-mailbox-preflight.mjs', import.meta.url), 'utf8'),
]);

test('Broker OTP pepper bootstrap is owner-only, issue-bound and protected by production environment', () => {
  assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /github\.event\.issue\.pull_request == null/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch bootstrap-broker-payout-otp-pepper'/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /google-github-actions\/auth@c200f3691d83b41bf9bbd8638997a462592937ed/);
  assert.doesNotMatch(workflow, /pull_request:|workflow_run:/);
});

test('bootstrap binds to stable current main and never accepts branch drift', () => {
  assert.match(workflow, /git\/ref\/heads\/main/);
  assert.match(workflow, /second_sha.*first_sha/s);
  assert.match(workflow, /ref:\s*\$\{\{ needs\.authorize-owner-command\.outputs\.commit_sha \}\}/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /Current main moved to/);
  assert.match(script, /EXACT_MAIN_SHA_REQUIRED/);
  assert.match(script, /CHECKOUT_SHA_MISMATCH/);
});

test('bootstrap creates a cryptographic secret through a temporary 0600 file and verifies it without logging it', () => {
  assert.match(script, /randomBytes\(48\)\.toString\('base64url'\)/);
  assert.match(script, /functions:secrets:set/);
  assert.match(script, /--data-file/);
  assert.match(script, /functions:secrets:access/);
  assert.match(script, /mode:\s*0o600/);
  assert.match(script, /verified\.value !== generated/);
  assert.match(script, /secretValueLogged:\s*false/);
  assert.match(script, /hardLaunchClaim:\s*false/);
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*(?:generated|existing\.value|verified\.value)/);
  assert.doesNotMatch(workflow, /BROKER_PAYOUT_OTP_PEPPER:\s*\$\{\{/);
});

test('valid existing peppers are idempotent and inaccessible secrets fail closed', () => {
  assert.equal(isValidPepper('x'.repeat(32)), true);
  assert.equal(isValidPepper('x'.repeat(31)), false);
  assert.equal(classifyAccessFailure('Error: secret does not exist'), 'missing');
  assert.equal(classifyAccessFailure('PERMISSION_DENIED'), 'inaccessible');
  assert.match(script, /action = 'unchanged'/);
  assert.match(script, /SECRET_ACCESS_DENIED_OR_UNAVAILABLE/);
});

test('production preflight still requires the Broker payout pepper and is not bypassed', () => {
  assert.match(preflight, /'BROKER_PAYOUT_OTP_PEPPER'/);
  assert.match(preflight, /value\.length < 32/);
  assert.match(preflight, /missing or inaccessible in Firebase Secret Manager/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});
