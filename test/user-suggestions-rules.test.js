// Suggestion box: user_suggestions is create-only for owner/tenant/technician/broker role
// holders, bound to their own uid and role claim, server-timestamped; only MFA admins read.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
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
  // Suggestions must be written in one batch with the per-user rate-limit stamp.
  const submit = (db, uid, data) => {
    const batch = writeBatch(db);
    batch.set(doc(collection(db, 'user_suggestions')), data);
    batch.set(doc(db, `user_suggestion_limits/${uid}`), { lastAt: serverTimestamp() });
    return batch.commit();
  };

  it('lets each of the four profiles create their own suggestion', async () => {
    for (const role of ROLES) {
      const uid = `sugg_${role}`;
      await assertSucceeds(submit(roleDb(uid, role), uid, valid(uid, role)));
    }
  });

  it('rejects anonymous, role-less, staff and admin-role creators', async () => {
    await assertFails(submit(testEnv.unauthenticatedContext().firestore(), 'anon', valid('anon', 'owner')));
    await assertFails(submit(testEnv.authenticatedContext('no_role').firestore(), 'no_role', valid('no_role', 'owner')));
    await assertFails(submit(roleDb('staff_a', 'dispatcher'), 'staff_a', valid('staff_a', 'dispatcher')));
    await assertFails(submit(testEnv.authenticatedContext('sus_owner', { role: 'owner', suspended: true }).firestore(), 'sus_owner', valid('sus_owner', 'owner')));
  });

  it('rejects suggestions filed for another uid or with a forged role', async () => {
    const db = roleDb('sugg_owner', 'owner');
    await assertFails(submit(db, 'sugg_owner', valid('someone_else', 'owner')));
    await assertFails(submit(db, 'sugg_owner', valid('sugg_owner', 'tenant')));
    await assertFails(submit(db, 'sugg_owner', valid('sugg_owner', 'admin')));
  });

  it('rejects wrong status/source/category, extra or missing fields, bad sizes and client timestamps', async () => {
    const db = roleDb('sugg_tenant', 'tenant');
    const base = valid('sugg_tenant', 'tenant');
    const send = (data) => submit(db, 'sugg_tenant', data);
    await assertFails(send({ ...base, status: 'done' }));
    await assertFails(send({ ...base, source: 'admin' }));
    await assertFails(send({ ...base, category: 'payment_approval' }));
    await assertFails(send({ ...base, priority: 'urgent' }));
    await assertFails(send({ ...base, title: 'ab' }));
    await assertFails(send({ ...base, title: 'x'.repeat(121) }));
    await assertFails(send({ ...base, message: 'too short' }));
    await assertFails(send({ ...base, message: 'x'.repeat(2001) }));
    await assertFails(send({ ...base, message: 42 }));
    await assertFails(send({ ...base, createdAt: new Date('2020-01-01') }));
    const { message, ...missing } = base;
    await assertFails(send(missing));
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

  it('rate-limits each user to one suggestion every 2 minutes', async () => {
    const db = roleDb('sugg_broker', 'broker');
    // Without the rate-limit stamp in the same batch, the create is refused.
    await assertFails(addDoc(collection(db, 'user_suggestions'), valid('sugg_broker', 'broker')));
    await assertSucceeds(submit(db, 'sugg_broker', valid('sugg_broker', 'broker')));
    await assertFails(submit(db, 'sugg_broker', valid('sugg_broker', 'broker')));
    // Another user is unaffected; nobody may stamp, back-date, read or delete someone else's limit.
    await assertSucceeds(submit(roleDb('sugg_owner', 'owner'), 'sugg_owner', valid('sugg_owner', 'owner')));
    await assertFails(setDoc(doc(db, 'user_suggestion_limits/sugg_owner'), { lastAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'user_suggestion_limits/sugg_broker'), { lastAt: new Date('2020-01-01') }));
    await assertFails(getDoc(doc(db, 'user_suggestion_limits/sugg_broker')));
    await assertFails(deleteDoc(doc(db, 'user_suggestion_limits/sugg_broker')));
    // After the window passes, the user may submit again.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'user_suggestion_limits/sugg_broker'), { lastAt: new Date(Date.now() - 121000) });
    });
    await assertSucceeds(submit(db, 'sugg_broker', valid('sugg_broker', 'broker')));
  });
});
