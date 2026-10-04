'use strict';
// Regression: automatic dispatch ran only once, when the ticket was created. A complaint filed
// while no qualified technician was on duty stayed unassigned forever, even after a technician
// started or resumed duty. Starting/resuming duty (and the periodic sweep) now re-run the same
// server-side dispatch for waiting tickets.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const { autoRouteTicket, startTechnicianDuty, resumeTechnicianDuty, redispatchWaitingTicketsSweep } = runtime;
const { redispatchWaitingTickets, isAwaitingTechnician } = lib('ticketRedispatch.js');

const TECH = 'tech_redispatch';
const TENANT = 'tenant_redispatch';
const tech = { uid: TECH, token: { role: 'technician', email: 'tech.redispatch@example.invalid', email_verified: true } };

function technicianProfile(overrides = {}) {
  return {
    uid: TECH, role: 'technician', email: tech.token.email, displayName: 'Redispatch Tech', status: 'ACTIVE', approvalStatus: 'approved',
    emirate: 'Dubai', trade: 'plumbing', tradeSkills: ['plumbing'], currentJobCount: 0, maxConcurrentJobs: 3,
    onDuty: false, dutyStatus: 'OFF_DUTY', ...overrides,
  };
}

async function seedTicket(id, overrides = {}) {
  await db.doc(`maintenanceTickets/${id}`).set({
    requesterRole: 'tenant', source: 'TENANT_SERVICE_TICKET_CALLABLE', tenantId: TENANT, tenantUid: TENANT, ownerId: 'owner_redispatch',
    propertyId: 'property_redispatch', unitId: 'unit_redispatch', category: 'plumbing', description: 'Leaking sink',
    status: 'OPEN', dispatchStatus: 'PENDING_ASSIGNMENT', photoEvidenceRequired: true, evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
    assignedTechnicianId: null, technicianId: null, createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - 3600_000), ...overrides,
  });
}

async function routeOnCreate(id) {
  const snap = await db.doc(`maintenanceTickets/${id}`).get();
  await autoRouteTicket.run({ data: snap, params: { ticketId: id } });
  return (await db.doc(`maintenanceTickets/${id}`).get()).data();
}

test.before(async () => {
  await createUser(TECH, { role: 'technician' }, { email: tech.token.email });
});

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc(`users/${TENANT}`).set({ role: 'tenant', displayName: 'Tenant' });
  await db.doc('properties/property_redispatch').set({
    name: 'Redispatch Tower', ownerId: 'owner_redispatch', emirate: 'Dubai', city: 'Dubai', area: 'Marina',
    geo: { lat: 25.0802, lng: 55.1403, emirate: 'Dubai', city: 'Dubai', area: 'Marina', verified: true },
  });
  await db.doc('units/unit_redispatch').set({ propertyId: 'property_redispatch', tenantId: TENANT, tenantUid: TENANT, unitNumber: '12' });
  await db.doc(`users/${TECH}`).set(technicianProfile());
  await db.doc(`technicians/${TECH}`).set(technicianProfile());
});

test('ticket created while nobody is on duty is assigned when a qualified technician starts duty', async () => {
  await seedTicket('ticket_waiting');
  const before = await routeOnCreate('ticket_waiting');
  assert.equal(before.assignedTechnicianId, null, 'nobody on duty at creation time');

  const result = await call(startTechnicianDuty, tech, {});
  assert.equal(result.success, true);
  assert.equal(result.redispatch.attempted, 1);
  assert.equal(result.redispatch.assigned, 1);

  const after = (await db.doc('maintenanceTickets/ticket_waiting').get()).data();
  assert.equal(after.assignedTechnicianId, TECH);
  assert.equal(after.dispatchStatus, 'AUTO_ASSIGNED');
  assert.equal(after.status, 'ASSIGNED');
  const audit = await db.collection('audit_logs').where('action', '==', 'AUTO_ASSIGN_REDISPATCH_ON_DUTY').get();
  assert.equal(audit.size, 1);
});

