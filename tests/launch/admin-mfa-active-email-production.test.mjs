import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildAdminMfaEvidence,
  CANONICAL_FOUNDER_EMAIL,
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
const user = (uid, role, {
  email = CANONICAL_FOUNDER_EMAIL,
  emailVerified = true,
  disabled = false,
  status = 'active',
  factors = [phoneFactor],
} = {}) => ({
  uid,
  email,
  customClaims: { role },
  disabled,
  emailVerified,
  profileExists: true,
  profile: { status },
  multiFactor: { enrolledFactors: factors },
});

const readyUsers = () => [user('founder-ready', 'ceo')];

const evidenceFailures = (evidence, now) => validateAdminMfaEvidence(evidence, {
  commitSha: SHA,
  repository: ENV.GITHUB_REPOSITORY,
  ref: ENV.GITHUB_REF,
  workflowRunId: ENV.GITHUB_RUN_ID,
  workflowRunAttempt: 3,
  now,
});

test('the canonical founder requires a verified Firebase Auth email', () => {
  const ready = summarizeAdminMfaUsers(readyUsers());
  assert.equal(ready.ok, true, ready.failures.join('\n'));
  assert.equal(ready.summary.activeAdminEmailUnverifiedCount, 0);
  assert.equal(ready.summary.allActiveAdminsEmailVerified, true);

  const unverified = summarizeAdminMfaUsers([
    user('founder-unverified', 'ceo', { emailVerified: false }),
  ]);
  assert.equal(unverified.ok, false);
  assert.equal(unverified.summary.activeAdminCount, 1);
  assert.equal(unverified.summary.activeAdminEmailUnverifiedCount, 1);
  assert.equal(unverified.summary.allActiveAdminsEmailVerified, false);
  assert.match(unverified.failures.join('\n'), /unverified email/);
});

test('disabled, inactive and additional privileged accounts block until deleted', () => {
  const disabled = summarizeAdminMfaUsers([
    ...readyUsers(),
    user('disabled-old-admin', 'admin', {
      email: 'old-admin@bin-groups.com',
      disabled: true,
    }),
  ]);
  assert.equal(disabled.ok, false);
  assert.equal(disabled.summary.unexpectedPrivilegedAccountCount, 1);
  assert.equal(disabled.summary.disabledAdminCount, 1);
  assert.match(disabled.failures.join('\n'), /must be deleted|disabled instead of being deleted/);

  const inactive = summarizeAdminMfaUsers([
    ...readyUsers(),
    user('inactive-old-admin', 'operations_manager', {
      email: 'old-operations@bin-groups.com',
      status: 'suspended',
    }),
  ]);
  assert.equal(inactive.ok, false);
  assert.equal(inactive.summary.inactiveProfileAdminCount, 1);
  assert.match(inactive.failures.join('\n'), /inactive instead of being deleted/);
});

test('Admin MFA evidence is aggregate-only and fails closed on founder-email tampering', () => {
  const now = new Date('2026-07-20T00:00:00.000Z');
  const summary = summarizeAdminMfaUsers(readyUsers()).summary;
  assert.throws(
    () => buildAdminMfaEvidence({ ...summary, activeAdminEmailUnverifiedCount: undefined }, { env: ENV, now }),
    /explicitly include activeAdminEmailUnverifiedCount/,
  );
  assert.throws(
    () => buildAdminMfaEvidence({ ...summary, founderSingletonReady: undefined }, { env: ENV, now }),
    /explicitly include founderSingletonReady/,
  );
  const evidence = buildAdminMfaEvidence(summary, { env: ENV, now });
  assert.equal(evidence.activeAdminEmailUnverifiedCount, 0);
  assert.equal(evidence.allActiveAdminsEmailVerified, true);
  assert.equal(evidence.founderSingletonReady, true);
  assert.deepEqual(evidenceFailures(evidence, now.getTime()), []);
  assert.doesNotMatch(JSON.stringify(evidence), /@|founder-ready|phoneNumber|factorUid/);

  const tamperedCount = { ...evidence, activeAdminEmailUnverifiedCount: 1 };
  assert.match(evidenceFailures(tamperedCount, now.getTime()).join('\n'), /unverified active Admin emails/);

  const tamperedBoolean = { ...evidence, allActiveAdminsEmailVerified: false };
  assert.match(evidenceFailures(tamperedBoolean, now.getTime()).join('\n'), /all-active email verification/);
});

test('production Admin preflight pins canonical founder email coverage without logging identities', async () => {
  const source = await readFile(new URL('../../scripts/verify-admin-mfa-production.mjs', import.meta.url), 'utf8');
  assert.match(source, /CANONICAL_FOUNDER_EMAIL/);
  assert.match(source, /activeAdminEmailUnverifiedCount/);
  assert.match(source, /allActiveAdminsEmailVerified/);
  assert.match(source, /founderSingletonReady/);
  assert.match(source, /unexpectedPrivilegedAccountCount/);
  assert.match(source, /requireExact\(evidence\.activeAdminEmailUnverifiedCount, 0/);
  assert.match(source, /requireExact\(evidence\.allActiveAdminsEmailVerified, true/);
  assert.doesNotMatch(source, /console\.log\([^\n]*(?:email|uid|phoneNumber|factorUid|displayName)/i);
});
