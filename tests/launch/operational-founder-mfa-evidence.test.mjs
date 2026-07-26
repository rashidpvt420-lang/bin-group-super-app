import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { signInWithRequiredTotpMfa } from '../../scripts/lib/firebase-mfa-sign-in.mjs';

const workflow = readFileSync('.github/workflows/operational-application-evidence.yml', 'utf8');
const verifier = readFileSync('scripts/verify-operational-application-evidence.mjs', 'utf8');
const paginatedRunner = readFileSync('scripts/run-operational-application-evidence-paginated.mjs', 'utf8');
const provenance = readFileSync('scripts/verify-operational-application-provenance.mjs', 'utf8');
const helper = readFileSync('scripts/lib/firebase-mfa-sign-in.mjs', 'utf8');
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function generatedFixtures() {
  const nonce = randomUUID().replaceAll('-', '');
  const totpSecret = Array.from(
    { length: 32 },
    (_, index) => BASE32_ALPHABET[(index * 7 + nonce.charCodeAt(index % nonce.length)) % BASE32_ALPHABET.length],
  ).join('');
  return {
    apiKey: `test-api-${nonce}`,
    password: `test-password-${nonce}`,
    totpSecret,
    pendingCredential: `test-pending-${randomUUID()}`,
    enrollmentId: `test-factor-${randomUUID()}`,
    uid: `test-user-${randomUUID()}`,
    diagnosticMarker: `test-diagnostic-${randomUUID()}`,
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

function verifiedFounderClaims(fixture, overrides = {}) {
  return {
    uid: fixture.uid,
    sub: fixture.uid,
    email: 'ceo@bin-groups.com',
    email_verified: true,
    role: 'ceo',
    ceo: true,
    firebase: {
      sign_in_second_factor: 'totp',
      second_factor_identifier: fixture.enrollmentId,
    },
    ...overrides,
  };
}

function verificationStub(fixture, overrides = {}) {
  return async () => verifiedFounderClaims(fixture, overrides);
}

function totpFlow(fixture, idToken) {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(String(options.body || '{}')) });
    if (String(url).includes('accounts:signInWithPassword')) {
      return response({
        mfaPendingCredential: fixture.pendingCredential,
        mfaInfo: [{ mfaEnrollmentId: fixture.enrollmentId, totpInfo: {} }],
      });
    }
    if (String(url).includes('mfaSignIn:finalize')) return response({ idToken });
    return response({}, 404);
  };
  return { requests, fetchImpl };
}

test('canonical Founder operational evidence completes a real Firebase TOTP challenge', async () => {
  const fixture = generatedFixtures();
  const idToken = jwt({ sub: fixture.uid });
  const { requests, fetchImpl } = totpFlow(fixture, idToken);

  const result = await signInWithRequiredTotpMfa({
    apiKey: fixture.apiKey,
    email: 'ceo@bin-groups.com',
    password: fixture.password,
    totpSecret: fixture.totpSecret,
    fetchImpl,
    verifyIdTokenImpl: verificationStub(fixture),
  });

  assert.equal(result.uid, fixture.uid);
  assert.equal(result.secondFactorType, 'totp');
  assert.equal(result.secondFactorIdentifier, fixture.enrollmentId);
  assert.equal(result.secondFactor, fixture.enrollmentId);
  assert.equal(result.idToken, idToken);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.email, 'ceo@bin-groups.com');
  assert.equal(requests[1].body.mfaPendingCredential, fixture.pendingCredential);
  assert.equal(requests[1].body.mfaEnrollmentId, fixture.enrollmentId);
  assert.match(requests[1].body.totpVerificationInfo.verificationCode, /^\d{6}$/);
});

test('Founder MFA helper refuses a direct token without a verified TOTP factor', async () => {
  const fixture = generatedFixtures();
  const directToken = jwt({ sub: fixture.uid });
  await assert.rejects(
    signInWithRequiredTotpMfa({
      apiKey: fixture.apiKey,
      email: 'ceo@bin-groups.com',
      password: fixture.password,
      totpSecret: fixture.totpSecret,
      fetchImpl: async () => response({ idToken: directToken }),
      verifyIdTokenImpl: verificationStub(fixture, { firebase: {} }),
    }),
    /verified TOTP second-factor session/,
  );
});

test('Founder MFA helper rejects a mismatched TOTP factor identifier', async () => {
  const fixture = generatedFixtures();
  const idToken = jwt({ sub: fixture.uid });
  const { fetchImpl } = totpFlow(fixture, idToken);
  await assert.rejects(
    signInWithRequiredTotpMfa({
      apiKey: fixture.apiKey,
      email: 'ceo@bin-groups.com',
      password: fixture.password,
      totpSecret: fixture.totpSecret,
      fetchImpl,
      verifyIdTokenImpl: verificationStub(fixture, {
        firebase: {
          sign_in_second_factor: 'totp',
          second_factor_identifier: `other-${fixture.enrollmentId}`,
        },
      }),
    }),
    /factor identifier does not match/,
  );
});

