'use strict';
// Warranty protection: record on completion from ticket fields only; repeat fault within warranty is held for review.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const rt = lib('runtimeAll.js');
const jw = lib('jobWarranties.js');
const stripePayment = lib('stripePayment.js');
let owner, other, tenant;
test.before(async () => {
  owner = await createUser('ojw_owner', { role: 'owner' });
  other = await createUser('ojw_owner2', { role: 'owner' });
  tenant = await createUser('ojw_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('warranty only from recorded fields', () => {
  assert.equal(jw.warrantyFromTicket({}, 0).status, 'NO_WARRANTY_RECORDED');
  assert.deepEqual(jw.warrantyFromTicket({ warrantyDays: 90, warrantyCoverage: 'Parts and labour' }, 0), { status: 'ACTIVE', durationDays: 90, coverage: 'Parts and labour', expiresAtMs: 90 * 864e5 });
});

test('repeat fault within warranty flags review and charge hold; other categories do not', async () => {
  const base = { ownerId: 'ojw_owner', propertyId: 'p1', unitId: 'u1', category: 'AC', warrantyDays: 90, warrantyCoverage: 'Compressor' };
  await jw.recordWarrantyOnCompletion('t1', { ...base, status: 'in_progress' }, { ...base, status: 'completed' });
  assert.equal((await db.doc('job_warranties/t1').get()).data().status, 'ACTIVE');
  await db.doc('maintenanceTickets/t2').set({ ownerId: 'ojw_owner', propertyId: 'p1', unitId: 'u1', category: 'ac', status: 'open' });
  assert.equal(await jw.flagRepeatFault('t2', { ownerId: 'ojw_owner', propertyId: 'p1', unitId: 'u1', category: 'ac' }), 't1');
  const t2 = (await db.doc('maintenanceTickets/t2').get()).data();
  assert.equal(t2.ownerChargeHold, true);
  assert.equal(t2.warrantyReview.status, 'PENDING_REVIEW');
  assert.equal(await jw.flagRepeatFault('t3', { ownerId: 'ojw_owner', propertyId: 'p1', unitId: 'u1', category: 'Plumbing' }), null);
  const res = await call(rt.getOwnerWarranties, owner, {});
  assert.equal(res.warranties.length, 1); assert.equal(res.reviews.length, 1);
  assert.equal((await call(rt.getOwnerWarranties, other, {})).warranties.length, 0);
  await expectHttpsError(call(rt.getOwnerWarranties, tenant, {}), 'permission-denied');
});

test('expired warranty does not flag', async () => {
  await db.doc('job_warranties/old').set({ ticketId: 'old', ownerId: 'ojw_owner', faultKey: 'p1|u1|ac', status: 'ACTIVE', expiresAt: new Date(Date.now() - 1000) });
  assert.equal(await jw.flagRepeatFault('t9', { ownerId: 'ojw_owner', propertyId: 'p1', unitId: 'u1', category: 'AC' }), null);
});

test('ticket payment remains blocked while warranty review hold is pending', () => {
  assert.equal(stripePayment.isTicketChargeBlockedByWarrantyReview({ ownerChargeHold: true }), true);
  assert.equal(stripePayment.isTicketChargeBlockedByWarrantyReview({ warrantyReview: { status: 'PENDING_REVIEW' } }), true);
  assert.equal(stripePayment.isTicketChargeBlockedByWarrantyReview({ warrantyReviewStatus: 'PENDING_REVIEW' }), true);
  assert.equal(stripePayment.isTicketChargeBlockedByWarrantyReview({ ownerChargeHold: false, warrantyReview: { status: 'APPROVED_FOR_CHARGE' } }), false);
});
