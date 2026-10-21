'use strict';
// Regression (Oct 21 owner AC ticket yrgSFPa0): the real technician had one open job but
// users.currentJobCount read 10, because tickets deleted or closed while assigned never released
// their slot. Auto-dispatch rejected the technician as full ("NO_QUALIFIED_TECHNICIAN").
// Dispatch now judges capacity on real open assigned tickets and reconciles the counter; deleting
// or closing an assigned ticket releases the slot. The capacity limit itself is unchanged.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, clearFirestore } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const { autoRouteTicket, onTicketDeletedReleaseCapacity, onTicketStatusChanged } = runtime;
const capacity = lib('technicianCapacityReconcile.js');

const TECH = 'tech_capacity_drift';
const TICKET = 'ticket_capacity_drift';

async function seedTechnician(currentJobCount, extra = {}) {
  await db.doc(`users/${TECH}`).set({
    uid: TECH, role: 'technician', status: 'ACTIVE', suspended: false, onDuty: true, dutyStatus: 'ON_DUTY',
    isAvailable: true, available: true, currentJobCount, emirate: 'Abu Dhabi', tradeSkills: ['General Maintenance', 'AC / Cooling'],
    ...extra,
  });
}

async function seedOpenJobs(count) {
  for (let i = 0; i < count; i += 1) {
    await db.doc(`maintenanceTickets/open_${i}`).set({ assignedTechnicianId: TECH, technicianId: TECH, status: 'ASSIGNED', dispatchStatus: 'AUTO_ASSIGNED' });
  }
}

async function seedTicket() {
  await db.doc('properties/prop_drift').set({
    name: 'Villa Al Ain', ownerId: 'owner_drift', emirate: 'Abu Dhabi', city: 'Abu Dhabi', area: 'Alain',
    geo: { lat: 24.2017, lng: 55.7372, emirate: 'Abu Dhabi', city: 'Abu Dhabi', area: 'Alain', address: 'Abu Dhabi, UAE', verified: true },
  });
  await db.doc('users/owner_drift').set({ role: 'owner', displayName: 'Owner' });
  await db.doc(`maintenanceTickets/${TICKET}`).set({
    requesterRole: 'owner', source: 'OWNER_PORTAL_CALLABLE', ownerId: 'owner_drift', propertyId: 'prop_drift',
    category: 'AC / Cooling', description: 'The ac is not working', status: 'OPEN', assignedTechnicianId: null, technicianId: null,
  });
}

async function route() {
  const snap = await db.doc(`maintenanceTickets/${TICKET}`).get();
  await autoRouteTicket.run({ data: snap, params: { ticketId: TICKET } });
  return (await db.doc(`maintenanceTickets/${TICKET}`).get()).data();
}

test.beforeEach(clearFirestore);

test('a drifted counter (10 stored, 1 real open job) does not block dispatch and is reconciled', async () => {
  await seedTechnician(10);
  await seedOpenJobs(1);
  await db.doc('maintenanceTickets/closed_old').set({ assignedTechnicianId: TECH, status: 'CLOSED', dispatchStatus: 'CLOSED' });
  await seedTicket();
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, TECH);
  assert.equal(ticket.dispatchStatus, 'AUTO_ASSIGNED');
  assert.equal((await db.doc(`users/${TECH}`).get()).data().currentJobCount, 2);
});

test('a technician genuinely at the limit is still skipped even if the stored counter is low', async () => {
  await seedTechnician(0);
  await seedOpenJobs(3);
  await seedTicket();
  const ticket = await route();
  assert.equal(ticket.assignedTechnicianId, null);
  assert.equal(ticket.dispatchStatus, 'PENDING_MANUAL_DISPATCH');
});

test('deleting an assigned open ticket releases the slot, never below 0', async () => {
  await seedTechnician(5);
  await seedOpenJobs(2);
  const ref = db.doc('maintenanceTickets/open_0');
  const snap = await ref.get();
  await ref.delete();
  await onTicketDeletedReleaseCapacity.run({ data: snap, params: { id: 'open_0' } });
  assert.equal((await db.doc(`users/${TECH}`).get()).data().currentJobCount, 1);

  await clearFirestore();
  await seedTechnician(0);
  await db.doc('maintenanceTickets/lonely').set({ assignedTechnicianId: TECH, status: 'ASSIGNED' });
  const lonely = await db.doc('maintenanceTickets/lonely').get();
  await db.doc('maintenanceTickets/lonely').delete();
  await onTicketDeletedReleaseCapacity.run({ data: lonely, params: { id: 'lonely' } });
  assert.equal((await db.doc(`users/${TECH}`).get()).data().currentJobCount, 0);
});

test('deleting a ticket that was already released or terminal changes nothing', async () => {
  await seedTechnician(1);
  await seedOpenJobs(1);
  for (const data of [{ assignedTechnicianId: TECH, status: 'CLOSED' }, { assignedTechnicianId: TECH, status: 'ASSIGNED', capacityReleasedAt: new Date() }, { status: 'OPEN' }]) {
    await db.doc('maintenanceTickets/x').set(data);
    const snap = await db.doc('maintenanceTickets/x').get();
    await db.doc('maintenanceTickets/x').delete();
    assert.equal(await capacity.releaseCapacityForDeletedTicket(db, 'x', snap.data()), null);
  }
  assert.equal((await db.doc(`users/${TECH}`).get()).data().currentJobCount, 1);
});

test('closing via dispatchStatus only (status unchanged) reconciles the counter', async () => {
  await seedTechnician(4);
  await seedOpenJobs(2);
  const ref = db.doc('maintenanceTickets/open_1');
  const before = await ref.get();
  await ref.set({ dispatchStatus: 'CLOSED' }, { merge: true });
  const after = await ref.get();
  await onTicketStatusChanged.run({ data: { before, after }, params: { id: 'open_1' } });
  assert.equal((await db.doc(`users/${TECH}`).get()).data().currentJobCount, 1);
});

test('occupancy helper ignores terminal, archived and other technicians\' tickets', () => {
  assert.equal(capacity.ticketOccupiesTechnician({ assignedTechnicianId: TECH, status: 'ASSIGNED' }, TECH), true);
  assert.equal(capacity.ticketOccupiesTechnician({ technicianId: TECH, status: 'IN_PROGRESS' }, TECH), true);
  for (const t of [
    { assignedTechnicianId: TECH, status: 'CLOSED' }, { assignedTechnicianId: TECH, status: 'cancelled' },
    { assignedTechnicianId: TECH, status: 'OPEN', dispatchStatus: 'CLOSED' }, { assignedTechnicianId: TECH, status: 'OPEN', archived: true },
    { assignedTechnicianId: 'someone_else', status: 'ASSIGNED' },
  ]) assert.equal(capacity.ticketOccupiesTechnician(t, TECH), false, JSON.stringify(t));
});
