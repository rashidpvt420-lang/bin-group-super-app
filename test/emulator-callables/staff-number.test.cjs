'use strict';
// Staff number provisioning, resolution, display, and backfill (Rashid, 18 Nov 2026).
// 1. Every staff account gets a unique 5-digit staff number starting at 10001 via Firestore transaction.
// 2. adminBackfillStaffNumbers is protected by MFA and App Check, safely backfilling existing staff without numbers.
// 3. /finance/grants accepts either 5-digit staff number or Firebase UID.
// 4. Firebase Auth UIDs are NEVER changed.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const {
  adminCreateUser,
  adminBackfillStaffNumbers,
  adminRequestFinanceRoleAssignment,
  adminListFinanceGrantOverview,
} = lib('runtimeAll.js');

const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } };

test.beforeEach(async () => {
  await clearFirestore();
});

test('adminCreateUser sequentially assigns unique 5-digit staff numbers starting at 10001', async () => {
  const sa = await createUser('sn_sa_1', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });

  // 1. Create first staff member
  const result1 = await call(adminCreateUser, sa, {
    role: 'finance_manager',
    email: 'sn.staff1@example.invalid',
    displayName: 'Staff Number One',
  });
  assert.equal(result1.success, true);
  assert.equal(result1.staffNumber, 10001);
  assert.equal(typeof result1.uid, 'string');
  assert.ok(result1.uid.length > 10, 'Firebase Auth UID remains standard string');

  // Verify Firestore documents
  const userDoc1 = (await db.doc(`users/${result1.uid}`).get()).data();
  assert.equal(userDoc1.staffNumber, 10001);
  assert.equal(userDoc1.staffNumberStr, '10001');

  const accessDoc1 = (await db.doc(`staffAccess/${result1.uid}`).get()).data();
  assert.equal(accessDoc1.staffNumber, 10001);

  // Verify counter doc
  const counterDoc1 = (await db.doc('system_counters/staff_number').get()).data();
  assert.equal(counterDoc1.current, 10001);

  // Verify audit log has staffNumber
  const auditLogs = await db.collection('audit_logs').where('targetId', '==', result1.uid).get();
  const createLog = auditLogs.docs.map((d) => d.data()).find((d) => d.action === 'ADMIN_CREATE_STAFF_USER');
  assert.ok(createLog, 'audit entry recorded');
  assert.equal(createLog.metadata.staffNumber, 10001);

  // 2. Create second staff member (technician)
  const result2 = await call(adminCreateUser, sa, {
    role: 'technician',
    email: 'sn.tech2@example.invalid',
    displayName: 'Staff Number Two',
    trade: 'HVAC',
  });
  assert.equal(result2.success, true);
  assert.equal(result2.staffNumber, 10002);

  const userDoc2 = (await db.doc(`users/${result2.uid}`).get()).data();
  assert.equal(userDoc2.staffNumber, 10002);
  assert.equal(userDoc2.staffNumberStr, '10002');

  const techDoc2 = (await db.doc(`technicians/${result2.uid}`).get()).data();
  assert.equal(techDoc2.staffNumber, 10002);

  const counterDoc2 = (await db.doc('system_counters/staff_number').get()).data();
  assert.equal(counterDoc2.current, 10002);
});

