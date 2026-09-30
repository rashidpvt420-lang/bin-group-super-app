'use strict';
// N-36 regression: evaluateSLACron only matched status in ["OPEN", "assigned"], so stale tickets
// stored as canonical ASSIGNED, lower-case "open", or legacy aliases were never SLA-flagged.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, clearFirestore } = require('./_setup.cjs');

const { evaluateSLACron } = lib('index.js');

const HOUR = 60 * 60 * 1000;
const ago = (hours) => admin.firestore.Timestamp.fromMillis(Date.now() - hours * HOUR);

const stale = {
  open_upper: 'OPEN', open_lower: 'open', assigned_upper: 'ASSIGNED', assigned_lower: 'assigned',
  alias_new: 'NEW', alias_dispatched: 'DISPATCHED', alias_tech_assigned: 'TECHNICIAN_ASSIGNED',
  pending_scheduling: 'PENDING_SCHEDULING', reopened: 'REOPENED',
};
const notBreached = {
  in_progress: ['IN_PROGRESS', 30], accepted: ['ACCEPTED', 30], completed: ['COMPLETED', 30],
  closed: ['closed', 30], cancelled: ['CANCELLED', 30], scheduled: ['SCHEDULED', 30],
  fresh_open: ['OPEN', 2], fresh_assigned: ['assigned', 2],
};

test('every stale pre-work ticket is flagged regardless of status case or legacy alias', async () => {
  await clearFirestore();
  const batch = db.batch();
  for (const [id, status] of Object.entries(stale)) batch.set(db.doc(`maintenanceTickets/${id}`), { status, createdAt: ago(30) });
  for (const [id, [status, hours]] of Object.entries(notBreached)) batch.set(db.doc(`maintenanceTickets/${id}`), { status, createdAt: ago(hours) });
  await batch.commit();

  assert.equal(typeof evaluateSLACron.run, 'function');
  await evaluateSLACron.run({ scheduleTime: new Date().toISOString(), jobName: 'n36-test' });

  const snap = await db.collection('maintenanceTickets').get();
  const flagged = snap.docs.filter((doc) => doc.data().slaViolated === true).map((doc) => doc.id).sort();
  assert.deepEqual(flagged, Object.keys(stale).sort());
  for (const doc of snap.docs.filter((entry) => entry.data().slaViolated === true)) {
    assert.ok(doc.data().lastEscalatedAt instanceof admin.firestore.Timestamp);
  }
});
