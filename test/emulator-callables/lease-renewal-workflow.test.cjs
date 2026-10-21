'use strict';
// Feature 4: owner proposes renewal → tenant accepts/declines.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { ownerProposeLeaseRenewal, tenantRespondLeaseRenewal } = lib('runtimeAll.js');
const owner = { uid: 'o_ren', token: { role: 'owner', email: 'o@example.invalid', email_verified: true } };
const other = { uid: 'o_x', token: { role: 'owner', email: 'x@example.invalid', email_verified: true } };
const tenant = { uid: 't_ren', token: { role: 'tenant', email: 't@example.invalid', email_verified: true } };
const stranger = { uid: 't_x', token: { role: 'tenant', email: 'y@example.invalid', email_verified: true } };

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('leases/l1').set({ ownerId: 'o_ren', tenantId: 't_ren', unitId: 'u1', propertyId: 'p1', leaseEndDate: '2026-12-31', annualRent: 80000 });
  await db.doc('leases/l_nodate').set({ ownerId: 'o_ren', tenantId: 't_ren', unitId: 'u2' });
});

test('accepted renewal extends the lease and notifies both sides', async () => {
  const r = await call(ownerProposeLeaseRenewal, owner, { leaseId: 'l1', newEndDate: '2027-12-31', newAnnualRent: '84000' });
  assert.equal(r.newStartDate, '2027-01-01');
  assert.equal((await db.doc('leases/l1').get()).data().renewalStatus, 'RENEWAL_OFFERED');
  assert.ok((await db.doc(`notifications/lease_renewal_offer_${r.renewalId}`).get()).exists);
  await expectHttpsError(call(ownerProposeLeaseRenewal, owner, { leaseId: 'l1', newEndDate: '2027-12-31', newAnnualRent: '84000' }), 'already-exists');
  await expectHttpsError(call(tenantRespondLeaseRenewal, stranger, { renewalId: r.renewalId, decision: 'ACCEPT' }), 'permission-denied');
  await call(tenantRespondLeaseRenewal, tenant, { renewalId: r.renewalId, decision: 'ACCEPT' });
  const lease = (await db.doc('leases/l1').get()).data();
  assert.equal(lease.leaseEndDate, '2027-12-31'); assert.equal(lease.endDate, '2027-12-31');
  assert.equal(lease.annualRent, 84000); assert.equal(lease.previousLeaseEndDate, '2026-12-31'); assert.equal(lease.renewalStatus, 'RENEWED');
  assert.ok((await db.doc(`notifications/lease_renewal_response_${r.renewalId}`).get()).exists);
  await expectHttpsError(call(tenantRespondLeaseRenewal, tenant, { renewalId: r.renewalId, decision: 'DECLINE' }), 'failed-precondition');
});

test('declined renewal keeps the end date and marks NOT_RENEWING', async () => {
  const r = await call(ownerProposeLeaseRenewal, owner, { leaseId: 'l1', newEndDate: '2027-12-31', newAnnualRent: 84000 });
  await call(tenantRespondLeaseRenewal, tenant, { renewalId: r.renewalId, decision: 'DECLINE' });
  const lease = (await db.doc('leases/l1').get()).data();
  assert.equal(lease.leaseEndDate, '2026-12-31'); assert.equal(lease.renewalStatus, 'NOT_RENEWING');
});

test('guards: own lease, end date present, new end after current, positive rent', async () => {
  await expectHttpsError(call(ownerProposeLeaseRenewal, other, { leaseId: 'l1', newEndDate: '2027-12-31', newAnnualRent: 1 }), 'permission-denied');
  await expectHttpsError(call(ownerProposeLeaseRenewal, owner, { leaseId: 'l_nodate', newEndDate: '2027-12-31', newAnnualRent: 1 }), 'failed-precondition');
  await expectHttpsError(call(ownerProposeLeaseRenewal, owner, { leaseId: 'l1', newEndDate: '2026-06-30', newAnnualRent: 1 }), 'invalid-argument');
  await expectHttpsError(call(ownerProposeLeaseRenewal, owner, { leaseId: 'l1', newEndDate: '2027-12-31', newAnnualRent: 0 }), 'invalid-argument');
});
