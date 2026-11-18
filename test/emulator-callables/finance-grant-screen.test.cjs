'use strict';
// Finance grants screen (Rashid, 18 Nov 2026): behaviour of the two-person Finance grant callables the
// Admin screen wraps, including the re-grant (financeAuthorizedAt refresh) action and the read-only
// overview. Covers self-approval refusal, target refusal, 24h expiry and the request/approve role matrix.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const {
  adminRequestFinanceRoleAssignment,
  adminApproveFinanceRoleAssignment,
  adminRejectFinanceRoleAssignment,
  adminListFinanceGrantOverview,
  adminSetStaffStatus,
  adminUpdateStaffAccess,
} = lib('runtimeAll.js');

const MFA = { firebase: { sign_in_second_factor: 'totp' } };
const DAY = 24 * 60 * 60 * 1000;

async function financeStaff(uid, role, { authorizedAt = Date.now() - 23 * 60 * 60 * 1000, suspended = false, modules = [] } = {}) {
  const claims = {
    role, userRole: role, primaryRole: role, staff: true, isStaff: true,
    finance_admin: role === 'finance_admin', finance_manager: role === 'finance_manager', finance_controller: role === 'finance_controller',
    admin: false, isAdmin: false, superAdmin: false, super_admin: false, ceo: false,
    modules, staffModules: modules, permissions: {}, suspended, financeAuthorizedAt: authorizedAt,
  };
  const actor = await createUser(uid, claims, { tokenExtra: MFA });
  await db.doc(`users/${uid}`).set({ uid, email: `${uid}@example.invalid`, role, isStaff: true, status: suspended ? 'SUSPENDED' : 'ACTIVE', suspended, onboardingComplete: true, staffModules: modules, modules });
  await db.doc(`staffAccess/${uid}`).set({ uid, role, active: !suspended, suspended, modules, staffModules: modules });
  return actor;
}

const requestRegrant = (actor, target, role) => call(adminRequestFinanceRoleAssignment, actor, {
  targetUid: target.uid, targetRole: role, actionType: 'REGRANT_FINANCE_AUTHORITY',
});

test.beforeEach(async () => { await clearFirestore(); });

test('re-grant refreshes only financeAuthorizedAt after independent approval; role, modules and status are unchanged', async () => {
  const founder = await createUser('fg_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const secondApprover = await createUser('fg_sa2', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const oldGrant = Date.now() - 23 * 60 * 60 * 1000;
  const fa = await financeStaff('fg_fa', 'finance_admin', { authorizedAt: oldGrant, modules: ['dashboard', 'financials', 'reports', 'transactions'] });

  const request = await requestRegrant(founder, fa, 'finance_admin');
  assert.equal(request.status, 'PENDING_INDEPENDENT_APPROVAL');

  // Duplicate pending re-grant is refused.
  await expectHttpsError(requestRegrant(founder, fa, 'finance_admin'), 'already-exists');

  // The requester can neither approve nor reject; the target cannot approve.
  await expectHttpsError(call(adminApproveFinanceRoleAssignment, founder, { authorizationId: request.authorizationId }), 'permission-denied');
  await expectHttpsError(call(adminRejectFinanceRoleAssignment, founder, { authorizationId: request.authorizationId, reason: 'self reject attempt' }), 'permission-denied');
  await expectHttpsError(call(adminApproveFinanceRoleAssignment, fa, { authorizationId: request.authorizationId }), 'permission-denied');

  const approved = await call(adminApproveFinanceRoleAssignment, secondApprover, { authorizationId: request.authorizationId });
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.twoPersonVerified, true);

  const record = await admin.auth().getUser(fa.uid);
  assert.equal(record.customClaims.role, 'finance_admin');
  assert.equal(record.customClaims.finance_admin, true);
  assert.equal(record.customClaims.suspended, false);
  assert.ok(record.customClaims.financeAuthorizedAt > oldGrant, 'financeAuthorizedAt refreshed');
  assert.deepEqual(record.customClaims.modules, ['dashboard', 'financials', 'reports', 'transactions'], 'modules untouched');

  const access = (await db.doc(`staffAccess/${fa.uid}`).get()).data();
  assert.equal(access.active, true);
  assert.equal(access.suspended, false);
  const profile = (await db.doc(`users/${fa.uid}`).get()).data();
  assert.equal(profile.status, 'ACTIVE');
  assert.deepEqual(profile.modules, ['dashboard', 'financials', 'reports', 'transactions']);

  const auth = (await db.doc(`finance_role_authorizations/${request.authorizationId}`).get()).data();
  assert.equal(auth.consumed, true, 're-grant authorization is consumed at approval');
  assert.equal(auth.approverId, secondApprover.uid);
  assert.equal(auth.requesterId, founder.uid);

  // The consumed re-grant can never be replayed to reactivate or change a role.
  await expectHttpsError(call(adminApproveFinanceRoleAssignment, secondApprover, { authorizationId: request.authorizationId }), 'failed-precondition');

  const audit = await db.collection('audit_logs').where('action', '==', 'FINANCE_ROLE_REGRANT_APPROVED').get();
  assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].data().metadata.requesterId, founder.uid);
});

