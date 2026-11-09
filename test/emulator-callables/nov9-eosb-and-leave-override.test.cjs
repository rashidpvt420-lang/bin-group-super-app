'use strict';
// Nov 9 follow-up: emulator coverage for two #1994 callables that had no end-to-end test.
//  - P2-16 getMyEosbEstimate: computed on the server from private_hr_profiles, salary never returned.
//  - P2-23 adminReviewStaffLeaveRequest: annual leave beyond the balance needs an 8+ character
//    override reason, which is stored on the request and in the audit log.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { getMyEosbEstimate, getMyLeaveBalance } = lib('hrAutomation.js');
const { adminReviewStaffLeaveRequest } = lib('adminHrOperations.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };

let tech;
let hr;
test.before(async () => {
  tech = await createUser('tech_nov9_eosb', { role: 'technician' });
  hr = await createUser('hr_nov9_override', { role: 'hr_manager' }, MFA);
});
test.beforeEach(clearFirestore);

function yearsAgo(n) {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
}

test('EOSB: missing salary and joining date are reported, not guessed', async () => {
  await db.doc(`users/${tech.uid}`).set({ role: 'technician' });
  const res = await call(getMyEosbEstimate, tech, {});
  assert.equal(res.available, false);
  assert.equal(res.joinDateMissing, true);
  assert.equal(res.salaryMissing, true);
});

test('EOSB: computed from the private salary for both scenarios; the salary is not returned', async () => {
  await db.doc(`users/${tech.uid}`).set({ role: 'technician' });
  await db.doc(`hrProfiles/${tech.uid}`).set({ joiningDate: yearsAgo(6) });
  await db.doc(`private_hr_profiles/${tech.uid}`).set({ uid: tech.uid, salaryPackage: { basicSalary: 3170 } });
  const res = await call(getMyEosbEstimate, tech, {});
  assert.equal(res.available, true);
  // Decree-Law 33: 21 days a year for the first 5 years, 30 days after. 6 years at 3170 basic
  // ≈ (3170/30) × (21×5 + 30) ≈ 14,265 AED; allow for day counting.
  const est = res.resignation.finalEstimateAed;
  assert.ok(est > 13700 && est < 14800, `unexpected estimate ${est}`);
  assert.ok(res.employer_terminated.finalEstimateAed >= est);
  assert.ok(!JSON.stringify(res).includes('3170'), 'salary must not be returned');
});

test('EOSB: non-staff callers are refused', async () => {
  const tenant = await createUser('tenant_nov9_eosb', { role: 'tenant' });
  await expectHttpsError(call(getMyEosbEstimate, tenant, {}), 'permission-denied');
});

async function seedAnnualLeave(id, days) {
  await db.doc(`staffRequests/${id}`).set({
    uid: tech.uid, category: 'leave', requestType: 'annual_leave', leaveDays: days,
    startDate: '2026-12-01', endDate: '2026-12-31', status: 'pending_hr_review',
  });
}

test('Leave: approval beyond the balance needs an 8+ character reason, stored and audited', async () => {
  await db.doc(`users/${tech.uid}`).set({ role: 'technician' });
  await db.doc(`hrProfiles/${tech.uid}`).set({ joiningDate: yearsAgo(1) });
  const { annual } = await call(getMyLeaveBalance, tech, {});
  const days = annual.balance + 5;
  await seedAnnualLeave('leave_over', days);

  const err = await expectHttpsError(call(adminReviewStaffLeaveRequest, hr, { requestId: 'leave_over', decision: 'APPROVED' }), 'failed-precondition');
  assert.equal(err.details.code, 'LEAVE_OVERRIDE_REASON_REQUIRED');
  assert.equal(err.details.days, days);
  assert.equal(err.details.balance, annual.balance);
  await expectHttpsError(call(adminReviewStaffLeaveRequest, hr, { requestId: 'leave_over', decision: 'APPROVED', overrideReason: 'short' }), 'failed-precondition');
  assert.equal((await db.doc('staffRequests/leave_over').get()).data().status, 'pending_hr_review');

  await call(adminReviewStaffLeaveRequest, hr, { requestId: 'leave_over', decision: 'APPROVED', overrideReason: 'Family emergency abroad, approved by GM' });
  const saved = (await db.doc('staffRequests/leave_over').get()).data();
  assert.equal(saved.status, 'approved');
  assert.equal(saved.balanceOverride.reason, 'Family emergency abroad, approved by GM');
  assert.equal(saved.balanceOverride.balanceBefore, annual.balance);
  assert.equal(saved.balanceOverride.by, hr.uid);
  const audit = await db.collection('audit_logs').where('action', '==', 'ADMIN_REVIEW_STAFF_LEAVE').where('targetId', '==', 'leave_over').get();
  assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].data().metadata.balanceOverride, true);
  assert.equal(audit.docs[0].data().metadata.overrideReason, 'Family emergency abroad, approved by GM');
});

test('Leave: within the balance and rejections need no override', async () => {
  await db.doc(`users/${tech.uid}`).set({ role: 'technician' });
  await db.doc(`hrProfiles/${tech.uid}`).set({ joiningDate: yearsAgo(2) });
  const { annual } = await call(getMyLeaveBalance, tech, {});
  assert.ok(annual.balance >= 2, `fixture balance ${annual.balance}`);
  await seedAnnualLeave('leave_ok', 2);
  await call(adminReviewStaffLeaveRequest, hr, { requestId: 'leave_ok', decision: 'APPROVED' });
  const ok = (await db.doc('staffRequests/leave_ok').get()).data();
  assert.equal(ok.status, 'approved');
  assert.equal(ok.balanceOverride, undefined);
  await seedAnnualLeave('leave_rej', annual.balance + 50);
  await call(adminReviewStaffLeaveRequest, hr, { requestId: 'leave_rej', decision: 'REJECTED' });
  assert.equal((await db.doc('staffRequests/leave_rej').get()).data().status, 'rejected');
});
