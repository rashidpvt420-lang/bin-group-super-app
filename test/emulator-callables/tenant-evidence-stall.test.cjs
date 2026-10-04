'use strict';
// Regression (gap 11): a tenant request is created with photoEvidenceRequired=true and waits
// for the browser to upload photos and flip evidenceStatus to TENANT_EVIDENCE_UPLOADED. If the
// upload never finished or failed, dispatch never started and nobody was told. The sweep now
// flags such tickets for manual dispatch and alerts admins and the tenant, without assigning,
// without changing evidenceStatus and without relaxing the photo requirement.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, clearFirestore } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const stall = lib('tenantEvidenceStall.js');

const TENANT = 'tenant_stall';
const OWNER = 'owner_stall';
const ADMIN = 'admin_stall';
const TECH = 'tech_stall';
const TICKET = 'ticket_stall';
const NOW = Date.parse('2026-10-04T16:00:00Z');
const minutesAgo = (minutes) => admin.firestore.Timestamp.fromMillis(NOW - minutes * 60_000);

async function seed(ticket = {}, { tech = true } = {}) {
  await db.doc(`users/${ADMIN}`).set({ role: 'admin', displayName: 'Ops Admin' });
  await db.doc(`users/${OWNER}`).set({ role: 'owner' });
  await db.doc(`users/${TENANT}`).set({ role: 'tenant' });
  if (tech) {
    await db.doc(`users/${TECH}`).set({
      role: 'technician', status: 'ACTIVE', suspended: false, onDuty: true, emirate: 'Dubai', trade: 'AC',
      currentJobCount: 0, maxConcurrentJobs: 3,
    });
  }
  await db.doc('properties/property_stall').set({
    name: 'Stall Tower', ownerId: OWNER, emirate: 'Dubai', city: 'Dubai', area: 'Marina',
    geo: { lat: 25.0802, lng: 55.1403, emirate: 'Dubai', city: 'Dubai', area: 'Marina', address: 'Marina, Dubai', verified: true },
  });
  await db.doc('units/unit_stall').set({ propertyId: 'property_stall', tenantId: TENANT, tenantUid: TENANT, unitNumber: '9' });
  await db.doc(`maintenanceTickets/${TICKET}`).set({
    requesterRole: 'tenant', source: 'TENANT_SERVICE_TICKET_CALLABLE', tenantId: TENANT, tenantUid: TENANT, ownerId: OWNER,
    propertyId: 'property_stall', propertyName: 'Stall Tower', unitId: 'unit_stall', category: 'AC',
    status: 'OPEN', dispatchStatus: 'PENDING_ASSIGNMENT', trackingStatus: 'WAITING_FOR_TENANT_EVIDENCE',
    photoEvidenceRequired: true, evidenceStatus: 'PENDING_TENANT_UPLOAD', photos: [], primaryPhotoUrl: '',
    assignedTechnicianId: null, technicianId: null, createdAt: minutesAgo(45),
    ...ticket,
  });
}

const read = async () => (await db.doc(`maintenanceTickets/${TICKET}`).get()).data();
async function notifications() {
  const snap = await db.collection('notifications').where('ticketId', '==', TICKET).get();
  return snap.docs.map((doc) => doc.data());
}
async function audits() {
  const snap = await db.collection('audit_logs').where('targetId', '==', TICKET).where('action', '==', 'TENANT_EVIDENCE_OVERDUE_MANUAL_DISPATCH').get();
  return snap.size;
}

test.beforeEach(clearFirestore);

test('photos not received after 30 minutes: flagged for manual dispatch, admin and tenant alerted once', async () => {
  await seed();
  const result = await stall.flagStalledTenantEvidenceTickets({ db, nowMs: NOW });
  assert.equal(result.flagged, 1);
  const ticket = await read();
  assert.equal(ticket.dispatchStatus, 'PENDING_MANUAL_DISPATCH');
  assert.equal(ticket.assignmentReasonCode, 'TENANT_EVIDENCE_OVERDUE');
  assert.match(ticket.assignmentError, /not received within 30 minutes/);
  assert.equal(ticket.evidenceStatus, 'PENDING_TENANT_UPLOAD', 'evidence status is not rewritten');
  assert.equal(ticket.photoEvidenceRequired, true, 'photo requirement is not relaxed');
  assert.equal(ticket.status, 'OPEN');
  assert.equal(ticket.assignedTechnicianId, null, 'the sweep never assigns, even with a qualified technician on duty');
  assert.ok(ticket.evidenceOverdueAt);

  const sent = await notifications();
  assert.deepEqual(sent.map((item) => `${item.recipientRole}:${item.recipientId}`).sort(), [`admin:${ADMIN}`, `tenant:${TENANT}`]);
  assert.equal(sent.find((item) => item.recipientRole === 'admin').type, 'DISPATCH_STUCK');
  assert.equal(sent.find((item) => item.recipientRole === 'tenant').link, `/tenant/ticket/${TICKET}`);
  assert.equal(await audits(), 1);

  assert.equal((await stall.flagStalledTenantEvidenceTickets({ db, nowMs: NOW + 60 * 60_000 })).flagged, 0);
  assert.equal((await notifications()).length, 2, 'no duplicate alerts');
  assert.equal(await audits(), 1, 'no duplicate audit');
});

