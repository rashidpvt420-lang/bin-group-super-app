import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyProtectedSecretAccessFailure,
  resolveProtectedSecretValue,
  runProductionOtpMailboxPreflight,
} from '../../scripts/lib/production-otp-mailbox-preflight.mjs';

const predeploy = readFileSync('scripts/predeploy-approval-gate.mjs', 'utf8');
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

const b64 = (value) => Buffer.from(value).toString('base64url');
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; },
});

test('protected preflight verifies OAuth, profile, messages.list and messages.get full sentinel for both mailboxes', async () => {
  let tokenCounter = 0;
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push(url);
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenCounter += 1;
      return response({ access_token: `access-${tokenCounter}` });
    }
    const authorization = String(options.headers?.Authorization || '');
    if (url.endsWith('/profile')) {
      return response({ emailAddress: authorization.endsWith('access-1') ? 'owner-mailbox@example.com' : 'broker-mailbox@example.com' });
    }
    if (url.includes('/messages?maxResults=1')) return response({ messages: [{ id: authorization.endsWith('access-1') ? 'owner-sentinel' : 'broker-sentinel' }] });
    if (url.includes('?format=full')) return response({ payload: { mimeType: 'text/plain', body: { data: b64('sentinel body') } } });
    return response({}, 404);
  };
  const result = await runProductionOtpMailboxPreflight({
    env: {
      GCP_PROJECT_ID: 'bin-group-57c60',
      E2E_OWNER_MAILBOX_EMAIL: 'owner-mailbox@example.com',
      E2E_BROKER_MAILBOX_EMAIL: 'broker-mailbox@example.com',
    },
    fetchImpl,
    resolveSecret: (name) => secretValues.get(name) || '',
  });
  assert.equal(result.mailboxesVerified, 2);
  assert.equal(result.sentinelFullMessagesVerified, 2);
  assert.equal(calls.filter((url) => url.includes('?format=full')).length, 2);
});

test('preflight rejects weak peppers before mailbox access', async () => {
  let fetchCalled = false;
  await assert.rejects(runProductionOtpMailboxPreflight({
    env: {
      GCP_PROJECT_ID: 'bin-group-57c60',
      E2E_OWNER_MAILBOX_EMAIL: 'owner@example.com',
      E2E_BROKER_MAILBOX_EMAIL: 'broker@example.com',
    },
    fetchImpl: async () => { fetchCalled = true; return response({}); },
    resolveSecret: (name) => name === 'BROKER_PAYOUT_OTP_PEPPER' ? 'short' : secretValues.get(name) || '',
  }), /must contain at least 32 characters/);
  assert.equal(fetchCalled, false);
});

test('protected Secret Manager diagnostics distinguish runner, IAM and secret-state failures without provider output', () => {
  assert.match(
    classifyProtectedSecretAccessFailure('OWNER_CONTRACT_OTP_PEPPER', { message: 'spawnSync gcloud ENOENT' }),
    /Google Cloud CLI is unavailable/,
  );
  assert.match(
    classifyProtectedSecretAccessFailure('BROKER_PAYOUT_OTP_PEPPER', { stderr: 'PERMISSION_DENIED: secretmanager.versions.access' }),
    /roles\/secretmanager\.secretAccessor/,
  );
  assert.match(
    classifyProtectedSecretAccessFailure('BROKER_PAYOUT_OTP_PEPPER', { stderr: 'NOT_FOUND: no enabled versions' }),
    /missing or has no enabled version/,
  );
  assert.doesNotMatch(
    classifyProtectedSecretAccessFailure('OWNER_CONTRACT_OTP_PEPPER', { stderr: 'PERMISSION_DENIED: sensitive-provider-detail' }),
    /sensitive-provider-detail/,
  );
});

test('secret resolver falls back to gcloud when Firebase CLI returns an empty payload', () => {
  const calls = [];
  const value = resolveProtectedSecretValue('OWNER_CONTRACT_OTP_PEPPER', {
    env: {},
    projectId: 'bin-group-57c60',
    execFile: (command) => {
      calls.push(command);
      return command.startsWith('npx') ? '' : 'g'.repeat(48);
    },
  });

  assert.equal(value, 'g'.repeat(48));
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^npx/);
  assert.equal(calls[1], 'gcloud');
});

test('secret resolver reports an empty gcloud payload without exposing values', () => {
  assert.throws(
    () => resolveProtectedSecretValue('BROKER_PAYOUT_OTP_PEPPER', {
      env: {},
      projectId: 'bin-group-57c60',
      execFile: () => '',
    }),
    /empty latest enabled value/,
  );
});

test('production predeploy invokes mailbox verification before authorization result', () => {
  const preflightCall = predeploy.indexOf('await runProductionOtpMailboxPreflight()');
  const approvalCall = predeploy.indexOf('const result = runPredeployApprovalGate()');
  assert.ok(preflightCall >= 0 && approvalCall > preflightCall);
});

test('preflight source never logs or serializes credentials, tokens, bodies or OTP values', () => {
  assert.doesNotMatch(preflightSource, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(preflightSource, /JSON\.stringify\((?:credentials|accessToken|token|body|otp)\)/);
  assert.match(preflightSource, /secretValuesLogged:\s*false/);
});
