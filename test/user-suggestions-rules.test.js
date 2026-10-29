// Suggestion box: user_suggestions is create-only for owner/tenant/technician/broker role
// holders, bound to their own uid and role claim, server-timestamped; only MFA admins read.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const ROLES = ['owner', 'tenant', 'technician', 'broker'];

const valid = (uid, role) => ({
  createdBy: uid,
  role,
  category: 'new_feature',
  title: 'Dark mode',
  message: 'Please add a dark mode to the dashboard.',
  status: 'new',
  source: 'dashboard_suggestion_box',
  createdAt: serverTimestamp(),
});

describe('user_suggestions rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => { await testEnv.clearFirestore(); });
  after(async () => testEnv.cleanup());

  const roleDb = (uid, role) => testEnv.authenticatedContext(uid, { role }).firestore();
  const adminDb = () => testEnv.authenticatedContext('sugg_admin', { role: 'admin', admin: true, ...MFA }).firestore();
  const seed = async (id, data) => testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `user_suggestions/${id}`), data);
  });

  it('lets each of the four profiles create their own suggestion', async () => {
    for (const role of ROLES) {
      const uid = `sugg_${role}`;
      await assertSucceeds(addDoc(collection(roleDb(uid, role), 'user_suggestions'), valid(uid, role)));
    }
  });

  it('rejects anonymous, role-less, staff and admin-role creators', async () => {
    await assertFails(addDoc(collection(testEnv.unauthenticatedContext().firestore(), 'user_suggestions'), valid('anon', 'owner')));
    await assertFails(addDoc(collection(testEnv.authenticatedContext('no_role').firestore(), 'user_suggestions'), valid('no_role', 'owner')));
    await assertFails(addDoc(collection(roleDb('staff_a', 'dispatcher'), 'user_suggestions'), valid('staff_a', 'dispatcher')));
    await assertFails(addDoc(collection(testEnv.authenticatedContext('sus_owner', { role: 'owner', suspended: true }).firestore(), 'user_suggestions'), valid('sus_owner', 'owner')));
  });

  it('rejects suggestions filed for another uid or with a forged role', async () => {
    const db = roleDb('sugg_owner', 'owner');
    await assertFails(addDoc(collection(db, 'user_suggestions'), valid('someone_else', 'owner')));
    await assertFails(addDoc(collection(db, 'user_suggestions'), valid('sugg_owner', 'tenant')));
    await assertFails(addDoc(collection(db, 'user_suggestions'), valid('sugg_owner', 'admin')));
  });

  it('rejects wrong status/source/category, extra or missing fields, bad sizes and client timestamps', async () => {
    const db = roleDb('sugg_tenant', 'tenant');
    const base = valid('sugg_tenant', 'tenant');
    const col = collection(db, 'user_suggestions');
    await assertFails(addDoc(col, { ...base, status: 'done' }));
    await assertFails(addDoc(col, { ...base, source: 'admin' }));
    await assertFails(addDoc(col, { ...base, category: 'payment_approval' }));
    await assertFails(addDoc(col, { ...base, priority: 'urgent' }));
    await assertFails(addDoc(col, { ...base, title: 'ab' }));
    await assertFails(addDoc(col, { ...base, title: 'x'.repeat(121) }));
    await assertFails(addDoc(col, { ...base, message: 'too short' }));
    await assertFails(addDoc(col, { ...base, message: 'x'.repeat(2001) }));
    await assertFails(addDoc(col, { ...base, message: 42 }));
    await assertFails(addDoc(col, { ...base, createdAt: new Date('2020-01-01') }));
    const { message, ...missing } = base;
    await assertFails(addDoc(col, missing));
  });

  it('lets only MFA admins read; authors and other users cannot read, edit or delete', async () => {
    await seed('s1', { ...valid('sugg_owner', 'owner'), createdAt: new Date() });
    const author = roleDb('sugg_owner', 'owner');
    await assertFails(getDoc(doc(author, 'user_suggestions/s1')));
    await assertFails(getDocs(collection(author, 'user_suggestions')));
    await assertFails(updateDoc(doc(author, 'user_suggestions/s1'), { title: 'Edited title' }));
    await assertFails(deleteDoc(doc(author, 'user_suggestions/s1')));
    await assertFails(getDoc(doc(roleDb('sugg_tenant', 'tenant'), 'user_suggestions/s1')));
    const noMfaAdmin = testEnv.authenticatedContext('admin_no_mfa', { role: 'admin', admin: true }).firestore();
    await assertFails(getDocs(collection(noMfaAdmin, 'user_suggestions')));
    await assertSucceeds(getDoc(doc(adminDb(), 'user_suggestions/s1')));
    await assertSucceeds(getDocs(collection(adminDb(), 'user_suggestions')));
  });
});
