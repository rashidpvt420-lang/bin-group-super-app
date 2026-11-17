'use strict';
// Acceptance matrix for non-painting money approvals (Rashid policy, 3 Nov 2026):
// only admin / super_admin / ceo / finance_admin with MFA may approve; suspended, disabled,
// MFA-less and stale-claim (demoted after token mint) accounts are refused server-side.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminReviewBrokerCommission, adminSettlePayrollRecord } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_second_factor: 'phone' } };
const DENIED_ROLES = ['admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'operations_manager', 'hr_admin', 'hr_manager', 'hr_staff',
  'support_admin', 'finance_staff', 'account_manager', 'dispatcher', 'technician', 'owner', 'tenant', 'broker'];

const approve = (actor) => call(adminReviewBrokerCommission, actor, { commissionId: 'comm_acc', action: 'APPROVE' });
const settle = (actor) => call(adminSettlePayrollRecord, actor, { payrollId: 'pay_acc', paymentReference: 'REF-ACC-1' });
async function assertUnchanged() {
  assert.equal((await db.doc('broker_commissions/comm_acc').get()).data().status, 'PENDING');
  assert.equal((await db.doc('payroll/pay_acc').get()).data().status, 'PENDING');
}

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('broker_commissions/comm_acc').set({ brokerId: 'b1', status: 'PENDING', amount: 1000 });
  await db.doc('payroll/pay_acc').set({ technicianId: 't1', status: 'PENDING', amount: 5000 });
});

for (const role of DENIED_ROLES) {
  test(`${role} (even with MFA) cannot approve commission or settle payroll`, async () => {
    const actor = await createUser(`acc_${role}`, { role }, { tokenExtra: MFA });
    await expectHttpsError(approve(actor), 'permission-denied');
    await expectHttpsError(settle(actor), 'permission-denied');
    await assertUnchanged();
  });
}

test('finance_admin without MFA is refused', async () => {
  const actor = await createUser('acc_fa_nomfa', { role: 'finance_admin' });
  await expectHttpsError(approve(actor), 'permission-denied');
  await expectHttpsError(settle(actor), 'permission-denied');
  await assertUnchanged();
});

test('suspended admin claim is refused', async () => {
  const actor = await createUser('acc_admin_susp', { role: 'admin', admin: true, suspended: true }, { tokenExtra: MFA });
  await expectHttpsError(approve(actor), 'permission-denied');
  await expectHttpsError(settle(actor), 'permission-denied');
  await assertUnchanged();
});

test('disabled admin account is refused even with a still-valid MFA token', async () => {
  const actor = await createUser('acc_admin_disabled', { role: 'admin', admin: true }, { tokenExtra: MFA });
  await admin.auth().updateUser(actor.uid, { disabled: true });
  await expectHttpsError(approve(actor), 'permission-denied');
  await expectHttpsError(settle(actor), 'permission-denied');
  await assertUnchanged();
});

test('stale-claim: finance_admin demoted after token mint is refused', async () => {
  const actor = await createUser('acc_fa_stale', { role: 'finance_admin' }, { tokenExtra: MFA });
  await admin.auth().setCustomUserClaims(actor.uid, { role: 'hr_admin' });
  await expectHttpsError(approve(actor), 'permission-denied');
  await expectHttpsError(settle(actor), 'permission-denied');
  await assertUnchanged();
});

test('stale-claim: admin suspended in live claims after token mint is refused', async () => {
  const actor = await createUser('acc_admin_stale', { role: 'admin', admin: true }, { tokenExtra: MFA });
  await admin.auth().setCustomUserClaims(actor.uid, { role: 'admin', admin: true, suspended: true });
  await expectHttpsError(approve(actor), 'permission-denied');
  await expectHttpsError(settle(actor), 'permission-denied');
  await assertUnchanged();
});

test('finance_admin with MFA and live claims passes commission approval and payroll settlement authority gates', async () => {
  const actor = await createUser('acc_ok_finance_admin', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });
  for (const run of [approve, settle]) {
    try { await run(actor); } catch (error) {
      assert.notEqual(error?.code, 'permission-denied', `finance_admin: ${error?.message}`);
    }
  }
});

