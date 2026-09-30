'use strict';
// N-25 regressions: HR read callables returned success:true with empty lists when a query
// failed, silently dropped staff rows on errors, and read payroll through an unfiltered
// limit(500) page filtered in memory (a staff member's rows vanished beyond the first 500 docs).
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminGetStaffDetails, adminGetStaffLifecycle } = lib('adminStaffLifecycle.js');
const { adminGetHrOperations } = lib('adminHrOperations.js');

let hrAdmin;
test.before(async () => {
  // MFA-enrolled Admin with a second-factor token, so the tests stay valid with server-side Admin MFA.
  hrAdmin = await createUser('admin_n25', { role: 'admin', admin: true }, {
    multiFactor: { enrolledFactors: [{ phoneNumber: '+15555550125', factorId: 'phone' }] },
    tokenExtra: { firebase: { sign_in_second_factor: 'phone' } },
  });
  await createUser('tech_n25', { role: 'technician' }, { email: 'tech-n25@example.invalid' });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/tech_n25').set({ uid: 'tech_n25', role: 'technician', isStaff: true, displayName: 'Tech N25', status: 'active' });
});

function failCollection(name) {
  const original = db.collection;
  db.collection = function patched(collectionName) {
    if (collectionName !== name) return original.call(this, collectionName);
    const failing = { get: async () => { throw Object.assign(new Error(`simulated ${name} outage`), { code: 14 }); } };
    for (const method of ['where', 'orderBy', 'limit']) failing[method] = () => failing;
    return failing;
  };
  return () => { db.collection = original; };
}

test('payroll rows for a staff member are found even when the collection has more than 500 docs', async () => {
  let batch = db.batch();
  for (let index = 0; index < 520; index += 1) {
    batch.set(db.doc(`payroll/p_${String(index).padStart(4, '0')}`), { staffId: 'someone_else', month: '2026-08', amount: 1000 });
    if (index % 400 === 399) { await batch.commit(); batch = db.batch(); }
  }
  await batch.commit();
  await db.doc('payroll/zz_tech_n25_2026_09').set({ staffId: 'tech_n25', month: '2026-09', netPay: 4200, status: 'PAID' });
  const result = await call(adminGetStaffDetails, hrAdmin, { uid: 'tech_n25' });
  assert.equal(result.privateFieldsIncluded, true);
  assert.equal(result.payroll.length, 1, 'the staff member\'s payroll row must not be truncated away');
  assert.equal(result.payroll[0].amount, 4200);
  assert.equal(result.success, true);
});

test('a failed staff-details section is reported, not returned as an empty list with success:true', async () => {
  const restore = failCollection('staffLeaveRequests');
  try {
    const result = await call(adminGetStaffDetails, hrAdmin, { uid: 'tech_n25' });
    assert.equal(result.success, false);
    assert.equal(result.complete, false);
    assert.deepEqual([...result.unavailableSections], ['leaveRequests']);
  } finally { restore(); }
});

test('a failed HR operations section is reported; all sections failing is an error', async () => {
  const restoreOne = failCollection('staffHrDocuments');
  try {
    const partial = await call(adminGetHrOperations, hrAdmin, {});
    assert.equal(partial.success, false);
    assert.deepEqual([...partial.unavailableSections], ['documents']);
  } finally { restoreOne(); }
  const original = db.collection;
  db.collection = function patched(name) {
    if (!['staffAttendance', 'staffLeaveRequests', 'staffHrDocuments'].includes(name)) return original.call(this, name);
    const failing = { get: async () => { throw new Error('simulated outage'); } };
    for (const method of ['where', 'orderBy', 'limit']) failing[method] = () => failing;
    return failing;
  };
  try {
    await expectHttpsError(call(adminGetHrOperations, hrAdmin, {}), 'unavailable');
  } finally { db.collection = original; }
  const healthy = await call(adminGetHrOperations, hrAdmin, {});
  assert.equal(healthy.success, true);
  assert.deepEqual([...healthy.unavailableSections], []);
});

test('staff lifecycle reports a staff row it could not load instead of silently dropping it', async () => {
  await db.doc('users/ghost_n25').set({ uid: 'ghost_n25', role: 'technician', isStaff: true, displayName: 'No Auth identity' });
  await db.doc('users/admin_flagged_n25').set({ uid: 'admin_flagged_n25', role: 'admin', isStaff: true });
  await createUser('admin_flagged_n25', { role: 'admin' });
  const result = await call(adminGetStaffLifecycle, hrAdmin, {});
  assert.deepEqual(result.staff.map((row) => row.uid), ['tech_n25']);
  assert.equal(result.success, false);
  assert.deepEqual(result.unavailableStaff.map((entry) => entry.uid), ['ghost_n25']);
});
