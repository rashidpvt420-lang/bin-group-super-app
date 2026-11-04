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
