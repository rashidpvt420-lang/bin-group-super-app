'use strict';
// Regression: payroll money is exact to the fils. adminGeneratePayrollBatch stored a technician
// baseSalary of 8500.555 as-is (payroll, payroll_entries and transactions rows). Sub-fils salaries
// must be rejected (no row, reported back), exact salaries stored unchanged, and settlement of a
// legacy sub-fils row must fail closed.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminGeneratePayrollBatch, adminSettlePayrollRecord } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const MONTH = '2026-09';

let payrollAdmin;
test.before(async () => {
  payrollAdmin = await createUser('payroll_admin_fils', { role: 'finance_admin' }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

test('sub-fils base salary is rejected and reported; exact salaries are stored unchanged', async () => {
  await db.doc('users/tech_subfils').set({ role: 'technician', displayName: 'Sub Fils Tech', email: 'sub@example.invalid', baseSalary: 8500.555 });
  await db.doc('users/tech_exact').set({ role: 'technician', displayName: 'Exact Tech', email: 'exact@example.invalid', baseSalary: 8500.55 });
  await db.doc('users/tech_round').set({ role: 'technician', displayName: 'Round Tech', email: 'round@example.invalid', baseSalary: 9000 });

  const result = await call(adminGeneratePayrollBatch, payrollAdmin, { month: MONTH });
  assert.equal(result.processed, 2);
  assert.deepEqual(result.rejected, [{ techId: 'tech_subfils', techName: 'Sub Fils Tech', reason: 'BASE_SALARY_NOT_EXACT_TO_THE_FILS' }]);
  assert.ok(result.skipped.includes('Sub Fils Tech'));

  for (const collection of ['payroll', 'payroll_entries']) {
    assert.equal((await db.doc(`${collection}/tech_subfils_${MONTH}`).get()).exists, false, `${collection} row must not exist for a sub-fils salary`);
  }
  assert.equal((await db.doc(`transactions/payroll_tech_subfils_${MONTH}`).get()).exists, false);
  assert.equal((await db.doc(`payroll/tech_exact_${MONTH}`).get()).data().amount, 8500.55);
  assert.equal((await db.doc(`transactions/payroll_tech_exact_${MONTH}`).get()).data().amount, 8500.55);
  assert.equal((await db.doc(`payroll/tech_round_${MONTH}`).get()).data().amount, 9000);

  const stored = await db.collection('payroll').get();
  for (const doc of stored.docs) {
    const amount = doc.data().amount;
    assert.equal(String(amount).split('.')[1]?.length > 2, false, `${doc.id} amount ${amount} is not exact to the fils`);
  }
});

test('settling a legacy payroll row with a sub-fils amount fails closed', async () => {
  await db.doc(`payroll/tech_legacy_${MONTH}`).set({ payrollId: `tech_legacy_${MONTH}`, techId: 'tech_legacy', techName: 'Legacy', month: MONTH, amount: 8500.555, currency: 'AED', status: 'pending' });
  // Complete ledger linkage so the amount is the only thing wrong with this row.
  await db.doc(`transactions/payroll_tech_legacy_${MONTH}`).set({ type: 'payroll', payrollId: `tech_legacy_${MONTH}`, amount: 8500.555, currency: 'AED', status: 'pending' });
  const error = await expectHttpsError(call(adminSettlePayrollRecord, payrollAdmin, { payrollId: `tech_legacy_${MONTH}`, paymentReference: 'CASH-PAY-0001' }), 'failed-precondition');
  assert.match(error.message, /exact AED amount to the fils/);
  assert.equal((await db.doc(`payroll/tech_legacy_${MONTH}`).get()).data().status, 'pending');
  assert.equal((await db.doc(`transactions/payroll_tech_legacy_${MONTH}`).get()).data().status, 'pending');
});
