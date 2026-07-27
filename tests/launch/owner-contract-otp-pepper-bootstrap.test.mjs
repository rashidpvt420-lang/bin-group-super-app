import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  chooseOwnerContractOtpPepperAction,
  classifyOwnerSecretAccessFailure,
  isValidOwnerContractOtpPepper,
} from '../../scripts/bootstrap-owner-contract-otp-pepper.mjs';

const [workflow, script, preflight] = await Promise.all([
  readFile(new URL('../../.github/workflows/bootstrap-owner-contract-otp-pepper.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/bootstrap-owner-contract-otp-pepper.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/lib/production-otp-mailbox-preflight.mjs', import.meta.url), 'utf8'),
]);

test('Owner contract OTP pepper bootstrap is owner-only, issue-bound and protected', () => {
  assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /github\.event\.issue\.pull_request == null/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch bootstrap-owner-contract-otp-pepper'/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /google-github-actions\/auth@c200f3691d83b41bf9bbd8638997a462592937ed/);
  assert.match(workflow, /google-github-actions\/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db/);
  assert.doesNotMatch(workflow, /pull_request:|workflow_run:/);
});

test('Owner bootstrap binds to stable exact current main before and after mutation', () => {
  assert.match(workflow, /git\/ref\/heads\/main/);
  assert.match(workflow, /second_sha.*first_sha/s);
  assert.match(workflow, /ref:\s*\$\{\{ needs\.authorize-owner-command\.outputs\.commit_sha \}\}/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /Current main moved to/);
  assert.match(workflow, /name:\s*Reverify exact main after protected mutation/);
  assert.match(workflow, /MAIN_ADVANCED_AFTER_SECRET_MUTATION/);
  assert.match(workflow, /BOOTSTRAP_STEP_DID_NOT_PRODUCE_EVIDENCE/);
  assert.match(workflow, /\.exactCommitSha == \$sha/);
  assert.match(workflow, /\.minimumLengthSatisfied == true/);
  assert.match(script, /EXACT_MAIN_SHA_REQUIRED/);
  assert.match(script, /CHECKOUT_SHA_MISMATCH/);
});

test('Owner pepper is generated cryptographically and streamed directly to Secret Manager', () => {
  assert.match(script, /OWNER_CONTRACT_OTP_PEPPER/);
  assert.match(script, /randomBytes\(48\)\.toString\('base64url'\)/);
  assert.match(script, /'secrets',\s*\n\s*'create'/);
  assert.match(script, /'versions',\s*\n\s*'add'/);
  assert.match(script, /'--data-file=-'/);
  assert.match(script, /input: secretValue/);
  assert.match(script, /verified\.value !== generated/);
  assert.match(script, /secretTransport:\s*'stdin'/);
  assert.match(script, /secretPersistedToRunnerDisk:\s*false/);
  assert.match(script, /secretValueLogged:\s*false/);
  assert.match(script, /hardLaunchClaim:\s*false/);
  assert.doesNotMatch(script, /mkdtempSync|tmpdir|secret-value|--data-file',\s*filePath/);
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*(?:generated|existing\.value|verified\.value)/);
  assert.doesNotMatch(workflow, /OWNER_CONTRACT_OTP_PEPPER:\s*\$\{\{/);
});

test('existing Owner secret resources receive a version instead of being recreated', () => {
  assert.equal(chooseOwnerContractOtpPepperAction({
    secretExists: false,
    accessStatus: 'missing',
    currentValue: '',
  }), 'created');
  assert.equal(chooseOwnerContractOtpPepperAction({
    secretExists: true,
    accessStatus: 'missing',
    currentValue: '',
  }), 'added-missing-version');
  assert.equal(chooseOwnerContractOtpPepperAction({
    secretExists: true,
    accessStatus: 'available',
    currentValue: 'short',
  }), 'rotated-invalid-value');
  assert.equal(chooseOwnerContractOtpPepperAction({
    secretExists: true,
    accessStatus: 'available',
    currentValue: 'x'.repeat(32),
  }), 'unchanged');
  assert.equal(chooseOwnerContractOtpPepperAction({
    secretExists: true,
    accessStatus: 'inaccessible',
    currentValue: '',
  }), 'fail-inaccessible');
  assert.match(script, /const secretExists = describedState === 'available'/);
  assert.match(script, /action === 'created'\) createSecret/);
  assert.match(script, /else addSecretVersion/);
});

test('valid existing Owner peppers are idempotent and ambiguous access fails closed', () => {
  assert.equal(isValidOwnerContractOtpPepper('x'.repeat(32)), true);
  assert.equal(isValidOwnerContractOtpPepper('x'.repeat(31)), false);
  assert.equal(classifyOwnerSecretAccessFailure('Error: secret does not exist'), 'missing');
  assert.equal(classifyOwnerSecretAccessFailure('Secret exists but does not have any versions'), 'missing');
  assert.equal(classifyOwnerSecretAccessFailure('No enabled versions are available'), 'missing');
  assert.equal(classifyOwnerSecretAccessFailure('PERMISSION_DENIED'), 'inaccessible');
  assert.equal(classifyOwnerSecretAccessFailure('403 Permission denied: secret not found'), 'inaccessible');
  assert.match(script, /SECRET_ACCESS_DENIED_OR_UNAVAILABLE/);
});

test('production preflight still requires the Owner contract pepper and cannot be bypassed', () => {
  assert.match(preflight, /'OWNER_CONTRACT_OTP_PEPPER'/);
  assert.match(preflight, /value\.length < 32/);
  assert.match(preflight, /missing or inaccessible in Firebase Secret Manager/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('sanitized evidence is always uploaded and never claims launch', () => {
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /secretPersistedToRunnerDisk:\s*false/);
  assert.match(workflow, /secretValueLogged:\s*false/);
  assert.match(workflow, /hardLaunchClaim:\s*false/);
  assert.match(workflow, /retention-days:\s*365/);
  assert.doesNotMatch(workflow, /echo .*OWNER_CONTRACT_OTP_PEPPER/);
});
