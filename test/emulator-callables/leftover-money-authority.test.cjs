'use strict';
// Leftover non-payout money approval / mark-paid callables must refuse CEO,
// Super Admin and generic Admin even with MFA. Only an MFA Finance Admin
// actor may pass the shared requireMfaFinanceAdminActor gate.
const assert = require('node:assert/strict');
const test = require('node:test');
const { lib, createUser, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const DENIED_ROLES = ['admin', 'super_admin', 'ceo'];

const CALLS = [
  ['adminSetOwnerChequeClearance', runtime.adminSetOwnerChequeClearance, { paymentId: 'pay_leftover', clearance: 'CLEARED' }],
  ['adminRecordReplacementInvoicePayment', runtime.adminRecordReplacementInvoicePayment, { invoiceId: 'inv_leftover' }],
  ['adminVerifyReplacementInvoicePayment', runtime.adminVerifyReplacementInvoicePayment, { invoiceId: 'inv_leftover' }],
  ['financeRecordPdcStatus', runtime.financeRecordPdcStatus, { installmentId: 'inst_leftover', status: 'DEPOSITED' }],
  ['financeRecordPaymentCollection', runtime.financeRecordPaymentCollection, { targetType: 'contract', targetId: 'c_leftover', amount: '10.00', method: 'cash', collectedOn: '2026-01-01' }],
  ['financeVoidPaymentCollection', runtime.financeVoidPaymentCollection, { recordId: 'rec_leftover', reason: 'Test void of leftover authority.' }],
  ['financeApproveOwnerReferralReward', runtime.financeApproveOwnerReferralReward, { rewardId: 'rew_leftover' }],
  ['financeRejectOwnerReferral', runtime.financeRejectOwnerReferral, { rewardId: 'rew_leftover', reason: 'Test reject leftover authority.' }],
  ['financeActivatePmSubscription', runtime.financeActivatePmSubscription, { subscriptionId: 'sub_leftover' }],
  ['adminRecordOwnerMobilizationPaymentEvidence', runtime.adminRecordOwnerMobilizationPaymentEvidence, { paymentId: 'pay_mob_leftover' }],
  ['adminReviewDesignPayment', runtime.adminReviewDesignPayment, { designRequestId: 'design_leftover', decision: 'RETURN', internalNotes: 'Leftover authority denial test.' }],
];

for (const [name, fn] of CALLS) {
  assert.equal(typeof fn?.run, 'function', `${name} must be exported from runtimeAll`);
}

for (const [index, [name, fn, payload]] of CALLS.entries()) {
  for (const role of DENIED_ROLES) {
    test(`${role} (even with MFA) is denied ${name}`, async () => {
      const actor = await createUser(`lm${index}${role}`, { role, [role]: true }, { tokenExtra: MFA });
      await expectHttpsError(call(fn, actor, payload), 'permission-denied');
    });
  }

  test(`finance_admin without MFA is denied ${name}`, async () => {
    const actor = await createUser(`lm${index}nomfa`, { role: 'finance_admin', finance_admin: true });
    await expectHttpsError(call(fn, actor, payload), 'permission-denied');
  });

  test(`finance_admin with MFA passes the authority gate for ${name}`, async () => {
    const actor = await createUser(`lm${index}ok`, { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });
    try {
      await call(fn, actor, payload);
    } catch (error) {
      assert.notEqual(error?.code, 'permission-denied', `${name} finance_admin: ${error?.message}`);
    }
  });
}
