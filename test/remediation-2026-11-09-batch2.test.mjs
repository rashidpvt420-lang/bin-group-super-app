// Batch 2 of the 9 Nov 2026 audit remediation (P1-3, P1-4, P1-5, P2-17).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const { computeShiftHours } = await loadTsModules('functions/hrHoursEngine.ts', ['functions/hrPayConfig.ts']);
const P = await loadTsModules('functions/technicianPayableShift.ts');
const M = await loadTsModules('src/technician/utils/missionState.ts');
const at = (date, hhmm) => Date.parse(`${date}T${hhmm}:00+04:00`);
const read = (path) => readFileSync(path, 'utf8');

test('P1-3: a 60 min break on 08:00-17:00 is an 8 h day with no overtime', () => {
  const d = computeShiftHours({ shiftDate: '2026-11-02', clockInMs: at('2026-11-02', '08:00'), clockOutMs: at('2026-11-02', '17:00'), breakMinutes: 60 });
  assert.equal(d.workedMinutes, 480);
  assert.equal(d.breakMinutes, 60);
  assert.equal(d.overtimeMinutes, 0);
});

test('P1-3: a 30 min break on 08:00-17:00 leaves 30 min of overtime', () => {
  const d = computeShiftHours({ shiftDate: '2026-11-02', clockInMs: at('2026-11-02', '08:00'), clockOutMs: at('2026-11-02', '17:00'), breakMinutes: 30 });
  assert.equal(d.workedMinutes, 510);
  assert.equal(d.overtimeMinutes, 30);
});

test('P1-3: no break input keeps the old behaviour; a break longer than the shift cannot go negative', () => {
  assert.equal(computeShiftHours({ shiftDate: '2026-11-02', clockInMs: at('2026-11-02', '08:00'), clockOutMs: at('2026-11-02', '17:00') }).workedMinutes, 540);
  assert.equal(computeShiftHours({ shiftDate: '2026-11-02', clockInMs: at('2026-11-02', '08:00'), clockOutMs: at('2026-11-02', '09:00'), breakMinutes: 500 }).workedMinutes, 0);
  assert.equal(computeShiftHours({ shiftDate: '2026-11-02', clockInMs: at('2026-11-02', '08:00'), clockOutMs: at('2026-11-02', '17:00'), breakMinutes: -20 }).workedMinutes, 540);
});

test('P1-3: night overtime starts after the normal day plus the break', () => {
  // 13:00 → 23:00 with 60 min break: normal day ends 22:00, OT 22:00-23:00 is night OT (22:00-04:00).
  const d = computeShiftHours({ shiftDate: '2026-11-02', clockInMs: at('2026-11-02', '13:00'), clockOutMs: at('2026-11-02', '23:00'), breakMinutes: 60 });
  assert.equal(d.overtimeMinutes, 60);
  assert.equal(d.nightOvertimeMinutes, 60);
});

test('P1-3: BREAK / RESUME / CLOCK_OUT keep break intervals on the payable shift', () => {
  const t0 = at('2026-11-02', '12:00');
  const onBreak = P.payableShiftPatch({ status: 'ACTIVE', clockInTime: { seconds: 1 } }, 'BREAK', t0);
  assert.equal(onBreak.fields.status, 'ON_BREAK');
  assert.equal(onBreak.fields.breakStartedAtMs, t0);
  // A second BREAK keeps the original start.
  assert.equal(P.payableShiftPatch({ status: 'ON_BREAK', clockInTime: { seconds: 1 }, breakStartedAtMs: t0 }, 'BREAK', t0 + 600_000).fields.breakStartedAtMs, t0);
  const resumed = P.payableShiftPatch({ status: 'ON_BREAK', clockInTime: { seconds: 1 }, breakStartedAtMs: t0, totalBreakMinutes: 15, breaks: [{ startMs: 1, endMs: 900_001, minutes: 15 }] }, 'RESUME', t0 + 45 * 60_000);
  assert.equal(resumed.fields.status, 'ACTIVE');
  assert.equal(resumed.fields.totalBreakMinutes, 60);
  assert.equal(resumed.fields.breaks.length, 2);
  assert.deepEqual(resumed.fields.breaks[1], { startMs: t0, endMs: t0 + 45 * 60_000, minutes: 45 });
  assert.equal(resumed.fields.breakStartedAtMs, null);
  const outOnBreak = P.payableShiftPatch({ status: 'ON_BREAK', clockInTime: { seconds: 1 }, breakStartedAtMs: t0 }, 'CLOCK_OUT', t0 + 20 * 60_000);
  assert.equal(outOnBreak.fields.status, 'COMPLETED');
  assert.equal(outOnBreak.fields.totalBreakMinutes, 20);
  const outNoBreak = P.payableShiftPatch({ status: 'ACTIVE', clockInTime: { seconds: 1 } }, 'CLOCK_OUT', t0);
  assert.equal(outNoBreak.fields.totalBreakMinutes, undefined);
});

