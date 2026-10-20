'use strict';
// Regression (gap 9): createTenantServiceTicket accepts a unit linked to the tenant through
// tenantId / tenantUid / currentTenantId or through the tenant's verified email, but
// attemptAutoAssignment only compared the first non-empty of tenantId / tenantUid / userId /
// authUid and then returned silently. A ticket the callable had authorised never reached a
// technician and nobody was told. Dispatch now re-verifies the same link and escalates an
// unverified link to manual dispatch with admin + owner alerts.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore } = require('./_setup.cjs');

const { autoRouteTicket } = lib('runtimeAll.js');

const TENANT = 'tenant_link_case';
const TENANT_EMAIL = 'tenant.link@example.invalid';
const OWNER = 'owner_link_case';
const ADMIN = 'admin_link_case';
const TECH = 'tech_link_case';
const TICKET = 'ticket_link_case';
const UNIT = 'unit_link_case';
const PROPERTY = 'property_link_case';

async function seed({ unit = {}, ticket = {}, emailVerified = true } = {}) {
  try { await admin.auth().deleteUser(TENANT); } catch { /* not created yet */ }
  await createUser(TENANT, { role: 'tenant' }, { email: TENANT_EMAIL, emailVerified });
  await db.doc(`users/${ADMIN}`).set({ role: 'admin', displayName: 'Ops Admin' });
  await db.doc(`users/${OWNER}`).set({ role: 'owner', displayName: 'Owner' });
  await db.doc(`users/${TENANT}`).set({ role: 'tenant', displayName: 'Tenant', email: TENANT_EMAIL });
  await db.doc(`users/${TECH}`).set({
    role: 'technician', status: 'ACTIVE', suspended: false, onDuty: true, emirate: 'Dubai',
    trade: 'AC', currentJobCount: 0, maxConcurrentJobs: 3, displayName: 'Tech',
  });
  await db.doc(`properties/${PROPERTY}`).set({
    name: 'Link Tower', ownerId: OWNER, emirate: 'Dubai', city: 'Dubai', area: 'Marina',
    geo: { lat: 25.0802, lng: 55.1403, emirate: 'Dubai', city: 'Dubai', area: 'Marina', address: 'Marina, Dubai', verified: true },
  });
  await db.doc(`units/${UNIT}`).set({ propertyId: PROPERTY, unitNumber: '1203', ...unit });
  await db.doc(`maintenanceTickets/${TICKET}`).set({
    requesterRole: 'tenant', source: 'TENANT_SERVICE_TICKET_CALLABLE', tenantId: TENANT, tenantUid: TENANT,
    tenantEmail: TENANT_EMAIL, ownerId: OWNER, propertyId: PROPERTY, propertyName: 'Link Tower', unitId: UNIT,
    category: 'AC', description: 'AC not cooling', status: 'OPEN', dispatchStatus: 'PENDING_ASSIGNMENT',
    photoEvidenceRequired: true, evidenceStatus: 'TENANT_EVIDENCE_UPLOADED', assignedTechnicianId: null, technicianId: null,
    ...ticket,
  });
}

async function route() {
  const snap = await db.doc(`maintenanceTickets/${TICKET}`).get();
  await autoRouteTicket.run({ data: snap, params: { ticketId: TICKET } });
  return (await db.doc(`maintenanceTickets/${TICKET}`).get()).data();
}

async function stuckAlerts() {
  const snap = await db.collection('notifications').where('ticketId', '==', TICKET).get();
  return snap.docs.map((doc) => doc.data()).filter((data) => data.type === 'DISPATCH_STUCK');
}

test.beforeEach(clearFirestore);

test('unit linked only through currentTenantId (accepted at creation) is auto-assigned', async () => {
  await seed({ unit: { currentTenantId: TENANT } });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, TECH);
  assert.equal(ticket.status, 'ASSIGNED');
  assert.equal((await stuckAlerts()).length, 0);
});