test('resuming duty after a break re-attempts waiting tickets', async () => {
  // resumeTechnicianDuty is the readiness-gated wrapper (credentials, device, fresh GPS).
  const future = admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 86400000);
  const ready = technicianProfile({
    onDuty: true, dutyStatus: 'ON_BREAK', isAvailable: false, currentShiftId: 'shift_redispatch',
    medicalCardStatus: 'valid', medicalCardExpiry: future, drivingLicenseStatus: 'valid', drivingLicenseExpiry: future,
    certifications: [{ name: 'Plumbing', status: 'valid', expiryAt: future }], deviceRegistered: true, registeredDeviceId: 'device-redispatch',
    lastGpsAt: admin.firestore.Timestamp.now(), lastLocation: { lat: 25.08, lng: 55.14, accuracy: 10 },
  });
  await db.doc(`users/${TECH}`).set(ready);
  await db.doc(`technicians/${TECH}`).set(ready);
  await db.doc('technician_shifts/shift_redispatch').set({ uid: TECH, status: 'ON_BREAK', breaks: [{ start: new Date() }] });
  await seedTicket('ticket_break');
  const result = await call(resumeTechnicianDuty, tech, {});
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.redispatch.assigned, 1);
  assert.equal((await db.doc('maintenanceTickets/ticket_break').get()).data().assignedTechnicianId, TECH);
});

test('re-dispatch never reassigns assigned, completed, or photo-pending tickets and still respects eligibility', async () => {
  await seedTicket('ticket_assigned', { status: 'ASSIGNED', assignedTechnicianId: 'other_tech', technicianId: 'other_tech' });
  await seedTicket('ticket_done', { status: 'COMPLETED' });
  await seedTicket('ticket_photos', { evidenceStatus: 'PENDING_TENANT_UPLOAD' });
  await seedTicket('ticket_other_trade', { category: 'electrical' });
  const result = await call(startTechnicianDuty, tech, {});
  assert.equal(result.redispatch.assigned, 0);
  const tickets = Object.fromEntries((await db.collection('maintenanceTickets').get()).docs.map((doc) => [doc.id, doc.data()]));
  assert.equal(tickets.ticket_assigned.assignedTechnicianId, 'other_tech');
  assert.equal(tickets.ticket_done.status, 'COMPLETED');
  assert.equal(tickets.ticket_done.assignedTechnicianId, null);
  assert.equal(tickets.ticket_photos.assignedTechnicianId, null);
  assert.equal(tickets.ticket_other_trade.assignedTechnicianId, null);
});

test('scheduled sweep assigns the oldest waiting ticket first and the helper filters correctly', async () => {
  await db.doc(`users/${TECH}`).set(technicianProfile({ onDuty: true, dutyStatus: 'ON_DUTY', maxConcurrentJobs: 1 }));
  await seedTicket('ticket_newer', { createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - 60_000) });
  await seedTicket('ticket_older', { createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - 7200_000) });
  await redispatchWaitingTicketsSweep.run({});
  const tickets = Object.fromEntries((await db.collection('maintenanceTickets').get()).docs.map((doc) => [doc.id, doc.data()]));
  assert.equal(tickets.ticket_older.assignedTechnicianId, TECH);
  assert.equal(tickets.ticket_newer.assignedTechnicianId, null, 'capacity of one job is respected');

  assert.equal(isAwaitingTechnician({ status: 'OPEN' }), true);
  assert.equal(isAwaitingTechnician({ status: 'pending_assignment' }), true);
  assert.equal(isAwaitingTechnician({ status: 'OPEN', assignedTechnicianId: 'x' }), false);
  assert.equal(isAwaitingTechnician({ status: 'IN_PROGRESS' }), false);
  let calls = 0;
  const summary = await redispatchWaitingTickets({ db, attempt: async () => { calls += 1; throw new Error('boom'); }, limit: 5 });
  assert.equal(summary.attempted, 1, 'only the remaining waiting ticket is attempted');
  assert.equal(calls, 1);
  assert.equal(summary.assigned, 0, 'a failing attempt is contained');
});
