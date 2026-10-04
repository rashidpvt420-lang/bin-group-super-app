'use strict';
// Job evidence gate (Rashid: "A job should not close until proof is complete or a supervisor
// accepts the exception"). Every server path that completes / resolves / closes a job must refuse
// incomplete proof, for every actor, unless a supervisor-approved, audited exception covers the gap.
// Source audit: /workspace/audit/owner-flow-and-evidence-gate.md (Task B).
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');
const { seedCompleteJobEvidence, seedVerifiedAfterWorkEvidence, seedVerifiedBeforeWorkEvidence, serverArrivalFields } = require('./_ticketEvidence.cjs');

const runtime = lib('runtimeAll.js');
const {
  updateTicketLifecycle, ownerReviewTicketCompletion, tenantReviewTicketCompletion, completeStaffJobWithAi,
  adminResolveTicketDispute, adminUpdateEmergencyTicket, requestJobEvidenceException, decideJobEvidenceException,
} = runtime;

const MFA = { tokenExtra: { firebase: { sign_in_second_factor: 'phone' } } };
let mfaDispatcher; let tech; let otherTech; let adminActor; let opsAdmin; let supervisor; let supervisor2; let dispatcher; let owner; let tenant;
test.before(async () => {
  tech = await createUser('tech_jeg', { role: 'technician' });
  otherTech = await createUser('tech_jeg_other', { role: 'technician' });
  adminActor = await createUser('admin_jeg', { role: 'admin', admin: true }, MFA);
  opsAdmin = await createUser('opsadmin_jeg', { role: 'operations_admin' }, MFA);
  supervisor = await createUser('sup_jeg', { role: 'supervisor' }, MFA);
  supervisor2 = await createUser('sup2_jeg', { role: 'operations_manager' });
  dispatcher = await createUser('disp_jeg', { role: 'dispatcher' });
  // Dispute / emergency callables require a privileged MFA session since N-05 (#1552/#1557).
  mfaDispatcher = await createUser('disp_jeg_mfa', { role: 'dispatcher' }, MFA);
  owner = await createUser('owner_jeg', { role: 'owner' });
  tenant = await createUser('tenant_jeg', { role: 'tenant' });
});

const readyTechnician = {
  role: 'technician', status: 'active', approvalStatus: 'approved',
  medicalCardStatus: 'valid', drivingLicenseStatus: 'valid', certificationsStatus: 'valid',
  currentShiftId: 'shift_jeg', shiftStatus: 'active', deviceRegistered: true, onDuty: true, isAvailable: true,
};
test.beforeEach(async () => {
  await clearFirestore();
  const live = { ...readyTechnician, lastGpsAt: admin.firestore.Timestamp.now() };
  await db.doc('users/tech_jeg').set(live);
  await db.doc('technicians/tech_jeg').set(live);
  await db.doc('users/owner_jeg').set({ role: 'owner', status: 'active' });
});

const base = {
  propertyId: 'prop_jeg', ownerId: 'owner_jeg', tenantId: 'tenant_jeg',
  assignedTechnicianId: 'tech_jeg', technicianId: 'tech_jeg', priority: 'HIGH',
};
const ticket = async (id) => (await db.doc(`maintenanceTickets/${id}`).get()).data();
const seed = (id, data) => db.doc(`maintenanceTickets/${id}`).set({ ...base, ...data });
const completedAtNow = () => ({ completedAt: admin.firestore.Timestamp.now() });

async function approvedException(ticketId, requester = tech, approver = supervisor) {
  const requested = await call(requestJobEvidenceException, requester, { ticketId, reason: 'Customer refused access to the meter room for photos.' });
  const decided = await call(decideJobEvidenceException, approver, {
    ticketId, exceptionId: requested.exceptionId, decision: 'APPROVE', reason: 'Verified by phone with the customer; work confirmed.',
  });
  return { requested, decided };
}

// ─── Closing paths refuse incomplete proof ───────────────────────────────────────────────

