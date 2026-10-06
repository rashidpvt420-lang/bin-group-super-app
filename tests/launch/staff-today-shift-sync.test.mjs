import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const helperSource = read('src/components/staff/staffShiftSchedule.ts');
const dashboard = read('src/components/staff/StaffTodayDashboard.tsx');
const rules = read('firestore.rules');
const hardener = read('scripts/harden-owner-trust-rules.mjs');
const backend = read('functions/staffOperatingSystem.ts');
const provisioning = read('functions/adminUserProvisioning.ts');

function load(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', output)(module.exports, module);
  return module.exports;
}
const h = load(helperSource);

test('01 HR schedule from hrProfiles is shown when no shift doc exists (production profile)', () => {
  const hr = { shiftName: 'Day Shift', workingHours: '8 AM - 4 PM', offDay: 'Friday' };
  assert.equal(h.resolveShiftLabel(null, hr), 'Day Shift, 8 AM - 4 PM · Off day Friday');
});

test('02 the server-written shift doc (staffId/status/clockInTime/shiftDate) still falls back to HR schedule', () => {
  const serverShift = { staffId: 'u', status: 'ACTIVE', clockInTime: {}, shiftDate: '2026-09-30' };
  assert.equal(h.resolveShiftLabel(serverShift, { shiftName: 'Day Shift', workingHours: '8 AM - 4 PM' }), 'Day Shift, 8 AM - 4 PM');
});

test('03 explicit shift doc labels win; empty sources keep the honest empty label', () => {
  assert.equal(h.resolveShiftLabel({ shiftTime: '7 AM - 3 PM' }, { shiftName: 'Day Shift' }), '7 AM - 3 PM');
  assert.equal(h.resolveShiftLabel({ scheduledLabel: 'Night' }, null), 'Night');
  assert.equal(h.resolveShiftLabel(null, null), h.NO_SHIFT_SCHEDULE_LABEL);
  assert.equal(h.resolveShiftLabel(null, { shiftName: '  ', workingHours: null }), 'No shift schedule recorded');
  assert.equal(h.formatHrShiftSchedule({ offDay: 'Friday' }), 'Scheduled · Off day Friday');
});

test('04 shift doc id matches the server CLOCK_IN key and the rules id-bound branch', () => {
  assert.equal(h.staffShiftDocId('abc', '2026-09-30'), 'SHIFT_abc_2026-09-30');
  assert.match(backend, /doc\(`SHIFT_\$\{uid\}_\$\{todayStr\}`\)/);
  assert.match(backend, /staffId: uid,\s*\n\s*status: "ACTIVE"/);
  assert.match(dashboard, /staffShiftDocId\(currentUid, todayStr\)/);
});

test('05 permission-denied shift sync is explained and flagged as stale, not a bare Firestore string', () => {
  const msg = h.shiftSyncErrorMessage(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
  assert.match(msg, /^Shift sync failed:/);
  assert.match(msg, /STAFF_SHIFTS_PERMISSION_DENIED/);
  assert.match(msg, /out of date/);
  assert.equal(h.shiftSyncErrorMessage({ code: 'unavailable', message: 'offline' }), 'Shift sync failed: offline');
});

test('06 listener is re-attached after CLOCK_IN success or already-exists (409), not for other actions', () => {
  assert.equal(h.shouldResubscribeShiftAfterQuickAction('CLOCK_IN'), true);
  assert.equal(h.shouldResubscribeShiftAfterQuickAction('CLOCK_IN', { code: 'functions/already-exists' }), true);
  assert.equal(h.shouldResubscribeShiftAfterQuickAction('CLOCK_IN', { code: 'functions/permission-denied' }), false);
  assert.equal(h.shouldResubscribeShiftAfterQuickAction('BREAKDOWN_REPORT'), false);
  assert.match(dashboard, /\[currentUid, shiftListenerKey\]/);
  assert.match(dashboard, /setShiftListenerKey\(\(key\) => key \+ 1\)/);
  assert.match(dashboard, /previous\?\.startsWith\("Shift sync failed"\) \? null : previous/);
});

test('07 dashboard reads HR schedule from hrProfiles/{uid}, where HR provisioning stores it', () => {
  assert.match(dashboard, /getDoc\(doc\(db, "hrProfiles", currentUid\)\)/);
  assert.match(dashboard, /resolveShiftLabel\(activeShift, hrSchedule\)/);
  assert.doesNotMatch(dashboard, /activeShift\?\.shiftTime \|\| activeShift\?\.scheduledLabel \|\| "No shift schedule recorded"/);
  assert.match(provisioning, /shiftName: cleanString\(payload\.shiftName/);
  assert.match(rules, /match \/hrProfiles\/\{profileId\} \{[\s\S]{0,300}signedIn\(\) && request\.auth\.uid == profileId/);
});

test('08 rules and hardener template carry the same id-bound own-doc branch (no $\' replacement hazard)', () => {
  for (const source of [rules, hardener]) {
    assert.ok(source.includes("shiftId.matches('SHIFT_' + request.auth.uid + '_[0-9]{4}-[0-9]{2}-[0-9]{2}')"));
    assert.ok(source.includes("summaryId.matches('SUMMARY_' + request.auth.uid + '_[0-9]{4}-[0-9]{2}-[0-9]{2}')"));
  }
  assert.doesNotMatch(hardener, /\$'/);
  const block = rules.match(/match \/staff_shifts\/\{shiftId\} \{[\s\S]*?\n    \}/)[0];
  assert.match(block, /allow create, update, delete: if false;/);
  assert.match(block, /isNotSuspended\(\) && \(/);
});
