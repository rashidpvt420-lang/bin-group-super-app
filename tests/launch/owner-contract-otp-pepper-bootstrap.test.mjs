import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/bootstrap-owner-contract-otp-pepper.yml', 'utf8');
const bootstrap = readFileSync('scripts/bootstrap-owner-contract-otp-pepper.mjs', 'utf8');

test('Owner OTP pepper bootstrap is owner-only and production-scoped', () => {
  assert.match(workflow, /github\.event\.issue\.number == 434/);
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch bootstrap-owner-contract-otp-pepper'/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /permissions: \{\}/);
  assert.match(workflow, /persist-credentials: false/);
});

test('bootstrap binds to stable exact main before and after the protected mutation', () => {
  assert.match(workflow, /first_sha=.*git\/ref\/heads\/main/);
  assert.match(workflow, /second_sha=.*git\/ref\/heads\/main/);
  assert.match(workflow, /\[\[ "\$second_sha" == "\$first_sha" \]\]/);
  assert.match(workflow, /ref: main/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ needs\.authorize-owner-command\.outputs\.commit_sha \}\}/);
  assert.match(workflow, /checked_out_sha=.*git rev-parse HEAD/);
  assert.match(workflow, /\[\[ "\$checked_out_sha" == "\$EXPECTED_COMMIT_SHA" \]\]/);
  assert.match(workflow, /name: Reverify exact main after protected mutation/);
  assert.match(workflow, /MAIN_ADVANCED_AFTER_SECRET_MUTATION/);
  assert.match(workflow, /\.status = "failed"/);
  assert.match(workflow, /\.hardLaunchClaim = false/);
  assert.match(workflow, /\.exactCommitSha == \$sha/);
});

test('pepper is generated strongly and streamed without value disclosure', () => {
  assert.match(bootstrap, /randomBytes\(48\)\.toString\('base64url'\)/);
  assert.match(bootstrap, /'--data-file=-'/);
  assert.match(bootstrap, /secretTransport: 'stdin'/);
  assert.match(bootstrap, /secretPersistedToRunnerDisk: false/);
  assert.match(bootstrap, /secretValueLogged: false/);
  assert.match(bootstrap, /SECRET_ACCESS_DENIED_OR_UNAVAILABLE/);
  assert.doesNotMatch(bootstrap, /writeFileSync\([^\n]*generated/);
  assert.doesNotMatch(bootstrap, /console\.(?:log|warn|error)\([^\n]*generated/);
});

test('workflow always emits sanitized evidence and never claims launch', () => {
  assert.match(workflow, /BOOTSTRAP_STEP_DID_NOT_PRODUCE_EVIDENCE/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /secretPersistedToRunnerDisk: false/);
  assert.match(workflow, /secretValueLogged: false/);
  assert.match(workflow, /hardLaunchClaim: false/);
  assert.match(workflow, /retention-days: 365/);
  assert.doesNotMatch(workflow, /echo .*OWNER_CONTRACT_OTP_PEPPER/);
});
