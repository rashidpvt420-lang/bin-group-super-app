'use strict';
// Named second approver + Finance Admin broker access (Rashid, 18 Nov 2026).
// - The designated second approver (Super Admin + designatedSecondApprover) can request and approve
//   Finance grants, but every money path refuses it, and it can never be the target of a Finance grant.
// - finance_admin may hold the 'broker' module (allowed, never a default); no other role gains it.
// - The server readiness overview accepts exactly one MFA-ready designated second approver as a third
//   privileged account and stays strict otherwise.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const {
  adminRequestFinanceRoleAssignment,
  adminApproveFinanceRoleAssignment,
  adminReviewBrokerPayoutRequest,
  adminUpdateStaffAccess,
} = lib('runtimeAll.js');
const { claimsGrantFinanceAdmin } = lib('financeAdminMfa.js');
const { buildAdminMfaReadinessOverview, isDesignatedSecondApproverShape } = lib('adminMfaReadiness.js');

const MFA = { firebase: { sign_in_second_factor: 'phone' } };
const SECOND_CLAIMS = {
  role: 'super_admin', userRole: 'super_admin', primaryRole: 'super_admin', super_admin: true, superAdmin: true,
  admin: true, isAdmin: true, ceo: false, staff: false, isStaff: false, finance_admin: false, finance_manager: false,
  finance_controller: false, suspended: false, designatedSecondApprover: true,
};

async function staff(uid, role, modules = []) {
  const claims = {
    role, userRole: role, primaryRole: role, staff: true, isStaff: true,
    finance_admin: role === 'finance_admin', finance_manager: false, finance_controller: false,
    admin: false, isAdmin: false, superAdmin: false, super_admin: false, ceo: false,
    modules, staffModules: modules, permissions: {}, suspended: false,
  };
  const actor = await createUser(uid, claims, { tokenExtra: MFA });
  await db.doc(`users/${uid}`).set({ uid, email: `${uid}@example.invalid`, role, isStaff: true, status: 'ACTIVE', suspended: false, onboardingComplete: true, staffModules: modules, modules });
  await db.doc(`staffAccess/${uid}`).set({ uid, role, active: true, suspended: false, modules, staffModules: modules });
  await db.doc(`hrProfiles/${uid}`).set({ uid, role, employeeType: role, status: 'ACTIVE' });
  return actor;
}

test.beforeEach(async () => { await clearFirestore(); });