for (const role of ['finance_manager', 'finance_controller']) {
  test(`${role} with MFA and live claims passes commission approval authority gate, and is denied payroll settlement`, async () => {
    const actor = await createUser(`acc_ok_${role}`, { role, [role]: true }, { tokenExtra: MFA });
    try {
      await approve(actor);
    } catch (error) {
      assert.notEqual(error?.code, 'permission-denied', `${role} approve: ${error?.message}`);
    }
    await expectHttpsError(settle(actor), 'permission-denied');
  });
}

test('CEO with explicit separately assigned Finance claim passes authority gate', async () => {
  const actor = await createUser('acc_ok_ceo_fa', { role: 'ceo', ceo: true, finance_admin: true }, { tokenExtra: MFA });
  for (const run of [approve, settle]) {
    try { await run(actor); } catch (error) {
      assert.notEqual(error?.code, 'permission-denied', `ceo+finance_admin: ${error?.message}`);
    }
  }
});

// ---- payment approval (securePaymentApproval) + painting: live-claims guard ----
const { adminApprovePayment, adminRejectPayment, financeDecidePaintingPayment } = lib('runtimeAll.js');

test('payment approval: denied roles and stale/suspended admins refused, payment untouched', async () => {
  await db.doc('payment_transactions/pay_tx_acc').set({ status: 'PENDING_VERIFICATION', amount: 100, paymentMethod: 'CASH' });
  const actors = [];
  for (const role of ['manager', 'operations_admin', 'hr_admin', 'finance_staff', 'admin', 'super_admin', 'ceo', 'technician', 'owner', 'tenant', 'broker']) actors.push(await createUser(`pa_${role}`, { role }, { tokenExtra: MFA }));
  const stale = await createUser('pa_fa_stale', { role: 'finance_admin' }, { tokenExtra: MFA });
  await admin.auth().setCustomUserClaims(stale.uid, { role: 'hr_admin' });
  const susp = await createUser('pa_admin_susp', { role: 'admin', admin: true }, { tokenExtra: MFA });
  await admin.auth().setCustomUserClaims(susp.uid, { role: 'admin', admin: true, suspended: true });
  for (const actor of [...actors, stale, susp]) {
    await expectHttpsError(call(adminApprovePayment, actor, { paymentId: 'pay_tx_acc' }), 'permission-denied');
    await expectHttpsError(call(adminRejectPayment, actor, { paymentId: 'pay_tx_acc', reason: 'test reject reason' }), 'permission-denied');
  }
  assert.equal((await db.doc('payment_transactions/pay_tx_acc').get()).data().status, 'PENDING_VERIFICATION');
});

test('painting: finance_manager demoted after token mint is refused; admin claims still do not grant', async () => {
  const stale = await createUser('pt_fm_stale', { role: 'finance_manager' }, { tokenExtra: MFA });
  await admin.auth().setCustomUserClaims(stale.uid, { role: 'hr_admin' });
  await expectHttpsError(call(financeDecidePaintingPayment, stale, { invoiceId: 'inv_none', decision: 'approve' }), 'permission-denied');
  const adm = await createUser('pt_admin', { role: 'admin', admin: true }, { tokenExtra: MFA });
  await expectHttpsError(call(financeDecidePaintingPayment, adm, { invoiceId: 'inv_none', decision: 'approve' }), 'permission-denied');
});

// ---- Two-Person Finance Role Governance (Requirement 1 & 3) ----
const {
  adminRequestFinanceRoleAssignment,
  adminApproveFinanceRoleAssignment,
  adminRejectFinanceRoleAssignment,
  adminUpdateStaffAccess,
  adminSetStaffStatus,
} = lib('runtimeAll.js');

