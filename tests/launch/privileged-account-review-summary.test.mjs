import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizePrivilegedAccountReview } from '../../scripts/review-privileged-accounts-production.mjs';

const founder = (overrides = {}) => ({
  uid: 'founder-uid',
  email: 'ceo@bin-groups.com',
  disabled: false,
  emailVerified: true,
  profileExists: true,
  profile: { status: 'active', suspended: false },
  customClaims: { role: 'super_admin', super_admin: true },
  multiFactor: { enrolledFactors: [{ factorId: 'phone' }] },
  ...overrides,
});

const obsoleteAdmin = {
  uid: 'obsolete-admin',
  email: 'old-admin@example.com',
  disabled: false,
  emailVerified: false,
  profileExists: true,
  profile: { status: 'active' },
  customClaims: { role: 'admin', admin: true },
  multiFactor: { enrolledFactors: [] },
};

test('read-only review reports founder email verification without refusing inventory', () => {
  const summary = summarizePrivilegedAccountReview([
    founder({ emailVerified: false }),
    obsoleteAdmin,
  ]);

  assert.equal(summary.canonicalFounderCount, 1);
  assert.equal(summary.canonicalFounderReady, false);
  assert.equal(summary.founderEmailVerified, false);
  assert.equal(summary.founderPhoneMfaReady, true);
  assert.equal(summary.executionEligible, false);
  assert.equal(summary.privilegedAccountCountBefore, 2);
  assert.equal(summary.deletionTargetCount, 1);
  assert.equal(summary.targetIdentityHashes.length, 1);
  assert.ok(summary.executionBlockers.includes('canonical founder email is not verified'));
  assert.ok(summary.executionBlockers.includes('1 unexpected privileged account(s) must be deleted'));
});

test('read-only review reports an execution-ready canonical founder with no obsolete accounts', () => {
  const summary = summarizePrivilegedAccountReview([founder()]);

  assert.equal(summary.canonicalFounderCount, 1);
  assert.equal(summary.canonicalFounderReady, true);
  assert.equal(summary.executionEligible, true);
  assert.equal(summary.deletionTargetCount, 0);
  assert.deepEqual(summary.executionBlockers, []);
});

test('read-only review diagnoses a missing canonical founder without mutating targets', () => {
  const summary = summarizePrivilegedAccountReview([obsoleteAdmin]);

  assert.equal(summary.canonicalFounderCount, 0);
  assert.equal(summary.canonicalFounderReady, false);
  assert.equal(summary.executionEligible, false);
  assert.equal(summary.deletionTargetCount, 1);
  assert.match(summary.executionBlockers[0], /exactly one ceo@bin-groups\.com/);
});