test('a fresh pending upload (under 30 minutes) is left alone', async () => {
  await seed({ createdAt: minutesAgo(10) });
  assert.equal((await stall.flagStalledTenantEvidenceTickets({ db, nowMs: NOW })).flagged, 0);
  const ticket = await read();
  assert.equal(ticket.dispatchStatus, 'PENDING_ASSIGNMENT');
  assert.equal((await notifications()).length, 0);
});

test('a reported upload failure is flagged at the next sweep without waiting', async () => {
  await seed({ createdAt: minutesAgo(1), evidenceStatus: 'TENANT_EVIDENCE_UPLOAD_FAILED', evidenceUploadError: 'network' });
  assert.equal((await stall.flagStalledTenantEvidenceTickets({ db, nowMs: NOW })).flagged, 1);
  const ticket = await read();
  assert.equal(ticket.assignmentReasonCode, 'TENANT_EVIDENCE_OVERDUE');
  assert.match(ticket.assignmentError, /upload failed/);
});

test('assigned, uploaded, photo-optional, closed and non-tenant tickets are never touched', async () => {
  const cases = [
    { assignedTechnicianId: TECH, technicianId: TECH },
    { evidenceStatus: 'TENANT_EVIDENCE_UPLOADED' },
    { photoEvidenceRequired: false, evidenceStatus: 'EMERGENCY_EVIDENCE_OPTIONAL' },
    { status: 'CANCELLED' },
    { status: 'PENDING_SCHEDULING' },
    { evidenceOverdueAt: minutesAgo(5) },
  ];
  for (const overrides of cases) {
    await clearFirestore();
    await seed(overrides);
    const result = await stall.flagStalledTenantEvidenceTickets({ db, nowMs: NOW });
    assert.equal(result.flagged, 0, JSON.stringify(overrides));
    assert.equal((await notifications()).length, 0, JSON.stringify(overrides));
  }
});

test('photos uploaded after the flag: existing dispatch path assigns and the overdue reason is cleared', async () => {
  await seed();
  await stall.flagStalledTenantEvidenceTickets({ db, nowMs: NOW });
  const ref = db.doc(`maintenanceTickets/${TICKET}`);
  const before = await ref.get();
  await ref.set({ photos: ['https://example.invalid/p.png'], primaryPhotoUrl: 'https://example.invalid/p.png', evidenceStatus: 'TENANT_EVIDENCE_UPLOADED' }, { merge: true });
  const after = await ref.get();
  const event = { data: { before, after }, params: { id: TICKET, ticketId: TICKET } };
  await runtime.onTicketStatusChanged.run(event);
  await runtime.clearTenantEvidenceOverdueOnUpload.run(event);
  const ticket = await read();
  assert.equal(ticket.assignedTechnicianId, TECH);
  assert.equal(ticket.status, 'ASSIGNED');
  assert.equal(ticket.assignmentReasonCode, undefined);
  assert.equal(ticket.assignmentError, undefined);
  assert.ok(ticket.evidenceOverdueResolvedAt);
});

test('the scheduled sweep is deployed from the runtime entry and runs end to end', async () => {
  await seed({ createdAt: admin.firestore.Timestamp.fromMillis(Date.now() - 2 * 60 * 60_000) });
  assert.equal(typeof runtime.tenantEvidenceStallSweep?.run, 'function');
  await runtime.tenantEvidenceStallSweep.run({});
  assert.equal((await read()).assignmentReasonCode, 'TENANT_EVIDENCE_OVERDUE');
});
