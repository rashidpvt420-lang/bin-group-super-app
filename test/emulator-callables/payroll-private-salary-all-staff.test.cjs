'use strict';
// P1-2 (audit 9 Nov 2026): adminGeneratePayrollBatch read the deprecated users.baseSalary and only
// queried technicians. Salaries live in server-only private_hr_profiles/{uid}.salaryPackage.basicSalary,
// and every payroll-eligible staff role must be covered. users.baseSalary is only a flagged, audited fallback.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call } = require('./_setup.cjs');

const { adminGeneratePayrollBatch } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const MONTH = '2026-10';

let payrollAdmin;
test.before(async () => {
  payrollAdmin = await createUser('payroll_admin_private', { role: 'finance_admin' }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

async function seedStaff(uid, role, { privateSalary, legacySalary, overtimeEligible } = {}) {
  await db.doc(`users/${uid}`).set({ role, displayName: `Name ${uid}`, email: `${uid}@example.invalid`, ...(legacySalary !== undefined ? { baseSalary: legacySalary } : {}) });
  if (privateSalary !== undefined) {
    await db.doc(`private_hr_profiles/${uid}`).set({ uid, salaryPackage: { basicSalary: privateSalary, ...(overtimeEligible === false ? { overtimeEligible: false } : {}) } });
  }
}

test('salary comes from private_hr_profiles and non-technician staff are paid', async () => {
  await seedStaff('tech_priv', 'technician', { privateSalary: 3000 });
  await seedStaff('hr_priv', 'hr_staff', { privateSalary: 5200.5 });
  await seedStaff('disp_priv', 'dispatcher', { privateSalary: 4100 });
  await seedStaff('owner_x', 'owner', { privateSalary: 9999 });
  await seedStaff('admin_x', 'admin', { privateSalary: 9999 });
  // A stale users.baseSalary must not override the private salary.
  await seedStaff('tech_conflict', 'technician', { privateSalary: 3500, legacySalary: 99999 });

  const result = await call(adminGeneratePayrollBatch, payrollAdmin, { month: MONTH });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.processed, 4);
  assert.deepEqual(result.legacySalaryFallback, []);
  assert.equal((await db.doc(`payroll/tech_priv_${MONTH}`).get()).get('baseSalary'), 3000);
  assert.equal((await db.doc(`payroll/tech_priv_${MONTH}`).get()).get('salarySource'), 'PRIVATE_HR_PROFILE');
  assert.equal((await db.doc(`payroll/hr_priv_${MONTH}`).get()).get('amount'), 5200.5);
  assert.equal((await db.doc(`payroll/hr_priv_${MONTH}`).get()).get('staffRole'), 'hr_staff');
  assert.equal((await db.doc(`payroll/disp_priv_${MONTH}`).get()).get('baseSalary'), 4100);
  assert.equal((await db.doc(`payroll/tech_conflict_${MONTH}`).get()).get('baseSalary'), 3500);
  for (const uid of ['owner_x', 'admin_x']) {
    assert.equal((await db.doc(`payroll/${uid}_${MONTH}`).get()).exists, false, `${uid} is not a payroll employee`);
  }
});

test('staff with no salary anywhere are skipped with a reason; legacy users.baseSalary is flagged and audited', async () => {
  await seedStaff('tech_none', 'technician', {});
  await seedStaff('tech_zero', 'technician', { privateSalary: 0 });
  await seedStaff('tech_legacy', 'technician', { privateSalary: 0, legacySalary: 2800 });

  const result = await call(adminGeneratePayrollBatch, payrollAdmin, { month: MONTH });
  assert.equal(result.processed, 1);
  assert.deepEqual(result.legacySalaryFallback, ['tech_legacy']);
  assert.deepEqual(result.skippedDetails.map((row) => [row.techId, row.reason]).sort(), [
    ['tech_none', 'NO_BASIC_SALARY_ON_PRIVATE_HR_PROFILE'],
    ['tech_zero', 'NO_BASIC_SALARY_ON_PRIVATE_HR_PROFILE'],
  ]);
  const row = (await db.doc(`payroll/tech_legacy_${MONTH}`).get()).data();
  assert.equal(row.baseSalary, 2800);
  assert.equal(row.salarySource, 'LEGACY_USERS_BASE_SALARY');
  const audits = await db.collection('audit_logs').where('action', '==', 'PAYROLL_LEGACY_USERS_BASE_SALARY_USED').get();
  assert.equal(audits.size, 1);
  assert.deepEqual(audits.docs[0].get('metadata.staffIds'), ['tech_legacy']);
});

test('preview mode returns the server count and total and writes nothing', async () => {
  await seedStaff('tech_a', 'technician', { privateSalary: 3000 });
  await seedStaff('fin_b', 'finance_staff', { privateSalary: 4500.25 });
  await seedStaff('tech_c', 'technician', {});

  const preview = await call(adminGeneratePayrollBatch, payrollAdmin, { month: MONTH, preview: true });
  assert.equal(preview.status, 'PREVIEW');
  assert.equal(preview.processed, 2);
  assert.equal(preview.previewTotal, 7500.25);
  assert.deepEqual(preview.skipped, ['Name tech_c']);
  for (const collection of ['payroll', 'payroll_entries', 'transactions']) {
    assert.equal((await db.collection(collection).get()).size, 0, `${collection} must stay empty in preview mode`);
  }
});
