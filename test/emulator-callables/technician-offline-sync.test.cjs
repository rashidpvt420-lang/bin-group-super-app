'use strict';
// Technician offline sync: duplicate protection, conflict protection, payload validation, never changes ticket status.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const rt = lib('runtimeAll.js');
let tech, owner;
const photo = 'https://firebasestorage.googleapis.com/v0/b/x/o/p1.jpg';
test.before(async () => {
  tech = await createUser('tos_tech', { role: 'technician' });
  owner = await createUser('tos_owner', { role: 'owner' });
});
test.beforeEach(clearFirestore);

test('accepts once, de-duplicates retries, flags conflicts, keeps ticket status', async () => {
  await db.doc('maintenanceTickets/t1').set({ assignedTechnicianId: 'tos_tech', ownerId: 'o1', status: 'in_progress' });
  await db.doc('maintenanceTickets/t2').set({ assignedTechnicianId: 'someone_else', status: 'in_progress' });
  await db.doc('maintenanceTickets/t3').set({ assignedTechnicianId: 'tos_tech', status: 'cancelled' });
  const now = Date.now();
  const events = [
    { clientEventId: 'fe_aaaaaaaa1', ticketId: 't1', type: 'PHOTOS', capturedAtMs: now - 60000, payload: { photoUrls: [photo] } },
    { clientEventId: 'fe_aaaaaaaa2', ticketId: 't1', type: 'MATERIALS', capturedAtMs: now - 50000, payload: { items: [{ name: 'Capacitor 35uF', qty: 1 }] } },
    { clientEventId: 'fe_aaaaaaaa3', ticketId: 't2', type: 'NOTE', capturedAtMs: now, payload: { note: 'x' } },
    { clientEventId: 'fe_aaaaaaaa4', ticketId: 't3', type: 'NOTE', capturedAtMs: now, payload: { note: 'x' } },
    { clientEventId: 'fe_aaaaaaaa5', ticketId: 't1', type: 'PHOTOS', capturedAtMs: now, payload: { photoUrls: ['https://evil.example/p.jpg'] } },
    { clientEventId: 'fe_aaaaaaaa6', ticketId: 't1', type: 'NOTE', capturedAtMs: now + 3600000, payload: { note: 'future' } },
  ];
  const r1 = await call(rt.technicianSyncOfflineEvents, tech, { events });
  assert.deepEqual(r1.results.map((r) => r.result), ['ACCEPTED', 'ACCEPTED', 'CONFLICT_NOT_ASSIGNED', 'CONFLICT_TICKET_CLOSED', 'REJECTED_INVALID', 'REJECTED_TIMESTAMP']);
  const r2 = await call(rt.technicianSyncOfflineEvents, tech, { events: events.slice(0, 2) });
  assert.deepEqual(r2.results.map((r) => r.result), ['DUPLICATE', 'DUPLICATE']);
  assert.equal((await db.collection('technician_offline_events').get()).size, 2);
  assert.equal((await db.doc('maintenanceTickets/t1').get()).data().status, 'in_progress');
});

test('only technicians; batch size bounded', async () => {
  await expectHttpsError(call(rt.technicianSyncOfflineEvents, owner, { events: [{}] }), 'permission-denied');
  await expectHttpsError(call(rt.technicianSyncOfflineEvents, tech, { events: [] }), 'invalid-argument');
  await expectHttpsError(call(rt.technicianSyncOfflineEvents, tech, { events: Array(26).fill({}) }), 'invalid-argument');
});
