'use strict';
// F-4 / N-02 regression: broker commissions may only be created or approved for contracts that the
// server activated after payment verification. Before the fix the activation trigger lower-cased the
// status, so an Owner-written "Active" (paymentVerified=false) created a PENDING AED 800,000
// commission from Owner-supplied brokerId / annualContractValue / brokerCommissionRate, and
// adminReviewBrokerCommission approved it without re-checking the contract.
// Source repro: audit/emu/phase4-commission-active-repro.cjs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { reconcileBrokerCommissionOnContractActivation, adminReviewBrokerCommission } = lib('brokerCommissions.js');

let adminActor;
test.before(async () => {
  adminActor = await createUser('admin_f4_comm', { role: 'admin', admin: true }, {
    tokenExtra: { firebase: { sign_in_second_factor: 'phone' } },
  });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/broker_c').set({ role: 'broker', reraVerified: true, displayName: 'Audit Broker' });
});

const baseContract = {
  ownerId: 'owner_c',
  brokerId: 'broker_c',
  status: 'PENDING_ACTIVATION',
  paymentVerified: false,
  annualContractValue: 10000000,
  brokerCommissionRate: 0.08,
  propertyName: 'Audit Tower',
};
const snap = (data) => ({ data: () => data, exists: true });

async function fireActivation(contractId, afterPatch) {
  const before = { ...baseContract };
  const after = { ...baseContract, ...afterPatch };
  await db.doc(`contracts/${contractId}`).set(after);
  await reconcileBrokerCommissionOnContractActivation.run({
    params: { contractId },
    data: { before: snap(before), after: snap(after) },
  });
  return db.doc(`broker_commissions/commission_${contractId}`).get();
}

test('repro: Owner-written "Active" with paymentVerified=false does not create a commission', async () => {
  const commission = await fireActivation('c_active', { status: 'Active' });
  assert.equal(commission.exists, false, 'no commission may be created for a non-verified contract');
});

test('lower-case "active" is not canonical even with verification flags', async () => {
  const commission = await fireActivation('c_lower', { status: 'active', paymentVerified: true, adminApproved: true });
  assert.equal(commission.exists, false);
});

test('canonical "ACTIVE" without server payment verification does not create a commission', async () => {
  const commission = await fireActivation('c_unverified', { status: 'ACTIVE', paymentVerified: false });
  assert.equal(commission.exists, false);
});

test('control: server-activated contract (ACTIVE + paymentVerified + adminApproved) creates a PENDING commission', async () => {
  const commission = await fireActivation('c_server', { status: 'ACTIVE', paymentVerified: true, adminApproved: true });
  assert.equal(commission.exists, true);
  assert.equal(commission.data().status, 'PENDING');
});

async function seedPendingCommission(contractId, contract) {
  await db.doc(`contracts/${contractId}`).set(contract);
  await db.doc(`broker_commissions/commission_${contractId}`).set({
    brokerId: 'broker_c', contractId, amount: 800000, currency: 'AED', status: 'PENDING',
  });
}

test('adminReviewBrokerCommission APPROVE re-checks the contract is payment-verified', async () => {
  await seedPendingCommission('c_spoof', { ...baseContract, status: 'Active' });
  const error = await expectHttpsError(
    call(adminReviewBrokerCommission, adminActor, { commissionId: 'commission_c_spoof', action: 'APPROVE' }),
    'failed-precondition',
  );
  assert.match(error.message, /payment-verified/i);
  const after = await db.doc('broker_commissions/commission_c_spoof').get();
  assert.equal(after.data().status, 'PENDING');
});

test('adminReviewBrokerCommission APPROVE refuses when the source contract is missing', async () => {
  await db.doc('broker_commissions/commission_c_missing').set({
    brokerId: 'broker_c', contractId: 'c_missing', amount: 1000, currency: 'AED', status: 'PENDING',
  });
  await expectHttpsError(
    call(adminReviewBrokerCommission, adminActor, { commissionId: 'commission_c_missing', action: 'APPROVE' }),
    'failed-precondition',
  );
});

test('control: APPROVE succeeds for a server-activated, payment-verified contract', async () => {
  await seedPendingCommission('c_ok', { ...baseContract, status: 'ACTIVE', paymentVerified: true, adminApproved: true });
  const result = await call(adminReviewBrokerCommission, adminActor, { commissionId: 'commission_c_ok', action: 'APPROVE' });
  assert.equal(result.status, 'SUCCESS');
  const after = await db.doc('broker_commissions/commission_c_ok').get();
  assert.equal(after.data().status, 'APPROVED');
});
