// Payslips and salary history: server-only writes, HR-manager/payroll-finance/own reads.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import fs from 'node:fs';
import { describe, it, before, after } from 'node:test';
let env;
const ctx = (uid, claims) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).firestore();
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-payroll-rules', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'staffPayslips/slip_a'), { staffId: 'staff_a', uid: 'staff_a', netPay: 9000 });
    await setDoc(doc(db, 'salaryHistory/hist_a'), { staffId: 'staff_a', uid: 'staff_a', basic: 8000 });
  });
});
after(async () => { await env?.cleanup(); });
const writers = [
  ['hr_staff', { role: 'hr_staff' }], ['hr_manager', { role: 'hr_manager' }], ['hr_admin', { role: 'hr_admin' }],
  ['finance_staff', { role: 'finance_staff' }], ['finance_admin', { role: 'finance_admin' }], ['admin', { role: 'admin', admin: true }],
];
describe('payroll collection is not client-writable through the admin catch-all', () => {
  const mfaAdmin = { role: 'admin', admin: true, firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
  it('MFA admin cannot create, update or delete payroll, payslips or salary history', async () => {
    const db = ctx('mfa_admin_payroll', mfaAdmin);
    await assertFails(setDoc(doc(db, 'payroll/tech_2026-11'), { staffId: 'staff_a', netPay: 1, month: '2026-11' }));
    await assertFails(setDoc(doc(db, 'staffPayslips/mfa_new'), { staffId: 'staff_a', netPay: 1 }));
    await assertFails(updateDoc(doc(db, 'staffPayslips/slip_a'), { netPay: 1 }));
    await assertFails(setDoc(doc(db, 'salaryHistory/mfa_new'), { staffId: 'staff_a', basic: 1 }));
    await assertFails(updateDoc(doc(db, 'salaryHistory/hist_a'), { basic: 1 }));
  });
});

describe('payroll records are server-only writes', () => {
  it('no client role can create, update or delete payslips or salary history', async () => {
    for (const [name, claims] of writers) {
      const db = ctx(`w_${name}`, claims);
      await assertFails(setDoc(doc(db, `staffPayslips/new_${name}`), { staffId: 'staff_a', netPay: 1 }));
      await assertFails(updateDoc(doc(db, 'staffPayslips/slip_a'), { netPay: 1 }));
      await assertFails(deleteDoc(doc(db, 'staffPayslips/slip_a')));
      await assertFails(setDoc(doc(db, `salaryHistory/new_${name}`), { staffId: 'staff_a', basic: 1 }));
      await assertFails(updateDoc(doc(db, 'salaryHistory/hist_a'), { basic: 1 }));
      await assertFails(deleteDoc(doc(db, 'salaryHistory/hist_a')));
    }
  });
  it('hr_staff and unrelated staff cannot read others payroll', async () => {
    for (const claims of [{ role: 'hr_staff' }, { role: 'operations_admin' }, { role: 'technician' }]) {
      const db = ctx(`r_${claims.role}`, claims);
      await assertFails(getDoc(doc(db, 'staffPayslips/slip_a')));
      await assertFails(getDoc(doc(db, 'salaryHistory/hist_a')));
    }
  });
  it('employee reads own; HR manager tier and payroll finance keep read', async () => {
    for (const [uid, claims] of [['staff_a', { role: 'technician' }], ['hrm', { role: 'hr_manager' }], ['fa', { role: 'finance_admin' }]]) {
      const db = ctx(uid, claims);
      await assertSucceeds(getDoc(doc(db, 'staffPayslips/slip_a')));
      await assertSucceeds(getDoc(doc(db, 'salaryHistory/hist_a')));
    }
  });
});

describe('hrProfiles salary fields are not client-writable', () => {
  before(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'hrProfiles/staff_a'), { uid: 'staff_a', displayName: 'Staff', shiftName: 'Day' });
    });
  });
  it('HR manager can update a non-salary field and cannot write salary', async () => {
    const db = ctx('hrm_salary', { role: 'hr_manager' });
    await assertSucceeds(updateDoc(doc(db, 'hrProfiles/staff_a'), { shiftName: 'Night' }));
    await assertFails(updateDoc(doc(db, 'hrProfiles/staff_a'), { baseSalary: 9000 }));
    await assertFails(updateDoc(doc(db, 'hrProfiles/staff_a'), { basicSalary: 9000 }));
    await assertFails(setDoc(doc(db, 'hrProfiles/new_salary'), { uid: 'new_salary', basicSalary: 1, displayName: 'New' }));
    await assertSucceeds(setDoc(doc(db, 'hrProfiles/new_plain'), { uid: 'new_plain', displayName: 'New', shiftName: 'Day' }));
  });
});

describe('staffDocuments reads: HR manager tier + own record only (Rashid, 4 Nov 2026)', () => {
  before(async () => {
    await env.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'staffDocuments/doc_a'), { uid: 'staff_a', documentType: 'passport', status: 'pending_hr_review' });
    });
  });
  it('hr_admin, hr_manager and the employee can read', async () => {
    for (const [uid, claims] of [['staff_a', { role: 'technician' }], ['hra', { role: 'hr_admin' }], ['hrm2', { role: 'hr_manager' }]]) {
      await assertSucceeds(getDoc(doc(ctx(uid, claims), 'staffDocuments/doc_a')));
    }
  });
  it('hr_staff, finance, ops, support and other staff cannot read', async () => {
    for (const role of ['hr_staff', 'finance_admin', 'finance_staff', 'operations_admin', 'support_admin', 'manager', 'account_manager', 'technician']) {
      await assertFails(getDoc(doc(ctx(`d_${role}`, { role }), 'staffDocuments/doc_a')));
    }
  });
});
