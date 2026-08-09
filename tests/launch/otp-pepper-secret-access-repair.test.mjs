import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repairOtpPepperSecretAccess } from '../../scripts/repair-otp-pepper-secret-access.mjs';

const workflow = readFileSync('.github/workflows/repair-otp-pepper-secret-access.yml', 'utf8');

const SHA = 'a'.repeat(40);
const env = {
  GITHUB_ACTIONS: 'true',
  DEPLOYMENT_ENVIRONMENT: 'production',
  GCP_PROJECT_ID: 'bin-group-57c60',
  EXPECTED_COMMIT_SHA: SHA,
  CHECKED_OUT_COMMIT_SHA: SHA,
  DEPLOYMENT_SERVICE_ACCOUNT: 'deploy@bin-group-57c60.iam.gserviceaccount.com',
};

test('repair binds only the two OTP peppers to secretAccessor and never reports their values', () => {
  const calls = [];
  const report = repairOtpPepperSecretAccess({
    env,
    gcloud: (args) => {
      calls.push(args);
      return {
        status: 0,
        stdout: args.includes('access') ? 'x'.repeat(48) : '',
        stderr: '',
      };
    },
  });

  assert.equal(report.status, 'passed');
  assert.deepEqual(report.verifiedSecretNames, ['BROKER_PAYOUT_OTP_PEPPER', 'OWNER_CONTRACT_OTP_PEPPER']);
  assert.equal(report.secretValuesLogged, false);
  assert.equal(report.secretValuesPersistedToRunnerDisk, false);
  assert.equal(calls.length, 4);
  for (const args of calls.filter((args) => args.includes('add-iam-policy-binding'))) {
    assert.ok(args.includes('--role=roles/secretmanager.secretAccessor'));
    assert.ok(args.some((entry) => entry === 'BROKER_PAYOUT_OTP_PEPPER' || entry === 'OWNER_CONTRACT_OTP_PEPPER'));
  }
});

test('repair fails closed on inaccessible IAM policy writes and never forwards provider output', () => {
  assert.throws(
    () => repairOtpPepperSecretAccess({
      env,
      gcloud: () => ({ status: 1, stderr: 'PERMISSION_DENIED sensitive-provider-detail', stdout: '' }),
    }),
    /SECRET_ACCESS_BINDING_PERMISSION_DENIED/,
  );
});

test('workflow is owner-command-only, exact-main-bound, production-protected and value-free', () => {
  assert.match(workflow, /github\.event\.comment\.body == '\/bin-launch repair-otp-pepper-secret-access'/);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /roles\/secretmanager\.secretAccessor/);
  assert.match(workflow, /BROKER_PAYOUT_OTP_PEPPER/);
  assert.match(workflow, /OWNER_CONTRACT_OTP_PEPPER/);
  assert.doesNotMatch(workflow, /echo .*DEPLOYMENT_SERVICE_ACCOUNT/);
});
