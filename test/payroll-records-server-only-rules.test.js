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
