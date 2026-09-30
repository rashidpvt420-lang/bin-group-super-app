'use strict';
// N-22 regression: Owner APPROVE_CLOSE closed a ticket on status alone. EMU repro: a ticket in
// COMPLETED_PENDING_APPROVAL with no photos / no evidence went straight to CLOSED.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');
const { seedVerifiedAfterWorkEvidence, seedCompleteJobEvidence } = require('./_ticketEvidence.cjs');

const { ownerReviewTicketCompletion } = lib('runtimeAll.js');
let owner;
test.before(async () => { owner = await createUser('owner_n22', { role: 'owner' }); });
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/owner_n22').set({ role: 'owner', status: 'active' });
});

const base = { propertyId: 'prop_n22', ownerId: 'owner_n22', status: 'COMPLETED_PENDING_APPROVAL', assignedTechnicianId: 'tech_n22' };
const statusOf = async (id) => (await db.doc(`maintenanceTickets/${id}`).get()).data().status;

test('approval without any after-work evidence is refused and the ticket stays open for review', async () => {
  await db.doc('maintenanceTickets/n22_none').set(base);
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'n22_none', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  assert.equal(await statusOf('n22_none'), 'COMPLETED_PENDING_APPROVAL');
});

test('client-writable "CONFIRMED" flags without a server confirmation record are refused', async () => {
  await db.doc('maintenanceTickets/n22_flags').set({
    ...base, technicianAfterEvidenceState: 'CONFIRMED', technicianAfterPhotoUrl: 'https://example.invalid/x.jpg', technicianAfterConfirmationId: 'does_not_exist',
  });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'n22_flags', action: 'APPROVE_CLOSE' }), 'failed-precondition');
});

test('evidence whose Storage object changed after confirmation is refused', async () => {
  const evidence = await seedVerifiedAfterWorkEvidence('n22_changed', base.assignedTechnicianId);
  await admin.storage().bucket().file(evidence.technicianAfterStoragePath).save(Buffer.from('replaced'), { resumable: false, metadata: { contentType: 'image/jpeg' } });
  await db.doc('maintenanceTickets/n22_changed').set({ ...base, ...evidence });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'n22_changed', action: 'APPROVE_CLOSE' }), 'failed-precondition');
});

test("evidence confirmed for another technician is refused", async () => {
  const evidence = await seedVerifiedAfterWorkEvidence('n22_othertech', 'someone_else');
  await db.doc('maintenanceTickets/n22_othertech').set({ ...base, ...evidence });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'n22_othertech', action: 'APPROVE_CLOSE' }), 'failed-precondition');
});

test('after-work evidence alone is no longer enough (job evidence gate: arrival, before photo, notes)', async () => {
  await db.doc('maintenanceTickets/n22_afteronly').set({ ...base, ...(await seedVerifiedAfterWorkEvidence('n22_afteronly', base.assignedTechnicianId)) });
  const error = await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'n22_afteronly', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  assert.deepEqual(error.details.missingEvidence, ['ARRIVAL', 'BEFORE_PHOTO', 'NOTES']);
  assert.equal(await statusOf('n22_afteronly'), 'COMPLETED_PENDING_APPROVAL');
});

test('complete verified job evidence allows the Owner to close', async () => {
  await db.doc('maintenanceTickets/n22_ok').set({ ...base, ...(await seedCompleteJobEvidence('n22_ok', base.assignedTechnicianId)) });
  const result = await call(ownerReviewTicketCompletion, owner, { ticketId: 'n22_ok', action: 'APPROVE_CLOSE' });
  assert.equal(result.nextStatus, 'CLOSED');
  assert.equal(await statusOf('n22_ok'), 'CLOSED');
});

test('without evidence the Owner can still dispute or request a revisit', async () => {
  await db.doc('maintenanceTickets/n22_revisit').set(base);
  const result = await call(ownerReviewTicketCompletion, owner, { ticketId: 'n22_revisit', action: 'REQUEST_REVISIT', reason: 'No completion photos were provided' });
  // Parent closes; dispatch happens on the dedicated revisit child ticket.
  assert.equal(await statusOf('n22_revisit'), 'CLOSED');
  assert.equal(result.revisitTicketId, 'revisit_n22_revisit');
  assert.equal(await statusOf('revisit_n22_revisit'), 'OPEN');
});