test('Finance Controller may approve a re-grant for someone else but never for itself', async () => {
  const founder = await createUser('fg_ceo2', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const controller = await financeStaff('fg_fc', 'finance_controller');
  const manager = await financeStaff('fg_fm', 'finance_manager');

  const forController = await requestRegrant(founder, controller, 'finance_controller');
  await expectHttpsError(call(adminApproveFinanceRoleAssignment, controller, { authorizationId: forController.authorizationId }), 'permission-denied');

  const forManager = await requestRegrant(founder, manager, 'finance_manager');
  const approved = await call(adminApproveFinanceRoleAssignment, controller, { authorizationId: forManager.authorizationId });
  assert.equal(approved.status, 'APPROVED');
});

test('re-grant request is refused for suspended, role-changing or non-Finance targets, and from non-assigners', async () => {
  const founder = await createUser('fg_ceo3', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const suspended = await financeStaff('fg_fa_susp', 'finance_admin', { suspended: true });
  await expectHttpsError(requestRegrant(founder, suspended, 'finance_admin'), 'failed-precondition');

  const manager = await financeStaff('fg_fm2', 'finance_manager');
  await expectHttpsError(requestRegrant(founder, manager, 'finance_admin'), 'invalid-argument');

  // Request matrix: only Super Admin / CEO (with MFA) can request.
  for (const [uid, claims] of [
    ['fg_req_admin', { role: 'admin', admin: true }],
    ['fg_req_fc', { role: 'finance_controller', finance_controller: true }],
    ['fg_req_fa', { role: 'finance_admin', finance_admin: true }],
    ['fg_req_ops', { role: 'operations_admin' }],
  ]) {
    const actor = await createUser(uid, claims, { tokenExtra: MFA });
    await expectHttpsError(requestRegrant(actor, manager, 'finance_manager'), 'permission-denied');
  }

  // No MFA second factor on the token: refused.
  const noMfa = await createUser('fg_ceo_nomfa', { role: 'ceo', ceo: true });
  await expectHttpsError(requestRegrant(noMfa, manager, 'finance_manager'), 'permission-denied');
});

test('approval role matrix: only Super Admin, CEO or Finance Controller with MFA may approve', async () => {
  const founder = await createUser('fg_ceo4', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const target = await financeStaff('fg_fm3', 'finance_manager');
  const request = await requestRegrant(founder, target, 'finance_manager');

  for (const [uid, claims] of [
    ['fg_ap_admin', { role: 'admin', admin: true }],
    ['fg_ap_fa', { role: 'finance_admin', finance_admin: true }],
    ['fg_ap_fm', { role: 'finance_manager', finance_manager: true }],
    ['fg_ap_hr', { role: 'hr_admin' }],
    ['fg_ap_ops', { role: 'operations_admin' }],
  ]) {
    const actor = await createUser(uid, claims, { tokenExtra: MFA });
    await expectHttpsError(call(adminApproveFinanceRoleAssignment, actor, { authorizationId: request.authorizationId }), 'permission-denied');
  }
  const ceoNoMfa = await createUser('fg_ap_ceo_nomfa', { role: 'ceo', ceo: true });
  await expectHttpsError(call(adminApproveFinanceRoleAssignment, ceoNoMfa, { authorizationId: request.authorizationId }), 'permission-denied');

  const pending = (await db.doc(`finance_role_authorizations/${request.authorizationId}`).get()).data();
  assert.equal(pending.status, 'PENDING_INDEPENDENT_APPROVAL', 'no refused actor changed the request');
});

test('re-grant expires after 24 hours and cannot be approved; target claims stay unchanged', async () => {
  const founder = await createUser('fg_ceo5', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const approver = await createUser('fg_sa5', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const oldGrant = Date.now() - 2 * DAY;
  const target = await financeStaff('fg_fa5', 'finance_admin', { authorizedAt: oldGrant });
  const request = await requestRegrant(founder, target, 'finance_admin');
  await db.doc(`finance_role_authorizations/${request.authorizationId}`).update({ createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - DAY) });

  await expectHttpsError(call(adminApproveFinanceRoleAssignment, approver, { authorizationId: request.authorizationId }), 'failed-precondition');
  const record = await admin.auth().getUser(target.uid);
  assert.equal(record.customClaims.financeAuthorizedAt, oldGrant);
  const stored = (await db.doc(`finance_role_authorizations/${request.authorizationId}`).get()).data();
  assert.equal(stored.status, 'EXPIRED');
});

test('re-grant refused at approval if the target was suspended after the request', async () => {
  const founder = await createUser('fg_ceo6', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const approver = await createUser('fg_sa6', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const target = await financeStaff('fg_fa6', 'finance_admin');
  const request = await requestRegrant(founder, target, 'finance_admin');
  await db.doc(`users/${target.uid}`).update({ suspended: true, status: 'SUSPENDED' });
  await expectHttpsError(call(adminApproveFinanceRoleAssignment, approver, { authorizationId: request.authorizationId }), 'failed-precondition');
});

test('an approved re-grant authorization cannot be used to reactivate or change staff access', async () => {
  const founder = await createUser('fg_ceo7', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const approver = await createUser('fg_sa7', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const target = await financeStaff('fg_fm7', 'finance_manager');
  const request = await requestRegrant(founder, target, 'finance_manager');
  await call(adminApproveFinanceRoleAssignment, approver, { authorizationId: request.authorizationId });

  await expectHttpsError(
    call(adminUpdateStaffAccess, founder, { uid: target.uid, role: 'finance_controller', authorizationId: request.authorizationId }),
    'failed-precondition',
  );
  await db.doc(`users/${target.uid}`).update({ status: 'SUSPENDED', suspended: true });
  await expectHttpsError(
    call(adminSetStaffStatus, founder, { uid: target.uid, status: 'ACTIVE', authorizationId: request.authorizationId }),
    'failed-precondition',
  );
});

test('overview: visible only to Super Admin / CEO / Finance Controller with MFA, with per-viewer approve flags', async () => {
  const founder = await createUser('fg_ceo8', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const controller = await financeStaff('fg_fc8', 'finance_controller');
  const fa = await financeStaff('fg_fa8', 'finance_admin', { authorizedAt: Date.now() - 2 * DAY });
  const request = await requestRegrant(founder, fa, 'finance_admin');

  for (const [uid, claims] of [
    ['fg_ov_admin', { role: 'admin', admin: true }],
    ['fg_ov_fa', { role: 'finance_admin', finance_admin: true }],
    ['fg_ov_fm', { role: 'finance_manager', finance_manager: true }],
  ]) {
    const actor = await createUser(uid, claims, { tokenExtra: MFA });
    await expectHttpsError(call(adminListFinanceGrantOverview, actor, {}), 'permission-denied');
  }
  const noMfa = await createUser('fg_ov_ceo_nomfa', { role: 'ceo', ceo: true });
  await expectHttpsError(call(adminListFinanceGrantOverview, noMfa, {}), 'permission-denied');

  const founderView = await call(adminListFinanceGrantOverview, founder, {});
  assert.equal(founderView.viewer.canRequest, true);
  const asFounder = founderView.pending.find((item) => item.authorizationId === request.authorizationId);
  assert.equal(asFounder.viewerIsRequester, true);
  assert.equal(asFounder.viewerCanApprove, false, 'requester sees approve disabled');
  assert.equal(asFounder.actionType, 'REGRANT_FINANCE_AUTHORITY');
  assert.ok(asFounder.expiresAtMs - asFounder.createdAtMs === DAY);
  const faRow = founderView.financeAccounts.find((item) => item.uid === fa.uid);
  assert.equal(faRow.grantFresh, false, 'a 2-day-old grant is shown as expired');
  assert.equal(faRow.pendingRegrant, true);
  assert.equal(faRow.viewerCanRequestRegrant, false);
  assert.equal(JSON.stringify(founderView).includes('passwordHash'), false);

  const controllerView = await call(adminListFinanceGrantOverview, controller, {});
  assert.equal(controllerView.viewer.canRequest, false);
  assert.equal(controllerView.viewer.canApprove, true);
  assert.equal(controllerView.pending.find((item) => item.authorizationId === request.authorizationId).viewerCanApprove, true);
  const ownRow = controllerView.financeAccounts.find((item) => item.uid === controller.uid);
  assert.equal(ownRow.viewerIsTarget, true);
});
