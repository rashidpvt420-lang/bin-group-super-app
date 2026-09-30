'use strict';
// N-03 regression: ownerReviewTicketCompletion threw INTERNAL ("Cannot use undefined as a Firestore
// value … before.ownerApproved") for every ticket without an ownerApproved field, and no writer sets
// that field before review, so first-time owner approve/dispute was broken.
// Source repro: audit/emu/phase4-owner-review-repro.cjs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { ownerReviewTicketCompletion } = lib('runtimeAll.js');
// N-22: approving closure now requires verified after-work evidence; seed it like the real flow.
const { seedVerifiedAfterWorkEvidence } = require('./_ticketEvidence.cjs');
let owner;
let otherOwner;
test.before(async () => {
  owner = await createUser('owner_n03', { role: 'owner' });
  otherOwner = await createUser('owner_n03_other', { role: 'owner' });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/owner_n03').set({ role: 'owner', status: 'active' });
});

const base = { propertyId: 'prop_n03', ownerId: 'owner_n03', status: 'COMPLETED_PENDING_APPROVAL', assignedTechnicianId: 'tech_n03' };
const expectedStatus = { APPROVE_CLOSE: 'CLOSED', DISPUTE: 'DISPUTED', REQUEST_REVISIT: 'REOPENED', ESCALATE: 'ESCALATED' };

for (const action of Object.keys(expectedStatus)) {
  test(`${action} works on a fresh ticket with no ownerApproved field`, async () => {
    const id = `n03_${action.toLowerCase()}`;
    await db.doc(`maintenanceTickets/${id}`).set({ ...base, ...(await seedVerifiedAfterWorkEvidence(id, base.assignedTechnicianId)) });
    const result = await call(ownerReviewTicketCompletion, owner, { ticketId: id, action, reason: 'Checked on site by the owner' });
    assert.equal(result.status, 'SUCCESS');
    const ticket = (await db.doc(`maintenanceTickets/${id}`).get()).data();
    assert.equal(ticket.status, expectedStatus[action]);
    assert.equal(ticket.ownerApproved, action === 'APPROVE_CLOSE');
    const audits = await db.collection('audit_logs').where('targetId', '==', id).get();
    assert.equal(audits.size, 1);
    assert.deepEqual(audits.docs[0].data().before, { status: 'COMPLETED_PENDING_APPROVAL', ownerApproved: null });
  });
}

test('control: a ticket that already carries ownerApproved=false still closes', async () => {
  await db.doc('maintenanceTickets/n03_withfield').set({ ...base, ownerApproved: false, ...(await seedVerifiedAfterWorkEvidence('n03_withfield', base.assignedTechnicianId)) });
  const result = await call(ownerReviewTicketCompletion, owner, { ticketId: 'n03_withfield', action: 'APPROVE_CLOSE' });
  assert.equal(result.nextStatus, 'CLOSED');
});

test('control: another owner still cannot review the ticket', async () => {
  await db.doc('maintenanceTickets/n03_foreign').set(base);
  await expectHttpsError(call(ownerReviewTicketCompletion, otherOwner, { ticketId: 'n03_foreign', action: 'APPROVE_CLOSE' }), 'permission-denied');
  assert.equal((await db.doc('maintenanceTickets/n03_foreign').get()).data().status, 'COMPLETED_PENDING_APPROVAL');
});

test('control: a CLOSED ticket is not reviewable again', async () => {
  await db.doc('maintenanceTickets/n03_closed').set({ ...base, status: 'CLOSED' });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'n03_closed', action: 'DISPUTE', reason: 'Trying to reopen a closed ticket' }), 'failed-precondition');
});
