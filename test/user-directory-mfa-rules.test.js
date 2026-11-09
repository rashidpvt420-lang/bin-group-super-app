// Nov 9 audit P1-10: the users directory (PII) needs a second-factor session for
// directory-role staff and admins, and staff may only list in bounded pages.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, where } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };

describe('users directory MFA + bounded list', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users/dir_tech'), { role: 'technician', displayName: 'Tech', phone: '+971500000000' });
    });
  });
  after(async () => testEnv.cleanup());

  it('HR staff without a second factor cannot read or list other users', async () => {
    const db = testEnv.authenticatedContext('dir_hr', { role: 'hr_admin' }).firestore();
    await assertFails(getDoc(doc(db, 'users/dir_tech')));
    await assertFails(getDocs(query(collection(db, 'users'), where('role', '==', 'technician'), limit(50))));
  });

  it('HR staff with MFA can read one user and list in bounded pages only', async () => {
    const db = testEnv.authenticatedContext('dir_hr_mfa', { role: 'hr_admin', ...MFA }).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/dir_tech')));
    await assertSucceeds(getDocs(query(collection(db, 'users'), where('role', '==', 'technician'), limit(50))));
    await assertFails(getDocs(query(collection(db, 'users'), where('role', '==', 'technician'))));
    await assertFails(getDocs(query(collection(db, 'users'), where('role', '==', 'technician'), limit(501))));
  });

  it('admins still need MFA for the directory', async () => {
    const noMfa = testEnv.authenticatedContext('dir_admin', { role: 'admin', admin: true }).firestore();
    await assertFails(getDoc(doc(noMfa, 'users/dir_tech')));
    const mfa = testEnv.authenticatedContext('dir_admin_mfa', { role: 'admin', admin: true, ...MFA }).firestore();
    await assertSucceeds(getDocs(query(collection(mfa, 'users'), where('role', '==', 'technician'))));
  });

  it('users can still read their own profile without MFA', async () => {
    const db = testEnv.authenticatedContext('dir_tech', { role: 'technician' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'users/dir_tech')));
  });
});
