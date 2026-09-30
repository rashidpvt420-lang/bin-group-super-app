'use strict';
// Regression: an on-duty, dispatch-ready Technician with no job could never receive a first job.
// adminAssignTechnician requires a fresh GPS fix, but the only GPS writer
// (updateTechnicianLiveLocation) requires an already-assigned active mission, and Firestore rules
// block client writes to location fields. reportTechnicianAvailabilityLocation is the server path.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const { reportTechnicianAvailabilityLocation, adminAssignTechnician, updateTechnicianLiveLocation } = runtime;

const TECH = 'tech_availability';
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const tech = { uid: TECH, token: { role: 'technician', email: 'tech.availability@example.invalid', email_verified: true } };
const future = () => admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 86400000);
const fix = (overrides = {}) => ({ latitude: 25.0802, longitude: 55.1403, accuracy: 12, deviceTimestampMs: Date.now() - 1000, ...overrides });

function readyProfile(overrides = {}) {
  return {
    uid: TECH, role: 'technician', email: tech.token.email, displayName: 'Availability Tech', status: 'active', approvalStatus: 'approved',
    medicalCardStatus: 'valid', medicalCardExpiry: future(), drivingLicenseStatus: 'valid', drivingLicenseExpiry: future(),
    certifications: [{ name: 'Plumbing', status: 'valid', expiryAt: future() }],
    deviceRegistered: true, registeredDeviceId: 'device-availability', onDuty: true, dutyStatus: 'ON_DUTY', currentShiftId: 'shift_1',
    currentJobCount: 0, ...overrides,
  };
}

let dispatcher;
test.before(async () => {
  await createUser(TECH, { role: 'technician' }, { email: tech.token.email });
  dispatcher = await createUser('dispatcher_availability', { role: 'operations_admin', admin: true }, { tokenExtra: MFA });
});
test.beforeEach(async () => {
  await clearFirestore();
  await admin.auth().setCustomUserClaims(TECH, { role: 'technician' });
  await db.doc(`users/${TECH}`).set(readyProfile());
  await db.doc(`technicians/${TECH}`).set(readyProfile());
  await db.doc('maintenanceTickets/ticket_first_job').set({ propertyId: 'property_a', unitId: 'unit_a_101', status: 'OPEN', category: 'plumbing' });
});

test('on-duty ready Technician reports availability GPS without a job, then receives the first assignment', async () => {
  await expectHttpsError(call(adminAssignTechnician, dispatcher, { ticketId: 'ticket_first_job', technicianId: TECH }), 'failed-precondition')
    .then((error) => assert.match(error.message, /fresh GPS location/));
  // The mission GPS path cannot bootstrap: there is no assigned mission yet.
  await expectHttpsError(call(updateTechnicianLiveLocation, tech, { action: 'UPDATE', ticketId: 'ticket_first_job', trackingSessionId: 'session_first_job', ...fix() }), 'permission-denied');

  const result = await call(reportTechnicianAvailabilityLocation, tech, fix());
  assert.equal(result.ok, true);
  const [user, technician] = await Promise.all([db.doc(`users/${TECH}`).get(), db.doc(`technicians/${TECH}`).get()]);
  for (const record of [user.data(), technician.data()]) {
    assert.equal(record.lastLocation.lat, 25.0802);
    assert.equal(record.lastLocation.purpose, 'DISPATCH_AVAILABILITY');
    assert.ok(record.lastGpsAt.toMillis() > Date.now() - 60_000);
    assert.equal(record.activeTicketId, undefined, 'availability GPS never binds a mission');
  }
  const live = await db.doc(`technician_live_locations/${TECH}`).get();
  assert.equal(live.exists, false, 'availability GPS is not published as mission live tracking');

  const assigned = await call(adminAssignTechnician, dispatcher, { ticketId: 'ticket_first_job', technicianId: TECH });
  assert.equal(assigned.status, 'ASSIGNED');
  assert.equal((await db.doc('maintenanceTickets/ticket_first_job').get()).data().assignedTechnicianId, TECH);
});

test('availability GPS requires on-duty, dispatch-ready status (no location written otherwise)', async () => {
  for (const [label, overrides] of [
    ['off duty', { onDuty: false, dutyStatus: 'OFF_DUTY' }],
    ['no active shift', { currentShiftId: null }],
    ['no registered device', { deviceRegistered: false, registeredDeviceId: null }],
    ['expired medical card', { medicalCardExpiry: admin.firestore.Timestamp.fromMillis(Date.now() - 86400000) }],
    ['unavailable', { isAvailable: false }],
  ]) {
    await db.doc(`users/${TECH}`).set(readyProfile(overrides));
    await db.doc(`technicians/${TECH}`).set(readyProfile(overrides));
    await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix()), 'failed-precondition');
    const record = (await db.doc(`technicians/${TECH}`).get()).data();
    assert.equal(record.lastLocation, undefined, `${label}: no location may be written`);
  }
});

test('availability GPS requires an approved, active Technician account and role', async () => {
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, null, fix()), 'unauthenticated');
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, { uid: TECH, token: { role: 'tenant' } }, fix()), 'permission-denied');
  await db.doc(`technicians/${TECH}`).set(readyProfile({ status: 'suspended', suspended: true }));
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix()), 'permission-denied');
  await db.doc(`technicians/${TECH}`).set(readyProfile({ status: 'pending', approvalStatus: 'pending' }));
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix()), 'permission-denied');
});

test('availability GPS rejects stale, inaccurate, zero, reversed or mocked fixes', async () => {
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix({ deviceTimestampMs: Date.now() - 10 * 60_000 })), 'failed-precondition');
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix({ deviceTimestampMs: Date.now() + 5 * 60_000 })), 'failed-precondition');
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix({ accuracy: 250 })), 'failed-precondition');
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix({ latitude: 0, longitude: 0 })), 'invalid-argument');
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix({ latitude: 55.14, longitude: 25.08 })), 'invalid-argument');
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix({ latitude: 'x' })), 'invalid-argument');
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix({ nativeLocationMocked: true })), 'failed-precondition');
  const record = (await db.doc(`technicians/${TECH}`).get()).data();
  assert.equal(record.lastLocation, undefined);
});

test('availability GPS does not override an active mission tracking session', async () => {
  await db.doc(`technician_live_locations/${TECH}`).set({ technicianUid: TECH, isTracking: true, activeTicketId: 'ticket_live', expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 60_000) });
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix()), 'failed-precondition');
});