test('unit linked only through the tenant verified email is auto-assigned', async () => {
  await seed({ unit: { tenantEmail: TENANT_EMAIL.toUpperCase() } });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, TECH);
  assert.equal(ticket.dispatchStatus, 'AUTO_ASSIGNED');
});

test('email link with an unverified Auth email is refused and escalated, not assigned', async () => {
  await seed({ unit: { tenantEmail: TENANT_EMAIL }, emailVerified: false });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, null);
  assert.equal(ticket.dispatchStatus, 'PENDING_MANUAL_DISPATCH');
  assert.equal(ticket.assignmentReasonCode, 'TENANT_UNIT_LINK_UNVERIFIED');
  assert.deepEqual((await stuckAlerts()).map((item) => item.recipientId).sort(), [ADMIN, OWNER].sort());
});

test('unit bound to another tenant is escalated with an alert instead of stopping silently', async () => {
  await seed({ unit: { tenantId: 'someone_else', tenantUid: 'someone_else', currentTenantId: 'someone_else' } });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, null);
  assert.equal(ticket.assignmentReasonCode, 'TENANT_UNIT_LINK_UNVERIFIED');
  assert.equal(ticket.assignmentDiagnostics.tenantMatches, false);
  assert.equal((await stuckAlerts()).length, 2);
});

test('the ticket tenantEmail field alone never links (it is not proof of the Auth email)', async () => {
  await seed({ unit: { tenantEmail: 'victim@example.invalid' }, ticket: { tenantEmail: 'victim@example.invalid' } });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, null);
  assert.equal(ticket.assignmentReasonCode, 'TENANT_UNIT_LINK_UNVERIFIED');
});

test('unit on a different property is escalated and not assigned', async () => {
  await seed({ unit: { tenantId: TENANT, propertyId: 'another_property' } });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, null);
  assert.equal(ticket.assignmentReasonCode, 'TENANT_UNIT_LINK_UNVERIFIED');
  assert.equal(ticket.assignmentDiagnostics.unitPropertyMatches, false);
});

test('ticket without a unit is escalated as an unverified tenant link', async () => {
  await seed({ unit: { tenantId: TENANT }, ticket: { unitId: '' } });
  const ticket = await route();
  assert.equal(ticket.assignmentReasonCode, 'TENANT_UNIT_LINK_UNVERIFIED');
  assert.equal(ticket.assignmentDiagnostics.missingLink, true);
});

test('a stale first uid field no longer hides a matching tenantUid', async () => {
  await seed({ unit: { tenantId: 'previous_tenant', tenantUid: TENANT } });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, TECH);
});

test('existing tenantId link still dispatches (unchanged behaviour)', async () => {
  await seed({ unit: { tenantId: TENANT, tenantUid: TENANT } });
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, TECH);
});

test('shared predicate: creation and dispatch use the same fields; unverified email never links', () => {
  const { tenantUnitLinkMatches } = lib('tenantUnitLink.js');
  const id = { uid: TENANT, verifiedEmail: '' };
  assert.equal(tenantUnitLinkMatches({ tenantId: TENANT }, id), true);
  assert.equal(tenantUnitLinkMatches({ tenantUid: TENANT }, id), true);
  assert.equal(tenantUnitLinkMatches({ currentTenantId: TENANT }, id), true);
  assert.equal(tenantUnitLinkMatches({ userId: TENANT }, id), false, 'creation does not accept userId');
  assert.equal(tenantUnitLinkMatches({ userId: TENANT }, id, { includeLegacyUidFields: true }), true, 'dispatch keeps main legacy fields');
  assert.equal(tenantUnitLinkMatches({ tenantEmail: TENANT_EMAIL }, id), false);
  assert.equal(tenantUnitLinkMatches({ tenantEmail: TENANT_EMAIL }, { uid: TENANT, verifiedEmail: TENANT_EMAIL }), true);
  assert.equal(tenantUnitLinkMatches({ tenantId: '' }, { uid: '', verifiedEmail: '' }), false);
  assert.equal(tenantUnitLinkMatches(undefined, id), false);
});