test('two-person governance: Finance role assignment cannot be completed by one actor without independent approval', async () => {
  const sa1 = await createUser('gov_sa1', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staffTarget = await createUser('gov_staff1', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staffTarget.uid}`).set({ uid: staffTarget.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staffTarget.uid}`).set({ uid: staffTarget.uid, role: 'operations_admin', active: true });

  // 1. Unilateral promotion via adminUpdateStaffAccess without approved authorization fails closed
  await expectHttpsError(
    call(adminUpdateStaffAccess, sa1, { uid: staffTarget.uid, role: 'finance_admin' }),
    'failed-precondition',
  );

  // 2. Requester initiates request
  const requestResult = await call(adminRequestFinanceRoleAssignment, sa1, {
    targetUid: staffTarget.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
  });
  assert.equal(requestResult.success, true);
  assert.equal(requestResult.status, 'PENDING_INDEPENDENT_APPROVAL');
  const authId = requestResult.authorizationId;

  // 3. Requester cannot approve their own Finance role assignment request (Segregation of Duties)
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, sa1, { authorizationId: authId }),
    'permission-denied',
  );

  // 4. Target user cannot approve their own promotion
  const staffWithMfa = await createUser('gov_staff1_mfa', { role: 'operations_admin' }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, staffWithMfa, { authorizationId: authId }),
    'permission-denied',
  );

  // 5. Plain admin cannot approve
  const plainAdmin = await createUser('gov_admin_actor', { role: 'admin', admin: true }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, plainAdmin, { authorizationId: authId }),
    'permission-denied',
  );

  // 6. Independent second authority (e.g. CEO or another Super Admin with MFA) approves
  const ceoActor = await createUser('gov_ceo_approver', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const approvalResult = await call(adminApproveFinanceRoleAssignment, ceoActor, { authorizationId: authId });
  assert.equal(approvalResult.success, true);
  assert.equal(approvalResult.status, 'APPROVED');
  assert.equal(approvalResult.twoPersonVerified, true);

  // 7. Verification: target user receives finance_admin claims upon independent approval
  const updatedRecord = await admin.auth().getUser(staffTarget.uid);
  assert.equal(updatedRecord.customClaims.role, 'finance_admin');
  assert.equal(updatedRecord.customClaims.finance_admin, true);

  // 8. Audit log reflects twoPersonVerified
  const auditLogs = await db.collection('audit_logs').where('action', '==', 'FINANCE_ROLE_ASSIGNMENT_APPROVED').get();
  assert.ok(auditLogs.size >= 1);
  const entry = auditLogs.docs.find((d) => d.data().metadata?.authorizationId === authId)?.data();
  assert.ok(entry);
  assert.equal(entry.metadata.twoPersonVerified, true);
  assert.equal(entry.metadata.requesterId, sa1.uid);
  assert.equal(entry.metadata.approverId, ceoActor.uid);
});

test('two-person governance: reactivating suspended Finance approver requires independent second-person approval', async () => {
  const sa1 = await createUser('gov_sa_react', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const suspendedFinance = await createUser('gov_fa_susp', { role: 'finance_admin', finance_admin: true, suspended: true });
  await db.doc(`users/${suspendedFinance.uid}`).set({ uid: suspendedFinance.uid, role: 'finance_admin', isStaff: true, status: 'SUSPENDED', onboardingComplete: true });
  await db.doc(`staffAccess/${suspendedFinance.uid}`).set({ uid: suspendedFinance.uid, role: 'finance_admin', active: false, suspended: true });

  // Unilateral reactivation fails closed
  await expectHttpsError(
    call(adminSetStaffStatus, sa1, { uid: suspendedFinance.uid, status: 'ACTIVE' }),
    'failed-precondition',
  );

  // Request reactivation
  const req = await call(adminRequestFinanceRoleAssignment, sa1, {
    targetUid: suspendedFinance.uid,
    targetRole: 'finance_admin',
    actionType: 'REACTIVATE_STAFF',
  });
  const authId = req.authorizationId;

  // Requester cannot approve
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, sa1, { authorizationId: authId }),
    'permission-denied',
  );

  // Independent Finance Controller with MFA approves
  const fcApprover = await createUser('gov_fc_approver', { role: 'finance_controller', finance_controller: true }, { tokenExtra: MFA });
  const approved = await call(adminApproveFinanceRoleAssignment, fcApprover, { authorizationId: authId });
  assert.equal(approved.success, true);
  assert.equal(approved.status, 'APPROVED');

  // Target account is now unsuspended and active
  const targetRecord = await admin.auth().getUser(suspendedFinance.uid);
  assert.equal(targetRecord.disabled, false);
  assert.equal(targetRecord.customClaims.suspended, false);
  assert.equal(targetRecord.customClaims.finance_admin, true);
});

