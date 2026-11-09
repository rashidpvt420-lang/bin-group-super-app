// Batch 3 of the 9 Nov 2026 audit remediation (P1-6, P1-9, P1-10).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const T = await loadTsModules('src/technician/utils/enRouteTrackingPolicy.ts');
const R = await loadTsModules('apps/admin-panel/src/lib/staffRosterForm.ts');
const E = await loadTsModules('functions/hrRosterEngine.ts');
const C = await loadTsModules('functions/hrPayConfig.ts');
const read = (path) => readFileSync(path, 'utf8');
const base = { loaded: true, jobs: [], activeTicketId: null, pageOwnerTicketId: null, online: true };

test('P1-6: the shell starts GPS for an en-route job when no page owns it', () => {
  assert.deepEqual(T.decideShellTracking({ ...base, jobs: [{ id: 'b', status: 'ACCEPTED' }, { id: 'a', status: 'en_route' }] }), { action: 'start', ticketId: 'a' });
  assert.deepEqual(T.decideShellTracking({ ...base, jobs: [{ id: 'a', status: 'ON_THE_WAY' }] }), { action: 'start', ticketId: 'a' });
});

test('P1-6: leaving the job page keeps tracking; it stops only when the job leaves EN_ROUTE', () => {
  assert.equal(T.decideShellTracking({ ...base, jobs: [{ id: 'a', status: 'EN_ROUTE' }], activeTicketId: 'a' }).action, 'none');
  assert.deepEqual(T.decideShellTracking({ ...base, jobs: [{ id: 'a', status: 'ARRIVED' }], activeTicketId: 'a' }), { action: 'stop', ticketId: 'a' });
  assert.deepEqual(T.decideShellTracking({ ...base, jobs: [], activeTicketId: 'a' }), { action: 'stop', ticketId: 'a' });
});

test('P1-6: the open job page owns tracking (arrival fix), and nothing happens before jobs load or offline', () => {
  assert.equal(T.decideShellTracking({ ...base, jobs: [{ id: 'a', status: 'EN_ROUTE' }], pageOwnerTicketId: 'a' }).action, 'none');
  assert.equal(T.decideShellTracking({ ...base, loaded: false, activeTicketId: 'a' }).action, 'none');
  assert.equal(T.decideShellTracking({ ...base, online: false, jobs: [{ id: 'a', status: 'EN_ROUTE' }] }).action, 'none');
});

test('P1-6: unmounting the job page no longer calls stopLiveTracking; the shell owns tracking', () => {
  const page = read('src/technician/pages/TechnicianJobDetailPage.tsx');
  assert.doesNotMatch(page, /return \(\) => \{\s*if \(user\?\.uid\) stopLiveTracking\(user\.uid\)/);
  assert.match(page, /setJobPageTrackingOwner\(id\)/);
  assert.match(page, /maps-background-gps-warning/);
  const shell = read('src/technician/TechnicianApp.tsx');
  assert.match(shell, /useEnRouteTrackingOwner\(user\?\.uid\)/);
  assert.match(read('src/utils/liveTracking.ts'), /export const getActiveTrackingTicketId/);
});

test('P1-9: the default roster is 08:00-17:00 with Sunday off and passes the server validator', () => {
  const form = R.defaultRosterForm();
  const payload = R.rosterPayloadFromForm(form);
  assert.equal(payload.ok, true);
  assert.equal(payload.weekly['0'], null);
  assert.deepEqual(payload.weekly['1'], { start: '08:00', end: '17:00' });
  const server = E.validateWeeklyRoster(payload.weekly);
  assert.equal(server.ok, true);
});

test('P1-9: the form rejects the same rosters the server rejects', () => {
  const allDays = R.defaultRosterForm();
  allDays['0'] = { off: false, start: '08:00', end: '17:00' };
  assert.equal(R.rosterPayloadFromForm(allDays).ok, false);
  const short = R.defaultRosterForm();
  short['2'] = { off: false, start: '08:00', end: '08:30' };
  assert.match(R.rosterPayloadFromForm(short).error, /Tuesday/);
  const overnight = R.defaultRosterForm();
  overnight['3'] = { off: false, start: '22:00', end: '06:00' };
  assert.equal(R.rosterPayloadFromForm(overnight).ok, true);
  assert.equal(R.shiftLengthMinutes('22:00', '06:00'), 480);
  assert.deepEqual(R.rosterFormFromWeekly({ 0: null, 1: { start: '07:00', end: '15:00' }, 2: null, 3: null, 4: null, 5: null, 6: null })['1'], { off: false, start: '07:00', end: '15:00' });
});

test('P1-9: an 08:00 roster sends the start reminder at 07:30 Dubai time and not at 07:29', () => {
  const weekly = R.rosterPayloadFromForm(R.defaultRosterForm()).weekly;
  const monday0730 = Date.parse('2026-11-09T07:30:00+04:00');
  assert.ok(E.startReminderDue(weekly, monday0730, false));
  assert.equal(E.startReminderDue(weekly, monday0730 - 60000, false), null);
  assert.equal(E.startReminderDue(weekly, monday0730, true), null);
});

test('P1-9: the new-hire default equals 8 working hours (the overtime baseline) and the old 7 h default is gone', () => {
  assert.equal(C.DEFAULT_WORKING_MINUTES, C.HR_PAY_CONFIG.normalDailyMinutes);
  assert.match(C.DEFAULT_WORKING_HOURS, /8 AM - 5 PM/);
  for (const file of ['functions/adminUserProvisioning.ts', 'functions/adminStaffLifecycle.ts']) {
    assert.doesNotMatch(read(file), /9 AM - 4 PM/);
    assert.match(read(file), /DEFAULT_WORKING_HOURS/);
  }
  const hr = read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');
  assert.match(hr, /<StaffRosterEditor staff=\{staff\} \/>/);
  assert.match(read('apps/admin-panel/src/pages/admin/StaffRosterEditor.tsx'), /'hrSetStaffRoster'/);
});

test('P1-10: the users directory needs MFA and listing is limited to Admin, HR and Operations', () => {
  const rules = read('firestore.rules');
  const fn = (name) => rules.slice(rules.indexOf(`function ${name}()`), rules.indexOf('}', rules.indexOf(`function ${name}()`) + 40) + 200);
  assert.match(fn('canReadUserDirectoryCycleFree'), /hasAdminSecondFactor\(\)/);
  const list = fn('canListUserDirectoryCycleFree');
  assert.match(list, /hasAdminSecondFactor\(\)/);
  for (const role of ['finance_admin', 'finance_staff', 'account_manager']) assert.doesNotMatch(list, new RegExp(`'${role}'`));
  const users = rules.slice(rules.indexOf('match /users/{userId} {'), rules.indexOf('allow create:', rules.indexOf('match /users/{userId} {')));
  assert.match(users, /allow list: if isNotSuspended\(\) && \(\s*canListUserDirectoryCycleFree\(\)/);
  assert.match(read('scripts/write-production-firestore-rules.mjs'), /canListUserDirectoryCycleFree\(\) \|\|/);
  assert.match(read('functions/index.ts'), /getMaskedStaffDirectory/);
});
