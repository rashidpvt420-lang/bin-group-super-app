import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signInWithRequiredTotpMfa } from '../../scripts/lib/firebase-mfa-sign-in.mjs';

const workflow = readFileSync('.github/workflows/operational-application-evidence.yml', 'utf8');
const helper = readFileSync('scripts/lib/firebase-mfa-sign-in.mjs', 'utf8');
const runner = readFileSync('scripts/run-operational-application-evidence-paginated.mjs', 'utf8');

const response = (body) => ({ ok: true, status: 200, async json() { return body; } });
const token = 'a.b.c';
const factorId = 'factor-unique-id';
const verifiedClaims = (overrides = {}) => ({
  uid: 'founder-uid',
  email: 'ceo@bin-groups.com',
  email_verified: true,
  role: 'ceo',
  firebase: {
    sign_in_second_factor: 'totp',
    second_factor_identifier: factorId,
  },
  ...overrides,
});

async function completeChallenge(overrides = {}) {
  let call = 0;
  return signInWithRequiredTotpMfa({
    apiKey: 'api-key',
    email: 'ceo@bin-groups.com',
    password: 'credential-value',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    fetchImpl: async () => {
      call += 1;
      return call === 1
        ? response({ mfaPendingCredential: 'pending', mfaInfo: [{ mfaEnrollmentId: factorId, totpInfo: {} }] })
        : response({ idToken: token });
    },
    verifyIdTokenImpl: async () => verifiedClaims(overrides),
  });
}

test('verified Founder TOTP returns the unique factor identifier', async () => {
  const result = await completeChallenge();
  assert.equal(result.uid, 'founder-uid');
  assert.equal(result.secondFactorType, 'totp');
  assert.equal(result.secondFactorIdentifier, factorId);
  assert.equal(result.secondFactor, factorId);
});

test('Founder TOTP rejects unverified, non-Founder and wrong-factor tokens', async () => {
  for (const [overrides, pattern] of [
    [{ email_verified: false }, /canonical Founder email/],
    [{ role: 'admin' }, /CEO or Super Admin Founder authority/],
    [{ firebase: { sign_in_second_factor: 'phone', second_factor_identifier: factorId } }, /verified TOTP/],
    [{ firebase: { sign_in_second_factor: 'totp', second_factor_identifier: 'different' } }, /factor identifier does not match/],
  ]) await assert.rejects(completeChallenge(overrides), pattern);
});

test('operational workflow scopes Founder factors to the protected evidence step', () => {
  const steps = workflow.indexOf('\n    steps:');
  const evidence = workflow.indexOf('- name: Auto-discover, verify, and publish application evidence');
  const upload = workflow.indexOf('- name: Upload application proof batch');
  const jobScope = workflow.slice(0, steps);
  const evidenceScope = workflow.slice(evidence, upload);
  assert.doesNotMatch(jobScope, /E2E_FOUNDER_EMAIL:|E2E_FOUNDER_PASSWORD:|E2E_FOUNDER_TOTP_SECRET:/);
  assert.match(evidenceScope, /E2E_FOUNDER_EMAIL:/);
  assert.match(evidenceScope, /E2E_FOUNDER_PASSWORD:/);
  assert.match(evidenceScope, /E2E_FOUNDER_TOTP_SECRET:/);
});

test('server verification and unique-factor hashing are mandatory', () => {
  assert.match(helper, /verifyIdToken\(idToken, true\)/);
  assert.match(helper, /second_factor_identifier/);
  assert.match(helper, /email_verified !== true/);
  assert.match(helper, /CEO or Super Admin Founder authority/);
  assert.doesNotMatch(helper, /response\.text\(\)|raw:\s*raw/);
  assert.match(runner, /secondFactorHash: sha256\(auth\.secondFactorIdentifier\)/);
  assert.doesNotMatch(runner, /sha256\(auth\.secondFactor\)/);
});

test('all count-sensitive operational queries are prepared for full pagination', () => {
  for (const label of [
    'approved-payment selector',
    'notification selector',
    'Broker commission selector',
    'staff-audit selector',
    'renewal-watch selector',
    'Owner property count query',
    'payment invoice exactly-once queries',
    'payment audit exactly-once queries',
    'commission exactly-once queries',
    'staff creation audit count query',
  ]) assert.match(runner, new RegExp(label));
  assert.match(runner, /readAllMatchingSnapshot/);
  assert.match(runner, /a reviewed obsolete evidence path survived hardening/);
});