// ---- Dual Control on Payment Rejection (Requirement 2 & 3) ----
test('payment rejection dual control: evidence recorder cannot reject their own payment (SAME_ADMIN)', async () => {
  const recorder = await createUser('fa_recorder_1', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });
  const otherFinance = await createUser('fa_approver_2', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });

  const paymentId = 'pay_tx_dual_recorder';
  await db.doc(`payment_transactions/${paymentId}`).set({
    status: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    verificationState: 'PAYMENT_EVIDENCE_RECORDED',
    paymentEvidenceRecordedBy: recorder.uid,
    amount: 500,
    paymentMethod: 'CASH',
  });

  // Recorder attempting to reject their own recorded payment is denied
  await expectHttpsError(
    call(adminRejectPayment, recorder, { paymentId, reason: 'Recorder self-reject attempt' }),
    'failed-precondition',
  );

  // Refusal audit is recorded
  const refusalAudit = await db.collection('audit_logs')
    .where('action', '==', 'ADMIN_REJECT_PAYMENT_REFUSED_DUAL_CONTROL')
    .where('paymentId', '==', paymentId)
    .get();
  assert.ok(refusalAudit.size >= 1, 'refusal audit logged');
  assert.equal(refusalAudit.docs[0].data().reason, 'DUAL_CONTROL_SAME_ADMIN');

  // Independent Finance Admin can reject
  const rejectResult = await call(adminRejectPayment, otherFinance, { paymentId, reason: 'Valid independent rejection' });
  assert.equal(rejectResult.status, 'SUCCESS');
  const freshPayment = (await db.doc(`payment_transactions/${paymentId}`).get()).data();
  assert.equal(freshPayment.status, 'REJECTED');
  assert.equal(freshPayment.rejectedBy, otherFinance.uid);
});

test('payment rejection dual control: customer/payer cannot reject their own payment (SAME_PAYER)', async () => {
  const payer = await createUser('payer_owner_1', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });
  const otherFinance = await createUser('fa_other_payer_test', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });

  const paymentId = 'pay_tx_dual_payer';
  await db.doc(`payment_transactions/${paymentId}`).set({
    status: 'PENDING_ADMIN_APPROVAL',
    ownerUid: payer.uid,
    amount: 1000,
    paymentMethod: 'CHEQUE',
    verificationState: 'OWNER_SUBMITTED',
    paymentProofPath: 'proofs/check.pdf',
    paymentProofHash: 'hash123',
    paymentReference: 'CHQ-001',
  });

  // Payer attempting to reject their own payment is denied
  await expectHttpsError(
    call(adminRejectPayment, payer, { paymentId, reason: 'Payer self-rejection attempt' }),
    'permission-denied',
  );

  // Independent Finance Admin can reject
  const result = await call(adminRejectPayment, otherFinance, { paymentId, reason: 'Cheque dishonoured' });
  assert.equal(result.status, 'SUCCESS');
});

test('payment rejection dual control: unknown evidence recorder fails closed (RECORDER_UNKNOWN)', async () => {
  const finance = await createUser('fa_unknown_rec_test', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });

  const paymentId = 'pay_tx_unknown_recorder';
  await db.doc(`payment_transactions/${paymentId}`).set({
    status: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    verificationState: 'PAYMENT_EVIDENCE_RECORDED',
    // No paymentEvidenceRecordedBy
    amount: 300,
    paymentMethod: 'CASH',
  });

  await expectHttpsError(
    call(adminRejectPayment, finance, { paymentId, reason: 'Rejection test' }),
    'failed-precondition',
  );

  const refusalAudit = await db.collection('audit_logs')
    .where('action', '==', 'ADMIN_REJECT_PAYMENT_REFUSED_DUAL_CONTROL')
    .where('paymentId', '==', paymentId)
    .get();
  assert.ok(refusalAudit.size >= 1);
  assert.equal(refusalAudit.docs[0].data().reason, 'DUAL_CONTROL_RECORDER_UNKNOWN');
});

test('payment rejection dual control: malformed or unverifiable evidence fails closed (MALFORMED_EVIDENCE)', async () => {
  const finance = await createUser('fa_malformed_test', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });

  const paymentId = 'pay_tx_malformed_evidence';
  await db.doc(`payment_transactions/${paymentId}`).set({
    status: 'PENDING_ADMIN_APPROVAL',
    verificationState: 'OWNER_SUBMITTED',
    // Missing all proof paths, hashes, and references
    amount: 400,
    paymentMethod: 'BANK_TRANSFER',
  });

  await expectHttpsError(
    call(adminRejectPayment, finance, { paymentId, reason: 'Reject malformed' }),
    'failed-precondition',
  );

  const refusalAudit = await db.collection('audit_logs')
    .where('action', '==', 'ADMIN_REJECT_PAYMENT_REFUSED_DUAL_CONTROL')
    .where('paymentId', '==', paymentId)
    .get();
  assert.ok(refusalAudit.size >= 1);
  assert.equal(refusalAudit.docs[0].data().reason, 'DUAL_CONTROL_MALFORMED_EVIDENCE');
});

