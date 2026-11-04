import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const R = await loadTsModules('functions/hrRosterEngine.ts', []);
const week = { 0: { start: '08:00', end: '17:00' }, 1: { start: '08:00', end: '17:00' }, 2: { start: '08:00', end: '17:00' }, 3: { start: '08:00', end: '17:00' }, 4: { start: '08:00', end: '17:00' }, 5: null, 6: { start: '22:00', end: '06:00' } };
const at = (iso) => Date.parse(iso); // UTC; Dubai = UTC+4

test('roster validation: HH:MM, 1-14h shifts, at least one rest day', () => {
  assert.equal(R.validateWeeklyRoster(week).ok, true);
  assert.equal(R.validateWeeklyRoster({ ...week, 5: { start: '08:00', end: '12:00' } }).ok, false);
  assert.equal(R.validateWeeklyRoster({ ...week, 1: { start: '8am', end: '17:00' } }).ok, false);
  assert.equal(R.validateWeeklyRoster({ ...week, 1: { start: '08:00', end: '08:30' } }).ok, false);
});

test('start reminder fires only in the 30 min before start and not after clock-in', () => {
  const w = R.validateWeeklyRoster(week).weekly; // 2026-11-04 is Wednesday
  assert.ok(R.startReminderDue(w, at('2026-11-04T03:40:00Z'), false)); // 07:40 GST
  assert.equal(R.startReminderDue(w, at('2026-11-04T03:20:00Z'), false), null); // 07:20
  assert.equal(R.startReminderDue(w, at('2026-11-04T04:10:00Z'), false), null); // 08:10
  assert.equal(R.startReminderDue(w, at('2026-11-04T03:40:00Z'), true), null);
  assert.equal(R.startReminderDue(w, at('2026-11-06T03:40:00Z'), false), null); // Friday off
});

test('missed clock-out: rostered end + 60 min, overnight shifts, 12h fallback', () => {
  const w = R.validateWeeklyRoster(week).weekly;
  const clockIn = at('2026-11-04T04:00:00Z');
  const base = { weekly: w, shiftDate: '2026-11-04', clockInMs: clockIn, clockOutMs: null };
  assert.equal(R.missedClockOutDue({ ...base, nowMs: at('2026-11-04T13:30:00Z') }), false); // 17:30
  assert.equal(R.missedClockOutDue({ ...base, nowMs: at('2026-11-04T14:01:00Z') }), true); // 18:01
  assert.equal(R.missedClockOutDue({ ...base, clockOutMs: clockIn + 1, nowMs: at('2026-11-05T00:00:00Z') }), false);
  const sat = { weekly: w, shiftDate: '2026-11-07', clockInMs: at('2026-11-07T18:00:00Z'), clockOutMs: null };
  assert.equal(R.missedClockOutDue({ ...sat, nowMs: at('2026-11-08T02:30:00Z') }), false); // 06:30 next day
  assert.equal(R.missedClockOutDue({ ...sat, nowMs: at('2026-11-08T03:01:00Z') }), true);
  assert.equal(R.missedClockOutDue({ weekly: null, shiftDate: '2026-11-04', clockInMs: clockIn, clockOutMs: null, nowMs: clockIn + 11 * 3600000 }), false);
  assert.equal(R.missedClockOutDue({ weekly: null, shiftDate: '2026-11-04', clockInMs: clockIn, clockOutMs: null, nowMs: clockIn + 13 * 3600000 }), true);
});

test('roster callables: App Check, HR roles + MFA to write, staff read own; sweep is idempotent', () => {
  const fn = readFileSync('functions/hrAutomation.ts', 'utf8');
  const set = fn.slice(fn.indexOf('export const hrSetStaffRoster'), fn.indexOf('export const getMyRoster'));
  assert.match(set, /enforceAppCheck: true/);
  assert.match(set, /requireRosterManager\(request\.auth\)/);
  assert.match(fn, /async function requireRosterManager[\s\S]*requirePrivilegedMfaSession\(auth\)/);
  const mine = fn.slice(fn.indexOf('export const getMyRoster'), fn.indexOf('async function createOnce'));
  assert.match(mine, /enforceAppCheck: true/);
  assert.match(mine, /doc\(request\.auth!\.uid\)/);
  assert.doesNotMatch(mine, /request\.data/);
  const sweep = fn.slice(fn.indexOf('export const hrShiftReminderSweep'));
  assert.match(sweep, /timeZone: "Asia\/Dubai"/);
  assert.match(sweep, /HR_SHIFT_START_\$\{uid\}_\$\{today\}/);
  assert.match(sweep, /HR_MISSED_CLOCKOUT_\$\{uid\}_\$\{shiftDate\}/);
  assert.match(fn, /ref\.create\(data\)/);
  assert.doesNotMatch(sweep, /\.update\(|staff_shifts"\)\.doc\([^)]*\)\.set/);
  const rules = readFileSync('firestore.rules', 'utf8');
  assert.match(rules, /match \/staff_roster\/\{staffId\} \{\s*allow read: if isAdmin\(\) \|\| isHr\(\) \|\| staffCanRead/);
});