test('updateTicketLifecycle: an admin can no longer complete a job with no evidence', async () => {
  await seed('jeg_admin_complete', { status: 'IN_PROGRESS' });
  const error = await expectHttpsError(call(updateTicketLifecycle, adminActor, { ticketId: 'jeg_admin_complete', status: 'COMPLETED', notes: 'closing from the office' }), 'failed-precondition');
  assert.equal(error.details.reason, 'JOB_EVIDENCE_INCOMPLETE');
  assert.deepEqual(error.details.missingEvidence, ['ARRIVAL', 'BEFORE_PHOTO', 'AFTER_PHOTO']);
  assert.equal((await ticket('jeg_admin_complete')).status, 'IN_PROGRESS');
});

test('updateTicketLifecycle: an admin cannot complete with a client proofUrl and tenant photos as "proof"', async () => {
  // Pre-fix: the legacy check accepted any client proofUrl as after-proof and tenant photos as before-proof.
  await seed('jeg_admin_proofurl', { status: 'IN_PROGRESS', photos: ['https://example.invalid/tenant-leak.jpg'] });
  await expectHttpsError(call(updateTicketLifecycle, adminActor, {
    ticketId: 'jeg_admin_proofurl', status: 'COMPLETED', notes: 'Closed from the office after a phone call', proofType: 'AFTER', proofUrl: 'https://example.invalid/anything.jpg',
  }), 'failed-precondition');
  assert.equal((await ticket('jeg_admin_proofurl')).status, 'IN_PROGRESS');
});

test('updateTicketLifecycle: a technician with photos but an admin-marked arrival is refused', async () => {
  const evidence = await seedCompleteJobEvidence('jeg_admin_arrival', 'tech_jeg');
  await seed('jeg_admin_arrival', { status: 'IN_PROGRESS', ...evidence, arrivalEvidenceMode: 'ADMIN_FUNCTIONAL_ONLY' });
  const error = await expectHttpsError(call(updateTicketLifecycle, tech, { ticketId: 'jeg_admin_arrival', status: 'COMPLETED', notes: 'Replaced the valve.' }), 'failed-precondition');
  assert.deepEqual(error.details.missingEvidence, ['ARRIVAL']);
});

test('updateTicketLifecycle: complete technician proof completes and records the gate decision', async () => {
  await seed('jeg_tech_ok', { status: 'IN_PROGRESS', ...(await seedCompleteJobEvidence('jeg_tech_ok', 'tech_jeg')) });
  await call(updateTicketLifecycle, tech, { ticketId: 'jeg_tech_ok', status: 'COMPLETED', notes: 'Replaced the valve and tested.' });
  const data = await ticket('jeg_tech_ok');
  assert.equal(data.status, 'COMPLETED_PENDING_APPROVAL');
  assert.equal(data.closureEvidenceGate.mode, 'EVIDENCE_COMPLETE');
  assert.equal(data.closureEvidenceGate.path, 'TECHNICIAN_LIFECYCLE');
  assert.deepEqual(data.closureEvidenceGate.missing, []);
});

test('updateTicketLifecycle: the legacy handler cannot be reached around the gate', async () => {
  // The exported callable is the secure wrapper; the gate context is server-side only, so a
  // client-supplied "serverClosureEvidenceGate" in request.data is ignored.
  await seed('jeg_forge_ctx', { status: 'IN_PROGRESS' });
  await expectHttpsError(call(updateTicketLifecycle, adminActor, {
    ticketId: 'jeg_forge_ctx', status: 'COMPLETED', notes: 'forged gate context', serverClosureEvidenceGate: { mode: 'EVIDENCE_COMPLETE' },
  }), 'failed-precondition');
});

