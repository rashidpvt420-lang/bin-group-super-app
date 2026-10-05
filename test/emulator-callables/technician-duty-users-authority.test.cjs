'use strict';
// Regression (hard-clearance investigation, 4 Oct 2026): the duty callables write duty state to
// users/{uid}, but readiness merged { ...users, ...technicians }. A technicians/{uid} profile left
// at its provisioning values (available:false, onDuty:false) overrode a live ON_DUTY users/{uid}
// record, so availability GPS, admin assignment, accept and lifecycle all failed with
// "dispatch availability". Production technician ...Kth2 was in exactly this state.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const { reportTechnicianAvailabilityLocation, adminAssignTechnician, takeTechnicianBreak, endTechnicianDuty } = runtime;
const { mergeTechnicianProfiles } = lib('technicianDutyProfile.js');
const { approvedAndReadyTechnician } = lib('secureAdminTechnicianAssignment.js');

const TECH = 'tech_duty_authority';
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const tech = { uid: TECH, token: { role: 'technician', email: 'tech.duty@example.invalid', email_verified: true } };
const future = () => admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 86400000);
const fix = (overrides = {}) => ({ latitude: 24.2075, longitude: 55.7447, accuracy: 12, deviceTimestampMs: Date.now() - 1000, ...overrides });

const credentials = () => ({
  uid: TECH, role: 'technician', email: tech.token.email, status: 'ACTIVE', approvalStatus: 'APPROVED', suspended: false,
  medicalCardStatus: 'valid', medicalCardExpiry: future(), drivingLicenseStatus: 'valid', drivingLicenseExpiry: future(),
  certificationsStatus: 'valid', deviceRegistered: true, registeredDevicePlatform: 'android', currentJobCount: 0, maxConcurrentJobs: 10,
});
// users/{uid}: what startTechnicianDuty writes.
const liveUser = (overrides = {}) => ({
  ...credentials(), onDuty: true, isAvailable: true, available: true, dutyStatus: 'ON_DUTY', currentShiftId: `${TECH}_shift`, ...overrides,
});
// technicians/{uid}: provisioning values never updated by the duty callables (the production shape).
const staleTechnician = (overrides = {}) => ({ ...credentials(), available: false, onDuty: false, ...overrides });

let dispatcher;
test.before(async () => {
  await createUser(TECH, { role: 'technician' }, { email: tech.token.email });
  dispatcher = await createUser('dispatcher_duty_authority', { role: 'operations_admin', admin: true }, { tokenExtra: MFA });
});
test.beforeEach(async () => {
  await clearFirestore();
  await admin.auth().setCustomUserClaims(TECH, { role: 'technician' });
  await db.doc(`users/${TECH}`).set(liveUser());
  await db.doc(`technicians/${TECH}`).set(staleTechnician());
  await db.doc(`technician_shifts/${TECH}_shift`).set({ shiftId: `${TECH}_shift`, uid: TECH, status: 'ACTIVE', breaks: [] });
  await db.doc('maintenanceTickets/ticket_duty_authority').set({ propertyId: 'property_a', unitId: 'unit_a_101', status: 'OPEN', category: 'general' });
});

test('merge: users/{uid} duty fields win over a stale technicians/{uid}; other fields keep technicians precedence', () => {
  const merged = mergeTechnicianProfiles(
    { onDuty: true, available: true, isAvailable: true, dutyStatus: 'ON_DUTY', currentShiftId: 's1', medicalCardStatus: 'expired' },
    { onDuty: false, available: false, medicalCardStatus: 'valid', registeredInstallationHash: 'h' },
  );
  assert.equal(merged.onDuty, true);
  assert.equal(merged.available, true);
  assert.equal(merged.currentShiftId, 's1');
  assert.equal(merged.medicalCardStatus, 'valid', 'credential fields still come from technicians/{uid}');
  assert.equal(merged.registeredInstallationHash, 'h');
  // Fallback: when users/{uid} lacks a duty field, technicians/{uid} still supplies it.
  assert.equal(mergeTechnicianProfiles({}, { available: false }).available, false);
  assert.equal(mergeTechnicianProfiles(null, { onDuty: true }).onDuty, true);
});

test('readiness: a live ON_DUTY users/{uid} is not overridden by stale technicians/{uid}.available=false', () => {
  const nowMs = Date.now();
  const withGps = { lastGpsAt: admin.firestore.Timestamp.fromMillis(nowMs - 1000) };
  const ready = approvedAndReadyTechnician(liveUser(withGps), staleTechnician(), true, true, nowMs);
  assert.deepEqual(ready.failures, []);
  // A real users/{uid} break or off-duty state still blocks dispatch.
  const onBreak = approvedAndReadyTechnician(liveUser({ ...withGps, isAvailable: false, available: false, dutyStatus: 'ON_BREAK' }), staleTechnician({ available: true }), true, true, nowMs);
  assert.ok(onBreak.failures.includes('dispatch availability'));
  const offDuty = approvedAndReadyTechnician(liveUser({ ...withGps, onDuty: false, dutyStatus: 'OFF_DUTY', currentShiftId: null }), staleTechnician({ onDuty: true, available: true }), true, true, nowMs);
  assert.ok(offDuty.failures.includes('on-duty status'));
});

test('production shape: availability GPS and admin assignment succeed for an on-duty Technician with a stale technicians profile', async () => {
  const report = await call(reportTechnicianAvailabilityLocation, tech, fix());
  assert.equal(report.ok, true);
  const assigned = await call(adminAssignTechnician, dispatcher, { ticketId: 'ticket_duty_authority', technicianId: TECH });
  assert.equal(assigned.status, 'ASSIGNED');
});

test('suspension is still enforced regardless of duty authority', async () => {
  await db.doc(`technicians/${TECH}`).set(staleTechnician({ status: 'SUSPENDED', suspended: true }));
  await expectHttpsError(call(reportTechnicianAvailabilityLocation, tech, fix()), 'permission-denied');
});

test('duty callables mirror duty state to technicians/{uid} so the profile no longer goes stale', async () => {
  await call(takeTechnicianBreak, tech, {});
  let technician = (await db.doc(`technicians/${TECH}`).get()).data();
  assert.equal(technician.dutyStatus, 'ON_BREAK');
  assert.equal(technician.available, false);
  assert.equal(technician.onDuty, true);
  assert.equal(technician.medicalCardStatus, 'valid', 'mirror is a merge, not a replacement');

  await call(endTechnicianDuty, tech, {});
  technician = (await db.doc(`technicians/${TECH}`).get()).data();
  assert.equal(technician.dutyStatus, 'OFF_DUTY');
  assert.equal(technician.onDuty, false);
  assert.equal(technician.currentShiftId, undefined);
  assert.ok(technician.dutyEndedAt);
});

test('duty mirror never creates a technicians/{uid} profile that does not exist', async () => {
  await db.doc(`technicians/${TECH}`).delete();
  await call(takeTechnicianBreak, tech, {});
  assert.equal((await db.doc(`technicians/${TECH}`).get()).exists, false);
  assert.equal((await db.doc(`users/${TECH}`).get()).data().dutyStatus, 'ON_BREAK');
});
