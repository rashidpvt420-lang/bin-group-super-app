import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runProductionOtpMailboxPreflight } from '../../scripts/lib/production-otp-mailbox-preflight.mjs';

const predeploy = readFileSync('scripts/predeploy-approval-gate.mjs', 'utf8');
const envGuard = readFileSync('scripts/verify-e2e-env.mjs', 'utf8');
const liveRoleWorkflow = readFileSync('.github/workflows/live-role-smoke.yml', 'utf8');
const preflightSource = readFileSync('scripts/lib/production-otp-mailbox-preflight.mjs', 'utf8');

const secretValues = new Map([
  ['BROKER_PAYOUT_OTP_PEPPER', 'b'.repeat(48)],
  ['OWNER_CONTRACT_OTP_PEPPER', 'o'.repeat(48)],
  ['E2E_OWNER_MAILBOX_CLIENT_ID', 'owner-client'],
  ['E2E_OWNER_MAILBOX_CLIENT_SECRET', 'owner-secret'],
  ['E2E_OWNER_MAILBOX_REFRESH_TOKEN', 'owner-refresh'],
  ['E2E_BROKER_MAILBOX_CLIENT_ID', 'broker-client'],
  ['E2E_BROKER_MAILBOX_CLIENT_SECRET', 'broker-secret'],
  ['E2E_BROKER_MAILBOX_REFRESH_TOKEN', 'broker-refresh'],
]);

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('protected OTP/mailbox preflight verifies both peppers and both mailbox identities without exposing secrets', async () => {
  let tokenCounter = 0;
  const fetchImpl = async (url, options = {}) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenCounter += 1;
      return response({ access_token: `access-${tokenCounter}` });
    }
    const authorization = String(options.headers?.Authorization || '');
    if (url.endsWith('/profile')) {
      return response({ emailAddress: authorization.endsWith('access-1') ? 'owner@example.com' : 'broker@example.com' });
    }
    if (url.includes('/messages?maxResults=1')) return response({ messages: [] });
    return response({}, 404);
  };

  const result = await runProductionOtpMailboxPreflight({
    env: {
      GCP_PROJECT_ID: 'bin-group-57c60',
      E2E_OWNER_MAILBOX_EMAIL: 'owner@example.com',
      E2E_BROKER_MAILBOX_EMAIL: 'broker@example.com',
    },
    fetchImpl,
    resolveSecret: (name) => secretValues.get(name) || '',
  });

  assert.equal(result.ok, true);
  assert.equal(result.peppersVerified, 2);
  assert.equal(result.mailboxesVerified, 2);
  assert.equal(result.secretValuesLogged, false);
  assert.equal(result.hardLaunchClaim, false);
});

test('preflight rejects a weak OTP pepper before mailbox access', async () => {
  let fetchCalled = false;
  await assert.rejects(
    runProductionOtpMailboxPreflight({
      env: {
        GCP_PROJECT_ID: 'bin-group-57c60',
        E2E_OWNER_MAILBOX_EMAIL: 'owner@example.com',
        E2E_BROKER_MAILBOX_EMAIL: 'broker@example.com',
      },
      fetchImpl: async () => {
        fetchCalled = true;
        return response({});
      },
      resolveSecret: (name) => name === 'BROKER_PAYOUT_OTP_PEPPER' ? 'too-short' : secretValues.get(name) || '',
    }),
    /BROKER_PAYOUT_OTP_PEPPER must contain at least 32 characters/,
  );
  assert.equal(fetchCalled, false);
});

test('preflight aggregates every locally detectable protected credential blocker without leaking resolver errors', async () => {
  let fetchCalled = false;
  let failure;
  try {
    await runProductionOtpMailboxPreflight({
      env: {
        GCP_PROJECT_ID: 'bin-group-57c60',
        E2E_OWNER_MAILBOX_EMAIL: '',
        E2E_BROKER_MAILBOX_EMAIL: 'broker@example.com',
      },
      fetchImpl: async () => {
        fetchCalled = true;
        return response({});
      },
      resolveSecret: (name) => {
        if (name === 'BROKER_PAYOUT_OTP_PEPPER') return 'too-short';
        if (name === 'E2E_OWNER_MAILBOX_CLIENT_ID') throw new Error('resolver-secret-payload-must-not-leak');
        if (name === 'E2E_BROKER_MAILBOX_REFRESH_TOKEN') return '';
        return secretValues.get(name) || '';
      },
    });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof Error);
  assert.match(failure.message, /found 4 blockers/);
  assert.match(failure.message, /BROKER_PAYOUT_OTP_PEPPER must contain at least 32 characters/);
  assert.match(failure.message, /E2E_OWNER_MAILBOX_EMAIL is required for protected mailbox verification/);
  assert.match(failure.message, /E2E_OWNER_MAILBOX_CLIENT_ID is missing or inaccessible/);
  assert.match(failure.message, /E2E_BROKER_MAILBOX_REFRESH_TOKEN is missing or inaccessible/);
  assert.doesNotMatch(failure.message, /resolver-secret-payload-must-not-leak/);
  assert.equal(fetchCalled, false);
});

test('production predeploy gate runs secret and mailbox verification before authorization can pass', () => {
  const preflightCall = predeploy.indexOf('await runProductionOtpMailboxPreflight()');
  const approvalCall = predeploy.indexOf('const result = runPredeployApprovalGate()');
  assert.ok(preflightCall >= 0);
  assert.ok(approvalCall > preflightCall);
  assert.match(predeploy, /blocked deployment/);
});

test('protected E2E guard runs the same preflight before live fixture seeding', () => {
  assert.match(envGuard, /Firebase Production Deploy/);
  assert.match(envGuard, /Live Role Smoke Tests/);
  assert.match(envGuard, /await runProductionOtpMailboxPreflight\(\)/);
  assert.match(envGuard, /secret_values_logged=false/);
});

test('Live Role Smoke injects canonical Founder MFA secrets and requires them for live evidence', () => {
  for (const name of [
    'E2E_FOUNDER_EMAIL',
    'E2E_FOUNDER_PASSWORD',
    'E2E_FOUNDER_TOTP_SECRET',
    'E2E_FOUNDER_REAL_MFA_CODE',
  ]) {
    assert.match(liveRoleWorkflow, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  assert.match(liveRoleWorkflow, /E2E_REQUIRE_FOUNDER_MFA:\s*'true'/);
  assert.match(envGuard, /E2E_FOUNDER_EMAIL\(must-differ-from-ephemeral-admin\)/);
});

test('preflight source never prints or serializes protected secret values', () => {
  assert.doesNotMatch(preflightSource, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(preflightSource, /JSON\.stringify\((?:credentials|accessToken|token)\)/);
  assert.doesNotMatch(preflightSource, /return\s*\{\s*accessToken\b/);
  assert.match(preflightSource, /secretValuesLogged:\s*false/);
});