test('ownerReviewTicketCompletion: an admin APPROVE_CLOSE with no evidence is refused', async () => {
  await seed('jeg_owner_admin', { status: 'COMPLETED_PENDING_APPROVAL' });
  await expectHttpsError(call(ownerReviewTicketCompletion, adminActor, { ticketId: 'jeg_owner_admin', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  await expectHttpsError(call(ownerReviewTicketCompletion, opsAdmin, { ticketId: 'jeg_owner_admin', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  assert.equal((await ticket('jeg_owner_admin')).status, 'COMPLETED_PENDING_APPROVAL');
});

test('ownerReviewTicketCompletion: a quote awaiting owner approval cannot be "closed" by the owner', async () => {
  // AWAITING_OWNER_APPROVAL is also the >1000 AED estimate-approval status set by the admin panel.
  await seed('jeg_owner_quote', { status: 'AWAITING_OWNER_APPROVAL', estimatedCost: 1500 });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_owner_quote', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  assert.equal((await ticket('jeg_owner_quote')).status, 'AWAITING_OWNER_APPROVAL');
});

test('tenantReviewTicketCompletion: tenant approval of a RESOLVED job with no evidence is refused', async () => {
  await seed('jeg_tenant_none', { status: 'RESOLVED', ...completedAtNow() });
  await expectHttpsError(call(tenantReviewTicketCompletion, tenant, { ticketId: 'jeg_tenant_none', action: 'approve', rating: 5 }), 'failed-precondition');
  assert.equal((await ticket('jeg_tenant_none')).status, 'RESOLVED');
});

test('tenantReviewTicketCompletion: complete proof lets the tenant close and records the gate', async () => {
  await seed('jeg_tenant_ok', { status: 'COMPLETED', ...completedAtNow(), ...(await seedCompleteJobEvidence('jeg_tenant_ok', 'tech_jeg')) });
  await call(tenantReviewTicketCompletion, tenant, { ticketId: 'jeg_tenant_ok', action: 'approve', rating: 5 });
  const data = await ticket('jeg_tenant_ok');
  assert.equal(data.status, 'CLOSED');
  assert.equal(data.closureEvidenceGate.path, 'TENANT_REVIEW');
  const audit = await db.collection('audit_logs').where('action', '==', 'TENANT_APPROVED_TICKET').get();
  assert.equal(audit.docs[0].data().metadata.closureEvidenceMode, 'EVIDENCE_COMPLETE');
});

test('completeStaffJobWithAi: client-writable photo fields and requiresCompletionPhoto:false no longer complete a job', async () => {
  await seed('jeg_staff_forged', { status: 'IN_PROGRESS', afterPhotoUrl: 'https://example.invalid/forged.jpg', proofPhotos: ['https://example.invalid/forged.jpg'] });
  await expectHttpsError(call(completeStaffJobWithAi, tech, { jobId: 'jeg_staff_forged', rawSpokenText: 'Fixed the leak under the sink', confirmCompletion: true }), 'failed-precondition');
  await seed('jeg_staff_bypass', { status: 'ARRIVED', requiresCompletionPhoto: false });
  await expectHttpsError(call(completeStaffJobWithAi, adminActor, { jobId: 'jeg_staff_bypass', rawSpokenText: 'Fixed the leak under the sink', confirmCompletion: true }), 'failed-precondition');
  assert.equal((await ticket('jeg_staff_forged')).status, 'IN_PROGRESS');
  assert.equal((await ticket('jeg_staff_bypass')).status, 'ARRIVED');
});

test('completeStaffJobWithAi: complete proof completes with the gate recorded', async () => {
  await seed('jeg_staff_ok', { status: 'IN_PROGRESS', ...(await seedCompleteJobEvidence('jeg_staff_ok', 'tech_jeg')) });
  await call(completeStaffJobWithAi, tech, { jobId: 'jeg_staff_ok', rawSpokenText: 'Fixed the leak under the sink', confirmCompletion: true });
  const data = await ticket('jeg_staff_ok');
  assert.equal(data.status, 'COMPLETED');
  assert.equal(data.closureEvidenceGate.path, 'STAFF_AI_COMPLETION');
});

test('adminResolveTicketDispute: dismiss / credit cannot close an unproven job; revisit still works', async () => {
  const disputed = { status: 'DISPUTED', requiresAdminReview: true, adminReviewStatus: 'PENDING_DISPUTE_REVIEW' };
  await seed('jeg_dispute', disputed);
  // dismiss is dispatcher authority; approve_credit is Finance Admin MFA only (#1552).
  await expectHttpsError(call(adminResolveTicketDispute, mfaDispatcher, { ticketId: 'jeg_dispute', action: 'dismiss', note: 'Reviewed the dispute file' }), 'failed-precondition');
  await expectHttpsError(call(adminResolveTicketDispute, adminActor, { ticketId: 'jeg_dispute', action: 'approve_credit', note: 'Reviewed the dispute file' }), 'failed-precondition');
  assert.equal((await ticket('jeg_dispute')).status, 'DISPUTED');
  assert.equal((await db.doc('payment_transactions/sla_credit_jeg_dispute').get()).exists, false);
  await call(adminResolveTicketDispute, mfaDispatcher, { ticketId: 'jeg_dispute', action: 'request_revisit', note: 'Send the technician back' });
  // #1557: the disputed parent is closed and superseded by a revisit child, which goes through
  // its own evidence gate when it closes. The parent records why it closed without proof.
  const data = await ticket('jeg_dispute');
  assert.equal(data.status, 'CLOSED');
  assert.equal(data.closureEvidenceGate.mode, 'SUPERSEDED_BY_REVISIT');
  assert.equal(data.closureEvidenceGate.revisitTicketId, 'revisit_jeg_dispute');
  const child = await ticket('revisit_jeg_dispute');
  assert.equal(child.status, 'OPEN');
  assert.equal(child.parentId, 'jeg_dispute');
});

test('adminResolveTicketDispute: dismiss closes a proven job and records the gate', async () => {
  await seed('jeg_dispute_ok', { status: 'DISPUTED', requiresAdminReview: true, adminReviewStatus: 'PENDING_DISPUTE_REVIEW', ...(await seedCompleteJobEvidence('jeg_dispute_ok', 'tech_jeg')) });
  await call(adminResolveTicketDispute, mfaDispatcher, { ticketId: 'jeg_dispute_ok', action: 'dismiss', note: 'Photos show the work done' });
  const data = await ticket('jeg_dispute_ok');
  assert.equal(data.status, 'CLOSED');
  assert.equal(data.closureEvidenceGate.path, 'ADMIN_DISPUTE_RESOLUTION');
});

test('adminUpdateEmergencyTicket: resolving a dispatched emergency needs proof; alert-only SOS is recorded as such', async () => {
  await seed('jeg_sos_tech', { status: 'RESPONDED', sosStatus: 'RESPONDED' });
  await expectHttpsError(call(adminUpdateEmergencyTicket, mfaDispatcher, { ticketId: 'jeg_sos_tech', action: 'resolve' }), 'failed-precondition');
  assert.equal((await ticket('jeg_sos_tech')).status, 'RESPONDED');
  await db.doc('maintenanceTickets/jeg_sos_alert').set({ propertyId: 'prop_jeg', priority: 'EMERGENCY', status: 'RESPONDED', sosStatus: 'RESPONDED' });
  await call(adminUpdateEmergencyTicket, mfaDispatcher, { ticketId: 'jeg_sos_alert', action: 'resolve' });
  const alert = await ticket('jeg_sos_alert');
  // Main writes canonical CLOSED with sosStatus RESOLVED on resolve (#1552/#1557).
  assert.equal(alert.status, 'CLOSED');
  assert.equal(alert.sosStatus, 'RESOLVED');
  assert.equal(alert.closureEvidenceGate.mode, 'NO_TECHNICIAN_DISPATCHED');
});

test('reopened jobs: evidence captured before the reopen does not count', async () => {
  const evidence = await seedCompleteJobEvidence('jeg_reopen', 'tech_jeg');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await seed('jeg_reopen', { status: 'COMPLETED_PENDING_APPROVAL', ...evidence, reopenedAt: admin.firestore.Timestamp.now() });
  const error = await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_reopen', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  assert.deepEqual(error.details.missingEvidence, ['ARRIVAL', 'BEFORE_PHOTO', 'AFTER_PHOTO']);
});

test('a job flagged for a customer signature cannot close on photos alone', async () => {
  await seed('jeg_signature', { status: 'COMPLETED_PENDING_APPROVAL', evidenceRequirements: { signature: true }, signatureUrl: 'https://example.invalid/sig.png', ...(await seedCompleteJobEvidence('jeg_signature', 'tech_jeg')) });
  const error = await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_signature', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  assert.deepEqual(error.details.missingEvidence, ['SIGNATURE']);
});

// ─── Supervisor exception flow ───────────────────────────────────────────────────────────

test('exception request: reason, requester and state are validated server-side', async () => {
  await seed('jeg_req', { status: 'IN_PROGRESS', ...serverArrivalFields(), ...(await seedVerifiedBeforeWorkEvidence('jeg_req', 'tech_jeg')) });
  await expectHttpsError(call(requestJobEvidenceException, tech, { ticketId: 'jeg_req', reason: 'too short' }), 'invalid-argument');
  await expectHttpsError(call(requestJobEvidenceException, otherTech, { ticketId: 'jeg_req', reason: 'I am not assigned to this job at all.' }), 'permission-denied');
  await expectHttpsError(call(requestJobEvidenceException, tenant, { ticketId: 'jeg_req', reason: 'Please waive the photos for this job.' }), 'permission-denied');
  await expectHttpsError(call(requestJobEvidenceException, owner, { ticketId: 'jeg_req', reason: 'Please waive the photos for this job.' }), 'permission-denied');
  const result = await call(requestJobEvidenceException, tech, { ticketId: 'jeg_req', reason: 'Phone camera failed after the repair was finished.', missingEvidence: ['NOTES'] });
  assert.deepEqual(result.missingEvidence, ['AFTER_PHOTO', 'NOTES'], 'missing items are computed server-side, not taken from the client');
  const again = await call(requestJobEvidenceException, tech, { ticketId: 'jeg_req', reason: 'Phone camera failed after the repair was finished.' });
  assert.equal(again.idempotent, true);
  assert.equal(again.exceptionId, result.exceptionId);
  const record = (await db.doc(`maintenanceTickets/jeg_req/evidence_exceptions/${result.exceptionId}`).get()).data();
  assert.equal(record.status, 'PENDING');
  assert.equal(record.requestedBy, 'tech_jeg');
  assert.ok(record.requestedAt);
  const audit = await db.collection('audit_logs').where('action', '==', 'JOB_EVIDENCE_EXCEPTION_REQUESTED').get();
  assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].data().actorId, 'tech_jeg');
});

test('exception request is refused when proof is already complete or the job is closed', async () => {
  await seed('jeg_req_complete', { status: 'IN_PROGRESS', ...(await seedCompleteJobEvidence('jeg_req_complete', 'tech_jeg')) });
  await expectHttpsError(call(requestJobEvidenceException, tech, { ticketId: 'jeg_req_complete', reason: 'Nothing is missing but asking anyway.' }), 'failed-precondition');
  await seed('jeg_req_closed', { status: 'CLOSED' });
  await expectHttpsError(call(requestJobEvidenceException, supervisor, { ticketId: 'jeg_req_closed', reason: 'Retroactive waiver on a closed job.' }), 'failed-precondition');
});

test('exception decision: only a supervisor who is neither the technician nor the requester may decide', async () => {
  await seed('jeg_decide', { status: 'IN_PROGRESS' });
  const requested = await call(requestJobEvidenceException, supervisor, { ticketId: 'jeg_decide', reason: 'Site was already opened by the building FM team.' });
  const decide = (actor, extra = {}) => call(decideJobEvidenceException, actor, {
    ticketId: 'jeg_decide', exceptionId: requested.exceptionId, decision: 'APPROVE', reason: 'Checked with the building FM team by phone.', ...extra,
  });
  await expectHttpsError(decide(tech), 'permission-denied');
  await expectHttpsError(decide(dispatcher), 'permission-denied');
  await expectHttpsError(decide(owner), 'permission-denied');
  await expectHttpsError(decide(supervisor), 'permission-denied'); // requester cannot self-approve
  await expectHttpsError(decide(supervisor2, { reason: 'ok' }), 'invalid-argument');
  await expectHttpsError(decide(supervisor2, { decision: 'MAYBE' }), 'invalid-argument');
  const result = await decide(supervisor2);
  assert.equal(result.status, 'APPROVED');
  await expectHttpsError(decide(adminActor), 'failed-precondition'); // already decided
});

test('an admin-tier supervisor who is also the assigned technician cannot waive their own proof', async () => {
  await seed('jeg_selftech', { status: 'IN_PROGRESS', assignedTechnicianId: 'admin_jeg', technicianId: 'admin_jeg' });
  const requested = await call(requestJobEvidenceException, supervisor, { ticketId: 'jeg_selftech', reason: 'Admin went on site personally for this one.' });
  await expectHttpsError(call(decideJobEvidenceException, adminActor, {
    ticketId: 'jeg_selftech', exceptionId: requested.exceptionId, decision: 'APPROVE', reason: 'I did the job myself, waiving my own proof.',
  }), 'permission-denied');
});

test('approved exception: records who / why / when, audits it, notifies the technician, and lets the job close', async () => {
  // Arrival + before photo exist; the after photo and notes are missing.
  await seed('jeg_exc', { status: 'COMPLETED_PENDING_APPROVAL', ...serverArrivalFields(), ...(await seedVerifiedBeforeWorkEvidence('jeg_exc', 'tech_jeg')) });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_exc', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  const { requested } = await approvedException('jeg_exc');
  const record = (await db.doc(`maintenanceTickets/jeg_exc/evidence_exceptions/${requested.exceptionId}`).get()).data();
  assert.equal(record.status, 'APPROVED');
  assert.equal(record.decidedBy, 'sup_jeg');
  assert.equal(record.decidedByRole, 'supervisor');
  assert.equal(record.decidedWithMfa, true);
  assert.match(record.decisionReason, /Verified by phone/);
  assert.ok(record.decidedAt?.toMillis());
  assert.deepEqual(record.approvedMissingEvidence, ['AFTER_PHOTO', 'NOTES']);
  const approvedAudit = await db.collection('audit_logs').where('action', '==', 'JOB_EVIDENCE_EXCEPTION_APPROVED').get();
  assert.equal(approvedAudit.size, 1);
  assert.equal(approvedAudit.docs[0].data().actorId, 'sup_jeg');
  assert.deepEqual(approvedAudit.docs[0].data().metadata.missingEvidence, ['AFTER_PHOTO', 'NOTES']);
  const notes = await db.collection('notifications').where('recipientId', '==', 'tech_jeg').get();
  assert.equal(notes.docs[0].data().type, 'JOB_EVIDENCE_EXCEPTION_DECISION');

  const result = await call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_exc', action: 'APPROVE_CLOSE' });
  assert.equal(result.nextStatus, 'CLOSED');
  const data = await ticket('jeg_exc');
  assert.equal(data.closureEvidenceGate.mode, 'SUPERVISOR_EXCEPTION');
  assert.equal(data.closureEvidenceGate.exceptionId, requested.exceptionId);
  assert.equal(data.closureEvidenceGate.exceptionApprovedBy, 'sup_jeg');
});

test('approved exception lets the technician complete through the lifecycle callable', async () => {
  // Camera failed after work: arrival + before photo verified, after photo waived.
  await seed('jeg_exc_life', { status: 'IN_PROGRESS', ...serverArrivalFields(), ...(await seedVerifiedBeforeWorkEvidence('jeg_exc_life', 'tech_jeg')) });
  await expectHttpsError(call(updateTicketLifecycle, tech, { ticketId: 'jeg_exc_life', status: 'COMPLETED', notes: 'Replaced the valve and tested.' }), 'failed-precondition');
  await approvedException('jeg_exc_life');
  await call(updateTicketLifecycle, tech, { ticketId: 'jeg_exc_life', status: 'COMPLETED', notes: 'Replaced the valve and tested.' });
  const data = await ticket('jeg_exc_life');
  assert.equal(data.status, 'COMPLETED_PENDING_APPROVAL');
  assert.equal(data.closureEvidenceGate.mode, 'SUPERVISOR_EXCEPTION');
});

test('rejected exceptions, exceptions that do not cover the gap, reopens and reassignment do not unlock closure', async () => {
  // Rejected.
  await seed('jeg_rej', { status: 'COMPLETED_PENDING_APPROVAL' });
  const requested = await call(requestJobEvidenceException, tech, { ticketId: 'jeg_rej', reason: 'Customer refused access to the meter room.' });
  await call(decideJobEvidenceException, supervisor, { ticketId: 'jeg_rej', exceptionId: requested.exceptionId, decision: 'REJECT', reason: 'Go back and capture the proof properly.' });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_rej', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  assert.equal((await db.collection('audit_logs').where('action', '==', 'JOB_EVIDENCE_EXCEPTION_REJECTED').get()).size, 1);

  // Approved for one gap, but a later-required item (signature flag added) is not covered.
  await seed('jeg_partial', { status: 'COMPLETED_PENDING_APPROVAL', ...(await seedCompleteJobEvidence('jeg_partial', 'tech_jeg')), technicianNotes: '' });
  await approvedException('jeg_partial');
  await db.doc('maintenanceTickets/jeg_partial').update({ requiresCustomerSignature: true });
  const partial = await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_partial', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  assert.deepEqual(partial.details.missingEvidence, ['NOTES', 'SIGNATURE']);

  // Reopened after approval: needs a fresh decision.
  await seed('jeg_exc_reopen', { status: 'COMPLETED_PENDING_APPROVAL' });
  await approvedException('jeg_exc_reopen');
  await new Promise((resolve) => setTimeout(resolve, 5));
  await db.doc('maintenanceTickets/jeg_exc_reopen').update({ reopenedAt: admin.firestore.Timestamp.now() });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_exc_reopen', action: 'APPROVE_CLOSE' }), 'failed-precondition');

  // Reassigned to another technician: the exception was granted for the first one.
  await seed('jeg_exc_reassign', { status: 'COMPLETED_PENDING_APPROVAL' });
  await approvedException('jeg_exc_reassign');
  await db.doc('maintenanceTickets/jeg_exc_reassign').update({ assignedTechnicianId: 'tech_jeg_other', technicianId: 'tech_jeg_other' });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_exc_reassign', action: 'APPROVE_CLOSE' }), 'failed-precondition');
});

test('a hand-made APPROVED exception record without a valid decision does not unlock closure', async () => {
  await seed('jeg_fake_exc', { status: 'COMPLETED_PENDING_APPROVAL', evidenceExceptionId: 'fake' });
  await db.doc('maintenanceTickets/jeg_fake_exc/evidence_exceptions/fake').set({
    recordType: 'JOB_EVIDENCE_EXCEPTION', ticketId: 'jeg_fake_exc', status: 'APPROVED', assignedTechnicianId: 'tech_jeg',
    decidedBy: 'tech_jeg', decisionReason: 'self-approved by the technician on site', decidedAt: admin.firestore.Timestamp.now(),
    approvedMissingEvidence: ['ARRIVAL', 'BEFORE_PHOTO', 'AFTER_PHOTO', 'NOTES'],
  });
  await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_fake_exc', action: 'APPROVE_CLOSE' }), 'failed-precondition');
});

test('control: after-work evidence for a different technician does not satisfy AFTER_PHOTO', async () => {
  const evidence = await seedCompleteJobEvidence('jeg_othertech', 'tech_jeg');
  await seed('jeg_othertech', { status: 'COMPLETED_PENDING_APPROVAL', ...evidence, ...(await seedVerifiedAfterWorkEvidence('jeg_othertech', 'tech_jeg_other')) });
  const error = await expectHttpsError(call(ownerReviewTicketCompletion, owner, { ticketId: 'jeg_othertech', action: 'APPROVE_CLOSE' }), 'failed-precondition');
  assert.deepEqual(error.details.missingEvidence, ['AFTER_PHOTO']);
});
