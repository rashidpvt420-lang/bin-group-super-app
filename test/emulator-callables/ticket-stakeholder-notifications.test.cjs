'use strict';
// Regression: Admin learned about a new complaint only if the tenant web form called
// notifyTicketCreated (SOS and other paths told nobody), the property Owner was never told a
// complaint was filed, assignment alerts said the technician "has accepted" when they had only
// been assigned, and Admin was never told a job was completed.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, clearFirestore, call } = require('./_setup.cjs');

const { autoRouteTicket, onTicketStatusChanged, createNotification } = lib('runtimeAll.js');

const TENANT = 'tenant_stakeholder';
const OWNER = 'owner_stakeholder';
const ADMIN = 'admin_stakeholder';
const OPS = 'ops_stakeholder';
const TECH = 'tech_stakeholder';
const TICKET = 'ticket_stakeholder';

async function seedTicket(overrides = {}) {
  await db.doc(`maintenanceTickets/${TICKET}`).set({
    requesterRole: 'tenant', source: 'TENANT_SERVICE_TICKET_CALLABLE', tenantId: TENANT, tenantUid: TENANT, createdBy: TENANT,
    ownerId: OWNER, ownerUid: OWNER, propertyId: 'property_stakeholder', propertyName: 'Stakeholder Tower', unitNumber: '507',
    category: 'Plumbing', description: 'Kitchen sink leaking under the cabinet', priority: 'normal', status: 'OPEN',
    dispatchStatus: 'PENDING_ASSIGNMENT', photoEvidenceRequired: true, evidenceStatus: 'PENDING_TENANT_UPLOAD',
    assignedTechnicianId: null, technicianId: null, ...overrides,
  });
}

async function created() {
  const snap = await db.doc(`maintenanceTickets/${TICKET}`).get();
  await autoRouteTicket.run({ data: snap, params: { ticketId: TICKET } });
}

async function transition(update) {
  const ref = db.doc(`maintenanceTickets/${TICKET}`);
  const before = await ref.get();
  await ref.set(update, { merge: true });
  const after = await ref.get();
  await onTicketStatusChanged.run({ data: { before, after }, params: { id: TICKET } });
}

async function notificationsFor(recipientId) {
  const snap = await db.collection('notifications').where('recipientId', '==', recipientId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc(`users/${ADMIN}`).set({ role: 'admin', displayName: 'Admin' });
  await db.doc(`users/${OPS}`).set({ role: 'operations_admin', displayName: 'Ops' });
  await db.doc(`users/${OWNER}`).set({ role: 'owner', displayName: 'Owner' });
  await db.doc(`users/${TENANT}`).set({ role: 'tenant', displayName: 'Tenant' });
  await db.doc(`users/${TECH}`).set({ role: 'technician', displayName: 'Tech' });
});

test('a new tenant complaint alerts every admin and the owner with what it is about, once', async () => {
  await seedTicket();
  await created();
  await created(); // trigger retry
  for (const adminId of [ADMIN, OPS]) {
    const items = (await notificationsFor(adminId)).filter((item) => item.type === 'TICKET_CREATED');
    assert.equal(items.length, 1, adminId);
    assert.match(items[0].body, /Plumbing: Kitchen sink leaking/);
    assert.match(items[0].body, /Stakeholder Tower, unit 507/);
    assert.equal(items[0].link, `/admin/tickets?ticketId=${TICKET}`);
  }
  const owner = (await notificationsFor(OWNER)).filter((item) => item.type === 'TICKET_CREATED');
  assert.equal(owner.length, 1);
  assert.equal(owner[0].link, `/owner/ticket/${TICKET}`);
  assert.match(owner[0].body, /Plumbing: Kitchen sink leaking/);
  assert.equal((await notificationsFor(TENANT)).length, 0, 'the tenant who filed it is not alerted about their own complaint');

  // The tenant form's own ADMIN_GROUP call is now an idempotent no-op instead of a duplicate.
  const tenant = { uid: TENANT, token: { role: 'tenant', email: 'tenant@example.invalid', email_verified: true } };
  const result = await call(createNotification, tenant, {
    recipientId: 'ADMIN_GROUP', recipientRole: 'admin', type: 'TICKET_CREATED', title: 'New NORMAL Request',
    body: 'Tenant submitted a Plumbing complaint.', ticketId: TICKET, link: `/admin/tickets?ticketId=${TICKET}`,
  });
  assert.equal(result.idempotent, true);
  assert.equal((await notificationsFor(ADMIN)).length, 1);
});

test('an owner-filed complaint alerts admins but not the owner who filed it', async () => {
  await seedTicket({ requesterRole: 'owner', createdBy: OWNER, tenantId: null, tenantUid: null });
  await created();
  assert.equal((await notificationsFor(OWNER)).length, 0);
  assert.equal((await notificationsFor(ADMIN)).length, 1);
});

test('assignment says assigned (not accepted) and alerts admins; completion alerts admins once', async () => {
  await seedTicket({ evidenceStatus: 'TENANT_EVIDENCE_UPLOADED', photoEvidenceRequired: false });
  await transition({ status: 'ASSIGNED', assignedTechnicianId: TECH, technicianId: TECH, assignedTechnicianName: 'Ali Hassan' });

  const ownerAssigned = (await notificationsFor(OWNER)).filter((item) => /Technician Assigned/.test(item.title));
  assert.equal(ownerAssigned.length, 1);
  assert.match(ownerAssigned[0].body, /Ali Hassan has been assigned to ticket/);
  assert.doesNotMatch(ownerAssigned[0].body, /accepted/);
  const adminAssigned = (await notificationsFor(ADMIN)).filter((item) => item.type === 'TICKET_ASSIGNED');
  assert.equal(adminAssigned.length, 1);
  assert.match(adminAssigned[0].body, /Ali Hassan was assigned to #/);

  await transition({ status: 'ACCEPTED' });
  const confirmed = (await notificationsFor(OWNER)).filter((item) => /Technician Confirmed/.test(item.title));
  assert.equal(confirmed.length, 1);

  await transition({ status: 'COMPLETED_PENDING_APPROVAL' });
  await transition({ status: 'COMPLETED' });
  const adminCompleted = (await notificationsFor(ADMIN)).filter((item) => item.type === 'TICKET_COMPLETED');
  assert.equal(adminCompleted.length, 1, 'completion is reported to admins once');
  assert.match(adminCompleted[0].body, /Ali Hassan completed #/);
  assert.ok((await notificationsFor(OWNER)).some((item) => /Work Completed/.test(item.title)), 'owner is told about completion');
});