test('Founder MFA helper fails closed when Firebase Admin SDK rejects the token', async () => {
  const fixture = generatedFixtures();
  const idToken = jwt({ sub: fixture.uid });
  const { fetchImpl } = totpFlow(fixture, idToken);
  await assert.rejects(
    signInWithRequiredTotpMfa({
      apiKey: fixture.apiKey,
      email: 'ceo@bin-groups.com',
      password: fixture.password,
      totpSecret: fixture.totpSecret,
      fetchImpl,
      verifyIdTokenImpl: async () => { throw new Error('invalid signature'); },
    }),
    /Admin SDK rejected/,
  );
});

test('Founder MFA helper rejects non-canonical or non-Founder verified identities', async () => {
  const fixture = generatedFixtures();
  const idToken = jwt({ sub: fixture.uid });
  const { fetchImpl } = totpFlow(fixture, idToken);
  for (const [overrides, pattern] of [
    [{ email: 'other@bin-groups.com' }, /canonical Founder email/],
    [{ email_verified: false }, /canonical Founder email/],
    [{ role: 'admin', ceo: false }, /CEO or Super Admin Founder authority/],
  ]) {
    await assert.rejects(
      signInWithRequiredTotpMfa({
        apiKey: fixture.apiKey,
        email: 'ceo@bin-groups.com',
        password: fixture.password,
        totpSecret: fixture.totpSecret,
        fetchImpl,
        verifyIdTokenImpl: verificationStub(fixture, overrides),
      }),
      pattern,
    );
  }
});

test('malformed Firebase provider responses never enter error diagnostics', async () => {
  const fixture = generatedFixtures();
  const malformed = {
    ok: false,
    status: 502,
    async json() { throw new Error(fixture.diagnosticMarker); },
  };
  await assert.rejects(
    signInWithRequiredTotpMfa({
      apiKey: fixture.apiKey,
      email: 'ceo@bin-groups.com',
      password: fixture.password,
      totpSecret: fixture.totpSecret,
      fetchImpl: async () => malformed,
      verifyIdTokenImpl: verificationStub(fixture),
    }),
    (error) => {
      assert.match(error.message, /HTTP 502/);
      assert.doesNotMatch(error.message, new RegExp(fixture.diagnosticMarker));
      return true;
    },
  );
});

test('Founder password and TOTP are scoped only to the protected replay-verifier step', () => {
  const stepsIndex = workflow.indexOf('\n    steps:');
  const replayStepIndex = workflow.indexOf('- name: Auto-discover, verify, and publish application evidence');
  const uploadStepIndex = workflow.indexOf('- name: Upload application proof batch');
  assert.ok(stepsIndex >= 0 && replayStepIndex > stepsIndex && uploadStepIndex > replayStepIndex);

  const jobScope = workflow.slice(0, stepsIndex);
  const replayStep = workflow.slice(replayStepIndex, uploadStepIndex);
  for (const name of [
    'E2E_FOUNDER_EMAIL',
    'E2E_FOUNDER_PASSWORD',
    'E2E_FOUNDER_TOTP_SECRET',
  ]) {
    assert.doesNotMatch(jobScope, new RegExp(`${name}:`));
    assert.match(replayStep, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  assert.match(workflow, /environment:\s*hard-public-launch/);
  assert.match(workflow, /production_deploy_run_id/);
});

test('operational payment and commission replays are bound to the server-verified TOTP identifier', () => {
  assert.match(verifier, /signInWithRequiredTotpMfa/);
  assert.match(verifier, /email !== 'ceo@bin-groups\.com'/);
  assert.match(helper, /verifyIdToken\(idToken, true\)/);
  assert.match(helper, /second_factor_identifier/);
  assert.match(helper, /email_verified !== true/);
  assert.match(helper, /CEO or Super Admin Founder authority/);
  assert.match(paginatedRunner, /secondFactorIdentifier: founderAuth\.secondFactorIdentifier/);
  assert.match(paginatedRunner, /secondFactorHash: sha256\(auth\.secondFactorIdentifier\)/);
  assert.doesNotMatch(verifier, /E2E_ADMIN_EMAIL\)\.toLowerCase\(\)/);
});

test('provenance and application evidence both scan every matching Firestore page', () => {
  for (const source of [provenance, paginatedRunner]) {
    assert.match(source, /const PAGE_SIZE = 250/);
    assert.match(source, /readAllMatchingDocuments/);
    assert.match(source, /FieldPath\.documentId\(\)/);
    assert.match(source, /startAfter\(cursor\)/);
  }
  assert.match(provenance, /scannedDocumentCount/);
  assert.doesNotMatch(provenance, /query\.limit\(100\)/);
  assert.match(paginatedRunner, /replaceExactlyOnce/);
  assert.match(paginatedRunner, /approved-payment selector/);
  assert.match(paginatedRunner, /notification selector/);
  assert.match(paginatedRunner, /Broker commission selector/);
  assert.match(paginatedRunner, /staff-audit selector/);
  assert.match(paginatedRunner, /renewal-watch selector/);
  assert.match(workflow, /node scripts\/run-operational-application-evidence-paginated\.mjs/);
  assert.doesNotMatch(workflow, /node scripts\/verify-operational-application-evidence\.mjs/);
});

test('Founder MFA helper never serializes raw provider response bodies or token values', () => {
  assert.doesNotMatch(helper, /response\.text\(\)/);
  assert.doesNotMatch(helper, /raw:\s*raw/);
  assert.doesNotMatch(helper, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(helper, /invalid signature/);
  assert.match(helper, /providerError/);
});
