'use strict';
// Regression: when automatic dispatch found no technician it returned silently (and only logged
// errors), so a tenant complaint could sit OPEN with nobody alerted. The ticket must now be
// marked PENDING_MANUAL_DISPATCH with a reason, audited once, and the admins plus the property
// owner notified once — without assigning anybody.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, clearFirestore } = require('./_setup.cjs');

const { autoRouteTicket } = lib('runtimeAll.js');

const TENANT = 'tenant_no_match';
const OWNER = 'owner_no_match';
const ADMIN = 'admin_no_match';
const TICKET = 'ticket_no_match';

async function seed({ property = {}, unit = {} } = {}) {
  await db.doc(`users/${ADMIN}`).set({ role: 'admin', displayName: 'Ops Admin' });
  await db.doc(`users/${OWNER}`).set({ role: 'owner', displayName: 'Owner' });
  await db.doc(`users/${TENANT}`).set({ role: 'tenant', displayName: 'Tenant' });
  await db.doc('properties/property_no_match').set({
    name: 'No Match Tower', ownerId: OWNER, emirate: 'Dubai', city: 'Dubai', area: 'Marina',
    geo: { lat: 25.0802, lng: 55.1403, emirate: 'Dubai', city: 'Dubai', area: 'Marina', address: 'Marina, Dubai', verified: true },
    ...property,
  });
  await db.doc('units/unit_no_match').set({ propertyId: 'property_no_match', tenantId: TENANT, tenantUid: TENANT, unitNumber: '804', ...unit });
  await db.doc(`maintenanceTickets/${TICKET}`).set({
    requesterRole: 'tenant', source: 'TENANT_SERVICE_TICKET_CALLABLE', tenantId: TENANT, tenantUid: TENANT, ownerId: OWNER,
    propertyId: 'property_no_match', propertyName: 'No Match Tower', unitId: 'unit_no_match', category: 'AC',
    description: 'AC leaking', status: 'OPEN', dispatchStatus: 'PENDING_ASSIGNMENT', photoEvidenceRequired: true,
    evidenceStatus: 'TENANT_EVIDENCE_UPLOADED', assignedTechnicianId: null, technicianId: null,
  });
}

async function route() {
  const snap = await db.doc(`maintenanceTickets/${TICKET}`).get();
  await autoRouteTicket.run({ data: snap, params: { ticketId: TICKET } });
  return (await db.doc(`maintenanceTickets/${TICKET}`).get()).data();
}

// Only the stuck-dispatch alerts; other lifecycle notifications (e.g. "complaint received") may
// also exist for the ticket and are covered by their own suite.
async function alerts() {
  const snap = await db.collection('notifications').where('ticketId', '==', TICKET).get();
  return snap.docs.map((doc) => doc.data()).filter((data) => data.type === 'DISPATCH_STUCK');
}

async function audits() {
  const snap = await db.collection('audit_logs').where('targetId', '==', TICKET).where('action', '==', 'AUTO_ASSIGN_MANUAL_DISPATCH_REQUIRED').get();
  return snap.docs.map((doc) => doc.data());
}

test.beforeEach(clearFirestore);

test('no on-duty technician: ticket escalates to manual dispatch, admin and owner are alerted once, audit written once', async () => {
  await seed();
  const ticket = await route();
  assert.equal(ticket.status, 'OPEN');
  assert.equal(ticket.assignedTechnicianId, null);
  assert.equal(ticket.dispatchStatus, 'PENDING_MANUAL_DISPATCH');
  assert.equal(ticket.assignmentReasonCode, 'NO_ON_DUTY_TECHNICIANS');
  assert.match(ticket.assignmentError, /No technician is on duty/);
  assert.ok(ticket.manualDispatchRequiredAt);

  const first = await alerts();
  assert.deepEqual(first.map((item) => item.recipientId).sort(), [ADMIN, OWNER].sort());
  assert.ok(first.every((item) => item.type === 'DISPATCH_STUCK' && item.read === false));
  assert.equal(first.find((item) => item.recipientId === ADMIN).link, `/admin/tickets?ticketId=${TICKET}`);
  assert.equal(first.find((item) => item.recipientId === OWNER).link, `/owner/ticket/${TICKET}`);
  assert.equal((await audits()).length, 1);

  await route();
  assert.equal((await alerts()).length, 2, 'repeat attempts do not duplicate alerts');
  assert.equal((await audits()).length, 1, 'repeat attempts do not duplicate audits');
});

test('on-duty technician who does not qualify: reason is NO_QUALIFIED_TECHNICIAN with counts', async () => {
  await seed();
  await db.doc('users/tech_elsewhere').set({ role: 'technician', status: 'ACTIVE', onDuty: true, emirate: 'Sharjah', trade: 'HVAC', currentJobCount: 0 });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, null);
  assert.equal(ticket.assignmentReasonCode, 'NO_QUALIFIED_TECHNICIAN');
  assert.equal(ticket.assignmentDiagnostics.onDutyTechnicianCount, 1);
  assert.equal(ticket.assignmentDiagnostics.eligibleTechnicianCount, 0);
});

test('property without emirate escalates as MISSING_PROPERTY_GEO', async () => {
  await seed({ property: { emirate: '', geo: { lat: 25.0802, lng: 55.1403, verified: true } } });
  const ticket = await route();
  assert.equal(ticket.assignmentReasonCode, 'MISSING_PROPERTY_GEO');
  assert.equal(ticket.dispatchStatus, 'PENDING_MANUAL_DISPATCH');
  assert.equal((await alerts()).length, 2);
});

test('tenant not linked to the unit escalates as TENANT_UNIT_LINK_UNVERIFIED', async () => {
  await seed({ unit: { tenantId: 'someone_else', tenantUid: 'someone_else' } });
  const ticket = await route();
  assert.equal(ticket.assignmentReasonCode, 'TENANT_UNIT_LINK_UNVERIFIED');
  assert.equal(ticket.assignedTechnicianId, null);
});

test('a ticket still waiting for tenant photos is not escalated', async () => {
  await seed();
  await db.doc(`maintenanceTickets/${TICKET}`).set({ evidenceStatus: 'PENDING_TENANT_UPLOAD' }, { merge: true });
  const ticket = await route();
  assert.equal(ticket.dispatchStatus, 'PENDING_ASSIGNMENT');
  assert.equal((await alerts()).length, 0);
});
