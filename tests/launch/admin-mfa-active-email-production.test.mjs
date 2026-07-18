import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildAdminMfaEvidence,
  summarizeAdminMfaUsers,
  validateAdminMfaEvidence,
} from '../../scripts/verify-admin-mfa-production.mjs';

const SHA = 'a'.repeat(40);
const ENV = {
  GITHUB_SHA: SHA,
  GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ID: '551122',
  GITHUB_RUN_ATTEMPT: '3',
};
const phoneFactor = { uid: 'factor', factorId: 'phone', displayName: 'Phone' };
const user = (uid, role, { emailVerified = true, disabled = false, status = 'active' } = {}) => ({
  uid,
  customClaims: { role },
  disabled,
  emailVerified,
  profileExists: true,
  profile: { status },
  multiFactor: { enrolledFactors: [phoneFactor] },
});

const readyUsers = () => [
  user('ceo-ready', 'ceo'),
  user('super-ready', 'super_admin'),
  user('finance-ready', 'finance_admin'),
];

const evidenceFailures = (evidence, now) => validateAdminMfaEvidence(evidence, {
  commitSha: SHA,
  repository: ENV.GITHUB_REPOSITORY,
  ref: ENV.GITHUB_REF,
  workflowRunId: ENV.GITHUB_RUN_ID,
  workflowRunAttempt: 3,
  now,
});

test('every active privileged account requires a verified Firebase Auth email', () => {
  const ready = summarizeAdminMfaUsers(readyUsers());
  assert.equal(ready.ok, true, ready.failures.join('\n'));
  assert.equal(ready.summary.activeAdminEmailUnverifiedCount, 0);
  assert.equal(ready.summary.allActiveAdminsEmailVerified, true);

  const unverifiedFinance = summarizeAdminMfaUsers([
    user('ceo-ready', 'ceo'),
    user('super-ready', 'super_admin'),
    user('finance-unverified', 'finance_admin', { emailVerified: false }),
  ]);
  assert.equal(unverifiedFinance.ok, false);
  assert.equal(unverifiedFinance.summary.activeAdminCount, 3);
  assert.equal(unverifiedFinance.summary.phoneMfaEnrolledCount, 3);
  assert.equal(unverifiedFinance.summary.activeAdminEmailUnverifiedCount, 1);
  assert.equal(unverifiedFinance.summary.allActiveAdminsEmailVerified, false);
  assert.match(unverifiedFinance.failures.join('\n'), /active Admin\/staff account\(s\) have unverified email/);
});

test('disabled and inactive privileged accounts do not block active email coverage', () => {
  const result = summarizeAdminMfaUsers([
    ...readyUsers(),
    user('disabled-unverified', 'admin', { emailVerified: false, disabled: true }),
    user('inactive-unverified', 'operations_manager', { emailVerified: false, status: 'suspended' }),
  ]);
  assert.equal(result.ok, true, result.failures.join('\n'));
  assert.equal(result.summary.activeAdminCount, 3);
  assert.equal(result.summary.disabledAdminCount, 1);
  assert.equal(result.summary.inactiveProfileAdminCount, 1);
  assert.equal(result.summary.activeAdminEmailUnverifiedCount, 0);
  assert.equal(result.summary.allActiveAdminsEmailVerified, true);
});

test('Admin MFA evidence is aggregate-only and fails closed on email-coverage tampering', () => {
  const now = new Date('2026-07-19T00:00:00.000Z');
  const summary = summarizeAdminMfaUsers(readyUsers()).summary;
  assert.throws(
    () => buildAdminMfaEvidence({ ...summary, activeAdminEmailUnverifiedCount: undefined }, { env: ENV, now }),
    /explicitly include activeAdminEmailUnverifiedCount/,
  );
  assert.throws(
    () => buildAdminMfaEvidence({ ...summary, allActiveAdminsEmailVerified: undefined }, { env: ENV, now }),
    /explicitly include allActiveAdminsEmailVerified/,
  );
  const evidence = buildAdminMfaEvidence(summary, { env: ENV, now });
  assert.equal(evidence.activeAdminEmailUnverifiedCount, 0);
  assert.equal(evidence.allActiveAdminsEmailVerified, true);
  assert.deepEqual(evidenceFailures(evidence, now.getTime()), []);
  assert.doesNotMatch(JSON.stringify(evidence), /@|ceo-ready|super-ready|finance-ready|phoneNumber|factorUid/);

  const tamperedCount = { ...evidence, activeAdminEmailUnverifiedCount: 1 };
  assert.match(evidenceFailures(tamperedCount, now.getTime()).join('\n'), /unverified active Admin emails/);

  const tamperedBoolean = { ...evidence, allActiveAdminsEmailVerified: false };
  assert.match(evidenceFailures(tamperedBoolean, now.getTime()).join('\n'), /all-active email verification/);
});

test('production Admin preflight source pins active-email coverage without logging identities', async () => {
  const source = await readFile(new URL('../../scripts/verify-admin-mfa-production.mjs', import.meta.url), 'utf8');
  assert.match(source, /activeAdminEmailUnverifiedCount/);
  assert.match(source, /allActiveAdminsEmailVerified/);
  assert.match(source, /activeAdminEmailUnverifiedCount > 0/);
  assert.match(source, /must explicitly include activeAdminEmailUnverifiedCount/);
  assert.match(source, /must explicitly include allActiveAdminsEmailVerified/);
  assert.match(source, /requireExact\(evidence\.activeAdminEmailUnverifiedCount, 0/);
  assert.match(source, /requireExact\(evidence\.allActiveAdminsEmailVerified, true/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:email|uid|phoneNumber|factorUid|displayName)/i);
});
