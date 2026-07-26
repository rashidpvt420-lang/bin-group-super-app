import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  chooseBootstrapAction,
  classifyAccessFailure,
  isValidPepper,
} from '../../scripts/bootstrap-owner-contract-otp-pepper.mjs';

const [workflow, bootstrap, preflight] = await Promise.all([
  readFile(new URL('../../.github/workflows/bootstrap-owner-contract-otp-pepper.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/bootstrap-owner-contract-otp-pepper.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../scripts/lib/production-otp-mailbox-preflight.mjs', import.meta.url), 'utf8'),
]);

test('Owner OTP pepper bootstrap is owner-only, issue-bound, and production-scoped', () => {
  assert.match(workflow, /issue_comment:\s*\n\s*types:\s*\[created\]/);
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /github\.event\.issue\.pull_request == null/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch bootstrap-owner-contract-otp-pepper'/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /permissions:\s*\{\}/);
  assert.match(workflow, /persist-credentials:\s*false/);
  assert.match(workflow, /google-github-actions\/auth@c200f3691d83b41bf9bbd8638997a462592937ed/);
  assert.match(workflow, /google-github-actions\/setup-gcloud@aa5489c8933f4cc7a4f7d45035b3b1440c9c10db/);
  assert.doesNotMatch(workflow, /pull_request:|workflow_run:/);
});

test('bootstrap binds to stable exact main before and after the protected mutation', () => {
  assert.match(workflow, /first_sha=.*git\/ref\/heads\/main/);
  assert.match(workflow, /second_sha=.*git\/ref\/heads\/main/);
  assert.match(workflow, /\[\[ "\$second_sha" == "\$first_sha" \]\]/);
  assert.match(workflow, /ref:\s*\$\{\{ needs\.authorize-owner-command\.outputs\.commit_sha \}\}/);
  assert.doesNotMatch(workflow, /ref:\s*main/);
  assert.match(workflow, /checked_out_sha=.*git rev-parse HEAD/);
  assert.match(workflow, /\[\[ "\$checked_out_sha" == "\$EXPECTED_COMMIT_SHA" \]\]/);
  assert.match(workflow, /current_main=.*git\/ref\/heads\/main/);
  assert.match(workflow, /Current main moved to/);
  assert.match(workflow, /name:\s*Reverify exact main after protected mutation/);
  assert.match(workflow, /MAIN_ADVANCED_AFTER_SECRET_MUTATION/);
  assert.match(workflow, /\.status = "failed"/);
  assert.match(workflow, /\.hardLaunchClaim = false/);
  assert.match(workflow, /\.exactCommitSha == \$sha/);
  assert.match(bootstrap, /EXACT_MAIN_SHA_REQUIRED/);
  assert.match(bootstrap, /CHECKOUT_SHA_MISMATCH/);
});

test('pepper is generated strongly and streamed without value disclosure', () => {
  assert.match(bootstrap, /randomBytes\(48\)\.toString\('base64url'\)/);
  assert.match(bootstrap, /'secrets',\s*\n\s*'create'/);
  assert.match(bootstrap, /'versions',\s*\n\s*'add'/);
  assert.match(bootstrap, /'versions',\s*\n\s*'access'/);
  assert.match(bootstrap, /'--data-file=-'/);
  assert.match(bootstrap, /input:\s*secretValue/);
  assert.match(bootstrap, /verified\.value !== generated/);
  assert.match(bootstrap, /secretTransport:\s*'stdin'/);
  assert.match(bootstrap, /secretPersistedToRunnerDisk:\s*false/);
  assert.match(bootstrap, /secretValueLogged:\s*false/);
  assert.match(bootstrap, /hardLaunchClaim:\s*false/);
  assert.doesNotMatch(bootstrap, /mkdtempSync|tmpdir|secretFile|writeFileSync\([^\n]*generated/);
  assert.doesNotMatch(bootstrap, /console\.(?:log|warn|error)\([^\n]*(?:generated|existing\.value|verified\.value)/);
  assert.doesNotMatch(workflow, /OWNER_CONTRACT_OTP_PEPPER:\s*\$\{\{/);
});

test('existing secret resources receive a version instead of being recreated', () => {
  assert.equal(chooseBootstrapAction({
    secretExists: false,
    accessStatus: 'missing',
    currentValue: '',
  }), 'created');
  assert.equal(chooseBootstrapAction({
    secretExists: true,
    accessStatus: 'missing',
    currentValue: '',
  }), 'added-missing-version');
  assert.equal(chooseBootstrapAction({
    secretExists: true,
    accessStatus: 'available',
    currentValue: 'short',
  }), 'rotated-invalid-value');
  assert.equal(chooseBootstrapAction({
    secretExists: true,
    accessStatus: 'available',
    currentValue: 'x'.repeat(32),
  }), 'unchanged');
  assert.equal(chooseBootstrapAction({
    secretExists: true,
    accessStatus: 'inaccessible',
    currentValue: '',
  }), 'fail-inaccessible');
  assert.match(bootstrap, /const secretExists = describedState === 'available'/);
  assert.match(bootstrap, /action === 'created'\) createSecret/);
  assert.match(bootstrap, /else addSecretVersion/);
});

test('valid existing peppers are idempotent and inaccessible secrets fail closed', () => {
  assert.equal(isValidPepper('x'.repeat(32)), true);
  assert.equal(isValidPepper('x'.repeat(31)), false);
  assert.equal(classifyAccessFailure('Error: secret does not exist'), 'missing');
  assert.equal(classifyAccessFailure('PERMISSION_DENIED'), 'inaccessible');
  assert.match(bootstrap, /'unchanged'/);
  assert.match(bootstrap, /SECRET_ACCESS_DENIED_OR_UNAVAILABLE/);
});

test('production preflight still requires the Owner pepper and is not bypassed', () => {
  assert.match(preflight, /'OWNER_CONTRACT_OTP_PEPPER'/);
  assert.match(preflight, /'BROKER_PAYOUT_OTP_PEPPER'/);
  assert.match(preflight, /value\.length < 32/);
  assert.match(preflight, /missing or inaccessible in Firebase Secret Manager/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test('workflow always emits sanitized evidence and never claims launch', () => {
  assert.match(workflow, /BOOTSTRAP_STEP_DID_NOT_PRODUCE_EVIDENCE/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /minimumLengthSatisfied == true/);
  assert.match(workflow, /secretPersistedToRunnerDisk:\s*false/);
  assert.match(workflow, /secretValueLogged:\s*false/);
  assert.match(workflow, /hardLaunchClaim:\s*false/);
  assert.match(workflow, /retention-days:\s*365/);
  assert.doesNotMatch(workflow, /echo .*OWNER_CONTRACT_OTP_PEPPER/);
});
