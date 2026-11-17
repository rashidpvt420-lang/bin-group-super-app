'use strict';
// Broker payout approve/reject/mark-paid must use the same MFA Finance Admin gate as other #2014 money paths.
// CEO, Super Admin and generic Admin are refused. The requester cannot review their own payout.
// Phase 1 settlement is cash or cheque only.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminReviewBrokerPayoutRequest } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_second_factor: 'phone' } };
const DENIED_ROLES = ['admin', 'super_admin', 'ceo'];

async function seedPayout(status = 'PENDING_ADMIN_REVIEW') {
  const approvalStatus = status === 'APPROVED' || status === 'PAID' ? 'APPROVED' : 'PENDING';
  const paymentStatus = status === 'PAID' ? 'PAID' : status === 'APPROVED' ? 'APPROVED' : 'REQUESTED';
  await db.doc('broker_commissions/comm_payout_acc').set({
    brokerId: 'broker_payout_1',
    status: 'APPROVED',
    payoutStatus: status === 'PAID' ? 'PAID' : status === 'APPROVED' ? 'APPROVED' : 'REQUESTED',
    payoutRequestId: 'payout_acc',
    amount: 1000,
  });
  await db.doc('broker_payout_requests/payout_acc').set({
    brokerId: 'broker_payout_1',
    brokerUid: 'broker_payout_1',
    requestedBy: 'broker_payout_1',
    amount: 1000,
    currency: 'AED',
    status,
    approvalStatus,
    paymentStatus,
    commissionIds: ['comm_payout_acc'],
  });
}

async function assertPending() {
  const payout = (await db.doc('broker_payout_requests/payout_acc').get()).data();
  assert.equal(payout.status, 'PENDING_ADMIN_REVIEW');
  assert.equal((await db.doc('broker_commissions/comm_payout_acc').get()).data().payoutStatus, 'REQUESTED');
}

const review = (actor, action, extra = {}) => call(adminReviewBrokerPayoutRequest, actor, {
  requestId: 'payout_acc',
  action,
  ...extra,
});

test.beforeEach(async () => {
  await clearFirestore();
  await seedPayout('PENDING_ADMIN_REVIEW');
});

for (const role of DENIED_ROLES) {
  test(`${role} (even with MFA) cannot approve, reject or mark paid a broker payout`, async () => {
    const actor = await createUser(`payout_${role}`, { role, [role]: true }, { tokenExtra: MFA });
    await expectHttpsError(review(actor, 'APPROVE'), 'permission-denied');
    await expectHttpsError(review(actor, 'REJECT', { reason: 'Declined after independent review.' }), 'permission-denied');
    await assertPending();
    await seedPayout('APPROVED');
    await expectHttpsError(review(actor, 'MARK_PAID', { paymentReference: 'CHQ-1001', paymentMethod: 'CHEQUE' }), 'permission-denied');
    assert.equal((await db.doc('broker_payout_requests/payout_acc').get()).data().status, 'APPROVED');
  });
}

test('finance_admin without MFA is refused payout approval', async () => {
  const actor = await createUser('payout_fa_nomfa', { role: 'finance_admin', finance_admin: true });
  await expectHttpsError(review(actor, 'APPROVE'), 'permission-denied');
  await assertPending();
});

test('finance_admin with MFA and live claims can approve a payout', async () => {
  const actor = await createUser('payout_fa_ok', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });
  try {
    await review(actor, 'APPROVE');
  } catch (error) {
    assert.notEqual(error?.code, 'permission-denied', `finance_admin approve: ${error?.message}`);
    throw error;
  }
  assert.equal((await db.doc('broker_payout_requests/payout_acc').get()).data().status, 'APPROVED');
});

test('finance_manager with MFA can approve a payout, matching other money-path authority', async () => {
  const actor = await createUser('payout_fm_ok', { role: 'finance_manager', finance_manager: true }, { tokenExtra: MFA });
  try {
    await review(actor, 'APPROVE');
  } catch (error) {
    assert.notEqual(error?.code, 'permission-denied', `finance_manager approve: ${error?.message}`);
    throw error;
  }
  assert.equal((await db.doc('broker_payout_requests/payout_acc').get()).data().status, 'APPROVED');
});

test('finance_admin with MFA can mark an approved payout paid only with cash or cheque', async () => {
  await seedPayout('APPROVED');
  const actor = await createUser('payout_fa_paid', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });
  await expectHttpsError(review(actor, 'MARK_PAID', { paymentReference: 'STRIPE-1', paymentMethod: 'STRIPE' }), 'invalid-argument');
  await expectHttpsError(review(actor, 'MARK_PAID', { paymentReference: 'REF-ONLY' }), 'invalid-argument');
  assert.equal((await db.doc('broker_payout_requests/payout_acc').get()).data().status, 'APPROVED');
  await review(actor, 'MARK_PAID', { paymentReference: 'CHQ-2002', paymentMethod: 'CHEQUE' });
  const paid = (await db.doc('broker_payout_requests/payout_acc').get()).data();
  assert.equal(paid.status, 'PAID');
  assert.equal(paid.paymentMethod, 'CHEQUE');
});

test('payout requester cannot approve their own payout even with Finance Admin MFA', async () => {
  const actor = await createUser('broker_payout_1', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });
  await expectHttpsError(review(actor, 'APPROVE'), 'permission-denied');
  await assertPending();
});

test('stale-claim: finance_admin demoted after token mint is refused payout approval', async () => {
  const actor = await createUser('payout_fa_stale', { role: 'finance_admin', finance_admin: true }, { tokenExtra: MFA });
  await admin.auth().setCustomUserClaims(actor.uid, { role: 'ceo', ceo: true });
  await expectHttpsError(review(actor, 'APPROVE'), 'permission-denied');
  await assertPending();
});