test('the designated second approver requests and approves Finance grants but is never a money approver', async () => {
  const founder = await createUser('sa_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const second = await createUser('sa_second', SECOND_CLAIMS, { tokenExtra: MFA });
  const target = await staff('sa_target', 'operations_admin', ['dashboard']);

  // Founder requests; the second approver independently approves.
  const request = await call(adminRequestFinanceRoleAssignment, founder, { targetUid: target.uid, targetRole: 'finance_manager', actionType: 'PROMOTE_STAFF' });
  assert.equal(request.status, 'PENDING_INDEPENDENT_APPROVAL');
  const approved = await call(adminApproveFinanceRoleAssignment, second, { authorizationId: request.authorizationId });
  assert.equal(approved.status, 'APPROVED');

  // The second approver can also be the requester; then it cannot approve its own request.
  const target2 = await staff('sa_target2', 'hr_admin', ['dashboard']);
  const own = await call(adminRequestFinanceRoleAssignment, second, { targetUid: target2.uid, targetRole: 'finance_controller', actionType: 'PROMOTE_STAFF' });
  await expectHttpsError(call(adminApproveFinanceRoleAssignment, second, { authorizationId: own.authorizationId }), 'permission-denied');

  // It can never be the target of a Finance grant (privileged accounts are not staff-provisionable).
  await assert.rejects(
    call(adminRequestFinanceRoleAssignment, founder, { targetUid: second.uid, targetRole: 'finance_admin', actionType: 'PROMOTE_STAFF' }),
    (error) => ['permission-denied', 'failed-precondition', 'invalid-argument'].includes(error?.code),
  );
  assert.equal((await admin.auth().getUser(second.uid)).customClaims.finance_admin, false);

  // Money: no Finance authority even if a Finance flag were ever added alongside the designation.
  assert.equal(claimsGrantFinanceAdmin(SECOND_CLAIMS), false);
  assert.equal(claimsGrantFinanceAdmin({ ...SECOND_CLAIMS, role: 'finance_admin', finance_admin: true }), false);
  await db.doc('broker_commissions/c1').set({ brokerId: 'b1', status: 'APPROVED', payoutStatus: 'REQUESTED', payoutRequestId: 'p1', amount: 10 });
  await db.doc('broker_payout_requests/p1').set({ brokerId: 'b1', requestedBy: 'b1', amount: 10, status: 'PENDING_ADMIN_REVIEW', commissionIds: ['c1'] });
  await expectHttpsError(call(adminReviewBrokerPayoutRequest, second, { requestId: 'p1', action: 'APPROVE' }), 'permission-denied');
  const flagged = await createUser('sa_flagged', { ...SECOND_CLAIMS, role: 'finance_admin', userRole: 'finance_admin', primaryRole: 'finance_admin', finance_admin: true, financeAuthorizedAt: Date.now() }, { tokenExtra: MFA });
  await expectHttpsError(call(adminReviewBrokerPayoutRequest, flagged, { requestId: 'p1', action: 'APPROVE' }), 'permission-denied');
  assert.equal((await db.doc('broker_payout_requests/p1').get()).data().status, 'PENDING_ADMIN_REVIEW');
});

test('finance_admin may hold the broker module; it is never a default and no other Finance role gains it', async () => {
  const founder = await createUser('bm_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const fa = await staff('bm_fa', 'finance_admin', ['dashboard', 'financials', 'reports', 'transactions']);
  await call(adminUpdateStaffAccess, founder, { uid: fa.uid, role: 'finance_admin', modules: ['dashboard', 'financials', 'reports', 'transactions', 'broker'] });
  const claims = (await admin.auth().getUser(fa.uid)).customClaims;
  assert.ok(claims.modules.includes('broker'));
  assert.equal(claims.role, 'finance_admin');
  // A same-role module edit never refreshes Finance authority: the 24h grant must be re-issued by two people.
  assert.equal(claims.financeAuthorizedAt, undefined);

  const fs = await staff('bm_fs', 'finance_staff', ['dashboard', 'financials']);
  await expectHttpsError(call(adminUpdateStaffAccess, founder, { uid: fs.uid, role: 'finance_staff', modules: ['dashboard', 'broker'] }), 'permission-denied');
  const ops = await staff('bm_ops', 'operations_admin', ['dashboard']);
  await expectHttpsError(call(adminUpdateStaffAccess, founder, { uid: ops.uid, role: 'operations_admin', modules: ['dashboard', 'broker'] }), 'permission-denied');
});

function record(uid, email, claims, { factors = ['phone'], verified = true, profile = { status: 'active' } } = {}) {
  return {
    user: { uid, email, emailVerified: verified, disabled: false, customClaims: claims, displayName: uid, multiFactor: { enrolledFactors: factors.map((factorId) => ({ factorId })) } },
    profileExists: true,
    profile,
  };
}

test('server readiness accepts exactly one MFA-ready designated second approver and stays strict otherwise', () => {
  const founder = record('f', 'ceo@bin-groups.com', { role: 'ceo', ceo: true });
  const finance = record('fa', 'finance@bin-groups.com', { role: 'finance_admin', finance_admin: true }, { factors: ['totp'] });
  const second = record('s2', 'second@bin-groups.com', SECOND_CLAIMS);

  const pair = buildAdminMfaReadinessOverview([founder, finance]);
  assert.equal(pair.launchReady, true);
  assert.equal(pair.summary.expectedPrivilegedAccountCount, 2);

  const three = buildAdminMfaReadinessOverview([founder, finance, second]);
  assert.equal(three.launchReady, true);
  assert.equal(three.summary.secondApproverReadyCount, 1);
  assert.equal(three.summary.unexpectedPrivilegedAccountCount, 0);

  const notReady = buildAdminMfaReadinessOverview([founder, finance, record('s2', 'second@bin-groups.com', SECOND_CLAIMS, { factors: [] })]);
  assert.equal(notReady.launchReady, false);
  assert.ok(notReady.blockers.some((item) => item.blockers.includes('SECOND_APPROVER_MFA_REQUIRED')));

  const two = buildAdminMfaReadinessOverview([founder, finance, second, record('s3', 'third@bin-groups.com', SECOND_CLAIMS)]);
  assert.equal(two.launchReady, false);
  assert.equal(two.summary.unexpectedPrivilegedAccountCount, 2);

  for (const claims of [
    { ...SECOND_CLAIMS, designatedSecondApprover: false },
    { ...SECOND_CLAIMS, ceo: true },
    { ...SECOND_CLAIMS, finance_controller: true },
    { ...SECOND_CLAIMS, financeAuthorizedAt: Date.now() },
    { ...SECOND_CLAIMS, role: 'admin' },
  ]) {
    assert.equal(isDesignatedSecondApproverShape({ email: 'second@bin-groups.com', customClaims: claims }), false);
    assert.equal(buildAdminMfaReadinessOverview([founder, finance, record('s2', 'second@bin-groups.com', claims)]).launchReady, false);
  }
  assert.equal(isDesignatedSecondApproverShape({ email: 'ceo@bin-groups.com', customClaims: SECOND_CLAIMS }), false);
});
