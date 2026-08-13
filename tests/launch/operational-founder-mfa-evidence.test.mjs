import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { signInWithRequiredTotpMfa } from '../../scripts/lib/firebase-mfa-sign-in.mjs';

const workflow = readFileSync('.github/workflows/operational-application-evidence.yml', 'utf8');
const helper = readFileSync('scripts/lib/firebase-mfa-sign-in.mjs', 'utf8');
const wrapper = readFileSync('scripts/verify-operational-application-evidence-mfa.mjs', 'utf8');
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function fixtures() {
  const nonce = randomUUID().replaceAll('-', '');
  const totpSecret = Array.from(
    { length: 32 },
    (_, index) => BASE32_ALPHABET[(nonce.charCodeAt(index % nonce.length) + index * 11) % BASE32_ALPHABET.length],
  ).join('');
  return {
    apiKey: `test-api-${nonce}`,
    password: `test-password-${randomUUID()}`,
    totpSecret,
    pendingCredential: `test-pending-${randomUUID()}`,
    factorId: `test-factor-${randomUUID()}`,
    uid: `test-user-${randomUUID()}`,
  };
}

function jwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.test-signature`;
}

const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  async json() { return body; },
});

function verifiedClaims(fixture, overrides = {}) {
  return {
    uid: fixture.uid,
    sub: fixture.uid,
    email: 'ceo@bin-groups.com',
    email_verified: true,
    role: 'ceo',
    ceo: true,
    firebase: {
      sign_in_second_factor: 'totp',
      second_factor_identifier: fixture.factorId,
    },
    ...overrides,
  };
}

async function completeChallenge(overrides = {}) {
  const fixture = fixtures();
  let call = 0;
  const result = await signInWithRequiredTotpMfa({
    apiKey: fixture.apiKey,
    email: 'ceo@bin-groups.com',
    password: fixture.password,
    totpSecret: fixture.totpSecret,
    fetchImpl: async () => {
      call += 1;
      return call === 1
        ? response({
          mfaPendingCredential: fixture.pendingCredential,
          mfaInfo: [{ mfaEnrollmentId: fixture.factorId, totpInfo: {} }],
        })
        : response({ idToken: jwt({ sub: fixture.uid }) });
    },
    verifyIdTokenImpl: async () => verifiedClaims(fixture, overrides),
  });
  return { fixture, result };
}

test('operational MFA helper and canonical wrapper parse under Node', () => {
  for (const file of [
    'scripts/lib/firebase-mfa-sign-in.mjs',
    'scripts/verify-operational-application-evidence-mfa.mjs',
  ]) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${file} syntax failure:\n${result.stderr || result.stdout}`);
  }
});

test('verified Founder TOTP returns the unique server-verified factor identifier', async () => {
  const { fixture, result } = await completeChallenge();
  assert.equal(result.uid, fixture.uid);
  assert.equal(result.secondFactorType, 'totp');
  assert.equal(result.secondFactorIdentifier, fixture.factorId);
  assert.equal(result.secondFactor, fixture.factorId);
});

test('Founder TOTP retries a boundary rejection once in a fresh window', async () => {
  const fixture = fixtures();
  let call = 0;
  let timestamp = 60_000;
  const waits = [];
  const result = await signInWithRequiredTotpMfa({
    apiKey: fixture.apiKey,
    email: 'ceo@bin-groups.com',
    password: fixture.password,
    totpSecret: fixture.totpSecret,
    nowImpl: () => timestamp,
    waitImpl: async (milliseconds) => {
      waits.push(milliseconds);
      timestamp += milliseconds;
    },
    fetchImpl: async () => {
      call += 1;
      if (call === 1) {
        return response({
          mfaPendingCredential: fixture.pendingCredential,
          mfaInfo: [{ mfaEnrollmentId: fixture.factorId, totpInfo: {} }],
        });
      }
      if (call === 2) return response({ error: { message: 'INVALID_VERIFICATION_CODE' } }, 400);
      return response({ idToken: jwt({ sub: fixture.uid }) });
    },
    verifyIdTokenImpl: async () => verifiedClaims(fixture),
  });

  assert.equal(call, 3);
  assert.equal(waits.length, 1);
  assert.ok(waits[0] >= 30_000);
  assert.equal(result.secondFactorIdentifier, fixture.factorId);
});

test('Founder TOTP rejects unverified, non-Founder and mismatched-factor tokens', async () => {
  const cases = [
    [{ email_verified: false }, /canonical Founder email/],
    [{ role: 'admin', ceo: false }, /CEO or Super Admin Founder authority/],
    [{ firebase: { sign_in_second_factor: 'phone', second_factor_identifier: 'phone-factor' } }, /verified TOTP/],
    [{ firebase: { sign_in_second_factor: 'totp', second_factor_identifier: 'different-factor' } }, /factor identifier does not match/],
  ];
  for (const [overrides, pattern] of cases) {
    await assert.rejects(completeChallenge(overrides), pattern);
  }
});

test('operational workflow scopes Founder factors to the protected evidence step', () => {
  const steps = workflow.indexOf('\n    steps:');
  const evidence = workflow.indexOf('- name: Auto-discover, verify, and publish application evidence');
  const upload = workflow.indexOf('- name: Upload application proof batch');
  assert.ok(steps >= 0 && evidence > steps && upload > evidence);
  const jobScope = workflow.slice(0, steps);
  const evidenceScope = workflow.slice(evidence, upload);
  assert.doesNotMatch(jobScope, /E2E_FOUNDER_EMAIL:|E2E_FOUNDER_PASSWORD:|E2E_FOUNDER_TOTP_SECRET:/);
  assert.match(evidenceScope, /E2E_FOUNDER_EMAIL:/);
  assert.match(evidenceScope, /E2E_FOUNDER_PASSWORD:/);
  assert.match(evidenceScope, /E2E_FOUNDER_TOTP_SECRET:/);
  assert.match(evidenceScope, /verify-operational-application-evidence-mfa\.mjs/);
});

test('server verification and unique-factor hashing are mandatory', () => {
  assert.match(helper, /verifyIdToken\(idToken, true\)/);
  assert.match(helper, /second_factor_identifier/);
  assert.match(helper, /email_verified !== true/);
  assert.match(helper, /CEO or Super Admin Founder authority/);
  assert.doesNotMatch(helper, /response\.text\(\)|raw:\s*raw/);
  assert.match(wrapper, /replaySecondFactorHash = sha256\(verifiedMfa\.secondFactorIdentifier\)/);
  assert.doesNotMatch(wrapper, /sha256\(verifiedMfa\.secondFactorType\)/);
});

test('all bounded operational queries are expanded through a scoped pagination proxy', () => {
  assert.match(wrapper, /const PAGE_SIZE = 250/);
  assert.match(wrapper, /async function readAllMatchingSnapshot/);
  assert.match(wrapper, /FieldPath\.documentId\(\)/);
  assert.match(wrapper, /startAfter\(cursor\)/);
  assert.match(wrapper, /function installPaginatedQueryProxy/);
  assert.match(wrapper, /new Proxy\(query/);
  assert.match(wrapper, /property === 'limit'/);
  assert.match(wrapper, /get: \(\) => readAllMatchingSnapshot\(target\)/);
  assert.match(wrapper, /restoreCollection\(\)/);
  assert.doesNotMatch(wrapper, /writeFileSync\([^\n]*temporary|renameSync|randomUUID|pathToFileURL/);
  assert.equal(existsSync('scripts/run-operational-application-evidence-paginated.mjs'), false);
});