test('adminBackfillStaffNumbers is gated by MFA and admin role; backfills existing staff missing numbers', async () => {
  const sa = await createUser('sn_sa_bf', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const saNoMfa = await createUser('sn_sa_nomfa', { role: 'super_admin', super_admin: true });
  const nonAdmin = await createUser('sn_non_admin', { role: 'tenant' }, { tokenExtra: MFA });

  // Gate verification
  await expectHttpsError(call(adminBackfillStaffNumbers, saNoMfa, {}), 'permission-denied');
  await expectHttpsError(call(adminBackfillStaffNumbers, nonAdmin, {}), 'permission-denied');

  // Seed existing staff without staff numbers
  await db.doc('users/legacy_staff_1').set({
    uid: 'legacy_staff_1',
    email: 'legacy1@example.invalid',
    role: 'finance_admin',
    isStaff: true,
    status: 'ACTIVE',
  });
  await db.doc('staffAccess/legacy_staff_1').set({
    uid: 'legacy_staff_1',
    role: 'finance_admin',
    active: true,
  });

  await db.doc('users/legacy_staff_2').set({
    uid: 'legacy_staff_2',
    email: 'legacy2@example.invalid',
    role: 'technician',
    isStaff: true,
    status: 'ACTIVE',
  });
  await db.doc('technicians/legacy_staff_2').set({
    uid: 'legacy_staff_2',
    name: 'Legacy Tech',
    trade: 'Plumbing',
  });

  // Seed a staff member that already has a staff number
  await db.doc('users/existing_staff').set({
    uid: 'existing_staff',
    email: 'existing@example.invalid',
    role: 'hr_manager',
    isStaff: true,
    staffNumber: 10005,
    staffNumberStr: '10005',
  });

  // Seed a non-staff user (owner)
  await db.doc('users/owner_user').set({
    uid: 'owner_user',
    email: 'owner@example.invalid',
    role: 'owner',
    isStaff: false,
  });

  // Execute backfill
  const backfillResult = await call(adminBackfillStaffNumbers, sa, {});
  assert.equal(backfillResult.success, true);
  assert.equal(backfillResult.backfilledCount, 2);

  // Legacy staff 1 received staffNumber
  const updated1 = (await db.doc('users/legacy_staff_1').get()).data();
  assert.ok(updated1.staffNumber >= 10001);
  assert.equal(updated1.staffNumberStr, String(updated1.staffNumber));
  const access1 = (await db.doc('staffAccess/legacy_staff_1').get()).data();
  assert.equal(access1.staffNumber, updated1.staffNumber);

  // Legacy staff 2 received next staffNumber
  const updated2 = (await db.doc('users/legacy_staff_2').get()).data();
  assert.ok(updated2.staffNumber > updated1.staffNumber);
  const tech2 = (await db.doc('technicians/legacy_staff_2').get()).data();
  assert.equal(tech2.staffNumber, updated2.staffNumber);
  // Backfill never creates a partial staffAccess record for a legacy account without one.
  const access2 = await db.doc('staffAccess/legacy_staff_2').get();
  assert.equal(access2.exists, false);
  assert.deepEqual(backfillResult.staffAccessRecordMissingUids, ['legacy_staff_2']);
  assert.equal(backfillResult.remainingCount, 0);

  // Existing staff was untouched
  const existingDoc = (await db.doc('users/existing_staff').get()).data();
  assert.equal(existingDoc.staffNumber, 10005);

  // Owner was untouched
  const ownerDoc = (await db.doc('users/owner_user').get()).data();
  assert.equal(ownerDoc.staffNumber, undefined);

  // Running again finds 0 staff to backfill
  const secondRun = await call(adminBackfillStaffNumbers, sa, {});
  assert.equal(secondRun.success, true);
  assert.equal(secondRun.backfilledCount, 0);

  // Continued provisioning never reuses a number already held (10005 was pre-seeded).
  const held = new Set([updated1.staffNumber, updated2.staffNumber, 10005]);
  for (let i = 0; i < 4; i += 1) {
    const created = await call(adminCreateUser, sa, {
      role: 'finance_manager',
      email: `sn.after.backfill${i}@example.invalid`,
      displayName: `After Backfill ${i}`,
    });
    assert.equal(created.success, true);
    assert.ok(!held.has(created.staffNumber), `staff number ${created.staffNumber} must be unique`);
    held.add(created.staffNumber);
  }
  assert.equal(held.size, 7);
});

test('adminRequestFinanceRoleAssignment accepts either 5-digit staff number or Firebase UID', async () => {
  const founder = await createUser('sn_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });

  // Seed staff member with staffNumber 10001
  const targetUid = 'target_finance_staff';
  await createUser(targetUid, { role: 'finance_controller', isStaff: true, staff: true }, { tokenExtra: MFA });
  await db.doc(`users/${targetUid}`).set({
    uid: targetUid,
    email: 'target@example.invalid',
    role: 'finance_controller',
    isStaff: true,
    staffNumber: 10001,
    staffNumberStr: '10001',
    status: 'ACTIVE',
  });
  await db.doc(`staffAccess/${targetUid}`).set({
    uid: targetUid,
    role: 'finance_controller',
    staffNumber: 10001,
    active: true,
  });

  // 1. Request assignment using 5-digit staff number (as string)
  const reqByNumber = await call(adminRequestFinanceRoleAssignment, founder, {
    targetUid: '10001',
    targetRole: 'finance_admin',
    actionType: 'ASSIGN_FINANCE_ROLE',
  });
  assert.equal(reqByNumber.success, true);
  assert.equal(reqByNumber.targetStaffNumber, 10001);

  const authDoc = (await db.doc(`finance_role_authorizations/${reqByNumber.authorizationId}`).get()).data();
  assert.equal(authDoc.targetUid, targetUid);
  assert.equal(authDoc.targetStaffNumber, 10001);

  // Clean up pending grant to test UID resolution
  await db.doc(`finance_role_authorizations/${reqByNumber.authorizationId}`).delete();

  // 2. Request assignment using Firebase Auth UID
  const reqByUid = await call(adminRequestFinanceRoleAssignment, founder, {
    targetUid: targetUid,
    targetRole: 'finance_admin',
    actionType: 'ASSIGN_FINANCE_ROLE',
  });
  assert.equal(reqByUid.success, true);
  assert.equal(reqByUid.targetStaffNumber, 10001);

  // 3. Requesting non-existent staff number throws not-found
  await expectHttpsError(call(adminRequestFinanceRoleAssignment, founder, {
    targetUid: '99999',
    targetRole: 'finance_admin',
    actionType: 'ASSIGN_FINANCE_ROLE',
  }), 'not-found');

  // 4. Self-assignment prevention using actor's own staff number
  await db.doc(`users/${founder.uid}`).set({
    uid: founder.uid,
    email: 'sn_ceo@example.invalid',
    role: 'ceo',
    isStaff: true,
    staffNumber: 10002,
    staffNumberStr: '10002',
  });
  await expectHttpsError(call(adminRequestFinanceRoleAssignment, founder, {
    targetUid: '10002',
    targetRole: 'finance_admin',
    actionType: 'ASSIGN_FINANCE_ROLE',
  }), 'permission-denied');
});

test('adminListFinanceGrantOverview returns staff numbers for pending grants and finance accounts', async () => {
  const sa = await createUser('sn_sa_overview', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });

  // Seed target user
  const targetUid = 'overview_target_uid';
  await db.doc(`users/${targetUid}`).set({
    uid: targetUid,
    email: 'target_overview@example.invalid',
    displayName: 'Target Overview',
    role: 'finance_manager',
    isStaff: true,
    staffNumber: 10008,
    staffNumberStr: '10008',
    status: 'ACTIVE',
  });

  // Seed requester user
  const requesterUid = 'overview_requester_uid';
  await db.doc(`users/${requesterUid}`).set({
    uid: requesterUid,
    email: 'requester_overview@example.invalid',
    displayName: 'Requester Overview',
    role: 'ceo',
    isStaff: true,
    staffNumber: 10009,
    staffNumberStr: '10009',
    status: 'ACTIVE',
  });

  // Seed pending authorization doc
  const authId = 'auth_overview_test_1';
  await db.doc(`finance_role_authorizations/${authId}`).set({
    authorizationId: authId,
    targetUid,
    targetRole: 'finance_manager',
    targetStaffNumber: 10008,
    requesterId: requesterUid,
    requesterEmail: 'requester_overview@example.invalid',
    requesterStaffNumber: 10009,
    actionType: 'ASSIGN_FINANCE_ROLE',
    status: 'PENDING_INDEPENDENT_APPROVAL',
    requestedAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    consumed: false,
  });

  // Seed finance account in staffAccess
  await db.doc(`staffAccess/${targetUid}`).set({
    uid: targetUid,
    email: 'target_overview@example.invalid',
    displayName: 'Target Overview',
    role: 'finance_manager',
    staffNumber: 10008,
    active: true,
  });

  const overview = await call(adminListFinanceGrantOverview, sa, {});
  assert.ok(Array.isArray(overview.pending));
  const pendingGrant = overview.pending.find((p) => p.authorizationId === authId);
  assert.ok(pendingGrant, 'pending grant returned');
  assert.equal(pendingGrant.targetStaffNumber, 10008);
  assert.equal(pendingGrant.requesterStaffNumber, 10009);

  assert.ok(Array.isArray(overview.financeAccounts));
  const account = overview.financeAccounts.find((a) => a.uid === targetUid);
  assert.ok(account, 'finance account returned');
  assert.equal(account.staffNumber, 10008);
});
