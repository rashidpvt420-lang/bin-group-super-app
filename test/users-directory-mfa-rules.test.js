// P1-10 (audit 9 Nov 2026): the raw users directory needs an MFA token, and listing it is limited
// to Admin, HR and Operations / dispatch. Self and owner-tenant reads keep working without MFA.
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';

let env;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const NO_MFA = { firebase: { sign_in_provider: 'password' } };
const ctx = (uid, claims) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).firestore();
const SALARY_KEYS = ['baseSalary', 'basicSalary', 'salary', 'salaryPackage'];

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-users-directory-rules', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await db.doc('users/tech_1').set({ uid: 'tech_1', role: 'technician', displayName: 'Tech One', email: 'tech_1@example.com', phoneNumber: '+971500000001', status: 'ACTIVE' });
    await db.doc('users/owner_1').set({ uid: 'owner_1', role: 'owner', displayName: 'Owner One', email: 'owner_1@example.com' });
    await db.doc('users/tenant_1').set({ uid: 'tenant_1', role: 'tenant', ownerId: 'owner_1', displayName: 'Tenant One', email: 'tenant_1@example.com' });
    for (const uid of ['dispatcher_1', 'hr_1', 'fin_1', 'acct_1', 'ops_1', 'admin_1']) {
      await db.doc(`users/${uid}`).set({ uid, role: 'staff', status: 'ACTIVE' });
    }
  });
});
after(async () => { await env?.cleanup(); });

const technicians = (db) => getDocs(query(collection(db, 'users'), where('role', '==', 'technician')));

describe('P1-10 users directory requires MFA', () => {
  it('a dispatcher token without MFA cannot list or read other users', async () => {
    const db = ctx('dispatcher_1', { role: 'dispatcher', ...NO_MFA });
    await assertFails(technicians(db));
    await assertFails(getDoc(doc(db, 'users/tech_1')));
  });

  it('every directory role without MFA is denied a list and a single read', async () => {
    for (const role of ['hr_admin', 'hr_manager', 'hr_staff', 'finance_admin', 'finance_staff', 'account_manager', 'operations_admin', 'operations_manager', 'dispatcher']) {
      const db = ctx(`nomfa_${role}`, { role, ...NO_MFA });
      await assertFails(technicians(db));
      await assertFails(getDoc(doc(db, 'users/tech_1')));
    }
  });

  it('an Admin claim without MFA cannot read the directory either', async () => {
    const db = ctx('admin_1', { role: 'admin', admin: true, ...NO_MFA });
    await assertFails(technicians(db));
  });

  it('with MFA, HR, Operations and dispatch can list; listed docs carry no salary fields', async () => {
    for (const [uid, role] of [['dispatcher_1', 'dispatcher'], ['hr_1', 'hr_manager'], ['ops_1', 'operations_admin'], ['admin_1', 'admin']]) {
      const db = ctx(uid, { role, ...(role === 'admin' ? { admin: true } : {}), ...MFA });
      const snap = await assertSucceeds(technicians(db));
      assert.equal(snap.size, 1);
      for (const row of snap.docs) {
        for (const key of SALARY_KEYS) assert.equal(row.data()[key], undefined, `${key} must not be on users/${row.id}`);
      }
    }
  });

  it('with MFA, Finance and Account roles can read one profile but cannot list the directory', async () => {
    for (const [uid, role] of [['fin_1', 'finance_admin'], ['fin_1', 'finance_staff'], ['acct_1', 'account_manager']]) {
      const db = ctx(uid, { role, ...MFA });
      await assertSucceeds(getDoc(doc(db, 'users/tech_1')));
      await assertFails(technicians(db));
    }
  });

  it('a technician (even with MFA) cannot read or list other users', async () => {
    const db = ctx('tech_2', { role: 'technician', ...MFA });
    await assertFails(getDoc(doc(db, 'users/tech_1')));
    await assertFails(technicians(db));
  });

  it('self reads and owner-to-own-tenant reads still pass without MFA', async () => {
    await assertSucceeds(getDoc(doc(ctx('tech_1', { role: 'technician', ...NO_MFA }), 'users/tech_1')));
    await assertSucceeds(getDoc(doc(ctx('tenant_1', { role: 'tenant', ...NO_MFA }), 'users/tenant_1')));
    const owner = ctx('owner_1', { role: 'owner', ...NO_MFA });
    await assertSucceeds(getDoc(doc(owner, 'users/owner_1')));
    await assertSucceeds(getDoc(doc(owner, 'users/tenant_1')));
    await assertSucceeds(getDocs(query(collection(owner, 'users'), where('role', '==', 'tenant'), where('ownerId', '==', 'owner_1'))));
  });
});