// ============================================================================
// PART A — ENFORCE 24-HOUR FINANCE AUTHORIZATION EXPIRY
// ============================================================================
const {
  adminGetFinanceRoleAuthorization,
} = lib('runtimeAll.js');

test('expiry: request younger than 24 hours is eligible for approval if all checks pass', async () => {
  const sa = await createUser('ttl_young_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staff = await createUser('ttl_young_staff', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: staff.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // Set createdAt to 2 hours ago (well within 24h)
  const twoHoursAgo = admin.firestore.Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000);
  await db.doc(`finance_role_authorizations/${authId}`).update({ createdAt: twoHoursAgo });

  // Retrieval check verifies server-side expiry evaluation
  const ceo = await createUser('ttl_young_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const evalResult = await call(adminGetFinanceRoleAuthorization, ceo, { authorizationId: authId });
  assert.equal(evalResult.success, true);
  assert.equal(evalResult.authorization.isExpired, false);
  assert.ok(evalResult.authorization.ttlRemainingMs > 0);

  // Approval succeeds
  const res = await call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId });
  assert.equal(res.success, true);
  assert.equal(res.status, 'APPROVED');
  assert.equal(res.twoPersonVerified, true);
});

test('expiry: request exactly at expiry (24h) is rejected with failed-precondition', async () => {
  const sa = await createUser('ttl_exact_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staff = await createUser('ttl_exact_staff', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: staff.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // Exactly 24 hours ago (86,400,000 ms)
  const exactExpiry = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);
  await db.doc(`finance_role_authorizations/${authId}`).update({ createdAt: exactExpiry });

  const ceo = await createUser('ttl_exact_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
    'failed-precondition',
  );
});

test('expiry: request older than 24 hours is rejected with failed-precondition', async () => {
  const sa = await createUser('ttl_old_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staff = await createUser('ttl_old_staff', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: staff.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // 26 hours ago
  const oldExpiry = admin.firestore.Timestamp.fromMillis(Date.now() - 26 * 60 * 60 * 1000);
  await db.doc(`finance_role_authorizations/${authId}`).update({ createdAt: oldExpiry });

  const ceo = await createUser('ttl_old_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
    'failed-precondition',
  );
});

test('expiry: missing creation timestamp fails closed and is rejected', async () => {
  const sa = await createUser('ttl_missing_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staff = await createUser('ttl_missing_staff', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: staff.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // Delete createdAt field
  await db.doc(`finance_role_authorizations/${authId}`).update({
    createdAt: admin.firestore.FieldValue.delete(),
  });

  const ceo = await createUser('ttl_missing_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
    'failed-precondition',
  );
});

test('expiry: malformed creation timestamp fails closed and is rejected', async () => {
  const sa = await createUser('ttl_malformed_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staff = await createUser('ttl_malformed_staff', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: staff.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // Set malformed createdAt
  await db.doc(`finance_role_authorizations/${authId}`).update({
    createdAt: 'invalid-non-date-timestamp',
  });

  const ceo = await createUser('ttl_malformed_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
    'failed-precondition',
  );
});

test('expiry: client attempts to manipulate creation time are rejected or ignored', async () => {
  const sa = await createUser('ttl_client_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staff = await createUser('ttl_client_staff', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', active: true });

  // Client passes bogus creation timestamp in payload
  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: staff.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
    createdAt: Date.now() - 100 * 24 * 60 * 60 * 1000, // 100 days ago
  });
  const authId = req.authorizationId;

  // The server-generated timestamp is stored, client-supplied value is ignored
  const storedDoc = (await db.doc(`finance_role_authorizations/${authId}`).get()).data();
  assert.ok(storedDoc.createdAt);
  const ageMs = Date.now() - storedDoc.createdAt.toMillis();
  assert.ok(ageMs < 10000, 'server wrote authoritative fresh timestamp');

  // Now set the doc to expired, and client tries to supply a fresh createdAt in approve call
  await db.doc(`finance_role_authorizations/${authId}`).update({
    createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - 30 * 60 * 60 * 1000),
  });

  const ceo = await createUser('ttl_client_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, ceo, {
      authorizationId: authId,
      createdAt: Date.now(), // Client attempts to override expiry
    }),
    'failed-precondition',
  );
});

