'use strict';
// Payroll Admin (Rashid, 9 Nov 2026), following #1994's role pattern:
//  - assignable through the existing staff provisioning callable by an Admin-tier account with MFA
//    (no Super Admin / CEO-only restriction), with no admin modules, and audit-logged;
//  - recognised by the payroll preparation gate (adminGeneratePayrollBatch, MFA session required);
//  - never money authority: refused on payroll settlement and on payment approve / reject.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const secure = lib('securePaymentApproval.js');
const inner = lib('paymentTransactionApproval.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const MONTH = '2026-09';

let payrollAdmin; let payrollAdminNoMfa; let adminActor;
test.before(async () => {
  payrollAdmin = await createUser('pa_payroll_admin', { role: 'payroll_admin' }, { tokenExtra: MFA });
  payrollAdminNoMfa = await createUser('pa_payroll_admin_nomfa', { role: 'payroll_admin' });
  adminActor = await createUser('pa_admin', { role: 'admin', admin: true }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

test('an Admin with MFA can assign payroll_admin: no modules, no admin flag, audit logged', async () => {
  const result = await call(runtime.adminCreateUser, adminActor, { role: 'payroll_admin', email: 'payroll.admin.ok@example.invalid', displayName: 'Payroll Admin' });
  assert.equal(result.success, true);
  assert.equal(result.role, 'payroll_admin');
  const record = await admin.auth().getUser(result.uid);
  assert.equal(record.customClaims.role, 'payroll_admin');
  assert.equal(record.customClaims.admin, false);
  assert.deepEqual(record.customClaims.modules || [], []);
  const audit = await db.collection('audit_logs').where('targetId', '==', result.uid).get();
  const entry = audit.docs.map((d) => d.data()).find((d) => d.action === 'ADMIN_CREATE_STAFF_USER');
  assert.ok(entry, 'audit entry written');
  assert.equal(entry.actorId, adminActor.uid);
});

test('payroll_admin cannot provision staff', async () => {
  await expectHttpsError(call(runtime.adminCreateUser, payrollAdmin, { role: 'technician', email: 'pa.cannot@example.invalid', displayName: 'No' }), 'permission-denied');
});

test('payroll_admin with MFA can preview and prepare the payroll batch', async () => {
  await db.doc('users/pa_staff').set({ role: 'dispatcher', displayName: 'Payroll Staff', email: 'pa.staff@example.invalid' });
  await db.doc('private_hr_profiles/pa_staff').set({ salaryPackage: { basicSalary: 5000 } });
  const preview = await call(runtime.adminGeneratePayrollBatch, payrollAdmin, { month: MONTH, preview: true });
  assert.equal(preview.preview, true);
  await call(runtime.adminGeneratePayrollBatch, payrollAdmin, { month: MONTH });
  const row = (await db.doc(`payroll/pa_staff_${MONTH}`).get()).data();
  assert.ok(row, 'payroll row prepared');
  assert.notEqual(String(row.status).toLowerCase(), 'paid');
});

test('payroll_admin without an MFA session cannot prepare payroll', async () => {
  await expectHttpsError(call(runtime.adminGeneratePayrollBatch, payrollAdminNoMfa, { month: MONTH, preview: true }), 'permission-denied');
});

test('payroll_admin cannot settle payroll (Finance Admin only)', async () => {
  await db.doc(`payroll/pa_t_${MONTH}`).set({ techId: 'pa_t', status: 'pending', amount: 5000, currency: 'AED', month: MONTH });
  await expectHttpsError(call(runtime.adminSettlePayrollRecord, payrollAdmin, { payrollId: `pa_t_${MONTH}`, paymentReference: 'REF-12345' }), 'permission-denied');
  assert.equal((await db.doc(`payroll/pa_t_${MONTH}`).get()).data().status, 'pending');
});

test('payroll_admin has no payment approval authority (wrapper and inner handler)', async () => {
  await db.doc('payment_transactions/pa_pay').set({ status: 'PENDING_VERIFICATION', amount: 100, paymentMethod: 'CASH' });
  for (const fn of [secure.adminApprovePayment, inner.adminApprovePayment]) {
    await expectHttpsError(call(fn, payrollAdmin, { paymentId: 'pa_pay' }), 'permission-denied');
  }
  for (const fn of [secure.adminRejectPayment, inner.adminRejectPayment]) {
    await expectHttpsError(call(fn, payrollAdmin, { paymentId: 'pa_pay', reason: 'Payroll is not a payment approver' }), 'permission-denied');
  }
  assert.equal((await db.doc('payment_transactions/pa_pay').get()).data().status, 'PENDING_VERIFICATION');
});
