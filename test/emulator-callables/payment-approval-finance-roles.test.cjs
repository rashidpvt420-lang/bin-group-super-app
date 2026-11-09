'use strict';
// Audit D-01 (Nov 2026): payment approve / reject is limited to finance roles on the server.
// operations_admin (with or without a stray admin:true claim) and other staff are refused; the
// finance roles pass the authority gate. MFA and dual control (recorder != approver) still apply;
// dual control itself is covered by d5-payment-dual-control.test.cjs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminApprovePayment, adminRejectPayment, adminSetOwnerChequeClearance, adminVerifyReplacementInvoicePayment } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const PAYMENT = 'pay_d01_finance_only';

async function seedPayment() {
  await db.doc(`payment_transactions/${PAYMENT}`).set({ status: 'PENDING_VERIFICATION', amount: 100, paymentMethod: 'CASH' });
}
const unchanged = async () => assert.equal((await db.doc(`payment_transactions/${PAYMENT}`).get()).data().status, 'PENDING_VERIFICATION');

test.beforeEach(async () => { await clearFirestore(); await seedPayment(); });

for (const [label, claims] of [
  ['operations_admin', { role: 'operations_admin' }],
  ['operations_admin with a stray admin:true claim', { role: 'operations_admin', admin: true, isAdmin: true }],
  ['operations_manager', { role: 'operations_manager' }],
  ['manager', { role: 'manager' }],
  ['payroll_admin', { role: 'payroll_admin' }],
  ['finance_staff', { role: 'finance_staff' }],
]) {
  test(`${label} is refused payment approve, reject and cheque clearance`, async () => {
    const actor = await createUser(`d01_${label.replace(/[^a-z_]/g, '_')}`, claims, { tokenExtra: MFA });
    await expectHttpsError(call(adminApprovePayment, actor, { paymentId: PAYMENT }), 'permission-denied');
    await expectHttpsError(call(adminRejectPayment, actor, { paymentId: PAYMENT, reason: 'test reject reason' }), 'permission-denied');
    await expectHttpsError(call(adminSetOwnerChequeClearance, actor, { paymentId: PAYMENT, clearance: 'CLEARED' }), 'permission-denied');
    await expectHttpsError(call(adminVerifyReplacementInvoicePayment, actor, { invoiceId: 'inv_none' }), 'permission-denied');
    await unchanged();
  });
}

for (const role of ['finance_admin', 'finance_manager', 'finance_controller']) {
  test(`${role} with MFA passes the payment authority gate`, async () => {
    const actor = await createUser(`d01_ok_${role}`, { role }, { tokenExtra: MFA });
    for (const run of [
      () => call(adminApprovePayment, actor, { paymentId: PAYMENT }),
      () => call(adminRejectPayment, actor, { paymentId: PAYMENT, reason: 'test reject reason' }),
    ]) {
      try { await run(); } catch (error) {
        assert.notEqual(error?.code, 'permission-denied', `${role}: ${error?.message}`);
      }
    }
  });
  test(`${role} without MFA is refused`, async () => {
    const actor = await createUser(`d01_nomfa_${role}`, { role });
    await expectHttpsError(call(adminApprovePayment, actor, { paymentId: PAYMENT }), 'permission-denied');
    await unchanged();
  });
}
