'use strict';
// Regression: ACTIVATE DUTY (startTechnicianDuty) wrote duty state only to users/{uid}, but
// dispatch readiness evaluates {...users, ...technicians}. A technicians profile left at
// available:false / onDuty:false by adminCreateUser overrode the live duty state, so the
// Technician failed "dispatch availability", the availability GPS reporter refused to record a
// fix, and manual assignment stayed blocked on "fresh GPS location" as well.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const {
  startTechnicianDuty, takeTechnicianBreak, resumeTechnicianDuty, endTechnicianDuty,
  reportTechnicianAvailabilityLocation, adminAssignTechnician,
} = runtime;
const { approvedAndReadyTechnician } = lib('secureAdminTechnicianAssignment.js');

const TECH = 'tech_duty_mirror';
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const tech = { uid: TECH, token: { role: 'technician', email: 'tech.duty.mirror@example.invalid', email_verified: true } };
const fix = (overrides = {}) => ({ latitude: 25.0802, longitude: 55.1403, accuracy: 12, deviceTimestampMs: Date.now() - 1000, ...overrides });

// Shape of a provisioned + approved Technician (matches the live record that failed): valid
// credentials and registered device on technicians, duty fields stale on technicians.
const usersProfile = (overrides = {}) => ({
  uid: TECH, role: 'technician', email: tech.token.email, displayName: 'Duty Mirror Tech', status: 'ACTIVE',
  suspended: false, deviceRegistered: true, deviceVerified: true, ...overrides,
});
const technicianProfile = (overrides = {}) => ({
  uid: TECH, role: 'technician', status: 'ACTIVE', approvalStatus: 'APPROVED', suspended: false,
  medicalCardStatus: 'valid', drivingLicenseStatus: 'valid', certificationsStatus: 'valid',
  deviceRegistered: true, deviceVerified: true, available: false, onDuty: false, currentJobCount: 0, ...overrides,
});

async function readiness() {
  const [user, technician] = await Promise.all([db.doc(`users/${TECH}`).get(), db.doc(`technicians/${TECH}`).get()]);
  return approvedAndReadyTechnician(user.data() || {}, technician.data() || {}, user.exists, technician.exists);
}
async function technicianDoc() {
  return (await db.doc(`technicians/${TECH}`).get()).data() || {};
}

let dispatcher;
test.before(async () => {
  await createUser(TECH, { role: 'technician' }, { email: tech.token.email });
  dispatcher = await createUser('dispatcher_duty_mirror', { role: 'operations_admin', admin: true }, { tokenExtra: MFA });
});
test.beforeEach(async () => {
  await clearFirestore();
  await admin.auth().setCustomUserClaims(TECH, { role: 'technician' });
  await db.doc(`users/${TECH}`).set(usersProfile());
  await db.doc(`technicians/${TECH}`).set(technicianProfile());
  await db.doc('maintenanceTickets/ticket_duty_mirror').set({ propertyId: 'property_a', unitId: 'unit_a_101', status: 'OPEN', category: 'plumbing' });
});

test('stale technicians available:false/onDuty:false -> ACTIVATE DUTY -> GPS -> manual assignment passes', async () => {
  const before = await readiness();
  assert.ok(before.failures.includes('dispatch availability'));

  const started = await call(startTechnicianDuty, tech, {});
  assert.equal(started.success, true);
  const mirrored = await technicianDoc();
  assert.equal(mirrored.onDuty, true);
  assert.equal(mirrored.available, true);
  assert.equal(mirrored.isAvailable, true);
  assert.equal(mirrored.dutyStatus, 'ON_DUTY');
  assert.equal(mirrored.currentShiftId, started.shiftId);
  assert.deepEqual((await readiness()).failures, ['fresh GPS location']);

  const gps = await call(reportTechnicianAvailabilityLocation, tech, fix());
  assert.equal(gps.ok, true);
  assert.ok((await technicianDoc()).lastGpsAt.toMillis() > Date.now() - 60_000, 'GPS timestamp lands on technicians too');
  assert.deepEqual((await readiness()).failures, []);

  const assigned = await call(adminAssignTechnician, dispatcher, { ticketId: 'ticket_duty_mirror', technicianId: TECH });
  assert.equal(assigned.status, 'ASSIGNED');
});