test('P1-3: payroll overtime and My Hours pass staff_shifts.totalBreakMinutes into the engine', () => {
  const src = read('functions/hrAutomation.ts');
  assert.equal((src.match(/breakMinutes: Number\(data\.totalBreakMinutes\) \|\| 0/g) || []).length, 2);
  assert.match(read('functions/index.ts'), /payableDutyWrite\(snap\.exists \? \(snap\.data\(\) \|\| \{\}\) : null, action, recordedClockIn, shiftDate, Date\.now\(\)\)/);
});

test('P1-5: mission card copy follows real state', () => {
  const now = Date.parse('2026-11-09T10:00:00Z');
  const live = M.describeMissionState({ status: 'EN_ROUTE', technicianLocationUpdatedAt: now - 30_000 }, now);
  assert.equal(live.gpsLive, true);
  assert.match(live.helper, /Live GPS is on/);
  const stale = M.describeMissionState({ status: 'EN_ROUTE', technicianLocationUpdatedAt: now - 5 * 60_000 }, now);
  assert.equal(stale.gpsLive, false);
  assert.match(stale.helper, /GPS is not live/);
  assert.equal(M.describeMissionState({ status: 'EN_ROUTE' }, now).gpsLive, false, 'no location means not live');
  const arrived = M.describeMissionState({ status: 'ARRIVED' }, now);
  assert.match(arrived.helper, /within 250 m of the property pin/);
  assert.match(arrived.helper, /accuracy of 100 m or better/);
  const working = M.describeMissionState({ status: 'IN_PROGRESS', startedAt: now - 25 * 60_000 }, now);
  assert.match(working.helper, /Work started 25 min ago/);
  const assigned = M.describeMissionState({ status: 'ASSIGNED' }, now);
  assert.equal(assigned.accepted, false);
  assert.equal(assigned.badge, 'ASSIGNED: NOT ACCEPTED');
  assert.equal(M.describeMissionState({ status: 'ACCEPTED' }, now).accepted, true);
  assert.equal(M.ARRIVAL_GEOFENCE_METERS, 250);
});

test('P1-5: the dashboard no longer carries the unverified claims', () => {
  const src = read('src/technician/pages/TechnicianDashboardPage.tsx');
  for (const phrase of ['streaming live to the tenant', 'verified within 100m', 'Official Labor Timer', 'Every minute is verified', 'Multi-Point Proof Engine']) {
    assert.ok(!src.includes(phrase), phrase);
  }
  assert.match(src, /describeMissionState\(activeMission, missionClock\)/);
  assert.match(src, /isAccepted \? 'Accepted' : 'Not accepted yet'/);
  // The server geofence is still 250 m, as the copy says.
  assert.match(read('functions/index.ts'), /outside the 250 metre property geofence/);
});

test('P1-4: the overtime card shows the proof level the server attached', () => {
  const card = read('src/technician/components/TechnicianOvertimeClaimCard.tsx');
  assert.match(card, /overtimeProofLabel\(response\.data\?\.proofStrength, response\.data\?\.jobId\)/);
  assert.match(card, /\.\.\.\(jobId \? \{ jobId \} : \{\}\)/);
  const fn = read('functions/staffOperatingSystem.ts');
  assert.match(fn, /jobAutoLinked = true/);
  assert.match(fn, /SHIFT_\$\{uid\}_\$\{yesterdayStr\}/);
});
