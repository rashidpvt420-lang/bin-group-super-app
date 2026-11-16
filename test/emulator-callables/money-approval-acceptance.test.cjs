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