test('break, resume and end duty keep the technicians profile in step with users', async () => {
  const { shiftId } = await call(startTechnicianDuty, tech, {});
  await call(reportTechnicianAvailabilityLocation, tech, fix());

  await call(takeTechnicianBreak, tech, {});
  let mirrored = await technicianDoc();
  assert.equal(mirrored.dutyStatus, 'ON_BREAK');
  assert.equal(mirrored.available, false);
  assert.equal(mirrored.isAvailable, false);
  assert.equal(mirrored.currentShiftId, shiftId);
  await expectHttpsError(call(adminAssignTechnician, dispatcher, { ticketId: 'ticket_duty_mirror', technicianId: TECH }), 'failed-precondition')
    .then((error) => assert.match(error.message, /dispatch availability/));

  await call(resumeTechnicianDuty, tech, {});
  mirrored = await technicianDoc();
  assert.equal(mirrored.dutyStatus, 'ON_DUTY');
  assert.equal(mirrored.available, true);
  assert.equal(mirrored.onDuty, true);

  await call(endTechnicianDuty, tech, {});
  mirrored = await technicianDoc();
  assert.equal(mirrored.onDuty, false);
  assert.equal(mirrored.available, false);
  assert.equal(mirrored.isAvailable, false);
  assert.equal(mirrored.dutyStatus, 'OFF_DUTY');
  assert.equal(mirrored.currentShiftId, undefined);
  const after = await readiness();
  assert.ok(after.failures.includes('active shift'));
  assert.ok(after.failures.includes('dispatch availability'));
});

test('already-on-duty Technician with a stale technicians profile is reconciled by the availability GPS report', async () => {
  // Exact live shape: users on duty, technicians available:false/onDuty:false, no dutyStatus/currentShiftId/lastGpsAt.
  await db.doc(`users/${TECH}`).set(usersProfile({
    onDuty: true, isAvailable: true, available: true, dutyStatus: 'ON_DUTY', currentShiftId: `${TECH}_20260930_1790787017652`,
  }));
  assert.ok((await readiness()).failures.includes('dispatch availability'));

  const gps = await call(reportTechnicianAvailabilityLocation, tech, fix());
  assert.equal(gps.ok, true);
  const mirrored = await technicianDoc();
  assert.equal(mirrored.available, true);
  assert.equal(mirrored.isAvailable, true);
  assert.equal(mirrored.onDuty, true);
  assert.equal(mirrored.dutyStatus, 'ON_DUTY');
  assert.equal(mirrored.currentShiftId, `${TECH}_20260930_1790787017652`);
  const assigned = await call(adminAssignTechnician, dispatcher, { ticketId: 'ticket_duty_mirror', technicianId: TECH });
  assert.equal(assigned.status, 'ASSIGNED');
});

test('reconciliation never makes an off-duty or uncredentialed Technician dispatchable', async () => {
  // Off duty on users: the mirror copies the off-duty state; GPS is still refused.
  await db.doc(`technicians/${TECH}`).set(technicianProfile({ available: true, onDuty: true, dutyStatus: 'ON_DUTY', currentShiftId: 'stale_shift' }));
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix()), 'failed-precondition');
  assert.equal((await technicianDoc()).lastGpsAt, undefined);

  // On duty on users but the medical card is not valid: still refused, nothing written.
  await db.doc(`users/${TECH}`).set(usersProfile({ onDuty: true, isAvailable: true, available: true, dutyStatus: 'ON_DUTY', currentShiftId: 'shift_x' }));
  await db.doc(`technicians/${TECH}`).set(technicianProfile({ medicalCardStatus: 'expired' }));
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix()), 'failed-precondition')
    .then((error) => assert.match(error.message, /medical card/));
  const untouched = await technicianDoc();
  assert.equal(untouched.available, false);
  assert.equal(untouched.lastGpsAt, undefined);
});

test('duty callables never create a technicians profile that did not exist', async () => {
  await db.doc(`technicians/${TECH}`).delete();
  await db.doc(`users/${TECH}`).set(usersProfile({ approvalStatus: 'APPROVED' }));
  await call(startTechnicianDuty, tech, {});
  assert.equal((await db.doc(`technicians/${TECH}`).get()).exists, false);
  await call(endTechnicianDuty, tech, {});
  assert.equal((await db.doc(`technicians/${TECH}`).get()).exists, false);
});
