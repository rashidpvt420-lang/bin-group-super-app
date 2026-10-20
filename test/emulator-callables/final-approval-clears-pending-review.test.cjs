'use strict';
// Regression: an Owner final approval closed the ticket but left the technician-completion
// markers (dispatchStatus COMPLETED_PENDING_REVIEW, tenantApprovalStatus PENDING_TENANT_REVIEW),
// so the closed job still read "pending review" everywhere.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call } = require('./_setup.cjs');
const { seedVerifiedAfterWorkEvidence } = require('./_ticketEvidence.cjs');

const { ownerReviewTicketCompletion } = lib('runtimeAll.js');
let owner;
test.before(async () => { owner = await createUser('owner_fapr', { role: 'owner' }); });
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/owner_fapr').set({ role: 'owner', status: 'active' });
});

const base = {
  propertyId: 'prop_fapr', ownerId: 'owner_fapr', tenantId: 'tenant_fapr', assignedTechnicianId: 'tech_fapr',
  status: 'COMPLETED_PENDING_APPROVAL', dispatchStatus: 'COMPLETED_PENDING_REVIEW',
  tenantApprovalRequired: true, tenantApprovalStatus: 'PENDING_TENANT_REVIEW',
};

test('owner final approval clears pending-review dispatch and tenant markers', async () => {
  await db.doc('maintenanceTickets/fapr_1').set({ ...base, ...(await seedVerifiedAfterWorkEvidence('fapr_1', base.assignedTechnicianId)) });
  await call(ownerReviewTicketCompletion, owner, { ticketId: 'fapr_1', action: 'APPROVE_CLOSE' });
  const t = (await db.doc('maintenanceTickets/fapr_1').get()).data();
  assert.equal(t.status, 'CLOSED');
  assert.equal(t.dispatchStatus, 'CLOSED');
  assert.equal(t.tenantApprovalStatus, 'WAIVED');
  assert.equal(t.tenantApprovalWaivedBy, 'OWNER_FINAL_APPROVAL');
  assert.equal(t.tenantApprovalRequired, false);
});

test('owner final approval keeps an existing tenant APPROVED decision', async () => {
  await db.doc('maintenanceTickets/fapr_2').set({ ...base, tenantApprovalStatus: 'APPROVED', ...(await seedVerifiedAfterWorkEvidence('fapr_2', base.assignedTechnicianId)) });
  await call(ownerReviewTicketCompletion, owner, { ticketId: 'fapr_2', action: 'APPROVE_CLOSE' });
  const t = (await db.doc('maintenanceTickets/fapr_2').get()).data();
  assert.equal(t.dispatchStatus, 'CLOSED');
  assert.equal(t.tenantApprovalStatus, 'APPROVED');
  assert.equal(t.tenantApprovalWaivedBy, undefined);
});

test('control: owner dispute does not mark the tenant review waived', async () => {
  await db.doc('maintenanceTickets/fapr_3').set({ ...base, ...(await seedVerifiedAfterWorkEvidence('fapr_3', base.assignedTechnicianId)) });
  await call(ownerReviewTicketCompletion, owner, { ticketId: 'fapr_3', action: 'DISPUTE', reason: 'Unit still not cooling properly' });
  const t = (await db.doc('maintenanceTickets/fapr_3').get()).data();
  assert.equal(t.status, 'DISPUTED');
  assert.equal(t.tenantApprovalStatus, 'PENDING_TENANT_REVIEW');
});

test('tenant approval also clears the dispatch pending-review marker (source contract)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../functions/tenantTicketReview.ts'), 'utf8');
  const approveBlock = src.slice(src.indexOf('closureStatus: "tenant_approved"'), src.indexOf('TENANT_APPROVED_TICKET'));
  assert.match(approveBlock, /dispatchStatus: "CLOSED"/);
  assert.match(approveBlock, /tenantApprovalRequired: false/);
});
