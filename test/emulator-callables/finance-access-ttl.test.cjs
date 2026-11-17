'use strict';
// 24-hour finance access TTL and live demotion must fail closed on every money
// approval that uses requireMfaFinanceAdminActor. Painting is not covered here.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const {
  adminReviewBrokerCommission,
  adminSettlePayrollRecord,
  adminReviewBrokerPayoutRequest,
} = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const TTL_MS = 24 * 60 * 60 * 1000;

const approve = (actor) => call(adminReviewBrokerCommission, actor, { commissionId: 'comm_ttl', action: 'APPROVE' });
const settle = (actor) => call(adminSettlePayrollRecord, actor, { payrollId: 'pay_ttl', paymentReference: 'REF-TTL-1' });
const reviewPayout = (actor) => call(adminReviewBrokerPayoutRequest, actor, {
  requestId: 'payout_ttl',
  action: 'APPROVE',
});

async function assertUnchanged() {
  assert.equal((await db.doc('broker_commissions/comm_ttl').get()).data().status, 'PENDING');
  assert.equal((await db.doc('payroll/pay_ttl').get()).data().status, 'PENDING');
  assert.equal((await db.doc('broker_payout_requests/payout_ttl').get()).data().status, 'PENDING_ADMIN_REVIEW');
}

async function financeActor(uid, authorizedAt) {
  return createUser(
    uid,
    { role: 'finance_admin', finance_admin: true, financeAuthorizedAt: authorizedAt },
    { tokenExtra: MFA },
  );
}

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('broker_commissions/comm_ttl').set({ brokerId: 'b_ttl', status: 'PENDING', amount: 1000 });
  await db.doc('payroll/pay_ttl').set({ technicianId: 't_ttl', status: 'PENDING', amount: 5000 });
  await db.doc('broker_commissions/comm_payout_ttl').set({
    brokerId: 'broker_ttl',
    status: 'APPROVED',
    payoutStatus: 'REQUESTED',
    payoutRequestId: 'payout_ttl',
    amount: 1000,
  });
  await db.doc('broker_payout_requests/payout_ttl').set({
    brokerId: 'broker_ttl',
    brokerUid: 'broker_ttl',
    requestedBy: 'broker_ttl',
    amount: 1000,
    currency: 'AED',
    status: 'PENDING_ADMIN_REVIEW',
    approvalStatus: 'PENDING',
    paymentStatus: 'REQUESTED',
    commissionIds: ['comm_payout_ttl'],
  });
});

test('expired TTL (older than 24h) is denied on commission, payroll settle, and payout review', async () => {
  const actor = await financeActor('ttl_expired', Date.now() - TTL_MS - 1000);
  await expectHttpsError(approve(actor), 'permission-denied');
  await expectHttpsError(settle(actor), 'permission-denied');
  await expectHttpsError(reviewPayout(actor), 'permission-denied');
  await assertUnchanged();
});

test('expired TTL at exactly 24h is denied', async () => {
  const actor = await financeActor('ttl_exact', Date.now() - TTL_MS);
  await expectHttpsError(approve(actor), 'permission-denied');
  await expectHttpsError(settle(actor), 'permission-denied');
  await assertUnchanged();
});

test('missing financeAuthorizedAt fails closed', async () => {
  const actor = await financeActor('ttl_missing', undefined);
  // createUser preserves an explicit financeAuthorizedAt, including undefined.
  await expectHttpsError(approve(actor), 'permission-denied');
  await expectHttpsError(settle(actor), 'permission-denied');
  await assertUnchanged();
});

test('demoted finance admin (live claims) is denied even with a fresh TTL', async () => {
  const actor = await financeActor('ttl_demoted', Date.now() - 60 * 60 * 1000);
  await admin.auth().setCustomUserClaims(actor.uid, { role: 'hr_admin' });
  await expectHttpsError(approve(actor), 'permission-denied');
  await expectHttpsError(settle(actor), 'permission-denied');
  await expectHttpsError(reviewPayout(actor), 'permission-denied');
  await assertUnchanged();
});

test('fresh finance authorization (under 24h) passes the money-approval authority gate', async () => {
  const actor = await financeActor('ttl_fresh', Date.now() - 2 * 60 * 60 * 1000);
  for (const [name, run] of [['approve', approve], ['settle', settle], ['payout', reviewPayout]]) {
    try {
      await run(actor);
    } catch (error) {
      assert.notEqual(error?.code, 'permission-denied', `${name} fresh TTL: ${error?.message}`);
    }
  }
});