test('expiry: expired request produces an immutable security audit event (FINANCE_ROLE_ASSIGNMENT_EXPIRED_REFUSAL)', async () => {
  const sa = await createUser('ttl_audit_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staff = await createUser('ttl_audit_staff', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: staff.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
  });
  const authId = req.authorizationId;
  await db.doc(`finance_role_authorizations/${authId}`).update({
    createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000),
  });

  const ceo = await createUser('ttl_audit_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
    'failed-precondition',
  );

  const auditSnaps = await db.collection('audit_logs')
    .where('action', '==', 'FINANCE_ROLE_ASSIGNMENT_EXPIRED_REFUSAL')
    .get();
  assert.ok(auditSnaps.size >= 1);
  const entry = auditSnaps.docs.find((d) => d.data().metadata?.authorizationId === authId)?.data();
  assert.ok(entry, 'audit log exists for expired refusal');
  assert.equal(entry.actorId, ceo.uid);
  assert.equal(entry.metadata.authorizationId, authId);
  assert.ok(entry.metadata.reason);
});

test('expiry: repeated approval attempts cannot bypass expiry and fail closed', async () => {
  const sa = await createUser('ttl_repeat_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staff = await createUser('ttl_repeat_staff', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: staff.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
  });
  const authId = req.authorizationId;
  await db.doc(`finance_role_authorizations/${authId}`).update({
    createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000),
  });

  const ceo = await createUser('ttl_repeat_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const fc = await createUser('ttl_repeat_fc', { role: 'finance_controller', finance_controller: true }, { tokenExtra: MFA });

  // First attempt fails closed
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
    'failed-precondition',
  );
  // Second attempt also fails closed
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, fc, { authorizationId: authId }),
    'failed-precondition',
  );

  // Target role untouched
  const targetRecord = await admin.auth().getUser(staff.uid);
  assert.notEqual(targetRecord.customClaims?.role, 'finance_admin');
  assert.notEqual(targetRecord.customClaims?.finance_admin, true);
});

test('expiry: expired request cannot be approved through concurrent approval attempts', async () => {
  const sa = await createUser('ttl_conc_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const staff = await createUser('ttl_conc_staff', { role: 'operations_admin', isStaff: true });
  await db.doc(`users/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${staff.uid}`).set({ uid: staff.uid, role: 'operations_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: staff.uid,
    targetRole: 'finance_admin',
    actionType: 'PROMOTE_STAFF',
  });
  const authId = req.authorizationId;
  await db.doc(`finance_role_authorizations/${authId}`).update({
    createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000),
  });

  const ceo = await createUser('ttl_conc_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const fc = await createUser('ttl_conc_fc', { role: 'finance_controller', finance_controller: true }, { tokenExtra: MFA });

  const results = await Promise.allSettled([
    call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
    call(adminApproveFinanceRoleAssignment, fc, { authorizationId: authId }),
  ]);

  // Both must be rejected
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[0].reason?.code, 'failed-precondition');
  assert.equal(results[1].reason?.code, 'failed-precondition');

  // Account untouched
  const finalClaims = (await admin.auth().getUser(staff.uid)).customClaims;
  assert.notEqual(finalClaims?.role, 'finance_admin');
});

// ============================================================================
// PART B — FINANCE APPROVER DEMOTION AND REVOCATION GOVERNANCE
// ============================================================================

test('demotion: 1. single-person Finance approver demotion attempt is DENIED', async () => {
  const sa = await createUser('dem_sp_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_sp_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  // Unilateral demotion via adminUpdateStaffAccess without approved authorization fails closed
  await expectHttpsError(
    call(adminUpdateStaffAccess, sa, { uid: fa.uid, role: 'operations_admin' }),
    'failed-precondition',
  );

  // Target user retains finance_admin claims
  const targetRecord = await admin.auth().getUser(fa.uid);
  assert.equal(targetRecord.customClaims?.role, 'finance_admin');
  assert.equal(targetRecord.customClaims?.finance_admin, true);
});

test('demotion: 2. requester approving their own demotion request is DENIED', async () => {
  const sa = await createUser('dem_self_req_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_self_req_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // Requester self-approval is rejected
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, sa, { authorizationId: authId }),
    'permission-denied',
  );
});

test('demotion: 3. target user approving their own demotion is DENIED', async () => {
  const sa = await createUser('dem_tgt_req_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_tgt_req_fa', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // Target approving own demotion is rejected
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, fa, { authorizationId: authId }),
    'permission-denied',
  );
});

