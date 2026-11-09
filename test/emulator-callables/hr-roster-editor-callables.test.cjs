'use strict';
// P1-9 (audit 9 Nov 2026): HR saves and reloads a weekly roster through MFA-gated callables.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { hrSetStaffRoster, hrGetStaffRoster, getMyRoster } = lib('hrAutomation.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };
const WEEKLY = { 0: null, 1: { start: '08:00', end: '17:00' }, 2: { start: '08:00', end: '17:00' }, 3: { start: '08:00', end: '17:00' }, 4: { start: '08:00', end: '17:00' }, 5: { start: '08:00', end: '17:00' }, 6: { start: '08:00', end: '17:00' } };

let hr;
let hrNoMfa;
let tech;
test.before(async () => {
  hr = await createUser('hr_roster_mfa', { role: 'hr_manager' }, MFA);
  hrNoMfa = await createUser('hr_roster_nomfa', { role: 'hr_manager' });
  tech = await createUser('tech_roster_01', { role: 'technician' });
});
test.beforeEach(clearFirestore);

test('HR saves a roster, reloads it, and the technician sees it in My roster', async () => {
  assert.equal((await call(hrGetStaffRoster, hr, { staffId: tech.uid })).weekly, null);
  const saved = await call(hrSetStaffRoster, hr, { staffId: tech.uid, weekly: WEEKLY });
  assert.equal(saved.ok, true);
  const loaded = await call(hrGetStaffRoster, hr, { staffId: tech.uid });
  assert.deepEqual(loaded.weekly, { ...WEEKLY, 0: null });
  const mine = await call(getMyRoster, tech, {});
  assert.deepEqual(mine.weekly['1'], { start: '08:00', end: '17:00' });
  const audit = await db.collection('audit_logs').where('action', '==', 'HR_STAFF_ROSTER_SET').get();
  assert.equal(audit.size, 1);
});

test('roster callables refuse non-MFA HR, technicians and invalid rosters', async () => {
  await expectHttpsError(call(hrGetStaffRoster, hrNoMfa, { staffId: tech.uid }), 'permission-denied');
  await expectHttpsError(call(hrSetStaffRoster, hrNoMfa, { staffId: tech.uid, weekly: WEEKLY }), 'permission-denied');
  await expectHttpsError(call(hrGetStaffRoster, tech, { staffId: tech.uid }), 'permission-denied');
  await expectHttpsError(call(hrSetStaffRoster, hr, { staffId: tech.uid, weekly: { ...WEEKLY, 0: { start: '08:00', end: '17:00' } } }), 'invalid-argument');
  await expectHttpsError(call(hrGetStaffRoster, hr, { staffId: 'x' }), 'invalid-argument');
});
