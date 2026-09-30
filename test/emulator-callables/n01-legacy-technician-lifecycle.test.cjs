'use strict';
// N-01 regression: the legacy technician lifecycle callables in functions/index.ts
// (accept/start/pause/finish/closeTechnicianJob) wrote ticket status directly, skipping ARRIVED,
// the 250 m geofence, GPS and server evidence, and reopened CLOSED tickets.
// Source repro: audit/emu/phase4-legacy-lifecycle-repro.cjs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
let tech;
let adminActor;
test.before(async () => {
  tech = await createUser('tech_n01', { role: 'technician' });
  adminActor = await createUser('admin_n01', { role: 'admin', admin: true }, { tokenExtra: { firebase: { sign_in_second_factor: 'phone' } } });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/tech_n01').set({ role: 'technician', status: 'active', approvalStatus: 'approved' });
  await db.doc('technicians/tech_n01').set({ role: 'technician', status: 'active', approvalStatus: 'approved' });
  await db.doc('properties/prop_n01').set({ ownerId: 'owner_n01', geo: { lat: 25.2048, lng: 55.2708, verified: true, dispatchReady: true } });
  const base = { propertyId: 'prop_n01', unitId: 'unit_n01', ownerId: 'owner_n01', tenantId: 'tenant_n01', assignedTechnicianId: 'tech_n01', technicianId: 'tech_n01' };
  await db.doc('maintenanceTickets/t_assigned').set({ ...base, status: 'ASSIGNED' });
  await db.doc('maintenanceTickets/t_progress').set({ ...base, status: 'IN_PROGRESS' });
  await db.doc('maintenanceTickets/t_closed').set({ ...base, status: 'CLOSED', ownerApproved: true });
});

const ticketStatus = async (id) => (await db.doc(`maintenanceTickets/${id}`).get()).data().status;

const cases = [
  ['acceptTechnicianJob', () => tech, { ticketId: 't_assigned' }, 't_assigned', 'ASSIGNED'],
  ['startTechnicianWork', () => tech, { ticketId: 't_assigned' }, 't_assigned', 'ASSIGNED'],
  ['finishTechnicianWork', () => tech, { ticketId: 't_progress', beforePhotos: ['https://example.invalid/b.jpg'], afterPhotos: ['https://example.invalid/a.jpg'], notes: 'done done done' }, 't_progress', 'IN_PROGRESS'],
  ['pauseTechnicianWork', () => tech, { ticketId: 't_closed', reason: 'waiting for parts' }, 't_closed', 'CLOSED'],
  ['finishTechnicianWork', () => tech, { ticketId: 't_closed', beforePhotos: ['x'], afterPhotos: ['y'], notes: 'reopen reopen' }, 't_closed', 'CLOSED'],
  ['closeTechnicianJob', () => adminActor, { ticketId: 't_progress' }, 't_progress', 'IN_PROGRESS'],
];
for (const [name, who, data, ticketId, expected] of cases) {
  test(`${name} on ${expected} ticket is retired and leaves status unchanged`, async () => {
    assert.equal(typeof runtime[name]?.run, 'function', `${name} must stay exported as a fail-closed stub`);
    const error = await expectHttpsError(call(runtime[name], who(), data), 'failed-precondition');
    assert.match(error.message, /retired/i);
    assert.equal(await ticketStatus(ticketId), expected);
  });
}

test('retired stubs still require authentication', async () => {
  await expectHttpsError(call(runtime.startTechnicianWork, null, { ticketId: 't_assigned' }), 'unauthenticated');
});

test('control: canonical updateTicketLifecycle still refuses ASSIGNED -> IN_PROGRESS without ARRIVED', async () => {
  await assert.rejects(call(runtime.updateTicketLifecycle, tech, { ticketId: 't_assigned', status: 'IN_PROGRESS' }));
  assert.equal(await ticketStatus('t_assigned'), 'ASSIGNED');
});
