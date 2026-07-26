import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { signInWithRequiredTotpMfa } from '../../scripts/lib/firebase-mfa-sign-in.mjs';

const helperSource = readFileSync('scripts/lib/firebase-mfa-sign-in.mjs', 'utf8');
const runnerSource = readFileSync('scripts/verify-operational-application-evidence-mfa.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/operational-application-evidence.yml', 'utf8');
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function fixture() {
  const nonce = randomUUID().replaceAll('-', '');
  return {
    apiKey: `api-${nonce}`,
    password: `password-${nonce}`,
    pending: `pending-${nonce}`,
    factorId: `factor-${nonce}`,
    uid: `uid-${nonce}`,
    marker: `private-response-${nonce}`,
    totpSecret: Array.from({ length: 32 }, (_, index) => BASE32[(nonce.charCodeAt(index % nonce.length) + index) % BASE32.length]).join(''),
  };
}

function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.test-signature`;
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return body; },
  };
}

test('Founder sign-in proves TOTP and the exact enrolled factor identifier', async () => {
  const value = fixture();
  const token = jwt({
    user_id: value.uid,
    firebase: {
      sign_in_second_factor: 'totp',
      second_factor_identifier: value.factorId,
    },
  });
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), body: JSON.parse(String(options.body || '{}')) });
    if (String(url).includes('accounts:signInWithPassword')) {
      return response({
        mfaPendingCredential: value.pending,
        mfaInfo: [{ mfaEnrollmentId: value.factorId, totpInfo: {} }],
      });
    }
    if (String(url).includes('mfaSignIn:finalize')) return response({ idToken: token });
    return response({}, 404);
  };

  const result = await signInWithRequiredTotpMfa({
    apiKey: value.apiKey,
    email: 'ceo@bin-groups.com',
    password: value.password,
    totpSecret: value.totpSecret,
    fetchImpl,
  });

  assert.equal(result.uid, value.uid);
  assert.equal(result.secondFactorType, 'totp');
  assert.equal(result.secondFactorIdentifier, value.factorId);
  assert.equal(result.idToken, token);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].body.mfaEnrollmentId, value.factorId);
  assert.match(requests[1].body.totpVerificationInfo.verificationCode, /^\d{6}$/);
});

test('Founder sign-in rejects another factor type or identifier', async () => {
  const value = fixture();
  const execute = async (firebaseClaims) => signInWithRequiredTotpMfa({
    apiKey: value.apiKey,
    email: 'ceo@bin-groups.com',
    password: value.password,
    totpSecret: value.totpSecret,
    fetchImpl: async (url) => {
      if (String(url).includes('accounts:signInWithPassword')) {
        return response({
          mfaPendingCredential: value.pending,
          mfaInfo: [{ mfaEnrollmentId: value.factorId, totpInfo: {} }],
        });
      }
      return response({ idToken: jwt({ user_id: value.uid, firebase: firebaseClaims }) });
    },
  });

  await assert.rejects(
    execute({ sign_in_second_factor: 'phone', second_factor_identifier: value.factorId }),
    /verified TOTP second-factor session/,
  );
  await assert.rejects(
    execute({ sign_in_second_factor: 'totp', second_factor_identifier: `other-${value.factorId}` }),
    /factor identifier does not match the completed challenge/,
  );
});

test('Firebase provider response bodies never enter Founder authentication diagnostics', async () => {
  const value = fixture();
  await assert.rejects(
    signInWithRequiredTotpMfa({
      apiKey: value.apiKey,
      email: 'ceo@bin-groups.com',
      password: value.password,
      totpSecret: value.totpSecret,
      fetchImpl: async () => ({
        ok: false,
        status: 502,
        async json() { throw new Error(value.marker); },
      }),
    }),
    (error) => {
      assert.match(error.message, /HTTP 502/);
      assert.doesNotMatch(error.message, new RegExp(value.marker));
      return true;
    },
  );
  assert.doesNotMatch(helperSource, /response\.text\(\)/);
  assert.doesNotMatch(helperSource, /raw:\s*raw/);
  assert.doesNotMatch(helperSource, /console\.(?:log|warn|error)/);
});

test('operational evidence scans every matching record and hashes the verified TOTP identifier', () => {
  for (const required of [
    'const PAGE_SIZE = 250;',
    'readAllMatchingDocuments(baseQuery)',
    'FieldPath.documentId()',
    'startAfter(cursor)',
    'approved-payment selector',
    'notification selector',
    'Broker commission selector',
    'staff-audit selector',
    'renewal-watch selector',
    'verifiedMfa.secondFactorType !== \'totp\'',
    'sha256(verifiedMfa.secondFactorIdentifier)',
    'applicationSelectorPagination = { pageSize: PAGE_SIZE, completeScan: true }',
  ]) {
    assert.ok(runnerSource.includes(required), `missing operational hardening control: ${required}`);
  }
  assert.doesNotMatch(runnerSource, /sha256\(verifiedMfa\.secondFactor\)/);
  assert.match(runnerSource, /rmSync\(TEMPORARY_PATH, \{ force: true \}\)/);
});

test('Founder credentials are scoped only to the protected replay step', () => {
  const stepsIndex = workflow.indexOf('\n    steps:');
  const replayStepIndex = workflow.indexOf('- name: Auto-discover, verify, and publish application evidence');
  const uploadStepIndex = workflow.indexOf('- name: Upload application proof batch');
  assert.ok(stepsIndex >= 0 && replayStepIndex > stepsIndex && uploadStepIndex > replayStepIndex);
  const jobScope = workflow.slice(0, stepsIndex);
  const replayStep = workflow.slice(replayStepIndex, uploadStepIndex);
  for (const name of ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'E2E_FOUNDER_TOTP_SECRET']) {
    assert.doesNotMatch(jobScope, new RegExp(`${name}:`));
    assert.match(replayStep, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  assert.doesNotMatch(workflow, /E2E_ADMIN_EMAIL:\s*\$\{\{ secrets\./);
  assert.doesNotMatch(workflow, /E2E_ADMIN_PASSWORD:\s*\$\{\{ secrets\./);
  assert.match(workflow, /environment:\s*hard-public-launch/);
});
