'use strict';
// Acceptance matrix for non-painting money approvals (Rashid policy, 3 Nov 2026):
// only admin / super_admin / ceo / finance_admin with MFA may approve; suspended, disabled,
// MFA-less and stale-claim (demoted after token mint) accounts are refused server-side.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminReviewBrokerCommission, adminSettlePayrollRecord } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_second_factor: 'phone' } };
const DENIED_ROLES = ['manager', 'operations_admin', 'operations_manager', 'hr_admin', 'hr_manager', 'hr_staff',
  'support_admin', 'finance_staff', 'account_manager', 'dispatcher', 'finance_manager', 'finance_controller', 'technician', 'owner', 'tenant', 'broker'];

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

for (const role of ['admin', 'super_admin', 'ceo', 'finance_admin']) {
  test(`${role} with MFA and live claims passes the authority gate`, async () => {
    const actor = await createUser(`acc_ok_${role}`, { role }, { tokenExtra: MFA });
    for (const run of [approve, settle]) {
      try { await run(actor); } catch (error) {
        assert.notEqual(error?.code, 'permission-denied', `${role}: ${error?.message}`);
      }
    }
  });
}

// ---- payment approval (securePaymentApproval) + painting: live-claims guard ----
const { adminApprovePayment, adminRejectPayment, financeDecidePaintingPayment } = lib('runtimeAll.js');

test('payment approval: denied roles and stale/suspended admins refused, payment untouched', async () => {
  await db.doc('payment_transactions/pay_tx_acc').set({ status: 'PENDING_VERIFICATION', amount: 100, paymentMethod: 'CASH' });
  const actors = [];
  // finance_manager / finance_controller now pass the payment gate (audit D-01, finance roles only); see
  // payment-approval-finance-roles.test.cjs. payroll_admin is a non-payment finance tier and stays refused.
  for (const role of ['manager', 'operations_admin', 'hr_admin', 'finance_staff', 'payroll_admin', 'operations_manager']) actors.push(await createUser(`pa_${role}`, { role }, { tokenExtra: MFA }));
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
