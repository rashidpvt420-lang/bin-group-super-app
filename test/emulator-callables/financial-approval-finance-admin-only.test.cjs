'use strict';
// Rashid, 3 Nov 2026: only Admin-level finance roles may approve anything financial.
// Before this fix adminReviewBrokerCommission accepted operations_admin and "manager", and
// adminSettlePayrollRecord accepted hr_admin / hr_manager. Both now require an MFA Finance Admin.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminReviewBrokerCommission, adminSettlePayrollRecord } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_second_factor: 'phone' } };
const NON_FINANCE = ['operations_admin', 'manager', 'hr_admin', 'hr_manager', 'finance_staff', 'account_manager', 'dispatcher'];

const actors = {};
test.before(async () => {
  for (const role of NON_FINANCE) actors[role] = await createUser(`fin_only_${role}`, { role }, { tokenExtra: MFA });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('broker_commissions/comm_fin_only').set({ brokerId: 'b1', status: 'PENDING', amount: 1000 });
  await db.doc('payroll/pay_fin_only').set({ technicianId: 't1', status: 'PENDING', amount: 5000 });
});

for (const role of NON_FINANCE) {
  test(`${role} cannot approve a broker commission`, async () => {
    await expectHttpsError(call(adminReviewBrokerCommission, actors[role], { commissionId: 'comm_fin_only', action: 'APPROVE' }), 'permission-denied');
    assert.equal((await db.doc('broker_commissions/comm_fin_only').get()).data().status, 'PENDING');
  });
  test(`${role} cannot settle payroll`, async () => {
    await expectHttpsError(call(adminSettlePayrollRecord, actors[role], { payrollId: 'pay_fin_only', paymentReference: 'REF-1234' }), 'permission-denied');
    assert.equal((await db.doc('payroll/pay_fin_only').get()).data().status, 'PENDING');
  });
}