test('demotion: 4. valid independent second approver with MFA is permitted', async () => {
  const sa = await createUser('dem_ok_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_ok_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  const ceo = await createUser('dem_ok_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const result = await call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId });
  assert.equal(result.success, true);
  assert.equal(result.status, 'APPROVED');
  assert.equal(result.twoPersonVerified, true);

  // Verification: target user claims stripped of finance authority
  const targetRecord = await admin.auth().getUser(fa.uid);
  assert.equal(targetRecord.customClaims?.role, 'operations_admin');
  assert.equal(targetRecord.customClaims?.finance_admin, false);
  assert.equal(targetRecord.customClaims?.finance_manager, false);
  assert.equal(targetRecord.customClaims?.finance_controller, false);
});

test('demotion: 5. missing MFA on second approver is DENIED', async () => {
  const sa = await createUser('dem_nomfa_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_nomfa_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // CEO without MFA token
  const ceoNoMfa = await createUser('dem_nomfa_ceo', { role: 'ceo', ceo: true });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, ceoNoMfa, { authorizationId: authId }),
    'permission-denied',
  );
});

test('demotion: 6. suspended or stale authorization claims on approver are DENIED', async () => {
  const sa = await createUser('dem_stale_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_stale_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // Approver demoted to HR admin after token mint (stale claims)
  const staleApprover = await createUser('dem_stale_appr', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  await admin.auth().setCustomUserClaims(staleApprover.uid, { role: 'hr_admin' });

  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, staleApprover, { authorizationId: authId }),
    'permission-denied',
  );
});

test('demotion: 7. expired demotion request is DENIED', async () => {
  const sa = await createUser('dem_exp_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_exp_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // Backdate to 25 hours ago
  await db.doc(`finance_role_authorizations/${authId}`).update({
    createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - 25 * 60 * 60 * 1000),
  });

  const ceo = await createUser('dem_exp_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
    'failed-precondition',
  );
});

test('demotion: 8. concurrent approval attempts allow only one valid transition', async () => {
  const sa = await createUser('dem_conc_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_conc_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  const ceo = await createUser('dem_conc_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  const fc = await createUser('dem_conc_fc', { role: 'finance_controller', finance_controller: true }, { tokenExtra: MFA });

  const results = await Promise.allSettled([
    call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
    call(adminApproveFinanceRoleAssignment, fc, { authorizationId: authId }),
  ]);

  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(fulfilled.length, 1, 'exactly one concurrent approval succeeded');
  assert.equal(rejected.length, 1, 'exactly one concurrent approval rejected');
  assert.equal(rejected[0].reason?.code, 'failed-precondition');
});

test('demotion: 9. successful demotion produces immutable audit event (FINANCE_ROLE_DEMOTION_APPROVED)', async () => {
  const sa = await createUser('dem_ev_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_ev_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  const ceo = await createUser('dem_ev_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });
  await call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId });

  const audits = await db.collection('audit_logs')
    .where('action', '==', 'FINANCE_ROLE_DEMOTION_APPROVED')
    .get();
  assert.ok(audits.size >= 1);
  const entry = audits.docs.find((d) => d.data().metadata?.authorizationId === authId)?.data();
  assert.ok(entry, 'audit entry exists');
  assert.equal(entry.actorId, ceo.uid);
  assert.equal(entry.metadata.requesterId, sa.uid);
  assert.equal(entry.metadata.approverId, ceo.uid);
  assert.equal(entry.metadata.targetUid, fa.uid);
  assert.equal(entry.metadata.previousRole, 'finance_admin');
  assert.equal(entry.metadata.proposedRole, 'operations_admin');
  assert.equal(entry.metadata.decision, 'APPROVED');
  assert.equal(entry.metadata.twoPersonVerified, true);
});

