'use strict';
// Nov 9 follow-ups carried from the superseded PRs #1992, #1993 and #1996 on top of #1994:
//  - Money gate (from #1996 D-01, kept to Rashid's 3 Nov rule): a stray admin:true claim never gives an
//    explicit non-finance role (operations_admin, hr_admin) payment / payroll authority, and the inner
//    payment handler no longer accepts operations_admin. Admin / CEO / Finance Admin with MFA still pass.
//  - Payroll (from #1992): salaryPackage.overtimeEligible === false pays no overtime; a legacy
//    users.baseSalary fallback is audit-logged.
//  - Overtime (from #1993): an ACCEPTED job is auto-linked as overtime proof.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const secure = lib('securePaymentApproval.js');
const inner = lib('paymentTransactionApproval.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const MONTH = '2026-09';
const dubaiDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

let opsWithAdminFlag; let hrWithAdminFlag; let financeAdmin; let tech;
test.before(async () => {
  opsWithAdminFlag = await createUser('nf_ops_admin_flag', { role: 'operations_admin', admin: true }, { tokenExtra: MFA });
  hrWithAdminFlag = await createUser('nf_hr_admin_flag', { role: 'hr_admin', admin: true, isAdmin: true }, { tokenExtra: MFA });
  financeAdmin = await createUser('nf_finance_admin', { role: 'finance_admin' }, { tokenExtra: MFA });
  tech = await createUser('nf_ot_tech', { role: 'technician' });
});
test.beforeEach(clearFirestore);

for (const [label, actor] of [['operations_admin + admin:true', () => opsWithAdminFlag], ['hr_admin + admin:true', () => hrWithAdminFlag]]) {
  test(`${label} cannot approve or reject a payment (wrapper and inner handler)`, async () => {
    await db.doc('payment_transactions/nf_pay').set({ status: 'PENDING_VERIFICATION', amount: 100, paymentMethod: 'CASH' });
    for (const fn of [secure.adminApprovePayment, inner.adminApprovePayment]) {
      await expectHttpsError(call(fn, actor(), { paymentId: 'nf_pay' }), 'permission-denied');
    }
    for (const fn of [secure.adminRejectPayment, inner.adminRejectPayment]) {
      await expectHttpsError(call(fn, actor(), { paymentId: 'nf_pay', reason: 'Not a finance role' }), 'permission-denied');
    }
    assert.equal((await db.doc('payment_transactions/nf_pay').get()).data().status, 'PENDING_VERIFICATION');
  });
  test(`${label} cannot settle payroll`, async () => {
    await db.doc(`payroll/nf_t_${MONTH}`).set({ techId: 'nf_t', status: 'pending', amount: 5000, currency: 'AED', month: MONTH });
    await expectHttpsError(call(runtime.adminSettlePayrollRecord, actor(), { payrollId: `nf_t_${MONTH}`, paymentReference: 'REF-12345' }), 'permission-denied');
    assert.equal((await db.doc(`payroll/nf_t_${MONTH}`).get()).data().status, 'pending');
  });
}

test('Finance Admin with MFA still passes the money gate (missing payment is not-found, not permission-denied)', async () => {
  const error = await call(inner.adminApprovePayment, financeAdmin, { paymentId: 'nf_missing' }).then(() => null, (e) => e);
  assert.ok(error, 'expected an error for a missing payment');
  assert.notEqual(error.code, 'permission-denied', error.message);
});

test('payroll: overtimeEligible false pays no overtime; legacy users.baseSalary fallback is audited', async () => {
  await db.doc('users/nf_no_ot').set({ role: 'technician', displayName: 'No OT Tech', email: 'noot@example.invalid' });
  await db.doc('private_hr_profiles/nf_no_ot').set({ salaryPackage: { basicSalary: 6000, overtimeEligible: false } });
  const shiftDate = `${MONTH}-15`;
  await db.doc(`staff_shifts/SHIFT_nf_no_ot_${shiftDate}`).set({
    staffId: 'nf_no_ot', shiftDate, status: 'COMPLETED',
    clockInTime: new Date(`${shiftDate}T08:00:00+04:00`), clockOutTime: new Date(`${shiftDate}T20:00:00+04:00`),
  });
  await db.doc('users/nf_legacy').set({ role: 'dispatcher', displayName: 'Legacy Salary', email: 'legacy@example.invalid', baseSalary: 7000 });

  const preview = await call(runtime.adminGeneratePayrollBatch, financeAdmin, { month: MONTH, preview: true });
  assert.equal(preview.preview, true);
  assert.equal((await db.collection('audit_logs').where('action', '==', 'PAYROLL_LEGACY_USERS_BASE_SALARY_USED').get()).size, 0, 'preview writes nothing');

  const result = await call(runtime.adminGeneratePayrollBatch, financeAdmin, { month: MONTH });
  assert.deepEqual(result.legacySalaryFallback, ['nf_legacy']);
  const noOt = (await db.doc(`payroll/nf_no_ot_${MONTH}`).get()).data();
  assert.equal(noOt.overtimePay, 0);
  assert.equal(noOt.amount, 6000);
  assert.equal(noOt.overtimeEligible, false);
  const audits = await db.collection('audit_logs').where('action', '==', 'PAYROLL_LEGACY_USERS_BASE_SALARY_USED').get();
  assert.equal(audits.size, 1);
  assert.deepEqual(audits.docs[0].data().metadata.staffIds, ['nf_legacy']);
});

test('overtime: an ACCEPTED job is auto-linked as proof', async () => {
  const date = dubaiDate();
  await db.doc(`staff_shifts/SHIFT_${tech.uid}_${date}`).set({ staffId: tech.uid, shiftDate: date, status: 'ACTIVE', clockInTime: new Date(Date.now() - 9 * 3_600_000) });
  await db.doc('maintenanceTickets/nf_accepted').set({ assignedTechnicianId: tech.uid, status: 'ACCEPTED' });
  const result = await call(runtime.requestStaffOvertime, tech, { estimatedMinutes: 30, reason: 'Accepted job ran past shift end' });
  assert.equal(result.jobId, 'nf_accepted');
  const tracker = (await db.doc(`staff_request_trackers/${result.trackerId}`).get()).data();
  assert.equal(tracker.jobId, 'nf_accepted');
  assert.equal(tracker.jobLinkSource, 'SERVER_ACTIVE_ASSIGNMENT');
});
