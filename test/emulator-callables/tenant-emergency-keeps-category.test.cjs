'use strict';
// Regression: createTenantServiceTicket overwrote an EMERGENCY ticket's category with "emergency"
// and its description with "TENANT TRIGGERED SOS EMERGENCY". Admin and the Owner could not see what
// the complaint was about, and trade matching looked for an "emergency" technician that does not
// exist, so emergency complaints were never auto-assigned. Emergency is now carried in priority.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call } = require('./_setup.cjs');

const { createTenantServiceTicket, autoRouteTicket } = lib('runtimeAll.js');

const TENANT = 'tenant_emergency';
const OWNER = 'owner_emergency';
const tenant = { uid: TENANT, token: { role: 'tenant', email: 'tenant.emergency@example.invalid', email_verified: true } };
const verifiedAt = admin.firestore.Timestamp.fromMillis(Date.parse('2026-09-01T08:00:00Z'));

test.before(async () => {
  await createUser(TENANT, { role: 'tenant' }, { email: tenant.token.email });
});

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc(`users/${TENANT}`).set({ role: 'tenant', status: 'active', displayName: 'Emergency Tenant', email: tenant.token.email });
  await db.doc(`users/${OWNER}`).set({ role: 'owner', status: 'active' });
  await db.doc('properties/property_emergency').set({
    name: 'Emergency Tower', ownerId: OWNER, emirate: 'Dubai', city: 'Dubai', area: 'Marina', address: 'Marina Walk, Dubai',
    geo: {
      lat: 25.0802, lng: 55.1403, emirate: 'Dubai', city: 'Dubai', area: 'Marina', address: 'Marina Walk, Dubai',
      verified: true, dispatchReady: true, verifiedBy: 'founder_uid', verifiedAt, verificationVersion: 1, source: 'admin_manual',
    },
    geoVerification: { state: 'VERIFIED', verifiedBy: 'founder_uid', verifiedAt, verificationVersion: 1, source: 'FOUNDER_MFA_REVIEW' },
  });
  await db.doc('units/unit_emergency').set({ propertyId: 'property_emergency', tenantId: TENANT, tenantUid: TENANT, unitNumber: '1203' });
});

async function create(clientRequestId, details) {
  const result = await call(createTenantServiceTicket, tenant, {
    kind: 'EMERGENCY', unitId: 'unit_emergency', propertyId: 'property_emergency', clientRequestId, ...(details ? { details } : {}),
  });
  assert.equal(result.status, 'SUCCESS');
  return { id: result.ticketId, data: (await db.doc(`maintenanceTickets/${result.ticketId}`).get()).data() };
}

test('emergency maintenance request keeps the tenant category, description and location', async () => {
  const { data } = await create('emergency-request-0001', {
    category: 'Plumbing', priority: 'emergency', description: 'Burst pipe flooding the kitchen', specificLocation: 'Kitchen sink',
    photoEvidenceExpected: true,
  });
  assert.equal(data.category, 'Plumbing');
  assert.equal(data.priority, 'emergency');
  assert.equal(data.isEmergency, true);
  assert.equal(data.emergencySource, 'TENANT_EMERGENCY_REQUEST');
  assert.equal(data.description, 'Burst pipe flooding the kitchen');
  assert.equal(data.specificLocation, 'Kitchen sink');
  assert.equal(data.dispatchStatus, 'PENDING_EMERGENCY_DISPATCH');
  assert.equal(data.requiresImmediateDispatch, true);
  assert.equal(data.ownerId, OWNER);
});

test('one-tap SOS without details keeps the SOS defaults', async () => {
  const { data } = await create('emergency-sos-000001');
  assert.equal(data.category, 'emergency');
  assert.equal(data.priority, 'emergency');
  assert.equal(data.emergencySource, 'TENANT_SOS_BUTTON');
  assert.equal(data.description, 'TENANT TRIGGERED SOS EMERGENCY');
  assert.equal(data.specificLocation, undefined);
});

test('an emergency plumbing complaint is auto-assigned to an on-duty plumber', async () => {
  await db.doc('users/tech_plumber').set({
    role: 'technician', status: 'ACTIVE', onDuty: true, emirate: 'Dubai', trade: 'plumbing', tradeSkills: ['plumbing'],
    currentJobCount: 0, maxConcurrentJobs: 3,
  });
  const { id } = await create('emergency-dispatch-01', {
    category: 'plumbing', priority: 'emergency', description: 'Water leaking through the ceiling', specificLocation: 'Bathroom',
  });
  const snap = await db.doc(`maintenanceTickets/${id}`).get();
  await autoRouteTicket.run({ data: snap, params: { ticketId: id } });
  const ticket = (await db.doc(`maintenanceTickets/${id}`).get()).data();
  assert.equal(ticket.assignedTechnicianId, 'tech_plumber');
  assert.equal(ticket.category, 'plumbing');
});