test('demotion: 10. failed demotion results in no unauthorized role mutation', async () => {
  const sa = await createUser('dem_fail_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_fail_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  // Unauthenticated or invalid approver attempt
  const plainAdmin = await createUser('dem_fail_plain_adm', { role: 'admin', admin: true }, { tokenExtra: MFA });
  await expectHttpsError(
    call(adminApproveFinanceRoleAssignment, plainAdmin, { authorizationId: authId }),
    'permission-denied',
  );

  // Verify target user's custom claims, users doc, and staffAccess doc remain completely untouched
  const targetRecord = await admin.auth().getUser(fa.uid);
  assert.equal(targetRecord.customClaims?.role, 'finance_admin');
  assert.equal(targetRecord.customClaims?.finance_admin, true);

  const userDoc = (await db.doc(`users/${fa.uid}`).get()).data();
  assert.equal(userDoc.role, 'finance_admin');

  const accessDoc = (await db.doc(`staffAccess/${fa.uid}`).get()).data();
  assert.equal(accessDoc.role, 'finance_admin');
});

test('demotion: 11. external token revocation failure records explicit failure state (authSyncRetryRequired) and enables recovery retry', async () => {
  const sa = await createUser('dem_auth_err_sa', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  const fa = await createUser('dem_auth_err_fa', { role: 'finance_admin', finance_admin: true });
  await db.doc(`users/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', isStaff: true, status: 'ACTIVE', onboardingComplete: true });
  await db.doc(`staffAccess/${fa.uid}`).set({ uid: fa.uid, role: 'finance_admin', active: true });

  const req = await call(adminRequestFinanceRoleAssignment, sa, {
    targetUid: fa.uid,
    targetRole: 'operations_admin',
    actionType: 'DEMOTE_STAFF',
  });
  const authId = req.authorizationId;

  const ceo = await createUser('dem_auth_err_ceo', { role: 'ceo', ceo: true }, { tokenExtra: MFA });

  // Simulate external Auth token revocation transient failure
  const originalRevoke = admin.auth().revokeRefreshTokens.bind(admin.auth());
  admin.auth().revokeRefreshTokens = async () => {
    throw new Error('Simulated external Auth service outage');
  };

  try {
    await expectHttpsError(
      call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId }),
      'internal',
    );
  } finally {
    admin.auth().revokeRefreshTokens = originalRevoke;
  }

  // Verify unambiguous failure state persisted in Firestore:
  const authDocAfterFailure = (await db.doc(`finance_role_authorizations/${authId}`).get()).data();
  assert.equal(authDocAfterFailure.status, 'APPROVED', 'transactional status committed');
  assert.equal(authDocAfterFailure.authSyncStatus, 'FAILED', 'external sync marked FAILED');
  assert.equal(authDocAfterFailure.authSyncRetryRequired, true, 'recovery flag set');

  const userDocAfterFailure = (await db.doc(`users/${fa.uid}`).get()).data();
  assert.equal(userDocAfterFailure.authSyncRetryRequired, true, 'user doc flagged for recovery');

  const failureAudits = await db.collection('audit_logs')
    .where('action', '==', 'FINANCE_ROLE_DEMOTION_AUTH_SYNC_FAILED')
    .get();
  assert.ok(failureAudits.size >= 1, 'failure audit event recorded');
  const failureEntry = failureAudits.docs.find((d) => d.data().metadata?.authorizationId === authId)?.data();
  assert.ok(failureEntry, 'failure audit entry exists');
  assert.equal(failureEntry.metadata.authSyncRetryRequired, true);

  // Now execute recovery retry with working external Auth:
  const recoveryResult = await call(adminApproveFinanceRoleAssignment, ceo, { authorizationId: authId });
  assert.equal(recoveryResult.success, true);

  // Verify recovery completed:
  const authDocRecovered = (await db.doc(`finance_role_authorizations/${authId}`).get()).data();
  assert.equal(authDocRecovered.authSyncStatus, 'COMPLETED');
  assert.equal(authDocRecovered.authSyncRetryRequired, false);

  const userDocRecovered = (await db.doc(`users/${fa.uid}`).get()).data();
  assert.equal(userDocRecovered.authSyncRetryRequired, false);

  const recoveredAudits = await db.collection('audit_logs')
    .where('action', '==', 'FINANCE_ROLE_DEMOTION_AUTH_SYNC_RECOVERED')
    .get();
  assert.ok(recoveredAudits.size >= 1, 'recovery audit event recorded');
  const recoveredEntry = recoveredAudits.docs.find((d) => d.data().metadata?.authorizationId === authId)?.data();
  assert.ok(recoveredEntry, 'recovery entry exists');
  assert.equal(recoveredEntry.metadata.recoveryCompleted, true);

  // Verify final claims
  const targetRecord = await admin.auth().getUser(fa.uid);
  assert.equal(targetRecord.customClaims?.role, 'operations_admin');
  assert.equal(targetRecord.customClaims?.finance_admin, false);
});



