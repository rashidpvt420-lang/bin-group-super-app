'use strict';
// Audit 9 Nov 2026:
//  P1-4  requestStaffOvertime from the HR page sent no jobId, so proof was always SHIFT_ONLY. The server now
//        links the caller's own open assigned job.
//  P2-17 a night shift opened yesterday (still ACTIVE after midnight) must accept an overtime claim.
//  P1-3  getMyHours deducts staff_shifts.totalBreakMinutes before the overtime split.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const dubaiDate = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' })
  .format(new Date(Date.now() + offsetDays * 86_400_000));

let tech;
let other;
test.before(async () => {
  tech = await createUser('ot_link_tech', { role: 'technician' });
  other = await createUser('ot_link_other', { role: 'technician' });
});
test.beforeEach(clearFirestore);

async function openShift(uid, date, status = 'ACTIVE') {
  await db.doc(`staff_shifts/SHIFT_${uid}_${date}`).set({ staffId: uid, shiftDate: date, status, clockInTime: new Date(Date.now() - 9 * 3_600_000) });
}

test('P1-4: no jobId links the caller\'s own open job and records GPS + photo proof', async () => {
  await openShift(tech.uid, dubaiDate());
  await db.doc('maintenanceTickets/ot_job_other').set({ assignedTechnicianId: other.uid, status: 'IN_PROGRESS' });
  await db.doc('maintenanceTickets/ot_job_1').set({
    assignedTechnicianId: tech.uid,
    status: 'IN_PROGRESS',
    arrivedAt: new Date(Date.now() - 3_600_000),
    arrivalLocation: { lat: 25.1, lng: 55.2, accuracy: 20, capturedAtMs: Date.now() - 3_600_000, locationSource: 'native_gps' },
    beforePhotos: ['ticket-evidence/ot_job_1/before.jpg'],
  });
  const result = await call(runtime.requestStaffOvertime, tech, { estimatedMinutes: 45, reason: 'Pump replacement ran late' });
  assert.equal(result.jobId, 'ot_job_1');
  assert.equal(result.jobAutoLinked, true);
  assert.equal(result.proofStrength, 'SHIFT_JOB_GPS_PHOTOS');
  const tracker = (await db.doc(`staff_request_trackers/${result.trackerId}`).get()).data();
  assert.equal(tracker.jobId, 'ot_job_1');
  assert.equal(tracker.proofStrength, 'SHIFT_JOB_GPS_PHOTOS');
  assert.equal(tracker.shiftDate, dubaiDate());
});

test('P1-4: with no open job the claim stays SHIFT_ONLY and says so', async () => {
  await openShift(tech.uid, dubaiDate());
  await db.doc('maintenanceTickets/ot_done').set({ assignedTechnicianId: tech.uid, status: 'COMPLETED' });
  const result = await call(runtime.requestStaffOvertime, tech, { estimatedMinutes: 30, reason: 'Stayed to brief the next shift' });
  assert.equal(result.jobId, null);
  assert.equal(result.jobAutoLinked, false);
  assert.equal(result.proofStrength, 'SHIFT_ONLY');
});

test('P1-4: an explicit jobId assigned to someone else is still refused', async () => {
  await openShift(tech.uid, dubaiDate());
  await db.doc('maintenanceTickets/ot_job_other').set({ assignedTechnicianId: other.uid, status: 'IN_PROGRESS' });
  await expectHttpsError(call(runtime.requestStaffOvertime, tech, { estimatedMinutes: 30, reason: 'Not my job at all', jobId: 'ot_job_other' }), 'permission-denied');
});

test('P2-17: a shift opened yesterday and still active after midnight accepts the claim with yesterday\'s date', async () => {
  await openShift(tech.uid, dubaiDate(-1));
  const result = await call(runtime.requestStaffOvertime, tech, { estimatedMinutes: 60, reason: 'Night emergency call-out' });
  assert.equal(result.shiftDate, dubaiDate(-1));
  const tracker = (await db.doc(`staff_request_trackers/${result.trackerId}`).get()).data();
  assert.equal(tracker.shiftId, `SHIFT_${tech.uid}_${dubaiDate(-1)}`);
  assert.equal(tracker.shiftDate, dubaiDate(-1));
});

test('P2-17: a closed shift from yesterday is not reopened for overtime', async () => {
  await openShift(tech.uid, dubaiDate(-1), 'COMPLETED');
  await expectHttpsError(call(runtime.requestStaffOvertime, tech, { estimatedMinutes: 60, reason: 'Night emergency call-out' }), 'failed-precondition');
});

test('P1-3: My Hours deducts unpaid break minutes before overtime', async () => {
  const date = '2026-11-02'; // Monday, not a default rest day
  const at = (hhmm) => new Date(`${date}T${hhmm}:00+04:00`);
  await db.doc(`staff_shifts/SHIFT_${tech.uid}_${date}`).set({ staffId: tech.uid, shiftDate: date, status: 'COMPLETED', clockInTime: at('08:00'), clockOutTime: at('17:00'), totalBreakMinutes: 60, breaks: [{ startMs: at('12:00').getTime(), endMs: at('13:00').getTime(), minutes: 60 }] });
  const result = await call(runtime.getMyHours, tech, { month: '2026-11' });
  const day = result.days.find((row) => row.shiftDate === date);
  assert.equal(day.workedMinutes, 480);
  assert.equal(day.breakMinutes, 60);
  assert.equal(day.overtimeMinutes, 0);
});
